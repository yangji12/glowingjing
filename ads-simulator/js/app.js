/* AdSim application: routing, views, form binding, charts and actions. */
(function () {
  'use strict';
  var A = window.AdSim;
  var U = A.util, D = A.data, M = A.model, E = A.engine, SC = A.scoring, P = A.previews;
  var esc = P.esc;
  var KEY = 'adsim.state.v1';

  var S = load();
  var UI = { route: 'overview', params: [], combo: 0, device: 'desktop', round: null, reportTab: 'campaigns', newCamp: null, sort: {}, scan: { status: '' }, csv: '', stFilter: 'all' };
  var LIVE = {};
  var TABLES = {};
  var CHARTS = {};

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return M.migrate(JSON.parse(raw));
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
    return M.newState();
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save to browser storage — use Settings → Export to keep your work.'); }
    }, 250);
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function fInt(n) { return Math.round(n || 0).toLocaleString(); }
  function fMoney(n) { n = Number(n) || 0; return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fMoney0(n) { n = Math.round(Number(n) || 0); return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(); }
  function fPct(n, d) { return ((Number(n) || 0) * 100).toFixed(d == null ? 2 : d) + '%'; }
  function fX(n) { return (Number(n) || 0).toFixed(2) + '×'; }
  function fNum(n, d) { return (Number(n) || 0).toFixed(d == null ? 1 : d); }

  // ---------------------------------------------------------------------------
  // Paths & binding
  // ---------------------------------------------------------------------------

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, val) {
    var keys = path.split('.');
    var o = obj;
    for (var i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = val;
  }

  function attrs(o) {
    return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== false; }).map(function (k) { return o[k] === true ? k : k + '="' + esc(o[k]) + '"'; }).join(' ');
  }

  function input(path, opts) {
    opts = opts || {};
    var v = getPath(S, path);
    if (opts.type === 'percent') v = Math.round((Number(v) || 0) * 1000) / 10;
    var a = attrs({
      type: opts.type === 'number' || opts.type === 'percent' ? 'number' : opts.inputType || 'text',
      'data-bind': path, 'data-type': opts.type, value: v == null ? '' : v, placeholder: opts.placeholder,
      maxlength: opts.hardMax, min: opts.min, max: opts.maxVal, step: opts.step, class: opts.cls, 'data-max': opts.max,
      'aria-label': opts.aria || opts.placeholder, 'data-rerender': opts.rerender ? '1' : null, id: opts.id
    });
    var el = '<input ' + a + '>';
    if (opts.max) {
      var len = String(v || '').length;
      var issues = opts.policy ? M.policyIssues(String(v || ''), opts.policy) : [];
      el = '<div class="counted' + (len > opts.max ? ' over' : '') + (issues.length ? ' policy' : '') + '">' + el + '<span class="counter">' + len + '/' + opts.max + '</span>' +
        '<span class="policy-flag" title="' + esc(issues[0] || '') + '">' + (issues.length ? '⚠ ' + esc(issues[0]) : '') + '</span></div>';
    }
    return el;
  }
  function textarea(path, opts) {
    opts = opts || {};
    var v = getPath(S, path) || '';
    return '<textarea ' + attrs({ 'data-bind': path, rows: opts.rows || 4, placeholder: opts.placeholder, 'aria-label': opts.aria || opts.placeholder, 'data-max': opts.max, class: opts.cls }) + '>' + esc(v) + '</textarea>' +
      (opts.max ? '<span class="counter block">' + String(v).length + '/' + opts.max + '</span>' : '');
  }
  function select(path, options, opts) {
    opts = opts || {};
    var v = getPath(S, path);
    return '<select ' + attrs({ 'data-bind': path, 'data-type': opts.type, 'aria-label': opts.aria }) + '>' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function checkbox(path, label, help) {
    var v = !!getPath(S, path);
    return '<label class="check"><input type="checkbox" data-bind="' + esc(path) + '" data-type="bool"' + (v ? ' checked' : '') + '> <span>' + label + (help ? '<small>' + help + '</small>' : '') + '</span></label>';
  }
  function arrayCheck(path, value, label, extra) {
    var arr = getPath(S, path) || [];
    return '<label class="check"><input type="checkbox" data-bind-array="' + esc(path) + '" value="' + esc(value) + '"' + (arr.indexOf(value) >= 0 ? ' checked' : '') + '> <span>' + label + (extra || '') + '</span></label>';
  }
  function radio(path, value, label, help) {
    var v = getPath(S, path);
    return '<label class="check"><input type="radio" name="' + esc(path) + '" data-bind="' + esc(path) + '" value="' + esc(value) + '"' + (String(v) === String(value) ? ' checked' : '') + '> <span>' + label + (help ? '<small>' + help + '</small>' : '') + '</span></label>';
  }
  function field(label, control, help, cls) {
    return '<div class="field ' + (cls || '') + '"><label class="lbl">' + label + '</label>' + control + (help ? '<div class="help">' + help + '</div>' : '') + '</div>';
  }
  function live(name, fn) {
    LIVE[name] = fn;
    return '<div data-live="' + esc(name) + '">' + fn() + '</div>';
  }
  function btn(label, action, args, cls) {
    return '<button type="button" class="btn ' + (cls || '') + '" data-action="' + action + '"' + (args != null ? ' data-args="' + esc(JSON.stringify(args)) + '"' : '') + '>' + label + '</button>';
  }
  function guideLink(id) {
    var g = D.GUIDE_INDEX[id];
    return g ? '<a class="guide-link" href="#/guidelines/' + id + '" title="' + esc(g.title) + '">📘 ' + id + '</a>' : '';
  }
  function statusChip(status) {
    var map = { pass: ['good', '✓', 'Pass'], warn: ['warning', '!', 'Improve'], fail: ['critical', '✕', 'Fix'] };
    var m = map[status] || map.warn;
    return '<span class="chip ' + m[0] + '"><b>' + m[1] + '</b> ' + m[2] + '</span>';
  }
  var SEV = {
    critical: ['critical', '✕', 'Critical'], warning: ['serious', '!', 'Warning'], opportunity: ['info', '↗', 'Opportunity'],
    info: ['neutral', 'i', 'Note'], success: ['good', '✓', 'Well done']
  };
  function sevChip(s) { var m = SEV[s] || SEV.info; return '<span class="chip ' + m[0] + '"><b>' + m[1] + '</b> ' + m[2] + '</span>'; }

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  // ---------------------------------------------------------------------------
  // Charts (inline SVG, hover tooltip)
  // ---------------------------------------------------------------------------

  function lineChart(id, pts, opts) {
    opts = opts || {};
    var W = 560, H = opts.height || 180, pl = 48, pr = 12, pt = 14, pb = 26;
    var max = Math.max.apply(null, pts.map(function (p) { return p.y; }).concat([opts.min || 0.0001])) * 1.1;
    var x = function (i) { return pl + (pts.length <= 1 ? 0 : i * (W - pl - pr) / (pts.length - 1)); };
    var y = function (v) { return pt + (H - pt - pb) * (1 - v / max); };
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1); }).join(' ');
    var area = d + ' L' + x(pts.length - 1).toFixed(1) + ' ' + y(0) + ' L' + x(0) + ' ' + y(0) + ' Z';
    var grid = '';
    for (var g = 0; g <= 3; g++) {
      var gv = max / 1.1 * g / 3;
      grid += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" class="grid"/><text x="' + (pl - 6) + '" y="' + (y(gv) + 4) + '" class="axis" text-anchor="end">' + esc(opts.fmtAxis ? opts.fmtAxis(gv) : Math.round(gv)) + '</text>';
    }
    var step = Math.ceil(pts.length / 8);
    var labels = pts.map(function (p, i) { return (i % step === 0 || (i === pts.length - 1 && i % step >= step / 2)) ? '<text x="' + x(i) + '" y="' + (H - 8) + '" class="axis" text-anchor="middle">' + esc(p.label) + '</text>' : ''; }).join('');
    CHARTS[id] = { pts: pts, x: x, y: y, W: W, H: H, fmt: opts.fmt || fInt, name: opts.name || '' };
    return '<div class="chart" data-chart="' + esc(id) + '"><div class="chart-title">' + esc(opts.title || '') + '</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.title || 'chart') + '">' + grid +
      '<path d="' + area + '" class="area" style="fill:var(' + (opts.color || '--series-1') + ')"/>' +
      '<path d="' + d + '" class="line" style="stroke:var(' + (opts.color || '--series-1') + ')"/>' + labels +
      '<line class="xhair" x1="0" x2="0" y1="' + pt + '" y2="' + (H - pb) + '" style="display:none"/><circle class="dot" r="4" style="display:none;fill:var(' + (opts.color || '--series-1') + ')"/>' +
      '<rect x="' + pl + '" y="0" width="' + (W - pl - pr) + '" height="' + H + '" fill="transparent" class="hit"/></svg><div class="tip" style="display:none"></div></div>';
  }

  function onChartMove(e) {
    var wrap = e.target.closest('.chart');
    if (!wrap) return;
    var c = CHARTS[wrap.dataset.chart];
    if (!c) return;
    var svg = wrap.querySelector('svg');
    var r = svg.getBoundingClientRect();
    var sx = (e.clientX - r.left) / r.width * c.W;
    var best = 0, bd = Infinity;
    c.pts.forEach(function (p, i) { var dd = Math.abs(c.x(i) - sx); if (dd < bd) { bd = dd; best = i; } });
    var p = c.pts[best];
    var xh = svg.querySelector('.xhair'), dot = svg.querySelector('.dot'), tip = wrap.querySelector('.tip');
    xh.setAttribute('x1', c.x(best)); xh.setAttribute('x2', c.x(best)); xh.style.display = '';
    dot.setAttribute('cx', c.x(best)); dot.setAttribute('cy', c.y(p.y)); dot.style.display = '';
    tip.innerHTML = '<b>' + esc(p.label) + '</b><br>' + esc(c.name) + ': ' + esc(c.fmt(p.y));
    tip.style.display = '';
    var px = c.x(best) / c.W * r.width;
    tip.style.left = Math.min(Math.max(px - 60, 0), r.width - 130) + 'px';
  }
  function onChartLeave(e) {
    var wrap = e.target.closest && e.target.closest('.chart');
    if (!wrap) return;
    wrap.querySelectorAll('.xhair,.dot,.tip').forEach(function (n) { n.style.display = 'none'; });
  }

  function barRow(label, value, max, text, cls) {
    var w = max ? U.clamp(value / max, 0, 1) * 100 : 0;
    return '<div class="barrow"><div class="barlabel">' + label + '</div><div class="bartrack"><div class="barfill ' + (cls || '') + '" style="width:' + w.toFixed(1) + '%"></div></div><div class="barval">' + text + '</div></div>';
  }

  function ring(score, label, size) {
    size = size || 120;
    var r = size / 2 - 9, c = 2 * Math.PI * r, v = U.clamp(score / 100, 0, 1);
    return '<div class="ring" style="width:' + size + 'px"><svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-bg"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="ring-fg" stroke-dasharray="' + (c * v).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>' +
      '<div class="ring-text"><b>' + Math.round(score) + '</b><span>' + esc(label) + '</span></div></div>';
  }

  // ---------------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------------

  function dataTable(id, cols, rows, opts) {
    opts = opts || {};
    TABLES[id] = { cols: cols, rows: rows };
    var st = UI.sort[id];
    if (st) {
      var col = cols.find(function (c) { return c.key === st.key; });
      if (col) {
        var val = col.sort || function (r) { return r[col.key]; };
        rows = rows.slice().sort(function (a, b) { var x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; });
      }
    }
    if (!rows.length) return '<div class="empty">' + (opts.empty || 'No data for this round.') + '</div>';
    var totals = opts.totals ? '<tfoot><tr>' + cols.map(function (c, i) { return '<td class="' + (c.num ? 'num' : '') + '">' + (opts.totals[c.key] != null ? opts.totals[c.key] : i === 0 ? 'Total' : '') + '</td>'; }).join('') + '</tr></tfoot>' : '';
    return '<div class="table-tools">' + btn('⬇ CSV', 'exportCsv', id, 'small ghost') + '</div><div class="table-wrap"><table class="data"><thead><tr>' + cols.map(function (c) {
      var arrow = st && st.key === c.key ? (st.dir > 0 ? ' ▲' : ' ▼') : '';
      return '<th class="' + (c.num ? 'num' : '') + '" data-action="sort" data-args="' + esc(JSON.stringify([id, c.key])) + '" title="' + esc(c.title || 'Sort') + '">' + esc(c.label) + arrow + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      return '<tr class="' + (opts.rowClass ? opts.rowClass(r) : '') + '">' + cols.map(function (c) { return '<td class="' + (c.num ? 'num' : '') + '">' + (c.fmt ? c.fmt(r) : esc(r[c.key])) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody>' + totals + '</table></div>';
  }

  function csvOf(id) {
    var t = TABLES[id];
    if (!t) return '';
    var strip = function (h) { var d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); };
    var lines = [t.cols.map(function (c) { return '"' + c.label.replace(/"/g, '""') + '"'; }).join(',')];
    t.rows.forEach(function (r) {
      lines.push(t.cols.map(function (c) {
        var v = c.csv ? c.csv(r) : c.fmt ? strip(c.fmt(r)) : r[c.key];
        return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      }).join(','));
    });
    return lines.join('\n');
  }

  var FRAMED = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  // Two-click confirmation inside the page (browser confirm() dialogs are not available everywhere).
  function armed(el, label) {
    if (el.dataset.armed) return true;
    el.dataset.armed = '1';
    var orig = el.innerHTML;
    el.innerHTML = label || 'Click again to confirm';
    el.classList.add('armed');
    setTimeout(function () { if (el.isConnected) { delete el.dataset.armed; el.innerHTML = orig; el.classList.remove('armed'); } }, 4000);
    return false;
  }

  function showText(title, text) {
    var box = document.getElementById('textbox');
    box.querySelector('h3').textContent = title;
    box.querySelector('textarea').value = text;
    box.hidden = false;
    box.querySelector('textarea').select();
  }

  // When published as a claude.ai page, files are saved through the viewer's download prompt.
  var downloadsReady = window.claude && typeof window.claude.use === 'function' ? window.claude.use('downloads').catch(function () { return null; }) : Promise.resolve(null);

  function saveFramed(name, data, fallbackText) {
    return downloadsReady.then(function (dl) {
      if (!dl) {
        if (fallbackText != null) showText(name, fallbackText);
        else toast('Downloads are not available in this view.');
        return;
      }
      return dl.save({ filename: name, data: data }).then(function () { toast('Saved ' + name); }, function (err) {
        var code = err && err.code;
        if (code === 'declined') return;
        if (code === 'rate_limited') { toast('A save prompt is already open.'); return; }
        if (fallbackText != null) showText(name, fallbackText);
        else toast('Could not save the file here (' + (code || 'unavailable') + ').');
      });
    });
  }

  function download(name, text, type) {
    if (FRAMED) {
      // embedded pages cannot start downloads themselves; fall back to copyable text
      saveFramed(name, text, text);
      return;
    }
    var blob = new Blob([text], { type: type || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  function campIndex(id) { return S.campaigns.findIndex(function (c) { return c.id === id; }); }
  function campById(id) { return S.campaigns.find(function (c) { return c.id === id; }); }
  function currentRound() {
    if (!S.rounds.length) return null;
    var n = UI.round || S.rounds.length;
    return S.rounds[U.clamp(n, 1, S.rounds.length) - 1];
  }
  function prevRoundOf(r) { return r && r.round > 1 ? S.rounds[r.round - 2] : null; }
  function industry() { return D.INDUSTRIES[S.account.industry] || D.INDUSTRIES.retail; }
  function convCell(r, v, f) { return r && !r.tracked ? '<span class="muted" title="Conversion tracking was off">—</span>' : (f || fNum)(v, 0); }

  function roundSelect() {
    if (!S.rounds.length) return '';
    var cur = currentRound();
    return '<label class="round-select">Round <select data-action-change="selectRound" aria-label="Select round">' + S.rounds.map(function (r) {
      return '<option value="' + r.round + '"' + (r === cur ? ' selected' : '') + '>Round ' + r.round + ' — score ' + r.score.overall + ' (' + r.score.grade + ')</option>';
    }).join('') + '</select></label>';
  }

  function typeBadge(t) { var ct = D.CAMPAIGN_TYPES[t]; return '<span class="type-badge t-' + t + '">' + ct.icon + ' ' + esc(ct.name) + '</span>'; }

  function needsBusiness() {
    return !S.account.businessName || !S.account.website;
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  var NAV = [
    ['overview', '🏠', 'Overview'], ['setup', '🏢', 'Business & website'], ['campaigns', '📣', 'Campaigns'], ['feed', '🛍️', 'Product feed'],
    ['previews', '👁️', 'Ad previews'], ['simulate', '▶️', 'Run simulation'], ['reports', '📊', 'Reports'], ['feedback', '🎯', 'Score & feedback'],
    ['guidelines', '📘', 'Guidelines'], ['settings', '⚙️', 'Settings']
  ];

  function renderNav() {
    var active = UI.route === 'campaign' ? 'campaigns' : UI.route;
    document.getElementById('nav').innerHTML = '<div class="brand"><span class="brand-mark">D</span><div><b>Digital Ad Lab</b><small>Ads practice simulator</small></div></div>' +
      NAV.map(function (n) {
        var badge = n[0] === 'simulate' ? '<span class="nav-badge">R' + (S.rounds.length + 1) + '</span>' : '';
        return '<a href="#/' + n[0] + '" class="' + (active === n[0] ? 'active' : '') + '"><span class="ico" aria-hidden="true">' + n[1] + '</span>' + n[2] + badge + '</a>';
      }).join('') +
      '<div class="nav-foot">' + (S.account.businessName ? '<b>' + esc(S.account.businessName) + '</b><br>' : '') + esc(industry().name) + '<br>' + S.rounds.length + ' round(s) run</div>';
  }

  function header(title, sub, right) {
    return '<div class="page-head"><div><h1>' + title + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><div class="page-actions">' + (right || '') + '</div></div>';
  }

  // ----- Overview -----
  function viewOverview() {
    var r = S.rounds[S.rounds.length - 1];
    var h = header('Overview', S.account.businessName ? esc(S.account.businessName) + ' · ' + esc(industry().name) + ' · Goal: ' + esc(D.GOALS[S.account.goal].name) : 'Practice building Google Ads campaigns and see simulated results.');
    if (!r) {
      var steps = [
        ['1', 'Set up your business', 'Enter your business details (or pick a demo business), choose an industry, goal, and conversion value.', '#/setup', !needsBusiness()],
        ['2', 'Build campaigns', 'Create Search, Display, YouTube or Shopping campaigns. Write ads, pick keywords/audiences, set budgets and bids.', '#/campaigns', S.campaigns.length > 0],
        ['3', 'Preview your ads', 'See how your ads look on search results, websites, YouTube and Shopping.', '#/previews', false],
        ['4', 'Run a 30-day round', 'The simulator runs the auctions against competitors and reports clicks, impressions, CPC, conversions and website traffic.', '#/simulate', false],
        ['5', 'Read feedback, improve, repeat', 'Each round gives a setup score, a performance score, estimated revenue, and specific recommendations.', '#/feedback', false]
      ];
      return h + '<div class="hero card"><h2>How it works</h2><div class="steps">' + steps.map(function (s) {
        return '<a class="step' + (s[4] ? ' done' : '') + '" href="' + s[3] + '"><span class="step-n">' + (s[4] ? '✓' : s[0]) + '</span><div><b>' + s[1] + '</b><p>' + s[2] + '</p></div></a>';
      }).join('') + '</div></div>' + setupSnapshot();
    }
    var prev = prevRoundOf(r);
    var t = r.totals, pt = prev ? prev.totals : null;
    var margin = (r.accountSnapshot || S.account).margin;
    function kpi(label, val, prevVal, f, goodUp, untracked) {
      var delta = '';
      if (prevVal != null && prevVal !== 0 && !untracked) {
        var ch = (val - prevVal) / Math.abs(prevVal);
        var good = goodUp == null ? null : (ch >= 0) === goodUp;
        delta = '<span class="delta ' + (good == null ? '' : good ? 'up' : 'down') + '">' + (ch >= 0 ? '▲' : '▼') + ' ' + Math.abs(ch * 100).toFixed(0) + '%</span>';
      }
      return '<div class="kpi"><span>' + label + '</span><b>' + f(val) + '</b>' + delta + '</div>';
    }
    var profit = t.value * margin - t.cost;
    var pprofit = pt ? pt.value * ((prev.accountSnapshot || S.account).margin) - pt.cost : null;
    var kpis = '<div class="kpis">' +
      kpi('Impressions', t.impressions, pt && pt.impressions, fInt, true) + kpi('Clicks', t.clicks, pt && pt.clicks, fInt, true) +
      kpi('CTR', t.ctr, pt && pt.ctr, function (v) { return fPct(v); }, true) + kpi('Avg. CPC', t.cpc, pt && pt.cpc, fMoney, false) +
      kpi('Cost', t.cost, pt && pt.cost, fMoney0, null) + kpi('Conversions', t.conversions, pt && pt.conversions, function (v) { return r.tracked ? fInt(v) : '—'; }, true, !r.tracked) +
      kpi('Cost / conv.', t.cpa, pt && pt.cpa, function (v) { return r.tracked ? fMoney(v) : '—'; }, false, !r.tracked) + kpi('Revenue (est.)', t.value, pt && pt.value, fMoney0, true) +
      kpi('ROAS', t.roas, pt && pt.roas, fX, true) + kpi('Profit after ads (est.)', profit, pprofit, fMoney0, true) + '</div>';
    var sc = r.score;
    var scoreCard = '<div class="card score-card"><div class="score-rings">' + ring(sc.overall, 'Overall · ' + sc.grade, 132) + ring(sc.setup, 'Setup', 104) + ring(sc.performance, 'Performance', 104) + '</div>' +
      '<p class="muted">Round ' + r.round + ' · ' + esc(new Date(r.createdAt).toLocaleString()) + '</p>' + (r.events.length ? '<ul class="events">' + r.events.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="row wrap center"><a class="btn primary" href="#/feedback">See full feedback →</a>' + btn('⬇ Download PDF', 'downloadPdf') + '</div></div>';
    var daily = r.daily;
    var charts = '<div class="card"><div class="grid2">' +
      lineChart('ov-clicks', daily.map(function (d) { return { label: 'Day ' + d.day, y: d.clicks }; }), { title: 'Clicks per day', name: 'Clicks', color: '--series-1' }) +
      lineChart('ov-cost', daily.map(function (d) { return { label: 'Day ' + d.day, y: d.cost }; }), { title: 'Cost per day', name: 'Cost', color: '--series-2', fmt: fMoney, fmtAxis: function (v) { return '$' + Math.round(v); } }) +
      '</div></div>';
    var history = S.rounds.length > 1 ? '<div class="card"><h3>Progress across rounds</h3><div class="grid2">' +
      lineChart('ov-score', S.rounds.map(function (x) { return { label: 'R' + x.round, y: x.score.overall }; }), { title: 'Overall score', name: 'Score', color: '--series-3', fmt: function (v) { return Math.round(v) + '/100'; } }) +
      lineChart('ov-profit', S.rounds.map(function (x) { return { label: 'R' + x.round, y: Math.max(0, x.totals.value) }; }), { title: 'Estimated revenue', name: 'Revenue', color: '--series-1', fmt: fMoney0, fmtAxis: function (v) { return '$' + Math.round(v); } }) +
      '</div></div>' : '';
    var top = r.feedback.filter(function (f) { return f.severity !== 'success' && f.severity !== 'info'; }).slice(0, 5);
    var fb = '<div class="card"><h3>Top recommendations</h3>' + (top.length ? top.map(feedbackItem).join('') : '<p>No major issues. Keep optimizing!</p>') + '</div>';
    return h + '<div class="grid-ov"><div>' + kpis + charts + fb + history + '</div>' + scoreCard + '</div>';
  }

  function setupSnapshot() {
    if (needsBusiness()) return '';
    var ev = SC.evaluateSetup(S);
    return '<div class="card"><h3>Current setup score: ' + ev.score + '/100</h3><p class="muted">This is how closely your current setup follows the baseline guidelines. Performance is scored after you run a round.</p>' +
      ev.categories.filter(function (c) { return c.score != null; }).map(function (c) { return barRow(esc(c.name), c.score, 100, c.score + '%', c.score >= 80 ? 'good' : c.score >= 50 ? 'warning' : 'critical'); }).join('') + '</div>';
  }

  // ----- Business setup -----
  function viewSetup() {
    var acc = S.account;
    var ind = industry();
    var demo = S.scan && S.scan.source === 'template' ? S.scan : null;
    var tpl = D.TEMPLATES.map(function (t) { return btn(esc(t.label), 'applyTemplate', t.id, 'ghost'); }).join('');
    var h = header('Business & website', 'Enter your own business, or start from a demo business. Everything here drives the simulation.');
    var startCard = '<div class="card"><h3>1 · Quick start</h3><p>Use a demo business, or fill in your own business details below.</p>' +
      '<div class="row wrap">' + tpl + '</div>' + (UI.scan.status ? '<p class="scan-status">' + UI.scan.status + '</p>' : '') + '</div>';
    var bizCard = '<div class="card"><h3>2 · Business details</h3><div class="grid2">' +
      field('Business name', input('account.businessName', { placeholder: 'e.g., Brew Haven Coffee', aria: 'Business name', max: 25 }), 'Shown in your ads (max 25 characters for Display).') +
      field('Website', input('account.website', { placeholder: 'https://www.yourbusiness.com', inputType: 'url', aria: 'Website URL' }), 'Used for your ads\' final URLs. Use https://.') +
      field('Industry (sets market benchmarks)', select('account.industry', Object.keys(D.INDUSTRIES).map(function (k) { return [k, D.INDUSTRIES[k].name]; }), { aria: 'Industry' })) +
      field('Where do you serve customers?', select('account.serviceArea', [['local', 'Local area (store, clinic, service area)'], ['national', 'Nationally (ship / serve the whole country)'], ['international', 'Internationally']], { aria: 'Service area' })) +
      field('Main advertising goal', select('account.goal', Object.keys(D.GOALS).map(function (k) { return [k, D.GOALS[k].name]; }), { aria: 'Goal' })) +
      field('Value per conversion ($)', input('account.value', { type: 'number', min: 0, step: 1, aria: 'Value per conversion' }), 'Average order value, or for leads: average sale × close rate. Industry default: $' + ind.value + '.') +
      field('Profit margin (%)', input('account.margin', { type: 'percent', min: 1, maxVal: 99, step: 1, aria: 'Profit margin' }), 'Break-even ROAS = 1 ÷ margin = ' + (acc.margin > 0 ? (1 / acc.margin).toFixed(2) + '×' : '—') + '.') +
      field('Brand color', '<input type="color" data-bind="account.brandColor" value="' + esc(acc.brandColor) + '" aria-label="Brand color">', 'Used in ad previews.') +
      field('Logo image URL (optional)', input('account.logoUrl', { placeholder: 'https://…/logo.png', aria: 'Logo URL' })) +
      '</div>' +
      field('What do you sell? (description)', textarea('account.description', { rows: 3, placeholder: 'Describe your products/services, locations and selling points. The simulator uses these words to judge keyword relevance and to build your starter campaign.', aria: 'Business description' })) +
      '<div class="tracking ' + (acc.conversionTracking ? 'on' : 'off') + '">' + checkbox('account.conversionTracking', '<b>Google tag & conversion tracking installed</b>', 'Measures purchases/leads, enables Smart Bidding and builds remarketing lists. ' + guideLink('ACC-1')) + '</div></div>';
    var starter = '';
    if (!needsBusiness()) {
      starter = '<div class="card"><h3>3 · Starter campaign</h3>' +
        (demo ? '<p class="muted">Demo business data: ' + esc(demo.title || '') + '</p>' +
          ((demo.keywords || []).length ? '<div class="chips">' + demo.keywords.slice(0, 16).map(function (k) { return '<span class="chip neutral">' + esc(k) + '</span>'; }).join('') + '</div>' : '') : '') +
        '<div class="row wrap">' + btn('✨ Create a starter Search campaign', 'quickStart', null, 'primary') + '</div>' +
        '<p class="help">Builds a draft from your ' + (demo ? 'demo business' : 'description and industry') + ' with Google-style defaults (broad match, network expansion on, few assets). It will run, but not well. Your job is to improve it using the feedback.</p></div>';
    }
    var bench = '<div class="card"><h3>Market benchmarks: ' + esc(ind.name) + '</h3><p class="muted">Approximate industry averages used by the simulator.</p><div class="table-wrap"><table class="data compact"><thead><tr><th></th><th class="num">CTR</th><th class="num">Avg. CPC</th><th class="num">Conv. rate</th><th class="num">Cost / conv.</th></tr></thead><tbody>' +
      [['Search', ind.search], ['Display', ind.display], ['Shopping', ind.shopping]].map(function (x) {
        return '<tr><td>' + x[0] + '</td><td class="num">' + fPct(x[1].ctr) + '</td><td class="num">' + fMoney(x[1].cpc) + '</td><td class="num">' + fPct(x[1].cvr) + '</td><td class="num">' + fMoney(x[1].cpc / x[1].cvr) + '</td></tr>';
      }).join('') + '<tr><td>YouTube</td><td colspan="4">CPV ≈ ' + fMoney(ind.video.cpv) + ', view rate ≈ ' + fPct(ind.video.viewRate, 0) + '</td></tr></tbody></table></div></div>';
    return h + '<div class="grid-2-1"><div>' + startCard + bizCard + starter + '</div><div>' + bench + setupSnapshot() + '</div></div>';
  }

  // ----- Campaigns list -----
  function viewCampaigns() {
    var ev = SC.evaluateSetup(S);
    var h = header('Campaigns', 'Each campaign has one type, budget and bid strategy. Build as many as your strategy needs.', btn('＋ New campaign', 'newCampaign', null, 'primary'));
    var body = '';
    if (UI.newCamp) body += newCampaignPanel();
    if (!S.campaigns.length && !UI.newCamp) {
      body += '<div class="card empty-state"><h3>No campaigns yet</h3><p>Create your first campaign, or generate a starter Search campaign from your business details.</p>' + btn('＋ New campaign', 'newCampaign', null, 'primary') + ' ' + (!needsBusiness() ? btn('✨ Starter Search campaign', 'quickStart') : '<a class="btn" href="#/setup">Set up business first</a>') + '</div>';
    }
    if (S.campaigns.length) {
      body += '<div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Campaign</th><th>Type</th><th>Status</th><th class="num">Budget / day</th><th>Bid strategy</th><th class="num">Ad groups</th><th>Setup checks</th><th></th></tr></thead><tbody>' +
        S.campaigns.map(function (c) {
          var mine = ev.checks.filter(function (x) { return x.campaignId === c.id; });
          var fails = mine.filter(function (x) { return x.status === 'fail'; }).length, warns = mine.filter(function (x) { return x.status === 'warn'; }).length;
          return '<tr><td><a href="#/campaign/' + c.id + '/settings"><b>' + esc(c.name) + '</b></a></td><td>' + typeBadge(c.type) + '</td>' +
            '<td>' + btn(c.status === 'enabled' ? '● Enabled' : '❚❚ Paused', 'toggleCampaign', c.id, 'small ' + (c.status === 'enabled' ? 'on' : 'off')) + '</td>' +
            '<td class="num">' + fMoney(c.dailyBudget) + '</td><td>' + esc((D.BID_STRATEGIES[c.bidStrategy] || {}).name || c.bidStrategy) + '</td>' +
            '<td class="num">' + (c.type === 'shopping' ? (c.productGroups || []).length + ' product group(s)' : (c.adGroups || []).length) + '</td>' +
            '<td>' + (c.status !== 'enabled' ? '<span class="muted">paused</span>' : fails ? '<span class="chip critical"><b>✕</b> ' + fails + ' to fix</span> ' : '') + (c.status === 'enabled' && warns ? '<span class="chip warning"><b>!</b> ' + warns + ' to improve</span>' : '') + (c.status === 'enabled' && !fails && !warns ? '<span class="chip good"><b>✓</b> All good</span>' : '') + '</td>' +
            '<td class="actions"><a class="btn small" href="#/campaign/' + c.id + '/settings">Edit</a>' + btn('Duplicate', 'dupCampaign', c.id, 'small ghost') + btn('Delete', 'deleteCampaign', c.id, 'small ghost danger') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    return h + body;
  }

  function newCampaignPanel() {
    var nc = UI.newCamp;
    var goals = Object.keys(D.GOALS).map(function (g) {
      return '<button type="button" class="pick' + (nc.goal === g ? ' sel' : '') + '" data-action="pickGoal" data-args="' + esc(JSON.stringify(g)) + '"><b>' + esc(D.GOALS[g].name) + '</b></button>';
    }).join('');
    var goal = D.GOALS[nc.goal];
    var types = Object.keys(D.CAMPAIGN_TYPES).map(function (t) {
      var ct = D.CAMPAIGN_TYPES[t];
      var fit = goal ? goal.fit[t] : 0;
      var fitLabel = fit >= 3 ? '<span class="chip good"><b>✓</b> Recommended</span>' : fit === 2 ? '<span class="chip info"><b>~</b> Works</span>' : '<span class="chip neutral">Less suited</span>';
      return '<button type="button" class="pick type' + (nc.type === t ? ' sel' : '') + '" data-action="pickType" data-args="' + esc(JSON.stringify(t)) + '"><span class="big-ico">' + ct.icon + '</span><b>' + esc(ct.name) + '</b><small>' + esc(ct.desc) + '</small>' + (goal ? fitLabel : '') + '</button>';
    }).join('');
    return '<div class="card new-camp"><h3>New campaign</h3><p class="lbl">1 · What is this campaign\'s objective?</p><div class="picks">' + goals + '</div>' +
      '<p class="lbl">2 · Choose a campaign type ' + guideLink('ACC-3') + '</p><div class="picks types">' + types + '</div>' +
      (nc.type === 'shopping' && !S.products.length ? '<p class="warn-text">Shopping needs a product feed — add products in Product feed.</p>' : '') +
      '<div class="row">' + btn('Create campaign', 'createCampaign', null, 'primary' + (nc.type ? '' : ' disabled')) + btn('Cancel', 'cancelNew', null, 'ghost') + '</div></div>';
  }

  // ----- Campaign editor -----
  function viewCampaign() {
    var c = campById(UI.params[0]);
    if (!c) return header('Campaign not found') + '<a href="#/campaigns">Back to campaigns</a>';
    var ci = campIndex(c.id);
    var base = 'campaigns.' + ci;
    var tabs = [['settings', 'Settings']];
    if (c.type === 'search') tabs.push(['adgroups', 'Ad groups & keywords'], ['ads', 'Ads'], ['assets', 'Assets']);
    if (c.type === 'display' || c.type === 'video') tabs.push(['targeting', 'Ad groups & targeting'], ['ads', 'Ads']);
    if (c.type === 'shopping') tabs.push(['products', 'Product groups & preview']);
    tabs.push(['checks', 'Checklist']);
    var tab = UI.params[1] || 'settings';
    if (!tabs.some(function (t) { return t[0] === tab; })) tab = 'settings';
    var tabHtml = '<nav class="tabs">' + tabs.map(function (t) { return '<a href="#/campaign/' + c.id + '/' + t[0] + '" class="' + (tab === t[0] ? 'active' : '') + '">' + t[1] + '</a>'; }).join('') + '</nav>';
    var content = '';
    if (tab === 'settings') content = campaignSettings(c, base);
    if (tab === 'adgroups') content = searchAdGroups(c, base);
    if (tab === 'targeting') content = targetingEditor(c, base);
    if (tab === 'ads') content = c.type === 'search' ? searchAds(c, base) : c.type === 'display' ? displayAds(c, base) : videoAds(c, base);
    if (tab === 'assets') content = assetsEditor(c, base);
    if (tab === 'products') content = productGroupsEditor(c, base);
    if (tab === 'checks') content = '<div class="card">' + live('camp-checks-full', function () { return campaignChecks(c, true); }) + '</div>';
    var h = '<div class="page-head"><div><a href="#/campaigns" class="back">← Campaigns</a><h1>' + esc(c.name) + '</h1><p class="sub">' + typeBadge(c.type) + ' · ' + fMoney(c.dailyBudget) + '/day · ' + esc((D.BID_STRATEGIES[c.bidStrategy] || {}).name || '') + '</p></div>' +
      '<div class="page-actions">' + btn(c.status === 'enabled' ? '● Enabled' : '❚❚ Paused', 'toggleCampaign', c.id, c.status === 'enabled' ? 'on' : 'off') + '<a class="btn primary" href="#/simulate">Run simulation →</a></div></div>';
    var side = tab === 'checks' ? '' : '<aside class="side-checks card"><h4>Checks for this campaign</h4>' + live('camp-checks', function () { return campaignChecks(c, false); }) + '</aside>';
    return h + tabHtml + '<div class="editor' + (side ? '' : ' full') + '"><div class="editor-main">' + content + '</div>' + side + '</div>';
  }

  function campaignChecks(c, full) {
    var ev = SC.evaluateSetup(S);
    var mine = ev.checks.filter(function (x) { return x.campaignId === c.id || (full && !x.campaignId); });
    var list = full ? mine : mine.filter(function (x) { return x.status !== 'pass'; });
    var passed = mine.filter(function (x) { return x.status === 'pass'; }).length;
    if (!list.length) return '<p class="good-text">✓ All ' + passed + ' checks pass.</p>';
    return (full ? '' : '<p class="muted">' + passed + ' of ' + mine.length + ' checks pass.</p>') + list.sort(function (a, b) { return (a.status === 'fail' ? 0 : a.status === 'warn' ? 1 : 2) - (b.status === 'fail' ? 0 : b.status === 'warn' ? 1 : 2); }).map(function (x) {
      return '<div class="check-item ' + x.status + '">' + statusChip(x.status) + ' <b>' + esc(x.title) + '</b> ' + guideLink(x.guide) + '<div class="muted">' + esc(x.detail) + '</div>' + (x.status !== 'pass' ? '<div class="fix">→ ' + esc(x.fix) + '</div>' : '') + '</div>';
    }).join('');
  }

  function campaignSettings(c, base) {
    var ind = industry();
    var strategies = Object.keys(D.BID_STRATEGIES).filter(function (k) { return D.BID_STRATEGIES[k].types.indexOf(c.type) >= 0; });
    var bs = D.BID_STRATEGIES[c.bidStrategy] || {};
    var recBudget = c.type === 'search' || c.type === 'shopping' ? 10 * ind[c.type === 'shopping' ? 'shopping' : 'search'].cpc : 15;
    var extra = '';
    if (c.bidStrategy === 'manual_cpc') extra = '<p class="help">Set your max CPC ' + (c.type === 'shopping' ? 'per product group (Product groups tab)' : 'per ad group (Ad groups tab)') + '. Industry average CPC: ' + fMoney(ind[c.type === 'shopping' ? 'shopping' : c.type === 'display' ? 'display' : 'search'].cpc) + '.</p>';
    if (c.bidStrategy === 'max_clicks') extra = checkbox(base + '.bidCap', 'Set a maximum CPC bid limit') + (c.bidCap ? field('Max CPC limit ($)', input(base + '.maxCpc', { type: 'number', step: 0.05, min: 0 })) : '');
    if (c.bidStrategy === 'target_cpa') extra = field('Target CPA ($)', input(base + '.targetCpa', { type: 'number', step: 1, min: 0 }), 'Industry cost/conversion ≈ ' + fMoney(ind.search.cpc / ind.search.cvr) + '; your conversion value: ' + fMoney(S.account.value) + '. ' + guideLink('BID-2'));
    if (c.bidStrategy === 'target_roas') extra = field('Target ROAS (%)', input(base + '.targetRoas', { type: 'number', step: 10, min: 0 }), 'Break-even ROAS: ' + Math.round(100 / (S.account.margin || 0.4)) + '%. ' + guideLink('BID-3'));
    if (c.bidStrategy === 'target_is') extra = field('Target impression share (%) at the top of the page', input(base + '.targetIs', { type: 'number', step: 5, min: 5, maxVal: 95 })) + field('Max CPC limit ($)', input(base + '.maxCpc', { type: 'number', step: 0.05, min: 0 }));
    if (c.bidStrategy === 'max_cpv') extra = field('Maximum CPV ($ per view)', input(base + '.maxCpv', { type: 'number', step: 0.01, min: 0 }), 'Industry average CPV ≈ ' + fMoney(ind.video.cpv) + '.');
    if (c.bidStrategy === 'target_cpm' || c.bidStrategy === 'vcpm') extra = field((c.bidStrategy === 'vcpm' ? 'Viewable CPM' : 'Target CPM') + ' ($ per 1,000 impressions)', input(base + '.targetCpm', { type: 'number', step: 0.5, min: 0 }));
    var locs = D.LOCATIONS.map(function (l) { return arrayCheck(base + '.locations', l.id, esc(l.name)); }).join('');
    var h = '<div class="card"><h3>Campaign basics</h3><div class="grid2">' +
      field('Campaign name', input(base + '.name', { aria: 'Campaign name' })) +
      field('Status', select(base + '.status', [['enabled', 'Enabled'], ['paused', 'Paused']])) +
      field('Average daily budget ($)', input(base + '.dailyBudget', { type: 'number', step: 1, min: 0 }), 'Monthly spend ≈ 30.4 × daily budget = ' + fMoney0(c.dailyBudget * 30.4) + '. Recommended ≥ ' + fMoney0(recBudget) + '/day. ' + guideLink('STR-3')) +
      (c.type === 'video' ? field('Video ad format', select(base + '.videoFormat', Object.keys(D.VIDEO_FORMATS).map(function (k) { return [k, D.VIDEO_FORMATS[k].name]; })), esc(D.VIDEO_FORMATS[c.videoFormat || 'skippable'].desc) + ' ' + guideLink('VID-4')) : '') +
      (c.type === 'shopping' ? field('Campaign priority', select(base + '.priority', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]), 'Used when several Shopping campaigns advertise the same product.') : '') +
      '</div></div>';
    h += '<div class="card"><h3>Bidding ' + guideLink('BID-1') + '</h3>' + field('Bid strategy', select(base + '.bidStrategy', strategies.map(function (k) { return [k, D.BID_STRATEGIES[k].name]; })), esc(bs.desc || '') + (bs.needsConv && !S.account.conversionTracking ? ' <b class="warn-text">Needs conversion tracking (currently off).</b>' : '')) + extra + '</div>';
    if (c.type === 'search') {
      h += '<div class="card"><h3>Networks ' + guideLink('STR-1') + '</h3>' + checkbox(base + '.networks.searchPartners', 'Include Google search partners', 'Other search sites that show Google ads. Slightly more volume, slightly lower conversion rate.') +
        checkbox(base + '.networks.displayExpansion', 'Include Google Display Network', 'Shows this campaign\'s ads on websites when people are not searching. On by default in Google Ads — usually best turned off.') + '</div>';
    }
    if (c.type === 'display') {
      h += '<div class="card"><h3>Placements & frequency ' + guideLink('DSP-3') + '</h3>' + checkbox(base + '.excludeApps', 'Exclude mobile app placements (games, utilities)', 'Prevents accidental clicks from mobile games.') +
        field('Frequency cap (impressions per user per day, 0 = none)', input(base + '.freqCap', { type: 'number', step: 1, min: 0 })) + '</div>';
    }
    if (c.type === 'video') h += '<div class="card"><h3>Frequency</h3>' + field('Frequency cap (impressions per user per day, 0 = none)', input(base + '.freqCap', { type: 'number', step: 1, min: 0 })) + '</div>';
    h += '<div class="card"><h3>Locations & language ' + guideLink('TGT-1') + '</h3><p class="help">Your business serves: <b>' + esc(S.account.serviceArea) + '</b>.</p><div class="check-grid">' + locs + '</div>' +
      '<p class="lbl">Location option</p>' + radio(base + '.locationOption', 'presence', 'Presence: people in or regularly in your targeted locations', 'Recommended for local businesses.') +
      radio(base + '.locationOption', 'presenceOrInterest', 'Presence or interest: people in, regularly in, or who\'ve shown interest in your locations', 'Google\'s default. Reaches more people, including some outside your area.') +
      field('Language', select(base + '.language', [['en', 'English'], ['all', 'All languages']])) + '</div>';
    h += '<div class="card"><h3>Ad schedule & devices ' + guideLink('TGT-2') + '</h3>' + field('Ad schedule', select(base + '.schedule', [['all', 'All day, every day'], ['business', 'Business hours (Mon–Fri, 8am–6pm)'], ['evenings', 'Evenings & weekends']])) +
      '<p class="lbl">Device bid adjustments (%)</p><div class="grid3">' + ['mobile', 'desktop', 'tablet'].map(function (d) {
        return field(d.charAt(0).toUpperCase() + d.slice(1), input(base + '.devices.' + d, { type: 'number', step: 5, min: -100, maxVal: 900 }), '−100 excludes the device');
      }).join('') + '</div></div>';
    if (c.type === 'search' || c.type === 'shopping') {
      h += '<div class="card"><h3>Campaign negative keywords ' + guideLink('KW-2') + '</h3>' + textarea(base + '.negativesText', { rows: 5, placeholder: 'One per line, e.g.\nfree\njobs\n"how to"\n[diy coffee]' }) + '<p class="help">Blocks searches containing these words. Use "phrase" or [exact] notation for narrower negatives. Negatives do not match close variants — add plurals separately.</p></div>';
    }
    return h;
  }

  function plannerTable(g) {
    var kws = M.adGroupKeywords(g);
    if (!kws.length) return '<p class="muted">Add keywords to see Keyword Planner estimates.</p>';
    return '<table class="data compact"><thead><tr><th>Keyword</th><th>Match</th><th class="num">Avg. monthly searches*</th><th class="num">Top-of-page bid (low–high)</th><th>Competition</th><th>Intent</th><th class="num">Relevance to your business</th></tr></thead><tbody>' +
      kws.slice(0, 40).map(function (k) {
        var p = E.keywordPlanner(S, k.text);
        var rel = Math.round(p.relevance * 100);
        return '<tr><td>' + esc(U.formatKeyword(k)) + '</td><td>' + k.match + '</td><td class="num">' + fInt(p.monthlySearches) + '</td><td class="num">' + fMoney(p.lowBid) + ' – ' + fMoney(p.highBid) + '</td><td>' + p.competition + '</td><td>' + intentChip(p.intent) + '</td><td class="num"><span class="' + (rel >= 60 ? 'good-text' : rel >= 40 ? 'warn-text' : 'bad-text') + '">' + rel + '%</span></td></tr>';
      }).join('') + '</tbody></table><p class="help">*National (US) estimate for the exact keyword; phrase and broad match reach more searches. Relevance compares the keyword with your business description, website and products.</p>';
  }

  function intentChip(i) {
    var m = { brand: ['good', 'Brand'], high: ['good', 'Commercial'], neutral: ['neutral', 'General'], competitor: ['warning', 'Competitor'], low: ['critical', 'Low intent'] }[i] || ['neutral', i];
    return '<span class="chip ' + m[0] + '">' + m[1] + '</span>';
  }

  function searchAdGroups(c, base) {
    var manual = c.bidStrategy === 'manual_cpc';
    var h = '<div class="card info-card"><b>Keyword match types</b> ' + guideLink('KW-1') + '<br><code>running shoes</code> = broad match (related searches) · <code>"running shoes"</code> = phrase match (searches with that meaning) · <code>[running shoes]</code> = exact match (same meaning only)</div>';
    (c.adGroups || []).forEach(function (g, gi) {
      var gb = base + '.adGroups.' + gi;
      h += '<div class="card"><div class="card-head"><h3>Ad group ' + (gi + 1) + '</h3>' + ((c.adGroups.length > 1) ? btn('Remove', 'removeAdGroup', [c.id, g.id], 'small ghost danger') : '') + '</div><div class="grid2">' +
        field('Ad group name', input(gb + '.name')) + (manual ? field('Default max CPC ($)', input(gb + '.defaultBid', { type: 'number', step: 0.05, min: 0 })) : '<div></div>') + '</div>' +
        '<div class="grid2">' + field('Keywords (one per line) ' + guideLink('STR-2'), textarea(gb + '.keywordsText', { rows: 8, placeholder: 'coffee beans\n"whole bean coffee"\n[buy coffee beans online]' })) +
        field('Ad group negative keywords', textarea(gb + '.negativesText', { rows: 8, placeholder: 'decaf\n"instant coffee"' })) + '</div>' +
        '<h4>Keyword Planner</h4>' + live('planner-' + g.id, function () { return plannerTable(g); }) + '</div>';
    });
    h += btn('＋ Add ad group', 'addAdGroup', c.id, 'primary');
    return h;
  }

  function audienceFit(a) {
    var ind = S.account.industry;
    if (a.type === 'remarketing') return S.account.conversionTracking ? '<span class="chip good">Your visitors</span>' : '<span class="chip critical">Needs tag</span>';
    if (a.type === 'custom') return '<span class="chip good">Built from your keywords</span>';
    return a.inds.indexOf(ind) >= 0 ? '<span class="chip good">Fits your industry</span>' : '<span class="chip neutral">Weak fit</span>';
  }

  function targetingEditor(c, base) {
    var h = '<div class="card info-card"><b>How targeting works:</b> audiences = who people are (in-market = actively researching; affinity = long-term interests; your data = past visitors). Topics & placements = where the ad appears. Combining audiences with topics narrows reach but raises relevance. Optimized targeting lets Google find more people beyond your selections. ' + guideLink('DSP-1') + '</div>';
    var manual = c.bidStrategy === 'manual_cpc';
    (c.adGroups || []).forEach(function (g, gi) {
      var gb = base + '.adGroups.' + gi;
      var tb = gb + '.targeting';
      var groups = {};
      D.AUDIENCES.forEach(function (a) { (groups[a.type] = groups[a.type] || []).push(a); });
      var aud = Object.keys(groups).map(function (t) {
        return '<div class="aud-group"><p class="lbl">' + esc(D.AUDIENCE_TYPES[t].label) + ' <small class="muted">(' + D.AUDIENCE_TYPES[t].funnel + ')</small></p>' + groups[t].map(function (a) { return arrayCheck(tb + '.audiences', a.id, esc(a.name.replace(/^[^:]+: /, '')), ' ' + audienceFit(a)); }).join('') + '</div>';
      }).join('');
      var topics = D.TOPICS.map(function (tp) { return arrayCheck(tb + '.topics', tp.id, esc(tp.name), tp.inds.indexOf(S.account.industry) >= 0 ? ' <span class="chip good">Fits</span>' : ''); }).join('');
      var ages = D.AGE_BANDS.map(function (a, i) { return checkbox(tb + '.ages.' + i, a); }).join('');
      var genders = D.GENDERS.map(function (a, i) { return checkbox(tb + '.genders.' + i, a); }).join('');
      h += '<div class="card"><div class="card-head"><h3>Ad group ' + (gi + 1) + '</h3>' + (c.adGroups.length > 1 ? btn('Remove', 'removeAdGroup', [c.id, g.id], 'small ghost danger') : '') + '</div><div class="grid2">' +
        field('Ad group name', input(gb + '.name')) + (manual ? field('Max CPC ($)', input(gb + '.defaultBid', { type: 'number', step: 0.05, min: 0 })) : '<div></div>') + '</div>' +
        '<h4>Audience segments</h4><div class="aud-grid">' + aud + '</div>' +
        '<h4>Content: topics</h4><div class="check-grid">' + topics + '</div>' +
        field('Content: placements (one website or YouTube channel per line)', textarea(tb + '.placementsText', { rows: 3, placeholder: 'coffeeblog.example\nyoutube.com/@baristaskills' })) +
        '<h4>Demographics ' + guideLink('TGT-3') + '</h4><div class="grid2"><div><p class="lbl">Age</p><div class="check-grid">' + ages + '</div></div><div><p class="lbl">Gender</p>' + genders + '</div></div>' +
        '<h4>Optimized targeting</h4>' + checkbox(tb + '.optimized', 'Use optimized targeting', 'Lets Google show ads to people beyond your segments who are likely to convert. More reach, less control.') + '</div>';
    });
    h += btn('＋ Add ad group', 'addAdGroup', c.id, 'primary');
    return h;
  }

  function strengthMeter(s) {
    var order = ['Incomplete', 'Poor', 'Average', 'Good', 'Excellent'];
    var idx = order.indexOf(s.label);
    return '<div class="strength s-' + s.label.toLowerCase().replace(/\s/g, '') + '"><div class="strength-bar">' + [1, 2, 3, 4].map(function (i) { return '<span class="' + (idx >= i ? 'on' : '') + '"></span>'; }).join('') + '</div><b>Ad strength: ' + esc(s.label) + '</b></div>' +
      (s.policy && s.policy.length ? '<ul class="issues bad">' + s.policy.map(function (p) { return '<li>⚠ ' + esc(p) + '</li>'; }).join('') + '</ul>' : '') +
      (s.errors && s.errors.length ? '<ul class="issues bad">' + s.errors.map(function (p) { return '<li>✕ ' + esc(p) + '</li>'; }).join('') + '</ul>' : '') +
      (s.issues.length ? '<ul class="issues">' + s.issues.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '');
  }

  function previewToolbar() {
    return '<div class="row prev-tools">' + btn(UI.device === 'desktop' ? '🖥 Desktop' : '📱 Mobile', 'toggleDevice', null, 'small') + btn('🔀 Show another combination', 'shuffle', null, 'small') + '</div>';
  }

  function searchAds(c, base) {
    var h = '<div class="card info-card">Responsive search ads mix and match your headlines (max 30 characters) and descriptions (max 90) to find the best combination for each search. ' + guideLink('AD-1') + ' ' + guideLink('AD-2') + ' ' + guideLink('AD-4') + '</div>';
    (c.adGroups || []).forEach(function (g, gi) {
      (g.ads || []).forEach(function (ad, ai) {
        var ab = base + '.adGroups.' + gi + '.ads.' + ai;
        var kws = function () { return M.adGroupKeywords(g); };
        h += '<div class="card"><div class="card-head"><h3>' + esc(g.name) + ' · Ad ' + (ai + 1) + '</h3>' + (g.ads.length > 1 ? btn('Remove ad', 'removeAd', [c.id, g.id, ai], 'small ghost danger') : '') + '</div>' +
          '<p class="help">Keywords in this ad group: ' + (kws().length ? kws().slice(0, 8).map(function (k) { return '<code>' + esc(U.formatKeyword(k)) + '</code>'; }).join(' ') : '<i>none yet</i>') + '</p>' +
          '<div class="ad-editor"><div>' +
          field('Final URL', input(ab + '.finalUrl', { placeholder: S.account.website || 'https://…', inputType: 'url' }), 'The page people land on. Deep-link to the matching page. ' + guideLink('LP-1')) +
          '<div class="grid2">' + field('Display path 1', input(ab + '.path1', { max: 15 })) + field('Display path 2', input(ab + '.path2', { max: 15 })) + '</div>' +
          '<p class="lbl">Headlines (3–15)</p><div class="hl-grid">' + ad.headlines.map(function (x, i) { return input(ab + '.headlines.' + i, { max: 30, policy: 'headline', placeholder: 'Headline ' + (i + 1), aria: 'Headline ' + (i + 1) }); }).join('') + '</div>' +
          '<p class="lbl">Descriptions (2–4)</p>' + ad.descriptions.map(function (x, i) { return input(ab + '.descriptions.' + i, { max: 90, policy: 'description', placeholder: 'Description ' + (i + 1), aria: 'Description ' + (i + 1) }); }).join('') +
          '</div><div class="ad-side">' + live('str-' + g.id + '-' + ai, function () { return strengthMeter(M.rsaStrength(ad, kws())); }) +
          '<p class="lbl">Preview</p>' + previewToolbar() + live('prev-' + g.id + '-' + ai, function () {
            var k = kws()[0];
            return P.serpPage({ ad: ad, account: S.account, campaign: c, keywords: kws(), device: UI.device, combo: UI.combo, query: k ? k.text : '' });
          }) + '</div></div></div>';
      });
      if ((g.ads || []).length < 3) h += btn('＋ Add another ad to ' + esc(g.name), 'addAd', [c.id, g.id], 'ghost');
    });
    return h;
  }

  var IMG_HELP = 'Paste an image URL, or click "Use generated image" to use brand-colored artwork.';

  function displayAds(c, base) {
    var h = '<div class="card info-card">Responsive display ads: you provide assets; Google assembles them into many sizes and formats — the previews on the right show a few. More and better assets = more placements. ' + guideLink('DSP-2') + '</div>';
    (c.adGroups || []).forEach(function (g, gi) {
      (g.ads || []).forEach(function (ad, ai) {
        var ab = base + '.adGroups.' + gi + '.ads.' + ai;
        h += '<div class="card"><div class="card-head"><h3>' + esc(g.name) + ' · Responsive display ad ' + (ai + 1) + '</h3>' + (g.ads.length > 1 ? btn('Remove ad', 'removeAd', [c.id, g.id, ai], 'small ghost danger') : '') + '</div><div class="ad-editor"><div>' +
          field('Final URL', input(ab + '.finalUrl', { inputType: 'url' })) +
          field('Business name', input(ab + '.businessName', { max: 25 })) +
          '<p class="lbl">Short headlines (up to 5)</p>' + ad.headlines.map(function (x, i) { return input(ab + '.headlines.' + i, { max: 30, policy: 'headline', placeholder: 'Headline ' + (i + 1) }); }).join('') +
          field('Long headline', input(ab + '.longHeadline', { max: 90, policy: 'description' })) +
          '<p class="lbl">Descriptions (up to 5)</p>' + ad.descriptions.map(function (x, i) { return input(ab + '.descriptions.' + i, { max: 90, policy: 'description', placeholder: 'Description ' + (i + 1) }); }).join('') +
          '<p class="lbl">Images</p>' + field('Landscape image (1.91:1)', '<div class="row">' + input(ab + '.landscapeImage', { placeholder: 'https://…', cls: 'grow' }) + btn('Use generated image', 'genImage', [ab + '.landscapeImage'], 'small ghost') + '</div>') +
          field('Square image (1:1)', '<div class="row">' + input(ab + '.squareImage', { placeholder: 'https://…', cls: 'grow' }) + btn('Use generated image', 'genImage', [ab + '.squareImage'], 'small ghost') + '</div>') +
          field('Logo (1:1)', '<div class="row">' + input(ab + '.logoUrl', { placeholder: 'https://…', cls: 'grow' }) + btn('Use generated logo', 'genImage', [ab + '.logoUrl'], 'small ghost') + '</div>', IMG_HELP) +
          '<div class="grid2">' + field('Call to action', select(ab + '.cta', ['Learn more', 'Shop now', 'Sign up', 'Get quote', 'Book now', 'Contact us', 'Apply now', 'Download', 'Subscribe'].map(function (x) { return [x, x]; }))) +
          field('Ad color', '<input type="color" data-bind="' + ab + '.color" value="' + esc(ad.color || S.account.brandColor) + '">') + '</div>' +
          '</div><div class="ad-side">' + live('str-' + g.id + '-' + ai, function () { return strengthMeter(M.rdaStrength(ad)); }) + '<p class="lbl">Previews</p>' + btn('🔀 Show another combination', 'shuffle', null, 'small') +
          live('prev-' + g.id + '-' + ai, function () { return P.displayGallery(ad, S.account, UI.combo); }) + '</div></div></div>';
      });
      if ((g.ads || []).length < 3) h += btn('＋ Add another ad to ' + esc(g.name), 'addAd', [c.id, g.id], 'ghost');
    });
    return h;
  }

  function videoAds(c, base) {
    var format = c.videoFormat || 'skippable';
    var h = '<div class="card info-card">Format: <b>' + esc(D.VIDEO_FORMATS[format].name) + '</b> — ' + esc(D.VIDEO_FORMATS[format].desc) + ' Change the format in Settings. ' + guideLink('VID-2') + '</div>';
    (c.adGroups || []).forEach(function (g, gi) {
      (g.ads || []).forEach(function (ad, ai) {
        var ab = base + '.adGroups.' + gi + '.ads.' + ai;
        h += '<div class="card"><div class="card-head"><h3>' + esc(g.name) + ' · Video ad ' + (ai + 1) + '</h3>' + (g.ads.length > 1 ? btn('Remove ad', 'removeAd', [c.id, g.id, ai], 'small ghost danger') : '') + '</div><div class="ad-editor"><div>' +
          field('YouTube video URL', input(ab + '.videoUrl', { placeholder: 'https://www.youtube.com/watch?v=…' }), 'Optional — used for the thumbnail. Describe the video with the fields below.') +
          '<div class="grid2">' + field('Video length (seconds)', input(ab + '.length', { type: 'number', min: 1, step: 1 })) + field('Aspect ratio', select(ab + '.aspect', [['16:9', '16:9 horizontal'], ['9:16', '9:16 vertical'], ['1:1', '1:1 square']])) + '</div>' +
          '<p class="lbl">Creative checklist ' + guideLink('VID-1') + '</p>' + checkbox(ab + '.hook', 'Strong hook in the first 5 seconds', 'Opens with the problem, benefit or something surprising.') +
          checkbox(ab + '.brandEarly', 'Brand/logo shown in the first 5 seconds') + checkbox(ab + '.captions', 'Captions / text on screen', 'Many people watch muted.') +
          checkbox(ab + '.companion', 'Companion banner (desktop)') +
          field('Headline / CTA headline', input(ab + '.headline', { max: 30, policy: 'headline' })) + field('Long headline', input(ab + '.longHeadline', { max: 90 })) +
          field('Description (in-feed)', input(ab + '.description', { max: 90 })) +
          '<div class="grid2">' + field('Call-to-action button', input(ab + '.cta', { max: 10 })) + field('Final URL', input(ab + '.finalUrl', { inputType: 'url' })) + '</div>' +
          '</div><div class="ad-side">' + live('str-' + g.id + '-' + ai, function () { var v = M.videoAdCheck(ad, format); return strengthMeter({ label: v.label === 'Not eligible' ? 'Incomplete' : v.label, issues: v.issues, errors: v.errors }); }) +
          '<p class="lbl">Preview</p>' + live('prev-' + g.id + '-' + ai, function () { return P.videoGallery(ad, format, S.account); }) + '</div></div></div>';
      });
    });
    return h;
  }

  function assetsEditor(c, base) {
    var a = c.assets;
    var sl = a.sitelinks || [];
    var h = '<div class="card"><div class="card-head"><h3>Sitelinks ' + guideLink('AST-1') + '</h3>' + (S.scan && (S.scan.links || []).length ? btn('Fill from demo pages', 'fillSitelinks', c.id, 'small') : '') + '</div>' +
      (sl.length ? sl.map(function (s, i) {
        var sb = base + '.assets.sitelinks.' + i;
        return '<div class="sitelink-row">' + field('Sitelink text', input(sb + '.text', { max: 25 })) + field('Description line 1', input(sb + '.d1', { max: 35 })) + field('Description line 2', input(sb + '.d2', { max: 35 })) + field('Final URL', input(sb + '.url', { inputType: 'url' })) + btn('✕', 'removeSitelink', [c.id, i], 'small ghost danger') + '</div>';
      }).join('') : '<p class="muted">No sitelinks yet.</p>') + (sl.length < 8 ? btn('＋ Add sitelink', 'addSitelink', c.id, 'small') : '') + '</div>';
    h += '<div class="card"><h3>Callouts ' + guideLink('AST-2') + '</h3>' + textarea(base + '.assets.callouts', { rows: 4, placeholder: 'Free Shipping\n24/7 Support\nFamily Owned\nPrice Match' }) +
      live('callout-check', function () {
        var bad = String(a.callouts || '').split('\n').filter(function (x) { return x.trim().length > 25; });
        return bad.length ? '<p class="bad-text">Too long (max 25): ' + bad.map(esc).join(', ') + '</p>' : '<p class="help">One per line, max 25 characters each.</p>';
      }) + '</div>';
    h += '<div class="card"><h3>Structured snippet</h3><div class="grid2">' + field('Header', select(base + '.assets.snippetHeader', ['Types', 'Services', 'Brands', 'Courses', 'Destinations', 'Styles', 'Amenities', 'Models', 'Neighborhoods', 'Degree programs', 'Insurance coverage'].map(function (x) { return [x, x]; }))) +
      field('Values (comma or line separated, 3+)', textarea(base + '.assets.snippetValues', { rows: 2, placeholder: 'Espresso, Decaf, Single Origin, Cold Brew' })) + '</div></div>';
    h += '<div class="card"><h3>Call asset ' + guideLink('AST-3') + '</h3>' + field('Phone number', input(base + '.assets.phone', { placeholder: '(555) 010-2000' })) + '</div>';
    h += '<div class="card"><h3>Preview with assets</h3>' + previewToolbar() + live('assets-prev', function () {
      var g = (c.adGroups || [])[0];
      if (!g) return '';
      var k = M.adGroupKeywords(g)[0];
      return P.serpPage({ ad: g.ads[0], account: S.account, campaign: c, keywords: M.adGroupKeywords(g), device: UI.device, combo: UI.combo, query: k ? k.text : '' });
    }) + '</div>';
    return h;
  }

  function productGroupsEditor(c, base) {
    var cats = U.uniq(S.products.map(function (p) { return p.category; }).filter(Boolean));
    var brands = U.uniq(S.products.map(function (p) { return p.brand; }).filter(Boolean));
    var manual = c.bidStrategy === 'manual_cpc';
    var h = '<div class="card"><h3>Product groups ' + guideLink('SHP-4') + '</h3><p class="help">Each product uses the most specific matching group: product → brand → category → "All products".</p>' +
      '<table class="data compact"><thead><tr><th>Subdivide by</th><th>Value</th><th class="num">' + (manual ? 'Max CPC ($)' : 'Bid (set by strategy)') + '</th><th>Excluded</th><th></th></tr></thead><tbody>' +
      (c.productGroups || []).map(function (g, i) {
        var gb = base + '.productGroups.' + i;
        var values = g.dimension === 'category' ? cats : g.dimension === 'brand' ? brands : g.dimension === 'product' ? S.products.map(function (p) { return p.id; }) : [];
        var valueSel = g.dimension === 'all' ? '<span class="muted">All products</span>' : select(gb + '.value', [['', '— choose —']].concat(values.map(function (v) {
          var p = g.dimension === 'product' ? S.products.find(function (x) { return x.id === v; }) : null;
          return [v, p ? M.fit(p.title || v, 50) : v];
        })));
        return '<tr><td>' + select(gb + '.dimension', [['all', 'All products'], ['category', 'Category'], ['brand', 'Brand'], ['product', 'Item']]) + '</td><td>' + valueSel + '</td><td class="num">' + (manual ? input(gb + '.bid', { type: 'number', step: 0.05, min: 0 }) : '<span class="muted">auto</span>') + '</td><td>' + checkbox(gb + '.excluded', '') + '</td><td>' + (i > 0 ? btn('✕', 'removeProductGroup', [c.id, i], 'small ghost danger') : '') + '</td></tr>';
      }).join('') + '</tbody></table>' + btn('＋ Add product group', 'addProductGroup', c.id, 'small') + '</div>';
    h += '<div class="card"><h3>Shopping ad preview</h3><p class="help">Only the first ~70 characters of a title are visible. Edit products in <a href="#/feed">Product feed</a>.</p>' + P.shoppingCarousel(S.products, S.account, (S.products[0] && S.products[0].category) || '') + '</div>';
    return h;
  }

  // ----- Product feed -----
  function viewFeed() {
    var h = header('Product feed', 'Your product data (like Google Merchant Center). Shopping ads are built entirely from it.', btn('＋ Add product', 'addProduct', null, 'primary'));
    h += '<div class="card info-card">Title formula: <b>Brand + Product type + Key attributes</b> (size, color, material, model). 70–150 characters; the first ~70 are visible. Include GTIN, a good image, accurate price and availability. ' + guideLink('SHP-1') + ' ' + guideLink('SHP-2') + '</div>';
    if (!S.products.length) h += '<div class="card empty-state"><p>No products yet. Add products manually or paste CSV below.</p></div>';
    S.products.forEach(function (p, i) {
      var pb = 'products.' + i;
      h += '<div class="card product"><div class="card-head"><h3>Product ' + (i + 1) + '</h3>' + btn('Remove', 'removeProduct', p.id, 'small ghost danger') + '</div><div class="ad-editor"><div>' +
        field('Title', input(pb + '.title', { max: 150 })) +
        '<div class="grid3">' + field('Price ($)', input(pb + '.price', { type: 'number', step: 0.01, min: 0 })) + field('Sale price ($, optional)', input(pb + '.salePrice', { type: 'number', step: 0.01, min: 0 })) + field('Typical competitor price ($)', input(pb + '.marketPrice', { type: 'number', step: 0.01, min: 0 }), 'Used to judge price competitiveness.') + '</div>' +
        '<div class="grid3">' + field('Brand', input(pb + '.brand')) + field('GTIN (barcode)', input(pb + '.gtin', { placeholder: '12–14 digits' })) + field('Category / product type', input(pb + '.category')) + '</div>' +
        '<div class="grid2">' + field('Image link', '<div class="row">' + input(pb + '.imageUrl', { placeholder: 'https://…', cls: 'grow' }) + btn('Use generated image', 'genImage', [pb + '.imageUrl'], 'small ghost') + '</div>') + field('Product page link', input(pb + '.link', { placeholder: '/products/…' })) + '</div>' +
        field('Availability', select(pb + '.availability', [['in_stock', 'In stock'], ['out_of_stock', 'Out of stock'], ['preorder', 'Preorder']])) +
        field('Description', textarea(pb + '.description', { rows: 3, max: 5000 })) +
        '</div><div class="ad-side">' + live('fq-' + p.id, function () {
          var q = M.feedQuality(p);
          return '<div class="fq">' + barRow('Feed quality', q.score * 100, 100, Math.round(q.score * 100) + '%', q.score >= 0.75 ? 'good' : q.score >= 0.5 ? 'warning' : 'critical') + '</div>' +
            (q.errors.length ? '<ul class="issues bad">' + q.errors.map(function (e) { return '<li>✕ ' + esc(e) + '</li>'; }).join('') + '</ul>' : '<p class="good-text">✓ Approved</p>') +
            (q.issues.length ? '<ul class="issues">' + q.issues.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' : '') +
            '<div class="shop-row single">' + P.shoppingCard(p, S.account) + '</div>';
        }) + '</div></div></div>';
    });
    h += '<div class="card"><h3>Bulk import (CSV)</h3><p class="help">Columns: title, price, brand, gtin, category, imageUrl, link, description, salePrice, marketPrice. First row may be a header.</p><textarea id="csv-box" rows="4" placeholder="title,price,brand,gtin,category,imageUrl,link,description">' + esc(UI.csv) + '</textarea>' + btn('Import CSV rows', 'importCsv', null, 'small') + '</div>';
    return h;
  }

  // ----- Previews -----
  function viewPreviews() {
    var h = header('Ad previews', 'How your ads could appear across Google Search, the Display Network, YouTube and Shopping.', previewToolbar());
    var any = false;
    S.campaigns.forEach(function (c) {
      var body = '';
      if (c.type === 'search') {
        (c.adGroups || []).forEach(function (g) {
          (g.ads || []).forEach(function (ad) {
            var k = M.adGroupKeywords(g)[0];
            body += '<figure><figcaption>' + esc(g.name) + '</figcaption>' + P.serpPage({ ad: ad, account: S.account, campaign: c, keywords: M.adGroupKeywords(g), device: UI.device, combo: UI.combo, query: k ? k.text : '' }) + '</figure>';
          });
        });
      } else if (c.type === 'display') {
        (c.adGroups || []).forEach(function (g) { (g.ads || []).forEach(function (ad) { body += '<figure><figcaption>' + esc(g.name) + '</figcaption>' + P.displayGallery(ad, S.account, UI.combo) + '</figure>'; }); });
      } else if (c.type === 'video') {
        (c.adGroups || []).forEach(function (g) { (g.ads || []).forEach(function (ad) { body += '<figure><figcaption>' + esc(g.name) + '</figcaption>' + P.videoGallery(ad, c.videoFormat, S.account) + '</figure>'; }); });
      } else if (c.type === 'shopping') {
        body += P.shoppingCarousel(S.products, S.account, (S.products[0] && S.products[0].category) || '');
      }
      if (body) { any = true; h += '<div class="card"><h3>' + typeBadge(c.type) + ' ' + esc(c.name) + '</h3><div class="prev-list">' + body + '</div></div>'; }
    });
    if (!any) h += '<div class="card empty-state"><p>Create a campaign with ads to see previews.</p><a class="btn primary" href="#/campaigns">Go to campaigns</a></div>';
    return h;
  }

  // ----- Simulate -----
  function viewSimulate() {
    var n = S.rounds.length + 1;
    var ev = SC.evaluateSetup(S);
    var enabled = S.campaigns.filter(function (c) { return c.status === 'enabled'; });
    var fails = ev.checks.filter(function (x) { return x.status === 'fail'; });
    var h = header('Run simulation', 'Each round simulates 30 days of auctions against competitors in the ' + esc(industry().name) + ' market.');
    h += '<div class="grid-2-1"><div class="card run-card"><h2>Round ' + n + '</h2>' +
      '<p>The simulator will: estimate search demand for your keywords and audiences → run ad auctions (your bid × Quality Score × assets vs. competitors) → apply your budget → generate clicks, conversions, revenue and website traffic → score your setup and results → give feedback.</p>' +
      '<div class="preflight"><div>' + ring(ev.score, 'Setup score now', 110) + '</div><div><p><b>' + enabled.length + '</b> enabled campaign(s), total budget <b>' + fMoney(U.sum(enabled, function (c) { return Number(c.dailyBudget) || 0; })) + '/day</b>.</p>' +
      (fails.length ? '<p class="warn-text">' + fails.length + ' setup check(s) failing — the round will still run, but expect weaker results.</p><ul class="issues">' + fails.slice(0, 5).map(function (f) { return '<li>' + esc(f.title) + (f.campaign ? ' <span class="muted">(' + esc(f.campaign) + ')</span>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="good-text">✓ No failing setup checks.</p>') +
      '</div></div>' + (enabled.length ? btn('▶ Run round ' + n + ' (30 days)', 'runRound', null, 'primary big') : '<p class="bad-text">Enable at least one campaign to run a round.</p>') + '</div>' +
      '<div class="card"><h3>Tips</h3><ul class="tips"><li>Change one or two things per round so you can tell what worked.</li><li>Smart Bidding needs a round to learn after you change it.</li><li>Check Reports → Search terms after every round and add negatives.</li><li>Market conditions (competition, seasonality) shift a little each round.</li></ul></div></div>';
    if (S.rounds.length) {
      h += '<div class="card"><h3>Round history</h3>' + dataTable('rounds', [
        { key: 'round', label: 'Round', fmt: function (r) { return 'R' + r.round; } },
        { key: 'score', label: 'Score', num: true, sort: function (r) { return r.score.overall; }, fmt: function (r) { return r.score.overall + ' (' + r.score.grade + ')'; } },
        { key: 'setup', label: 'Setup', num: true, sort: function (r) { return r.score.setup; }, fmt: function (r) { return r.score.setup; } },
        { key: 'perf', label: 'Performance', num: true, sort: function (r) { return r.score.performance; }, fmt: function (r) { return r.score.performance; } },
        { key: 'clicks', label: 'Clicks', num: true, sort: function (r) { return r.totals.clicks; }, fmt: function (r) { return fInt(r.totals.clicks); } },
        { key: 'cost', label: 'Cost', num: true, sort: function (r) { return r.totals.cost; }, fmt: function (r) { return fMoney(r.totals.cost); } },
        { key: 'conv', label: 'Conv.', num: true, sort: function (r) { return r.totals.conversions; }, fmt: function (r) { return convCell(r, r.totals.conversions); } },
        { key: 'value', label: 'Revenue (est.)', num: true, sort: function (r) { return r.totals.value; }, fmt: function (r) { return fMoney0(r.totals.value); } },
        { key: 'roas', label: 'ROAS', num: true, sort: function (r) { return r.totals.roas; }, fmt: function (r) { return fX(r.totals.roas); } },
        { key: 'profit', label: 'Profit (est.)', num: true, sort: function (r) { return r.score.profit; }, fmt: function (r) { return fMoney0(r.score.profit); } }
      ], S.rounds) + '</div>';
    }
    return h;
  }

  // ----- Reports -----
  var REPORT_TABS = [['campaigns', 'Campaigns'], ['adgroups', 'Ad groups'], ['keywords', 'Keywords'], ['terms', 'Search terms'], ['audiences', 'Audiences & placements'], ['products', 'Products'], ['devices', 'Devices'], ['analytics', 'Website analytics'], ['daily', 'Daily']];

  function viewReports() {
    var r = currentRound();
    if (!r) return header('Reports') + '<div class="card empty-state"><p>Run a simulation round to see reports.</p><a class="btn primary" href="#/simulate">Run simulation</a></div>';
    var tab = UI.params[0] || 'campaigns';
    var h = header('Reports', 'Round ' + r.round + ' · 30 days' + (r.tracked ? '' : ' · <span class="warn-text">Conversion tracking was off — conversion columns are empty</span>'), roundSelect());
    h += '<nav class="tabs">' + REPORT_TABS.map(function (t) { return '<a href="#/reports/' + t[0] + '" class="' + (tab === t[0] ? 'active' : '') + '">' + t[1] + '</a>'; }).join('') + '</nav>';
    var metricCols = function (extra) {
      return [
        { key: 'impressions', label: 'Impr.', num: true, fmt: function (x) { return fInt(x.impressions); } },
        { key: 'clicks', label: 'Clicks', num: true, fmt: function (x) { return fInt(x.clicks); } },
        { key: 'ctr', label: 'CTR', num: true, fmt: function (x) { return fPct(x.ctr); } },
        { key: 'cpc', label: 'Avg. CPC', num: true, fmt: function (x) { return fMoney(x.cpc); } },
        { key: 'cost', label: 'Cost', num: true, fmt: function (x) { return fMoney(x.cost); } },
        { key: 'conversions', label: 'Conv.', num: true, fmt: function (x) { return convCell(r, x.conversions); } },
        { key: 'cvr', label: 'Conv. rate', num: true, fmt: function (x) { return r.tracked ? fPct(x.cvr) : '—'; } },
        { key: 'cpa', label: 'Cost / conv.', num: true, fmt: function (x) { return r.tracked ? (x.conversions ? fMoney(x.cpa) : '—') : '—'; } },
        { key: 'value', label: 'Conv. value', num: true, fmt: function (x) { return r.tracked ? fMoney(x.value) : '—'; } },
        { key: 'roas', label: 'ROAS', num: true, fmt: function (x) { return r.tracked ? fX(x.roas) : '—'; } }
      ].concat(extra || []);
    };
    var t = r.totals;
    var totalsRow = { impressions: fInt(t.impressions), clicks: fInt(t.clicks), ctr: fPct(t.ctr), cpc: fMoney(t.cpc), cost: fMoney(t.cost), conversions: convCell(r, t.conversions), cvr: r.tracked ? fPct(t.cvr) : '—', cpa: r.tracked ? fMoney(t.cpa) : '—', value: r.tracked ? fMoney(t.value) : '—', roas: r.tracked ? fX(t.roas) : '—' };
    var body = '';
    if (tab === 'campaigns') {
      body = dataTable('rep-campaigns', [
        { key: 'name', label: 'Campaign', fmt: function (x) { return '<b>' + esc(x.name) + '</b>' + (x.errors.length ? '<div class="bad-text small">' + esc(x.errors[0]) + '</div>' : ''); } },
        { key: 'type', label: 'Type', fmt: function (x) { return typeBadge(x.type); } },
        { key: 'status', label: 'Status', fmt: function (x) { return '<span class="chip ' + (x.status === 'Eligible' ? 'good' : x.status === 'Not running' ? 'critical' : 'warning') + '">' + esc(x.status) + '</span>'; } },
        { key: 'dailyBudget', label: 'Budget/day', num: true, fmt: function (x) { return fMoney(x.dailyBudget); } }
      ].concat(metricCols([
        { key: 'impressionShare', label: 'Impr. share', num: true, title: 'Share of eligible impressions you received', fmt: function (x) { return x.type === 'search' || x.type === 'shopping' ? fPct(x.impressionShare, 1) : '—'; } },
        { key: 'lostIsBudget', label: 'Lost IS (budget)', num: true, fmt: function (x) { return x.lostIsBudget != null ? fPct(x.lostIsBudget, 1) : '—'; } },
        { key: 'lostIsRank', label: 'Lost IS (rank)', num: true, fmt: function (x) { return x.lostIsRank != null ? fPct(x.lostIsRank, 1) : '—'; } }
      ])), r.campaigns, { totals: Object.assign({ name: '<b>Total</b>' }, totalsRow) });
      var vids = r.campaigns.filter(function (c) { return c.type === 'video' && !c.errors.length; });
      if (vids.length) body += '<h3 class="section">Video metrics</h3>' + dataTable('rep-video', [
        { key: 'name', label: 'Campaign' }, { key: 'format', label: 'Format', fmt: function (x) { return esc(D.VIDEO_FORMATS[x.format].name); } },
        { key: 'impressions', label: 'Impr.', num: true, fmt: function (x) { return fInt(x.impressions); } }, { key: 'views', label: 'Views', num: true, fmt: function (x) { return fInt(x.views); } },
        { key: 'viewRate', label: 'View rate', num: true, fmt: function (x) { return fPct(x.viewRate, 1); } }, { key: 'cpv', label: 'Avg. CPV', num: true, fmt: function (x) { return fMoney(x.cpv); } },
        { key: 'cpm', label: 'Avg. CPM', num: true, fmt: function (x) { return fMoney(x.cpm); } }, { key: 'reach', label: 'Unique reach', num: true, fmt: function (x) { return fInt(x.reach); } },
        { key: 'frequency', label: 'Avg. frequency', num: true, fmt: function (x) { return fNum(x.frequency); } }, { key: 'earnedViews', label: 'Earned views', num: true, fmt: function (x) { return fInt(x.earnedViews); } },
        { key: 'adRecallLift', label: 'Ad recall lift (est.)', num: true, fmt: function (x) { return '+' + fNum(x.adRecallLift) + ' pts'; } },
        { key: 'clicks', label: 'Clicks', num: true, fmt: function (x) { return fInt(x.clicks); } }, { key: 'viewThrough', label: 'View-through conv.', num: true, fmt: function (x) { return convCell(r, x.viewThrough); } }
      ], vids);
      var disp = r.campaigns.filter(function (c) { return c.type === 'display' && !c.errors.length; });
      if (disp.length) body += '<h3 class="section">Display reach</h3>' + dataTable('rep-display', [
        { key: 'name', label: 'Campaign' }, { key: 'reach', label: 'Unique reach', num: true, fmt: function (x) { return fInt(x.reach); } }, { key: 'frequency', label: 'Avg. frequency', num: true, fmt: function (x) { return fNum(x.frequency); } },
        { key: 'cpm', label: 'Avg. CPM', num: true, fmt: function (x) { return fMoney(x.cpm); } }, { key: 'viewThrough', label: 'View-through conv.', num: true, fmt: function (x) { return convCell(r, x.viewThrough); } }
      ], disp);
    }
    if (tab === 'adgroups') {
      body = dataTable('rep-adgroups', [
        { key: 'campaign', label: 'Campaign' }, { key: 'name', label: 'Ad group' },
        { key: 'adStrength', label: 'Ad strength', fmt: function (x) { return x.adStrength ? esc(x.adStrength) : '—'; } }
      ].concat(metricCols()), r.adGroups);
    }
    if (tab === 'keywords') {
      body = '<p class="help">Quality Score (1–10) = expected CTR + ad relevance + landing page experience. ' + guideLink('QS-1') + '</p>' + dataTable('rep-keywords', [
        { key: 'text', label: 'Keyword', fmt: function (x) { return '<b>' + esc(U.formatKeyword(x)) + '</b>' + (x.duplicate ? ' <span class="chip warning">Duplicate</span>' : ''); } },
        { key: 'adGroup', label: 'Ad group' },
        { key: 'qs', label: 'Quality Score', num: true, fmt: function (x) { return '<span class="qs qs' + (x.qs >= 7 ? 'hi' : x.qs >= 5 ? 'mid' : 'lo') + '">' + x.qs + '/10</span>'; } },
        { key: 'expCtr', label: 'Exp. CTR', fmt: function (x) { return compLabel(x.expCtr); } },
        { key: 'adRel', label: 'Ad relevance', fmt: function (x) { return compLabel(x.adRel); } },
        { key: 'lp', label: 'Landing page exp.', fmt: function (x) { return compLabel(x.lp); } }
      ].concat(metricCols([
        { key: 'impressionShare', label: 'Impr. share', num: true, fmt: function (x) { return fPct(x.impressionShare, 1); } },
        { key: 'absTop', label: 'Abs. top %', num: true, fmt: function (x) { return fPct(x.absTop, 0); } },
        { key: 'firstPageBid', label: 'First page bid (est.)', num: true, fmt: function (x) { return fMoney(x.firstPageBid); } },
        { key: 'topPageBid', label: 'Top of page bid (est.)', num: true, fmt: function (x) { return fMoney(x.topPageBid); } }
      ])), r.keywords, { empty: 'No Search keywords this round.' });
    }
    if (tab === 'terms') {
      var terms = r.searchTerms;
      if (UI.stFilter === 'waste') terms = terms.filter(function (s) { return !s.excluded && s.conversions === 0 && s.cost > 0; });
      if (UI.stFilter === 'converting') terms = terms.filter(function (s) { return s.conversions > 0; });
      body = '<p class="help">What people actually searched before seeing your ad. Add irrelevant terms as negatives; add converting ones as keywords. ' + guideLink('KW-2') + '</p>' +
        '<div class="row filter">Show: ' + [['all', 'All'], ['waste', 'Spend with no conversions'], ['converting', 'Converting']].map(function (f) { return btn(f[1], 'stFilter', f[0], 'small ' + (UI.stFilter === f[0] ? 'primary' : 'ghost')); }).join('') + '</div>' +
        dataTable('rep-terms', [
          { key: 'term', label: 'Search term', fmt: function (x) { return '<b>' + esc(x.term) + '</b>' + (x.excluded ? ' <span class="chip neutral">Excluded by negative</span>' : ''); } },
          { key: 'keyword', label: 'Matched keyword', fmt: function (x) { return esc(x.keyword); } },
          { key: 'campaign', label: 'Campaign' },
          { key: 'intent', label: 'Intent', fmt: function (x) { return intentChip(x.intent); } },
          { key: 'relevance', label: 'Relevance', num: true, fmt: function (x) { return Math.round(x.relevance * 100) + '%'; } }
        ].concat(metricCols().slice(0, 7)).concat([{
          key: 'act', label: 'Actions', fmt: function (x) {
            if (x.excluded) return '';
            var c = campById(x.campaignId);
            if (!c) return '';
            var already = U.parseKeywordList(c.negativesText).some(function (n) { return n.text === x.term; });
            return (already ? '<span class="muted">negative added</span>' : btn('− Negative', 'addNegative', [x.campaignId, x.term], 'small ghost')) + (x.type === 'search' && x.adGroupId ? btn('＋ Keyword', 'addKeyword', [x.campaignId, x.adGroupId, x.term], 'small ghost') : '');
          }, csv: function () { return ''; }
        }]), terms, { rowClass: function (x) { return x.excluded ? 'dim' : (!x.conversions && x.cost > 0 && (x.intent === 'low' || x.relevance < 0.35)) ? 'waste' : ''; }, empty: 'No search terms (Search/Shopping campaigns only).' });
    }
    if (tab === 'audiences') {
      body = '<h3 class="section">Audience & content segments</h3>' + dataTable('rep-aud', [
        { key: 'campaign', label: 'Campaign' }, { key: 'adGroup', label: 'Ad group' }, { key: 'segment', label: 'Segment' }, { key: 'type', label: 'Type' },
        { key: 'relevance', label: 'Relevance', num: true, fmt: function (x) { return Math.round(x.relevance * 100) + '%'; } },
        { key: 'frequency', label: 'Frequency', num: true, fmt: function (x) { return fNum(x.frequency); } }
      ].concat(metricCols()), r.audiences, { empty: 'No Display or Video campaigns this round.' }) +
        '<h3 class="section">Where ads showed (placements)</h3>' + dataTable('rep-pl', [
          { key: 'placement', label: 'Placement', fmt: function (x) { return esc(x.placement) + (x.kind === 'app' ? ' <span class="chip warning">App</span>' : x.kind === 'expansion' ? ' <span class="chip warning">From Search</span>' : ''); } },
          { key: 'campaign', label: 'Campaign' }
        ].concat(metricCols().slice(0, 8)), r.placements, { empty: 'No placements this round.' });
    }
    if (tab === 'products') {
      body = dataTable('rep-products', [
        { key: 'title', label: 'Product', fmt: function (x) { return esc(M.fit(x.title || '(no title)', 60)) + (!x.approved ? ' <span class="chip critical">Disapproved</span>' : x.excluded ? ' <span class="chip neutral">Excluded</span>' : ''); } },
        { key: 'feedScore', label: 'Feed quality', num: true, fmt: function (x) { return Math.round(x.feedScore * 100) + '%'; } }
      ].concat(metricCols()), r.products, { empty: 'No Shopping campaigns this round.' });
    }
    if (tab === 'devices') {
      body = dataTable('rep-devices', [{ key: 'device', label: 'Device', fmt: function (x) { return esc(x.device.charAt(0).toUpperCase() + x.device.slice(1)); } }].concat(metricCols()), r.devices) +
        '<p class="help">Adjust device bids in each campaign\'s Settings if one device converts much better or worse. ' + guideLink('TGT-2') + '</p>';
    }
    if (tab === 'analytics') {
      var ga = r.analytics;
      body = '<p class="help">Website analytics (GA4-style) for all traffic, including organic and direct visits influenced by your advertising.</p><div class="kpis">' +
        [['Users', fInt(ga.users)], ['New users', fInt(ga.newUsers)], ['Sessions', fInt(ga.sessions)], ['Engagement rate', fPct(ga.engagementRate, 1)], ['Bounce rate', fPct(ga.bounceRate, 1)],
          ['Avg. engagement time', Math.round(ga.avgEngagementTime) + 's'], ['Pages / session', fNum(ga.pagesPerSession, 2)], ['Key events (conversions)', r.tracked ? fInt(ga.conversions) : '—'], ['Revenue', r.tracked ? fMoney0(ga.value) : '—']].map(function (k) {
          return '<div class="kpi"><span>' + k[0] + '</span><b>' + k[1] + '</b></div>';
        }).join('') + '</div>' +
        '<h3 class="section">Traffic by channel</h3>' + dataTable('rep-ga', [
          { key: 'channel', label: 'Channel', fmt: function (x) { return esc(x.channel) + (x.paid ? ' <span class="chip info">Paid</span>' : ''); } },
          { key: 'users', label: 'Users', num: true, fmt: function (x) { return fInt(x.users); } }, { key: 'sessions', label: 'Sessions', num: true, fmt: function (x) { return fInt(x.sessions); } },
          { key: 'engagementRate', label: 'Engagement rate', num: true, fmt: function (x) { return fPct(x.engagementRate, 1); } }, { key: 'bounceRate', label: 'Bounce rate', num: true, fmt: function (x) { return fPct(x.bounceRate, 1); } },
          { key: 'avgEngagementTime', label: 'Avg. engagement time', num: true, fmt: function (x) { return Math.round(x.avgEngagementTime) + 's'; } }, { key: 'pagesPerSession', label: 'Pages/session', num: true, fmt: function (x) { return fNum(x.pagesPerSession, 2); } },
          { key: 'conversions', label: 'Conversions', num: true, fmt: function (x) { return convCell(r, x.conversions); } }, { key: 'conversionRate', label: 'Conv. rate', num: true, fmt: function (x) { return r.tracked ? fPct(x.conversionRate) : '—'; } },
          { key: 'value', label: 'Revenue', num: true, fmt: function (x) { return r.tracked ? fMoney0(x.value) : '—'; } }
        ], ga.channels) +
        '<h3 class="section">Top landing pages (paid traffic)</h3>' + dataTable('rep-lp', [{ key: 'url', label: 'Landing page', fmt: function (x) { return esc(x.url); } }, { key: 'sessions', label: 'Sessions', num: true, fmt: function (x) { return fInt(x.sessions); } }], ga.landingPages);
    }
    if (tab === 'daily') {
      body = '<div class="grid2">' +
        lineChart('d-impr', r.daily.map(function (d) { return { label: 'Day ' + d.day, y: d.impressions }; }), { title: 'Impressions', name: 'Impressions', color: '--series-1' }) +
        lineChart('d-clicks', r.daily.map(function (d) { return { label: 'Day ' + d.day, y: d.clicks }; }), { title: 'Clicks', name: 'Clicks', color: '--series-1' }) +
        lineChart('d-cost', r.daily.map(function (d) { return { label: 'Day ' + d.day, y: d.cost }; }), { title: 'Cost', name: 'Cost', color: '--series-2', fmt: fMoney, fmtAxis: function (v) { return '$' + Math.round(v); } }) +
        lineChart('d-conv', r.daily.map(function (d) { return { label: 'Day ' + d.day, y: r.tracked ? d.conversions : 0 }; }), { title: 'Conversions' + (r.tracked ? '' : ' (not tracked)'), name: 'Conversions', color: '--series-3', fmt: function (v) { return fNum(v, 1); } }) +
        '</div>' + dataTable('rep-daily', [{ key: 'day', label: 'Day' }, { key: 'impressions', label: 'Impr.', num: true, fmt: function (x) { return fInt(x.impressions); } }, { key: 'clicks', label: 'Clicks', num: true, fmt: function (x) { return fInt(x.clicks); } }, { key: 'cost', label: 'Cost', num: true, fmt: function (x) { return fMoney(x.cost); } }, { key: 'conversions', label: 'Conv.', num: true, fmt: function (x) { return convCell(r, x.conversions, function (v) { return fNum(v, 1); }); } }], r.daily);
    }
    return h + '<div class="card">' + body + '</div>';
  }

  function compLabel(s) {
    var m = { 'Above average': 'good', 'Average': 'neutral', 'Below average': 'critical' }[s] || 'neutral';
    return '<span class="chip ' + m + '">' + esc(s) + '</span>';
  }

  // ----- Feedback -----
  function feedbackItem(f) {
    return '<div class="fb-item sev-' + f.severity + '"><div class="fb-head">' + sevChip(f.severity) + ' <span class="fb-area">' + esc(f.area) + '</span> ' + guideLink(f.guide) + '</div><div class="fb-title">' + esc(f.title) + '</div><div class="fb-detail">' + esc(f.detail) + '</div>' + (f.action ? '<div class="fb-action"><b>What to do:</b> ' + esc(f.action) + '</div>' : '') + '</div>';
  }

  function viewFeedback() {
    var r = currentRound();
    if (!r) return header('Score & feedback') + '<div class="card empty-state"><p>Run a round to get your score and feedback. Meanwhile, here is your current setup checklist.</p><a class="btn primary" href="#/simulate">Run simulation</a></div>' + setupChecklist(SC.evaluateSetup(S).checks, 'Current setup checklist');
    var sc = r.score;
    var acc = r.accountSnapshot || S.account;
    var h = header('Score & feedback', 'Round ' + r.round + ' results and coaching', roundSelect() + btn('⬇ Download PDF report', 'downloadPdf', null, 'primary') + (FRAMED ? '' : '<button class="btn ghost" data-action="print">🖨 Print</button>'));
    var t = r.totals;
    h += '<div class="card score-hero"><div class="score-rings">' + ring(sc.overall, 'Overall · grade ' + sc.grade, 140) + ring(sc.setup, 'Setup (45%)', 110) + ring(sc.performance, 'Performance (55%)', 110) + '</div>' +
      '<div class="money"><div><span>Revenue (est.)</span><b>' + fMoney0(t.value) + '</b></div><div><span>Ad cost</span><b>' + fMoney0(t.cost) + '</b></div><div><span>Profit after ads (est.)</span><b class="' + (sc.profit >= 0 ? 'good-text' : 'bad-text') + '">' + fMoney0(sc.profit) + '</b></div><div><span>ROAS</span><b>' + fX(t.roas) + '</b><small>break-even ' + fX(sc.breakEvenRoas) + '</small></div><div><span>Conversions</span><b>' + fInt(t.conversions) + '</b>' + (r.tracked ? '' : '<small class="warn-text">estimated — not tracked</small>') + '</div></div>' +
      (r.events.length ? '<ul class="events">' + r.events.map(function (e) { return '<li>🌐 ' + esc(e) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    h += '<div class="grid2"><div class="card"><h3>Setup score by area</h3><p class="muted">How well your setup follows the baseline guidelines.</p>' +
      sc.categories.filter(function (c) { return c.score != null; }).map(function (c) { return barRow(esc(c.name), c.score, 100, c.score + '%', c.score >= 80 ? 'good' : c.score >= 50 ? 'warning' : 'critical'); }).join('') + '</div>' +
      '<div class="card"><h3>Performance score breakdown</h3><p class="muted">How your results compare to benchmarks and your profit goal.</p>' +
      sc.performanceParts.map(function (p) { return barRow(esc(p.name) + '<small>' + esc(p.note) + '</small>', p.pts, p.max, p.pts + ' / ' + p.max, p.pts / p.max >= 0.75 ? 'good' : p.pts / p.max >= 0.45 ? 'warning' : 'critical'); }).join('') + '</div></div>';
    var groups = ['critical', 'warning', 'opportunity', 'info', 'success'];
    h += '<div class="card"><h3>Feedback & next steps</h3>' + groups.map(function (g) {
      var items = r.feedback.filter(function (f) { return f.severity === g; });
      return items.length ? '<h4>' + SEV[g][2] + ' (' + items.length + ')</h4>' + items.map(feedbackItem).join('') : '';
    }).join('') + '</div>';
    h += setupChecklist(r.setupChecks, 'Setup checklist at round ' + r.round);
    return h;
  }

  function setupChecklist(checks, title) {
    var byCat = {};
    checks.forEach(function (c) { (byCat[c.cat] = byCat[c.cat] || []).push(c); });
    return '<div class="card"><h3>' + esc(title) + '</h3>' + SC.CATS.filter(function (c) { return byCat[c]; }).map(function (cat) {
      var items = byCat[cat];
      var pass = items.filter(function (x) { return x.status === 'pass'; }).length;
      return '<details' + (pass < items.length ? ' open' : '') + '><summary><b>' + esc(cat) + '</b> — ' + pass + '/' + items.length + ' passing</summary>' + items.map(function (x) {
        return '<div class="check-item ' + x.status + '">' + statusChip(x.status) + ' <b>' + esc(x.title) + '</b>' + (x.campaign ? ' <span class="muted">· ' + esc(x.campaign) + '</span>' : '') + ' ' + guideLink(x.guide) + '<div class="muted">' + esc(x.detail) + '</div>' + (x.status !== 'pass' ? '<div class="fix">→ ' + esc(x.fix) + '</div>' : '') + '</div>';
      }).join('') + '</details>';
    }).join('') + '</div>';
  }

  // ----- Guidelines -----
  function viewGuidelines() {
    var focus = UI.params[0];
    var cats = U.uniq(D.GUIDELINES.map(function (g) { return g.cat; }));
    return header('Baseline guidelines', 'The best practices the simulator uses to score setups and write feedback. They summarize widely published Google Ads recommendations.') +
      cats.map(function (cat) {
        return '<div class="card"><h3>' + esc(cat) + '</h3>' + D.GUIDELINES.filter(function (g) { return g.cat === cat; }).map(function (g) {
          return '<div class="guide' + (focus === g.id ? ' focus' : '') + '" id="g-' + g.id + '"><span class="gid">' + g.id + '</span><div><b>' + esc(g.title) + '</b><p>' + esc(g.text) + '</p></div></div>';
        }).join('') + '</div>';
      }).join('') +
      '<div class="card"><h3>How the simulator works</h3><ul class="tips">' +
      '<li><b>Ad Rank</b> = effective bid × Quality Score × (1 + asset boost). You win an impression when your Ad Rank beats competitors\'.</li>' +
      '<li><b>Actual CPC</b> ≈ the Ad Rank needed to beat the next advertiser ÷ your Quality Score (never above your max bid) — higher Quality Score means cheaper clicks.</li>' +
      '<li><b>Impression share</b> is limited by Ad Rank (lost IS rank) and by budget (lost IS budget).</li>' +
      '<li><b>Search terms</b>: exact match shows on the keyword\'s meaning; phrase adds modifiers; broad adds related and irrelevant searches. Negatives block them.</li>' +
      '<li><b>Conversion rate</b> depends on search intent, keyword relevance to your business, landing page, location fit, device and schedule.</li>' +
      '<li><b>Display/Video reach</b> depends on audience size, demographics, and your bid vs. market CPM; frequency above ~10/month causes fatigue.</li>' +
      '<li><b>Shopping</b> visibility depends on feed quality (titles, GTIN, images), price competitiveness and bids.</li>' +
      '<li>Each round has small random market changes (competition, seasonality). Results for the same setup in the same round are reproducible.</li></ul></div>';
  }

  // ----- Settings -----
  function viewSettings() {
    return header('Settings') + '<div class="grid2"><div class="card"><h3>Student</h3>' + field('Your name (appears on exports and printed reports)', input('student', { placeholder: 'Name' })) +
      field('Simulation seed', input('seed', { type: 'number' }), 'Instructors can give every student the same seed so market conditions match.') + '</div>' +
      '<div class="card"><h3>Save & share</h3><p>Your work is saved automatically in this browser. Export a file to submit it or move to another computer.</p><div class="row wrap">' +
      btn('⬇ Export project (.json)', 'exportJson', null, 'primary') + (S.rounds.length ? btn('⬇ Results overview (PDF)', 'downloadPdf') : '') + '<label class="btn">⬆ Import project<input type="file" accept="application/json,.json" data-action-change="importJson" hidden></label>' + (FRAMED ? '' : btn('🖨 Print latest report', 'print')) + '</div></div>' +
      '<div class="card"><h3>Reset</h3><p>Clear simulation rounds but keep your campaigns, or start over completely.</p><div class="row wrap">' + btn('Clear rounds', 'resetRounds', null, 'ghost danger') + btn('Start over', 'resetAll', null, 'danger') + '</div></div>' +
      '<div class="card"><h3>About</h3><p>Digital Ad Lab is a teaching simulator. Results are modeled estimates based on approximate industry benchmarks and baseline best practices — not real Google Ads data. Google Ads, YouTube and Google Shopping are trademarks of Google LLC; this project is not affiliated with Google.</p></div></div>';
  }

  // ---------------------------------------------------------------------------
  // Render & routing
  // ---------------------------------------------------------------------------

  function parseRoute() {
    var h = (location.hash || '#/overview').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    UI.route = parts[0] || 'overview';
    UI.params = parts.slice(1).map(decodeURIComponent);
  }

  var VIEWS = {
    overview: viewOverview, setup: viewSetup, campaigns: viewCampaigns, campaign: viewCampaign, feed: viewFeed, previews: viewPreviews,
    simulate: viewSimulate, reports: viewReports, feedback: viewFeedback, guidelines: viewGuidelines, settings: viewSettings
  };

  function render(keepScroll) {
    var y = window.scrollY;
    LIVE = {};
    CHARTS = {};
    TABLES = {};
    renderNav();
    var v = VIEWS[UI.route] || viewOverview;
    var main = document.getElementById('main');
    main.innerHTML = v();
    document.title = 'Digital Ad Lab · ' + ((NAV.find(function (n) { return n[0] === UI.route; }) || [0, 0, 'Campaign editor'])[2]);
    wireImages(main);
    if (keepScroll) window.scrollTo(0, y);
    if (UI.route === 'guidelines' && UI.params[0]) {
      var el = document.getElementById('g-' + UI.params[0]);
      if (el) el.scrollIntoView({ block: 'center' });
    }
  }

  function wireImages(rootEl) {
    rootEl.querySelectorAll('img[data-fallback]').forEach(function (im) {
      im.addEventListener('error', function () { if (im.src !== im.dataset.fallback) im.src = im.dataset.fallback; }, { once: true });
    });
  }

  var liveQueued = false;
  function refreshLive() {
    if (liveQueued) return;
    liveQueued = true;
    requestAnimationFrame(function () {
      liveQueued = false;
      document.querySelectorAll('[data-live]').forEach(function (el) {
        var fn = LIVE[el.dataset.live];
        if (fn) { el.innerHTML = fn(); wireImages(el); }
      });
    });
  }

  function applyBind(el) {
    var path = el.dataset.bind;
    var type = el.dataset.type;
    var v;
    if (type === 'bool') v = el.checked;
    else if (type === 'number') v = el.value === '' ? 0 : parseFloat(el.value);
    else if (type === 'percent') v = (parseFloat(el.value) || 0) / 100;
    else v = el.value;
    if (typeof v === 'number' && isNaN(v)) v = 0;
    setPath(S, path, v);
  }

  function updateCounter(el) {
    var max = Number(el.dataset.max);
    if (!max) return;
    var wrap = el.closest('.counted');
    var counter = wrap ? wrap.querySelector('.counter') : el.nextElementSibling;
    if (counter && counter.classList.contains('counter')) counter.textContent = el.value.length + '/' + max;
    if (wrap) {
      wrap.classList.toggle('over', el.value.length > max);
      var input = wrap.querySelector('input');
      var kind = /headlines\.\d+$|headline$/.test(el.dataset.bind) ? 'headline' : 'description';
      var issues = /headlines|descriptions|Headline|headline|description/.test(el.dataset.bind) ? M.policyIssues(el.value, kind) : [];
      wrap.classList.toggle('policy', issues.length > 0);
      var flag = wrap.querySelector('.policy-flag');
      if (flag) { flag.textContent = issues.length ? '⚠ ' + issues[0] : ''; flag.title = issues[0] || ''; }
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function ensureBusiness() {
    if (needsBusiness()) { toast('Set up your business name and website first.'); location.hash = '#/setup'; return false; }
    return true;
  }

  var ACTIONS = {
    applyTemplate: function (el, id) {
      var t = D.TEMPLATES.find(function (x) { return x.id === id; });
      if (!t) return;
      if ((S.campaigns.length || S.rounds.length) && !armed(el, 'Replace my work with this demo?')) return;
      S = M.applyTemplate(S, t);
      UI.scan = { status: '✓ Loaded demo business "' + esc(t.account.businessName) + '".' };
      save(); render();
    },
    quickStart: function () {
      if (!ensureBusiness()) return;
      var c = M.quickStartSearch(S);
      S.campaigns.push(c);
      save();
      toast('Starter Search campaign created. Now improve it!');
      location.hash = '#/campaign/' + c.id + '/settings';
    },
    newCampaign: function () {
      if (!ensureBusiness()) return;
      UI.newCamp = { goal: S.account.goal, type: null };
      if (UI.route !== 'campaigns') location.hash = '#/campaigns'; else render();
    },
    pickGoal: function (el, g) { UI.newCamp.goal = g; render(true); },
    pickType: function (el, t) { UI.newCamp.type = t; render(true); },
    cancelNew: function () { UI.newCamp = null; render(); },
    createCampaign: function () {
      var nc = UI.newCamp;
      if (!nc || !nc.type) { toast('Choose a campaign type.'); return; }
      var c = M.newCampaign(nc.type, S, nc.goal);
      S.campaigns.push(c);
      UI.newCamp = null;
      save();
      location.hash = '#/campaign/' + c.id + '/settings';
    },
    toggleCampaign: function (el, id) { var c = campById(id); c.status = c.status === 'enabled' ? 'paused' : 'enabled'; save(); render(true); },
    dupCampaign: function (el, id) {
      var c = U.deepClone(campById(id));
      c.id = U.uid('cmp'); c.name += ' (copy)';
      (c.adGroups || []).forEach(function (g) { g.id = U.uid('ag'); });
      S.campaigns.splice(campIndex(id) + 1, 0, c);
      save(); render(true);
    },
    deleteCampaign: function (el, id) {
      var c = campById(id);
      if (!armed(el, 'Confirm delete')) return;
      S.campaigns.splice(campIndex(id), 1);
      save(); render(true);
    },
    addAdGroup: function (el, cid) {
      var c = campById(cid);
      var g = M.newAdGroup(c.type, S, 'Ad group ' + (c.adGroups.length + 1));
      c.adGroups.push(g);
      save(); render(true);
    },
    removeAdGroup: function (el, args) {
      var c = campById(args[0]);
      if (!armed(el, 'Confirm remove')) return;
      c.adGroups = c.adGroups.filter(function (g) { return g.id !== args[1]; });
      save(); render(true);
    },
    addAd: function (el, args) {
      var c = campById(args[0]);
      var g = c.adGroups.find(function (x) { return x.id === args[1]; });
      g.ads.push(c.type === 'search' ? M.newRSA(S) : c.type === 'display' ? M.newRDA(S) : M.newVideoAd(S));
      save(); render(true);
    },
    removeAd: function (el, args) {
      var c = campById(args[0]);
      var g = c.adGroups.find(function (x) { return x.id === args[1]; });
      g.ads.splice(args[2], 1);
      save(); render(true);
    },
    addSitelink: function (el, cid) { campById(cid).assets.sitelinks.push({ text: '', d1: '', d2: '', url: S.account.website }); save(); render(true); },
    removeSitelink: function (el, args) { campById(args[0]).assets.sitelinks.splice(args[1], 1); save(); render(true); },
    fillSitelinks: function (el, cid) {
      var c = campById(cid);
      var have = c.assets.sitelinks.map(function (s) { return s.text; });
      (S.scan.links || []).forEach(function (l) {
        if (c.assets.sitelinks.length >= 6 || have.indexOf(M.fit(l.text, 25)) >= 0) return;
        c.assets.sitelinks.push({ text: M.fit(l.text, 25), d1: '', d2: '', url: M.absoluteUrl(S.account.website, l.url) });
      });
      save(); render(true);
      toast('Sitelinks added — write the two description lines for each.');
    },
    addProductGroup: function (el, cid) { campById(cid).productGroups.push({ id: U.uid('pg'), dimension: 'category', value: '', bid: 0.8, excluded: false }); save(); render(true); },
    removeProductGroup: function (el, args) { campById(args[0]).productGroups.splice(args[1], 1); save(); render(true); },
    addProduct: function () { S.products.push(M.newProduct()); save(); render(true); },
    removeProduct: function (el, id) { S.products = S.products.filter(function (p) { return p.id !== id; }); save(); render(true); },
    importCsv: function () {
      var txt = document.getElementById('csv-box').value;
      UI.csv = txt;
      var rows = parseCsv(txt);
      if (rows.length && /title/i.test(rows[0][0])) rows.shift();
      var n = 0;
      rows.forEach(function (r) {
        if (!r[0]) return;
        var p = M.newProduct();
        p.title = r[0]; p.price = parseFloat(r[1]) || 0; p.brand = r[2] || ''; p.gtin = r[3] || ''; p.category = r[4] || ''; p.imageUrl = r[5] || ''; p.link = r[6] || ''; p.description = r[7] || '';
        p.salePrice = parseFloat(r[8]) || 0; p.marketPrice = parseFloat(r[9]) || 0;
        S.products.push(p); n++;
      });
      UI.csv = '';
      save(); render(true); toast(n + ' product(s) imported.');
    },
    genImage: function (el, args) {
      setPath(S, args[0], 'generated');
      save(); render(true);
    },
    toggleDevice: function () { UI.device = UI.device === 'desktop' ? 'mobile' : 'desktop'; render(true); },
    shuffle: function () { UI.combo++; refreshLive(); if (UI.route === 'previews') render(true); },
    runRound: function () {
      var btnEl = document.querySelector('[data-action="runRound"]');
      if (btnEl) { btnEl.textContent = 'Simulating 30 days…'; btnEl.disabled = true; }
      setTimeout(function () {
        try {
          var r = SC.scoreRound(S, E.simulateRound(S));
          S.rounds.push(r);
          UI.round = null;
          save();
          location.hash = '#/feedback';
          render();
          toast('Round ' + r.round + ' complete: score ' + r.score.overall + ' (' + r.score.grade + ')');
        } catch (e) {
          console.error(e);
          toast('Simulation error: ' + e.message);
          render(true);
        }
      }, 50);
    },
    sort: function (el, args) {
      var cur = UI.sort[args[0]];
      UI.sort[args[0]] = { key: args[1], dir: cur && cur.key === args[1] ? -cur.dir : -1 };
      render(true);
    },
    stFilter: function (el, f) { UI.stFilter = f; render(true); },
    addNegative: function (el, args) {
      var c = campById(args[0]);
      if (!c) { toast('That campaign no longer exists.'); return; }
      c.negativesText = (c.negativesText ? c.negativesText.replace(/\s+$/, '') + '\n' : '') + '[' + args[1] + ']';
      save(); render(true); toast('Added [' + args[1] + '] as an exact-match negative to "' + c.name + '". Takes effect next round.');
    },
    addKeyword: function (el, args) {
      var c = campById(args[0]);
      var g = c && c.adGroups.find(function (x) { return x.id === args[1]; });
      if (!g) { toast('That ad group no longer exists.'); return; }
      g.keywordsText = (g.keywordsText ? g.keywordsText.replace(/\s+$/, '') + '\n' : '') + '"' + args[2] + '"';
      save(); render(true); toast('Added "' + args[2] + '" as a phrase-match keyword to "' + g.name + '".');
    },
    downloadPdf: function () {
      var r = UI.route === 'feedback' ? currentRound() : S.rounds[S.rounds.length - 1];
      if (!r) { toast('Run a simulation round first.'); return; }
      if (!A.reportPdf || !A.reportPdf.available()) { toast('The PDF tool did not load. Check your internet connection and reload the page.'); return; }
      var doc, name = A.reportPdf.filename(S, r);
      try { doc = A.reportPdf.build(S, r, prevRoundOf(r)); } catch (e) { console.error(e); toast('Could not build the PDF: ' + e.message); return; }
      if (FRAMED) saveFramed(name, doc.output('blob'));
      else doc.save(name);
    },
    exportCsv: function (el, id) { download(id + '-round' + ((currentRound() || {}).round || 0) + '.csv', csvOf(id), 'text/csv'); },
    exportJson: function () {
      var name = (S.student || 'student').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      download('digital-ad-lab-' + name + '-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(S, null, 1), 'application/json');
    },
    resetRounds: function (el) { if (armed(el, 'Click again to delete all rounds')) { S.rounds = []; UI.round = null; save(); render(); } },
    resetAll: function (el) { if (armed(el, 'Click again to erase everything')) { S = M.newState(); UI.round = null; save(); location.hash = '#/overview'; render(); } },
    print: function () {
      if (UI.route !== 'feedback') { location.hash = '#/feedback'; }
      setTimeout(function () { window.print(); }, 150);
    }
  };

  var CHANGE_ACTIONS = {
    selectRound: function (el) { UI.round = Number(el.value); render(true); },
    importJson: function (el) {
      var f = el.files && el.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          S = M.migrate(JSON.parse(rd.result));
          save(); UI.round = null; render(); toast('Project imported.');
        } catch (e) { toast('That file is not a valid Digital Ad Lab project.'); }
      };
      rd.readAsText(f);
    }
  };

  function parseCsv(text) {
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur.trim()); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
    return rows.filter(function (r) { return r.some(Boolean); });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    var fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    var args = el.dataset.args ? JSON.parse(el.dataset.args) : undefined;
    fn(el, args);
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.dataset || !el.dataset.bind) return;
    if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') return;
    applyBind(el);
    updateCounter(el);
    save();
    refreshLive();
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset.actionChange && CHANGE_ACTIONS[el.dataset.actionChange]) { CHANGE_ACTIONS[el.dataset.actionChange](el); return; }
    if (el.dataset.bindArray) {
      var arr = getPath(S, el.dataset.bindArray) || [];
      var i = arr.indexOf(el.value);
      if (el.checked && i < 0) arr.push(el.value);
      if (!el.checked && i >= 0) arr.splice(i, 1);
      setPath(S, el.dataset.bindArray, arr);
      save(); render(true);
      return;
    }
    if (!el.dataset.bind) return;
    if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT' || el.type === 'color') {
      applyBind(el);
      if (el.dataset.bind === 'account.industry') {
        var ind = D.INDUSTRIES[S.account.industry];
        if (!S.rounds.length) { S.account.value = ind.value; S.account.margin = ind.margin; S.account.serviceArea = ind.local ? 'local' : 'national'; }
      }
      save(); render(true);
    } else if (el.dataset.rerender) {
      render(true);
    } else if (el.dataset.bind.indexOf('.name') > 0 || el.dataset.bind === 'account.businessName') {
      renderNav();
    }
  });

  document.addEventListener('mousemove', function (e) { if (e.target.closest && e.target.closest('.chart')) onChartMove(e); });
  document.addEventListener('mouseout', function (e) { if (e.target.classList && e.target.classList.contains('hit')) onChartLeave(e); });

  window.addEventListener('hashchange', function () {
    parseRoute();
    if (UI.route !== 'campaigns') UI.newCamp = null;
    render();
    window.scrollTo(0, 0);
  });

  document.getElementById('textbox').addEventListener('click', function (e) {
    var box = document.getElementById('textbox');
    if (e.target.dataset.close != null || e.target === box) box.hidden = true;
    if (e.target.dataset.copy != null) {
      var ta = box.querySelector('textarea');
      ta.select();
      var ok = function () { toast('Copied to clipboard.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok, function () { toast('Press Ctrl+C / Cmd+C to copy the selected text.'); });
      else toast('Press Ctrl+C / Cmd+C to copy the selected text.');
    }
  });

  document.getElementById('menu-btn').addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  document.getElementById('nav').addEventListener('click', function (e) { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });

  parseRoute();
  render();

  // expose for debugging/tests
  window.AdLab = { state: function () { return S; }, render: render };
})();
