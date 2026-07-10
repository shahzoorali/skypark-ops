// Skypark ops — UI layer. In-memory state loaded from / persisted to the cloud store.
import { SEED, SEED_MONTH } from "./seed.js";
import * as store from "./store.js";

const DOW = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const GROUPS = ["Conti-chefs", "Chinese Chefs", "Helpers", "Housekeeping", "Service"];
const UNASSIGNED = "Unassigned";
const DEFAULT_VENDORS = [
  "KGN Fresh", "Hyperpure", "New Arife", "Madina Chicken Centre", "Beef Shop",
  "ID Fresh", "6th Baker", "Ratnadeep", "Cool Drinks", "Ice", "Machi House",
];

let state = { config: null, months: {}, stock: {} };
let role = "manager";
let currentMonth = new Date().toISOString().slice(0, 7);
let currentDay = 1;

const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("en-IN");
const todayISO = () => new Date().toISOString().slice(0, 10);
// user-entered text (names, items, categories — and OCR output read from photos)
// is interpolated into innerHTML everywhere; escape it at every render site
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EMPS = () => state.config.employees;
const CATS = () => state.config.categories;
const VENDORS = () => state.config.vendors;

// backfills fields onto config loaded from before newer features existed;
// employee array position doubles as the manual sort order (no separate index field)
function normalizeConfig() {
  let changed = false;
  for (const e of EMPS()) {
    if (e.group === undefined) { e.group = null; changed = true; }
    if (e.hireDate === undefined) { e.hireDate = null; changed = true; }
    if (e.fireDate === undefined) { e.fireDate = null; changed = true; }
  }
  if (!Array.isArray(state.config.vendors)) {
    state.config.vendors = [...DEFAULT_VENDORS];
    changed = true;
  }
  return changed;
}
// day is within [hireDate, fireDate] when those are set; open-ended otherwise
function isWithinEmployment(e, month, day) {
  const dateStr = `${month}-${String(day).padStart(2, "0")}`;
  if (e.hireDate && dateStr < e.hireDate) return false;
  if (e.fireDate && dateStr > e.fireDate) return false;
  return true;
}
// group employees (in GROUPS order, Unassigned last) preserving relative array order within each group
function groupEmployees(list) {
  const byGroup = new Map();
  for (const g of [...GROUPS, UNASSIGNED]) byGroup.set(g, []);
  for (const e of list) {
    const g = byGroup.has(e.group) ? e.group : UNASSIGNED; // unknown group values fall back safely
    byGroup.get(g).push(e);
  }
  return [...byGroup.entries()].filter(([, members]) => members.length);
}

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
  editingBill = null; // a bill editor from another month would save into the wrong list
  renderMonthLabel();
  await ensureMonthLoaded(currentMonth);
  renderAll();
  if (!document.getElementById("view-stock").hidden) {
    renderStock();
    ensureStockLoaded(currentMonth).then(renderStock).catch((e) => console.error("stock load failed", e));
  }
}

