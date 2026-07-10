// Cloud data layer: Cognito auth + DynamoDB (via AppSync) + S3 invoice photos.
// The app keeps a synchronous in-memory `state`; these functions load it and
// push mutations up. All saves are fire-and-forget with a sync indicator.
import {
  signIn, confirmSignIn, signOut, fetchAuthSession, getCurrentUser,
} from "aws-amplify/auth";
import { uploadData, getUrl } from "aws-amplify/storage";
import { generateClient } from "aws-amplify/data";
import outputs from "../amplify_outputs.json";

const INVOICE_BUCKET = outputs.storage.bucket_name;

// lazy so generateClient runs after Amplify.configure()
let _client = null;
const client = new Proxy({}, {
  get(_, prop) {
    if (!_client) _client = generateClient();
    return _client[prop];
  },
});

// AppSync resolves with {errors} instead of throwing — surface those as failures
function assertOk(res) {
  if (res?.errors?.length) throw new Error(res.errors.map((e) => e.message).join("; "));
  return res;
}

// ---- auth ----
export async function currentSession() {
  try {
    await getCurrentUser();
    const session = await fetchAuthSession();
    const groups = session.tokens?.accessToken?.payload["cognito:groups"] || [];
    return { role: groups.includes("admin") ? "admin" : "manager" };
  } catch {
    return null;
  }
}

export async function login(email, password, newPassword) {
  let out;
  try {
    out = await signIn({ username: email, password });
  } catch (e) {
    // already signed in (e.g. retrying after a failed boot) — reuse the session
    if (e.name === "UserAlreadyAuthenticatedException") return currentSession();
    throw e;
  }
  if (out.nextStep?.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
    if (!newPassword) return { needNewPassword: true };
    out = await confirmSignIn({ challengeResponse: newPassword });
  }
  if (!out.isSignedIn) throw new Error("Sign-in incomplete: " + out.nextStep?.signInStep);
  return currentSession();
}

export const logout = () => signOut();

// ---- sync indicator ----
let pending = 0;
let onSync = () => {};
export function setSyncListener(fn) { onSync = fn; }
function track(promise) {
  pending++; onSync(pending);
  return promise.then(
    (v) => { pending--; onSync(pending); return v; },
    (e) => { pending--; console.error("sync failed", e); onSync(-1); throw e; }
  );
}

// ---- config (staff & categories; admin-writable) ----
export async function loadConfig() {
  const { data } = await client.models.AppConfig.get({ id: "config" });
  return data ? JSON.parse(data.payload) : null;
}
export async function createConfig(payload) {
  assertOk(await client.models.AppConfig.create({ id: "config", payload: JSON.stringify(payload) }));
}
export function saveConfig(payload) {
  return track(
    client.models.AppConfig.update({ id: "config", payload: JSON.stringify(payload) }).then(assertOk)
  );
}

// ---- month data ----
const knownDayIds = new Set();
const knownAdjIds = new Set();

export async function loadMonth(month) {
  const [days, adj] = await Promise.all([
    client.models.DayRecord.listDayRecordByMonth({ month }, { limit: 62 }),
    client.models.MonthAdjustments.get({ id: month }),
  ]);
  const md = { hours: {}, expenses: {}, sales: {}, details: {}, invoices: {}, adjustments: {} };
  for (const rec of days.data) {
    const p = JSON.parse(rec.payload);
    knownDayIds.add(rec.id);
    if (p.hours) md.hours[rec.day] = p.hours;
    if (p.expenses) md.expenses[rec.day] = p.expenses;
    if (p.sales) md.sales[rec.day] = p.sales;
    if (p.details) md.details[rec.day] = p.details;
    if (p.invoices) md.invoices[rec.day] = p.invoices;
  }
  if (adj.data) {
    knownAdjIds.add(month);
    md.adjustments = JSON.parse(adj.data.payload);
  }
  return md;
}

export function saveDay(month, day, md) {
  const id = `${month}#${day}`;
  const payload = JSON.stringify({
    hours: md.hours[day] ?? null,
    expenses: md.expenses[day] ?? null,
    sales: md.sales[day] ?? null,
    details: md.details[day] ?? null,
    invoices: md.invoices[day] ?? null,
  });
  const body = { id, month, day, payload };
  return track((async () => {
    if (knownDayIds.has(id)) { assertOk(await client.models.DayRecord.update(body)); return; }
    const res = await client.models.DayRecord.create(body);
    if (res.errors?.length) assertOk(await client.models.DayRecord.update(body)); // lost create race
    knownDayIds.add(id);
  })());
}

