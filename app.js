// Skypark ops prototype — state = seed data + localStorage overlay
const LS_KEY = "sp-expenses-v2";
const DOW = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function emptyMonth() {
  return { hours: {}, expenses: {}, sales: {}, adjustments: {}, details: {}, invoices: {} };
}

function loadState() {
  const saved = localStorage.getItem(LS_KEY);
  let s = null;
  if (saved) { try { s = JSON.parse(saved); } catch (e) {} }
  if (!s) s = { months: {} };
  s.months = s.months || {};
  if (!s.months[SEED_MONTH]) s.months[SEED_MONTH] = JSON.parse(JSON.stringify(SEED.months[SEED_MONTH]));
  return s;
}
let state = loadState();

// currentMonth is "YYYY-MM"; default to the seed month so there's data on first load
let currentMonth = SEED_MONTH;
let currentDay = 1;

const save = () => localStorage.setItem(LS_KEY, JSON.stringify(state));
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("en-IN");

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

function renderMonthLabel() {
  document.getElementById("month-label").textContent = monthLabel(currentMonth);
}
document.getElementById("month-prev").onclick = () => { currentMonth = shiftMonth(currentMonth, -1); currentDay = 1; renderMonthLabel(); renderAll(); };
document.getElementById("month-next").onclick = () => { currentMonth = shiftMonth(currentMonth, 1); currentDay = 1; renderMonthLabel(); renderAll(); };

// ---- tabs ----
const viewDC = document.getElementById("view-dc");
const viewAtt = document.getElementById("view-att");
document.getElementById("tab-dc").onclick = () => switchTab("dc");
document.getElementById("tab-att").onclick = () => switchTab("att");
function switchTab(t) {
  document.getElementById("tab-dc").classList.toggle("active", t === "dc");
  document.getElementById("tab-att").classList.toggle("active", t === "att");
  viewDC.hidden = t !== "dc";
  viewAtt.hidden = t !== "att";
  if (t === "att") renderAttendance();
}

document.getElementById("reset-btn").onclick = () => {
  if (confirm(`Discard local edits for ${monthLabel(currentMonth)} and reload seed data (if any)?`)) {
    if (currentMonth === SEED_MONTH) {
      state.months[SEED_MONTH] = JSON.parse(JSON.stringify(SEED.months[SEED_MONTH]));
    } else {
      state.months[currentMonth] = emptyMonth();
    }
    save(); renderAll();
  }
};

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
  save(); renderDC();
}

function renderStaff() {
  const t = document.getElementById("dc-staff");
  const dayHours = monthData().hours[currentDay] || {};
  let wageTotal = 0;
  let html = "<tr><th>Name</th><th class='num'>Rate/hr</th><th>Hours</th><th class='num'>Amount</th></tr>";
  for (const e of SEED.employees) {
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
  save(); renderDC();
}
function renderExpenses() {
  const t = document.getElementById("dc-expenses");
  const rows = monthData().expenses[currentDay] || [];
  let total = 0;
  let html = "<tr><th>Item</th><th class='num'>Amount</th><th></th><th></th></tr>";
  rows.forEach((r, i) => {
    total += r.amount;
    const proof = r.img
      ? `<img class="thumb" src="${r.img}" onclick="showImg('${"exp"}',${i})" title="View invoice">`
      : `<button class="clip-btn" title="Attach invoice photo" onclick="attachRowImg('exp',${i})">📎</button>`;
    html += `<tr><td>${r.item}</td><td class="num">${fmt(r.amount)}</td>
      <td>${proof}</td>
      <td><button class="del-btn" title="Remove" onclick="delExpense(${i})">×</button></td></tr>`;
  });
  html += `<tr class="total"><td>Total expenses</td><td class="num">₹${fmt(total)}</td><td></td><td></td></tr>`;
  t.innerHTML = html;
  document.getElementById("dc-exp-total").textContent = "₹" + fmt(total);

  const sel = document.getElementById("exp-cat");
  if (!sel.options.length)
    sel.innerHTML = SEED.expenseCategories.map((c) => `<option>${c}</option>`).join("");
  return total;
}
document.getElementById("exp-add").onclick = () => {
  const amt = parseFloat(document.getElementById("exp-amt").value);
  if (!amt) return;
  const md = monthData();
  if (!md.expenses[currentDay]) md.expenses[currentDay] = [];
  md.expenses[currentDay].push({ item: document.getElementById("exp-cat").value, amount: amt });
  document.getElementById("exp-amt").value = "";
  save(); renderDC();
};

// ---- purchase detail sections (Blinkit / Instamart) ----
const DETAIL_SECTIONS = ["blinkit", "instamart"];

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
  save(); renderDC();
}

function delDetail(section, i) {
  monthData().details[currentDay][section].splice(i, 1);
  save(); renderDC();
}