// ---- tabs ----
const TABS = ["dc", "att", "stock", "admin"];
function switchTab(t) {
  for (const id of TABS) {
    document.getElementById("tab-" + id).classList.toggle("active", t === id);
    document.getElementById("view-" + id).hidden = t !== id;
  }
  if (t === "dc") renderDC();
  if (t === "att") renderAttendance();
  if (t === "admin") renderAdmin();
  if (t === "stock") {
    renderStock(); // shows "Loading…" until the month's bills arrive
    ensureStockLoaded(currentMonth).then(renderStock).catch((e) => console.error("stock load failed", e));
  }
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
  // show a row if they're actively employed on this day (blank entry allowed), or
  // if a value (including OFF/0) was already recorded — so fired staff's history stays visible
  const visible = EMPS().filter((e) =>
    dayHours[e.id] != null || (e.active && isWithinEmployment(e, currentMonth, currentDay)));
  for (const [group, members] of groupEmployees(visible)) {
    html += `<tr class="group-row"><td colspan="4">${group}</td></tr>`;
    for (const e of members) {
      const h = dayHours[e.id] ?? null;
      const amt = (h || 0) * e.rate;
      wageTotal += amt;
      const isPreset = h === 0 || h === 9 || h === 18;
      const btn = (v, label) =>
        `<button class="${h === v ? "sel" : ""}" onclick="setHours(${e.id},${v})">${label}</button>`;
      const customVal = h !== null && !isPreset ? h : "";
      html += `<tr><td>${esc(e.name)}</td><td class="num">${e.rate}</td>
        <td><span class="hrs-toggle">${btn(0, "Off")}${btn(9, "9")}${btn(18, "18")}<input
          class="hrs-custom ${h !== null && !isPreset ? "sel" : ""}" type="number" min="0" step="0.5"
          placeholder="custom" value="${customVal}"
          onchange="setHours(${e.id}, this.value === '' ? null : parseFloat(this.value))"></span></td>
        <td class="num">${h ? fmt(amt) : "–"}</td></tr>`;
    }
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
function renderExpenses(wageTotal) {
  const t = document.getElementById("dc-expenses");
  const rows = monthData().expenses[currentDay] || [];
  let total = 0;
  let html = "<tr><th>Item</th><th class='num'>Amount</th><th></th><th></th></tr>";
  rows.forEach((r, i) => {
    total += r.amount;
    html += `<tr><td>${esc(r.item)}</td><td class="num">${fmt(r.amount)}</td>
      <td>${imgCell("exp", r, i)}</td>
      <td><button class="del-btn" title="Remove" onclick="delExpense(${i})">×</button></td></tr>`;
  });
  html += `<tr class="total"><td>Total expenses</td><td class="num">₹${fmt(total)}</td><td></td><td></td></tr>`;
  t.innerHTML = html;
  document.getElementById("dc-exp-total").textContent = "₹" + fmt(total);
  document.getElementById("dc-today-total").textContent =
    `TOTAL EXPENSES TODAY ₹${fmt(wageTotal - total)}`;
  document.getElementById("exp-cat-list").innerHTML =
    CATS().map((c) => `<option value="${esc(c)}">`).join("");
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
      html += `<tr><td>${i + 1}</td><td>${esc(r.item)}</td><td class="num">${fmt(r.amount)}</td>
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
  img.onerror = () => {
    URL.revokeObjectURL(img.src);
    alert("That file doesn't look like an image — please choose a photo (JPG/PNG).");
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

// ---- AI OCR autofill (Bedrock: Claude Haiku 4.5 vision, via ocrInvoice Lambda) ----
async function ocrAutofill(section) {
  const invs = (monthData().invoices[currentDay] || {})[section] || [];
  if (!invs.length) { alert("Upload an invoice photo first, then run AI OCR autofill."); return; }
  const btn = document.querySelector(`[data-ocr="${section}"]`);
  const prevLabel = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Reading…"; }
  try {
    const items = await store.ocrExtractInvoice(invs, section);
    if (!items.length) { alert("Couldn't read any line items from the invoice photo(s). Try a clearer photo or add items manually."); return; }
    const md = monthData();
    if (!md.details[currentDay]) md.details[currentDay] = {};
    if (!md.details[currentDay][section]) md.details[currentDay][section] = [];
    md.details[currentDay][section].push(...items);
    persistDay(); renderDC();
  } catch (e) {
    console.error("ocrAutofill failed", e);
    alert("AI OCR failed — check your connection and try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevLabel; }
  }
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
  const exp = renderExpenses(wages);
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
    html += `<tr><td class="name">${esc(e.name)}</td>`;
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
    phtml += `<tr><td>${esc(e.name)}</td><td class="num">${e.rate}</td><td class="num">${hrs}</td>
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
function fireEmployee(empId) {
  const e = EMPS().find((e) => e.id === empId);
  if (!confirm(`Mark ${e.name} as fired (${todayISO()})? They'll no longer appear for new hours entry, but all history stays.`)) return;
  e.active = false;
  e.fireDate = todayISO();
  persistConfig(); renderAdmin();
}
function rehireEmployee(empId) {
  const e = EMPS().find((e) => e.id === empId);
  e.active = true;
  e.fireDate = null;
  persistConfig(); renderAdmin();
}
function setGroup(empId, group) {
  EMPS().find((e) => e.id === empId).group = group || null;
  persistConfig(); renderAdmin();
}
// swap with the nearest neighbor in the same group; array position is the sort order
function moveEmployee(empId, dir) {
  const arr = EMPS();
  const idx = arr.findIndex((e) => e.id === empId);
  const group = arr[idx].group;
  let j = idx + dir;
  while (j >= 0 && j < arr.length && arr[j].group !== group) j += dir;
  if (j < 0 || j >= arr.length) return;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
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
    alert(`${e.name} has recorded hours on file — fire instead of removing, so payroll history stays intact.`);
    return;
  }
  if (!confirm(`Remove ${e.name} entirely? This can't be undone.`)) return;
  state.config.employees = EMPS().filter((x) => x.id !== empId);
  persistConfig(); renderAdmin();
}
function addEmployee() {
  const name = document.getElementById("new-emp-name").value.trim();
  const rate = parseFloat(document.getElementById("new-emp-rate").value);
  const group = document.getElementById("new-emp-group").value || null;
  if (!name || !(rate >= 0)) return;
  if (EMPS().some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    alert(`"${name}" already exists.`); return;
  }
  const id = Math.max(0, ...EMPS().map((e) => e.id)) + 1;
  EMPS().push({ id, name, rate, active: true, group, hireDate: todayISO(), fireDate: null });
  document.getElementById("new-emp-name").value = "";
  document.getElementById("new-emp-rate").value = "";
  document.getElementById("new-emp-group").value = "";
  persistConfig(); renderAdmin();
}
function addVendor() {
  const v = document.getElementById("new-vendor").value.trim();
  if (!v) return;
  if (VENDORS().some((x) => x.toLowerCase() === v.toLowerCase())) {
    alert(`"${v}" already exists.`); return;
  }
  VENDORS().push(v);
  document.getElementById("new-vendor").value = "";
  persistConfig(); renderAdmin();
}
function delVendor(i) {
  if (!confirm(`Remove vendor "${VENDORS()[i]}" from the list? Existing bills keep their vendor name.`)) return;
  VENDORS().splice(i, 1);
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

function groupOptions(selected) {
  const opt = (v, label) => `<option value="${v}" ${(selected || "") === v ? "selected" : ""}>${label}</option>`;
  return opt("", UNASSIGNED) + GROUPS.map((g) => opt(g, g)).join("");
}
function renderAdmin() {
  if (normalizeConfig() && role === "admin") persistConfig();
  const md = monthData();
  const monthHours = (id) =>
    Object.values(md.hours).reduce((t, day) => t + (day[id] || 0), 0);
  let html = `<tr><th>Name</th><th>Group</th><th class='num'>Rate/hr</th><th class='num'>Hrs (${monthLabel(currentMonth)})</th>
    <th>Hired</th><th>Fired</th><th>Order</th><th>Status</th><th></th></tr>`;
  for (const [group, members] of groupEmployees(EMPS())) {
    html += `<tr class="group-row"><td colspan="9">${group}</td></tr>`;
    members.forEach((e, i) => {
      const removable = !hasAnyRecordedHours(e.id);
      html += `<tr class="${e.active ? "" : "inactive"}"><td>${esc(e.name)}</td>
        <td><select onchange="setGroup(${e.id}, this.value)">${groupOptions(e.group)}</select></td>
        <td class="num"><input type="number" min="0" step="0.01" value="${e.rate}"
          onchange="setRate(${e.id}, this.value)"></td>
        <td class="num">${monthHours(e.id) || "–"}</td>
        <td>${e.hireDate || "–"}</td>
        <td>${e.fireDate || "–"}</td>
        <td class="reorder">
          <button class="ghost sm" ${i === 0 ? "disabled" : ""} title="Move up" onclick="moveEmployee(${e.id},-1)">↑</button>
          <button class="ghost sm" ${i === members.length - 1 ? "disabled" : ""} title="Move down" onclick="moveEmployee(${e.id},1)">↓</button>
        </td>
        <td>${e.active
          ? `<button class="ghost sm off" title="Fire: hide from day entry, keep payroll history" onclick="fireEmployee(${e.id})">Fire</button>`
          : `<button class="ghost sm" title="Restore to active staff" onclick="rehireEmployee(${e.id})">Rehire</button>`}</td>
        <td>${removable
          ? `<button class="del-btn" title="Remove entirely (no recorded hours yet)" onclick="removeEmployee(${e.id})">×</button>`
          : ""}</td></tr>`;
    });
  }
  document.getElementById("admin-staff").innerHTML = html;
  document.getElementById("admin-staff-count").textContent =
    EMPS().filter((e) => e.active).length + " active";

  document.getElementById("admin-cats").innerHTML = CATS().map((c, i) =>
    `<span class="chip">${esc(c)}<button class="del-btn" title="Remove" onclick="delCategory(${i})">×</button></span>`
  ).join("");
  document.getElementById("admin-cat-count").textContent = CATS().length + " categories";

  document.getElementById("admin-vendors").innerHTML = VENDORS().map((v, i) =>
    `<span class="chip">${esc(v)}<button class="del-btn" title="Remove" onclick="delVendor(${i})">×</button></span>`
  ).join("");
  document.getElementById("admin-vendor-count").textContent = VENDORS().length + " vendors";
}

// ---- stock (goods received from vendors) ----
let editingBill = null; // deep copy while editing; written back on Save

const billTotal = (b) => (b.lines || []).reduce((t, l) => t + (l.amount || 0), 0);
const payStatus = (b) => b.payment?.status || "unpaid";

async function ensureStockLoaded(month) {
  if (state.stock[month]) return;
  const bills = await store.loadStockMonth(month);
  await store.resolveStockUrls(bills);
  state.stock[month] = bills;
}

function stockNew() {
  const inMonth = todayISO().slice(0, 7) === currentMonth;
  editingBill = {
    _isNew: true, id: crypto.randomUUID(), month: currentMonth,
    date: inMonth ? todayISO() : `${currentMonth}-01`,
    vendor: "", status: "pending", lines: [], files: [],
    payment: { status: "unpaid", dueDate: "", paidDate: "" }, notes: "",
  };
  renderStockEditor();
}

function stockEdit(id) {
  const bill = (state.stock[currentMonth] || []).find((b) => b.id === id);
  if (!bill) return;
  editingBill = JSON.parse(JSON.stringify(bill));
  renderStockEditor();
}

function stockCancel() { editingBill = null; renderStockEditor(); }

async function stockDelete(id) {
  const bill = (state.stock[currentMonth] || []).find((b) => b.id === id);
  if (!bill) return;
  if (role !== "admin" && bill.status === "verified") return;
  if (!confirm(`Delete the ${esc(bill.vendor)} bill of ${bill.date}? This can't be undone.`)) return;
  try {
    await store.deleteStockBill(id);
    state.stock[currentMonth] = state.stock[currentMonth].filter((b) => b.id !== id);
    if (editingBill?.id === id) editingBill = null;
    renderStock();
  } catch (e) { console.error(e); }
}

function stockField(field, val) {
  if (field === "vendor" && val === "__new__") {
    const name = (prompt("New vendor name:") || "").trim();
    if (name && !VENDORS().some((v) => v.toLowerCase() === name.toLowerCase())) {
      VENDORS().push(name);
      persistConfig();
    }
    editingBill.vendor = name || editingBill.vendor;
  } else {
    editingBill[field] = val;
  }
  renderStockEditor();
}

function stockPay(field, val) {
  if (!editingBill.payment) editingBill.payment = { status: "unpaid", dueDate: "", paidDate: "" };
  editingBill.payment[field] = val;
  renderStockEditor();
}

function stockAddLine() {
  editingBill.lines.push({ item: "", qty: null, unit: "", rate: null, amount: null });
  renderStockEditor();
}
function stockDelLine(i) { editingBill.lines.splice(i, 1); renderStockEditor(); }
function stockLine(i, field, val) {
  const l = editingBill.lines[i];
  if (field === "item" || field === "unit") l[field] = val;
  else l[field] = val === "" ? null : parseFloat(val);
  // convenience: recompute amount when qty & rate are both known
  if ((field === "qty" || field === "rate") && l.qty != null && l.rate != null) {
    l.amount = Math.round(l.qty * l.rate * 100) / 100;
  }
  renderStockEditor();
}

function stockUpload() { document.getElementById("stock-file-input").click(); }
function stockDelFile(i) { editingBill.files.splice(i, 1); renderStockEditor(); }
function stockShowFile(i) {
  const url = store.invoiceUrl(editingBill.files[i]);
  if (url) openModal(url);
}

function resizeImageFile(f) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * scale; c.height = img.height * scale;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error("not an image")); };
    img.src = URL.createObjectURL(f);
  });
}