export function saveAdjustments(month, adjustments) {
  const body = { id: month, payload: JSON.stringify(adjustments) };
  return track((async () => {
    if (knownAdjIds.has(month)) { assertOk(await client.models.MonthAdjustments.update(body)); return; }
    const res = await client.models.MonthAdjustments.create(body);
    if (res.errors?.length) assertOk(await client.models.MonthAdjustments.update(body));
    knownAdjIds.add(month);
  })());
}

// ---- invoice photos (S3) ----
const urlCache = new Map(); // s3 key -> displayable URL

export async function uploadInvoiceBlob(month, day, blob) {
  const key = `invoices/${month}/${day}/${crypto.randomUUID()}.jpg`;
  await track(uploadData({ path: key, data: blob, options: { contentType: "image/jpeg" } }).result);
  urlCache.set(key, URL.createObjectURL(blob));
  return key;
}

export function invoiceUrl(key) {
  return urlCache.get(key) || null;
}

export async function resolveInvoiceUrls(md) {
  const keys = new Set();
  const collect = (v) => {
    if (typeof v === "string" && v.startsWith("invoices/")) keys.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  collect(md.details); collect(md.invoices); collect(md.expenses);
  await Promise.all([...keys].filter((k) => !urlCache.has(k)).map(async (k) => {
    try {
      const { url } = await getUrl({ path: k, options: { expiresIn: 3600 * 8 } });
      urlCache.set(k, url.toString());
    } catch (e) { console.error("invoice url failed", k, e); }
  }));
}

// ---- AI OCR (Bedrock via Lambda) ----
function parseOcr(res) {
  // AppSync may deliver the Lambda's JSON string singly- or doubly-encoded
  let parsed = res.data;
  for (let i = 0; typeof parsed === "string" && i < 2; i++) parsed = JSON.parse(parsed);
  return parsed;
}
export async function ocrExtractInvoice(keys, section) {
  const res = assertOk(await client.mutations.ocrExtractInvoice({ bucket: INVOICE_BUCKET, keys, section }));
  return parseOcr(res)?.items || [];
}
// stock mode: returns { vendor, date, lines: [{item, qty, unit, rate, amount}] }
export async function ocrExtractBill(keys) {
  const res = assertOk(await client.mutations.ocrExtractInvoice({ bucket: INVOICE_BUCKET, keys, section: "stock" }));
  const parsed = parseOcr(res);
  return { vendor: parsed?.vendor || null, date: parsed?.date || null, lines: parsed?.lines || [] };
}

// ---- stock bills (goods received) ----
export async function loadStockMonth(month) {
  const res = assertOk(await client.models.StockBill.listStockBillByMonth({ month }, { limit: 500 }));
  return res.data
    .map((rec) => {
      // drop any _isNew that older versions wrongly persisted into the payload,
      // so editing an existing bill can't be mistaken for a create
      const { _isNew, ...payload } = JSON.parse(rec.payload);
      return {
        id: rec.id, month: rec.month, date: rec.date, vendor: rec.vendor, status: rec.status,
        ...payload,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function saveStockBill(bill) {
  // _isNew is a client-only flag (create vs update); it must never land in the stored payload,
  // or a later edit reloads it as true and re-issues create() against an existing id.
  const { id, month, date, vendor, status, _isNew, ...payload } = bill;
  const body = { id, month, date, vendor, status, payload: JSON.stringify(payload) };
  return track(
    (_isNew
      ? client.models.StockBill.create(body)
      : client.models.StockBill.update(body)
    ).then(assertOk)
  );
}

export function deleteStockBill(id) {
  return track(client.models.StockBill.delete({ id }).then(assertOk));
}

// Upload a bill attachment. Images are resized client-side; PDFs upload as-is.
export async function uploadStockFile(month, file) {
  const isPdf = file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf");
  const ext = isPdf ? "pdf" : "jpg";
  const key = `stock/${month}/${crypto.randomUUID()}.${ext}`;
  const contentType = isPdf ? "application/pdf" : "image/jpeg";
  await track(uploadData({ path: key, data: file, options: { contentType } }).result);
  if (!isPdf) urlCache.set(key, URL.createObjectURL(file));
  return key;
}

export async function resolveStockUrls(bills) {
  const keys = bills.flatMap((b) => b.files || []).filter((k) => !urlCache.has(k));
  await Promise.all(keys.map(async (k) => {
    try {
      const { url } = await getUrl({ path: k, options: { expiresIn: 3600 * 8 } });
      urlCache.set(k, url.toString());
    } catch (e) { console.error("stock url failed", k, e); }
  }));
}
