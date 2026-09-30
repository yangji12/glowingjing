/* Family Budget — frontend (no build step; plain JS). */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  meta: null,
  month: null,
  view: "budget",
  collapsed: loadPref("collapsed", { transfer: true }),
  showUnbudgeted: {},
  txnFilters: { q: "", category_id: "", grp: "", all: false, uncategorized: false },
  charts: [],
  chatBusy: false,
};

function loadPref(key, fallback) {
  try { const v = localStorage.getItem("fb:" + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem("fb:" + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

// ------------------------------------------------------------------ utils

async function api(path, opts = {}) {
  const init = { ...opts };
  if (opts.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    init.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    delete init.json;
  }
  const res = await fetch(path, init);
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch { /* not json */ }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  const type = res.headers.get("content-type") || "";
  return type.includes("json") ? res.json() : res.text();
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function money(v, { cents = false, sign = false } = {}) {
  const n = Number(v) || 0;
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  if (n < 0 && Math.abs(n) >= (cents ? 0.005 : 0.5)) return `-$${abs}`;
  return (sign && n > 0 ? "+" : "") + `$${abs}`;
}

function parseMoney(s) {
  const t = String(s).replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function monthLabel(m) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}
function shiftMonth(m, n) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

let toastTimer;
function toast(msg, ms = 3200) {
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function categoryOptions(selectedId, { includeAll = false } = {}) {
  const groups = state.meta.groups;
  let html = includeAll ? `<option value="">All categories</option>` : "";
  for (const g of groups) {
    const cats = state.meta.categories.filter((c) => c.grp === g.key);
    if (!cats.length) continue;
    html += `<optgroup label="${esc(g.label)}">` + cats.map((c) =>
      `<option value="${c.id}" ${String(c.id) === String(selectedId) ? "selected" : ""}>${esc(c.emoji)} ${esc(c.name)}</option>`
    ).join("") + `</optgroup>`;
  }
  return html;
}

// Tiny, safe markdown renderer for assistant replies.
function renderMarkdown(src) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = [];
  let list = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(src).split("\n")) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
      if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^#{1,6}\s+(.*)/))) {
      closeList(); out.push(`<h4>${inline(m[1])}</h4>`);
    } else if (line.trim() === "") {
      closeList();
    } else if (/^\|.*\|$/.test(line.trim())) {
      closeList();
      if (!/^\|[\s:|-]+\|$/.test(line.trim())) out.push(`<p>${inline(line.trim().slice(1, -1).split("|").map((c) => c.trim()).join(" · "))}</p>`);
    } else {
      closeList(); out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

// ------------------------------------------------------------------ boot & navigation

async function loadMeta() {
  state.meta = await api("/api/meta");
  $("#brand-name").textContent = `${state.meta.family_name} Budget`;
  document.title = `${state.meta.family_name} Budget`;
}

async function boot() {
  await loadMeta();
  const saved = loadPref("month", null);
  state.month = saved || (state.meta.months.includes(state.meta.current_month) || !state.meta.months.length
    ? state.meta.current_month : state.meta.months[state.meta.months.length - 1]);
  state.view = location.hash.slice(1) || "budget";

  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
  $("#prev-month").onclick = () => setMonth(shiftMonth(state.month, -1));
  $("#next-month").onclick = () => setMonth(shiftMonth(state.month, 1));
  $("#upload-btn").onclick = openUpload;
  $("#export-btn").onclick = (e) => { e.stopPropagation(); $("#export-menu").classList.toggle("hidden"); };
  document.addEventListener("click", () => $("#export-menu").classList.add("hidden"));
  $$("#export-menu button").forEach((b) => b.onclick = () => doExport(b.dataset.export));
  window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (v && v !== state.view) go(v); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  setupChat();
  go(state.view);
}

function go(view) {
  if (!["budget", "dashboard", "transactions", "settings"].includes(view)) view = "budget";
  state.view = view;
  if (location.hash.slice(1) !== view) history.replaceState(null, "", "#" + view);
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $(".main").scrollTo(0, 0);
  window.scrollTo(0, 0);
  render();
}

function setMonth(m) {
  state.month = m;
  savePref("month", m);
  render();
  loadChat();
}

async function render() {
  $("#month-label").textContent = monthLabel(state.month);
  state.charts.forEach((c) => c.destroy());
  state.charts = [];
  const view = $("#view");
  try {
    if (state.view === "budget") await renderBudget(view);
    else if (state.view === "dashboard") await renderDashboard(view);
    else if (state.view === "transactions") await renderTransactions(view);
    else await renderSettings(view);
  } catch (e) {
    view.innerHTML = `<div class="banner warn"><span class="big">⚠️</span><div>${esc(e.message)}</div></div>`;
  }
}

async function refresh() {
  await loadMeta();
  await render();
}

// ------------------------------------------------------------------ budget view

function remainingCell(grp, c) {
  if (grp === "income") {
    if (!c.planned) return c.actual ? `<span class="pill good">${money(c.actual, { sign: true })}</span>` : "";
    if (Math.round(c.remaining) === 0) return `<span class="pill zero">$0</span>`;
    return c.remaining > 0 ? `<span class="pill good">${money(c.remaining)}</span>`
      : `<span class="pill good">${money(-c.remaining, { sign: true })}</span>`;
  }
  if (!c.planned) return c.actual > 0.5 ? `<span class="pill bad">${money(-c.actual)}</span>` : "";
  if (Math.round(c.remaining) === 0) return `<span class="pill zero">$0</span>`;
  return `<span class="pill ${c.remaining > 0 ? "good" : "bad"}">${money(c.remaining)}</span>`;
}

function progressBar(grp, planned, actual) {
  if (!planned) return "";
  const pct = Math.max(0, Math.min(actual / planned, 1)) * 100;
  const cls = grp === "income" || actual <= planned + 0.5 ? "good" : "bad";
  return `<div class="bar"><i class="${cls}" style="width:${pct.toFixed(1)}%"></i></div>`;
}

function groupCard(g) {
  const collapsed = !!state.collapsed[g.key];
  const isFlex = g.key === "flexible";
  const visible = g.categories.filter((c) => c.planned || Math.abs(c.actual) >= 0.005);
  const hidden = g.categories.filter((c) => !(c.planned || Math.abs(c.actual) >= 0.005));
  const showHidden = !!state.showUnbudgeted[g.key];
  const remClass = g.key === "income" ? (g.remaining >= 0 ? "pos" : "pos") : (g.remaining >= 0 ? "pos" : "neg");

  const headPlanned = isFlex
    ? `<input class="planned-input num ${g.remaining < 0 ? "over" : ""}" data-grp="flexible" value="${money(g.planned)}" title="Total flexible budget. Clear it to use the sum of the categories.">`
    : `<span class="num">${money(g.planned)}</span>`;

  let html = `<div class="card" data-group="${g.key}">
    <div class="row group-head">
      <div class="name"><button class="chev ${collapsed ? "collapsed" : ""}" data-toggle-group="${g.key}" aria-label="Collapse">▾</button>
        <span class="txt clickable" data-open-group="${g.key}">${esc(g.label)}</span></div>
      <div class="cell">${headPlanned}</div>
      <div class="cell num clickable" data-open-group="${g.key}">${money(g.actual)}</div>
      <div class="cell num ${remClass}">${g.planned || g.actual ? (g.key === "income" ? (g.remaining < 0 ? money(-g.remaining, { sign: true }) : money(g.remaining)) : `<span class="pill ${g.remaining >= 0 ? "good" : "bad"}">${money(g.remaining)}</span>`) : ""}</div>
      ${g.key !== "transfer" ? progressBar(g.key, g.planned, g.actual) : ""}
    </div>`;
  if (!collapsed) {
    if (isFlex && g.group_planned_set) {
      html += `<div class="row"><div class="name"><span class="emoji">▦</span><span class="txt unalloc" title="Flexible budget not yet assigned to a category">Unallocated Flexible Budget</span></div>
        <div class="cell num unalloc ${g.unallocated < 0 ? "neg" : ""}">${money(g.unallocated)}</div><div></div><div></div></div>`;
    }
    const rowHtml = (c, unbudgeted) => `
      <div class="row ${unbudgeted ? "unbudgeted" : ""}">
        <div class="name clickable" data-open-cat="${c.id}"><span class="emoji">${esc(c.emoji)}</span><span class="txt">${esc(c.name)}</span></div>
        <div class="cell"><input class="planned-input num" data-cat="${c.id}" value="${money(c.planned)}" inputmode="decimal" aria-label="Planned for ${esc(c.name)}"></div>
        <div class="cell num clickable" data-open-cat="${c.id}">${money(c.actual)}</div>
        <div class="cell">${remainingCell(g.key, c)}</div>
        ${g.key !== "transfer" ? progressBar(g.key, c.planned, c.actual) : ""}
      </div>`;
    html += visible.map((c) => rowHtml(c, false)).join("");
    if (showHidden) html += hidden.map((c) => rowHtml(c, true)).join("");
    if (hidden.length) {
      html += `<div class="row toggle-row" data-toggle-unbudgeted="${g.key}"><div class="name"><span class="emoji">${showHidden ? "🙈" : "👁"}</span>
        <span>${showHidden ? "Collapse" : "Show"} ${hidden.length} unbudgeted</span></div><div></div><div></div><div></div></div>`;
    }
    if (!g.categories.length) html += `<div class="note">No categories yet — add some in Settings.</div>`;
    if (g.key === "transfer") html += `<div class="note">Credit-card payments and moves between your own accounts. Shown for completeness; not counted as income or spending so nothing is double-counted.</div>`;
  }
  return html + "</div>";
}

function totalCard(label, planned, actual, remaining, isIncome) {
  const cls = isIncome ? "pos" : remaining >= 0 ? "pos" : "neg";
  return `<div class="card"><div class="row total"><div class="name">${label}</div>
    <div class="cell num">${money(planned)}</div><div class="cell num">${money(actual)}</div>
    <div class="cell num ${cls}">${money(remaining)}</div></div></div>`;
}

const band = (label, key) => `<div class="section-band"><span class="label" data-toggle-section="${key}">
  <span class="chev ${state.collapsed["section_" + key] ? "collapsed" : ""}">▾</span>${label}</span><span>Planned</span><span>Actual</span><span>Remaining</span></div>`;

async function renderBudget(view) {
  const b = await api(`/api/budget?month=${state.month}`);
  const g = Object.fromEntries(b.groups.map((x) => [x.key, x]));
  const t = b.totals;
  let html = "";

  if (!state.meta.transaction_count) {
    html += `<div class="banner"><span class="big">👋</span><div style="flex:1"><strong>Welcome!</strong> Upload a bank or credit-card statement (CSV, Excel or PDF) and it will be categorized automatically.
      Or load demo data to look around first.</div>
      <button class="btn primary" data-action="upload">Upload statement</button><button class="btn" data-action="demo">Load demo data</button></div>`;
  }
  if (b.uncategorized.count) {
    html += `<div class="banner warn"><span class="big">🏷️</span><div style="flex:1">${b.uncategorized.count} transaction(s) need a category.</div>
      <button class="btn small" data-action="review-uncat">Review</button></div>`;
  }
  const unc = g.non_monthly.categories.find((c) => c.name === "Uncategorized");
  if (unc && unc.count) {
    html += `<div class="banner warn"><span class="big">❓</span><div style="flex:1"><strong>${unc.count}</strong> transaction(s) this month are <em>Uncategorized</em> (${money(unc.actual)}).</div>
      <button class="btn small" data-open-cat="${unc.id}">Review</button></div>`;
  }

  html += band("Income", "income");
  if (!state.collapsed.section_income) {
    html += groupCard(g.income);
    html += totalCard("Total Income", t.income_planned, t.income_actual, t.income_remaining, true);
  }
  html += band("Expenses", "expenses");
  if (!state.collapsed.section_expenses) {
    html += groupCard(g.fixed) + groupCard(g.flexible) + groupCard(g.non_monthly);
    html += totalCard("Total Expenses", t.expense_planned, t.expense_actual, t.expense_remaining, false);
  }
  const ltb = t.left_to_budget;
  html += `<div class="left-to-budget ${ltb < 0 ? "negative" : ""}">
    <div>Left to Budget<div class="sub">Planned income − planned expenses</div></div>
    <div class="cell num" style="text-align:right">${money(ltb)}</div>
    <div class="cell num" style="text-align:right" title="Actual income − actual expenses"><div class="sub">Actual net</div>${money(t.net_actual)}</div><div></div></div>`;
  html += `<div style="height:18px"></div>` + groupCard(g.transfer);
  view.innerHTML = html;

  // interactions
  $$("[data-toggle-group]", view).forEach((el) => el.onclick = () => {
    const k = el.dataset.toggleGroup; state.collapsed[k] = !state.collapsed[k]; savePref("collapsed", state.collapsed); render();
  });
  $$("[data-toggle-section]", view).forEach((el) => el.onclick = () => {
    const k = "section_" + el.dataset.toggleSection; state.collapsed[k] = !state.collapsed[k]; savePref("collapsed", state.collapsed); render();
  });
  $$("[data-toggle-unbudgeted]", view).forEach((el) => el.onclick = () => {
    const k = el.dataset.toggleUnbudgeted; state.showUnbudgeted[k] = !state.showUnbudgeted[k]; render();
  });
  $$("[data-open-cat]", view).forEach((el) => el.onclick = () => {
    const c = state.meta.categories.find((x) => String(x.id) === el.dataset.openCat);
    openTxnDrawer({ title: `${c.emoji} ${c.name}`, category_id: c.id });
  });
  $$("[data-open-group]", view).forEach((el) => el.onclick = () => {
    const grp = g[el.dataset.openGroup];
    openTxnDrawer({ title: grp.label, grp: grp.key });
  });
  $$(".planned-input", view).forEach((inp) => {
    inp.addEventListener("focus", () => { const v = parseMoney(inp.value); inp.value = v ? String(v) : ""; inp.select(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); if (e.key === "Escape") { inp.dataset.cancel = "1"; inp.blur(); } });
    inp.addEventListener("blur", async () => {
      if (inp.dataset.cancel) { delete inp.dataset.cancel; return render(); }
      const v = parseMoney(inp.value);
      if (Number.isNaN(v)) { toast("Please enter a number"); return render(); }
      try {
        if (inp.dataset.grp) await api("/api/budget", { method: "PUT", json: { month: state.month, grp: inp.dataset.grp, planned: v } });
        else await api("/api/budget", { method: "PUT", json: { month: state.month, category_id: Number(inp.dataset.cat), planned: v || 0 } });
      } catch (e) { toast(e.message); }
      render();
    });
  });
  bindActions(view);
}

function bindActions(root) {
  $$("[data-action]", root).forEach((el) => el.onclick = async () => {
    const a = el.dataset.action;
    if (a === "upload") openUpload();
    if (a === "demo") {
      el.disabled = true;
      const r = await api("/api/demo", { method: "POST" });
      toast(`Loaded ${r.added} demo transactions`);
      state.month = state.meta.current_month;
      await refresh();
    }
    if (a === "review-uncat") openTxnDrawer({ title: "Needs a category", uncategorized: true });
  });
}

// ------------------------------------------------------------------ transaction drawer

async function openTxnDrawer({ title, category_id, grp, q, uncategorized, allMonths }) {
  const params = new URLSearchParams();
  if (!allMonths) params.set("month", state.month);
  if (category_id) params.set("category_id", category_id);
  if (grp) params.set("grp", grp);
  if (q) params.set("q", q);
  if (uncategorized) params.set("uncategorized", "true");
  const txns = await api(`/api/transactions?${params}`);
  const outflow = txns.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const inflow = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  const root = $("#modal-root");
  root.innerHTML = `<div class="overlay" id="overlay"><div class="drawer" role="dialog" aria-label="${esc(title)}">
    <div class="drawer-head"><div style="flex:1"><h2>${esc(title)}</h2>
      <div class="muted">${allMonths ? "All months" : monthLabel(state.month)} · ${txns.length} transaction${txns.length === 1 ? "" : "s"}
      ${outflow ? ` · <span class="num">${money(outflow, { cents: true })}</span> out` : ""}${inflow ? ` · <span class="num">${money(inflow, { cents: true })}</span> in` : ""}</div></div>
      <button class="icon-btn" data-close>✕</button></div>
    <div class="drawer-body">
      ${txns.length ? `<label class="muted" style="font-size:13px;display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <input type="checkbox" id="remember" checked> When I change a category, remember it for that merchant (and fix its other transactions)</label>
      <div class="card">${txnTable(txns, { compact: true })}</div>` : `<div class="empty"><p>No transactions here${allMonths ? "" : " this month"}.</p></div>`}
    </div></div></div>`;
  $("#overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });
  $("[data-close]", root).onclick = closeModal;
  bindTxnTable(root, () => openTxnDrawer({ title, category_id, grp, q, uncategorized, allMonths }));
}

function closeModal() {
  const had = $("#modal-root").innerHTML !== "";
  $("#modal-root").innerHTML = "";
  if (had && state.dirty) { state.dirty = false; render(); }
}

function txnTable(txns, { compact = false } = {}) {
  const tagFor = { ai: "AI", rule: "rule", keyword: "auto", you: "you", manual: "manual", demo: "demo" };
  return `<table class="txn-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="amt">Amount</th><th></th></tr></thead><tbody>
    ${txns.map((t) => `<tr data-id="${t.id}">
      <td class="num" style="white-space:nowrap">${fmtDate(t.date)}${compact ? "" : `<div class="txn-sub">${t.date.slice(0, 4)}</div>`}</td>
      <td><div class="txn-desc">${esc(t.description)}</div><div class="txn-sub">${esc(t.account || "")}${t.categorized_by ? `<span class="tag" title="How this was categorized">${tagFor[t.categorized_by] || esc(t.categorized_by)}</span>` : ""}${t.notes ? ` · ${esc(t.notes)}` : ""}</div></td>
      <td><select class="cat-select" data-txn-cat="${t.id}">${categoryOptions(t.category_id)}</select></td>
      <td class="amt num ${t.amount > 0 ? "pos" : ""}">${money(t.amount, { cents: true, sign: true })}</td>
      <td><button class="del" data-del="${t.id}" title="Delete transaction">✕</button></td>
    </tr>`).join("")}</tbody></table>`;
}

function bindTxnTable(root, reload) {
  $$("[data-txn-cat]", root).forEach((sel) => sel.onchange = async () => {
    const remember = $("#remember", root)?.checked ?? true;
    try {
      const r = await api(`/api/transactions/${sel.dataset.txnCat}`, { method: "PATCH", json: { category_id: Number(sel.value), remember, apply_to_similar: remember } });
      toast(r.updated > 1 ? `Updated ${r.updated} transactions from this merchant` : "Category updated");
      state.dirty = true;
      await loadMeta();
      if (reload) reload();
    } catch (e) { toast(e.message); }
  });
  $$("[data-del]", root).forEach((btn) => btn.onclick = async () => {
    if (!confirm("Delete this transaction?")) return;
    await api(`/api/transactions/${btn.dataset.del}`, { method: "DELETE" });
    state.dirty = true;
    await loadMeta();
    if (reload) reload();
  });
}

// ------------------------------------------------------------------ dashboard

async function renderDashboard(view) {
  const d = await api(`/api/dashboard?month=${state.month}`);
  const t = d.totals, p = d.prev_totals;
  const delta = (cur, prev, goodWhenUp) => {
    if (!prev) return `<span class="muted">No data last month</span>`;
    const diff = cur - prev;
    if (Math.abs(diff) < 0.5) return `<span class="muted">Same as last month</span>`;
    const good = goodWhenUp ? diff > 0 : diff < 0;
    return `<span class="${good ? "pos" : "neg"}">${diff > 0 ? "▲" : "▼"} ${money(Math.abs(diff))}</span> <span class="muted">vs last month</span>`;
  };

  if (!state.meta.transaction_count) {
    view.innerHTML = `<div class="empty"><div style="font-size:44px">📊</div><h2>Your dashboard will appear here</h2>
      <p>Upload a statement to see where your money goes, or load demo data to explore.</p>
      <button class="btn primary" data-action="upload">Upload statement</button> <button class="btn" data-action="demo">Load demo data</button></div>`;
    return bindActions(view);
  }

  const groupMeters = d.groups.filter((g) => g.key !== "transfer").map((g) => {
    const pct = g.planned ? Math.min(g.actual / g.planned, 1) * 100 : 0;
    const over = g.key !== "income" && g.actual > g.planned + 0.5;
    return `<div class="group-meter clickable" data-open-group="${g.key}" style="cursor:pointer">
      <div class="top"><strong>${esc(g.label)}</strong><span class="num">${money(g.actual)} <span class="muted">of ${money(g.planned)}</span></span></div>
      <div class="meter"><i style="width:${pct}%;background:var(${over ? "--red" : "--green"})"></i></div>
      <div class="muted num" style="font-size:12px">${g.key === "income" ? (g.remaining > 0 ? `${money(g.remaining)} still expected` : "Target reached ✓")
        : over ? `⚠ ${money(-g.remaining)} over budget` : `${money(g.remaining)} left`}</div></div>`;
  }).join("");

  const overList = d.over_budget.length ? d.over_budget.map((c) => `
    <div class="list-row" data-open-cat="${c.id}"><span>${esc(c.emoji)}</span><span class="lr-name">${esc(c.name)}</span>
      <span class="pill bad">${c.planned ? `${money(c.actual - c.planned)} over` : `${money(c.actual)} unbudgeted`}</span></div>`).join("")
    : `<div class="muted">Nothing over budget 🎉</div>`;

  const merchants = d.top_merchants.length ? d.top_merchants.map((m) => `
    <div class="list-row" data-merchant="${esc(m.merchant)}"><span class="lr-name">${esc(m.merchant)}</span>
      <span class="muted" style="font-size:12px">${m.count}×</span><span class="num">${money(m.total)}</span></div>`).join("")
    : `<div class="muted">No spending yet this month.</div>`;

  view.innerHTML = `
    ${d.uncategorized.count ? `<div class="banner warn"><span class="big">🏷️</span><div style="flex:1">${d.uncategorized.count} transaction(s) need a category.</div><button class="btn small" data-action="review-uncat">Review</button></div>` : ""}
    <div class="kpis">
      <div class="kpi"><div class="k">Income</div><div class="v">${money(t.income_actual)}</div><div class="s">${delta(t.income_actual, p.income_actual, true)}</div></div>
      <div class="kpi"><div class="k">Spending</div><div class="v">${money(t.expense_actual)}</div><div class="s">${delta(t.expense_actual, p.expense_actual, false)}</div></div>
      <div class="kpi"><div class="k">Net saved</div><div class="v ${t.net_actual < 0 ? "neg" : ""}">${money(t.net_actual)}</div><div class="s">${t.savings_rate != null ? `${t.savings_rate}% of income` : "—"}</div></div>
      <div class="kpi"><div class="k">Budget left</div><div class="v ${t.expense_remaining < 0 ? "neg" : ""}">${money(t.expense_remaining)}</div><div class="s">${money(t.expense_actual)} of ${money(t.expense_planned)} spent</div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><h3>Where the money went</h3><div class="desc">Spending by category · click a bar to see its transactions</div>
        <div class="chart-box" style="height:${Math.max(160, Math.min(d.by_category.length, 12) * 30 + 30)}px"><canvas id="cat-chart" aria-label="Spending by category"></canvas></div>
        ${d.by_category.length > 12 ? `<div class="muted" style="font-size:12px;margin-top:6px">Top 12 of ${d.by_category.length} categories shown.</div>` : ""}
        ${d.by_category.length ? "" : `<div class="muted">No spending recorded this month.</div>`}</div>
      <div><div class="panel"><h3>Budget progress</h3><div class="desc">Actual vs. planned by section</div>${groupMeters}</div>
        <div class="panel"><h3>Over budget</h3><div class="desc">Categories that need attention</div>${overList}</div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><h3>Income vs. spending</h3><div class="desc">Last 6 months · click a month to open it</div>
        <div class="legend"><span><i style="background:var(--series-1)"></i>Income</span><span><i style="background:var(--series-2)"></i>Spending</span></div>
        <div class="chart-box" style="height:240px"><canvas id="trend-chart" aria-label="Income and spending by month"></canvas></div></div>
      <div class="panel"><h3>Top merchants</h3><div class="desc">Where you spent the most this month</div>${merchants}</div>
    </div>`;

  $$("[data-open-cat]", view).forEach((el) => el.onclick = () => {
    const c = state.meta.categories.find((x) => String(x.id) === el.dataset.openCat);
    openTxnDrawer({ title: `${c.emoji} ${c.name}`, category_id: c.id });
  });
  $$("[data-open-group]", view).forEach((el) => el.onclick = () => {
    const g = d.groups.find((x) => x.key === el.dataset.openGroup);
    openTxnDrawer({ title: g.label, grp: g.key });
  });
  $$("[data-merchant]", view).forEach((el) => el.onclick = () => openTxnDrawer({ title: el.dataset.merchant, q: el.dataset.merchant }));
  bindActions(view);
  drawCharts(d);
}

function drawCharts(d) {
  if (!window.Chart) {
    $$(".chart-box").forEach((b) => b.innerHTML = `<div class="muted">The chart library couldn't load. Try reloading the page.</div>`);
    return;
  }
  const ink2 = cssVar("--ink-2"), line = cssVar("--line"), s1 = cssVar("--series-1"), s2 = cssVar("--series-2"), card = cssVar("--card");
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = ink2;
  const tooltip = { backgroundColor: cssVar("--ink"), titleColor: cssVar("--bg"), bodyColor: cssVar("--bg"), padding: 10, displayColors: false };

  const cats = d.by_category.slice(0, 12);
  if (cats.length) {
    state.charts.push(new Chart($("#cat-chart"), {
      type: "bar",
      data: { labels: cats.map((c) => `${c.emoji} ${c.name}`), datasets: [{ data: cats.map((c) => c.actual), backgroundColor: s1, borderRadius: 4, borderSkipped: "start", maxBarThickness: 18 }] },
      options: {
        indexAxis: "y", maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: {
          label: (ctx) => { const c = cats[ctx.dataIndex]; return c.planned ? `${money(c.actual)} of ${money(c.planned)} planned` : `${money(c.actual)} (no budget set)`; } } } },
        scales: {
          x: { grid: { color: line }, border: { display: false }, ticks: { callback: (v) => money(v), maxRotation: 0, maxTicksLimit: 5 } },
          y: { grid: { display: false }, border: { display: false } },
        },
        onClick: (_e, els) => { if (els.length) { const c = cats[els[0].index]; openTxnDrawer({ title: `${c.emoji} ${c.name}`, category_id: c.id }); } },
        onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
      },
    }));
  }

  state.charts.push(new Chart($("#trend-chart"), {
    type: "bar",
    data: {
      labels: d.trend.map((r) => r.label),
      datasets: [
        { label: "Income", data: d.trend.map((r) => r.income), backgroundColor: s1, borderRadius: 4, borderColor: card, borderWidth: { left: 1, right: 1 }, maxBarThickness: 26 },
        { label: "Spending", data: d.trend.map((r) => r.expenses), backgroundColor: s2, borderRadius: 4, borderColor: card, borderWidth: { left: 1, right: 1 }, maxBarThickness: 26 },
      ],
    },
    options: {
      maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...tooltip, displayColors: true, callbacks: {
        label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}`,
        afterBody: (items) => { const r = d.trend[items[0].dataIndex]; return `Net: ${money(r.income - r.expenses)}`; } } } },
      scales: {
        y: { grid: { color: line }, border: { display: false }, ticks: { callback: (v) => money(v), maxTicksLimit: 5 } },
        x: { grid: { display: false }, border: { color: line } },
      },
      onClick: (_e, els) => { if (els.length) setMonth(d.trend[els[0].index].month); },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
    },
  }));
}

// ------------------------------------------------------------------ transactions view

async function renderTransactions(view) {
  const f = state.txnFilters;
  const params = new URLSearchParams();
  if (!f.all) params.set("month", state.month);
  if (f.q) params.set("q", f.q);
  if (f.category_id) params.set("category_id", f.category_id);
  if (f.grp) params.set("grp", f.grp);
  if (f.uncategorized) params.set("uncategorized", "true");
  const txns = await api(`/api/transactions?${params}`);
  const out = txns.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const inn = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  view.innerHTML = `
    <div class="filters">
      <input class="input" id="f-q" placeholder="Search description or notes…" value="${esc(f.q)}" style="flex:1;min-width:180px">
      <select class="select" id="f-cat">${categoryOptions(f.category_id, { includeAll: true })}</select>
      <select class="select" id="f-grp"><option value="">All sections</option>${state.meta.groups.map((g) => `<option value="${g.key}" ${f.grp === g.key ? "selected" : ""}>${esc(g.label)}</option>`).join("")}</select>
      <label class="muted" style="font-size:14px"><input type="checkbox" id="f-all" ${f.all ? "checked" : ""}> All months</label>
      <label class="muted" style="font-size:14px"><input type="checkbox" id="f-unc" ${f.uncategorized ? "checked" : ""}> Needs category</label>
      <button class="btn" id="add-txn">＋ Add</button>
    </div>
    <div class="muted" style="font-size:14px;margin-bottom:8px">${txns.length} transactions · <span class="num">${money(out, { cents: true })}</span> out · <span class="num">${money(inn, { cents: true })}</span> in</div>
    <label class="muted" style="font-size:13px;display:flex;gap:6px;align-items:center;margin-bottom:8px">
      <input type="checkbox" id="remember" checked> When I change a category, remember it for that merchant (and fix its other transactions)</label>
    <div class="card">${txns.length ? txnTable(txns) : `<div class="empty"><p>No transactions match.</p><button class="btn primary" data-action="upload">Upload statement</button></div>`}</div>`;

  let timer;
  $("#f-q").oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value; render().then(() => { const el = $("#f-q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }); }, 300); };
  $("#f-cat").onchange = (e) => { f.category_id = e.target.value; render(); };
  $("#f-grp").onchange = (e) => { f.grp = e.target.value; render(); };
  $("#f-all").onchange = (e) => { f.all = e.target.checked; render(); };
  $("#f-unc").onchange = (e) => { f.uncategorized = e.target.checked; render(); };
  $("#add-txn").onclick = openAddTxn;
  bindTxnTable(view, render);
  bindActions(view);
}

function openAddTxn() {
  const today = new Date();
  const [y, m] = state.month.split("-");
  const day = `${y}-${m}-${String(Math.min(today.getDate(), 28)).padStart(2, "0")}`;
  modal("Add transaction", `
    <div class="field"><label>Date</label><input class="input" type="date" id="t-date" value="${day}"></div>
    <div class="field"><label>Description</label><input class="input" id="t-desc" placeholder="e.g. Cash to babysitter"></div>
    <div class="field"><label>Amount</label><input class="input" id="t-amt" inputmode="decimal" placeholder="45.00">
      <label class="muted" style="font-size:13px"><input type="checkbox" id="t-in"> This is money coming in (income / refund)</label></div>
    <div class="field"><label>Category</label><select class="select" id="t-cat">${categoryOptions(state.meta.categories.find((c) => c.name === "Miscellaneous")?.id)}</select></div>
    <div class="field"><label>Notes (optional)</label><input class="input" id="t-notes"></div>
    <button class="btn primary" id="t-save">Save</button>`);
  $("#t-save").onclick = async () => {
    const amt = parseMoney($("#t-amt").value);
    if (!amt || Number.isNaN(amt)) return toast("Enter an amount");
    try {
      await api("/api/transactions", { method: "POST", json: {
        date: $("#t-date").value, description: $("#t-desc").value, amount: $("#t-in").checked ? Math.abs(amt) : -Math.abs(amt),
        category_id: Number($("#t-cat").value), notes: $("#t-notes").value || null } });
      closeModal(); toast("Transaction added"); refresh();
    } catch (e) { toast(e.message); }
  };
}

function modal(title, body) {
  $("#modal-root").innerHTML = `<div class="overlay center" id="overlay"><div class="modal" role="dialog" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">${body}</div></div></div>`;
  $("#overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });
  $("#modal-root [data-close]").onclick = closeModal;
}

// ------------------------------------------------------------------ upload

function openUpload() {
  const aiOn = state.meta.ai_enabled;
  modal("Upload statements", `
    <div class="dropzone" id="drop"><div class="big">📄</div><strong>Drop statements here</strong> or click to choose
      <div class="muted" style="font-size:13px;margin-top:4px">CSV, Excel (.xlsx) or PDF · checking, savings or credit card · several at once is fine</div>
      <input type="file" id="file-in" multiple accept=".csv,.txt,.pdf,.xlsx,.xlsm" hidden></div>
    <div class="file-list" id="file-list"></div>
    <div class="field" style="margin-top:14px"><label>Account name (optional)</label><input class="input" id="acct" placeholder="e.g. Chase Sapphire, Joint Checking"></div>
    <div class="field"><label>Amount signs</label><select class="select" id="sign">
      <option value="auto">Detect automatically</option>
      <option value="purchases_negative">Purchases are negative (most banks)</option>
      <option value="purchases_positive">Purchases are positive (some credit cards)</option></select>
      <span class="hint">Only change this if spending shows up as income after uploading.</span></div>
    <div class="muted" style="font-size:13px;margin-bottom:12px">${aiOn ? "✨ AI will read the statement and categorize every transaction."
      : "AI is off, so keyword rules will categorize transactions. Add an API key in Settings for smarter AI categorization and PDF reading."}
      Re-uploading the same statement won't create duplicates.</div>
    <button class="btn primary" id="go-upload" disabled>Upload & categorize</button>
    <div id="results"></div>`);
  let files = [];
  const drop = $("#drop"), input = $("#file-in");
  const show = () => {
    $("#file-list").innerHTML = files.map((f) => `📎 ${esc(f.name)} <span class="muted">(${Math.ceil(f.size / 1024)} KB)</span>`).join("<br>");
    $("#go-upload").disabled = !files.length;
  };
  drop.onclick = () => input.click();
  input.onchange = () => { files = [...input.files]; show(); };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("drag"); };
  drop.ondragleave = () => drop.classList.remove("drag");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("drag"); files = [...e.dataTransfer.files]; show(); };
  $("#go-upload").onclick = async () => {
    const btn = $("#go-upload");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${aiOn ? "Reading & categorizing… (can take a minute)" : "Processing…"}`;
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("account", $("#acct").value);
    fd.append("sign", $("#sign").value);
    try {
      const r = await api("/api/upload", { method: "POST", body: fd });
      const months = [...new Set(r.results.flatMap((x) => x.months || []))].sort();
      $("#results").innerHTML = r.results.map((x) => x.error
        ? `<div class="result err">❌ <strong>${esc(x.file)}</strong>: ${esc(x.error)}</div>`
        : `<div class="result">✅ <strong>${esc(x.file)}</strong>: added ${x.added} transaction${x.added === 1 ? "" : "s"}${x.skipped ? `, skipped ${x.skipped} already imported` : ""}.
           <div class="muted" style="font-size:12px">Categorized by: ${Object.entries(x.categorized_by).map(([k, v]) => `${v} ${k === "ai" ? "AI" : k === "rule" ? "your saved rules" : "keywords"}`).join(", ")}</div>
           ${(x.warnings || []).map((w) => `<div class="muted" style="font-size:12px">⚠ ${esc(w)}</div>`).join("")}</div>`).join("")
        + (months.length ? `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">${months.slice(-4).map((m) => `<button class="btn small" data-goto="${m}">View ${monthLabel(m)}</button>`).join("")}</div>` : "");
      $$("[data-goto]").forEach((b) => b.onclick = () => { closeModal(); setMonth(b.dataset.goto); });
      btn.textContent = "Done";
      await loadMeta();
      if (months.length) { state.month = months[months.length - 1]; savePref("month", state.month); loadChat(); }
      state.dirty = true;
    } catch (e) {
      $("#results").innerHTML = `<div class="result err">❌ ${esc(e.message)}</div>`;
      btn.disabled = false; btn.textContent = "Try again";
    }
  };
}

// ------------------------------------------------------------------ export

async function doExport(kind) {
  $("#export-menu").classList.add("hidden");
  const m = state.month;
  if (kind === "pdf") return (location.href = `/api/export/pdf?month=${m}`);
  if (kind === "xlsx") return (location.href = `/api/export/xlsx?month=${m}`);
  if (kind === "csv") return (location.href = `/api/export/csv?month=${m}`);
  if (kind === "gsheets") {
    if (!state.meta.google_sheets) {
      modal("Export to Google Sheets", `
        <p>Two ways to get your budget into Google Sheets:</p>
        <p><strong>1. Quick (no setup):</strong> download the spreadsheet, then in Google Sheets choose <em>File → Import → Upload</em>. You'll get Summary, Transactions and 12-Month Trend tabs.</p>
        <button class="btn primary" id="dl-xlsx">⬇ Download spreadsheet</button>
        <p style="margin-top:18px"><strong>2. One-click export:</strong> connect a Google service account once (see <em>README → Google Sheets</em>), and this button will create the Google Sheet for you and share it with your email.</p>`);
      $("#dl-xlsx").onclick = () => { location.href = `/api/export/xlsx?month=${m}`; closeModal(); };
      return;
    }
    toast("Creating Google Sheet…", 10000);
    try {
      const r = await api(`/api/export/gsheets?month=${m}`, { method: "POST" });
      modal("Google Sheet created", `<p>Your budget for ${monthLabel(m)} is ready.</p><a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener">Open in Google Sheets ↗</a>`);
    } catch (e) { toast(e.message, 6000); }
  }
}

// ------------------------------------------------------------------ settings

async function renderSettings(view) {
  const [s, uploads] = await Promise.all([api("/api/settings"), api("/api/uploads")]);
  const cats = state.meta.categories;
  const groupSel = (c) => `<select class="select" data-cat-grp="${c.id}" style="padding:5px 8px">${state.meta.groups.map((g) => `<option value="${g.key}" ${g.key === c.grp ? "selected" : ""}>${esc(g.label)}</option>`).join("")}</select>`;

  view.innerHTML = `
    <div class="settings-grid" style="margin-top:8px">
      <div>
        <div class="panel"><h3>Household</h3><div class="desc">Shown in the app and on exported reports.</div>
          <div class="field"><label>Family name</label><input class="input" id="s-family" value="${esc(s.family_name)}"></div>
          <button class="btn primary" id="s-save-family">Save</button></div>

        <div class="panel"><h3>✨ AI features</h3>
          <div class="desc">Powers statement reading, smart categorization and the budget assistant. Uses your own Anthropic API key
            (<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">get one here</a>). The key is stored only in your local database.</div>
          <div style="margin-bottom:10px">Status: ${state.meta.ai_enabled ? `<span class="pill good">On</span> ${s.api_key_from_env ? "(key from ANTHROPIC_API_KEY)" : `key ${esc(s.api_key_hint || "")}`}` : `<span class="pill zero">Off</span>`}</div>
          <div class="field"><label>Anthropic API key</label><input class="input" id="s-key" type="password" placeholder="sk-ant-…" autocomplete="off"></div>
          <button class="btn primary" id="s-save-key">Save key</button> ${s.api_key_saved ? `<button class="btn danger" id="s-clear-key">Remove key</button>` : ""}</div>

        <div class="panel"><h3>🟩 Google Sheets</h3>
          <div class="desc">${s.google_sheets ? "Connected — Export → Send to Google Sheets creates a new sheet." : "Not connected. You can always use Export → Excel / Google Sheets file and import it. For one-click export, follow README → Google Sheets."}</div>
          <div class="field"><label>Share new sheets with (your Google email)</label><input class="input" id="s-gemail" type="email" value="${esc(s.google_share_email)}" placeholder="you@gmail.com"></div>
          <button class="btn" id="s-save-gemail">Save</button></div>

        <div class="panel"><h3>Statements uploaded</h3><div class="desc">Removing an upload deletes the transactions it added.</div>
          ${uploads.length ? uploads.map((u) => `<div class="cat-row"><div style="flex:1;min-width:0"><div class="txn-desc" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.filename)}</div>
            <div class="txn-sub">${esc(u.account || "")} · ${u.added} added${u.first_date ? ` · ${fmtDate(u.first_date)} – ${fmtDate(u.last_date)}` : ""} · ${esc(u.uploaded_at.slice(0, 10))}</div></div>
            <button class="btn small danger" data-del-upload="${u.id}">Remove</button></div>`).join("") : `<div class="muted">No uploads yet.</div>`}</div>

        <div class="panel"><h3>Your data</h3><div class="desc">Everything is saved in <code>family-budget/data/budget.db</code> on this computer. Back up that file to keep your history safe.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a class="btn" href="/api/export/csv">⬇ All transactions (CSV)</a>
            <button class="btn" data-action="demo">Load demo data</button>
            <button class="btn danger" id="s-reset">Delete all data</button></div></div>
      </div>

      <div class="panel"><h3>Categories</h3><div class="desc">Rename, change the emoji, or move a category between sections. Changes apply to all months.</div>
        ${state.meta.groups.map((g) => `<div style="margin-top:14px"><strong>${esc(g.label)}</strong>
          ${cats.filter((c) => c.grp === g.key).map((c) => `<div class="cat-row">
            <input class="input emoji-in" data-cat-emoji="${c.id}" value="${esc(c.emoji)}" aria-label="Emoji">
            <input class="input" style="flex:1" data-cat-name="${c.id}" value="${esc(c.name)}" aria-label="Name">
            ${groupSel(c)}
            <button class="del" data-cat-del="${c.id}" title="Delete category">✕</button></div>`).join("")}</div>`).join("")}
        <div style="margin-top:18px"><strong>Add a category</strong>
          <div class="cat-row"><input class="input emoji-in" id="n-emoji" value="🏷️"><input class="input" style="flex:1" id="n-name" placeholder="e.g. Babysitting">
            <select class="select" id="n-grp" style="padding:5px 8px">${state.meta.groups.map((g) => `<option value="${g.key}" ${g.key === "flexible" ? "selected" : ""}>${esc(g.label)}</option>`).join("")}</select>
            <button class="btn small primary" id="n-add">Add</button></div></div>
      </div>
    </div>`;

  const saveSettings = async (json, msg) => {
    try { await api("/api/settings", { method: "PUT", json }); toast(msg); await refresh(); } catch (e) { toast(e.message); }
  };
  $("#s-save-family").onclick = () => saveSettings({ family_name: $("#s-family").value }, "Saved");
  $("#s-save-key").onclick = () => { const k = $("#s-key").value.trim(); if (!k) return toast("Paste your key first"); saveSettings({ anthropic_api_key: k }, "API key saved — AI features are on"); renderChatEmpty(); };
  if ($("#s-clear-key")) $("#s-clear-key").onclick = () => saveSettings({ anthropic_api_key: "" }, "API key removed");
  $("#s-save-gemail").onclick = () => saveSettings({ google_share_email: $("#s-gemail").value }, "Saved");
  $("#s-reset").onclick = async () => {
    if (!confirm("Delete ALL transactions, budgets, uploads and chat history? Categories and settings are kept. This can't be undone.")) return;
    await api("/api/all-data", { method: "DELETE" }); toast("All data deleted"); refresh();
  };
  $$("[data-del-upload]", view).forEach((b) => b.onclick = async () => {
    if (!confirm("Remove this upload and its transactions?")) return;
    const r = await api(`/api/uploads/${b.dataset.delUpload}`, { method: "DELETE" });
    toast(`Removed ${r.deleted} transactions`); refresh();
  });
  const patchCat = async (id, json) => { try { await api(`/api/categories/${id}`, { method: "PATCH", json }); await loadMeta(); toast("Category updated"); } catch (e) { toast(e.message); } };
  $$("[data-cat-name]", view).forEach((i) => i.onchange = () => patchCat(i.dataset.catName, { name: i.value }));
  $$("[data-cat-emoji]", view).forEach((i) => i.onchange = () => patchCat(i.dataset.catEmoji, { emoji: i.value }));
  $$("[data-cat-grp]", view).forEach((i) => i.onchange = async () => { await patchCat(i.dataset.catGrp, { grp: i.value }); render(); });
  $$("[data-cat-del]", view).forEach((b) => b.onclick = async () => {
    if (!confirm("Delete this category? Its transactions move to Uncategorized.")) return;
    try { await api(`/api/categories/${b.dataset.catDel}`, { method: "DELETE" }); refresh(); } catch (e) { toast(e.message); }
  });
  $("#n-add").onclick = async () => {
    try { await api("/api/categories", { method: "POST", json: { name: $("#n-name").value, emoji: $("#n-emoji").value, grp: $("#n-grp").value } }); toast("Category added"); refresh(); }
    catch (e) { toast(e.message); }
  };
  bindActions(view);
}

// ------------------------------------------------------------------ AI assistant

const STARTERS = [
  "How did we do this month?",
  "Where did we overspend, and by how much?",
  "What are our biggest expenses?",
  "How does this month compare to last month?",
  "What recurring charges or subscriptions do we have?",
  "How could we save $500 next month?",
  "Are we on track for the rest of the month?",
];
const FOLLOW_UPS = ["Which categories should we cut first?", "Suggest a realistic budget for next month", "Any unusual or one-off charges?", "What's our savings rate trend?"];

function setupChat() {
  const panel = $("#ai-panel");
  const open = loadPref("aiOpen", window.innerWidth > 1100);
  panel.classList.toggle("closed", !open);
  $("#ai-toggle").onclick = () => { const closed = panel.classList.toggle("closed"); savePref("aiOpen", !closed); if (!closed) $("#ai-text").focus(); };
  $("#ai-close").onclick = () => { panel.classList.add("closed"); savePref("aiOpen", false); };
  $("#ai-clear").onclick = async () => { await api(`/api/chat?month=${state.month}`, { method: "DELETE" }); loadChat(); };
  const ta = $("#ai-text");
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 140) + "px"; });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#ai-form").requestSubmit(); } });
  $("#ai-form").onsubmit = (e) => { e.preventDefault(); const q = ta.value.trim(); if (q) { ta.value = ""; ta.style.height = "auto"; ask(q); } };
  loadChat();
}

function renderChatEmpty() {
  const box = $("#ai-msgs");
  const aiOn = state.meta.ai_enabled;
  box.innerHTML = `<div class="msg assistant"><p>Hi! I'm your budget assistant for <strong>${monthLabel(state.month)}</strong>. I can see your budget, spending and transactions — ask me anything.</p></div>
    ${aiOn ? `<div class="chips">${STARTERS.map((s) => `<button class="chip">${esc(s)}</button>`).join("")}</div>`
      : `<div class="msg assistant"><p>To turn me on, add your Anthropic API key in <strong>Settings</strong>.</p><p><button class="btn small" id="ai-go-settings">Open Settings</button></p></div>`}`;
  $$(".chip", box).forEach((c) => c.onclick = () => ask(c.textContent));
  if ($("#ai-go-settings")) $("#ai-go-settings").onclick = () => go("settings");
}

async function loadChat() {
  const box = $("#ai-msgs");
  let msgs = [];
  try { msgs = await api(`/api/chat?month=${state.month}`); } catch { /* ignore */ }
  if (!msgs.length) return renderChatEmpty();
  box.innerHTML = msgs.map((m) => `<div class="msg ${m.role}">${m.role === "assistant" ? renderMarkdown(m.content) : esc(m.content)}</div>`).join("");
  appendFollowUps();
  box.scrollTop = box.scrollHeight;
}

function appendFollowUps() {
  const box = $("#ai-msgs");
  $$(".chips", box).forEach((c) => c.remove());
  const picks = FOLLOW_UPS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  box.insertAdjacentHTML("beforeend", `<div class="chips">${picks.map((s) => `<button class="chip">${esc(s)}</button>`).join("")}</div>`);
  $$(".chips .chip", box).forEach((c) => c.onclick = () => ask(c.textContent));
}

async function ask(question) {
  if (state.chatBusy) return;
  const panel = $("#ai-panel");
  if (panel.classList.contains("closed")) { panel.classList.remove("closed"); savePref("aiOpen", true); }
  const box = $("#ai-msgs");
  $$(".chips", box).forEach((c) => c.remove());
  box.insertAdjacentHTML("beforeend", `<div class="msg user">${esc(question)}</div><div class="msg assistant" id="ai-live"><span class="spinner"></span></div>`);
  box.scrollTop = box.scrollHeight;
  const live = $("#ai-live");
  live.removeAttribute("id");
  state.chatBusy = true;
  $("#ai-send").disabled = true;
  let text = "";
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: state.month, message: question }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      live.innerHTML = renderMarkdown(text);
      box.scrollTop = box.scrollHeight;
    }
    if (!text) live.innerHTML = `<p class="muted">No answer came back. Try again?</p>`;
  } catch (e) {
    live.innerHTML = `<p>⚠️ ${esc(e.message)}</p>`;
  } finally {
    state.chatBusy = false;
    $("#ai-send").disabled = false;
    if (state.meta.ai_enabled) appendFollowUps();
    box.scrollTop = box.scrollHeight;
  }
}

boot();
