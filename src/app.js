// Skypark ops — UI layer. In-memory state loaded from / persisted to the cloud store.
import { SEED, SEED_MONTH } from "./seed.js";
import * as store from "./store.js";

const DOW = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

let state = { config: null, months: {} };
let role = "manager";
let currentMonth = new Date().toISOString().slice(0, 7);
let currentDay = 1;

const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("en-IN");
const EMPS = () => state.config.employees;
const CATS = () => state.config.categories;

function emptyMonth() {
  return { hours: {}, expenses: {}, sales: {}, adjustments: {}, details: {}, invoices: {} };
}

// ---- month helpers ----
function monthData() {
  if (!state.months[currentMonth]) state.months[currentMonth] = emptyMonth();
  return state.months[currentMonth];
}
function monthParts(key) { const [y, m] = key.split("-").map(Number); return { y, m }; }
function daysInMonth(key) { const { y, m } = monthParts(key); return new Date(y, m, 0).getDate(); }
function firstDow(key) { const { y, m } = monthParts(key); return new Date(y, m - 1, 1).getDay(); }
function monthLabel(key) { const { y, m } = monthParts(key); return `${MONTH_NAMES[m - 1]} ${y}`; }
function dayName(d) { return DOW[(firstDow(currentMonth) + d - 1) % 7]; }
function shiftMonth(key, delta) {
  const { y, m } = monthParts(key);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---- persistence hooks ----
const persistDay = () => store.saveDay(currentMonth, currentDay, monthData());
const persistAdjustments = () => store.saveAdjustments(currentMonth, monthData().adjustments);
const persistConfig = () => store.saveConfig(state.config);

async function ensureMonthLoaded(month) {
  if (state.months[month]) return;
  const md = await store.loadMonth(month);
  await store.resolveInvoiceUrls(md);
  state.months[month] = md;
}

function renderMonthLabel() {
  document.getElementById("month-label").textContent = monthLabel(currentMonth);
}
async function gotoMonth(delta) {
  currentMonth = shiftMonth(currentMonth, delta);
  currentDay = 1;
  renderMonthLabel();
  await ensureMonthLoaded(currentMonth);
  renderAll();
}

// ---- tabs ----
const TABS = ["dc", "att", "admin"];
function switchTab(t) {
  for (const id of TABS) {
    document.getElementById("tab-" + id).classList.toggle("active", t === id);
    document.getElementById("view-" + id).hidden = t !== id;
  }
  if (t === "att") renderAttendance();
  if (t === "admin") renderAdmin();
}

// ---- day strip ----
function renderDayStrip() {
  const strip = document.getElementById("day-strip");
  const md = monthData();
  strip.innerHTML = "";
  for (let d = 1; d <= daysInMonth(currentMonth); d++) {
    const b = document.createElement("button");
    b.className = "day-btn" + (d === currentDay ? " active" : "") +
      (md.hours[d] || md.expenses[d] || md.sales[d] ? " has-data" : "");
    b.innerHTML = `${d}<small>${dayName(d)}</small>`;
    b.onclick = () => { currentDay = d; renderDC(); };
    strip.appendChild(b);
  }
}

// ---- daily closing: staff hours ----
function setHours(empId, hrs) {
  const md = monthData();
  if (!md.hours[currentDay]) md.hours[currentDay] = {};
  md.hours[currentDay][empId] = hrs;
  persistDay(); renderDC();
}

function renderStaff() {
  const t = document.getElementById("dc-staff");
  const dayHours = monthData().hours[currentDay] || {};
  let wageTotal = 0;
  let html = "<tr><th>Name</th><th class='num'>Rate/hr</th><th>Hours</th><th class='num'>Amount</th></tr>";
  const visible = EMPS().filter((e) => e.active || dayHours[e.id] != null);
  for (const e of visible) {
    const h = dayHours[e.id] ?? null;
    const amt = (h || 0) * e.rate;
    wageTotal += amt;
    const isPreset = h === 0 || h === 9 || h === 18;
    const btn = (v, label) =>
      `<button class="${h === v ? "sel" : ""}" onclick="setHours(${e.id},${v})">${label}</button>`;
    const customVal = h !== null && !isPreset ? h : "";
    html += `<tr><td>${e.name}</td><td class="num">${e.rate}</td>
      <td><span class="hrs-toggle">${btn(0, "Off")}${btn(9, "9")}${btn(18, "18")}<input
        class="hrs-custom ${h !== null && !isPreset ? "sel" : ""}" type="number" min="0" step="0.5"
        placeholder="custom" value="${customVal}"
        onchange="setHours(${e.id}, this.value === '' ? null : parseFloat(this.value))"></span></td>
      <td class="num">${h ? fmt(amt) : "–"}</td></tr>`;
  }
  html += `<tr class="total"><td colspan="3">Total daily wages</td><td class="num">₹${fmt(wageTotal)}</td></tr>`;
  t.innerHTML = html;
  document.getElementById("dc-wage-total").textContent = "₹" + fmt(wageTotal);
  return wageTotal;
}

// ---- daily closing: expenses ----
function delExpense(i) {
  monthData().expenses[currentDay].splice(i, 1);
  persistDay(); renderDC();
}
function imgCell(kind, row, i) {
  const url = row.img ? store.invoiceUrl(row.img) : null;
  return url
    ? `<img class="thumb" src="${url}" onclick="showImg('${kind}',${i})" title="View invoice">`
    : row.img
      ? `<span title="Photo syncing…">⏳</span>`
      : `<button class="clip-btn" title="Attach invoice photo" onclick="attachRowImg('${kind}',${i})">📎</button>`;
}
function renderExpenses() {
  const t = document.getElementById("dc-expenses");
  const rows = monthData().expenses[currentDay] || [];
  let total = 0;
  let html = "<tr><th>Item</th><th class='num'>Amount</th><th></th><th></th></tr>";
  rows.forEach((r, i) => {
    total += r.amount;
    html += `<tr><td>${r.item}</td><td class="num">${fmt(r.amount)}</td>
      <td>${imgCell("exp", r, i)}</td>
      <td><button class="del-btn" title="Remove" onclick="delExpense(${i})">×</button></td></tr>`;
  });
  html += `<tr class="total"><td>Total expenses</td><td class="num">₹${fmt(total)}</td><td></td><td></td></tr>`;
  t.innerHTML = html;
  document.getElementById("dc-exp-total").textContent = "₹" + fmt(total);
  document.getElementById("exp-cat-list").innerHTML =
    CATS().map((c) => `<option value="${c}">`).join("");
  return total;
}

// ---- detail sections (Blinkit / Instamart purchases, Due, Discounts) ----
const DETAIL_SECTIONS = ["blinkit", "instamart", "due", "discounts"];

function detailRows(section) {
  const d = monthData().details[currentDay];
  return (d && d[section]) || [];
}

function addDetail(section) {
  const item = document.getElementById(section + "-item").value.trim();
  const amt = parseFloat(document.getElementById(section + "-amt").value);
  if (!item || !amt) return;
  const md = monthData();
  if (!md.details[currentDay]) md.details[currentDay] = {};
  if (!md.details[currentDay][section]) md.details[currentDay][section] = [];
  md.details[currentDay][section].push({ item, amount: amt });
  document.getElementById(section + "-item").value = "";
  document.getElementById(section + "-amt").value = "";
  persistDay(); renderDC();
}

function delDetail(section, i) {
  monthData().details[currentDay][section].splice(i, 1);
  persistDay(); renderDC();
}

function renderDetails() {
  for (const sec of DETAIL_SECTIONS) {
    const rows = detailRows(sec);
    let total = 0;
    let html = "<tr><th>S.no</th><th>Item</th><th class='num'>Amount</th><th></th><th></th></tr>";
    rows.forEach((r, i) => {
      total += r.amount;
      html += `<tr><td>${i + 1}</td><td>${r.item}</td><td class="num">${fmt(r.amount)}</td>
        <td>${imgCell(sec, r, i)}</td>
        <td><button class="del-btn" title="Remove" onclick="delDetail('${sec}',${i})">×</button></td></tr>`;
    });
    if (!rows.length) html += `<tr><td colspan="5" class="empty">No items yet — ${
      sec === "due" || sec === "discounts" ? "add an entry below." : "add manually or upload an invoice."}</td></tr>`;
    html += `<tr class="total"><td colspan="2">Total</td><td class="num">₹${fmt(total)}</td><td></td><td></td></tr>`;
    document.getElementById("dc-" + sec).innerHTML = html;
    document.getElementById(sec + "-total").textContent = "₹" + fmt(total);

    const gallery = document.getElementById("inv-" + sec);
    if (gallery) {
      const invs = (monthData().invoices[currentDay] || {})[sec] || [];
      gallery.innerHTML = invs.map((key, i) => {
        const url = store.invoiceUrl(key);
        return `<span class="inv-wrap">${url
          ? `<img class="thumb lg" src="${url}" onclick="showImgSrc('${sec}',${i})">`
          : `<span title="Photo syncing…">⏳</span>`}
         <button class="del-btn" title="Remove invoice" onclick="delInvoice('${sec}',${i})">×</button></span>`;
      }).join("");
    }
  }
}

// ---- invoice image handling ----
const fileInput = document.getElementById("file-input");
let pendingTarget = null; // {type:'row'|'section', kind, idx?}

function pickImage(target) { pendingTarget = target; fileInput.value = ""; fileInput.click(); }
function attachRowImg(kind, idx) { pickImage({ type: "row", kind, idx }); }
function uploadInvoice(section) { pickImage({ type: "section", kind: section }); }

fileInput.onchange = () => {
  const f = fileInput.files[0];
  if (!f || !pendingTarget) return;
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = img.width * scale; c.height = img.height * scale;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(async (blob) => {
      const t = pendingTarget;
      const md = monthData();
      try {
        const key = await store.uploadInvoiceBlob(currentMonth, currentDay, blob);
        if (t.type === "row") {
          const rows = t.kind === "exp" ? md.expenses[currentDay] : md.details[currentDay][t.kind];
          rows[t.idx].img = key;
        } else {
          if (!md.invoices[currentDay]) md.invoices[currentDay] = {};
          if (!md.invoices[currentDay][t.kind]) md.invoices[currentDay][t.kind] = [];
          md.invoices[currentDay][t.kind].push(key);
        }
        persistDay();
      } catch (e) {
        alert("Photo upload failed — check your connection and try again.");
      }
      renderDC();
    }, "image/jpeg", 0.8);
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
};

function delInvoice(section, i) {
  monthData().invoices[currentDay][section].splice(i, 1);
  persistDay(); renderDC();
}

const modal = document.getElementById("img-modal");
modal.onclick = () => { modal.hidden = true; };
function openModal(src) { document.getElementById("img-modal-img").src = src; modal.hidden = false; }
function showImg(kind, idx) {
  const md = monthData();
  const rows = kind === "exp" ? md.expenses[currentDay] : md.details[currentDay][kind];
  openModal(store.invoiceUrl(rows[idx].img));
}
function showImgSrc(section, i) {
  openModal(store.invoiceUrl(monthData().invoices[currentDay][section][i]));
}

// ---- AI OCR autofill (stub — integration point) ----
function ocrAutofill(section) {
  const invs = (monthData().invoices[currentDay] || {})[section] || [];
  if (!invs.length) { alert("Upload an invoice photo first, then run AI OCR autofill."); return; }
  // Integration point: a Lambda can fetch these S3 keys, call a vision model,
  // and return {item, amount} rows to push into details[currentDay][section].
  alert("AI OCR coming soon: the uploaded invoice will be read automatically and line items filled into this table.");
}

// ---- sales & reconciliation ----
const SALES_FIELDS = [
  ["totalSale", "Total Sale"], ["card", "Card"], ["upi", "UPI"], ["due", "Due"],
  ["swiggy", "Swiggy"], ["zomato", "Zomato"], ["cashInHand", "Cash in hand"],
];
function setSales(field, val) {
  const md = monthData();
  if (!md.sales[currentDay]) md.sales[currentDay] = {};
  md.sales[currentDay][field] = parseFloat(val) || 0;
  persistDay(); renderDC();
}
function renderSales(wageTotal, expTotal) {
  const s = monthData().sales[currentDay] || {};
  document.getElementById("dc-sales").innerHTML = SALES_FIELDS.map(
    ([k, label]) => `<tr><td>${label}</td><td class="num">
      <input type="number" value="${s[k] ?? ""}" onchange="setSales('${k}', this.value)"></td></tr>`
  ).join("");

  const nonCash = (s.card||0) + (s.upi||0) + (s.due||0) + (s.swiggy||0) + (s.zomato||0);
  const expectedCash = (s.totalSale||0) - nonCash;
  const diff = (s.cashInHand||0) - expectedCash;
  const cashAfterExp = (s.cashInHand||0) - expTotal - wageTotal;
  const line = (label, val, cls="") =>
    `<div class="recon-line ${cls}"><span>${label}</span><b>₹${fmt(val)}</b></div>`;
  document.getElementById("dc-recon").innerHTML =
    line("Non-cash channels (card+UPI+due+Swiggy+Zomato)", nonCash) +
    line("Expected cash (total sale − non-cash)", expectedCash) +
    line("Cash in hand vs expected", diff, Math.abs(diff) < 1 ? "good" : "bad") +
    line("Cash after expenses & wages", cashAfterExp, cashAfterExp >= 0 ? "good" : "bad");
}

function renderDC() {
  renderDayStrip();
  const wages = renderStaff();
  const exp = renderExpenses();
  renderSales(wages, exp);
  renderDetails();
}

// ---- attendance & payroll ----
function setAdj(empId, field, val) {
  const md = monthData();
  if (!md.adjustments[empId]) md.adjustments[empId] = { loanTaken:0, loanDeducted:0, penalties:0, incentives:0 };
  md.adjustments[empId][field] = parseFloat(val) || 0;
  persistAdjustments(); renderAttendance();
}

function renderAttendance() {
  const md = monthData();
  const nDays = daysInMonth(currentMonth);
  const hasHours = (e) => Object.values(md.hours).some((day) => day[e.id] != null);
  const roster = EMPS().filter((e) => e.active || hasHours(e));
  const grid = document.getElementById("att-grid");
  let html = "<tr><th class='name'>Name</th>";
  for (let d = 1; d <= nDays; d++) html += `<th>${d}<br><small>${dayName(d)}</small></th>`;
  html += "<th class='num'>Hrs</th></tr>";
  for (const e of roster) {
    let tot = 0;
    html += `<tr><td class="name">${e.name}</td>`;
    for (let d = 1; d <= nDays; d++) {
      const h = md.hours[d]?.[e.id];
      tot += h || 0;
      html += h ? `<td class="${h === 18 ? "h18" : ""}">${h}</td>` : `<td class="off">·</td>`;
    }
    html += `<td class="num"><b>${tot}</b></td></tr>`;
  }
  grid.innerHTML = html;

  const p = document.getElementById("payroll");
  let phtml = `<tr><th>Name</th><th class='num'>Rate/hr</th><th class='num'>Total Hrs</th>
    <th class='num'>Total Amount</th><th class='num'>Loan Taken</th><th class='num'>Loan Deducted</th>
    <th class='num'>Loan Balance</th><th class='num'>Penalties</th><th class='num'>Incentives</th>
    <th class='num'>Monthly Payout</th></tr>`;
  let gAmt = 0, gPay = 0;
  for (const e of roster) {
    let hrs = 0;
    for (let d = 1; d <= nDays; d++) hrs += md.hours[d]?.[e.id] || 0;
    const a = md.adjustments[e.id] || { loanTaken:0, loanDeducted:0, penalties:0, incentives:0 };
    const amt = hrs * e.rate;
    const payout = amt - a.loanDeducted - a.penalties + a.incentives;
    gAmt += amt; gPay += payout;
    const inp = (f) => `<td class="num"><input type="number" value="${a[f] || ""}"
      onchange="setAdj(${e.id},'${f}',this.value)"></td>`;
    phtml += `<tr><td>${e.name}</td><td class="num">${e.rate}</td><td class="num">${hrs}</td>
      <td class="num">${fmt(amt)}</td>${inp("loanTaken")}${inp("loanDeducted")}
      <td class="num">${fmt(a.loanTaken - a.loanDeducted)}</td>${inp("penalties")}${inp("incentives")}
      <td class="num"><b>₹${fmt(payout)}</b></td></tr>`;
  }
  phtml += `<tr class="total"><td colspan="3">Totals</td><td class="num">₹${fmt(gAmt)}</td>
    <td colspan="5"></td><td class="num">₹${fmt(gPay)}</td></tr>`;
  p.innerHTML = phtml;
}

// ---- admin: staff & categories ----
function setRate(empId, val) {
  const rate = parseFloat(val);
  if (!(rate >= 0)) { renderAdmin(); return; }
  EMPS().find((e) => e.id === empId).rate = rate;
  persistConfig(); renderAdmin();
}
function toggleActive(empId) {
  const e = EMPS().find((e) => e.id === empId);
  e.active = !e.active;
  persistConfig(); renderAdmin();
}
// true only if we can prove (from months loaded into memory) the employee never
// clocked hours — cross-month history may exist in months not yet fetched, so
// this is a conservative "safe to hard-delete" check, not an exhaustive one
function hasAnyRecordedHours(empId) {
  return Object.values(state.months).some((md) =>
    Object.values(md.hours).some((day) => day[empId] != null));
}
function removeEmployee(empId) {
  const e = EMPS().find((e) => e.id === empId);
  if (hasAnyRecordedHours(empId)) {
    alert(`${e.name} has recorded hours on file — archive instead of removing, so payroll history stays intact.`);
    return;
  }
  if (!confirm(`Remove ${e.name} entirely? This can't be undone.`)) return;
  state.config.employees = EMPS().filter((x) => x.id !== empId);
  persistConfig(); renderAdmin();
}
function addEmployee() {
  const name = document.getElementById("new-emp-name").value.trim();
  const rate = parseFloat(document.getElementById("new-emp-rate").value);
  if (!name || !(rate >= 0)) return;
  if (EMPS().some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    alert(`"${name}" already exists.`); return;
  }
  const id = Math.max(0, ...EMPS().map((e) => e.id)) + 1;
  EMPS().push({ id, name, rate, active: true });
  document.getElementById("new-emp-name").value = "";
  document.getElementById("new-emp-rate").value = "";
  persistConfig(); renderAdmin();
}
function addCategory() {
  const c = document.getElementById("new-cat").value.trim();
  if (!c) return;
  if (CATS().some((x) => x.toLowerCase() === c.toLowerCase())) {
    alert(`"${c}" already exists.`); return;
  }
  CATS().push(c);
  document.getElementById("new-cat").value = "";
  persistConfig(); renderAdmin();
}
function delCategory(i) {
  CATS().splice(i, 1);
  persistConfig(); renderAdmin();
}

function renderAdmin() {
  const md = monthData();
  const monthHours = (id) =>
    Object.values(md.hours).reduce((t, day) => t + (day[id] || 0), 0);
  let html = `<tr><th>Name</th><th class='num'>Rate/hr</th><th class='num'>Hrs (${monthLabel(currentMonth)})</th><th>Status</th><th></th></tr>`;
  for (const e of EMPS()) {
    const removable = !hasAnyRecordedHours(e.id);
    html += `<tr class="${e.active ? "" : "inactive"}"><td>${e.name}</td>
      <td class="num"><input type="number" min="0" step="0.01" value="${e.rate}"
        onchange="setRate(${e.id}, this.value)"></td>
      <td class="num">${monthHours(e.id) || "–"}</td>
      <td><button class="ghost sm ${e.active ? "" : "off"}" onclick="toggleActive(${e.id})"
        title="${e.active ? "Archive: hide from day entry, keep payroll history" : "Restore to active staff"}">
        ${e.active ? "Active" : "Archived"}</button></td>
      <td>${removable
        ? `<button class="del-btn" title="Remove entirely (no recorded hours yet)" onclick="removeEmployee(${e.id})">×</button>`
        : ""}</td></tr>`;
  }
  document.getElementById("admin-staff").innerHTML = html;
  document.getElementById("admin-staff-count").textContent =
    EMPS().filter((e) => e.active).length + " active";

  document.getElementById("admin-cats").innerHTML = CATS().map((c, i) =>
    `<span class="chip">${c}<button class="del-btn" title="Remove" onclick="delCategory(${i})">×</button></span>`
  ).join("");
  document.getElementById("admin-cat-count").textContent = CATS().length + " categories";
}

function renderAll() { renderDC(); renderAttendance(); if (role === "admin") renderAdmin(); }

// ---- first-run seeding (admin only): push config + July data to the cloud ----
async function seedIfEmpty() {
  if (!state.config) {
    if (role !== "admin") throw new Error("App not initialised yet — ask an admin to sign in once first.");
    state.config = {
      employees: SEED.employees.map((e) => ({ ...e, active: true })),
      categories: [...SEED.expenseCategories],
    };
    await store.createConfig(state.config);
  }
  if (role !== "admin") return;
  const seedMd = await store.loadMonth(SEED_MONTH);
  const isEmpty = !Object.keys(seedMd.hours).length && !Object.keys(seedMd.expenses).length;
  if (!isEmpty) { state.months[SEED_MONTH] = seedMd; return; }
  const s = SEED.months[SEED_MONTH];
  const md = { ...emptyMonth(), ...JSON.parse(JSON.stringify(s)) };
  state.months[SEED_MONTH] = md;
  const days = new Set([
    ...Object.keys(md.hours), ...Object.keys(md.expenses),
    ...Object.keys(md.sales), ...Object.keys(md.details),
  ]);
  for (const d of days) await store.saveDay(SEED_MONTH, Number(d), md);
  await store.saveAdjustments(SEED_MONTH, md.adjustments);
  console.log(`seeded ${days.size} days into ${SEED_MONTH}`);
}

// ---- boot ----
export async function startApp(session) {
  role = session.role;

  // expose handlers used by generated row HTML
  Object.assign(window, {
    setHours, delExpense, addDetail, delDetail, attachRowImg, uploadInvoice,
    ocrAutofill, showImg, showImgSrc, delInvoice, setSales, setAdj,
    setRate, toggleActive, removeEmployee, delCategory,
  });

  // static buttons
  document.getElementById("month-prev").onclick = () => gotoMonth(-1);
  document.getElementById("month-next").onclick = () => gotoMonth(1);
  for (const id of TABS) document.getElementById("tab-" + id).onclick = () => switchTab(id);
  document.getElementById("exp-add").onclick = () => {
    const item = document.getElementById("exp-cat").value.trim();
    const amt = parseFloat(document.getElementById("exp-amt").value);
    if (!item || !amt) return;
    const md = monthData();
    if (!md.expenses[currentDay]) md.expenses[currentDay] = [];
    md.expenses[currentDay].push({ item, amount: amt });
    document.getElementById("exp-cat").value = "";
    document.getElementById("exp-amt").value = "";
    persistDay(); renderDC();
  };
  document.querySelectorAll("[data-add-detail]").forEach((b) => b.onclick = () => addDetail(b.dataset.addDetail));
  document.querySelectorAll("[data-upload-invoice]").forEach((b) => b.onclick = () => uploadInvoice(b.dataset.uploadInvoice));
  document.querySelectorAll("[data-ocr]").forEach((b) => b.onclick = () => ocrAutofill(b.dataset.ocr));
  document.getElementById("add-emp-btn").onclick = addEmployee;
  document.getElementById("add-cat-btn").onclick = addCategory;
  document.getElementById("signout-btn").onclick = async () => { await store.logout(); location.reload(); };

  // managers don't see the admin tab
  if (role !== "admin") document.getElementById("tab-admin").style.display = "none";

  // sync indicator
  const sync = document.getElementById("sync-status");
  store.setSyncListener((n) => {
    if (n === -1) { sync.textContent = "⚠ sync error"; sync.className = "sync-err"; return; }
    sync.textContent = n > 0 ? "Saving…" : "Saved ✓";
    sync.className = n > 0 ? "sync-busy" : "sync-ok";
  });

  state.config = await store.loadConfig();
  await seedIfEmpty();
  await ensureMonthLoaded(currentMonth);
  renderMonthLabel();
  renderAll();
}
