/* Digital Ad Lab: cross-channel analysis of one round.
 * Rolls campaigns up by channel, compares each channel with its benchmark and its job in the funnel,
 * and turns the numbers into "what is working / what is not / what to do next" plus a budget plan. */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});
  var U = AdSim.util;
  var D = AdSim.data;
  var E = AdSim.engine;

  var ORDER = ['search', 'shopping', 'chatgpt', 'display', 'video'];

  // What each channel is for. "Intent" channels are judged on profit; "assist" channels build
  // demand that later converts elsewhere, so they are judged on profit and on reach/attention.
  var ROLES = {
    search: { stage: 'Intent capture', job: 'Catch people who are already searching for what you sell.', judge: 'intent' },
    shopping: { stage: 'Intent capture (products)', job: 'Show products, prices and images to people ready to buy.', judge: 'intent' },
    chatgpt: { stage: 'Consideration & discovery', job: 'Reach people who are researching and comparing options in conversations.', judge: 'intent' },
    display: { stage: 'Awareness & remarketing', job: 'Build awareness cheaply and bring past visitors back.', judge: 'assist' },
    video: { stage: 'Awareness & consideration', job: 'Tell your story with sight and sound and lift brand searches.', judge: 'assist' }
  };

  // Benchmarks per channel for the industry: CTR, CPC and cost per conversion
  function benchmarks(ind) {
    var sCpa = ind.search.cpc / ind.search.cvr;
    var cb = E.chatBench(ind, { competition: 1 });
    return {
      search: { ctr: ind.search.ctr, cpc: ind.search.cpc, cpa: sCpa },
      shopping: { ctr: ind.shopping.ctr, cpc: ind.shopping.cpc, cpa: ind.shopping.cpc / ind.shopping.cvr },
      chatgpt: { ctr: cb.ctr, cpc: cb.cpc, cpa: cb.cpc / cb.cvr, cpm: cb.cpm },
      // upper-funnel cost per conversion is typically several times Search
      display: (function () { var d = E.displayBench(ind); return { ctr: d.ctr, cpc: d.cpc, cpa: d.cpc / d.cvr }; })(),
      video: { ctr: 0.005, cpc: null, cpa: 3 * sCpa, viewRate: ind.video.viewRate, cpv: ind.video.cpv }
    };
  }

  function rollup(rows) {
    var m = { impressions: 0, clicks: 0, cost: 0, conversions: 0, value: 0, views: 0, reach: 0, dailyBudget: 0, lostIsBudgetW: 0, lostIsRankW: 0, isW: 0 };
    rows.forEach(function (c) {
      ['impressions', 'clicks', 'cost', 'conversions', 'value', 'views', 'reach'].forEach(function (k) { m[k] += Number(c[k]) || 0; });
      m.dailyBudget += Number(c.dailyBudget) || 0;
      if (c.lostIsBudget != null) { m.lostIsBudgetW += c.lostIsBudget * c.cost; m.lostIsRankW += (c.lostIsRank || 0) * c.cost; m.isW += c.cost; }
    });
    m.ctr = U.safeDiv(m.clicks, m.impressions);
    // Search Network CTR without Display expansion impressions (those are not searches)
    var dxI = U.sum(rows, function (c) { return c.displayExpansion ? c.displayExpansion.impressions : 0; });
    var dxC = U.sum(rows, function (c) { return c.displayExpansion ? c.displayExpansion.clicks : 0; });
    m.benchCtr = dxI ? U.safeDiv(m.clicks - dxC, m.impressions - dxI) : m.ctr;
    m.expansionImpr = dxI;
    m.cpc = U.safeDiv(m.cost, m.clicks);
    m.cpm = U.safeDiv(m.cost, m.impressions) * 1000;
    m.cvr = U.safeDiv(m.conversions, m.clicks);
    m.cpa = U.safeDiv(m.cost, m.conversions);
    m.roas = U.safeDiv(m.value, m.cost);
    m.viewRate = U.safeDiv(m.views, m.impressions);
    m.lostIsBudget = m.isW ? m.lostIsBudgetW / m.isW : null;
    m.lostIsRank = m.isW ? m.lostIsRankW / m.isW : null;
    return m;
  }

  function money(n) { n = Number(n) || 0; return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: n !== 0 && Math.abs(n) < 100 ? 2 : 0, minimumFractionDigits: n !== 0 && Math.abs(n) < 100 ? 2 : 0 }); }
  function money0(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function round5(n) { return Math.max(5, Math.round(n / 5) * 5); }
  function pct(n, d) { return ((Number(n) || 0) * 100).toFixed(d == null ? 1 : d) + '%'; }

  // Verdict for one channel or campaign
  function verdict(m, type, ctx) {
    if (m.errors && m.errors.length) return { key: 'off', label: 'Not running', why: m.errors[0] };
    if (!(m.cost > 0.5) || !m.impressions) return { key: 'off', label: 'No delivery', why: 'It spent almost nothing, so there is nothing to judge yet.' };
    var role = ROLES[type];
    var b = ctx.bench[type];
    if (ctx.awareness) {
      var cpmIdx = U.safeDiv(m.cpm, b.cpm || (b.cpc * b.ctr * 1000) || m.cpm);
      if (cpmIdx <= 1.1 && m.ctr >= b.ctr * 0.8) return { key: 'good', label: 'Working', why: 'Efficient reach for an awareness goal: CPM ' + money(m.cpm) + ' with healthy engagement.' };
      return cpmIdx <= 1.6 ? { key: 'ok', label: 'Acceptable', why: 'Reach costs a bit more than typical (CPM ' + money(m.cpm) + ').' } : { key: 'bad', label: 'Expensive reach', why: 'CPM ' + money(m.cpm) + ' is well above typical for this channel.' };
    }
    if (!ctx.tracked) {
      var ci = U.safeDiv(m.ctr, b.ctr);
      return ci >= 0.9 ? { key: 'ok', label: 'Unmeasured', why: 'Traffic looks healthy (CTR ' + pct(m.ctr, 2) + '), but without conversion tracking you cannot see if it pays.' } :
        { key: 'bad', label: 'Unmeasured · weak', why: 'Low engagement (CTR ' + pct(m.ctr, 2) + ' vs. ' + pct(b.ctr, 2) + ' typical) and no conversion tracking.' };
    }
    var idx = U.safeDiv(m.roas, ctx.be);
    if (role.judge === 'intent') {
      if (idx >= 1.3) return { key: 'good', label: 'Profitable', why: 'ROAS ' + m.roas.toFixed(2) + '× is well above break-even (' + ctx.be.toFixed(2) + '×).' };
      if (idx >= 0.95) return { key: 'ok', label: 'Break-even', why: 'ROAS ' + m.roas.toFixed(2) + '× is close to break-even (' + ctx.be.toFixed(2) + '×): it pays for itself but earns little.' };
      return { key: 'bad', label: 'Losing money', why: 'ROAS ' + m.roas.toFixed(2) + '× is below break-even (' + ctx.be.toFixed(2) + '×): every $1 spent returns ' + money(m.roas * ctx.margin) + ' of profit.' };
    }
    if (idx >= 1) return { key: 'good', label: 'Profitable', why: 'Pays back directly (ROAS ' + m.roas.toFixed(2) + '×, break-even ' + ctx.be.toFixed(2) + '×). Part of this comes from ' + (type === 'video' ? 'engaged-view' : 'view-through') + ' conversions: people who saw the ad and bought later.' };
    if (idx >= 0.45) return { key: 'ok', label: 'Supporting', why: 'Does not pay back directly (ROAS ' + m.roas.toFixed(2) + '×), which is normal for awareness. It also lifts brand searches in the next round.' };
    return { key: 'bad', label: 'Not paying back', why: 'ROAS ' + m.roas.toFixed(2) + '× is too low even for an awareness channel.' };
  }

  // Specific "working / not working / next step" findings for one channel
  function diagnose(type, m, camps, r, ctx) {
    var good = [], bad = [], next = [];
    var b = ctx.bench[type];
    var ids = camps.map(function (c) { return c.id; });
    var mine = function (x) { return ids.indexOf(x.campaignId) >= 0; };
    if (!m.cost) { next.push('Fix the setup so the campaign can deliver (see Score & feedback).'); return { good: good, bad: bad, next: next }; }

    var ctrIdx = U.safeDiv(m.benchCtr, b.ctr);
    var ctrFix = {
      search: 'Put the keyword in headlines, split loose ad groups, and add sitelinks and callouts.',
      shopping: 'Improve product titles and images, and check that prices are competitive.',
      chatgpt: 'Write titles that answer the question people ask, and make context hints more specific.',
      display: 'Narrow audiences to in-market or remarketing segments and refresh images.',
      video: 'Hook viewers in the first 5 seconds and show the brand early (ABCD).'
    };
    var ctrLabel = 'CTR ' + pct(m.benchCtr, 2) + (m.expansionImpr ? ' on searches' : '');
    if (ctrIdx >= 1.15) good.push(ctrLabel + ' beats the ' + pct(b.ctr, 2) + ' benchmark: ads are relevant to the people who see them.');
    else if (ctrIdx < (type === 'chatgpt' ? 0.75 : 0.7)) { bad.push(ctrLabel + ' is below the ' + pct(b.ctr, 2) + ' benchmark.'); next.push(ctrFix[type]); }
    if (m.expansionImpr) { bad.push('Display expansion added ' + Math.round(m.expansionImpr).toLocaleString('en-US') + ' low-intent image impressions, pulling the overall CTR down to ' + pct(m.ctr, 2) + '.'); next.push('Turn off Display Network expansion in the Search campaign settings; run Display as its own campaign.'); }

    if (b.cpc && m.clicks) {
      var cpcIdx = m.cpc / b.cpc;
      if (cpcIdx <= 0.85) good.push('Clicks cost ' + money(m.cpc) + ', less than the typical ' + money(b.cpc) + '.');
      else if (cpcIdx > 1.3) { bad.push('Clicks cost ' + money(m.cpc) + ', ' + Math.round((cpcIdx - 1) * 100) + '% above the typical ' + money(b.cpc) + '.'); next.push(type === 'search' ? 'Raise Quality Score (relevance, landing page) so you pay less per click, and lower bids on expensive keywords.' : 'Lower bids or let a Maximize strategy find cheaper inventory.'); }
    }

    if (ctx.tracked && ctx.goal !== 'awareness') {
      if (m.conversions >= 1) {
        var cpaIdx = m.cpa / b.cpa;
        if (cpaIdx <= 0.8) good.push('Cost per conversion ' + money(m.cpa) + ' is better than the typical ' + money(b.cpa) + ' for this channel.');
        else if (cpaIdx > 1.3) { bad.push('Cost per conversion ' + money(m.cpa) + ' is above the typical ' + money(b.cpa) + '.'); next.push('Check the landing page match and the conversion path; tighten targeting toward higher-intent people.'); }
      } else if (m.clicks > 30) {
        bad.push(Math.round(m.clicks) + ' clicks but no conversions.');
        next.push('Check that the landing page matches the ad and that the conversion action is set up.');
      }
    }

    var effIdx = U.safeDiv(m.shareValue, m.shareSpend);
    if (ctx.tracked && ctx.channelCount > 1 && m.shareSpend > 0.05) {
      if (effIdx >= 1.25) good.push('Earns ' + pct(m.shareValue, 0) + ' of revenue on ' + pct(m.shareSpend, 0) + ' of spend: it pulls more than its weight.');
      else if (effIdx < 0.6) bad.push('Uses ' + pct(m.shareSpend, 0) + ' of spend but returns only ' + pct(m.shareValue, 0) + ' of revenue.');
    }

    if (m.lostIsBudget != null && m.lostIsBudget > 0.2) {
      if (ctx.tracked && m.roas >= ctx.be) { bad.push('Misses ' + pct(m.lostIsBudget, 0) + ' of eligible impressions because the budget runs out.'); next.push('Scale: raise the daily budget. This channel is profitable and limited by budget.'); }
      else good.push('The budget caps spend (' + pct(m.lostIsBudget, 0) + ' impressions lost), which limits losses while you fix efficiency.');
    }
    if (m.lostIsRank != null && m.lostIsRank > 0.4) {
      bad.push('Loses ' + pct(m.lostIsRank, 0) + ' of impressions on ' + (type === 'shopping' ? 'rank (bid × product data quality).' : 'Ad Rank (bid × quality).'));
      next.push(type === 'shopping' ? 'Improve feed quality (titles, images, GTINs), then raise product group bids on your profitable products.' : 'Improve Quality Score (ad relevance, landing page) before raising bids.');
    }

    if (type === 'search') {
      var terms = (r.searchTerms || []).filter(mine);
      var cost = U.sum(terms, function (t) { return t.cost; });
      var waste = U.sum(terms.filter(function (t) { return !t.excluded && t.conversions === 0 && (t.intent === 'low' || t.relevance < 0.35); }), function (t) { return t.cost; });
      // same rule as Score & feedback: terms with no conversions and low intent or low relevance
      if (cost && waste / cost > 0.1) { bad.push(pct(waste / cost, 0) + ' of Search spend (' + money(waste) + ') went to irrelevant search terms.'); next.push('Add the irrelevant search terms as negatives (Reports → Search terms, "Wasted spend" view).'); }
      else if (cost && waste > 0) { good.push('Wasted spend is low: ' + money(waste) + ' (' + pct(waste / cost, 0) + ' of Search spend) on irrelevant search terms.'); next.push('Still add the ' + money(waste) + ' of irrelevant search terms as negatives: it is easy savings.'); }
      else if (cost) good.push('No spend on irrelevant search terms.');
    }
    if (type === 'display') {
      var pl = (r.placements || []).filter(mine);
      var pc = U.sum(pl, function (p) { return p.cost; });
      var junk = U.sum(pl.filter(function (p) { return p.kind === 'app' || p.kind === 'expansion'; }), function (p) { return p.cost; });
      if (pc && junk / pc > 0.2) { bad.push(pct(junk / pc, 0) + ' of Display spend ran in apps or broad expansion.'); next.push('Exclude poor placements and mobile app categories, and turn off optimized targeting if it drifts.'); }
    }
    if (type === 'video') {
      if (m.views && b.viewRate) {
        if (m.viewRate >= b.viewRate * 1.1) good.push('View rate ' + pct(m.viewRate, 0) + ' beats the typical ' + pct(b.viewRate, 0) + ': the creative holds attention.');
        else if (m.viewRate < b.viewRate * 0.8) { bad.push('View rate ' + pct(m.viewRate, 0) + ' is below the typical ' + pct(b.viewRate, 0) + '.'); next.push('Tighten the opening, use captions and pick placements that fit your video length.'); }
      }
      if (r.brandLiftIndex > 0.05) good.push('Video and Display raised brand searches, which helps Search next round.');
    }
    if (type === 'chatgpt') {
      var tp = (r.chatTopics || []).filter(mine);
      var tc = U.sum(tp, function (t) { return t.cost; });
      var off = U.sum(tp.filter(function (t) { return t.status === 'Off-target'; }), function (t) { return t.cost; });
      if (tc && off / tc > 0.08) { bad.push(money(off) + ' (' + pct(off / tc, 0) + ' of spend) matched loosely related conversations.'); next.push('Rewrite broad or unrelated hints as specific needs that name what you sell.'); }
      else if (tc) good.push(off ? 'Most spend (' + pct(1 - off / tc, 0) + ') matched relevant conversations.' : 'Context hints matched relevant conversations.');
      var actual = U.sum(camps, function (c) { return c.conversions; }), reported = U.sum(camps, function (c) { return c.reportedConversions || 0; });
      if (ctx.tracked && actual > 3 && reported < actual * 0.85) { bad.push('Ads Manager reports only ' + Math.round(reported) + ' of about ' + Math.round(actual) + ' conversions.'); next.push('Connect the Conversions API and pass {oppref} so conversions are matched.'); }
    }
    if (type === 'shopping' && m.clicks && m.ctr >= b.ctr) good.push('Product listings attract clicks at or above benchmark.');

    if (!next.length) next.push(m.roas >= ctx.be || ctx.goal === 'awareness' ? 'Keep it running and test one new idea (a new ad angle or audience).' : 'Fix efficiency before adding budget.');
    return { good: good, bad: bad, next: U.uniq(next) };
  }

  // Few conversions make ROAS swing from round to round; say so instead of over-reading the number
  function sampleNote(v, m, ctx) {
    if (ctx.tracked && m.cost > 0 && m.conversions > 0 && m.conversions < 15 && v.key !== 'off') v.why += ' Based on only ' + Math.round(m.conversions) + ' conversion' + (Math.round(m.conversions) === 1 ? '' : 's') + ', so expect this to swing between rounds.';
    return v;
  }

  function analyze(state, r, prev) {
    var acc = r.accountSnapshot || state.account;
    var ind = D.INDUSTRIES[acc.industry] || D.INDUSTRIES.retail;
    var margin = Number(acc.margin) || 0.4;
    var ctx = { bench: benchmarks(ind), be: margin > 0 ? 1 / margin : 2.5, margin: margin, tracked: !!r.tracked, goal: acc.goal, awareness: acc.goal === 'awareness' };
    var T = r.totals;
    var types = ORDER.filter(function (t) { return r.campaigns.some(function (c) { return c.type === t; }); });
    ctx.channelCount = types.filter(function (t) { return U.sum(r.campaigns.filter(function (c) { return c.type === t; }), function (c) { return c.cost; }) > 0; }).length;

    var channels = types.map(function (type) {
      var camps = r.campaigns.filter(function (c) { return c.type === type; });
      var m = rollup(camps);
      m.type = type;
      m.name = D.CAMPAIGN_TYPES[type].name;
      m.role = ROLES[type];
      m.bench = ctx.bench[type];
      m.campaignCount = camps.length;
      m.profit = m.value * margin - m.cost;
      m.shareSpend = U.safeDiv(m.cost, T.cost);
      m.shareConv = U.safeDiv(m.conversions, T.conversions);
      m.shareValue = U.safeDiv(m.value, T.value);
      m.shareClicks = U.safeDiv(m.clicks, T.clicks);
      var running = camps.filter(function (c) { return !c.errors.length; });
      m.verdict = sampleNote(verdict(running.length ? m : { errors: camps[0].errors }, type, ctx), m, ctx);
      m.diagnosis = diagnose(type, m, camps, r, ctx);
      if (prev) {
        var pm = rollup(prev.campaigns.filter(function (c) { return c.type === type; }));
        m.prev = pm.cost || pm.impressions ? { cost: pm.cost, conversions: pm.conversions, roas: pm.roas, profit: pm.value * margin - pm.cost, ctr: pm.ctr, cpa: pm.cpa } : null;
      }
      return m;
    });

    var campaigns = r.campaigns.map(function (c) {
      var v = sampleNote(verdict(c, c.type, ctx), c, ctx);
      return { id: c.id, name: c.name, type: c.type, cost: c.cost, clicks: c.clicks, impressions: c.impressions, ctr: c.ctr, cpc: c.cpc, conversions: c.conversions, cpa: c.cpa, value: c.value, roas: c.roas, profit: c.value * margin - c.cost, verdict: v };
    });

    // Budget plan: move money from what loses to what wins and is budget-limited
    var plan = [];
    if (ctx.tracked && !ctx.awareness) {
      var live = channels.filter(function (c) { return c.cost > 0; });
      var winners = live.filter(function (c) { return c.roas >= ctx.be * 1.1; }).sort(function (a, b) { return b.roas - a.roas; });
      var losers = live.filter(function (c) { return c.verdict.key === 'bad'; }).sort(function (a, b) { return a.roas - b.roas; });
      var floor = function (c) { return c.type === 'chatgpt' ? D.CHATGPT.minDaily * c.campaignCount : 0; };
      losers.forEach(function (l) {
        var move = round5(Math.max(5, l.dailyBudget * (l.role.judge === 'assist' ? 0.3 : 0.4)));
        var room = l.dailyBudget - floor(l);
        var to = winners.find(function (w) { return w.lostIsBudget != null && w.lostIsBudget > 0.1; }) || winners[0];
        if (floor(l) && room < 5) {
          plan.push({ from: l.type, to: null, amount: 0, text: l.name + ' is at the $' + D.CHATGPT.minDaily + '/day minimum, so it cannot be cut further. Fix it first (more specific hints, clearer titles, Conversions API), or pause it and move its whole budget' + (to ? ' to ' + to.name : '') + '.' });
          return;
        }
        if (floor(l)) move = Math.min(move, Math.floor(room / 5) * 5);
        plan.push({ from: l.type, to: to ? to.type : null, amount: move,
          text: (to ? 'Move about ' + money0(move) + '/day from ' + l.name + ' (ROAS ' + l.roas.toFixed(2) + '×) to ' + to.name + ' (ROAS ' + to.roas.toFixed(2) + '×' + (to.lostIsBudget > 0.1 ? ', budget-limited' : '') + '), then fix ' + l.name + ' before adding money back.'
            : 'Cut ' + l.name + ' by about ' + money0(move) + '/day until it reaches break-even; no channel is clearly profitable yet, so fix efficiency first.') + (floor(l) ? ' (ChatGPT ads need at least $' + D.CHATGPT.minDaily + '/day.)' : '') });
      });
      winners.forEach(function (w) {
        if (w.lostIsBudget != null && w.lostIsBudget > 0.2 && !plan.some(function (p) { return p.to === w.type; })) {
          // enough to capture a good part of the impressions lost to budget
          var add = round5(Math.max(5, w.dailyBudget * Math.min(1, w.lostIsBudget / (1 - w.lostIsBudget)) * 0.6));
          plan.push({ from: null, to: w.type, amount: add, text: 'Scale ' + w.name + ': it is profitable (ROAS ' + w.roas.toFixed(2) + '×) and misses ' + pct(w.lostIsBudget, 0) + ' of impressions because of budget. Try about +' + money0(add) + '/day (from ' + money0(w.dailyBudget) + ' to ' + money0(w.dailyBudget + add) + '), and watch that ROAS stays above break-even.' });
        }
      });
      var assists = live.filter(function (c) { return c.role.judge === 'assist' && c.verdict.key === 'ok'; });
      assists.forEach(function (a) { plan.push({ from: null, to: null, amount: 0, text: 'Keep ' + a.name + ' at a modest share (' + pct(a.shareSpend, 0) + ' of spend now). Judge it on reach and on the lift in brand searches, not only on direct ROAS.' }); });
      if (!plan.length && live.length) plan.push({ from: null, to: null, amount: 0, text: 'The budget split looks sensible. Hold it for a round, change one variable, and compare.' });
    } else if (!ctx.tracked) {
      plan.push({ from: null, to: null, amount: 0, text: 'Turn on conversion tracking before moving budget: without it you cannot tell which channel makes money.' });
    } else {
      plan.push({ from: null, to: null, amount: 0, text: 'For an awareness goal, shift budget toward the channel with the lowest CPM and the highest reach and view rate.' });
    }

    var live2 = channels.filter(function (c) { return c.cost > 0; });
    var rank = function (c) { return ctx.tracked && !ctx.awareness ? c.roas : -c.cpm; };
    var sorted = live2.slice().sort(function (a, b) { return rank(b) - rank(a); });
    return {
      round: r.round, ctx: ctx, channels: channels, campaigns: campaigns, plan: plan,
      best: sorted[0] || null, worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
      totals: { cost: T.cost, value: T.value, profit: T.value * margin - T.cost, roas: T.roas, conversions: T.conversions, clicks: T.clicks, impressions: T.impressions, cpa: T.cpa }
    };
  }

  AdSim.channels = { analyze: analyze, benchmarks: benchmarks, ROLES: ROLES, ORDER: ORDER };
})(typeof window !== 'undefined' ? window : globalThis);
