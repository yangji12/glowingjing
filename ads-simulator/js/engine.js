/* AdSim simulation engine.
 *
 * One "round" simulates 30 days. The model is deliberately explainable:
 *   Ad Rank      = effective bid × Quality Score × (1 + asset boost)
 *   Impr. share  = f(Ad Rank ÷ competitor Ad Rank), then capped by budget
 *   Actual CPC   ≈ what you need to beat the next competitor ÷ your Quality Score (≤ your bid)
 *   CTR          = industry CTR × intent × relevance × position × ad strength × assets
 *   Conv. rate   = industry CVR × intent × relevance × landing page × location/device/schedule fit
 * Everything is seeded, so the same setup in the same round produces the same results.
 */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});
  var U = AdSim.util;
  var D = AdSim.data;
  var M = AdSim.model;

  var DAYS = 30;
  var BUDGET_DAYS = 30.4;

  var INTENT = {
    brand:      { ctr: 2.6,  cvr: 2.2,  cpc: 0.35 },
    high:       { ctr: 1.15, cvr: 1.35, cpc: 1.2 },
    neutral:    { ctr: 1.0,  cvr: 1.0,  cpc: 1.0 },
    competitor: { ctr: 0.55, cvr: 0.45, cpc: 0.9 },
    low:        { ctr: 0.6,  cvr: 0.08, cpc: 0.55 }
  };
  var STRENGTH_CTR = { Poor: 0.78, Average: 0.92, Good: 1.0, Excellent: 1.1, Incomplete: 0 };
  var STRENGTH_QS = { Poor: -0.12, Average: -0.03, Good: 0.06, Excellent: 0.12, Incomplete: -0.2 };
  var SMART = ['max_conversions', 'target_cpa', 'max_conv_value', 'target_roas'];

  // ---------------------------------------------------------------------------
  // Context factors
  // ---------------------------------------------------------------------------

  function locationFactors(c, acc) {
    var locs = (c.locations || []).map(function (id) { return D.LOCATIONS.find(function (l) { return l.id === id; }); }).filter(Boolean);
    if (!locs.length) return { weight: 0, cpc: 1, cvr: 1, locs: [] };
    // overlapping radius targets: only the largest counts
    var radius = locs.filter(function (l) { return l.kind === 'radius'; }).sort(function (a, b) { return b.weight - a.weight; })[0];
    var countries = locs.filter(function (l) { return l.kind === 'country'; });
    var parts = countries.slice();
    if (radius && !countries.some(function (l) { return l.id === 'us'; })) parts.push(radius);
    var w = U.sum(parts, function (l) { return l.weight; });
    var cpc = U.sum(parts, function (l) { return l.weight * l.cpc; }) / w;
    var cvr = U.sum(parts, function (l) {
      var fitArea = acc.serviceArea === 'local' && l.kind === 'country' ? 0.22 : 1;
      return l.weight * l.cvr * fitArea;
    }) / w;
    var vol = 1;
    if (c.locationOption === 'presenceOrInterest') {
      vol = 1.15;
      cvr *= acc.serviceArea === 'local' ? 0.8 : 0.93;
    }
    return { weight: w * vol, cpc: cpc, cvr: cvr, locs: parts };
  }

  function scheduleFactors(c, industry) {
    var s = c.schedule || 'all';
    if (s === 'business') {
      var officeInd = ['b2b', 'legal', 'finance', 'homeservices'].indexOf(industry) >= 0;
      return { volume: 0.45, cvr: officeInd ? 1.15 : 0.95 };
    }
    if (s === 'evenings') {
      var leisure = ['retail', 'restaurants', 'travel', 'beauty', 'health', 'education'].indexOf(industry) >= 0;
      return { volume: 0.5, cvr: leisure ? 1.1 : industry === 'b2b' ? 0.75 : 1.0 };
    }
    return { volume: 1, cvr: 1 };
  }

  function languageFactors(c) {
    if (c.language === 'all') return { volume: 1.08, cvr: 0.92 };
    return { volume: 1, cvr: 1 };
  }

  var DEVICE_BASE = {
    search:   { mobile: 0.6, desktop: 0.34, tablet: 0.06 },
    display:  { mobile: 0.66, desktop: 0.29, tablet: 0.05 },
    video:    { mobile: 0.7, desktop: 0.15, tablet: 0.15 },
    shopping: { mobile: 0.65, desktop: 0.3, tablet: 0.05 }
  };

  function deviceFactors(c, industry) {
    var base = Object.assign({}, DEVICE_BASE[c.type] || DEVICE_BASE.search);
    var cvrD = { mobile: 0.85, desktop: 1.25, tablet: 1.0 };
    if (industry === 'b2b') { base.mobile -= 0.15; base.desktop += 0.15; cvrD = { mobile: 0.6, desktop: 1.45, tablet: 0.9 }; }
    var names = ['mobile', 'desktop', 'tablet'];
    var adj = c.devices || {};
    var m = {};
    names.forEach(function (d) { m[d] = U.clamp(1 + (Number(adj[d]) || 0) / 100, 0, 10); });
    var volume = U.sum(names, function (d) { return base[d] * (m[d] === 0 ? 0 : Math.pow(m[d], 0.35)); });
    var baseCvr = U.sum(names, function (d) { return base[d] * cvrD[d]; });
    var split = names.map(function (d) {
      var share = volume ? base[d] * (m[d] === 0 ? 0 : Math.pow(m[d], 0.35)) / volume : 0;
      return { device: d, share: share, cvr: cvrD[d], bid: m[d] };
    });
    var cvr = volume ? U.sum(split, function (s) { return s.share * s.cvr; }) / baseCvr : 0;
    var bid = U.sum(split, function (s) { return s.share * s.bid; }) || 1;
    return { volume: volume, cvr: cvr, bid: bid, split: split };
  }

  function demographicFactors(t, industry) {
    var ind = D.INDUSTRIES[industry];
    var ages = (t && t.ages) || D.AGE_BANDS.map(function () { return true; });
    var genders = (t && t.genders) || [true, true, true];
    var all = U.sum(D.AGE_SHARE, function (s, i) { return s * ind.ages[i]; });
    var selShare = 0, selAff = 0;
    D.AGE_SHARE.forEach(function (s, i) { if (ages[i]) { selShare += s; selAff += s * ind.ages[i]; } });
    var gShare = [0.49, 0.47, 0.04];
    var gAff = industry === 'beauty' ? [1.5, 0.5, 1] : industry === 'automotive' ? [0.85, 1.15, 1] : [1, 1, 1];
    var gSel = 0, gA = 0;
    gShare.forEach(function (s, i) { if (genders[i]) { gSel += s; gA += s * gAff[i]; } });
    return {
      reach: selShare * gSel,
      cvr: selShare && gSel ? (selAff / selShare) / (all) * (gA / gSel) : 0
    };
  }

  function learningFactor(c, ctx) {
    var smart = SMART.indexOf(c.bidStrategy) >= 0;
    if (!smart) return { factor: 1, status: null };
    if (!ctx.acc.conversionTracking) return { factor: 0.6, status: 'no-tracking' };
    var prevCfg = ctx.prev && (ctx.prev.config || []).find(function (x) { return x.id === c.id; });
    var prevRes = ctx.prev && (ctx.prev.campaigns || []).find(function (x) { return x.id === c.id; });
    if (!prevCfg || prevCfg.bidStrategy !== c.bidStrategy) return { factor: 0.88, status: 'learning' };
    if (prevRes && prevRes.conversions >= 30) return { factor: 1.1, status: 'optimized' };
    if (prevRes && prevRes.conversions >= 15) return { factor: 1.04, status: 'ok' };
    return { factor: 0.95, status: 'limited-data' };
  }

  function landingPageQuality(url, text, ctx) {
    if (!url) return 0.1;
    var acc = ctx.acc;
    var s = 0.4;
    if (/^https:\/\//i.test(url)) s += 0.1; else s -= 0.15;
    var d = U.domainOf(url);
    var site = U.domainOf(acc.website);
    if (site && d === site) s += 0.05; else s -= 0.35;
    var path = U.pathOf(url);
    if (path && path !== '/') s += 0.1;
    if (text) {
      var kt = U.contentTokens(text);
      var pt = U.contentTokens(path.replace(/[\/_-]+/g, ' '));
      if (kt.length && pt.length) s += 0.1 * kt.filter(function (t) { return pt.indexOf(t) >= 0; }).length / kt.length;
      s += 0.25 * M.relevance(text, ctx.vocab);
    } else {
      s += 0.12;
    }
    if (!ctx.scan || ctx.scan.hasViewport !== false) s += 0.05;
    if (ctx.scan && ctx.scan.bytes > 3e6) s -= 0.05;
    return U.clamp(s, 0.05, 1);
  }

  function componentLabel(v) {
    return v < 0.4 ? 'Below average' : v < 0.68 ? 'Average' : 'Above average';
  }

  function rankShare(ev) {
    var vol = U.sum(ev.rows, function (r) { return r.vol; });
    return U.safeDiv(U.sum(ev.rows, function (r) { return r.isRank * r.vol; }), vol);
  }

  function stochRound(x, rnd) {
    var f = Math.floor(x);
    return f + (rnd() < x - f ? 1 : 0);
  }

  function emptyMetrics() {
    return { impressions: 0, clicks: 0, cost: 0, conversions: 0, value: 0, views: 0, viewThrough: 0, eligible: 0 };
  }

  function addMetrics(a, b) {
    ['impressions', 'clicks', 'cost', 'conversions', 'value', 'views', 'viewThrough', 'eligible'].forEach(function (k) { a[k] += b[k] || 0; });
    return a;
  }

  function derive(m) {
    m.ctr = U.safeDiv(m.clicks, m.impressions);
    m.cpc = U.safeDiv(m.cost, m.clicks);
    m.cvr = U.safeDiv(m.conversions, m.clicks);
    m.cpa = U.safeDiv(m.cost, m.conversions);
    m.roas = U.safeDiv(m.value, m.cost);
    m.cpm = U.safeDiv(m.cost, m.impressions) * 1000;
    if (m.views) { m.viewRate = U.safeDiv(m.views, m.impressions); m.cpv = U.safeDiv(m.cost, m.views); }
    return m;
  }

  // ---------------------------------------------------------------------------
  // Keyword planner-style estimates (no noise)
  // ---------------------------------------------------------------------------

  function baseSearchVolume(text, intent, ctx) {
    var n = U.words(text).length;
    var u = U.unit('vol:' + text);
    var v;
    if (intent === 'brand') {
      v = (150 + u * 600) * (1 + (ctx.brandLift || 0));
      return v * (ctx.acc.serviceArea === 'local' ? 0.5 : 1);
    }
    if (n <= 1) v = 25000 + u * 90000;
    else if (n === 2) v = 3000 + u * 20000;
    else if (n === 3) v = 600 + u * 5000;
    else v = 80 + u * 1200;
    var ind = D.INDUSTRIES[ctx.acc.industry];
    return v * ind.volume;
  }

  function keywordPlanner(state, text) {
    var ctx = makeContext(state, { preview: true });
    var intent = M.intentOf(text, state);
    var vol = baseSearchVolume(text, intent, ctx);
    var ind = D.INDUSTRIES[state.account.industry];
    var n = U.words(text).length;
    var cpc = ind.search.cpc * INTENT[intent].cpc * (n <= 1 ? 1.35 : n >= 4 ? 0.8 : 1);
    var comp = U.clamp(ind.competition * (n <= 1 ? 1.2 : n >= 3 ? 0.8 : 1) * (intent === 'high' ? 1.15 : 1), 0, 1);
    return {
      text: text, intent: intent, monthlySearches: Math.round(vol / 10) * 10,
      lowBid: cpc * 0.55, highBid: cpc * 1.7, competition: comp > 0.66 ? 'High' : comp > 0.4 ? 'Medium' : 'Low',
      relevance: M.relevance(text, ctx.vocab)
    };
  }

  // ---------------------------------------------------------------------------
  // Search-term expansion
  // ---------------------------------------------------------------------------

  function pickN(list, n, seedStr) {
    var r = U.rng(U.hash(seedStr));
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr.slice(0, n);
  }

  function applyModifier(text, mod) {
    return mod.pos === 'prefix' ? mod.w + ' ' + text : text + ' ' + mod.w;
  }

  // Returns [{term, share, kind}] for a keyword given its match type
  function expandTerms(kw, ctx, smart) {
    var text = kw.text;
    var ind = D.INDUSTRIES[ctx.acc.industry];
    if (kw.match === 'exact') return [{ term: text, share: 1, kind: 'core' }];
    var shares = kw.match === 'phrase'
      ? { core: 0.5, high: 0.32, low: 0.18, related: 0 }
      : smart
        ? { core: 0.36, high: 0.34, low: 0.13, related: 0.17 }
        : { core: 0.3, high: 0.25, low: 0.25, related: 0.2 };
    var nHigh = kw.match === 'phrase' ? 2 : 3;
    var nLow = kw.match === 'phrase' ? 2 : 3;
    var out = [{ term: text, share: shares.core, kind: 'core' }];
    var highs = pickN(D.MODIFIERS.high, nHigh, 'h:' + text);
    var lows = pickN(D.MODIFIERS.low, nLow, 'l:' + text);
    highs.forEach(function (m) { out.push({ term: applyModifier(text, m), share: shares.high / nHigh, kind: 'high' }); });
    lows.forEach(function (m) { out.push({ term: applyModifier(text, m), share: shares.low / nLow, kind: 'low' }); });
    if (shares.related) {
      var comp = pickN(ind.competitors, 1, 'c:' + text)[0];
      var core = U.words(text).slice(-2).join(' ');
      var vocabWords = ind.vocab.split(' ').filter(function (w) { return text.indexOf(w) < 0; });
      var adj = pickN(vocabWords, 1, 'r:' + text)[0] || 'service';
      var unrelated = pickN(['wallpaper', 'meme', 'game', 'lyrics', 'tattoo', 'costume'], 1, 'u:' + text)[0];
      out.push({ term: comp + ' ' + core, share: shares.related * 0.4, kind: 'related' });
      out.push({ term: core + ' ' + adj, share: shares.related * 0.35, kind: 'related' });
      out.push({ term: core + ' ' + unrelated, share: shares.related * 0.25, kind: 'related' });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Search campaigns
  // ---------------------------------------------------------------------------

  function assetInfo(c) {
    var a = c.assets || {};
    var sl = (a.sitelinks || []).filter(function (s) { return s.text && s.url && s.text.length <= 25; });
    var callouts = String(a.callouts || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s && s.length <= 25; });
    var snippets = String(a.snippetValues || '').split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean);
    var boost = (sl.length >= 4 ? 0.1 : sl.length >= 2 ? 0.06 : 0) + (callouts.length >= 2 ? 0.04 : 0) +
      (snippets.length >= 3 ? 0.03 : 0) + (a.phone ? 0.02 : 0);
    return { sitelinks: sl, callouts: callouts, snippets: snippets, boost: boost };
  }

  function themeTightness(kws) {
    if (kws.length < 3) return 1;
    var sets = kws.map(function (k) { return new Set(U.contentTokens(k.text)); });
    var tot = 0, n = 0;
    for (var i = 0; i < sets.length; i++) {
      for (var j = i + 1; j < sets.length; j++) {
        var inter = 0;
        sets[i].forEach(function (t) { if (sets[j].has(t)) inter++; });
        var uni = sets[i].size + sets[j].size - inter;
        tot += uni ? inter / uni : 0;
        n++;
      }
    }
    return n ? tot / n : 1;
  }

  function simSearch(c, ctx) {
    var res = campaignShell(c);
    var acc = ctx.acc;
    var ind = D.INDUSTRIES[acc.industry];
    var loc = locationFactors(c, acc);
    if (!loc.weight) { res.errors.push('No locations targeted'); return res; }
    var sched = scheduleFactors(c, acc.industry);
    var lang = languageFactors(c);
    var dev = deviceFactors(c, acc.industry);
    if (!dev.volume) { res.errors.push('All devices are excluded (−100%)'); return res; }
    var learn = learningFactor(c, ctx);
    res.learning = learn.status;
    var strategy = c.bidStrategy;
    var bs = D.BID_STRATEGIES[strategy];
    if (!bs || bs.types.indexOf('search') < 0) { res.errors.push('Bid strategy is not available for Search'); return res; }
    if ((strategy === 'target_cpa' || strategy === 'target_roas') && !acc.conversionTracking) {
      res.errors.push(bs.name + ' cannot run without conversion tracking'); return res;
    }
    if (strategy === 'target_cpa' && !(c.targetCpa > 0)) { res.errors.push('Set a Target CPA'); return res; }
    if (strategy === 'target_roas' && !(c.targetRoas > 0)) { res.errors.push('Set a Target ROAS'); return res; }
    var budget = (Number(c.dailyBudget) || 0) * BUDGET_DAYS;
    if (!(budget > 0)) { res.errors.push('Daily budget is 0'); return res; }
    var net = c.networks || {};
    var assets = assetInfo(c);
    var smartActive = SMART.indexOf(strategy) >= 0 && acc.conversionTracking;
    var partners = net.searchPartners ? { volume: 1.1, cvr: 0.95 } : { volume: 1, cvr: 1 };
    var campNeg = M.campaignNegatives(c);
    var comp = ctx.market.competition * (0.85 + 0.3 * ind.competition);

    var dxBudget = net.displayExpansion ? budget * 0.15 : 0;
    var searchBudget = budget - dxBudget;

    var units = [];
    var seen = ctx.seenKeywords;
    (c.adGroups || []).forEach(function (g) {
      if (g.paused) return;
      var kws = M.adGroupKeywords(g);
      var strengths = (g.ads || []).map(function (a) { return M.rsaStrength(a, kws); });
      var best = null, bestAd = null;
      strengths.forEach(function (s, i) { if (s.valid && (!best || s.points > best.points)) { best = s; bestAd = g.ads[i]; } });
      var gRes = { id: g.id, name: g.name, campaignId: c.id, campaign: c.name, adStrength: best ? best.label : 'Incomplete', keywords: kws.length };
      Object.assign(gRes, emptyMetrics());
      res.adGroups.push(gRes);
      if (!kws.length) { res.warnings.push('Ad group "' + g.name + '" has no keywords'); return; }
      if (!best) { res.warnings.push('Ad group "' + g.name + '" has no valid responsive search ad'); return; }
      var negs = campNeg.concat(U.parseKeywordList(g.negativesText));
      var tight = themeTightness(kws);
      var headlines = best.headlines;
      var headTokens = new Set(U.contentTokens(headlines.join(' ')));
      kws.forEach(function (kw) {
        var key = kw.match + ':' + kw.text;
        var dup = seen.has(key);
        seen.add(key);
        var intent = M.intentOf(kw.text, ctx.state);
        var rel = intent === 'brand' ? 1 : M.relevance(kw.text, ctx.vocab);
        var n = U.words(kw.text).length;
        var kt = U.contentTokens(kw.text);
        var inHead = kt.length ? kt.filter(function (t) { return headTokens.has(t); }).length / kt.length : 0;
        var expCtr = 0.5 + (n >= 2 ? 0.1 : -0.15) + (n >= 3 ? 0.08 : 0) + ({ exact: 0.08, phrase: 0.03, broad: -0.05 })[kw.match] +
          ({ brand: 0.3, high: 0.08, neutral: 0, competitor: -0.25, low: -0.2 })[intent] + STRENGTH_QS[best.label] + (inHead >= 0.99 ? 0.08 : 0);
        expCtr = U.clamp(expCtr * (0.45 + 0.55 * rel), 0.05, 1);
        var adRel = 0.15 + 0.85 * inHead - (tight < 0.12 ? 0.15 : 0) - (kws.length > 25 ? 0.1 : 0);
        adRel = U.clamp(adRel * (0.5 + 0.5 * rel), 0.05, 1);
        var lp = landingPageQuality(bestAd.finalUrl, kw.text, ctx);
        var qs = U.clamp(Math.round(1 + 9 * (0.39 * expCtr + 0.22 * adRel + 0.39 * lp)), 1, 10);
        var genericMult = n <= 1 ? 1.35 : n >= 4 ? 0.8 : 1;
        var vol = baseSearchVolume(kw.text, intent, ctx) * ctx.market.demand * (intent === 'brand' ? Math.min(1, loc.weight * 3 + 0.3) : loc.weight) *
          sched.volume * lang.volume * dev.volume * partners.volume * ({ exact: 1, phrase: 1.7, broad: 2.8 })[kw.match] * (dup ? 0.5 : 1);
        var predCvr = ind.search.cvr * INTENT[intent].cvr * (0.08 + 0.92 * Math.pow(rel, 1.3)) * (0.55 + 0.9 * lp);
        var terms = expandTerms(kw, ctx, smartActive).map(function (t) {
          var blocked = negs.some(function (ng) { return U.negativeBlocks(ng, t.term); });
          var tIntent = t.kind === 'core' ? intent : M.intentOf(t.term, ctx.state);
          if (t.kind === 'high' && tIntent === 'neutral') tIntent = 'high';
          var tRel = t.kind === 'related' ? M.relevance(t.term, ctx.vocab) * (tIntent === 'competitor' ? 0.6 : 1) : rel;
          return { term: t.term, kind: t.kind, share: t.share, blocked: blocked, intent: tIntent, rel: tRel };
        });
        units.push({
          c: c, g: g, gRes: gRes, kw: kw, dup: dup, intent: intent, rel: rel, qs: qs, expCtr: expCtr, adRel: adRel, lp: lp,
          strength: best.label, vol: vol, terms: terms, predCvr: predCvr,
          benchCpc: ind.search.cpc * loc.cpc * comp * INTENT[intent].cpc * genericMult,
          genericMult: genericMult, finalUrl: bestAd.finalUrl
        });
      });
    });

    if (!units.length) { res.errors.push('No ad groups with both keywords and a valid ad'); return res; }

    var avgPredCvr = U.sum(units, function (u) { return u.predCvr; }) / units.length || 0.01;
    var boost = assets.boost;
    var assetCtr = 1 + boost * 0.9;

    function bidFor(u, scale) {
      var b;
      switch (strategy) {
        case 'manual_cpc': b = Number(u.g.defaultBid) || Number(c.maxCpc) || 1; break;
        case 'max_clicks': b = u.benchCpc * 1.4 * scale; if (c.maxCpc > 0 && c.bidCap) b = Math.min(b, c.maxCpc); break;
        case 'max_conversions':
          b = smartActive ? u.benchCpc * 1.5 * Math.sqrt(u.predCvr / avgPredCvr) * scale : u.benchCpc * 1.4 * scale; break;
        case 'max_conv_value':
          b = smartActive ? u.benchCpc * 1.5 * Math.sqrt(u.predCvr / avgPredCvr) * scale : u.benchCpc * 1.4 * scale; break;
        case 'target_cpa': b = c.targetCpa * u.predCvr * learn.factor; break;
        case 'target_roas': b = u.predCvr * acc.value / (c.targetRoas / 100) * learn.factor; break;
        case 'target_is':
          var t = U.clamp((c.targetIs || 70) / 100, 0.05, 0.94);
          var r = Math.exp(Math.log((t / 0.95) / (1 - t / 0.95)) / 2.5 - 0.1);
          b = r * u.benchCpc * 7.8 / (u.qs * (1 + boost));
          if (c.maxCpc > 0) b = Math.min(b, c.maxCpc);
          break;
        default: b = 1;
      }
      return b * (strategy === 'manual_cpc' ? dev.bid : 1);
    }

    function evaluate(scale) {
      var rows = [];
      var cost = 0;
      units.forEach(function (u) {
        var bid = bidFor(u, scale);
        u.terms.forEach(function (t) {
          if (t.blocked) return;
          var vol = u.vol * t.share;
          var compRank = u.benchCpc / INTENT[u.intent].cpc * INTENT[t.intent].cpc * 7.8;
          var myRank = bid * u.qs * (1 + boost);
          var r = myRank / compRank;
          var isRank = 0.95 * U.sigmoid(2.5 * (Math.log(Math.max(r, 1e-6)) + 0.1));
          if (u.qs <= 3) isRank *= 0.6;
          var absTop = U.clamp((r - 0.6) / 2.4, 0.02, 0.85);
          var top = U.clamp(absTop + 0.3, 0.1, 0.98);
          var posF = 0.45 + 0.75 * absTop + 0.25 * (top - absTop);
          var impr = vol * isRank;
          var ctr = ind.search.ctr * INTENT[t.intent].ctr * (0.35 + 0.65 * t.rel) * posF * STRENGTH_CTR[u.strength] *
            Math.pow(u.expCtr / 0.5, 0.5) * assetCtr;
          ctr = U.clamp(ctr, 0.002, 0.5);
          var clicks = impr * ctr;
          var cpc = Math.min(bid, compRank * U.clamp(0.35 + 0.4 * Math.log(1 + r), 0.3, 1.05) / (u.qs * (1 + boost)) + 0.01);
          var smartBoost = smartActive ? (learn.factor > 1 ? 1.1 : learn.factor < 0.9 ? 0.92 : 1.03) : 1;
          var cvr = ind.search.cvr * INTENT[t.intent].cvr * (0.08 + 0.92 * Math.pow(t.rel, 1.3)) * (0.55 + 0.9 * u.lp) *
            loc.cvr * sched.cvr * lang.cvr * dev.cvr * partners.cvr * (acc.conversionTracking ? smartBoost : SMART.indexOf(strategy) >= 0 ? learn.factor : 1);
          cvr = U.clamp(cvr, 0, 0.6);
          var c2 = clicks * cpc;
          cost += c2;
          rows.push({ u: u, t: t, vol: vol, impr: impr, isRank: isRank, absTop: absTop, top: top, clicks: clicks, cpc: cpc, cost: c2, cvr: cvr, bid: bid });
        });
      });
      return { rows: rows, cost: cost };
    }

    var scale = 1;
    var ev;
    if (bs.auto) {
      // Automated bidding raises or lowers bids to spend (but not exceed) the budget.
      var lo = 0.1, hi = 3;
      var evHi = evaluate(hi);
      if (evHi.cost <= searchBudget) { scale = hi; ev = evHi; }
      else {
        for (var i = 0; i < 22; i++) {
          var mid = (lo + hi) / 2;
          var e = evaluate(mid);
          if (e.cost > searchBudget) hi = mid; else lo = mid;
        }
        scale = lo;
        ev = evaluate(lo);
      }
    } else {
      ev = evaluate(1);
    }
    var throttle = ev.cost > searchBudget ? searchBudget / ev.cost : 1;
    res.budgetLimited = throttle < 0.98 || (bs.auto && scale < 1);

    var rnd = ctx.rnd;
    var kwMap = new Map();
    var termMap = ctx.searchTerms;
    ev.rows.forEach(function (row) {
      var u = row.u;
      var noise = 0.9 + 0.2 * rnd();
      var impr = stochRound(row.impr * throttle * noise, rnd);
      var clicks = Math.min(impr, stochRound(row.clicks * throttle * noise, rnd));
      var cost = clicks * row.cpc;
      var conv = stochRound(clicks * row.cvr, rnd);
      var value = conv * acc.value * (0.9 + 0.2 * rnd());
      var m = { impressions: impr, clicks: clicks, cost: cost, conversions: conv, value: value, eligible: row.vol };
      var k = u.g.id + '|' + u.kw.match + '|' + u.kw.text;
      if (!kwMap.has(k)) {
        kwMap.set(k, Object.assign(emptyMetrics(), {
          campaignId: c.id, campaign: c.name, adGroupId: u.g.id, adGroup: u.g.name, text: u.kw.text, match: u.kw.match, intent: u.intent,
          qs: u.qs, expCtr: componentLabel(u.expCtr), adRel: componentLabel(u.adRel), lp: componentLabel(u.lp),
          expCtrV: u.expCtr, adRelV: u.adRel, lpV: u.lp, relevance: u.rel, duplicate: u.dup, bid: row.bid,
          firstPageBid: u.benchCpc * 7.8 * 0.3 / (u.qs * (1 + boost)), topPageBid: u.benchCpc * 7.8 * 0.75 / (u.qs * (1 + boost)),
          absTopW: 0, topW: 0
        }));
      }
      var km = kwMap.get(k);
      addMetrics(km, m);
      km.absTopW += row.absTop * impr;
      km.topW += row.top * impr;
      addMetrics(u.gRes, m);
      var tk = c.id + '|' + row.t.term;
      if (!termMap.has(tk)) {
        termMap.set(tk, Object.assign(emptyMetrics(), {
          campaignId: c.id, campaign: c.name, adGroupId: u.g.id, adGroup: u.g.name, term: row.t.term, keyword: U.formatKeyword(u.kw),
          kind: row.t.kind, intent: row.t.intent, relevance: row.t.rel, type: 'search'
        }));
      }
      addMetrics(termMap.get(tk), m);
      addMetrics(res, m);
      res.quality += clicks * row.t.rel * (row.t.intent === 'low' ? 0.3 : 1);
      res.lpW += clicks * u.lp;
      res.landing[u.finalUrl] = (res.landing[u.finalUrl] || 0) + clicks;
    });

    // blocked terms still show up (as "excluded") so students can see negatives working
    units.forEach(function (u) {
      u.terms.forEach(function (t) {
        if (!t.blocked) return;
        var tk = c.id + '|' + t.term;
        if (!termMap.has(tk)) {
          termMap.set(tk, Object.assign(emptyMetrics(), {
            campaignId: c.id, campaign: c.name, adGroupId: u.g.id, adGroup: u.g.name, term: t.term, keyword: U.formatKeyword(u.kw),
            kind: t.kind, intent: t.intent, relevance: t.rel, excluded: true, type: 'search'
          }));
        }
      });
    });

    kwMap.forEach(function (km) {
      km.absTop = U.safeDiv(km.absTopW, km.impressions);
      km.top = U.safeDiv(km.topW, km.impressions);
      km.impressionShare = U.safeDiv(km.impressions, km.eligible);
      derive(km);
      ctx.keywords.push(km);
    });
    res.impressionShare = U.safeDiv(res.impressions, res.eligible);
    // Rank-limited share is measured at unconstrained bids; anything below it is budget-limited
    // (for automated strategies the budget shows up as lower bids rather than throttling).
    var isRankAvg = rankShare(bs.auto ? evaluate(1) : ev);
    res.lostIsRank = U.clamp(1 - isRankAvg, 0, 1);
    res.lostIsBudget = U.clamp(isRankAvg - res.impressionShare, 0, 1);
    res.avgQs = U.safeDiv(U.sum(Array.from(kwMap.values()), function (k) { return k.qs * k.impressions; }), res.impressions) ||
      U.safeDiv(U.sum(units, function (u) { return u.qs; }), units.length);

    // Display Network expansion: cheap, low-intent impressions from the Search campaign
    if (dxBudget > 0) {
      // expansion reach follows the campaign's own reach (locations, schedule), up to 15% of budget
      dxBudget = Math.min(dxBudget, res.cost * 0.2);
      var cpm = ind.display.cpc * ind.display.ctr * 1000 * 0.9;
      var dxImpr = Math.round(dxBudget / cpm * 1000);
      var dxClicks = Math.round(dxImpr * ind.display.ctr * 0.8);
      var dxConv = stochRound(dxClicks * ind.display.cvr * 0.6 * loc.cvr, rnd);
      var dx = { impressions: dxImpr, clicks: dxClicks, cost: dxBudget * (0.95 + 0.05 * rnd()), conversions: dxConv, value: dxConv * acc.value };
      addMetrics(res, dx);
      res.displayExpansion = derive(Object.assign(emptyMetrics(), dx));
      res.quality += dxClicks * 0.25;
      res.lpW += dxClicks * 0.5;
      ctx.placements.push(Object.assign(emptyMetrics(), dx, { campaignId: c.id, campaign: c.name, placement: 'Display Network (from Search campaign expansion)', kind: 'expansion' }));
    }
    res.adGroups.forEach(derive);
    res.deviceSplit = dev.split;
    res.budget = budget;
    return res;
  }

  // ---------------------------------------------------------------------------
  // Display & video targeting segments
  // ---------------------------------------------------------------------------

  function segmentsFor(g, c, ctx, kind) {
    var t = g.targeting || M.newTargeting();
    var ind = ctx.acc.industry;
    var segs = [];
    (t.audiences || []).forEach(function (id) {
      var a = D.AUDIENCES.find(function (x) { return x.id === id; });
      if (!a) return;
      var rel = a.inds === 'all' || a.inds.indexOf(ind) >= 0 ? 1 : 0.35;
      var size = a.size;
      if (a.type === 'custom') { rel = ctx.hasKeywords ? 0.9 : 0.55; }
      if (a.type === 'remarketing') {
        size = ctx.acc.conversionTracking ? ctx.remarketingUsers * (a.id === 'rmk_engaged' ? 0.3 : 1) * 25 : 0;
        rel = 1;
      }
      segs.push({ key: a.id, name: a.name, type: a.type, size: size, rel: rel });
    });
    var audienceCount = segs.length;
    (t.topics || []).forEach(function (id) {
      var tp = D.TOPICS.find(function (x) { return x.id === id; });
      if (!tp) return;
      segs.push({ key: tp.id, name: 'Topic: ' + tp.name, type: 'topic', size: tp.size, rel: tp.inds.indexOf(ind) >= 0 ? 0.85 : 0.25 });
    });
    String(t.placementsText || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (p) {
      var r = M.relevance(p.replace(/[._\/-]+/g, ' '), ctx.vocab);
      segs.push({ key: 'pl:' + p, name: 'Placement: ' + p, type: 'placement', size: 2.5e6, rel: U.clamp(0.3 + r, 0.3, 1) });
    });
    var layered = audienceCount > 0 && segs.length > audienceCount;
    if (layered) segs.forEach(function (s) { s.size *= 0.3; s.rel = Math.min(1, s.rel + 0.15); });
    var base = U.sum(segs, function (s) { return s.size; });
    if (t.optimized) {
      segs.push({ key: 'optimized', name: 'Optimized targeting (expansion)', type: 'optimized', size: Math.max(base * 1.5, 25e6), rel: segs.length ? 0.55 : 0.45 });
    }
    if (!segs.length) segs.push({ key: 'network', name: 'Entire network (no targeting)', type: 'network', size: 500e6, rel: 0.15 });
    return { segs: segs, layered: layered };
  }

  function placementRows(c, seg, m, ctx, excludeApps) {
    var ind = D.INDUSTRIES[ctx.acc.industry];
    var w = ind.vocab.split(' ')[0];
    var names = [w + 'insider.example', 'the' + w + 'guide.example', w + 'forum.example'];
    return names;
  }

  // ---------------------------------------------------------------------------
  // Display campaigns
  // ---------------------------------------------------------------------------

  function simDisplay(c, ctx) {
    var res = campaignShell(c);
    var acc = ctx.acc;
    var ind = D.INDUSTRIES[acc.industry];
    var loc = locationFactors(c, acc);
    if (!loc.weight) { res.errors.push('No locations targeted'); return res; }
    var sched = scheduleFactors(c, acc.industry);
    var dev = deviceFactors(c, acc.industry);
    if (!dev.volume) { res.errors.push('All devices are excluded (−100%)'); return res; }
    var learn = learningFactor(c, ctx);
    res.learning = learn.status;
    var strategy = c.bidStrategy;
    var bs = D.BID_STRATEGIES[strategy];
    if (!bs || bs.types.indexOf('display') < 0) { res.errors.push('Bid strategy is not available for Display'); return res; }
    if (strategy === 'target_cpa' && (!acc.conversionTracking || !(c.targetCpa > 0))) { res.errors.push('Target CPA needs conversion tracking and a target'); return res; }
    var budget = (Number(c.dailyBudget) || 0) * BUDGET_DAYS;
    if (!(budget > 0)) { res.errors.push('Daily budget is 0'); return res; }
    var smartActive = SMART.indexOf(strategy) >= 0 && acc.conversionTracking;

    var units = [];
    (c.adGroups || []).forEach(function (g) {
      var strengths = (g.ads || []).map(function (a) { return M.rdaStrength(a); });
      var best = null, bestAd = null;
      strengths.forEach(function (s, i) { if (s.valid && (!best || s.points > best.points)) { best = s; bestAd = g.ads[i]; } });
      var gRes = Object.assign({ id: g.id, name: g.name, campaignId: c.id, campaign: c.name, adStrength: best ? best.label : 'Incomplete' }, emptyMetrics());
      res.adGroups.push(gRes);
      if (!best) { res.warnings.push('Ad group "' + g.name + '" has no valid responsive display ad'); return; }
      var demo = demographicFactors(g.targeting, acc.industry);
      var sg = segmentsFor(g, c, ctx, 'display');
      var lp = landingPageQuality(bestAd.finalUrl, '', ctx);
      sg.segs.forEach(function (s) {
        var tp = D.AUDIENCE_TYPES[s.type];
        units.push({
          g: g, gRes: gRes, seg: s, tp: tp, strength: best.label, formatReach: best.formatReach, lp: lp,
          reach: s.size * loc.weight * demo.reach * best.formatReach * sched.volume * dev.volume * ctx.market.demand,
          demoCvr: demo.cvr,
          benchCpm: ind.display.cpc * ind.display.ctr * 1000 * tp.cpm * ctx.market.competition,
          ctr: ind.display.ctr * tp.ctr * (0.4 + 0.6 * s.rel) * STRENGTH_CTR[best.label],
          cvr: ind.display.cvr * tp.cvr * (0.2 + 0.8 * s.rel) * demo.cvr * (0.55 + 0.9 * lp) * loc.cvr * sched.cvr * dev.cvr,
          finalUrl: bestAd.finalUrl
        });
      });
      if (sg.layered) res.notes.push('Ad group "' + g.name + '" layers audiences with content targeting (narrower, more relevant reach)');
    });
    if (!units.length) { res.errors.push('No ad groups with a valid responsive display ad'); return res; }

    var appsShare = c.excludeApps ? 0 : 0.22;
    function bidCpm(u, scale) {
      switch (strategy) {
        case 'manual_cpc': return (Number(u.g.defaultBid) || Number(c.maxCpc) || 0.5) * u.ctr * 1000 * dev.bid;
        case 'vcpm': return (Number(c.targetCpm) || 3) * 0.7;
        case 'target_cpa': return c.targetCpa * u.ctr * u.cvr * 1000 * learn.factor;
        case 'max_conversions': return u.benchCpm * 1.3 * scale * (smartActive ? Math.sqrt(u.cvr / ind.display.cvr) : 1);
        default: return u.benchCpm * 1.3 * scale;
      }
    }
    function evaluate(scale) {
      var rows = [], cost = 0;
      units.forEach(function (u) {
        var bid = bidCpm(u, scale);
        // publishers set reserve prices: bids under ~35% of the market CPM win nothing
        var win = bid < u.benchCpm * 0.35 ? 0 : 0.9 * U.sigmoid(2.2 * (Math.log(bid / u.benchCpm) + 0.2));
        var impr = u.reach * win;
        var paid = Math.max(u.benchCpm * 0.35, Math.min(bid, u.benchCpm * (0.6 + 0.35 * win)));
        var cst = impr * paid / 1000;
        cost += cst;
        rows.push({ u: u, impr: impr, cpm: paid, cost: cst, eligible: u.reach, win: win });
      });
      return { rows: rows, cost: cost };
    }
    var ev, scale = 1;
    if (bs.auto) {
      var lo = 0.3, hi = 4;
      var evHi = evaluate(hi);
      if (evHi.cost <= budget) { ev = evHi; scale = hi; }
      else if (evaluate(lo).cost >= budget) { ev = evaluate(lo); scale = lo; }
      else {
        for (var i = 0; i < 22; i++) { var mid = (lo + hi) / 2; if (evaluate(mid).cost > budget) hi = mid; else lo = mid; }
        ev = evaluate(lo); scale = lo;
      }
    } else ev = evaluate(1);
    var throttle = ev.cost > budget ? budget / ev.cost : 1;
    res.budgetLimited = throttle < 0.98;

    var rnd = ctx.rnd;
    var capMonthly = c.freqCap > 0 ? c.freqCap * DAYS : Infinity;
    var totalReach = 0;
    var smartBoost = smartActive ? (learn.factor > 1 ? 1.12 : learn.factor < 0.9 ? 0.9 : 1.03) : (SMART.indexOf(strategy) >= 0 ? learn.factor : 1);
    ev.rows.forEach(function (row) {
      var u = row.u;
      var people = Math.max(u.reach / 6, 1);
      var impr = row.impr * throttle;
      var users = people * (1 - Math.exp(-impr / people));
      var freq = users ? impr / users : 0;
      if (freq > capMonthly) { impr = users * capMonthly; freq = capMonthly; }
      var fatigue = freq > 10 ? Math.sqrt(10 / freq) : 1;
      var noise = 0.9 + 0.2 * rnd();
      impr = Math.round(impr * noise);
      var webImpr = impr * (1 - appsShare);
      var appImpr = impr * appsShare;
      var webClicks = webImpr * u.ctr * fatigue;
      var appClicks = appImpr * u.ctr * 2.2;
      var clicks = stochRound(webClicks + appClicks, rnd);
      var webShare = U.safeDiv(webClicks, webClicks + appClicks);
      var cvr = u.cvr * smartBoost;
      var conv = stochRound(clicks * webShare * cvr + clicks * (1 - webShare) * cvr * 0.05, rnd);
      var cost = impr * row.cpm / 1000;
      var vt = acc.conversionTracking ? stochRound(impr * 1.2e-5 * u.seg.rel * u.tp.cvr, rnd) : 0;
      var value = conv * acc.value * (0.9 + 0.2 * rnd());
      var m = { impressions: impr, clicks: clicks, cost: cost, conversions: conv, value: value, viewThrough: vt, eligible: row.eligible };
      addMetrics(res, m);
      addMetrics(u.gRes, m);
      totalReach += users;
      res.quality += clicks * (webShare * (0.3 + 0.6 * u.seg.rel));
      res.lpW += clicks * u.lp;
      res.landing[u.finalUrl] = (res.landing[u.finalUrl] || 0) + clicks;
      ctx.audiences.push(Object.assign(emptyMetrics(), m, {
        campaignId: c.id, campaign: c.name, adGroup: u.g.name, segment: u.seg.name, type: u.tp.label, relevance: u.seg.rel, frequency: freq
      }));
      // placement breakdown
      var names = placementRows(c, u.seg, m, ctx);
      var goodShare = 0.25 + 0.6 * u.seg.rel;
      var webImprR = Math.round(webImpr);
      [[names[0], 0.5 * goodShare], [names[1], 0.3 * goodShare], [names[2], 0.2 * goodShare],
       ['newsportal.example', 0.5 * (1 - goodShare)], ['weatherdaily.example', 0.3 * (1 - goodShare)], ['celebgossip.example', 0.2 * (1 - goodShare)]].forEach(function (p) {
        pushPlacement(ctx, c, p[0], 'site', webImprR * p[1], webClicks * p[1] * fatigue, cost * (1 - appsShare) * p[1], conv * webShare * (webClicks ? p[1] : 0), value * webShare * p[1]);
      });
      if (appsShare) {
        [['Mobile app: Bubble Pop Saga', 0.5], ['Mobile app: Flashlight Pro', 0.3], ['Mobile app: Word Puzzle Daily', 0.2]].forEach(function (p) {
          pushPlacement(ctx, c, p[0], 'app', appImpr * p[1], appClicks * p[1], cost * appsShare * p[1], conv * (1 - webShare) * p[1], value * (1 - webShare) * p[1]);
        });
      }
    });
    res.reach = Math.round(totalReach);
    res.frequency = U.safeDiv(res.impressions, totalReach);
    res.impressionShare = U.safeDiv(res.impressions, res.eligible);
    res.adGroups.forEach(derive);
    res.deviceSplit = dev.split;
    res.budget = budget;
    return res;
  }

  function pushPlacement(ctx, c, name, kind, impr, clicks, cost, conv, value) {
    var key = c.id + '|' + name;
    var row = ctx.placementMap.get(key);
    if (!row) {
      row = Object.assign(emptyMetrics(), { campaignId: c.id, campaign: c.name, placement: name, kind: kind });
      ctx.placementMap.set(key, row);
      ctx.placements.push(row);
    }
    row.impressions += Math.round(impr);
    row.clicks += Math.round(clicks);
    row.cost += cost;
    row.conversions += conv;
    row.value += value;
  }

  // ---------------------------------------------------------------------------
  // Video campaigns
  // ---------------------------------------------------------------------------

  function simVideo(c, ctx) {
    var res = campaignShell(c);
    var acc = ctx.acc;
    var ind = D.INDUSTRIES[acc.industry];
    var loc = locationFactors(c, acc);
    if (!loc.weight) { res.errors.push('No locations targeted'); return res; }
    var dev = deviceFactors(c, acc.industry);
    var sched = scheduleFactors(c, acc.industry);
    var format = c.videoFormat || 'skippable';
    var f = D.VIDEO_FORMATS[format];
    var strategy = c.bidStrategy;
    var bs = D.BID_STRATEGIES[strategy];
    if (!bs || bs.types.indexOf('video') < 0) { res.errors.push('Bid strategy is not available for Video'); return res; }
    if (f.billing === 'cpm' && strategy === 'max_cpv') { res.errors.push(f.name + ' ads are bought on CPM — use Target CPM'); return res; }
    if (SMART.indexOf(strategy) >= 0 && format !== 'skippable') { res.errors.push('Conversion bidding for video requires skippable in-stream ads'); return res; }
    if (SMART.indexOf(strategy) >= 0 && !acc.conversionTracking) { res.errors.push(bs.name + ' needs conversion tracking'); return res; }
    if (strategy === 'target_cpa' && !(c.targetCpa > 0)) { res.errors.push('Set a Target CPA'); return res; }
    var budget = (Number(c.dailyBudget) || 0) * BUDGET_DAYS;
    if (!(budget > 0)) { res.errors.push('Daily budget is 0'); return res; }
    var learn = learningFactor(c, ctx);
    res.learning = learn.status;

    var units = [];
    (c.adGroups || []).forEach(function (g) {
      var ad = (g.ads || []).find(function (a) { return M.videoAdCheck(a, format).valid; });
      var gRes = Object.assign({ id: g.id, name: g.name, campaignId: c.id, campaign: c.name }, emptyMetrics());
      res.adGroups.push(gRes);
      if (!ad) {
        var chk = M.videoAdCheck((g.ads || [])[0] || {}, format);
        res.warnings.push('Ad group "' + g.name + '": ' + (chk.errors[0] || 'no eligible video ad'));
        return;
      }
      var demo = demographicFactors(g.targeting, acc.industry);
      var sg = segmentsFor(g, c, ctx, 'video');
      var len = Number(ad.length) || 30;
      var lenMult = len <= 15 ? 1.35 : len <= 30 ? 1.15 : len <= 60 ? 1.0 : len <= 180 ? 0.8 : 0.6;
      var lp = landingPageQuality(ad.finalUrl, '', ctx);
      sg.segs.forEach(function (s) {
        var tp = D.AUDIENCE_TYPES[s.type];
        var vr;
        if (format === 'skippable') vr = ind.video.viewRate * lenMult * (ad.hook ? 1.2 : 0.8) * (ad.captions ? 1.03 : 1) * (0.55 + 0.45 * s.rel);
        else if (format === 'infeed') vr = 0.035 * (ad.headline ? 1.2 : 0.8) * (0.5 + 0.5 * s.rel);
        else if (format === 'shorts') vr = 0.5 * (ad.aspect === '9:16' ? 1 : 0.55) * (ad.hook ? 1.15 : 0.85);
        else vr = 1; // bumper & non-skippable: every impression is a completed view
        vr = U.clamp(vr, 0.005, 1);
        var ctr = (format === 'bumper' ? 0.002 : format === 'nonskip' ? 0.004 : format === 'shorts' ? 0.003 : format === 'infeed' ? 0.001 : 0.006) *
          (ad.cta ? 1.3 : 0.7) * (ad.headline ? 1.1 : 0.9) * (ad.companion ? 1.1 : 1) * (0.5 + 0.5 * s.rel) * Math.sqrt(tp.ctr);
        if (format === 'infeed') ctr = vr * 0.04;
        units.push({
          g: g, gRes: gRes, seg: s, tp: tp, ad: ad, vr: vr, ctr: ctr, lp: lp,
          reach: s.size * 0.6 * loc.weight * demo.reach * sched.volume * dev.volume * ctx.market.demand,
          benchCpv: ind.video.cpv * Math.sqrt(tp.cpm) * ctx.market.competition,
          benchCpm: ({ bumper: 7, nonskip: 10, shorts: 5, skippable: 9, infeed: 6 })[format] * Math.sqrt(tp.cpm) * ctx.market.competition * (ind.video.cpv / 0.03),
          cvr: ind.display.cvr * 2.2 * tp.cvr * (0.2 + 0.8 * s.rel) * demo.cvr * (0.55 + 0.9 * lp) * loc.cvr * dev.cvr,
          finalUrl: ad.finalUrl
        });
      });
    });
    if (!units.length) { res.errors.push('No ad groups with an eligible video ad'); return res; }

    function perImpressionCost(u, scale) {
      // returns [bid, paid cost per impression, win rate]
      var cpvBilling = f.billing === 'cpv' && strategy === 'max_cpv';
      var bid, bench;
      if (cpvBilling) { bid = Number(c.maxCpv) || 0.05; bench = u.benchCpv; }
      else if (strategy === 'target_cpm') { bid = Number(c.targetCpm) || 8; bench = u.benchCpm; }
      else if (strategy === 'target_cpa') { bid = c.targetCpa * u.ctr * u.cvr * 1000 * learn.factor + 2; bench = u.benchCpm; }
      else { bid = u.benchCpm * 1.3 * scale; bench = u.benchCpm; }
      var win = 0.9 * U.sigmoid(2.2 * (Math.log(Math.max(bid / bench, 1e-6)) + 0.2));
      var paid = Math.min(bid, bench * (0.6 + 0.35 * win));
      var cpi = cpvBilling ? paid * u.vr : paid / 1000;
      return { win: win, cpi: cpi, paid: paid, cpv: cpvBilling };
    }
    function evaluate(scale) {
      var rows = [], cost = 0;
      units.forEach(function (u) {
        var p = perImpressionCost(u, scale);
        var impr = u.reach * p.win;
        cost += impr * p.cpi;
        rows.push({ u: u, impr: impr, p: p, eligible: u.reach });
      });
      return { rows: rows, cost: cost };
    }
    var ev;
    if (strategy === 'max_conversions') {
      var lo = 0.05, hi = 4;
      var eh = evaluate(hi);
      if (eh.cost <= budget) ev = eh;
      else { for (var i = 0; i < 22; i++) { var mid = (lo + hi) / 2; if (evaluate(mid).cost > budget) hi = mid; else lo = mid; } ev = evaluate(lo); }
    } else ev = evaluate(1);
    var throttle = ev.cost > budget ? budget / ev.cost : 1;
    res.budgetLimited = throttle < 0.98;
    var rnd = ctx.rnd;
    var capMonthly = c.freqCap > 0 ? c.freqCap * DAYS : Infinity;
    var totalReach = 0, liftW = 0, earned = 0;
    ev.rows.forEach(function (row) {
      var u = row.u;
      var people = Math.max(u.reach / 5, 1);
      var impr = row.impr * throttle;
      var users = people * (1 - Math.exp(-impr / people));
      var freq = users ? impr / users : 0;
      if (freq > capMonthly) { impr = users * capMonthly; freq = capMonthly; }
      impr = Math.round(impr * (0.92 + 0.16 * rnd()));
      var views = Math.round(impr * u.vr);
      var clicks = stochRound(impr * u.ctr, rnd);
      var cost = impr * row.p.cpi;
      var conv = stochRound(clicks * u.cvr, rnd);
      var vt = acc.conversionTracking ? stochRound(views * 3e-4 * u.seg.rel * u.tp.cvr, rnd) : 0;
      var value = (conv + vt * 0.5) * acc.value * (0.9 + 0.2 * rnd());
      var m = { impressions: impr, clicks: clicks, cost: cost, conversions: conv, value: value, views: views, viewThrough: vt, eligible: row.eligible };
      addMetrics(res, m);
      addMetrics(u.gRes, m);
      totalReach += users;
      var fmtLift = ({ bumper: 1.1, nonskip: 1.2, skippable: 1.0, shorts: 0.9, infeed: 0.6 })[format];
      var lift = U.clamp(fmtLift * (u.ad.hook ? 1.2 : 0.85) * (u.ad.brandEarly ? 1.3 : 0.7) * 12 * (1 - Math.exp(-freq / 3)) * (0.6 + 0.4 * u.seg.rel), 0, 25);
      liftW += lift * users;
      earned += views * 0.1 * (u.ad.hook ? 1.2 : 0.8);
      res.quality += clicks * (0.3 + 0.6 * u.seg.rel);
      res.lpW += clicks * u.lp;
      res.landing[u.finalUrl] = (res.landing[u.finalUrl] || 0) + clicks;
      ctx.audiences.push(Object.assign(emptyMetrics(), m, {
        campaignId: c.id, campaign: c.name, adGroup: u.g.name, segment: u.seg.name, type: u.tp.label, relevance: u.seg.rel, frequency: freq
      }));
    });
    res.reach = Math.round(totalReach);
    res.frequency = U.safeDiv(res.impressions, totalReach);
    res.adRecallLift = U.safeDiv(liftW, totalReach);
    res.earnedViews = Math.round(earned);
    res.impressionShare = U.safeDiv(res.impressions, res.eligible);
    res.format = format;
    res.adGroups.forEach(derive);
    res.deviceSplit = dev.split;
    res.budget = budget;
    return res;
  }

  // ---------------------------------------------------------------------------
  // Shopping campaigns
  // ---------------------------------------------------------------------------

  function productGroupFor(c, p) {
    var groups = c.productGroups || [];
    var byProduct = groups.find(function (g) { return g.dimension === 'product' && g.value === p.id; });
    if (byProduct) return byProduct;
    var byBrand = groups.find(function (g) { return g.dimension === 'brand' && g.value && String(g.value).toLowerCase() === String(p.brand || '').toLowerCase(); });
    if (byBrand) return byBrand;
    var byCat = groups.find(function (g) { return g.dimension === 'category' && g.value && String(g.value).toLowerCase() === String(p.category || '').toLowerCase(); });
    if (byCat) return byCat;
    return groups.find(function (g) { return g.dimension === 'all'; }) || null;
  }

  function simShopping(c, ctx) {
    var res = campaignShell(c);
    var acc = ctx.acc;
    var ind = D.INDUSTRIES[acc.industry];
    var loc = locationFactors(c, acc);
    if (!loc.weight) { res.errors.push('No locations targeted'); return res; }
    var sched = scheduleFactors(c, acc.industry);
    var dev = deviceFactors(c, acc.industry);
    var strategy = c.bidStrategy;
    var bs = D.BID_STRATEGIES[strategy];
    if (!bs || bs.types.indexOf('shopping') < 0) { res.errors.push('Bid strategy is not available for Shopping'); return res; }
    if (strategy === 'target_roas' && (!acc.conversionTracking || !(c.targetRoas > 0))) { res.errors.push('Target ROAS needs conversion tracking and a target'); return res; }
    var budget = (Number(c.dailyBudget) || 0) * BUDGET_DAYS;
    if (!(budget > 0)) { res.errors.push('Daily budget is 0'); return res; }
    var learn = learningFactor(c, ctx);
    res.learning = learn.status;
    var negs = M.campaignNegatives(c);
    var comp = ctx.market.competition * (0.85 + 0.3 * ind.competition);

    var units = [];
    var products = ctx.state.products || [];
    if (!products.length) { res.errors.push('Your product feed is empty'); return res; }
    products.forEach(function (p) {
      var fq = M.feedQuality(p);
      var pg = productGroupFor(c, p);
      var row = Object.assign(emptyMetrics(), { campaignId: c.id, campaign: c.name, productId: p.id, title: p.title, feedScore: fq.score, approved: fq.approved, excluded: !pg || pg.excluded });
      ctx.products.push(row);
      if (!fq.approved || !pg || pg.excluded) return;
      var price = p.salePrice > 0 && p.salePrice < p.price ? Number(p.salePrice) : Number(p.price);
      var priceRatio = p.marketPrice > 0 ? price / p.marketPrice : 1;
      var coreTokens = U.words(p.title).filter(function (w) { return !U.STOPWORDS.has(w) && w.length > 2 && w !== String(p.brand || '').toLowerCase(); });
      var core = (p.category ? U.words(p.category).join(' ') : coreTokens.slice(0, 2).join(' ')) || coreTokens.slice(0, 2).join(' ') || 'product';
      var kw = { text: core, match: 'broad' };
      var terms = expandTerms(kw, ctx, false).map(function (t) {
        var blocked = negs.some(function (ng) { return U.negativeBlocks(ng, t.term); });
        var tIntent = t.kind === 'high' ? 'high' : M.intentOf(t.term, ctx.state);
        var tRel = t.kind === 'related' ? M.relevance(t.term, ctx.vocab) * 0.7 : M.relevance(t.term, ctx.vocab);
        return { term: t.term, kind: t.kind, share: t.share, blocked: blocked, intent: tIntent === 'brand' ? 'high' : tIntent, rel: Math.max(tRel, t.kind === 'low' ? tRel : 0.5) };
      });
      var vol = (2000 + U.unit('shop:' + core + p.id) * 18000) * ind.volume * ctx.market.demand * loc.weight * sched.volume * dev.volume * (0.35 + 0.65 * fq.score);
      units.push({
        p: p, row: row, fq: fq, pg: pg, price: price, priceRatio: priceRatio, terms: terms, vol: vol,
        q: 2 + 8 * fq.score, gtin: /^\d{8}$|^\d{12,14}$/.test(String(p.gtin || '').trim()),
        sale: p.salePrice > 0 && p.salePrice < p.price,
        benchCpc: ind.shopping.cpc * loc.cpc * comp,
        lp: landingPageQuality(M.absoluteUrl(acc.website, p.link || ''), p.title, ctx),
        predCvr: ind.shopping.cvr * U.clamp(Math.pow(1 / priceRatio, 1.5), 0.4, 1.6)
      });
    });
    if (!units.length) { res.errors.push('No approved, non-excluded products to advertise'); return res; }

    function bidFor(u, scale) {
      if (strategy === 'manual_cpc') return (Number(u.pg.bid) || 0.5) * dev.bid;
      if (strategy === 'target_roas') return u.predCvr * u.price * 1.15 / (c.targetRoas / 100) * learn.factor;
      var b = u.benchCpc * 1.4 * scale;
      return b;
    }
    function evaluate(scale) {
      var rows = [], cost = 0;
      units.forEach(function (u) {
        var bid = bidFor(u, scale);
        u.terms.forEach(function (t) {
          if (t.blocked) return;
          var vol = u.vol * t.share;
          var compRank = u.benchCpc * INTENT[t.intent].cpc * 7.8;
          var r = bid * u.q / compRank;
          var isRank = 0.95 * U.sigmoid(2.5 * (Math.log(Math.max(r, 1e-6)) + 0.1)) * (u.gtin ? 1 : 0.8);
          var absTop = U.clamp((r - 0.6) / 2.4, 0.02, 0.85);
          var posF = 0.55 + 0.6 * absTop;
          var impr = vol * isRank;
          var ctr = ind.shopping.ctr * INTENT[t.intent].ctr * (0.35 + 0.65 * t.rel) * posF * U.clamp(Math.pow(1 / u.priceRatio, 2), 0.4, 1.8) *
            (u.sale ? 1.2 : 1) * (0.6 + 0.6 * u.fq.score);
          var clicks = impr * U.clamp(ctr, 0.0005, 0.2);
          var cpc = Math.min(bid, compRank * U.clamp(0.35 + 0.4 * Math.log(1 + r), 0.3, 1.05) / u.q + 0.01);
          var cvr = ind.shopping.cvr * INTENT[t.intent].cvr * (0.08 + 0.92 * Math.pow(t.rel, 1.3)) * U.clamp(Math.pow(1 / u.priceRatio, 1.5), 0.4, 1.6) *
            (0.55 + 0.9 * u.lp) * loc.cvr * sched.cvr * dev.cvr * (strategy === 'target_roas' ? learn.factor : 1);
          cost += clicks * cpc;
          rows.push({ u: u, t: t, vol: vol, impr: impr, isRank: isRank, clicks: clicks, cpc: cpc, cvr: U.clamp(cvr, 0, 0.5) });
        });
      });
      return { rows: rows, cost: cost };
    }
    var ev;
    if (bs.auto) {
      var lo = 0.1, hi = 3;
      var eh = evaluate(hi);
      if (eh.cost <= budget) ev = eh;
      else { for (var i = 0; i < 22; i++) { var mid = (lo + hi) / 2; if (evaluate(mid).cost > budget) hi = mid; else lo = mid; } ev = evaluate(lo); }
    } else ev = evaluate(1);
    var throttle = ev.cost > budget ? budget / ev.cost : 1;
    res.budgetLimited = throttle < 0.98;
    var rnd = ctx.rnd;
    ev.rows.forEach(function (row) {
      var u = row.u;
      var noise = 0.9 + 0.2 * rnd();
      var impr = stochRound(row.impr * throttle * noise, rnd);
      var clicks = Math.min(impr, stochRound(row.clicks * throttle * noise, rnd));
      var cost = clicks * row.cpc;
      var conv = stochRound(clicks * row.cvr, rnd);
      var value = conv * u.price * (1.05 + 0.2 * rnd());
      var m = { impressions: impr, clicks: clicks, cost: cost, conversions: conv, value: value, eligible: row.vol };
      addMetrics(u.row, m);
      addMetrics(res, m);
      var tk = c.id + '|' + row.t.term;
      if (!ctx.searchTerms.has(tk)) {
        ctx.searchTerms.set(tk, Object.assign(emptyMetrics(), {
          campaignId: c.id, campaign: c.name, adGroup: 'Product: ' + M.fit(u.p.title, 40), term: row.t.term, keyword: '(Shopping — matched from product data)',
          kind: row.t.kind, intent: row.t.intent, relevance: row.t.rel, type: 'shopping'
        }));
      }
      addMetrics(ctx.searchTerms.get(tk), m);
      res.quality += clicks * row.t.rel * (row.t.intent === 'low' ? 0.3 : 1);
      res.lpW += clicks * u.lp;
      var link = M.absoluteUrl(acc.website, u.p.link || '');
      res.landing[link] = (res.landing[link] || 0) + clicks;
    });
    units.forEach(function (u) {
      u.terms.forEach(function (t) {
        if (!t.blocked) return;
        var tk = c.id + '|' + t.term;
        if (!ctx.searchTerms.has(tk)) ctx.searchTerms.set(tk, Object.assign(emptyMetrics(), { campaignId: c.id, campaign: c.name, adGroup: 'Product: ' + M.fit(u.p.title, 40), term: t.term, keyword: '(Shopping)', kind: t.kind, intent: t.intent, relevance: t.rel, excluded: true, type: 'shopping' }));
      });
    });
    ctx.products.forEach(function (p) { if (p.campaignId === c.id) derive(p); });
    res.impressionShare = U.safeDiv(res.impressions, res.eligible);
    var isRankAvg = rankShare(bs.auto ? evaluate(1) : ev);
    res.lostIsRank = U.clamp(1 - isRankAvg, 0, 1);
    res.lostIsBudget = U.clamp(isRankAvg - res.impressionShare, 0, 1);
    res.avgFeedScore = U.sum(units, function (u) { return u.fq.score; }) / units.length;
    res.deviceSplit = dev.split;
    res.budget = budget;
    return res;
  }

  // ---------------------------------------------------------------------------
  // Round orchestration
  // ---------------------------------------------------------------------------

  function campaignShell(c) {
    return Object.assign(emptyMetrics(), {
      id: c.id, name: c.name, type: c.type, bidStrategy: c.bidStrategy, dailyBudget: Number(c.dailyBudget) || 0,
      errors: [], warnings: [], notes: [], adGroups: [], quality: 0, lpW: 0, landing: {}
    });
  }

  function makeContext(state, opts) {
    var roundNo = state.rounds.length + 1;
    var prev = state.rounds[state.rounds.length - 1] || null;
    var r = U.rng(U.hash(state.seed + ':' + roundNo));
    var market = opts && opts.preview ? { demand: 1, competition: 1 } : {
      demand: 0.92 + 0.16 * r(),
      competition: 0.94 + 0.14 * r()
    };
    return {
      state: state, acc: state.account, scan: state.scan, vocab: M.businessVocab(state), rnd: r, market: market,
      roundNo: roundNo, prev: prev,
      brandLift: prev ? prev.brandLiftIndex || 0 : 0,
      remarketingUsers: prev && prev.analytics ? prev.analytics.users * 0.85 : 0,
      hasKeywords: state.campaigns.some(function (c) { return c.type === 'search' && (c.adGroups || []).some(function (g) { return M.adGroupKeywords(g).length; }); }) || !!(state.scan && (state.scan.keywords || []).length),
      seenKeywords: new Set(), searchTerms: new Map(), keywords: [], audiences: [], placements: [], placementMap: new Map(), products: []
    };
  }

  function dailySeries(totals, ctx) {
    var r = U.rng(U.hash(ctx.state.seed + ':daily:' + ctx.roundNo));
    var officeInd = ['b2b', 'legal', 'finance'].indexOf(ctx.acc.industry) >= 0;
    var w = [];
    for (var d = 0; d < DAYS; d++) {
      var dow = d % 7; // day 0 = Monday
      var weekend = dow >= 5;
      w.push((weekend ? (officeInd ? 0.6 : 1.1) : 1) * (0.88 + 0.24 * r()));
    }
    var ws = U.sum(w);
    return w.map(function (x, d) {
      var f = x / ws;
      return {
        day: d + 1,
        impressions: Math.round(totals.impressions * f), clicks: Math.round(totals.clicks * f), cost: totals.cost * f,
        conversions: totals.conversions * f * (0.85 + 0.3 * r()), value: totals.value * f * (0.85 + 0.3 * r())
      };
    });
  }

  function analytics(campaigns, ctx) {
    var acc = ctx.acc;
    var ind = D.INDUSTRIES[acc.industry];
    var chan = {
      search: { name: 'Paid Search', sessions: 0, conv: 0, value: 0, q: 0, lp: 0, clicks: 0, newU: 0.72 },
      shopping: { name: 'Paid Shopping', sessions: 0, conv: 0, value: 0, q: 0, lp: 0, clicks: 0, newU: 0.78 },
      display: { name: 'Display', sessions: 0, conv: 0, value: 0, q: 0, lp: 0, clicks: 0, newU: 0.8 },
      video: { name: 'Paid Video', sessions: 0, conv: 0, value: 0, q: 0, lp: 0, clicks: 0, newU: 0.85 }
    };
    var landing = {};
    var halo = 0;
    campaigns.forEach(function (c) {
      var ch = chan[c.type];
      var reach = c.type === 'display' ? 0.93 : c.type === 'video' ? 0.9 : 0.94;
      ch.sessions += c.clicks * reach;
      ch.clicks += c.clicks;
      ch.conv += c.conversions;
      ch.value += c.value;
      ch.q += c.quality;
      ch.lp += c.lpW;
      Object.keys(c.landing).forEach(function (u) { landing[u] = (landing[u] || 0) + c.landing[u] * reach; });
      if (c.type === 'video') halo += c.views * 0.02 + (c.adRecallLift || 0) * 15;
      if (c.type === 'display') halo += c.impressions * 0.0003;
    });
    var localF = acc.serviceArea === 'local' ? 0.35 : 1;
    var organicBase = 1200 * localF * ind.volume;
    var rnd = U.rng(U.hash(ctx.state.seed + ':ga:' + ctx.roundNo));
    var rows = [];
    Object.keys(chan).forEach(function (k) {
      var ch = chan[k];
      if (!ch.clicks) return;
      var q = U.safeDiv(ch.q, ch.clicks);
      var lp = U.safeDiv(ch.lp, ch.clicks);
      var base = { search: 0.3, shopping: 0.28, display: 0.12, video: 0.18 }[k];
      var er = U.clamp(base + 0.4 * q + 0.15 * lp, 0.05, 0.9);
      rows.push({ channel: ch.name, sessions: Math.round(ch.sessions), engagementRate: er, conversions: ch.conv, value: ch.value, newUserShare: ch.newU, paid: true });
    });
    var orgSessions = Math.round((organicBase + halo * 0.6) * (0.92 + 0.16 * rnd()));
    var dirSessions = Math.round((organicBase * 0.45 + halo * 0.4) * (0.92 + 0.16 * rnd()));
    var orgCvr = ind.search.cvr * 0.55;
    rows.push({ channel: 'Organic Search', sessions: orgSessions, engagementRate: 0.55, conversions: Math.round(orgSessions * orgCvr), value: Math.round(orgSessions * orgCvr) * acc.value, newUserShare: 0.65, paid: false });
    rows.push({ channel: 'Direct', sessions: dirSessions, engagementRate: 0.58, conversions: Math.round(dirSessions * orgCvr * 1.2), value: Math.round(dirSessions * orgCvr * 1.2) * acc.value, newUserShare: 0.42, paid: false });
    rows.forEach(function (r) {
      r.bounceRate = 1 - r.engagementRate;
      r.users = Math.round(r.sessions * 0.82);
      r.newUsers = Math.round(r.users * r.newUserShare);
      r.avgEngagementTime = 18 + 120 * r.engagementRate;
      r.pagesPerSession = 1.1 + 2.6 * r.engagementRate;
      r.conversionRate = U.safeDiv(r.conversions, r.sessions);
    });
    var sessions = U.sum(rows, function (r) { return r.sessions; });
    var engaged = U.sum(rows, function (r) { return r.sessions * r.engagementRate; });
    var lpRows = Object.keys(landing).filter(Boolean).map(function (u) { return { url: u, sessions: Math.round(landing[u]) }; }).sort(function (a, b) { return b.sessions - a.sessions; }).slice(0, 10);
    return {
      channels: rows,
      sessions: sessions,
      users: U.sum(rows, function (r) { return r.users; }),
      newUsers: U.sum(rows, function (r) { return r.newUsers; }),
      engagementRate: U.safeDiv(engaged, sessions),
      bounceRate: 1 - U.safeDiv(engaged, sessions),
      avgEngagementTime: U.safeDiv(U.sum(rows, function (r) { return r.avgEngagementTime * r.sessions; }), sessions),
      pagesPerSession: U.safeDiv(U.sum(rows, function (r) { return r.pagesPerSession * r.sessions; }), sessions),
      conversions: U.sum(rows, function (r) { return r.conversions; }),
      value: U.sum(rows, function (r) { return r.value; }),
      landingPages: lpRows,
      tracked: !!acc.conversionTracking
    };
  }

  function simulateRound(state) {
    var ctx = makeContext(state);
    var campaigns = [];
    state.campaigns.forEach(function (c) {
      if (c.status !== 'enabled') return;
      var r;
      if (c.type === 'search') r = simSearch(c, ctx);
      else if (c.type === 'display') r = simDisplay(c, ctx);
      else if (c.type === 'video') r = simVideo(c, ctx);
      else if (c.type === 'shopping') r = simShopping(c, ctx);
      if (!r) return;
      r.status = r.errors.length ? 'Not running' : r.budgetLimited ? 'Limited by budget' : r.learning === 'learning' ? 'Learning' : 'Eligible';
      derive(r);
      campaigns.push(r);
    });
    var totals = campaigns.reduce(function (a, c) { return addMetrics(a, c); }, emptyMetrics());
    derive(totals);
    totals.budget = U.sum(campaigns, function (c) { return c.budget || 0; });

    // device breakdown
    var devices = {};
    campaigns.forEach(function (c) {
      (c.deviceSplit || []).forEach(function (s) {
        var d = devices[s.device] || (devices[s.device] = Object.assign(emptyMetrics(), { device: s.device }));
        var ctrW = s.device === 'mobile' ? 1.05 : s.device === 'desktop' ? 0.95 : 1;
        d.impressions += c.impressions * s.share;
        d.clicks += c.clicks * s.share * ctrW;
        d.cost += c.cost * s.share * ctrW * Math.sqrt(s.bid || 1);
        d.conversions += c.conversions * s.share * ctrW * s.cvr;
        d.value += c.value * s.share * ctrW * s.cvr;
      });
    });
    var devRows = Object.keys(devices).map(function (k) { return devices[k]; });
    ['impressions', 'clicks', 'cost', 'conversions', 'value'].forEach(function (key) {
      var s = U.sum(devRows, function (d) { return d[key]; });
      devRows.forEach(function (d) { d[key] = s ? d[key] / s * totals[key] : 0; });
    });
    devRows.forEach(derive);

    var ga = analytics(campaigns, ctx);
    var video = campaigns.filter(function (c) { return c.type === 'video'; });
    var display = campaigns.filter(function (c) { return c.type === 'display'; });
    var brandLiftIndex = U.clamp(U.sum(video, function (c) { return (c.adRecallLift || 0) / 25 * Math.min(1, c.reach / 50000); }) +
      U.sum(display, function (c) { return Math.min(0.3, c.impressions / 5e6); }), 0, 1.5);

    var terms = Array.from(ctx.searchTerms.values());
    terms.forEach(derive);
    ctx.placements.forEach(derive);
    ctx.audiences.forEach(derive);

    var events = [];
    if (ctx.market.competition > 1.05) events.push('Competition increased this round (+' + Math.round((ctx.market.competition - 1) * 100) + '% auction pressure).');
    if (ctx.market.competition < 0.97) events.push('Competition eased this round (' + Math.round((ctx.market.competition - 1) * 100) + '% auction pressure).');
    if (ctx.market.demand > 1.04) events.push('Seasonal demand is up (+' + Math.round((ctx.market.demand - 1) * 100) + '% searches and inventory).');
    if (ctx.market.demand < 0.96) events.push('Seasonal demand is down (' + Math.round((ctx.market.demand - 1) * 100) + '%).');
    if (ctx.brandLift > 0.05) events.push('Your earlier video/display advertising raised brand searches by ~' + Math.round(ctx.brandLift * 100) + '%.');

    return {
      round: ctx.roundNo,
      createdAt: new Date().toISOString(),
      market: ctx.market,
      events: events,
      tracked: !!state.account.conversionTracking,
      totals: totals,
      campaigns: campaigns,
      adGroups: campaigns.reduce(function (a, c) { return a.concat(c.adGroups); }, []),
      keywords: ctx.keywords,
      searchTerms: terms.sort(function (a, b) { return b.cost - a.cost || b.impressions - a.impressions; }),
      audiences: ctx.audiences,
      placements: ctx.placements.filter(function (p) { return p.impressions > 0; }).sort(function (a, b) { return b.cost - a.cost; }),
      products: ctx.products,
      devices: devRows,
      daily: dailySeries(totals, ctx),
      analytics: ga,
      brandLiftIndex: brandLiftIndex,
      remarketingPool: Math.round(ctx.remarketingUsers),
      config: U.deepClone(state.campaigns),
      accountSnapshot: U.deepClone(state.account)
    };
  }

  AdSim.engine = {
    simulateRound: simulateRound, keywordPlanner: keywordPlanner, landingPageQuality: landingPageQuality,
    locationFactors: locationFactors, expandTerms: expandTerms, derive: derive, makeContext: makeContext,
    SMART: SMART
  };
})(typeof window !== 'undefined' ? window : globalThis);
