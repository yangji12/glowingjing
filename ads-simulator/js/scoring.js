/* AdSim scoring & feedback.
 *   Setup score (0–100): how closely the account follows the baseline guidelines (data.js GUIDELINES).
 *   Performance score (0–100): how well the simulated results did (profit, CTR/CVR vs benchmark, quality, waste, delivery).
 *   Overall = 45% setup + 55% performance.
 */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});
  var U = AdSim.util;
  var D = AdSim.data;
  var M = AdSim.model;
  var E = AdSim.engine;

  var CATS = ['Measurement', 'Strategy & structure', 'Keywords & targeting', 'Ads & creative', 'Assets & feed', 'Bidding & budget', 'Landing pages'];

  function check(list, o) {
    var earned = o.status === 'pass' ? o.weight : o.status === 'warn' ? o.weight * 0.5 : 0;
    list.push(Object.assign({ earned: earned }, o));
  }

  function benchCpa(ind, type) {
    var b = ind[type === 'shopping' ? 'shopping' : type === 'display' ? 'display' : 'search'];
    return b.cpc / b.cvr;
  }

  function evaluateSetup(state) {
    var acc = state.account;
    var ind = D.INDUSTRIES[acc.industry];
    var list = [];
    var enabled = state.campaigns.filter(function (c) { return c.status === 'enabled'; });
    var prev = state.rounds[state.rounds.length - 1];
    var vocab = M.businessVocab(state);

    check(list, {
      id: 'acc-tracking', cat: 'Measurement', guide: 'ACC-1', weight: 8,
      status: acc.conversionTracking ? 'pass' : 'fail',
      title: 'Conversion tracking (Google tag) installed',
      detail: acc.conversionTracking ? 'Conversions are measured and available to Smart Bidding and remarketing.' : 'Conversions are not measured. You cannot see which keywords make money, Smart Bidding cannot optimize, and remarketing lists stay empty.',
      fix: 'Turn on "Google tag & conversion tracking" in Business setup.'
    });
    check(list, {
      id: 'acc-value', cat: 'Measurement', guide: 'ACC-2', weight: 3,
      status: acc.value > 0 && acc.margin > 0 && acc.margin < 1 ? 'pass' : 'fail',
      title: 'Conversion value and profit margin set',
      detail: 'Value per conversion: $' + (acc.value || 0) + ', margin: ' + Math.round((acc.margin || 0) * 100) + '%. Break-even ROAS = ' + (acc.margin > 0 ? (1 / acc.margin).toFixed(2) + '×' : 'n/a') + '.',
      fix: 'Enter your average order value (or lead value × close rate) and profit margin.'
    });
    var site = acc.website || '';
    check(list, {
      id: 'acc-site', cat: 'Landing pages', guide: 'LP-1', weight: 3,
      status: /^https:\/\//i.test(site) ? 'pass' : site ? 'warn' : 'fail',
      title: 'Secure website (HTTPS)',
      detail: site ? (/^https/i.test(site) ? site + ' uses HTTPS.' : site + ' is not HTTPS — browsers show "Not secure" and landing page experience suffers.') : 'No website entered.',
      fix: 'Enter your website with https://.'
    });
    if (!enabled.length) {
      check(list, { id: 'acc-campaigns', cat: 'Strategy & structure', guide: 'ACC-3', weight: 10, status: 'fail', title: 'At least one enabled campaign', detail: 'There are no enabled campaigns, so no ads can run.', fix: 'Create a campaign (Campaigns → New campaign) or enable a paused one.' });
    } else {
      var goal = D.GOALS[acc.goal] || D.GOALS.sales;
      var bestFit = Math.max.apply(null, enabled.map(function (c) { return goal.fit[c.type] || 0; }));
      check(list, {
        id: 'acc-goalfit', cat: 'Strategy & structure', guide: 'ACC-3', weight: 5,
        status: bestFit >= 3 ? 'pass' : bestFit >= 2 ? 'warn' : 'fail',
        title: 'Campaign types fit the business goal (' + goal.name + ')',
        detail: 'Best-fit campaign types for ' + goal.name + ': ' + Object.keys(goal.fit).filter(function (k) { return goal.fit[k] >= 3; }).map(function (k) { return D.CAMPAIGN_TYPES[k].name; }).join(', ') + '.',
        fix: 'Add a campaign type that matches the goal, or change the goal if it was set by mistake.'
      });
      var totalDaily = U.sum(enabled, function (c) { return Number(c.dailyBudget) || 0; });
      check(list, {
        id: 'acc-spread', cat: 'Bidding & budget', guide: 'STR-3', weight: 2,
        status: totalDaily / enabled.length >= 10 ? 'pass' : 'warn',
        title: 'Budget is not spread too thin',
        detail: '$' + totalDaily.toFixed(0) + '/day across ' + enabled.length + ' campaign(s).',
        fix: 'Consolidate into fewer campaigns or raise budgets so each can gather data.'
      });
    }

    var n = enabled.length;
    var cw = n ? 2 / (n + 1) : 1;

    enabled.forEach(function (c) {
      var tag = { campaignId: c.id, campaign: c.name };
      function ck(o) { o.weight *= cw; check(list, Object.assign(o, tag, { id: c.id + ':' + o.id })); }

      // --- location ---
      var locs = (c.locations || []).map(function (id) { return D.LOCATIONS.find(function (l) { return l.id === id; }); }).filter(Boolean);
      var hasCountry = locs.some(function (l) { return l.kind === 'country'; });
      var hasRadius = locs.some(function (l) { return l.kind === 'radius'; });
      var locStatus = !locs.length ? 'fail' : acc.serviceArea === 'local' ? (hasCountry ? 'fail' : 'pass') : (hasCountry ? 'pass' : 'warn');
      ck({
        id: 'loc', cat: 'Keywords & targeting', guide: 'TGT-1', weight: 4, status: locStatus,
        title: 'Location targeting matches the service area',
        detail: !locs.length ? 'No locations selected.' : acc.serviceArea === 'local'
          ? (hasCountry ? 'You serve a local area but target whole countries — most clicks will come from people you cannot serve.' : 'Radius targeting around your service area.')
          : (hasCountry ? 'Targeting: ' + locs.map(function (l) { return l.name; }).join(', ') + '.' : 'You sell nationally but only target a small radius — you are missing most of your market.'),
        fix: acc.serviceArea === 'local' ? 'Use a radius (e.g., 10–25 miles) around your location.' : 'Target the countries you ship to/serve.'
      });
      if (acc.serviceArea === 'local') {
        ck({ id: 'presence', cat: 'Keywords & targeting', guide: 'TGT-1', weight: 1, status: c.locationOption === 'presence' ? 'pass' : 'warn', title: 'Location option: Presence (people in your area)', detail: c.locationOption === 'presence' ? 'Only people physically in or regularly in your area see ads.' : '"Presence or interest" also shows ads to people outside your area who search about it.', fix: 'Settings → Locations → choose "Presence".' });
      }
      var noDataDevice = !prev && Object.keys(c.devices || {}).some(function (d) { return Number(c.devices[d]) <= -100; });
      if (noDataDevice) ck({ id: 'devices', cat: 'Keywords & targeting', guide: 'TGT-2', weight: 1, status: 'warn', title: 'Device exclusions without data', detail: 'A device is excluded (−100%) before you have performance data.', fix: 'Keep all devices in round 1, then adjust based on the Devices report.' });

      // --- bidding ---
      var bs = D.BID_STRATEGIES[c.bidStrategy] || {};
      var prevCamp = prev && (prev.campaigns || []).find(function (x) { return x.id === c.id; });
      var prevConv = prevCamp ? prevCamp.conversions : 0;
      var bidStatus = 'pass', bidDetail = bs.name + ' — ' + (bs.desc || '');
      if (bs.needsConv && !acc.conversionTracking) { bidStatus = 'fail'; bidDetail = bs.name + ' optimizes toward conversions, but conversion tracking is off.'; }
      else if ((c.bidStrategy === 'target_cpa' || c.bidStrategy === 'target_roas') && prevConv < 15) { bidStatus = 'warn'; bidDetail = bs.name + ' works best with 15–30+ conversions in 30 days; this campaign had ' + prevConv + ' last round.'; }
      else if (c.type === 'video') {
        var fmt = D.VIDEO_FORMATS[c.videoFormat || 'skippable'];
        if (fmt.billing === 'cpm' && c.bidStrategy === 'max_cpv') { bidStatus = 'fail'; bidDetail = fmt.name + ' is bought on CPM, not CPV.'; }
      } else if (c.bidStrategy === 'max_clicks' && acc.conversionTracking && prevConv >= 15 && (acc.goal === 'sales' || acc.goal === 'leads')) {
        bidStatus = 'warn'; bidDetail = 'You now have conversion data (' + prevConv + ' last round). Maximize clicks ignores conversions.';
      }
      ck({ id: 'bid', cat: 'Bidding & budget', guide: 'BID-1', weight: 4, status: bidStatus, title: 'Bid strategy fits goal and data', detail: bidDetail, fix: acc.conversionTracking ? 'Use Maximize conversions until you have 15–30 conversions/month, then consider Target CPA/ROAS.' : 'Turn on conversion tracking or use Maximize clicks / Manual CPC.' });

      var bcpa = benchCpa(ind, c.type);
      if (c.bidStrategy === 'target_cpa') {
        var ratio = c.targetCpa / bcpa;
        ck({ id: 'tcpa', cat: 'Bidding & budget', guide: 'BID-2', weight: 2, status: !(c.targetCpa > 0) ? 'fail' : ratio < 0.5 ? 'warn' : c.targetCpa > acc.value ? 'warn' : 'pass', title: 'Realistic Target CPA', detail: 'Target $' + (c.targetCpa || 0) + ' vs. industry CPA ≈ $' + bcpa.toFixed(0) + ' and conversion value $' + acc.value + '.', fix: 'Start near your actual CPA (or the industry CPA) and stay below your conversion value.' });
      }
      if (c.bidStrategy === 'target_roas') {
        var be = acc.margin > 0 ? 1 / acc.margin : 2.5;
        var t = (c.targetRoas || 0) / 100;
        ck({ id: 'troas', cat: 'Bidding & budget', guide: 'BID-3', weight: 2, status: !(t > 0) ? 'fail' : t < be ? 'warn' : t > be * 3 ? 'warn' : 'pass', title: 'Realistic Target ROAS', detail: 'Target ' + Math.round(t * 100) + '% vs. break-even ' + Math.round(be * 100) + '%.', fix: 'Set Target ROAS above break-even but close to what you actually achieve; tighten 10–20% at a time.' });
      }
      var daily = Number(c.dailyBudget) || 0;
      var bStatus, bDetail;
      if (c.type === 'search' || c.type === 'shopping') {
        var cpc = ind[c.type === 'shopping' ? 'shopping' : 'search'].cpc;
        var need = c.bidStrategy === 'target_cpa' ? Math.max(10 * cpc, 2 * (c.targetCpa || 0)) : 10 * cpc;
        bStatus = daily >= need ? 'pass' : daily >= need / 2 ? 'warn' : 'fail';
        bDetail = '$' + daily + '/day buys ~' + Math.floor(daily / cpc) + ' clicks at the industry CPC of $' + cpc.toFixed(2) + ' (recommended ≥ $' + need.toFixed(0) + '/day).';
      } else {
        bStatus = daily >= 15 ? 'pass' : daily >= 7 ? 'warn' : 'fail';
        bDetail = '$' + daily + '/day. ' + (c.type === 'video' ? 'Video' : 'Display') + ' campaigns need enough budget to reach a meaningful audience (≥ $15/day recommended).';
      }
      ck({ id: 'budget', cat: 'Bidding & budget', guide: 'STR-3', weight: 4, status: bStatus, title: 'Daily budget can gather enough data', detail: bDetail, fix: 'Raise the daily budget or narrow targeting/keywords so the budget is concentrated.' });

      if (c.type === 'search') searchChecks(c, ck, state, vocab);
      if (c.type === 'display') displayChecks(c, ck, state);
      if (c.type === 'video') videoChecks(c, ck, state);
      if (c.type === 'shopping') shoppingChecks(c, ck, state);
    });

    var cats = CATS.map(function (name) {
      var items = list.filter(function (x) { return x.cat === name; });
      var w = U.sum(items, function (x) { return x.weight; });
      var e = U.sum(items, function (x) { return x.earned; });
      return { name: name, score: w ? Math.round(e / w * 100) : null, weight: w, checks: items.length };
    });
    var W = U.sum(list, function (x) { return x.weight; });
    var Ea = U.sum(list, function (x) { return x.earned; });
    return { score: W ? Math.round(Ea / W * 100) : 0, checks: list, categories: cats };
  }

  function searchChecks(c, ck, state, vocab) {
    var acc = state.account;
    var net = c.networks || {};
    ck({ id: 'dx', cat: 'Strategy & structure', guide: 'STR-1', weight: 3, status: net.displayExpansion ? 'fail' : 'pass', title: 'Display Network expansion is off', detail: net.displayExpansion ? 'About 15% of this Search budget will be spent on Display placements with much lower intent.' : 'Budget stays on search results.', fix: 'Settings → Networks → uncheck "Display Network".' });
    var groups = (c.adGroups || []);
    var allKws = [];
    var kwGroups = groups.filter(function (g) { var k = M.adGroupKeywords(g); allKws = allKws.concat(k.map(function (x) { return Object.assign({ g: g }, x); })); return k.length; });
    ck({ id: 'kwexist', cat: 'Strategy & structure', guide: 'STR-2', weight: 5, status: kwGroups.length ? 'pass' : 'fail', title: 'Ad groups have keywords', detail: kwGroups.length + ' of ' + groups.length + ' ad group(s) have keywords.', fix: 'Add keywords to each ad group (one per line; use "phrase" or [exact] notation).' });
    if (!kwGroups.length) return;
    var sizeOk = kwGroups.filter(function (g) { var n = M.adGroupKeywords(g).length; return n >= 3 && n <= 20; }).length;
    ck({ id: 'agsize', cat: 'Strategy & structure', guide: 'STR-2', weight: 2, status: sizeOk === kwGroups.length ? 'pass' : sizeOk ? 'warn' : 'fail', title: 'Ad groups have 3–20 keywords', detail: sizeOk + ' of ' + kwGroups.length + ' ad groups are in the recommended range.', fix: 'Split large ad groups by theme; add close variants to tiny ones.' });
    var loose = kwGroups.filter(function (g) {
      var k = M.adGroupKeywords(g);
      if (k.length < 3) return false;
      var sets = k.map(function (x) { return U.contentTokens(x.text); });
      var shared = 0, pairs = 0;
      for (var i = 0; i < sets.length; i++) for (var j = i + 1; j < sets.length; j++) { pairs++; if (sets[i].some(function (t) { return sets[j].indexOf(t) >= 0; })) shared++; }
      return pairs && shared / pairs < 0.3;
    });
    ck({ id: 'theme', cat: 'Strategy & structure', guide: 'STR-2', weight: 3, status: loose.length ? 'warn' : 'pass', title: 'Ad groups are tightly themed', detail: loose.length ? 'Loosely themed: ' + loose.map(function (g) { return '"' + g.name + '"'; }).join(', ') + '. Their keywords share few words, so one ad cannot match them all.' : 'Keywords within each ad group share a common theme.', fix: 'Move keywords that need a different message into their own ad group.' });
    var brandIntent = function (k) { return M.intentOf(k.text, state) === 'brand'; };
    var mixed = kwGroups.filter(function (g) { var k = M.adGroupKeywords(g); var b = k.filter(brandIntent).length; return b > 0 && b < k.length; });
    if (mixed.length) ck({ id: 'brand', cat: 'Strategy & structure', guide: 'STR-4', weight: 1, status: 'warn', title: 'Brand and non-brand keywords separated', detail: 'Brand keywords are mixed with generic keywords in ' + mixed.map(function (g) { return '"' + g.name + '"'; }).join(', ') + '.', fix: 'Put brand keywords in their own ad group or campaign.' });

    var matches = allKws.map(function (k) { return k.match; });
    var allBroad = matches.every(function (m) { return m === 'broad'; });
    var smart = E.SMART.indexOf(c.bidStrategy) >= 0 && acc.conversionTracking;
    ck({ id: 'match', cat: 'Keywords & targeting', guide: 'KW-1', weight: 4, status: allBroad ? (smart ? 'warn' : 'fail') : 'pass', title: 'Match types used deliberately', detail: allBroad ? 'Every keyword is broad match' + (smart ? '. Smart Bidding helps, but a negative list is essential.' : ' with non-conversion bidding — expect many irrelevant searches.') : 'Match types: ' + ['exact', 'phrase', 'broad'].map(function (m) { return matches.filter(function (x) { return x === m; }).length + ' ' + m; }).join(', ') + '.', fix: 'Use "phrase" and [exact] match for core terms; keep broad for discovery with Smart Bidding.' });
    var negCount = M.campaignNegatives(c).length + U.sum(groups, function (g) { return U.parseKeywordList(g.negativesText).length; });
    ck({ id: 'neg', cat: 'Keywords & targeting', guide: 'KW-2', weight: 4, status: negCount >= 5 ? 'pass' : negCount >= 1 ? 'warn' : 'fail', title: 'Negative keywords in place', detail: negCount + ' negative keyword(s).', fix: 'Add negatives such as free, jobs, diy, how to, salary — and review the Search terms report each round.' });
    var rels = allKws.map(function (k) { return { k: k, r: M.intentOf(k.text, state) === 'brand' ? 1 : M.relevance(k.text, vocab) }; });
    var avgRel = U.sum(rels, function (x) { return x.r; }) / rels.length;
    var worst = rels.filter(function (x) { return x.r < 0.4; }).map(function (x) { return x.k.text; }).slice(0, 5);
    ck({ id: 'rel', cat: 'Keywords & targeting', guide: 'KW-3', weight: 5, status: avgRel >= 0.6 ? 'pass' : avgRel >= 0.4 ? 'warn' : 'fail', title: 'Keywords are relevant to what you sell', detail: 'Average relevance ' + Math.round(avgRel * 100) + '%.' + (worst.length ? ' Low relevance: ' + worst.join(', ') + '.' : ''), fix: 'Use words from your website/products; describe your business in Business setup so the simulator knows what you sell.' });
    var seen = {}, dups = [];
    allKws.forEach(function (k) { var key = k.match + ':' + k.text; if (seen[key]) dups.push(U.formatKeyword(k)); seen[key] = 1; });
    ck({ id: 'dup', cat: 'Keywords & targeting', guide: 'KW-4', weight: 2, status: dups.length ? 'warn' : 'pass', title: 'No duplicate keywords', detail: dups.length ? 'Duplicates: ' + U.uniq(dups).join(', ') : 'No duplicates.', fix: 'Keep each keyword in exactly one ad group.' });
    var oneWord = allKws.filter(function (k) { return U.words(k.text).length === 1 && M.intentOf(k.text, state) !== 'brand'; });
    ck({ id: 'generic', cat: 'Keywords & targeting', guide: 'KW-5', weight: 2, status: oneWord.length / allKws.length <= 0.25 ? 'pass' : 'warn', title: 'Few one-word generic keywords', detail: oneWord.length + ' of ' + allKws.length + ' keywords are single generic words' + (oneWord.length ? ' (' + oneWord.slice(0, 4).map(function (k) { return k.text; }).join(', ') + ')' : '') + '.', fix: 'Replace single words with specific 2–4 word phrases.' });

    // ads
    var strengths = [], cov = [], policy = [], ctaMissing = 0, lpIssues = [], badDomain = [];
    var site = U.domainOf(acc.website);
    kwGroups.forEach(function (g) {
      var k = M.adGroupKeywords(g);
      var best = null;
      (g.ads || []).forEach(function (a) {
        var s = M.rsaStrength(a, k);
        policy = policy.concat(s.policy.map(function (p) { return g.name + ': ' + p; }));
        if (!best || s.points > best.points) best = s;
        if (a.finalUrl && site && U.domainOf(a.finalUrl) !== site) badDomain.push(g.name);
        if (!a.finalUrl || U.pathOf(a.finalUrl) === '/') lpIssues.push(g.name);
      });
      if (best) { strengths.push(best.label); cov.push(best.keywordCoverage); if (!M.hasCTA(best.headlines.concat(best.descriptions))) ctaMissing++; }
    });
    var goodAds = strengths.filter(function (s) { return s === 'Good' || s === 'Excellent'; }).length;
    var badAds = strengths.filter(function (s) { return s === 'Poor' || s === 'Incomplete'; }).length;
    ck({ id: 'adstr', cat: 'Ads & creative', guide: 'AD-1', weight: 5, status: goodAds === strengths.length ? 'pass' : badAds ? 'fail' : 'warn', title: 'Responsive search ads have Good+ ad strength', detail: 'Ad strength by ad group: ' + strengths.join(', ') + '.', fix: 'Use 8–15 unique headlines and 3–4 descriptions per ad.' });
    var avgCov = cov.length ? U.sum(cov) / cov.length : 0;
    ck({ id: 'kwhead', cat: 'Ads & creative', guide: 'AD-2', weight: 3, status: avgCov >= 0.5 ? 'pass' : avgCov >= 0.25 ? 'warn' : 'fail', title: 'Keywords appear in headlines', detail: Math.round(avgCov * 100) + '% keyword coverage in headlines.', fix: 'Write 2–3 headlines that contain the ad group\'s main keyword.' });
    ck({ id: 'cta', cat: 'Ads & creative', guide: 'AD-3', weight: 2, status: ctaMissing ? 'warn' : 'pass', title: 'Ads include a call to action', detail: ctaMissing ? ctaMissing + ' ad group(s) have no call to action.' : 'All ads include a call to action.', fix: 'Add "Shop Now", "Book Today", "Get a Free Quote", etc.' });
    ck({ id: 'policy', cat: 'Ads & creative', guide: 'AD-4', weight: 3, status: policy.length ? 'fail' : 'pass', title: 'Ads follow editorial policies', detail: policy.length ? policy.slice(0, 4).join('; ') + (policy.length > 4 ? '…' : '') : 'No policy issues found.', fix: 'Remove "!" from headlines, repeated punctuation, ALL-CAPS words and phone numbers.' });
    // assets
    var a = c.assets || {};
    var sl = (a.sitelinks || []).filter(function (s) { return s.text && s.url; });
    ck({ id: 'sitelinks', cat: 'Assets & feed', guide: 'AST-1', weight: 3, status: sl.length >= 4 ? 'pass' : sl.length >= 2 ? 'warn' : 'fail', title: 'At least 4 sitelinks', detail: sl.length + ' sitelink(s).' + (sl.some(function (s) { return !s.d1; }) ? ' Some sitelinks have no description lines.' : ''), fix: 'Add 4+ sitelinks to key pages (with both description lines).' });
    var co = String(a.callouts || '').split('\n').filter(function (s) { return s.trim(); });
    ck({ id: 'callouts', cat: 'Assets & feed', guide: 'AST-2', weight: 2, status: co.length >= 4 ? 'pass' : co.length >= 2 ? 'warn' : 'fail', title: 'At least 4 callouts', detail: co.length + ' callout(s).', fix: 'Add short benefits such as "Free Shipping", "24/7 Support".' });
    var sn = String(a.snippetValues || '').split(/\n|,/).filter(function (s) { return s.trim(); });
    ck({ id: 'snippets', cat: 'Assets & feed', guide: 'AST-2', weight: 1, status: sn.length >= 3 ? 'pass' : 'warn', title: 'Structured snippet with 3+ values', detail: sn.length + ' value(s).', fix: 'Add a structured snippet like "Types: A, B, C".' });
    if (acc.goal === 'leads' || acc.serviceArea === 'local') ck({ id: 'call', cat: 'Assets & feed', guide: 'AST-3', weight: 1, status: a.phone ? 'pass' : 'warn', title: 'Call asset for lead generation', detail: a.phone ? 'Call asset: ' + a.phone : 'No call asset.', fix: 'Add your phone number as a call asset.' });
    ck({ id: 'lp', cat: 'Landing pages', guide: 'LP-1', weight: 3, status: lpIssues.length ? 'warn' : 'pass', title: 'Ads deep-link to relevant pages', detail: lpIssues.length ? 'Using the homepage (or no URL) in: ' + U.uniq(lpIssues).join(', ') + '.' : 'Every ad group links to a specific page.', fix: 'Point each ad group to the page that matches its keywords.' });
    ck({ id: 'domain', cat: 'Landing pages', guide: 'LP-2', weight: 3, status: badDomain.length ? 'fail' : 'pass', title: 'Final URLs match your website domain', detail: badDomain.length ? 'Domain mismatch in: ' + U.uniq(badDomain).join(', ') : 'All final URLs use ' + (site || 'your domain') + '.', fix: 'Use URLs on ' + (site || 'your website') + '.' });
  }

  function targetingChecks(c, ck, state, type) {
    var groups = c.adGroups || [];
    var ind = state.account.industry;
    var untargeted = groups.filter(function (g) { var t = g.targeting || {}; return !(t.audiences || []).length && !(t.topics || []).length && !String(t.placementsText || '').trim(); });
    var noneAtAll = untargeted.filter(function (g) { return !(g.targeting || {}).optimized; });
    ck({ id: 'tgt', cat: 'Keywords & targeting', guide: 'DSP-1', weight: 5, status: noneAtAll.length ? 'fail' : untargeted.length ? 'warn' : 'pass', title: 'Audience or content targeting is set', detail: noneAtAll.length ? 'Ad group(s) ' + noneAtAll.map(function (g) { return '"' + g.name + '"'; }).join(', ') + ' target the entire network.' : untargeted.length ? 'Some ad groups rely only on optimized targeting (no audience signal).' : 'Every ad group has audience/content targeting.', fix: 'Add in-market, custom or remarketing segments, or relevant topics/placements.' });
    var segs = [];
    groups.forEach(function (g) {
      ((g.targeting || {}).audiences || []).forEach(function (id) { var a = D.AUDIENCES.find(function (x) { return x.id === id; }); if (a) segs.push({ name: a.name, rel: a.inds === 'all' || a.inds.indexOf(ind) >= 0 ? 1 : 0.35, rmk: a.type === 'remarketing' }); });
      ((g.targeting || {}).topics || []).forEach(function (id) { var t = D.TOPICS.find(function (x) { return x.id === id; }); if (t) segs.push({ name: t.name, rel: t.inds.indexOf(ind) >= 0 ? 0.85 : 0.25 }); });
    });
    if (segs.length) {
      var avg = U.sum(segs, function (s) { return s.rel; }) / segs.length;
      var bad = segs.filter(function (s) { return s.rel < 0.5; }).map(function (s) { return s.name; });
      ck({ id: 'segrel', cat: 'Keywords & targeting', guide: 'DSP-1', weight: 3, status: avg >= 0.75 ? 'pass' : avg >= 0.5 ? 'warn' : 'fail', title: 'Audiences match your customers', detail: bad.length ? 'Weak fit for ' + D.INDUSTRIES[ind].name + ': ' + bad.slice(0, 4).join(', ') + '.' : 'Selected segments fit your industry.', fix: 'Choose in-market/affinity segments tied to your industry.' });
      var rmk = segs.filter(function (s) { return s.rmk; });
      if (rmk.length) {
        var pool = state.rounds.length ? (state.rounds[state.rounds.length - 1].analytics || {}).users || 0 : 0;
        ck({ id: 'rmk', cat: 'Keywords & targeting', guide: 'DSP-4', weight: 2, status: !state.account.conversionTracking ? 'fail' : pool < 1000 ? 'warn' : 'pass', title: 'Remarketing list can fill', detail: !state.account.conversionTracking ? 'Remarketing needs the Google tag, which is off.' : pool < 1000 ? 'Your visitor list is small (' + Math.round(pool) + ' users last round). Remarketing will have little reach until traffic grows.' : 'About ' + Math.round(pool * 0.85).toLocaleString() + ' past visitors available.', fix: 'Install the tag and drive traffic with Search first.' });
      }
    }
  }

  function displayChecks(c, ck, state) {
    targetingChecks(c, ck, state, 'display');
    var strengths = [], policy = [], issues = [];
    (c.adGroups || []).forEach(function (g) {
      (g.ads || []).forEach(function (a) { var s = M.rdaStrength(a); strengths.push(s.label); policy = policy.concat(s.policy); if (s.issues.length) issues.push(g.name + ': ' + s.issues[0]); });
    });
    var good = strengths.filter(function (s) { return s === 'Good' || s === 'Excellent'; }).length;
    ck({ id: 'rda', cat: 'Ads & creative', guide: 'DSP-2', weight: 5, status: strengths.length && good === strengths.length ? 'pass' : strengths.some(function (s) { return s === 'Incomplete' || s === 'Poor'; }) ? 'fail' : 'warn', title: 'Responsive display ads are complete', detail: 'Ad strength: ' + (strengths.join(', ') || 'no ads') + '. ' + (issues[0] || ''), fix: 'Add 5 headlines, a long headline, 5 descriptions, landscape + square images and a logo.' });
    ck({ id: 'policy', cat: 'Ads & creative', guide: 'AD-4', weight: 2, status: policy.length ? 'fail' : 'pass', title: 'Display ads follow editorial policies', detail: policy.length ? policy.slice(0, 3).join('; ') : 'No policy issues.', fix: 'Fix the flagged text.' });
    ck({ id: 'apps', cat: 'Strategy & structure', guide: 'DSP-3', weight: 2, status: c.excludeApps ? 'pass' : 'warn', title: 'Mobile app placements excluded', detail: c.excludeApps ? 'App/game inventory excluded.' : 'Mobile games generate accidental clicks that rarely convert.', fix: 'Settings → Content exclusions → exclude mobile apps.' });
    ck({ id: 'freq', cat: 'Strategy & structure', guide: 'DSP-3', weight: 1, status: c.freqCap > 0 && c.freqCap <= 8 ? 'pass' : 'warn', title: 'Frequency cap set', detail: c.freqCap > 0 ? c.freqCap + ' impressions per user per day.' : 'No frequency cap.', fix: 'Set a cap of about 3–5 impressions per user per day.' });
    lpCheck(c, ck, state);
  }

  function videoChecks(c, ck, state) {
    targetingChecks(c, ck, state, 'video');
    var format = c.videoFormat || 'skippable';
    var checks = [];
    (c.adGroups || []).forEach(function (g) { (g.ads || []).forEach(function (a) { checks.push(M.videoAdCheck(a, format)); }); });
    var errs = checks.filter(function (x) { return !x.valid; });
    ck({ id: 'vlen', cat: 'Ads & creative', guide: 'VID-2', weight: 5, status: !checks.length || errs.length ? 'fail' : 'pass', title: 'Video ads meet format requirements', detail: errs.length ? errs[0].errors.join('; ') : checks.length ? 'All video ads are eligible for ' + D.VIDEO_FORMATS[format].name + '.' : 'No video ads.', fix: 'Match the length to the format (bumper ≤ 6s, non-skippable ≤ 15s).' });
    var hook = checks.filter(function (x, i) { return true; });
    var noHook = 0, noCta = 0;
    (c.adGroups || []).forEach(function (g) { (g.ads || []).forEach(function (a) { if (!a.hook || !a.brandEarly) noHook++; if (!a.cta || (!a.headline && format !== 'bumper')) noCta++; }); });
    ck({ id: 'vhook', cat: 'Ads & creative', guide: 'VID-1', weight: 3, status: noHook ? 'warn' : 'pass', title: 'Hook and brand in the first 5 seconds', detail: noHook ? noHook + ' video ad(s) lack an early hook or brand.' : 'Videos open with a hook and early branding.', fix: 'Open with the problem/benefit and show your logo before the skip button.' });
    ck({ id: 'vcta', cat: 'Ads & creative', guide: 'VID-3', weight: 2, status: noCta ? 'warn' : 'pass', title: 'CTA and headline added', detail: noCta ? noCta + ' video ad(s) are missing a CTA or headline.' : 'CTA and headline present.', fix: 'Add a CTA button (e.g., "Shop now") and a headline.' });
    var goal = state.account.goal;
    var fitOk = goal === 'awareness' ? ['bumper', 'nonskip', 'shorts'].indexOf(format) >= 0 || c.bidStrategy === 'target_cpm'
      : goal === 'consideration' || goal === 'traffic' ? ['skippable', 'infeed'].indexOf(format) >= 0
        : format === 'skippable';
    ck({ id: 'vfit', cat: 'Strategy & structure', guide: 'VID-4', weight: 3, status: fitOk ? 'pass' : 'warn', title: 'Video format fits the goal', detail: D.VIDEO_FORMATS[format].name + ' for a ' + D.GOALS[goal].name + ' goal.', fix: 'Awareness → bumper/non-skippable (Target CPM); consideration → skippable/in-feed (Max CPV); action → skippable with conversion bidding.' });
    lpCheck(c, ck, state);
  }

  function lpCheck(c, ck, state) {
    var site = U.domainOf(state.account.website);
    var bad = [];
    (c.adGroups || []).forEach(function (g) { (g.ads || []).forEach(function (a) { if (!a.finalUrl || (site && U.domainOf(a.finalUrl) !== site)) bad.push(g.name); }); });
    ck({ id: 'lp', cat: 'Landing pages', guide: 'LP-2', weight: 2, status: bad.length ? 'fail' : 'pass', title: 'Final URLs set on your domain', detail: bad.length ? 'Missing or mismatched URL in: ' + U.uniq(bad).join(', ') : 'OK.', fix: 'Use a page on your website as the final URL.' });
  }

  function shoppingChecks(c, ck, state) {
    var prods = state.products || [];
    var qs = prods.map(M.feedQuality);
    var approved = qs.filter(function (q) { return q.approved; }).length;
    ck({ id: 'feed', cat: 'Assets & feed', guide: 'SHP-2', weight: 5, status: !prods.length ? 'fail' : approved === prods.length ? 'pass' : approved ? 'warn' : 'fail', title: 'Products approved in the feed', detail: prods.length ? approved + ' of ' + prods.length + ' products approved.' + (qs.find(function (q) { return !q.approved; }) ? ' e.g., ' + qs.find(function (q) { return !q.approved; }).errors[0] : '') : 'The product feed is empty.', fix: 'Every product needs a title, price, image link and must be in stock.' });
    if (!prods.length) return;
    var titleOk = prods.filter(function (p) { var l = (p.title || '').length; return l >= 70 && l <= 150; }).length;
    ck({ id: 'titles', cat: 'Assets & feed', guide: 'SHP-1', weight: 3, status: titleOk === prods.length ? 'pass' : titleOk >= prods.length / 2 ? 'warn' : 'fail', title: 'Product titles are 70–150 characters', detail: titleOk + ' of ' + prods.length + ' titles in range.', fix: 'Title formula: Brand + Product type + Key attributes (size, color, material).' });
    var gtin = prods.filter(function (p) { return /^\d{8}$|^\d{12,14}$/.test(String(p.gtin || '').trim()); }).length;
    ck({ id: 'gtin', cat: 'Assets & feed', guide: 'SHP-2', weight: 3, status: gtin === prods.length ? 'pass' : gtin ? 'warn' : 'fail', title: 'Products have GTINs', detail: gtin + ' of ' + prods.length + ' have a valid GTIN.', fix: 'Add the barcode number (UPC/EAN) as GTIN.' });
    var desc = prods.filter(function (p) { return (p.description || '').length >= 150; }).length;
    ck({ id: 'desc', cat: 'Assets & feed', guide: 'SHP-3', weight: 2, status: desc === prods.length ? 'pass' : desc ? 'warn' : 'fail', title: 'Product descriptions are detailed', detail: desc + ' of ' + prods.length + ' have 150+ characters.', fix: 'Describe features, materials, sizing and use cases.' });
    var over = prods.filter(function (p) { var pr = p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price; return p.marketPrice > 0 && pr > p.marketPrice * 1.1; });
    ck({ id: 'price', cat: 'Assets & feed', guide: 'SHP-5', weight: 1, status: over.length ? 'warn' : 'pass', title: 'Prices are competitive', detail: over.length ? over.length + ' product(s) are priced 10%+ above the market (' + over.map(function (p) { return M.fit(p.title, 30); }).join(', ') + ').' : 'Prices are in line with the market.', fix: 'Review pricing or run a sale on overpriced items.' });
    var pgs = (c.productGroups || []).filter(function (g) { return g.dimension !== 'all'; });
    ck({ id: 'pgroups', cat: 'Strategy & structure', guide: 'SHP-4', weight: 3, status: pgs.length ? 'pass' : 'warn', title: 'Product groups are subdivided', detail: pgs.length ? pgs.length + ' custom product group(s).' : 'All products share one bid.', fix: 'Subdivide by category or brand to bid by value.' });
    var neg = M.campaignNegatives(c).length;
    ck({ id: 'neg', cat: 'Keywords & targeting', guide: 'SHP-4', weight: 2, status: neg >= 3 ? 'pass' : neg ? 'warn' : 'fail', title: 'Shopping negative keywords', detail: neg + ' negative keyword(s).', fix: 'Add negatives like free, diy, used, how to.' });
  }

  // ---------------------------------------------------------------------------
  // Performance score & feedback
  // ---------------------------------------------------------------------------

  function benchFor(ind, type) {
    if (type === 'search') return ind.search;
    if (type === 'shopping') return ind.shopping;
    return ind.display;
  }

  function wasteOf(result) {
    var waste = 0;
    result.searchTerms.forEach(function (t) {
      if (t.excluded) return;
      if (t.conversions === 0 && (t.intent === 'low' || t.relevance < 0.35)) waste += t.cost;
    });
    result.placements.forEach(function (p) {
      if (p.kind === 'app' || p.kind === 'expansion') waste += p.cost * (p.conversions ? 0.6 : 1);
    });
    result.audiences.forEach(function (a) { if (/Entire network/.test(a.segment)) waste += a.cost * 0.7; });
    return waste;
  }

  function performanceScore(state, result) {
    var acc = state.account;
    var ind = D.INDUSTRIES[acc.industry];
    var t = result.totals;
    var parts = [];
    var be = acc.margin > 0 ? 1 / acc.margin : 2.5;
    var active = result.campaigns.filter(function (c) { return !c.errors.length; });
    var awareness = acc.goal === 'awareness';
    if (!awareness) {
      var r = t.roas / be;
      parts.push({ name: 'Profitability (ROAS vs. break-even ' + be.toFixed(2) + '×)', max: 30, pts: 30 * U.clamp((r - 0.5) / 1.5, 0, 1), note: 'ROAS ' + t.roas.toFixed(2) + '× (' + Math.round(r * 100) + '% of break-even)' });
    } else {
      var vids = active.filter(function (c) { return c.type === 'video'; });
      var disp = active.filter(function (c) { return c.type === 'display'; });
      var reach = U.sum(vids.concat(disp), function (c) { return c.reach || 0; });
      var cpmBench = 9;
      var cpm = t.cpm || 99;
      var lift = vids.length ? U.sum(vids, function (c) { return c.adRecallLift || 0; }) / vids.length : 0;
      var sc = (U.clamp(cpmBench / cpm, 0, 1.5) / 1.5) * 0.4 + U.clamp(reach / 200000, 0, 1) * 0.35 + U.clamp(lift / 10, 0, 1) * 0.25;
      parts.push({ name: 'Reach efficiency (CPM, reach, ad recall lift)', max: 30, pts: 30 * sc, note: 'Reach ' + Math.round(reach).toLocaleString() + ', CPM $' + cpm.toFixed(2) + (vids.length ? ', ad recall lift +' + lift.toFixed(1) + ' pts' : '') });
    }
    // CTR and CVR vs benchmark, weighted by cost
    var ctrW = 0, cvrW = 0, w = 0;
    active.forEach(function (c) {
      if (c.type === 'video') return;
      var b = benchFor(ind, c.type);
      var weight = c.cost || 0;
      ctrW += weight * U.clamp(U.safeDiv(c.ctr, b.ctr), 0, 2);
      cvrW += weight * U.clamp(U.safeDiv(c.cvr, b.cvr), 0, 2);
      w += weight;
    });
    var vids2 = active.filter(function (c) { return c.type === 'video'; });
    if (w) {
      parts.push({ name: 'CTR vs. industry benchmark', max: 15, pts: 15 * U.clamp(ctrW / w / 1.1, 0, 1), note: Math.round(ctrW / w * 100) + '% of benchmark' });
      parts.push({ name: 'Conversion rate vs. industry benchmark', max: 15, pts: 15 * U.clamp(cvrW / w / 1.1, 0, 1), note: Math.round(cvrW / w * 100) + '% of benchmark' });
    } else if (vids2.length) {
      var vr = U.sum(vids2, function (c) { return c.viewRate || 0; }) / vids2.length;
      parts.push({ name: 'Video view rate vs. benchmark', max: 30, pts: 30 * U.clamp(vr / ind.video.viewRate / 1.1, 0, 1), note: 'View rate ' + Math.round(vr * 100) + '% vs. ' + Math.round(ind.video.viewRate * 100) + '%' });
    } else {
      parts.push({ name: 'CTR & conversion rate', max: 30, pts: 0, note: 'No clicks' });
    }
    // quality
    var q = [];
    active.forEach(function (c) {
      if (c.type === 'search' && c.avgQs) q.push((c.avgQs - 2) / 6);
      if (c.type === 'shopping' && c.avgFeedScore) q.push(c.avgFeedScore);
      if (c.type === 'display' || c.type === 'video') {
        var ag = c.adGroups.map(function (g) { return g.adStrength; }).filter(Boolean);
        var map = { Excellent: 1, Good: 0.8, Average: 0.5, Poor: 0.2, Incomplete: 0 };
        if (ag.length) q.push(U.sum(ag, function (s) { return map[s] || 0; }) / ag.length);
        else if (c.type === 'video') q.push(c.viewRate ? U.clamp(c.viewRate / 0.3, 0, 1) : 0.5);
      }
    });
    var qa = q.length ? U.clamp(U.sum(q) / q.length, 0, 1) : 0;
    parts.push({ name: 'Quality (Quality Score, ad strength, feed quality)', max: 15, pts: 15 * qa, note: Math.round(qa * 100) + '%' });
    var waste = wasteOf(result);
    var ws = U.safeDiv(waste, t.cost);
    parts.push({ name: 'Wasted spend (irrelevant searches & placements)', max: 15, pts: 15 * (1 - U.clamp(ws / 0.4, 0, 1)), note: Math.round(ws * 100) + '% of spend ($' + waste.toFixed(0) + ')' });
    var util = U.safeDiv(t.cost, t.budget);
    var notRunning = result.campaigns.filter(function (c) { return c.errors.length; }).length;
    var dpts = 10 * U.clamp(util / 0.7, 0, 1) * (result.campaigns.length ? 1 - notRunning / result.campaigns.length : 0);
    parts.push({ name: 'Delivery (budget used, campaigns running)', max: 10, pts: dpts, note: Math.round(util * 100) + '% of budget spent' + (notRunning ? ', ' + notRunning + ' campaign(s) not running' : '') });
    var total = U.sum(parts, function (p) { return p.pts; });
    parts.forEach(function (p) { p.pts = Math.round(p.pts * 10) / 10; });
    return { score: Math.round(t.cost ? total : 0), parts: parts, waste: waste, wasteShare: ws };
  }

  function grade(s) {
    return s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F';
  }

  function money(v) { return '$' + (Math.round(v * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }

  function feedback(state, result, setup, perf, prev) {
    var acc = state.account;
    var ind = D.INDUSTRIES[acc.industry];
    var fb = [];
    var be = acc.margin > 0 ? 1 / acc.margin : 2.5;
    var t = result.totals;
    function add(o) { fb.push(o); }

    result.campaigns.forEach(function (c) {
      if (c.errors.length) add({ severity: 'critical', area: c.name, title: 'Campaign is not running', detail: c.errors.join('; ') + '.', action: 'Fix the issue in the campaign editor and run again.', guide: 'ACC-3' });
      c.warnings.forEach(function (w) { add({ severity: 'warning', area: c.name, title: 'Part of this campaign did not serve', detail: w + '.', action: 'Complete the ad group\'s keywords/ads/targeting.', guide: 'STR-2' }); });
    });
    if (!acc.conversionTracking) {
      add({ severity: 'critical', area: 'Measurement', title: 'You are flying blind: conversions are not tracked', detail: 'In real Google Ads your conversion columns would be empty. The simulator estimates ' + t.conversions + ' conversions (' + money(t.value) + '), but you could not see which keywords or ads produced them.', action: 'Turn on Google tag & conversion tracking in Business setup.', guide: 'ACC-1' });
    }

    // Profitability
    if (t.cost > 0 && acc.goal !== 'awareness') {
      if (t.roas < be) {
        var worst = result.campaigns.filter(function (c) { return c.cost > 0; }).map(function (c) { return { c: c, profit: c.value * acc.margin - c.cost }; }).sort(function (a, b) { return a.profit - b.profit; })[0];
        add({ severity: t.roas < be * 0.6 ? 'critical' : 'warning', area: 'Profitability', title: 'Ads are losing money (ROAS ' + t.roas.toFixed(2) + '× vs. break-even ' + be.toFixed(2) + '×)', detail: 'Estimated profit after ad cost: ' + money(t.value * acc.margin - t.cost) + '.' + (worst ? ' Biggest loss: "' + worst.c.name + '" (' + money(worst.profit) + ').' : ''), action: 'Cut wasted spend first (negatives, placements), then improve relevance/Quality Score; lower bids on unprofitable keywords.', guide: 'BID-3' });
      } else if (t.roas >= be * 1.5) {
        add({ severity: 'success', area: 'Profitability', title: 'Profitable: ROAS ' + t.roas.toFixed(2) + '× (break-even ' + be.toFixed(2) + '×)', detail: 'Estimated profit after ad cost: ' + money(t.value * acc.margin - t.cost) + '.', action: 'Look for budget-limited campaigns to scale.', guide: 'BID-3' });
      }
    }

    // Search terms waste
    var wasteTerms = result.searchTerms.filter(function (s) { return !s.excluded && s.cost > 0 && s.conversions === 0 && (s.intent === 'low' || s.relevance < 0.35); });
    var wasteCost = U.sum(wasteTerms, function (s) { return s.cost; });
    if (wasteTerms.length) {
      var words = {};
      wasteTerms.forEach(function (s) {
        U.words(s.term).forEach(function (w) {
          if (D.LOW_INTENT_WORDS.indexOf(w) >= 0 || ind.competitors.some(function (cp) { return cp.split(' ').indexOf(w) >= 0; }) || ['wallpaper', 'meme', 'game', 'lyrics', 'tattoo', 'costume', 'diy', 'reddit', 'wiki', 'pdf'].indexOf(w) >= 0) words[w] = (words[w] || 0) + s.cost;
        });
      });
      var sugg = Object.keys(words).sort(function (a, b) { return words[b] - words[a]; }).slice(0, 8);
      add({ severity: wasteCost / (t.cost || 1) > 0.1 ? 'warning' : 'opportunity', area: 'Keywords', title: money(wasteCost) + ' spent on ' + wasteTerms.length + ' irrelevant search terms with no conversions', detail: 'Examples: ' + wasteTerms.slice(0, 4).map(function (s) { return '"' + s.term + '" (' + money(s.cost) + ')'; }).join(', ') + '.', action: 'Add negative keywords: ' + (sugg.length ? sugg.join(', ') : 'see the Search terms report') + '. Use the "Add as negative" buttons in Reports → Search terms.', guide: 'KW-2' });
    }
    var goodTerms = result.searchTerms.filter(function (s) { return !s.excluded && s.conversions >= 2 && s.kind !== 'core' && s.cpa < acc.value * acc.margin; }).slice(0, 5);
    if (goodTerms.length) add({ severity: 'opportunity', area: 'Keywords', title: 'Converting search terms you could add as keywords', detail: goodTerms.map(function (s) { return '"' + s.term + '" (' + s.conversions + ' conv.)'; }).join(', ') + '.', action: 'Add them as [exact] or "phrase" keywords to control bids and ad text.', guide: 'KW-1' });

    // Quality Score
    var lowQs = result.keywords.filter(function (k) { return k.qs <= 4 && k.eligible > 0; }).sort(function (a, b) { return b.eligible - a.eligible; });
    if (lowQs.length) {
      var comp = { expCtr: 0, adRel: 0, lp: 0 };
      lowQs.forEach(function (k) { if (k.expCtr === 'Below average') comp.expCtr++; if (k.adRel === 'Below average') comp.adRel++; if (k.lp === 'Below average') comp.lp++; });
      var fixes = [];
      if (comp.adRel) fixes.push('put these keywords in headlines / split them into tighter ad groups (' + comp.adRel + ' with below-average ad relevance)');
      if (comp.expCtr) fixes.push('make keywords more specific and ads more compelling (' + comp.expCtr + ' with below-average expected CTR)');
      if (comp.lp) fixes.push('send them to a matching page on your HTTPS site (' + comp.lp + ' with below-average landing page)');
      add({ severity: 'warning', area: 'Quality Score', title: lowQs.length + ' keyword(s) have a Quality Score of 4 or lower', detail: lowQs.slice(0, 5).map(function (k) { return U.formatKeyword(k) + ' (QS ' + k.qs + ')'; }).join(', ') + '. Low QS raises your CPC and lowers your position.', action: fixes.length ? 'To fix: ' + fixes.join('; ') + '. If the keyword is not something you sell, remove it.' : 'Improve relevance or pause them.', guide: 'QS-1' });
    }
    var highQs = result.keywords.filter(function (k) { return k.qs >= 8; }).length;
    if (result.keywords.length && highQs / result.keywords.length >= 0.6) add({ severity: 'success', area: 'Quality Score', title: 'Strong Quality Scores', detail: highQs + ' of ' + result.keywords.length + ' keywords have QS 8+. You pay less per click than competitors with the same position.', action: 'Keep ads and landing pages aligned as you add keywords.', guide: 'QS-1' });

    // Impression share
    result.campaigns.forEach(function (c) {
      if (c.errors.length || (c.type !== 'search' && c.type !== 'shopping')) return;
      var profitable = c.roas >= be || acc.goal === 'traffic';
      if (c.lostIsBudget > 0.2) {
        if (profitable) add({ severity: 'opportunity', area: c.name, title: 'Missing ' + pct(c.lostIsBudget) + ' of impressions because of budget', detail: 'This campaign is profitable (ROAS ' + c.roas.toFixed(2) + '×) but ran out of budget.', action: 'Raise the daily budget (e.g., to ' + money(c.dailyBudget * Math.min(2, 1 + c.lostIsBudget)) + ') or narrow keywords to the best performers.', guide: 'STR-3' });
        else add({ severity: 'warning', area: c.name, title: 'Budget-limited but not profitable', detail: 'Lost ' + pct(c.lostIsBudget) + ' impression share to budget with ROAS ' + c.roas.toFixed(2) + '×.', action: 'Do not raise the budget yet — fix efficiency (negatives, bids, Quality Score) first.', guide: 'BID-3' });
      }
      if (c.lostIsRank > 0.5) add({ severity: 'warning', area: c.name, title: 'Losing ' + pct(c.lostIsRank) + ' of impressions to Ad Rank', detail: 'Your ad rank (bid × Quality Score × assets) is too low to show for most searches. Avg. Quality Score: ' + (c.avgQs ? c.avgQs.toFixed(1) : 'n/a') + '.', action: 'Improve Quality Score and assets first; raise bids on keywords that are profitable.', guide: 'QS-1' });
      if (c.displayExpansion) add({ severity: 'warning', area: c.name, title: 'Display expansion spent ' + money(c.displayExpansion.cost) + ' at ' + (c.displayExpansion.conversions ? money(c.displayExpansion.cpa) + ' CPA' : 'no conversions'), detail: 'Search campaigns with Display expansion show image ads to people who were not searching.', action: 'Turn off Display Network in the campaign settings; build a dedicated Display campaign if needed.', guide: 'STR-1' });
    });

    // CTR / CVR vs benchmarks
    result.campaigns.forEach(function (c) {
      if (c.errors.length || c.type === 'video' || c.impressions < 200) return;
      var b = benchFor(ind, c.type);
      if (c.ctr < b.ctr * 0.7) add({ severity: 'warning', area: c.name, title: 'CTR ' + pct(c.ctr) + ' is below the ' + ind.name + ' benchmark (' + pct(b.ctr) + ')', detail: c.type === 'search' ? 'Low CTR usually means ads do not match the searches, weak ad strength, missing assets, or low positions.' : c.type === 'display' ? 'Low CTR on Display usually means weak creative or poorly matched audiences.' : 'Low Shopping CTR usually means weak titles/images or uncompetitive prices.', action: c.type === 'search' ? 'Add keywords to headlines, add a CTA and offer, add sitelinks/callouts, tighten match types.' : c.type === 'display' ? 'Complete the responsive display ad (images + logo) and use in-market/custom audiences.' : 'Improve titles, add sale prices, fix overpriced products.', guide: c.type === 'search' ? 'AD-1' : c.type === 'display' ? 'DSP-2' : 'SHP-1' });
      if (c.clicks >= 50 && c.cvr < b.cvr * 0.6) add({ severity: 'warning', area: c.name, title: 'Conversion rate ' + pct(c.cvr) + ' is well below benchmark (' + pct(b.cvr) + ')', detail: 'Clicks are not turning into customers. Common causes: irrelevant search terms/audiences, homepage instead of a specific landing page, wrong locations.', action: 'Check Search terms/Audiences for bad traffic, deep-link to matching pages, and verify location targeting.', guide: 'LP-1' });
      if (c.cpa > 0 && c.cpa > acc.value && acc.goal !== 'awareness') add({ severity: 'warning', area: c.name, title: 'Cost per conversion (' + money(c.cpa) + ') is higher than a conversion is worth (' + money(acc.value) + ')', detail: 'Each conversion costs more than it brings in.', action: 'Lower bids, pause the worst keywords/audiences, or focus the budget on better campaigns.', guide: 'BID-2' });
    });

    // Display & video specifics
    var appPl = result.placements.filter(function (p) { return p.kind === 'app'; });
    var appCost = U.sum(appPl, function (p) { return p.cost; });
    if (appCost > 0) add({ severity: 'warning', area: 'Display placements', title: money(appCost) + ' spent on mobile app placements', detail: 'Apps like ' + appPl.slice(0, 2).map(function (p) { return p.placement.replace('Mobile app: ', ''); }).join(', ') + ' generated ' + U.sum(appPl, function (p) { return p.clicks; }) + ' clicks (many accidental) and ' + Math.round(U.sum(appPl, function (p) { return p.conversions; })) + ' conversions.', action: 'Turn on "Exclude mobile app placements" in the Display campaign.', guide: 'DSP-3' });
    result.audiences.forEach(function (a) {
      if (/Entire network/.test(a.segment) && a.cost > 0) add({ severity: 'warning', area: a.campaign, title: 'Untargeted Display spent ' + money(a.cost), detail: 'Ad group "' + a.adGroup + '" had no targeting and served across the whole network (CTR ' + pct(a.ctr) + ').', action: 'Add in-market, custom or remarketing audiences.', guide: 'DSP-1' });
      if (a.frequency > 10) add({ severity: 'opportunity', area: a.campaign, title: 'High frequency (' + a.frequency.toFixed(1) + '/user/month) for ' + a.segment, detail: 'Ad fatigue lowers CTR and annoys people.', action: 'Set a frequency cap (3–5/day) or broaden the audience.', guide: 'DSP-3' });
    });
    result.campaigns.forEach(function (c) {
      if (c.type !== 'video' || c.errors.length) return;
      if (c.format === 'skippable' && c.viewRate < 0.2) add({ severity: 'warning', area: c.name, title: 'Low view rate (' + pct(c.viewRate) + ')', detail: 'Most viewers skip before 30 seconds. Industry average ≈ ' + pct(ind.video.viewRate) + '.', action: 'Hook viewers in the first 5 seconds, keep it 15–60s, and target more relevant audiences.', guide: 'VID-1' });
      if (c.adRecallLift > 0) add({ severity: c.adRecallLift >= 8 ? 'success' : 'opportunity', area: c.name, title: 'Estimated ad recall lift: +' + c.adRecallLift.toFixed(1) + ' points', detail: 'Reach ' + (c.reach || 0).toLocaleString() + ' people, frequency ' + (c.frequency || 0).toFixed(1) + '. Video raises brand searches and direct traffic next round.', action: c.adRecallLift < 8 ? 'Show the brand early and use a hook to raise recall.' : 'Keep the creative; consider bumpers to reinforce the message.', guide: 'VID-1' });
    });

    // Shopping products
    var zeroProducts = result.products.filter(function (p) { return p.approved && !p.excluded && p.impressions < 50; });
    if (zeroProducts.length) add({ severity: 'warning', area: 'Shopping', title: zeroProducts.length + ' product(s) barely showed', detail: zeroProducts.slice(0, 3).map(function (p) { return '"' + M.fit(p.title, 40) + '" (feed score ' + Math.round(p.feedScore * 100) + '%)'; }).join(', ') + '.', action: 'Improve titles (brand + type + attributes), add GTINs and raise their product group bid.', guide: 'SHP-1' });
    var unapproved = result.products.filter(function (p) { return !p.approved; });
    if (unapproved.length) add({ severity: 'critical', area: 'Shopping', title: unapproved.length + ' product(s) disapproved', detail: unapproved.slice(0, 3).map(function (p) { return '"' + M.fit(p.title || '(no title)', 40) + '"'; }).join(', ') + ' cannot serve.', action: 'Open the Product feed and fix the red errors (image link, price, availability).', guide: 'SHP-2' });
    var costlyProducts = result.products.filter(function (p) { return p.cost > 20 && p.conversions === 0; });
    if (costlyProducts.length) add({ severity: 'opportunity', area: 'Shopping', title: 'Products spending without sales', detail: costlyProducts.slice(0, 3).map(function (p) { return '"' + M.fit(p.title, 40) + '" (' + money(p.cost) + ')'; }).join(', ') + '.', action: 'Create a product group for these and lower the bid, or check price competitiveness.', guide: 'SHP-4' });

    // Devices
    if (t.conversions >= 10 && acc.conversionTracking) {
      result.devices.forEach(function (d) {
        if (d.cost < t.cost * 0.08) return;
        if (d.cpa > t.cpa * 1.5 || (!d.conversions && d.cost > 0)) add({ severity: 'opportunity', area: 'Devices', title: d.device.charAt(0).toUpperCase() + d.device.slice(1) + ' converts poorly (CPA ' + (d.conversions ? money(d.cpa) : 'n/a') + ' vs. ' + money(t.cpa) + ' average)', detail: 'Based on this round\'s device report.', action: 'Try a −20% to −40% bid adjustment for ' + d.device + ' (Manual CPC), rather than excluding it.', guide: 'TGT-2' });
        else if (d.cpa && d.cpa < t.cpa * 0.7) add({ severity: 'opportunity', area: 'Devices', title: d.device.charAt(0).toUpperCase() + d.device.slice(1) + ' converts well (CPA ' + money(d.cpa) + ')', detail: 'Below the ' + money(t.cpa) + ' average.', action: 'Consider a +10% to +20% bid adjustment for ' + d.device + '.', guide: 'TGT-2' });
      });
    }

    // Bidding maturity
    result.campaigns.forEach(function (c) {
      if (c.learning === 'learning') add({ severity: 'info', area: c.name, title: 'Smart Bidding is in its learning period', detail: 'The bid strategy is new or changed, so results are less stable this round.', action: 'Avoid changing the strategy again next round; judge it after 1–2 rounds.', guide: 'BID-4' });
      if ((c.bidStrategy === 'manual_cpc' || c.bidStrategy === 'max_clicks') && acc.conversionTracking && c.conversions >= 30 && (c.type === 'search' || c.type === 'shopping')) add({ severity: 'opportunity', area: c.name, title: 'Ready for Smart Bidding', detail: c.conversions + ' conversions this round at ' + money(c.cpa) + ' CPA.', action: c.type === 'shopping' ? 'Try Target ROAS at about ' + Math.round(c.roas * 90) + '%.' : 'Try Target CPA at about ' + money(c.cpa * 1.1) + ' (slightly above current CPA), or Maximize conversions.', guide: 'BID-1' });
    });

    // Remarketing opportunity
    var hasRmk = state.campaigns.some(function (c) { return (c.adGroups || []).some(function (g) { return g.targeting && (g.targeting.audiences || []).some(function (a) { return a.indexOf('rmk_') === 0; }); }); });
    if (acc.conversionTracking && result.analytics.users > 2000 && !hasRmk) add({ severity: 'opportunity', area: 'Audiences', title: 'Remarketing list ready: ~' + Math.round(result.analytics.users * 0.85).toLocaleString() + ' visitors', detail: 'Past visitors convert several times better than new audiences.', action: 'Create a Display (or Video) campaign targeting "Your data: All website visitors".', guide: 'DSP-4' });

    // Round-over-round
    if (prev && prev.totals) {
      var dv = t.value - prev.totals.value;
      var dp = (t.value * acc.margin - t.cost) - (prev.totals.value * (prev.accountSnapshot ? prev.accountSnapshot.margin : acc.margin) - prev.totals.cost);
      var ds = setup.score - (prev.score ? prev.score.setup : 0);
      add({ severity: dp >= 0 ? 'success' : 'info', area: 'Progress', title: 'Since round ' + prev.round + ': revenue ' + (dv >= 0 ? '+' : '') + money(dv) + ', profit ' + (dp >= 0 ? '+' : '') + money(dp) + ', setup score ' + (ds >= 0 ? '+' : '') + ds, detail: 'Wasted spend ' + (prev.score ? pct(prev.score.wasteShare) + ' → ' : '') + pct(perf.wasteShare) + '. CTR ' + pct(prev.totals.ctr) + ' → ' + pct(t.ctr) + '.', action: dp >= 0 ? 'Keep iterating: pick the top 1–2 recommendations below.' : 'Compare what changed; if you switched bid strategies, give it another round to learn.', guide: 'BID-4' });
    }

    // top setup gaps (not already covered)
    setup.checks.filter(function (c) { return c.status !== 'pass'; }).sort(function (a, b) { return (b.weight - b.earned) - (a.weight - a.earned); }).slice(0, 6).forEach(function (c) {
      add({ severity: c.status === 'fail' ? 'warning' : 'opportunity', area: 'Setup' + (c.campaign ? ' · ' + c.campaign : ''), title: c.title, detail: c.detail, action: c.fix, guide: c.guide, setup: true });
    });

    var order = { critical: 0, warning: 1, opportunity: 2, info: 3, success: 4 };
    fb.sort(function (a, b) { return order[a.severity] - order[b.severity]; });
    return fb;
  }

  function scoreRound(state, result) {
    var setup = evaluateSetup(state);
    var perf = performanceScore(state, result);
    var prev = state.rounds[state.rounds.length - 1];
    var overall = Math.round(0.45 * setup.score + 0.55 * perf.score);
    var acc = state.account;
    result.score = {
      setup: setup.score, performance: perf.score, overall: overall, grade: grade(overall),
      categories: setup.categories, performanceParts: perf.parts, wasteShare: perf.wasteShare, waste: perf.waste,
      profit: result.totals.value * acc.margin - result.totals.cost,
      breakEvenRoas: acc.margin > 0 ? 1 / acc.margin : 0
    };
    result.setupChecks = setup.checks;
    result.feedback = feedback(state, result, setup, perf, prev);
    return result;
  }

  AdSim.scoring = { evaluateSetup: evaluateSetup, performanceScore: performanceScore, scoreRound: scoreRound, grade: grade, CATS: CATS };
})(typeof window !== 'undefined' ? window : globalThis);
