/* Family Budget — in-browser backend for the single-file version.
 *
 * Implements the same /api/* routes as server.py, but everything runs inside the
 * browser: data is saved in localStorage, statements are parsed with pdf.js /
 * SheetJS, and Claude is called directly with the user's API key.
 */
(function () {
  "use strict";

  const STORE_KEY = "familyBudget.v1";
  const MODEL = "claude-opus-5-5";
  // Server-side fallback: if a request is declined, the API retries it on a
  // suitable fallback model within the same call.
  const BETAS = ["server-side-fallback-2026-07-01"];
  const FALLBACKS = "default";

  // ---------------------------------------------------------------- categories

  const GROUPS = [
    ["income", "Income"],
    ["fixed", "Fixed"],
    ["flexible", "Flexible"],
    ["non_monthly", "Non-Monthly & Misc"],
    ["transfer", "Transfers (not counted)"],
  ];
  const GROUP_KEYS = GROUPS.map((g) => g[0]);
  const EXPENSE_GROUPS = ["fixed", "flexible", "non_monthly"];

  const DEFAULT_CATEGORIES = [
    ["Paychecks", "💵", "income"], ["Rent Income", "🏘️", "income"], ["Interest & Dividends", "📈", "income"],
    ["Refunds & Reimbursements", "↩️", "income"], ["Other Income", "💰", "income"],
    ["Mortgage", "🏠", "fixed"], ["Rent", "🏢", "fixed"], ["Gas & Electric", "⚡", "fixed"], ["Water", "💧", "fixed"],
    ["Garbage", "🗑️", "fixed"], ["Internet & Cable", "🌐", "fixed"], ["Phone", "📱", "fixed"], ["Insurance", "☂️", "fixed"],
    ["Auto Payment", "🚗", "fixed"], ["Student Loans", "🎓", "fixed"], ["Loan Payments", "🏦", "fixed"],
    ["Child Tuition", "👶", "fixed"], ["Child Activities", "⚽", "fixed"], ["Fitness", "💪", "fixed"], ["Subscriptions", "📺", "fixed"],
    ["Groceries", "🍏", "flexible"], ["Restaurants & Bars", "🍽️", "flexible"], ["Coffee Shops", "☕", "flexible"],
    ["Shopping", "🛍️", "flexible"], ["Clothing", "👕", "flexible"], ["Gas", "⛽", "flexible"], ["Parking & Tolls", "🅿️", "flexible"],
    ["Public Transit", "🚃", "flexible"], ["Rideshare & Taxi", "🚕", "flexible"], ["Entertainment & Recreation", "🎬", "flexible"],
    ["Personal Care", "💇", "flexible"], ["Medical & Pharmacy", "💊", "flexible"], ["Pets", "🐾", "flexible"],
    ["Household", "🧺", "flexible"], ["Cash & ATM", "🏧", "flexible"],
    ["Travel & Vacation", "✈️", "non_monthly"], ["Gifts & Donations", "🎁", "non_monthly"], ["Home Improvement", "🔨", "non_monthly"],
    ["Auto Maintenance", "🔧", "non_monthly"], ["Education", "📚", "non_monthly"], ["Taxes & Fees", "🧾", "non_monthly"],
    ["Business Expenses", "💼", "non_monthly"], ["Miscellaneous", "💲", "non_monthly"], ["Uncategorized", "❓", "non_monthly"],
    ["Credit Card Payment", "💳", "transfer"], ["Transfer", "🔁", "transfer"], ["Savings Transfer", "🐷", "transfer"],
  ];

  // Keyword fallback when AI is off. First match wins.
  const KEYWORD_RULES = [
    [/payroll|direct dep|salary|paycheck|adp |gusto|workday/i, "Paychecks"],
    [/interest paid|dividend|int earned/i, "Interest & Dividends"],
    [/refund|reversal|cashback|cash back reward|reimburse/i, "Refunds & Reimbursements"],
    [/zelle from|venmo cashout|rent from|tenant/i, "Rent Income"],
    [/autopay|payment thank you|card payment|cc payment|pymt.*card|epay.*(chase|amex|citi|discover|capital one)/i, "Credit Card Payment"],
    [/transfer to sav|to savings|savings transfer/i, "Savings Transfer"],
    [/online transfer|xfer|transfer (to|from)|zelle to|venmo/i, "Transfer"],
    [/mortgage|rocket mortgage|wells fargo home|mr\.? cooper|loan servic/i, "Mortgage"],
    [/\brent\b|apartments|property mgmt|avalon|equity residential/i, "Rent"],
    [/pg&e|pge|con ?ed|duke energy|edison|electric|national grid|energy/i, "Gas & Electric"],
    [/water (dept|district|util)|water bill|\bwater\b/i, "Water"],
    [/waste management|recology|republic services|garbage|trash/i, "Garbage"],
    [/comcast|xfinity|spectrum|verizon fios|at&t internet|sonic\.net|cox comm|google fiber/i, "Internet & Cable"],
    [/t-mobile|verizon wireless|at&t wireless|mint mobile|visible|cricket/i, "Phone"],
    [/geico|state farm|allstate|progressive|insurance|lemonade|usaa ins/i, "Insurance"],
    [/toyota financial|honda financial|auto loan|car payment|ally auto|tesla finance/i, "Auto Payment"],
    [/navient|nelnet|student loan|great lakes|mohela|fedloan/i, "Student Loans"],
    [/tuition|daycare|preschool|kindercare|bright horizons|montessori/i, "Child Tuition"],
    [/soccer|swim|ballet|karate|little league|camp|kumon|piano|music lesson|ymca/i, "Child Activities"],
    [/gym|fitness|equinox|planet fitness|peloton|orangetheory|24 hour|crossfit|yoga/i, "Fitness"],
    [/netflix|spotify|hulu|disney\+|disney plus|hbo|max\.com|apple\.com\/bill|youtube premium|icloud|audible|patreon|substack|chatgpt|claude\.ai|anthropic/i, "Subscriptions"],
    [/whole foods|trader joe|safeway|kroger|costco|aldi|sprouts|wegmans|publix|h-e-b|heb |grocery|market|99 ranch|h mart|instacart|lucky/i, "Groceries"],
    [/starbucks|peet'?s|blue bottle|philz|dunkin|coffee|cafe|espresso|tea /i, "Coffee Shops"],
    [/restaurant|grill|pizza|sushi|taco|burger|chipotle|mcdonald|doordash|uber ?eats|grubhub|kitchen|bistro|bar |pub |diner|ramen|pho|bakery|cheesecake|panera|sweetgreen|in-n-out/i, "Restaurants & Bars"],
    [/shell|chevron|exxon|mobil|arco|76 |valero|bp |sunoco|circle k|gas station|fuel/i, "Gas"],
    [/parking|toll|fastrak|ezpass|e-zpass|parkmobile|spothero/i, "Parking & Tolls"],
    [/bart|mta|clipper|caltrain|metro|transit|amtrak|muni/i, "Public Transit"],
    [/uber|lyft|taxi|cab /i, "Rideshare & Taxi"],
    [/amc|cinema|movie|theater|theatre|ticketmaster|steam|playstation|xbox|nintendo|museum|zoo|concert|bowling/i, "Entertainment & Recreation"],
    [/salon|barber|spa |nail|sephora|ulta|haircut/i, "Personal Care"],
    [/cvs|walgreens|rite aid|pharmacy|medical|dental|dentist|clinic|hospital|kaiser|doctor|optometr|lab corp|quest diag/i, "Medical & Pharmacy"],
    [/petco|petsmart|chewy|vet |veterinary|rover/i, "Pets"],
    [/nordstrom|gap |old navy|uniqlo|zara|h&m|lululemon|nike|adidas|macy'?s|j\.?crew|banana republic|kohl'?s/i, "Clothing"],
    [/home depot|lowe'?s|ace hardware|ikea|wayfair|contractor|plumb/i, "Home Improvement"],
    [/target|walmart|bed bath|container store|dollar tree/i, "Household"],
    [/amazon|amzn|ebay|etsy|best buy|apple store|shop|store/i, "Shopping"],
    [/atm|cash withdrawal|withdrawal/i, "Cash & ATM"],
    [/airline|united|delta|american air|southwest|jetblue|alaska air|airbnb|vrbo|hotel|marriott|hilton|hyatt|expedia|booking\.com/i, "Travel & Vacation"],
    [/jiffy lube|auto repair|tire|midas|oil change|car wash|dmv/i, "Auto Maintenance"],
    [/donation|charity|gofundme|red cross|unicef|church/i, "Gifts & Donations"],
    [/irs|tax|franchise tax|fee|service charge|overdraft/i, "Taxes & Fees"],
    [/udemy|coursera|books|school|college|university/i, "Education"],
  ];

  function keywordCategory(description, amount) {
    for (const [rx, cat] of KEYWORD_RULES) if (rx.test(description || "")) return cat;
    return amount > 0 ? "Other Income" : "Uncategorized";
  }

  // ---------------------------------------------------------------- storage

  let DB = null;

  function freshDB() {
    return {
      version: 1,
      nextId: 1,
      categories: DEFAULT_CATEGORIES.map(([name, emoji, grp], i) => ({ id: i + 1, name, emoji, grp, sort: i })),
      budgets: {},        // month -> { categoryId: planned }
      groupBudgets: {},   // month -> { grp: planned }
      transactions: [],
      uploads: [],
      merchantRules: {},  // merchant -> categoryId
      chat: {},           // month -> [{ role, content, created_at }]
      settings: { family_name: "Family" },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      DB = raw ? JSON.parse(raw) : null;
    } catch { DB = null; }
    if (!DB || !Array.isArray(DB.categories)) {
      DB = freshDB();
      DB.nextId = DB.categories.length + 1;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(DB));
    } catch (e) {
      throw httpError(507, "Couldn't save: the browser's storage is full or blocked. Download a backup from Settings.");
    }
  }

  const newId = () => DB.nextId++;
  const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

  function httpError(status, detail) {
    const e = new Error(detail);
    e.status = status;
    return e;
  }

  // ---------------------------------------------------------------- months & merchants

  const pad = (n) => String(n).padStart(2, "0");
  function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
  function shiftMonth(m, n) {
    const [y, mo] = m.split("-").map(Number);
    const d = new Date(y, mo - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  function monthLabel(m) {
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  }

  const NOISE = /\b(pos|debit|credit|card|purchase|recurring|payment|ach|web|online|pmt|checkcard|visa|mastercard|sq|tst|pp|paypal|ref|id|des|indn|co|inc|llc|www|com)\b|[#*]|\d+/gi;
  function merchantKey(description) {
    let s = (description || "").replace(NOISE, " ");
    s = s.replace(/[^A-Za-z&' ]/g, " ");
    let words = s.toUpperCase().split(/\s+/).filter((w) => w.length > 1 || w === "&");
    if (words.length > 2 && words[words.length - 1].length === 2) words = words.slice(0, -1);
    return words.slice(0, 3).join(" ") || (description || "").toUpperCase().slice(0, 30);
  }

  // ---------------------------------------------------------------- budget math

  const r2 = (n) => Math.round(n * 100) / 100;
  const catById = (id) => DB.categories.find((c) => c.id === id);
  const sortedCats = () => DB.categories.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  function ensureMonthBudget(month) {
    if (DB.budgets[month]) return;
    const prev = Object.keys(DB.budgets).filter((m) => m < month).sort().pop();
    if (!prev) return;
    DB.budgets[month] = { ...DB.budgets[prev] };
    if (DB.groupBudgets[prev] && !DB.groupBudgets[month]) DB.groupBudgets[month] = { ...DB.groupBudgets[prev] };
  }

  function monthBudget(month) {
    ensureMonthBudget(month);
    const plan = DB.budgets[month] || {};
    const gplan = DB.groupBudgets[month] || {};
    const totals = {}, counts = {};
    let uncAmt = 0, uncCount = 0;
    for (const t of DB.transactions) {
      if (t.month !== month) continue;
      if (t.category_id == null || !catById(t.category_id)) { uncAmt += t.amount; uncCount++; continue; }
      totals[t.category_id] = (totals[t.category_id] || 0) + t.amount;
      counts[t.category_id] = (counts[t.category_id] || 0) + 1;
    }
    const groups = GROUPS.map(([key, label]) => {
      const sign = key === "income" ? 1 : -1;
      const rows = sortedCats().filter((c) => c.grp === key).map((c) => {
        const planned = r2(plan[c.id] || 0);
        const actual = r2(sign * (totals[c.id] || 0));
        return { id: c.id, name: c.name, emoji: c.emoji, planned, actual, remaining: r2(planned - actual), count: counts[c.id] || 0 };
      });
      const catPlanned = r2(rows.reduce((s, r) => s + r.planned, 0));
      const set = Object.prototype.hasOwnProperty.call(gplan, key);
      const planned = set ? gplan[key] : catPlanned;
      const actual = r2(rows.reduce((s, r) => s + r.actual, 0));
      return { key, label, categories: rows, planned: r2(planned), actual, remaining: r2(planned - actual),
        group_planned_set: set, unallocated: r2(planned - catPlanned) };
    });
    const g = Object.fromEntries(groups.map((x) => [x.key, x]));
    const incP = g.income.planned, incA = g.income.actual;
    const expP = r2(EXPENSE_GROUPS.reduce((s, k) => s + g[k].planned, 0));
    const expA = r2(EXPENSE_GROUPS.reduce((s, k) => s + g[k].actual, 0));
    return {
      month, label: monthLabel(month), groups,
      totals: {
        income_planned: incP, income_actual: incA, income_remaining: r2(incP - incA),
        expense_planned: expP, expense_actual: expA, expense_remaining: r2(expP - expA),
        left_to_budget: r2(incP - expP), net_actual: r2(incA - expA),
        savings_rate: incA > 0 ? Math.round(((incA - expA) / incA) * 1000) / 10 : null,
      },
      uncategorized: { amount: r2(-uncAmt), count: uncCount },
    };
  }

  function trend(month, n = 6) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const m = shiftMonth(month, -i);
      let income = 0, expenses = 0;
      for (const t of DB.transactions) {
        if (t.month !== m) continue;
        const c = catById(t.category_id);
        if (!c) continue;
        if (c.grp === "income") income += t.amount;
        else if (EXPENSE_GROUPS.includes(c.grp)) expenses -= t.amount;
      }
      out.push({ month: m, label: monthLabel(m).slice(0, 3) + " " + m.slice(2, 4), income: r2(income), expenses: r2(expenses) });
    }
    return out;
  }

  function topMerchants(month, limit = 8) {
    const agg = {};
    for (const t of DB.transactions) {
      if (t.month !== month) continue;
      const c = catById(t.category_id);
      if (!c || !EXPENSE_GROUPS.includes(c.grp)) continue;
      const k = t.merchant || t.description;
      agg[k] = agg[k] || { merchant: k, total: 0, count: 0 };
      agg[k].total -= t.amount;
      agg[k].count++;
    }
    return Object.values(agg).filter((m) => m.total > 0).map((m) => ({ ...m, total: r2(m.total) }))
      .sort((a, b) => b.total - a.total).slice(0, limit);
  }

  function listTransactions({ month, category_id, q, grp, uncategorized } = {}) {
    const ql = q ? q.toLowerCase() : null;
    return DB.transactions.filter((t) => {
      const c = catById(t.category_id);
      if (month && t.month !== month) return false;
      if (category_id && t.category_id !== Number(category_id)) return false;
      if (grp && (!c || c.grp !== grp)) return false;
      if (uncategorized && c && c.name !== "Uncategorized") return false;
      if (ql && ![t.description, t.merchant, t.notes].some((v) => v && v.toLowerCase().includes(ql))) return false;
      return true;
    }).map((t) => {
      const c = catById(t.category_id);
      return { ...t, category: c ? c.name : null, emoji: c ? c.emoji : null, grp: c ? c.grp : null };
    }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  }

  function dashboard(month) {
    const b = monthBudget(month);
    const prev = monthBudget(shiftMonth(month, -1));
    const exp = b.groups.filter((g) => EXPENSE_GROUPS.includes(g.key));
    const byCategory = exp.flatMap((g) => g.categories.filter((c) => c.actual > 0)
      .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, group: g.key, actual: c.actual, planned: c.planned })))
      .sort((a, b2) => b2.actual - a.actual);
    const over = byCategory.filter((x) => x.planned > 0 && x.actual > x.planned)
      .concat(exp.flatMap((g) => g.categories.filter((c) => c.planned === 0 && c.actual > 0)
        .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, group: g.key, actual: c.actual, planned: 0 }))))
      .sort((a, b2) => (b2.actual - b2.planned) - (a.actual - a.planned));
    return {
      month, label: b.label, totals: b.totals, prev_totals: prev.totals,
      groups: b.groups.map(({ key, label, planned, actual, remaining }) => ({ key, label, planned, actual, remaining })),
      by_category: byCategory, over_budget: over.slice(0, 6), trend: trend(month),
      top_merchants: topMerchants(month), uncategorized: b.uncategorized,
    };
  }

  // ---------------------------------------------------------------- statement parsing

  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function isoDate(y, m, d) {
    if (y < 100) y += 2000;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  function parseDate(value, defaultYear) {
    if (value instanceof Date && !isNaN(value)) return isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
    let s = String(value || "").trim().split("T")[0].replace(/\s+00:00(:00)?$/, "");
    if (!s) return null;
    let m;
    if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) return isoDate(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/))) {
      return isoDate(+m[3], +m[1], +m[2]) || isoDate(+m[3], +m[2], +m[1]); // US first, then day-first
    }
    const mon = (x) => MONTHS.indexOf(x.slice(0, 3).toLowerCase()) + 1;
    if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/)) && mon(m[1])) return isoDate(+m[3], mon(m[1]), +m[2]);
    if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{2,4})$/)) && mon(m[2])) return isoDate(+m[3], mon(m[2]), +m[1]);
    if (defaultYear) {
      if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})$/))) return isoDate(defaultYear, +m[1], +m[2]);
      if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})$/)) && mon(m[1])) return isoDate(defaultYear, mon(m[1]), +m[2]);
    }
    return null;
  }

  function parseAmount(value) {
    if (value == null) return null;
    if (typeof value === "number") return value;
    const s = String(value).trim();
    if (!s) return null;
    let negative = (s.startsWith("(") && s.endsWith(")")) || s.startsWith("-") || s.endsWith("-");
    if (/CR$/i.test(s)) negative = false;
    const digits = s.replace(/[^0-9.]/g, "");
    if (!digits || digits === ".") return null;
    const n = Number(digits);
    if (!Number.isFinite(n)) return null;
    return negative ? -n : n;
  }

  function findCol(headers, ...candidates) {
    const low = headers.map((h) => String(h || "").toLowerCase().trim());
    for (const c of candidates) { const i = low.indexOf(c); if (i >= 0) return i; }
    for (const c of candidates) { const i = low.findIndex((h) => h.includes(c)); if (i >= 0) return i; }
    return null;
  }

  function applySign(txns, sign, singleColumn = true) {
    let flip = sign === "purchases_positive";
    if (sign === "auto" && singleColumn && txns.length) {
      const pos = txns.filter((t) => t.amount > 0).length;
      flip = pos / txns.length > 0.7; // mostly positive = card export with purchases as +
    }
    if (flip) txns.forEach((t) => { t.amount = -t.amount; });
    return txns;
  }

  function parseTable(table, sign = "auto") {
    let headerIdx = -1;
    for (let i = 0; i < Math.min(30, table.length); i++) {
      const cells = table[i].map((c) => String(c ?? "").toLowerCase());
      if (cells.some((c) => c.includes("date")) &&
          cells.some((c) => ["amount", "debit", "withdrawal", "credit", "deposit"].some((k) => c.includes(k)))) { headerIdx = i; break; }
    }
    if (headerIdx < 0) throw httpError(400, "Couldn't find a header row with a date and an amount column. Export the statement as CSV from your bank's website, or upload the PDF.");
    const headers = table[headerIdx].map((c) => String(c ?? ""));
    const cDate = findCol(headers, "transaction date", "trans. date", "date", "posted date", "posting date");
    const cDesc = findCol(headers, "description", "merchant", "payee", "name", "details", "memo", "transaction");
    const cAmt = findCol(headers, "amount");
    let cDebit = findCol(headers, "debit", "withdrawal", "withdrawals", "money out", "charges");
    let cCredit = findCol(headers, "credit", "deposit", "deposits", "money in", "payments");
    const cType = findCol(headers, "type", "transaction type");
    const cCat = findCol(headers, "category");
    if (cDate == null || cDesc == null || (cAmt == null && cDebit == null && cCredit == null)) {
      throw httpError(400, `Unrecognized columns: ${headers.join(", ")}`);
    }
    if (cAmt != null) { cDebit = null; cCredit = null; }
    const out = [];
    for (const row of table.slice(headerIdx + 1)) {
      const d = parseDate(row[cDate]);
      if (!d) continue;
      const desc = String(row[cDesc] ?? "").split(/\s+/).filter(Boolean).join(" ");
      let amt;
      if (cAmt != null) {
        amt = parseAmount(row[cAmt]);
        if (amt == null) continue;
        if (cType != null) {
          const t = String(row[cType] ?? "").toLowerCase();
          if (["debit", "dr", "withdrawal", "sale", "purchase"].includes(t)) amt = -Math.abs(amt);
          else if (["credit", "cr", "deposit"].includes(t)) amt = Math.abs(amt);
        }
      } else {
        const debit = cDebit != null ? parseAmount(row[cDebit]) : null;
        const credit = cCredit != null ? parseAmount(row[cCredit]) : null;
        if (debit) amt = -Math.abs(debit);
        else if (credit) amt = Math.abs(credit);
        else continue;
      }
      const hint = cCat != null && row[cCat] ? String(row[cCat]).trim() : null;
      out.push({ date: d, description: desc || "(no description)", amount: amt, hint });
    }
    return applySign(out, sign, cAmt != null && cType == null);
  }

  function parseCSVText(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/).slice(0, 5).join("\n");
    const counts = { ",": 0, ";": 0, "\t": 0 };
    for (const ch of first) if (ch in counts) counts[ch]++;
    const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  async function parseXLSX(file, sign) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const table = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    return parseTable(table.map((r) => r.map((c) => (c instanceof Date ? parseDate(c) : c))), sign);
  }

  let pdfWorkerUrl = null;
  async function pdfPages(file) {
    if (!window.pdfjsLib) throw httpError(500, "PDF reader failed to load.");
    if (!pdfWorkerUrl) {
      const src = document.getElementById("pdf-worker-src");
      pdfWorkerUrl = URL.createObjectURL(new Blob([src.textContent], { type: "text/javascript" }));
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    }
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent();
      // Rebuild lines: group text items by their vertical position, then left-to-right.
      const lines = [];
      for (const it of content.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = it.transform[5], x = it.transform[4];
        let line = lines.find((l) => Math.abs(l.y - y) < 3);
        if (!line) { line = { y, parts: [] }; lines.push(line); }
        line.parts.push({ x, s: it.str });
      }
      lines.sort((a, b) => b.y - a.y);
      pages.push(lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p2) => p2.s.trim()).join(" ")).join("\n"));
    }
    return pages;
  }

  const LINE_RX = /^\s*(?<date>\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|[A-Z][a-z]{2}\s+\d{1,2})\s+(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s+)?(?<desc>.+?)\s+(?<amt>\(?-?\$?\s?[\d,]+\.\d{2}\)?(?:\s?CR|-)?)(?:\s+\$?-?[\d,]+\.\d{2})?\s*$/;

  function guessYear(text) {
    const years = (text.match(/\b20\d{2}\b/g) || []).map(Number).filter((y) => y <= new Date().getFullYear() + 1);
    if (!years.length) return new Date().getFullYear();
    const freq = {};
    years.forEach((y) => { freq[y] = (freq[y] || 0) + 1; });
    return Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
  }

  function parsePdfRegex(pages, sign) {
    const text = pages.join("\n");
    const year = guessYear(text);
    const out = [];
    for (const line of text.split("\n")) {
      const m = line.match(LINE_RX);
      if (!m) continue;
      const d = parseDate(m.groups.date, year);
      const amt = parseAmount(m.groups.amt);
      if (!d || amt == null) continue;
      const desc = m.groups.desc.split(/\s+/).join(" ");
      if (/balance|total|minimum payment|payment due/i.test(desc)) continue;
      out.push({ date: d, description: desc, amount: amt, hint: null });
    }
    return applySign(out, sign);
  }

  // ---------------------------------------------------------------- AI (Claude)

  class AIUnavailable extends Error {}

  function aiEnabled() { return !!DB.settings.anthropic_api_key; }

  function aiClient() {
    if (!aiEnabled()) throw new AIUnavailable("Add your Anthropic API key in Settings to turn on AI features.");
    return new AnthropicSDK({
      apiKey: DB.settings.anthropic_api_key,
      dangerouslyAllowBrowser: true, // the key belongs to this user and stays on their computer
      baseURL: DB.settings.api_base_url || undefined,
    });
  }

  function checkStop(message) {
    if (message.stop_reason === "refusal") throw new AIUnavailable("The AI declined this request.");
    if (message.stop_reason === "max_tokens") throw new AIUnavailable("The AI response was cut off (statement too long for one pass).");
  }

  const textOf = (message) => message.content.filter((b) => b.type === "text").map((b) => b.text).join("");

  async function structured(client, { system, content, schema, maxTokens }) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      betas: BETAS,
      fallbacks: FALLBACKS,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content }],
    });
    const message = await stream.finalMessage();
    checkStop(message);
    return JSON.parse(textOf(message));
  }

  const EXTRACT_SYSTEM = `You extract transactions from bank and credit-card statement text.
Return every individual transaction exactly once. Skip balances, subtotals, interest-rate
tables, rewards summaries, and marketing text.

Sign convention (critical): amount is NEGATIVE when money left the account holder
(purchases, bills, fees, withdrawals, checks written) and POSITIVE when money came in
(deposits, paychecks, refunds, credits). On a credit-card statement, purchases are
negative and payments to the card are positive.

Dates must be YYYY-MM-DD. When rows omit the year, infer it from the statement period
(a December-January statement spans two years). Keep descriptions as printed, trimmed.`;

  const EXTRACT_SCHEMA = {
    type: "object",
    properties: {
      account_name: { type: "string" },
      statement_type: { type: "string", enum: ["checking", "savings", "credit_card", "other"] },
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: { date: { type: "string" }, description: { type: "string" }, amount: { type: "number" } },
          required: ["date", "description", "amount"],
          additionalProperties: false,
        },
      },
    },
    required: ["account_name", "statement_type", "transactions"],
    additionalProperties: false,
  };

  async function aiExtractStatement(pages, filename) {
    const client = aiClient();
    const chunks = [];
    let cur = "";
    pages.forEach((page, i) => {
      const piece = `\n--- page ${i + 1} ---\n${page}`;
      if (cur && cur.length + piece.length > 12000) { chunks.push(cur); cur = ""; }
      cur += piece;
    });
    if (cur.trim()) chunks.push(cur);
    if (!chunks.length) throw httpError(400, "This PDF has no readable text (it may be a scanned image).");
    const header = pages[0].slice(0, 3000);
    let account = filename;
    const txns = [];
    for (let n = 0; n < chunks.length; n++) {
      const context = n === 0 ? "" : `First page of the statement, for context:\n${header}\n\n`;
      const parsed = await structured(client, {
        system: EXTRACT_SYSTEM, schema: EXTRACT_SCHEMA, maxTokens: 32000,
        content: `${context}Statement file: ${filename}\nPart ${n + 1} of ${chunks.length}:\n${chunks[n]}`,
      });
      if (n === 0) account = parsed.account_name || filename;
      txns.push(...parsed.transactions);
    }
    return { account, transactions: txns };
  }

  const CATEGORIZE_SCHEMA = {
    type: "object",
    properties: {
      assignments: {
        type: "array",
        items: {
          type: "object",
          properties: { index: { type: "integer" }, category: { type: "string" } },
          required: ["index", "category"],
          additionalProperties: false,
        },
      },
    },
    required: ["assignments"],
    additionalProperties: false,
  };

  async function aiCategorize(items, examples) {
    const client = aiClient();
    const catLines = DB.categories.map((c) => `- ${c.name} (${c.grp})`).join("\n");
    const exLines = examples.slice(0, 80).map((e) => `- ${e.merchant} -> ${e.category}`).join("\n");
    const system = `You categorize household bank transactions for a family budget.
Pick exactly one category name from this list, spelled exactly as written:
${catLines}

Guidance:
- Positive amounts are money coming in; use an income category unless it is clearly a
  refund of a purchase (then use the purchase's category) or a payment/transfer.
- Payments to a credit card and moves between the family's own accounts are transfers
  ("Credit Card Payment", "Transfer", "Savings Transfer"), never expenses.
- The bank's own category hint, when present, is a clue but not authoritative.
- Use "Uncategorized" only when you genuinely cannot tell.
` + (exLines ? `\nThe family has previously categorized these merchants (follow them):\n${exLines}\n` : "");
    const names = new Set(DB.categories.map((c) => c.name));
    const result = {};
    for (let start = 0; start < items.length; start += 150) {
      const batch = items.slice(start, start + 150);
      const lines = batch.map((it) => `${it.index}. ${it.description} | ${it.amount >= 0 ? "+" : ""}${it.amount.toFixed(2)}` +
        (it.hint ? ` | bank category: ${it.hint}` : "")).join("\n");
      const parsed = await structured(client, { system, schema: CATEGORIZE_SCHEMA, maxTokens: 16000, content: `Categorize each transaction:\n${lines}` });
      for (const a of parsed.assignments) if (names.has(a.category)) result[a.index] = a.category;
    }
    return result;
  }

  const CHAT_SYSTEM = `You are the family's friendly, practical budgeting assistant inside their
budget app. You can see this month's budget (planned vs. actual by category), recent
months' totals, and the month's transactions.

- Answer from the data provided; quote real numbers and category names. If the data
  doesn't cover something, say so rather than guessing.
- Keep answers short and scannable: a one-line takeaway, then a few bullets. Use
  markdown bold for key numbers.
- When suggesting savings, be specific (which category, how much, what to try).
- You are not a licensed financial advisor; for tax, investment or legal decisions,
  suggest a professional briefly, without lecturing.
- Transfers and credit-card payments are excluded from spending totals.`;

  function chatContext(month) {
    const b = monthBudget(month);
    const t = b.totals;
    const f = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    const lines = [
      `Month: ${b.label} (today is ${new Date().toISOString().slice(0, 10)})`,
      `Income: planned $${f(t.income_planned)}, actual $${f(t.income_actual)}`,
      `Expenses (fixed+flexible+non-monthly): planned $${f(t.expense_planned)}, actual $${f(t.expense_actual)}`,
      `Left to budget (planned income - planned expenses): $${f(t.left_to_budget)}`,
      `Actual net (income - expenses): $${f(t.net_actual)}`,
      "", "Category | group | planned | actual | remaining | #txns",
    ];
    for (const g of b.groups) {
      for (const c of g.categories) {
        if (c.planned || c.actual) lines.push(`${c.name} | ${g.label} | ${c.planned.toFixed(0)} | ${c.actual.toFixed(2)} | ${c.remaining.toFixed(2)} | ${c.count}`);
      }
      lines.push(`= ${g.label} total | planned ${g.planned.toFixed(0)} | actual ${g.actual.toFixed(2)}`);
    }
    lines.push("", "Last 6 months (income / expenses):");
    for (const r of trend(month)) lines.push(`${r.label}: $${f(r.income)} / $${f(r.expenses)}`);
    const txns = listTransactions({ month });
    lines.push("", `Transactions this month (${txns.length}; negative = money out):`);
    for (const x of txns.slice(0, 400)) lines.push(`${x.date} | ${x.description.slice(0, 60)} | ${x.amount.toFixed(2)} | ${x.category || "Uncategorized"}`);
    if (txns.length > 400) lines.push(`... ${txns.length - 400} more not shown`);
    return lines.join("\n");
  }

  async function chat(month, question, onText) {
    const history = (DB.chat[month] || []).slice(-20);
    let answer = "";
    try {
      const client = aiClient();
      const messages = [
        { role: "user", content: `<budget_data>\n${chatContext(month)}\n</budget_data>\n\nI'll ask questions about this.` },
        { role: "assistant", content: "Got it — I have your budget data. What would you like to know?" },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: question },
      ];
      const stream = client.beta.messages.stream({
        model: MODEL, max_tokens: 8000, betas: BETAS, fallbacks: FALLBACKS,
        output_config: { effort: "low" }, system: CHAT_SYSTEM, messages,
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          answer += ev.delta.text;
          onText(ev.delta.text);
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") { const note = "\n\n_(The assistant couldn't answer that one.)_"; answer += note; onText(note); }
    } catch (e) {
      onText(describeAIError(e));
      return; // don't save failed exchanges
    }
    const stamp = nowStamp();
    (DB.chat[month] = DB.chat[month] || []).push({ role: "user", content: question, created_at: stamp },
      { role: "assistant", content: answer, created_at: stamp });
    save();
  }

  function describeAIError(e) {
    const A = window.AnthropicSDK;
    if (e instanceof AIUnavailable) return e.message;
    if (A && e instanceof A.AuthenticationError) return "Your Anthropic API key was rejected. Check it in Settings.";
    if (A && e instanceof A.RateLimitError) return "The AI is rate-limited right now. Try again in a minute.";
    if (A && e instanceof A.APIConnectionError) return "Couldn't reach the AI service. Check your internet connection.";
    if (A && e instanceof A.APIError) return `AI service error (${e.status ?? "unknown"}): ${e.message}`;
    if (e instanceof SyntaxError) return "The AI returned an unreadable answer. Try again.";
    return `AI error: ${e.message}`;
  }

  // ---------------------------------------------------------------- upload

  async function categorizeNew(txns) {
    const byName = Object.fromEntries(DB.categories.map((c) => [c.name, c.id]));
    const unc = byName.Uncategorized;
    const pending = [];
    txns.forEach((t, i) => {
      t.merchant = merchantKey(t.description);
      if (DB.merchantRules[t.merchant] && catById(DB.merchantRules[t.merchant])) {
        t.category_id = DB.merchantRules[t.merchant]; t.categorized_by = "rule";
      } else pending.push(i);
    });
    let warning = null;
    if (pending.length && aiEnabled()) {
      // Ask about each distinct merchant once; apply the answer to all its rows.
      const groups = new Map();
      for (const i of pending) {
        const k = `${txns[i].merchant}|${txns[i].amount > 0}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(i);
      }
      const idxLists = [...groups.values()];
      const items = idxLists.map((idxs, n) => ({ index: n, description: txns[idxs[0]].description, amount: txns[idxs[0]].amount, hint: txns[idxs[0]].hint }));
      const examples = Object.entries(DB.merchantRules).map(([merchant, id]) => ({ merchant, category: catById(id)?.name })).filter((e) => e.category);
      try {
        const answers = await aiCategorize(items, examples);
        idxLists.forEach((idxs, n) => {
          if (answers[n]) idxs.forEach((i) => { txns[i].category_id = byName[answers[n]]; txns[i].categorized_by = "ai"; });
        });
      } catch (e) {
        warning = `AI categorization unavailable (${describeAIError(e)}); used keyword rules instead.`;
      }
    }
    for (const t of txns) {
      if (t.category_id != null) continue;
      let name = keywordCategory(t.description, t.amount);
      if (t.hint && name === "Uncategorized") {
        const hinted = keywordCategory(t.hint, t.amount);
        if (hinted !== "Uncategorized") name = hinted;
      }
      t.category_id = byName[name] ?? unc;
      t.categorized_by = "keyword";
    }
    return { txns, warning };
  }

  async function upload(formData) {
    const files = formData.getAll("files");
    const account = String(formData.get("account") || "").trim();
    const sign = String(formData.get("sign") || "auto");
    const results = [];
    for (const f of files) {
      const name = f.name || "statement";
      const ext = name.toLowerCase().split(".").pop();
      const warnings = [];
      let method = ext, acct = account || null, txns = null;
      try {
        if (f.size > 25 * 1024 * 1024) throw httpError(400, "File is larger than 25 MB.");
        if (ext === "csv" || ext === "txt") txns = parseTable(parseCSVText(await f.text()), sign);
        else if (ext === "xlsx" || ext === "xlsm" || ext === "xls") txns = await parseXLSX(f, sign);
        else if (ext === "pdf") {
          const pages = await pdfPages(f);
          if (aiEnabled()) {
            try {
              const res = await aiExtractStatement(pages, name);
              txns = res.transactions.map((t) => ({ date: parseDate(t.date), description: t.description, amount: t.amount, hint: null })).filter((t) => t.date);
              if (sign === "purchases_positive") applySign(txns, "purchases_positive");
              acct = acct || res.account;
              method = "pdf+ai";
            } catch (e) {
              if (e.status === 400) throw e;
              warnings.push(`AI couldn't read the PDF (${describeAIError(e)}); used the basic reader.`);
            }
          }
          if (!txns) { txns = parsePdfRegex(pages, sign); method = "pdf"; }
        } else throw httpError(400, "Unsupported file type. Upload a CSV, Excel (.xlsx) or PDF statement.");
      } catch (e) {
        results.push({ file: name, error: e.message });
        continue;
      }
      if (!txns.length) { results.push({ file: name, error: "No transactions found in this file." }); continue; }

      const { warning } = await categorizeNew(txns);
      if (warning) warnings.push(warning);

      const existing = new Set(DB.transactions.map((t) => t.hash));
      const seen = {};
      const uploadId = newId();
      let added = 0, skipped = 0;
      const months = new Set();
      for (const t of txns) {
        // Re-uploading the same statement is harmless: identical rows are skipped.
        const base = `${t.date}|${t.amount.toFixed(2)}|${t.description.toUpperCase().split(/\s+/).join(" ")}`;
        seen[base] = (seen[base] || 0) + 1;
        const hash = `${base}|${seen[base]}`;
        if (existing.has(hash)) { skipped++; continue; }
        existing.add(hash);
        DB.transactions.push({
          id: newId(), date: t.date, month: t.date.slice(0, 7), description: t.description, merchant: t.merchant,
          amount: r2(t.amount), category_id: t.category_id, account: acct || name, notes: null, upload_id: uploadId,
          categorized_by: t.categorized_by, hash, created_at: nowStamp(),
        });
        added++;
        months.add(t.date.slice(0, 7));
      }
      if (added) DB.uploads.push({ id: uploadId, filename: name, account: acct || name, uploaded_at: nowStamp(), added, skipped, method });
      save();
      const by = {};
      txns.forEach((t) => { by[t.categorized_by] = (by[t.categorized_by] || 0) + 1; });
      results.push({ file: name, added, skipped, months: [...months].sort(), method, categorized_by: by, warnings });
    }
    return { results };
  }

  // ---------------------------------------------------------------- demo data

  const PLAN = {
    "Paychecks": 14312, "Rent Income": 5000, "Mortgage": 4060, "Rent": 5500, "Gas & Electric": 180, "Internet & Cable": 86,
    "Child Tuition": 3127, "Insurance": 164, "Loan Payments": 153, "Child Activities": 400, "Shopping": 1000, "Groceries": 1000,
    "Restaurants & Bars": 1000, "Clothing": 400, "Coffee Shops": 300, "Gas": 150, "Travel & Vacation": 300, "Gifts & Donations": 100,
  };
  const PATTERNS = [
    ["ACME CORP PAYROLL DIRECT DEP", "Paychecks", 7156, 7156, 2], ["ZELLE FROM J MARTINEZ RENT", "Rent Income", 3500, 3500, 1],
    ["MR COOPER MORTGAGE PMT", "Mortgage", 4060, 4060, 1], ["AVALON APARTMENTS RENT", "Rent", 5500, 5500, 1],
    ["PG&E WEB ONLINE", "Gas & Electric", 110, 170, 1], ["COMCAST XFINITY", "Internet & Cable", 86, 86, 1],
    ["BRIGHT HORIZONS TUITION", "Child Tuition", 3127, 3127, 1], ["GEICO AUTO INSURANCE", "Insurance", 164, 164, 1],
    ["BAY AREA SOCCER CLUB", "Child Activities", 150, 600, 1], ["KUMON LEARNING CTR", "Child Activities", 180, 180, 1],
    ["AMAZON MKTPL*2K4L1", "Shopping", 15, 180, 7], ["TARGET T-1234", "Household", 25, 140, 2],
    ["WHOLE FOODS MKT #102", "Groceries", 40, 190, 4], ["TRADER JOE'S #551", "Groceries", 35, 120, 3],
    ["COSTCO WHSE #0144", "Groceries", 120, 320, 1], ["CHIPOTLE 2231", "Restaurants & Bars", 18, 42, 3],
    ["DOORDASH*SUSHI RAN", "Restaurants & Bars", 35, 90, 3], ["TST* NOPA KITCHEN", "Restaurants & Bars", 80, 190, 1],
    ["UNIQLO USA 1123", "Clothing", 40, 160, 2], ["NORDSTROM #0427", "Clothing", 60, 220, 1],
    ["STARBUCKS STORE 0921", "Coffee Shops", 6, 14, 8], ["SQ *BLUE BOTTLE COFFEE", "Coffee Shops", 6, 12, 5],
    ["CHEVRON 0098812", "Gas", 45, 70, 3], ["FASTRAK CSC", "Parking & Tolls", 20, 60, 1], ["SPOTHERO PARKING", "Parking & Tolls", 12, 30, 2],
    ["NETFLIX.COM", "Subscriptions", 22.99, 22.99, 1], ["SPOTIFY USA", "Subscriptions", 16.99, 16.99, 1],
    ["AMC THEATRES 2201", "Entertainment & Recreation", 30, 70, 1], ["CVS/PHARMACY #4432", "Medical & Pharmacy", 10, 60, 1],
    ["BART CLIPPER", "Public Transit", 2, 10, 1], ["ATM WITHDRAWAL 00123", "Cash & ATM", 100, 100, 1],
    ["CHASE CARD AUTOPAY", "Credit Card Payment", 2500, 4000, 1],
  ];

  function loadDemo() {
    let seed = 42;
    const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const byName = Object.fromEntries(DB.categories.map((c) => [c.name, c.id]));
    const month = currentMonth();
    const today = new Date();
    const uploadId = newId();
    const existing = new Set(DB.transactions.map((t) => t.hash));
    let added = 0;
    for (let i = 5; i >= 0; i--) {
      const mo = shiftMonth(month, -i);
      DB.budgets[mo] = DB.budgets[mo] || {};
      for (const [name, planned] of Object.entries(PLAN)) if (byName[name]) DB.budgets[mo][byName[name]] = planned;
      DB.groupBudgets[mo] = { ...(DB.groupBudgets[mo] || {}), flexible: 3060 };
      const [y, m] = mo.split("-").map(Number);
      const lastDay = i === 0 ? Math.max(1, Math.min(28, today.getDate())) : 28;
      let n = 0;
      for (const [desc, cat, lo, hi, times] of PATTERNS) {
        for (let k = 0; k < times; k++) {
          const amt = r2(lo + rand() * (hi - lo));
          const d = `${y}-${pad(m)}-${pad(1 + Math.floor(rand() * lastDay))}`;
          const hash = `demo|${mo}|${n++}`;
          if (existing.has(hash) || !byName[cat]) continue;
          const income = cat === "Paychecks" || cat === "Rent Income";
          DB.transactions.push({ id: newId(), date: d, month: mo, description: desc, merchant: merchantKey(desc), amount: income ? amt : -amt,
            category_id: byName[cat], account: "Demo", notes: null, upload_id: uploadId, categorized_by: "demo", hash, created_at: nowStamp() });
          added++;
        }
      }
    }
    if (added) DB.uploads.push({ id: uploadId, filename: "Demo data", account: "Demo", uploaded_at: nowStamp(), added, skipped: 0, method: "demo" });
    save();
    return { added };
  }

  // ---------------------------------------------------------------- exports

  const familyName = () => DB.settings.family_name || "Family";
  const slug = (month) => `${familyName().replace(/\s+/g, "-")}-budget-${month}`;

  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function summaryRows(month) {
    const b = monthBudget(month);
    const rows = [["Group", "Category", "Planned", "Actual", "Remaining", "Transactions"]];
    for (const g of b.groups) {
      for (const c of g.categories) if (c.planned || c.actual) rows.push([g.label, c.name, c.planned, c.actual, c.remaining, c.count]);
      rows.push([g.label, "TOTAL", g.planned, g.actual, g.remaining, ""]);
    }
    const t = b.totals;
    rows.push([], ["", "Total income", t.income_planned, t.income_actual, t.income_remaining, ""],
      ["", "Total expenses", t.expense_planned, t.expense_actual, t.expense_remaining, ""],
      ["", "Left to budget", t.left_to_budget, "", "", ""], ["", "Net (actual)", "", t.net_actual, "", ""]);
    return rows;
  }
  function transactionRows(month) {
    return [["Date", "Description", "Merchant", "Category", "Group", "Amount", "Account", "Notes"]]
      .concat(listTransactions({ month }).map((x) => [x.date, x.description, x.merchant || "", x.category || "Uncategorized", x.grp || "", x.amount, x.account || "", x.notes || ""]));
  }
  function trendRows(month) {
    return [["Month", "Income", "Expenses", "Net"]].concat(trend(month, 12).map((r) => [monthLabel(r.month), r.income, r.expenses, r2(r.income - r.expenses)]));
  }

  function exportXLSX(month) {
    const wb = XLSX.utils.book_new();
    for (const [title, rows] of [["Summary", summaryRows(month)], ["Transactions", transactionRows(month)], ["12-Month Trend", trendRows(month)]]) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let R = 1; R <= range.e.r; R++) for (let C = 0; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.t === "n" && !(title === "Summary" && C === 5)) cell.z = '"$"#,##0.00;[Red]-"$"#,##0.00';
      }
      ws["!cols"] = rows[0].map((_, c) => ({ wch: Math.min(60, Math.max(10, ...rows.map((r) => String(r[c] ?? "").length + 2))) }));
      XLSX.utils.book_append_sheet(wb, ws, title);
    }
    XLSX.writeFile(wb, `${slug(month)}.xlsx`);
  }

  function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  function exportCSV(month) {
    const rows = transactionRows(month);
    const text = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    downloadBlob(new Blob([text], { type: "text/csv" }), month ? `${slug(month)}-transactions.csv` : `${familyName()}-all-transactions.csv`);
  }

  // jsPDF's built-in fonts are Latin-1 only, so strip emoji and other symbols.
  const pdfText = (s) => String(s ?? "").replace(/[−–—]/g, "-").replace(/[^\x20-\xFF]/g, "").trim();
  const pdfMoney = (v) => (v < -0.005 ? `-$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);

  function exportPDF(month) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = doc.internal.pageSize.getWidth(), M = 50, inner = W - 2 * M;
    const ink = [31, 29, 26], muted = [119, 115, 108], line = [230, 227, 222], band = [245, 244, 242];
    const green = [46, 158, 106], red = [210, 63, 63], blue = [74, 127, 212];
    const b = monthBudget(month), t = b.totals;

    doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...ink).text(pdfText(`${familyName()} Budget Summary`), M, 60);
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...muted).text(b.label, M, 76);

    const kpis = [
      ["Income", pdfMoney(t.income_actual), `of ${pdfMoney(t.income_planned)} planned`],
      ["Expenses", pdfMoney(t.expense_actual), `of ${pdfMoney(t.expense_planned)} planned`],
      ["Net saved", pdfMoney(t.net_actual), t.savings_rate != null ? `${t.savings_rate}% savings rate` : ""],
      ["Left to budget", pdfMoney(t.left_to_budget), "planned income minus expenses"],
    ];
    const kw = inner / 4;
    kpis.forEach(([k, v, s], i) => {
      const x = M + i * kw;
      doc.setFillColor(...band).setDrawColor(...line).rect(x, 90, kw, 58, "FD");
      doc.setFontSize(8).setTextColor(...muted).text(k, x + 10, 106);
      doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...ink).text(v, x + 10, 125);
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...muted).text(s, x + 10, 139);
    });

    let y = 175;
    const spend = b.groups.filter((g) => EXPENSE_GROUPS.includes(g.key)).flatMap((g) => g.categories)
      .filter((c) => c.actual > 0).sort((a, c) => c.actual - a.actual).slice(0, 10);
    if (spend.length) {
      doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...ink).text("Where the money went", M, y);
      y += 14;
      const max = spend[0].actual, labelW = 130, barMax = inner - labelW - 60;
      for (const c of spend) {
        doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...ink).text(pdfText(c.name), M + labelW - 6, y + 8, { align: "right" });
        doc.setFillColor(...blue).rect(M + labelW, y, Math.max(1, (c.actual / max) * barMax), 11, "F");
        doc.setFontSize(7).setTextColor(...muted).text(pdfMoney(c.actual), M + labelW + (c.actual / max) * barMax + 4, y + 8);
        y += 16;
      }
      y += 10;
    }

    for (const g of b.groups) {
      const rows = g.categories.filter((c) => c.planned || c.actual);
      if (!rows.length) continue;
      const body = rows.map((c) => [pdfText(c.name), pdfMoney(c.planned), pdfMoney(c.actual), c.planned ? pdfMoney(c.remaining) : ""]);
      body.push([`Total ${pdfText(g.label)}`, pdfMoney(g.planned), pdfMoney(g.actual), pdfMoney(g.remaining)]);
      doc.autoTable({
        startY: y, margin: { left: M, right: M },
        head: [[pdfText(g.label) + (g.key === "transfer" ? "" : ""), "Planned", "Actual", "Remaining"]],
        body, theme: "plain",
        styles: { fontSize: 9, textColor: ink, lineColor: line, lineWidth: { bottom: 0.4 }, cellPadding: 4 },
        headStyles: { fontStyle: "bold", textColor: ink },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        didParseCell: (data) => {
          if (data.section === "head" && data.column.index > 0) { data.cell.styles.halign = "right"; data.cell.styles.textColor = muted; }
          if (data.section !== "body") return;
          if (data.row.index === body.length - 1) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = band; return; }
          const c = rows[data.row.index];
          if (data.column.index === 3 && c.planned && g.key !== "income") data.cell.styles.textColor = c.remaining < 0 ? red : green;
        },
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    const txns = listTransactions({ month });
    if (txns.length) {
      doc.addPage();
      doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...ink).text(`All transactions (${txns.length})`, M, 50);
      doc.autoTable({
        startY: 60, margin: { left: M, right: M }, theme: "plain",
        head: [["Date", "Description", "Category", "Amount"]],
        body: txns.map((x) => [x.date, pdfText(x.description).slice(0, 70), pdfText(x.category || "Uncategorized"), x.amount.toFixed(2)]),
        styles: { fontSize: 8, textColor: ink, lineColor: line, lineWidth: { bottom: 0.3 }, cellPadding: 3 },
        headStyles: { fontStyle: "bold" }, columnStyles: { 3: { halign: "right" } },
      });
    }
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...muted);
      doc.text(pdfText(`${familyName()} budget - ${b.label}`), M, doc.internal.pageSize.getHeight() - 25);
      doc.text(`Page ${p}`, W - M, doc.internal.pageSize.getHeight() - 25, { align: "right" });
    }
    doc.save(`${slug(month)}.pdf`);
  }

  function exportBackup() {
    downloadBlob(new Blob([JSON.stringify(DB, null, 1)], { type: "application/json" }), `${familyName().replace(/\s+/g, "-")}-budget-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function restoreBackup(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { throw httpError(400, "That file isn't a Family Budget backup."); }
    if (!data || !Array.isArray(data.categories) || !Array.isArray(data.transactions)) throw httpError(400, "That file isn't a Family Budget backup.");
    DB = { ...freshDB(), ...data };
    save();
    return { transactions: DB.transactions.length };
  }

  // ---------------------------------------------------------------- routes

  function meta() {
    return {
      groups: GROUPS.map(([key, label]) => ({ key, label })),
      categories: sortedCats().map(({ id, name, emoji, grp, sort }) => ({ id, name, emoji, grp, sort })),
      months: [...new Set(DB.transactions.map((t) => t.month))].sort(),
      current_month: currentMonth(),
      transaction_count: DB.transactions.length,
      ai_enabled: aiEnabled(),
      family_name: familyName(),
      google_sheets: false,
    };
  }

  function settings() {
    const key = DB.settings.anthropic_api_key;
    return { family_name: familyName(), api_key_saved: !!key, api_key_hint: key ? `…${key.slice(-4)}` : null, api_key_from_env: false,
      google_share_email: DB.settings.google_share_email || "", google_sheets: false };
  }

  async function route(method, url, body) {
    const u = new URL(url, "http://local");
    const p = u.pathname, q = Object.fromEntries(u.searchParams);
    let m;

    if (p === "/api/meta") return meta();
    if (p === "/api/settings" && method === "GET") return settings();
    if (p === "/api/settings" && method === "PUT") {
      if (body.family_name != null) DB.settings.family_name = body.family_name.trim() || "Family";
      if (body.anthropic_api_key != null) DB.settings.anthropic_api_key = body.anthropic_api_key.trim() || null;
      if (body.google_share_email != null) DB.settings.google_share_email = body.google_share_email.trim();
      save();
      return settings();
    }

    if (p === "/api/categories" && method === "POST") {
      if (!body.name || !GROUP_KEYS.includes(body.grp)) throw httpError(400, "Name and a valid group are required.");
      if (DB.categories.some((c) => c.name.toLowerCase() === body.name.trim().toLowerCase())) throw httpError(400, "A category with that name already exists.");
      const id = newId();
      DB.categories.push({ id, name: body.name.trim(), emoji: body.emoji || "🏷️", grp: body.grp, sort: Math.max(0, ...DB.categories.map((c) => c.sort)) + 1 });
      save();
      return { id };
    }
    if ((m = p.match(/^\/api\/categories\/(\d+)$/))) {
      const id = Number(m[1]);
      const c = catById(id);
      if (!c) throw httpError(404, "Category not found.");
      if (method === "PATCH") {
        if (body.grp != null && !GROUP_KEYS.includes(body.grp)) throw httpError(400, "Invalid group.");
        for (const f of ["name", "emoji", "grp"]) if (body[f] != null) c[f] = String(body[f]).trim();
        save();
        return { ok: true };
      }
      if (method === "DELETE") {
        const unc = DB.categories.find((x) => x.name === "Uncategorized");
        if (unc && unc.id === id) throw httpError(400, "The Uncategorized category can't be deleted.");
        DB.transactions.forEach((t) => { if (t.category_id === id) t.category_id = unc ? unc.id : null; });
        DB.categories = DB.categories.filter((x) => x.id !== id);
        for (const k of Object.keys(DB.merchantRules)) if (DB.merchantRules[k] === id) delete DB.merchantRules[k];
        save();
        return { ok: true };
      }
    }

    if (p === "/api/budget" && method === "GET") { const r = monthBudget(q.month || currentMonth()); save(); return r; }
    if (p === "/api/budget" && method === "PUT") {
      ensureMonthBudget(body.month);
      if (body.category_id) {
        (DB.budgets[body.month] = DB.budgets[body.month] || {})[body.category_id] = body.planned || 0;
      } else if (GROUP_KEYS.includes(body.grp)) {
        DB.groupBudgets[body.month] = DB.groupBudgets[body.month] || {};
        if (body.planned == null) delete DB.groupBudgets[body.month][body.grp];
        else DB.groupBudgets[body.month][body.grp] = body.planned;
      } else throw httpError(400, "category_id or grp is required.");
      save();
      return monthBudget(body.month);
    }

    if (p === "/api/dashboard") { const r = dashboard(q.month || currentMonth()); save(); return r; }

    if (p === "/api/transactions" && method === "GET") {
      return listTransactions({ month: q.month, category_id: q.category_id, q: q.q, grp: q.grp, uncategorized: q.uncategorized === "true" });
    }
    if (p === "/api/transactions" && method === "POST") {
      const d = parseDate(body.date || "");
      if (!d || !body.description || body.amount == null) throw httpError(400, "Date, description and amount are required.");
      const id = newId();
      DB.transactions.push({ id, date: d, month: d.slice(0, 7), description: body.description.trim(), merchant: merchantKey(body.description),
        amount: body.amount, category_id: body.category_id ?? null, account: body.account || "Manual", notes: body.notes || null,
        upload_id: null, categorized_by: "manual", hash: `manual|${id}`, created_at: nowStamp() });
      save();
      return { id };
    }
    if ((m = p.match(/^\/api\/transactions\/(\d+)$/))) {
      const id = Number(m[1]);
      const t = DB.transactions.find((x) => x.id === id);
      if (method === "DELETE") { DB.transactions = DB.transactions.filter((x) => x.id !== id); save(); return { ok: true }; }
      if (!t) throw httpError(404, "Transaction not found.");
      let updated = 1;
      if (body.category_id != null) {
        t.category_id = body.category_id; t.categorized_by = "you";
        if (body.remember && t.merchant) DB.merchantRules[t.merchant] = body.category_id;
        if (body.apply_to_similar && t.merchant) {
          for (const o of DB.transactions) {
            if (o.id !== id && o.merchant === t.merchant && o.categorized_by !== "you") { o.category_id = body.category_id; o.categorized_by = "you"; updated++; }
          }
        }
      }
      for (const f of ["notes", "description", "account"]) if (body[f] != null) t[f] = body[f];
      if (body.amount != null) t.amount = body.amount;
      if (body.date != null) { const d = parseDate(body.date); if (!d) throw httpError(400, "Invalid date."); t.date = d; t.month = d.slice(0, 7); }
      save();
      return { ok: true, updated };
    }

    if (p === "/api/upload") return upload(body);
    if (p === "/api/uploads") {
      return DB.uploads.slice().reverse().map((u2) => {
        const dates = DB.transactions.filter((t) => t.upload_id === u2.id).map((t) => t.date).sort();
        return { ...u2, first_date: dates[0] || null, last_date: dates[dates.length - 1] || null };
      });
    }
    if ((m = p.match(/^\/api\/uploads\/(\d+)$/)) && method === "DELETE") {
      const id = Number(m[1]);
      const before = DB.transactions.length;
      DB.transactions = DB.transactions.filter((t) => t.upload_id !== id);
      DB.uploads = DB.uploads.filter((u2) => u2.id !== id);
      save();
      return { ok: true, deleted: before - DB.transactions.length };
    }
    if (p === "/api/demo") return loadDemo();
    if (p === "/api/all-data" && method === "DELETE") {
      Object.assign(DB, { transactions: [], uploads: [], budgets: {}, groupBudgets: {}, merchantRules: {}, chat: {} });
      save();
      return { ok: true };
    }
    if (p === "/api/chat" && method === "GET") return DB.chat[q.month] || [];
    if (p === "/api/chat" && method === "DELETE") { delete DB.chat[q.month]; save(); return { ok: true }; }

    throw httpError(404, `Unknown route ${method} ${p}`);
  }

  load();

  window.LocalBackend = {
    async request(path, opts = {}) {
      const method = (opts.method || "GET").toUpperCase();
      const body = opts.json !== undefined ? opts.json : opts.body;
      return route(method, path, body || {});
    },
    chat,
    exportFile(kind, month) {
      if (kind === "pdf") return exportPDF(month);
      if (kind === "xlsx") return exportXLSX(month);
      if (kind === "csv") return exportCSV(month);
      if (kind === "csv-all") return exportCSV(null);
      if (kind === "backup") return exportBackup();
      throw httpError(400, `Unknown export ${kind}`);
    },
    restoreBackup,
  };
})();
