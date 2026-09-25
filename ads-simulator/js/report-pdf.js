/* Digital Ad Lab: campaign results overview as a PDF (built in the browser with jsPDF + AutoTable). */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});
  var U = AdSim.util;
  var D = AdSim.data;

  var ACCENT = [26, 115, 232];
  var INK = [22, 24, 29];
  var MUTED = [107, 113, 124];
  var LINE = [221, 225, 231];
  var SEV_COLOR = { critical: [176, 42, 42], warning: [168, 67, 27], opportunity: [26, 95, 180], info: [77, 83, 94], success: [10, 107, 10] };
  var SEV_LABEL = { critical: 'Critical', warning: 'Warning', opportunity: 'Opportunity', info: 'Note', success: 'Well done' };

  // The built-in PDF fonts only cover Latin-1, so swap symbols they cannot draw.
  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/[≈]/g, '~').replace(/[→➜]/g, '->').replace(/[−–]/g, '-').replace(/[—]/g, ' - ')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[…]/g, '...').replace(/[★]/g, '*').replace(/[✓]/g, 'OK').replace(/[✕]/g, 'x')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
  }
  function money(n, dp) {
    n = Number(n) || 0;
    var d = dp == null ? 2 : dp;
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function int(n) { return Math.round(n || 0).toLocaleString('en-US'); }
  function pct(n, d) { return ((Number(n) || 0) * 100).toFixed(d == null ? 2 : d) + '%'; }
  function x(n) { return (Number(n) || 0).toFixed(2) + 'x'; }

  function available() {
    return !!(root.jspdf && root.jspdf.jsPDF && root.jspdf.jsPDF.API && root.jspdf.jsPDF.API.autoTable);
  }

  function filename(state, round) {
    var who = (state.student || state.account.businessName || 'student').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'student';
    return 'digital-ad-lab-' + who + '-round-' + round.round + '.pdf';
  }

  function build(state, r, prev) {
    var JsPDF = root.jspdf.jsPDF;
    var doc = new JsPDF({ unit: 'pt', format: 'letter' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 44;
    var acc = r.accountSnapshot || state.account;
    var ind = D.INDUSTRIES[acc.industry] || D.INDUSTRIES.retail;
    var t = r.totals;
    var sc = r.score;
    var tracked = r.tracked;
    var y;

    function text(s, xx, yy, o) { doc.text(clean(s), xx, yy, o); }
    function setColor(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function ensure(space) { if (y + space > H - 60) { doc.addPage(); y = M; } }
    function heading(s) {
      ensure(60);
      y += 8;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); setColor(INK);
      text(s, M, y);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.8); doc.line(M, y + 6, W - M, y + 6);
      y += 18;
    }
    function table(head, body, opts) {
      doc.autoTable(Object.assign({
        startY: y, margin: { left: M, right: M }, head: [head.map(clean)], body: body.map(function (row) { return row.map(clean); }),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.5, overflow: 'linebreak' },
        headStyles: { fillColor: [241, 243, 246], textColor: [77, 83, 94], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 251, 252] }
      }, opts || {}));
      y = doc.lastAutoTable.finalY + 16;
    }

    // ----- Title band -----
    doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.rect(0, 0, W, 86, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    text('Digital Ad Lab', M, 32);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(21);
    text('Campaign Results Overview', M, 58);
    doc.setFontSize(12);
    text('Round ' + r.round + ' (30 days)', W - M, 58, { align: 'right' });

    // ----- Who / what -----
    y = 112;
    var info = [
      ['Student', state.student || '(not set - add your name in Settings)'],
      ['Business', acc.businessName || '-'],
      ['Website', acc.website || '-'],
      ['Industry', ind.name],
      ['Goal', (D.GOALS[acc.goal] || {}).name || acc.goal],
      ['Service area', acc.serviceArea],
      ['Conversion tracking', tracked ? 'On' : 'Off (conversions are estimates)'],
      ['Round run on', new Date(r.createdAt).toLocaleString('en-US')]
    ];
    doc.setFontSize(9.5);
    info.forEach(function (row, i) {
      var col = i % 2, line = Math.floor(i / 2);
      var xx = M + col * ((W - 2 * M) / 2);
      var yy = y + line * 15;
      doc.setFont('helvetica', 'bold'); setColor(MUTED); text(row[0], xx, yy);
      doc.setFont('helvetica', 'normal'); setColor(INK);
      text(doc.splitTextToSize(clean(row[1]), (W - 2 * M) / 2 - 100)[0], xx + 96, yy);
    });
    y += Math.ceil(info.length / 2) * 15 + 12;

    // ----- Score boxes -----
    var boxes = [
      ['Overall score', sc.overall + '/100', 'Grade ' + sc.grade],
      ['Setup score (45%)', sc.setup + '/100', 'Follows baseline guidelines'],
      ['Performance score (55%)', sc.performance + '/100', 'Results vs. benchmarks & profit'],
      ['Profit after ads (est.)', money(sc.profit, 0), 'Revenue x margin - ad cost']
    ];
    var gap = 10, bw = (W - 2 * M - gap * 3) / 4, bh = 64;
    boxes.forEach(function (b, i) {
      var bx = M + i * (bw + gap);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setFillColor(i === 0 ? 232 : 248, i === 0 ? 240 : 249, i === 0 ? 254 : 251);
      doc.roundedRect(bx, y, bw, bh, 6, 6, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setColor(MUTED); text(b[0], bx + 10, y + 16);
      doc.setFontSize(18);
      if (i === 3) setColor(sc.profit >= 0 ? SEV_COLOR.success : SEV_COLOR.critical); else setColor(i === 0 ? ACCENT : INK);
      text(b[1], bx + 10, y + 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(MUTED); text(b[2], bx + 10, y + 55);
    });
    y += bh + 20;

    // ----- Key results -----
    heading('Key results');
    var pt = prev ? prev.totals : null;
    function delta(cur, old) {
      if (old == null || !old) return '-';
      var c = (cur - old) / Math.abs(old);
      return (c >= 0 ? '+' : '') + (c * 100).toFixed(0) + '%';
    }
    var nt = tracked ? null : 'not tracked';
    var kpis = [
      ['Impressions', int(t.impressions), delta(t.impressions, pt && pt.impressions)],
      ['Clicks', int(t.clicks), delta(t.clicks, pt && pt.clicks)],
      ['CTR', pct(t.ctr), delta(t.ctr, pt && pt.ctr)],
      ['Avg. CPC', money(t.cpc), delta(t.cpc, pt && pt.cpc)],
      ['Ad cost', money(t.cost), delta(t.cost, pt && pt.cost)],
      ['Conversions', tracked ? int(t.conversions) : int(t.conversions) + ' (est., ' + nt + ')', delta(t.conversions, pt && pt.conversions)],
      ['Conversion rate', pct(t.cvr), delta(t.cvr, pt && pt.cvr)],
      ['Cost / conversion (CPA)', t.conversions ? money(t.cpa) : '-', delta(t.cpa, pt && pt.cpa)],
      ['Revenue (est.)', money(t.value), delta(t.value, pt && pt.value)],
      ['ROAS', x(t.roas) + '  (break-even ' + x(sc.breakEvenRoas) + ')', delta(t.roas, pt && pt.roas)]
    ];
    var half = Math.ceil(kpis.length / 2);
    var rows = [];
    for (var i = 0; i < half; i++) {
      var a = kpis[i], b = kpis[i + half] || ['', '', ''];
      rows.push([a[0], a[1], a[2], b[0], b[1], b[2]]);
    }
    table(['Metric', 'Value', prev ? 'vs. R' + prev.round : 'Change', 'Metric', 'Value', prev ? 'vs. R' + prev.round : 'Change'], rows, {
      columnStyles: { 1: { fontStyle: 'bold' }, 2: { textColor: MUTED, halign: 'right' }, 4: { fontStyle: 'bold' }, 5: { textColor: MUTED, halign: 'right' } }
    });
    if (r.events && r.events.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); setColor(MUTED);
      r.events.forEach(function (e) { ensure(14); text('Market: ' + e, M, y); y += 12; });
      y += 6;
    }

    // ----- Daily chart -----
    ensure(150);
    heading('Clicks per day');
    var ch = 90, cw = W - 2 * M - 30, cx = M + 30, cy = y;
    var max = Math.max.apply(null, r.daily.map(function (d) { return d.clicks; }).concat([1])) * 1.1;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(MUTED);
    for (var g = 0; g <= 2; g++) {
      var gy = cy + ch - ch * g / 2;
      doc.line(cx, gy, cx + cw, gy);
      text(int(max / 1.1 * g / 2), cx - 6, gy + 2, { align: 'right' });
    }
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]); doc.setLineWidth(1.6);
    var px = function (k) { return cx + k * cw / (r.daily.length - 1); };
    var py = function (v) { return cy + ch - (v / max) * ch; };
    for (var k = 1; k < r.daily.length; k++) doc.line(px(k - 1), py(r.daily[k - 1].clicks), px(k), py(r.daily[k].clicks));
    [0, 7, 14, 21, 29].forEach(function (k) { if (r.daily[k]) text('Day ' + r.daily[k].day, px(k), cy + ch + 12, { align: 'center' }); });
    y = cy + ch + 28;

    // ----- Campaigns -----
    heading('Campaign performance');
    table(['Campaign', 'Type', 'Status', 'Budget/day', 'Impr.', 'Clicks', 'CTR', 'Avg. CPC', 'Cost', 'Conv.', 'CPA', 'ROAS'],
      r.campaigns.map(function (c) {
        return [c.name, D.CAMPAIGN_TYPES[c.type].name, c.status + (c.errors.length ? ': ' + c.errors[0] : ''), money(c.dailyBudget), int(c.impressions), int(c.clicks), pct(c.ctr),
          money(c.cpc), money(c.cost), tracked ? int(c.conversions) : 'n/t', c.conversions ? money(c.cpa) : '-', x(c.roas)];
      }), { styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3, textColor: INK, lineColor: LINE, lineWidth: 0.5 }, columnStyles: { 0: { cellWidth: 90 }, 2: { cellWidth: 70 } } });
    var vids = r.campaigns.filter(function (c) { return c.type === 'video' && !c.errors.length; });
    if (vids.length) {
      table(['Video campaign', 'Views', 'View rate', 'Avg. CPV', 'Reach', 'Frequency', 'Ad recall lift (est.)'], vids.map(function (c) {
        return [c.name, int(c.views), pct(c.viewRate, 1), money(c.cpv), int(c.reach), (c.frequency || 0).toFixed(1), '+' + (c.adRecallLift || 0).toFixed(1) + ' pts'];
      }));
    }
    if (!tracked) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8); setColor(MUTED);
      text('n/t = not tracked. Conversion tracking was off, so these conversions would be invisible in a real account.', M, y - 8);
      y += 6;
    }

    // ----- Scores -----
    ensure(190);
    heading('Setup score by area');
    table(['Area', 'Score'], sc.categories.filter(function (c) { return c.score != null; }).map(function (c) { return [c.name, c.score + '%']; }), {
      tableWidth: (W - 2 * M) * 0.55, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });
    heading('Performance score breakdown');
    table(['Component', 'Points', 'Detail'], sc.performanceParts.map(function (p) { return [p.name, p.pts + ' / ' + p.max, p.note]; }), {
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold', cellWidth: 60 } }
    });

    // ----- Recommendations -----
    var recs = r.feedback.filter(function (f) { return f.severity !== 'success' && f.severity !== 'info'; }).slice(0, 10);
    var wins = r.feedback.filter(function (f) { return f.severity === 'success'; });
    heading('Top recommendations for next round');
    if (recs.length) {
      table(['Priority', 'Issue', 'What to do', 'Guide'], recs.map(function (f) {
        return [SEV_LABEL[f.severity], f.title + (f.area ? '\n(' + f.area + ')' : ''), f.action || f.detail, f.guide || ''];
      }), {
        columnStyles: { 0: { cellWidth: 62, fontStyle: 'bold' }, 1: { cellWidth: 180 }, 3: { cellWidth: 42 } },
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 0) data.cell.styles.textColor = SEV_COLOR[recs[data.row.index].severity];
        }
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); setColor(INK); text('No major issues found this round.', M, y); y += 18;
    }
    if (wins.length) {
      heading('What went well');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(INK);
      wins.forEach(function (f) {
        var lines = doc.splitTextToSize(clean('- ' + f.title + ': ' + f.detail), W - 2 * M);
        ensure(lines.length * 11 + 4);
        doc.text(lines, M, y);
        y += lines.length * 11 + 4;
      });
      y += 8;
    }

    // ----- Website analytics -----
    var ga = r.analytics;
    heading('Website analytics');
    table(['Users', 'New users', 'Sessions', 'Engagement rate', 'Bounce rate', 'Avg. engagement time', 'Pages / session'],
      [[int(ga.users), int(ga.newUsers), int(ga.sessions), pct(ga.engagementRate, 1), pct(ga.bounceRate, 1), Math.round(ga.avgEngagementTime) + 's', (ga.pagesPerSession || 0).toFixed(2)]]);
    table(['Channel', 'Sessions', 'Engagement rate', 'Conversions', 'Revenue'], ga.channels.map(function (c) {
      return [c.channel, int(c.sessions), pct(c.engagementRate, 1), tracked ? int(c.conversions) : 'n/t', tracked ? money(c.value, 0) : 'n/t'];
    }));

    // ----- History -----
    var rounds = state.rounds.filter(function (x2) { return x2.round <= r.round; });
    if (rounds.length > 1) {
      heading('Progress across rounds');
      table(['Round', 'Overall', 'Setup', 'Performance', 'Clicks', 'Cost', 'Revenue (est.)', 'ROAS', 'Profit (est.)'], rounds.map(function (x2) {
        return ['R' + x2.round, x2.score.overall + ' (' + x2.score.grade + ')', x2.score.setup, x2.score.performance, int(x2.totals.clicks), money(x2.totals.cost, 0), money(x2.totals.value, 0), x(x2.totals.roas), money(x2.score.profit, 0)];
      }));
    }

    // ----- Footer on every page -----
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.5); doc.line(M, H - 34, W - M, H - 34);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setColor(MUTED);
      text('Digital Ad Lab - simulated results for teaching; not real Google Ads data.' + (acc.businessName ? '  ' + acc.businessName + ', round ' + r.round + '.' : ''), M, H - 22);
      text('Page ' + p + ' of ' + pages, W - M, H - 22, { align: 'right' });
    }
    return doc;
  }

  AdSim.reportPdf = { available: available, build: build, filename: filename, clean: clean };
})(typeof window !== 'undefined' ? window : globalThis);