async function stockFilesPicked(files) {
  if (!editingBill) return;
  for (const f of files) {
    try {
      const isPdf = f.type === "application/pdf" || f.name?.toLowerCase().endsWith(".pdf");
      const data = isPdf ? f : new File([await resizeImageFile(f)], "bill.jpg", { type: "image/jpeg" });
      const key = await store.uploadStockFile(editingBill.month, data);
      editingBill.files.push(key);
    } catch (e) {
      console.error("stock upload failed", e);
      alert(`Couldn't upload ${f.name || "file"} — ${e.message || "try again"}.`);
    }
  }
  renderStockEditor();
}

async function stockOcr() {
  if (!editingBill?.files?.length) { alert("Upload the bill photo or PDF first."); return; }
  const btn = document.querySelector("[data-stock-ocr]");
  const prev = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Reading bill…"; }
  try {
    const { vendor, date, lines } = await store.ocrExtractBill(editingBill.files);
    if (!lines.length) { alert("Couldn't read line items from the bill. Try a clearer photo or enter manually."); return; }
    editingBill.lines.push(...lines);
    if (!editingBill.vendor && vendor) {
      const match = VENDORS().find((v) =>
        v.toLowerCase().includes(vendor.toLowerCase()) || vendor.toLowerCase().includes(v.toLowerCase()));
      if (match) editingBill.vendor = match;
      else if (!editingBill.notes) editingBill.notes = `Bill vendor: ${vendor}`;
    }
    if (editingBill._isNew && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) editingBill.date = date;
    renderStockEditor();
  } catch (e) {
    console.error("stockOcr failed", e);
    alert("AI reading failed — check your connection and try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
}

async function stockSave() {
  const b = editingBill;
  if (!b.vendor) { alert("Pick a vendor first."); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) { alert("Set the bill date."); return; }
  b.lines = b.lines.filter((l) => (l.item || "").trim() || l.amount);
  b.month = b.date.slice(0, 7); // bill may be dated outside the viewed month
  try {
    const { _isNew, ...toSave } = b;
    await store.saveStockBill({ ...toSave, _isNew });
    // update caches: remove from current month, insert into the bill's month if loaded
    if (state.stock[currentMonth]) {
      state.stock[currentMonth] = state.stock[currentMonth].filter((x) => x.id !== b.id);
    }
    const clean = JSON.parse(JSON.stringify(toSave));
    if (b.month === currentMonth) {
      state.stock[currentMonth].push(clean);
      state.stock[currentMonth].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    } else {
      delete state.stock[b.month]; // force reload when that month is viewed
      alert(`Saved into ${monthLabel(b.month)} (bill date ${b.date}).`);
    }
    editingBill = null;
    renderStock();
  } catch (e) {
    console.error("stockSave failed", e);
    alert("Saving the bill failed — try again.");
  }
}

async function stockSetStatus(status) {
  editingBill.status = status;
  if (editingBill._isNew) { renderStockEditor(); return; } // applied on first save
  try {
    const { _isNew, ...toSave } = editingBill;
    await store.saveStockBill(toSave);
    const bill = (state.stock[currentMonth] || []).find((x) => x.id === editingBill.id);
    if (bill) bill.status = status;
    renderStock();
  } catch (e) { console.error(e); alert("Updating status failed — try again."); }
}
const stockVerify = () => stockSetStatus("verified");
const stockUnverify = () => stockSetStatus("pending");

function renderStock() {
  const bills = state.stock[currentMonth];
  const billsEl = document.getElementById("stock-bills");
  if (!bills) { billsEl.innerHTML = `<tr><td class="empty">Loading…</td></tr>`; renderStockEditor(); return; }

  // day filter — dates present in this month's bills, newest last (matches bill sort order)
  const dayEl = document.getElementById("stock-day-filter");
  const days = [...new Set(bills.map((b) => b.date))].sort();
  const dayFilter = days.includes(dayEl.value) ? dayEl.value : ""; // drop a stale day after month change
  dayEl.innerHTML = `<option value="">All days</option>` +
    days.map((d) => `<option ${d === dayFilter ? "selected" : ""} value="${esc(d)}">${esc(d)}</option>`).join("");
  const dayBills = dayFilter ? bills.filter((b) => b.date === dayFilter) : bills;

  const filterEl = document.getElementById("stock-vendor-filter");
  const filter = filterEl.value;
  const names = [...new Set([...VENDORS(), ...dayBills.map((b) => b.vendor)])];
  filterEl.innerHTML = `<option value="">All vendors</option>` +
    names.map((v) => `<option ${v === filter ? "selected" : ""} value="${esc(v)}">${esc(v)}</option>`).join("");

  const shown = filter ? dayBills.filter((b) => b.vendor === filter) : dayBills;
  let html = `<tr><th>Date</th><th>Vendor</th><th class='num'>Items</th><th class='num'>Total</th>
    <th>Payment</th><th>Status</th><th></th><th></th></tr>`;
  for (const b of shown) {
    const total = billTotal(b);
    const canEdit = role === "admin" || b.status !== "verified";
    html += `<tr>
      <td>${esc(b.date)}</td><td>${esc(b.vendor)}</td>
      <td class="num">${(b.lines || []).length}</td><td class="num">₹${fmt(total)}</td>
      <td><span class="pay-chip pay-${payStatus(b)}">${payStatus(b)}</span>${
        b.payment?.dueDate && payStatus(b) !== "paid" ? ` <small>due ${esc(b.payment.dueDate)}</small>` : ""}</td>
      <td>${b.status === "verified" ? `<span class="status-chip ok">✓ verified</span>` : `<span class="status-chip pending">pending</span>`}</td>
      <td><button class="ghost sm" onclick="stockEdit('${b.id}')">${canEdit ? "Edit" : "View"}</button></td>
      <td>${canEdit ? `<button class="del-btn" title="Delete bill" onclick="stockDelete('${b.id}')">×</button>` : ""}</td></tr>`;
  }
  if (!shown.length) html += `<tr><td colspan="8" class="empty">${
    dayFilter ? `No bills recorded for ${esc(dayFilter)}.` : "No bills recorded this month — click “+ New bill”."}</td></tr>`;
  billsEl.innerHTML = html;
  document.getElementById("stock-month-total").textContent =
    "₹" + fmt(shown.reduce((t, b) => t + billTotal(b), 0));

  // per-vendor summary over the selected day (or whole month when no day is picked), unfiltered by vendor
  const byVendor = new Map();
  for (const b of dayBills) {
    const s = byVendor.get(b.vendor) || { count: 0, total: 0, due: 0 };
    const t = billTotal(b);
    s.count++; s.total += t;
    if (payStatus(b) !== "paid") s.due += t;
    byVendor.set(b.vendor, s);
  }
  let sh = `<tr><th>Vendor</th><th class='num'>Bills</th><th class='num'>Total value</th><th class='num'>Outstanding</th></tr>`;
  let out = 0;
  for (const [v, s] of [...byVendor.entries()].sort((a, z) => z[1].total - a[1].total)) {
    out += s.due;
    sh += `<tr><td>${esc(v)}</td><td class="num">${s.count}</td>
      <td class="num">₹${fmt(s.total)}</td><td class="num">${s.due ? `<b>₹${fmt(s.due)}</b>` : "—"}</td></tr>`;
  }
  if (!byVendor.size) sh += `<tr><td colspan="4" class="empty">No bills yet.</td></tr>`;
  document.getElementById("stock-summary").innerHTML = sh;
  document.getElementById("stock-outstanding").textContent = "₹" + fmt(out) + " outstanding";

  renderStockEditor();
}

function renderStockEditor() {
  const card = document.getElementById("stock-editor-card");
  if (!editingBill) { card.hidden = true; return; }
  card.hidden = false;
  const b = editingBill;
  const canEdit = role === "admin" || b.status !== "verified";
  const dis = canEdit ? "" : "disabled";
  document.getElementById("stock-editor-title").textContent =
    (b._isNew ? "New bill" : `${b.vendor || "Bill"} — ${b.date}`) + (b.status === "verified" ? " (verified)" : "");

  const vendorOpts = [...new Set([...VENDORS(), ...(b.vendor ? [b.vendor] : [])])]
    .map((v) => `<option ${v === b.vendor ? "selected" : ""} value="${esc(v)}">${esc(v)}</option>`).join("");

  let lines = `<tr><th>#</th><th>Item</th><th class='num'>Qty</th><th>Unit</th><th class='num'>Rate</th><th class='num'>Amount</th><th></th></tr>`;
  b.lines.forEach((l, i) => {
    lines += `<tr><td>${i + 1}</td>
      <td><input class="st-item" value="${esc(l.item || "")}" ${dis} onchange="stockLine(${i},'item',this.value)"></td>
      <td class="num"><input type="number" min="0" step="0.01" class="st-num" value="${l.qty ?? ""}" ${dis} onchange="stockLine(${i},'qty',this.value)"></td>
      <td><input class="st-unit" value="${esc(l.unit || "")}" placeholder="kg" ${dis} onchange="stockLine(${i},'unit',this.value)"></td>
      <td class="num"><input type="number" min="0" step="0.01" class="st-num" value="${l.rate ?? ""}" ${dis} onchange="stockLine(${i},'rate',this.value)"></td>
      <td class="num"><input type="number" min="0" step="0.01" class="st-num" value="${l.amount ?? ""}" ${dis} onchange="stockLine(${i},'amount',this.value)"></td>
      <td>${canEdit ? `<button class="del-btn" title="Remove line" onclick="stockDelLine(${i})">×</button>` : ""}</td></tr>`;
  });
  lines += `<tr class="total"><td colspan="5">Bill total</td><td class="num">₹${fmt(billTotal(b))}</td><td></td></tr>`;

  const files = (b.files || []).map((k, i) => {
    const url = store.invoiceUrl(k);
    const isPdf = k.endsWith(".pdf");
    const view = isPdf
      ? (url ? `<a class="pdf-chip" href="${url}" target="_blank" rel="noopener">📄 PDF ${i + 1}</a>` : `<span class="pdf-chip">📄 syncing…</span>`)
      : (url ? `<img class="thumb lg" src="${url}" onclick="stockShowFile(${i})">` : `<span title="Photo syncing…">⏳</span>`);
    return `<span class="inv-wrap">${view}${canEdit ? `<button class="del-btn" title="Remove file" onclick="stockDelFile(${i})">×</button>` : ""}</span>`;
  }).join("");

  const p = b.payment || { status: "unpaid", dueDate: "", paidDate: "" };
  document.getElementById("stock-editor").innerHTML = `
    <div class="stock-form-row">
      <label>Vendor <select ${dis} onchange="stockField('vendor', this.value)">
        <option value="">— select —</option>${vendorOpts}
        ${role === "admin" && canEdit ? `<option value="__new__">＋ Add new vendor…</option>` : ""}
      </select></label>
      <label>Bill date <input type="date" value="${esc(b.date)}" ${dis} onchange="stockField('date', this.value)"></label>
      <label>Payment <select ${dis} onchange="stockPay('status', this.value)">
        ${["unpaid", "partial", "paid"].map((s) => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select></label>
      <label>Due date <input type="date" value="${esc(p.dueDate || "")}" ${dis} onchange="stockPay('dueDate', this.value)"></label>
      <label>Paid date <input type="date" value="${esc(p.paidDate || "")}" ${dis} onchange="stockPay('paidDate', this.value)"></label>
    </div>
    ${canEdit ? `<div class="section-actions">
      <button class="ghost" onclick="stockUpload()">📷 Upload bill (photo / PDF)</button>
      <button class="ghost ocr" data-stock-ocr ${b.files?.length ? "" : "disabled"} onclick="stockOcr()">✨ AI autofill from bill</button>
      <button class="ghost" onclick="stockAddLine()">＋ Add line</button>
    </div>` : ""}
    <div class="invoice-strip">${files}</div>
    <div class="scroll-x"><table id="stock-lines">${lines}</table></div>
    <div class="stock-form-row">
      <label class="grow">Notes <input value="${esc(b.notes || "")}" ${dis} onchange="stockField('notes', this.value)"></label>
    </div>
    <div class="section-actions">
      ${canEdit ? `<button class="primary" onclick="stockSave()">Save bill</button>` : ""}
      ${role === "admin" && !b._isNew && b.status !== "verified" ? `<button class="ghost" onclick="stockVerify()">✅ Verify</button>` : ""}
      ${role === "admin" && !b._isNew && b.status === "verified" ? `<button class="ghost" onclick="stockUnverify()">Undo verify</button>` : ""}
      <button class="ghost" onclick="stockCancel()">Close</button>
    </div>`;
}

function renderAll() { renderDC(); renderAttendance(); if (role === "admin") renderAdmin(); }

// ---- first-run seeding (admin only): push config + July data to the cloud ----
async function seedIfEmpty() {
  if (!state.config) {
    if (role !== "admin") throw new Error("App not initialised yet — ask an admin to sign in once first.");
    state.config = {
      employees: SEED.employees.map((e) => ({ ...e, active: true, group: null, hireDate: null, fireDate: null })),
      categories: [...SEED.expenseCategories],
    };
    await store.createConfig(state.config);
  }
  if (role !== "admin") return;
  const seedMd = await store.loadMonth(SEED_MONTH);
  const isEmpty = !Object.keys(seedMd.hours).length && !Object.keys(seedMd.expenses).length;
  if (!isEmpty) {
    await store.resolveInvoiceUrls(seedMd); // ensureMonthLoaded will skip this month — resolve here
    state.months[SEED_MONTH] = seedMd;
    return;
  }
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
    setRate, fireEmployee, rehireEmployee, setGroup, moveEmployee, removeEmployee, delCategory, delVendor,
    stockEdit, stockDelete, stockCancel, stockField, stockPay, stockLine, stockAddLine,
    stockDelLine, stockUpload, stockDelFile, stockShowFile, stockOcr, stockSave, stockVerify, stockUnverify,
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
  document.getElementById("add-vendor-btn").onclick = addVendor;
  document.getElementById("stock-new-btn").onclick = stockNew;
  document.getElementById("stock-vendor-filter").onchange = renderStock;
  document.getElementById("stock-day-filter").onchange = renderStock;
  document.getElementById("stock-file-input").onchange = (ev) => {
    const files = [...ev.target.files];
    ev.target.value = "";
    if (files.length) stockFilesPicked(files);
  };
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
  if (normalizeConfig() && role === "admin") persistConfig();
  await ensureMonthLoaded(currentMonth);
  renderMonthLabel();
  renderAll();
}