function renderDetails() {
  for (const sec of DETAIL_SECTIONS) {
    const rows = detailRows(sec);
    let total = 0;
    let html = "<tr><th>S.no</th><th>Item</th><th class='num'>Amount</th><th></th><th></th></tr>";
    rows.forEach((r, i) => {
      total += r.amount;
      const proof = r.img
        ? `<img class="thumb" src="${r.img}" onclick="showImg('${sec}',${i})" title="View invoice">`
        : `<button class="clip-btn" title="Attach invoice photo" onclick="attachRowImg('${sec}',${i})">📎</button>`;
      html += `<tr><td>${i + 1}</td><td>${r.item}</td><td class="num">${fmt(r.amount)}</td>
        <td>${proof}</td>
        <td><button class="del-btn" title="Remove" onclick="delDetail('${sec}',${i})">×</button></td></tr>`;
    });
    if (!rows.length) html += `<tr><td colspan="5" class="empty">No items yet — add manually or upload an invoice.</td></tr>`;
    html += `<tr class="total"><td colspan="2">Total</td><td class="num">₹${fmt(total)}</td><td></td><td></td></tr>`;
    document.getElementById("dc-" + sec).innerHTML = html;
    document.getElementById(sec + "-total").textContent = "₹" + fmt(total);

    // section-level invoice gallery
    const invs = (monthData().invoices[currentDay] || {})[sec] || [];
    document.getElementById("inv-" + sec).innerHTML = invs.map((src, i) =>
      `<span class="inv-wrap"><img class="thumb lg" src="${src}" onclick="showImgSrc('${sec}',${i})">
       <button class="del-btn" title="Remove invoice" onclick="delInvoice('${sec}',${i})">×</button></span>`
    ).join("");
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
    // resize to keep localStorage small; a real backend would store the original
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = img.width * scale; c.height = img.height * scale;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.7);
    const t = pendingTarget;
    const md = monthData();
    try {
      if (t.type === "row") {
        const rows = t.kind === "exp" ? md.expenses[currentDay] : md.details[currentDay][t.kind];
        rows[t.idx].img = dataUrl;
      } else {
        if (!md.invoices[currentDay]) md.invoices[currentDay] = {};
        if (!md.invoices[currentDay][t.kind]) md.invoices[currentDay][t.kind] = [];
        md.invoices[currentDay][t.kind].push(dataUrl);
      }
      save();
    } catch (e) {
      alert("Could not save image locally (storage full). A real backend would lift this limit.");
    }
    renderDC();
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f);
};

function delInvoice(section, i) {
  monthData().invoices[currentDay][section].splice(i, 1);
  save(); renderDC();
}

const modal = document.getElementById("img-modal");
function openModal(src) { document.getElementById("img-modal-img").src = src; modal.hidden = false; }
function showImg(kind, idx) {
  const md = monthData();
  const rows = kind === "exp" ? md.expenses[currentDay] : md.details[currentDay][kind];
  openModal(rows[idx].img);
}
function showImgSrc(section, i) { openModal(monthData().invoices[currentDay][section][i]); }

// ---- AI OCR autofill (stub — integration point) ----
async function ocrAutofill(section) {
  const invs = (monthData().invoices[currentDay] || {})[section] || [];
  if (!invs.length) { alert("Upload an invoice photo first, then run AI OCR autofill."); return; }
  // Integration point: send invs[] (base64 images) to an OCR/vision API
  // (e.g. Claude vision) and parse line items into {item, amount} rows:
  //   const items = await extractLineItems(invs);
  //   monthData().details[currentDay][section].push(...items); save(); renderDC();
  alert("AI OCR coming soon: the uploaded invoice will be read automatically and line items filled into this table.");
}
const SALES_FIELDS = [
  ["totalSale", "Total Sale"], ["card", "Card"], ["upi", "UPI"], ["due", "Due"],
  ["swiggy", "Swiggy"], ["zomato", "Zomato"], ["cashInHand", "Cash in hand"],
];
function setSales(field, val) {
  const md = monthData();
  if (!md.sales[currentDay]) md.sales[currentDay] = {};
  md.sales[currentDay][field] = parseFloat(val) || 0;
  save(); renderDC();
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
  save(); renderAttendance();
}

function renderAttendance() {
  const md = monthData();
  const nDays = daysInMonth(currentMonth);
  const grid = document.getElementById("att-grid");
  let html = "<tr><th class='name'>Name</th>";
  for (let d = 1; d <= nDays; d++) html += `<th>${d}<br><small>${dayName(d)}</small></th>`;
  html += "<th class='num'>Hrs</th></tr>";
  for (const e of SEED.employees) {
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
  for (const e of SEED.employees) {
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

function renderAll() { renderDC(); renderAttendance(); }
renderMonthLabel();
renderAll();
