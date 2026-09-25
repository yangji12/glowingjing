// Run: node --test ads-simulator/tests
const test = require('node:test');
const assert = require('node:assert');
const A = require('./load.js');
const { model: M, data: D, engine: E, scoring: SC, util: U } = A;

function coffee(seed = 11) {
  const s = M.applyTemplate(Object.assign(M.newState(), { seed }), D.TEMPLATES[0]);
  s.campaigns.push(M.quickStartSearch(s));
  return s;
}
const run = (s) => SC.scoreRound(s, E.simulateRound(s));

// Applies the baseline guidelines to the quick-start campaign.
function improve(s) {
  s.account.conversionTracking = true;
  const c = s.campaigns[0];
  c.networks.displayExpansion = false;
  c.locationOption = 'presence';
  c.negativesText = 'free\njobs\nhow to\ndiy\nsalary\nwhat is\nused\nreddit\nmeaning\npdf\ninternship\nwiki\namazon\nwalmart\ntarget';
  c.adGroups.forEach((g) => {
    g.keywordsText = g.keywordsText.split('\n').map((k) => '"' + k + '"').join('\n');
    const kw = g.keywordsText.split('\n')[0].replace(/"/g, '');
    g.ads[0].headlines = ['Fresh ' + kw, 'Buy ' + kw + ' Online', 'Free Shipping Over $35', 'Roasted to Order', 'Small-Batch Coffee', 'Shop Brew Haven',
      'Rated 4.9 Stars', 'Subscribe and Save 15%', 'Specialty ' + kw, 'Order Today', 'Ships in 24 Hours', '', '', '', ''].map((h) => h.slice(0, 30));
    g.ads[0].descriptions = ['Fresh roasted specialty coffee shipped within 24 hours. Order today.', 'Small-batch ' + kw + ' roasted to order. Free shipping over $35.',
      'Try our coffee subscription and save 15% on every bag.', 'Rated 4.9 stars by 2,000+ coffee lovers. Shop now.'];
  });
  c.assets.sitelinks = [1, 2, 3, 4].map((i) => ({ text: 'Link ' + i, d1: 'a', d2: 'b', url: 'https://www.brewhaven.example/p' + i }));
  c.assets.callouts = 'Free Shipping\nRoasted to Order\n24h Dispatch\nSubscribe & Save';
  c.assets.snippetValues = 'Espresso, Decaf, Single Origin';
  return s;
}

test('keyword notation parses match types', () => {
  assert.deepStrictEqual(U.parseKeyword('[Coffee Beans]'), { text: 'coffee beans', match: 'exact' });
  assert.deepStrictEqual(U.parseKeyword('"coffee beans"'), { text: 'coffee beans', match: 'phrase' });
  assert.deepStrictEqual(U.parseKeyword('coffee beans'), { text: 'coffee beans', match: 'broad' });
});

test('negative keyword semantics', () => {
  assert.ok(U.negativeBlocks({ text: 'free', match: 'broad' }, 'free coffee beans'));
  assert.ok(!U.negativeBlocks({ text: 'free', match: 'broad' }, 'coffee beans'));
  assert.ok(U.negativeBlocks({ text: 'how to', match: 'phrase' }, 'how to brew coffee'));
  assert.ok(!U.negativeBlocks({ text: 'how to', match: 'phrase' }, 'to know how coffee'));
  assert.ok(!U.negativeBlocks({ text: 'coffee', match: 'exact' }, 'coffee beans'));
});

test('same setup in the same round is reproducible', () => {
  const a = E.simulateRound(coffee());
  const b = E.simulateRound(coffee());
  assert.strictEqual(a.totals.clicks, b.totals.clicks);
  assert.strictEqual(a.totals.conversions, b.totals.conversions);
});

test('metrics are finite and internally consistent', () => {
  const r = run(coffee());
  for (const c of r.campaigns) {
    for (const k of ['impressions', 'clicks', 'cost', 'conversions', 'value', 'ctr', 'cpc']) assert.ok(Number.isFinite(c[k]), k + ' finite');
    assert.ok(c.clicks <= c.impressions);
    assert.ok(c.cost <= c.dailyBudget * 30.4 * 1.001, 'never spends more than the monthly budget');
  }
  for (const k of r.keywords) assert.ok(k.qs >= 1 && k.qs <= 10);
  assert.ok(r.score.overall >= 0 && r.score.overall <= 100);
});

test('following the guidelines improves setup score, performance and profit', () => {
  const base = run(coffee());
  const better = run(improve(coffee()));
  assert.ok(better.score.setup > base.score.setup + 15, `setup ${base.score.setup} -> ${better.score.setup}`);
  assert.ok(better.score.performance > base.score.performance, `perf ${base.score.performance} -> ${better.score.performance}`);
  assert.ok(better.score.profit > base.score.profit);
  assert.ok(better.score.wasteShare < base.score.wasteShare);
});

test('negative keywords exclude matching search terms', () => {
  const s = coffee();
  s.campaigns[0].negativesText = 'jobs\nsalary';
  const r = E.simulateRound(s);
  const hit = r.searchTerms.filter((t) => /\b(jobs|salary)\b/.test(t.term));
  assert.ok(hit.length > 0);
  assert.ok(hit.every((t) => t.excluded && t.impressions === 0));
});

test('exact match only shows for the keyword itself', () => {
  const s = coffee();
  s.campaigns[0].adGroups.forEach((g) => { g.keywordsText = g.keywordsText.split('\n').map((k) => '[' + k + ']').join('\n'); });
  const r = E.simulateRound(s);
  const kws = new Set(r.keywords.map((k) => k.text));
  assert.ok(r.searchTerms.every((t) => kws.has(t.term)));
});

test('national targeting hurts a local business conversion rate', () => {
  const mk = (locs) => {
    const s = M.applyTemplate(Object.assign(M.newState(), { seed: 5 }), D.TEMPLATES[1]);
    const c = M.quickStartSearch(s);
    c.locations = locs;
    c.dailyBudget = 2000;
    c.networks.displayExpansion = false;
    s.campaigns.push(c);
    return E.simulateRound(s).campaigns[0];
  };
  assert.ok(mk(['r25']).cvr > mk(['us']).cvr * 1.8);
});

test('conversion bidding without tracking is blocked or penalised', () => {
  const s = coffee();
  s.campaigns[0].bidStrategy = 'target_cpa';
  s.campaigns[0].targetCpa = 20;
  const r = run(s);
  assert.strictEqual(r.campaigns[0].status, 'Not running');
  assert.ok(r.feedback.some((f) => f.severity === 'critical'));
});

test('video format length rules are enforced', () => {
  const ad = Object.assign(M.newVideoAd({ account: { website: 'https://x.example' } }), { length: 15, finalUrl: 'https://x.example' });
  assert.ok(!M.videoAdCheck(ad, 'bumper').valid);
  assert.ok(M.videoAdCheck(ad, 'nonskip').valid);
  ad.length = 20;
  assert.ok(!M.videoAdCheck(ad, 'nonskip').valid);
});

test('shopping feed: missing image disapproves, good titles score higher', () => {
  const s = M.applyTemplate(M.newState(), D.TEMPLATES[0]);
  const [good, weak, , noImage] = s.products;
  assert.ok(!M.feedQuality(noImage).approved);
  assert.ok(M.feedQuality(good).score > M.feedQuality(weak).score);
  s.account.conversionTracking = true;
  s.campaigns.push(M.newCampaign('shopping', s));
  const r = E.simulateRound(s);
  assert.notStrictEqual(r.campaigns[0].status, 'Not running');
  assert.ok(r.products.find((p) => p.productId === noImage.id).impressions === 0);
});

test('display untargeted vs in-market: targeting lifts conversion rate', () => {
  const mk = (aud, optimized) => {
    const s = M.applyTemplate(Object.assign(M.newState(), { seed: 3 }), D.TEMPLATES[0]);
    s.account.conversionTracking = true;
    const c = M.newCampaign('display', s);
    c.bidStrategy = 'max_clicks';
    const g = c.adGroups[0];
    g.targeting.audiences = aud;
    g.targeting.optimized = optimized;
    Object.assign(g.ads[0], { headlines: ['Fresh Roasted Coffee', '', '', '', ''], longHeadline: 'Specialty coffee roasted to order', descriptions: ['Order fresh coffee today.', '', '', '', ''], landscapeImage: 'generated', squareImage: 'generated' });
    c.excludeApps = true;
    s.campaigns.push(c);
    return E.simulateRound(s).campaigns[0];
  };
  const untargeted = mk([], false), targeted = mk(['im_coffee'], false);
  assert.ok(targeted.cvr > untargeted.cvr * 2, `${untargeted.cvr} vs ${targeted.cvr}`);
});

test('policy checks catch common editorial violations', () => {
  assert.ok(M.policyIssues('Buy Now!', 'headline').length);
  assert.ok(M.policyIssues('Great deals!!', 'description').length);
  assert.ok(M.policyIssues('Call 555-010-2000 today', 'description').length);
  assert.ok(M.policyIssues('HUGE SALE today', 'headline').length);
  assert.strictEqual(M.policyIssues('Free Shipping Over $35', 'headline').length, 0);
});

test('starter campaign without demo data takes keywords from the description', () => {
  const s = M.newState();
  Object.assign(s.account, { businessName: 'Green Leaf Florist', website: 'https://greenleaf.example', description: 'Local florist offering same-day flower delivery, wedding bouquets and sympathy flowers in Portland.' });
  const kws = M.quickStartSearch(s).adGroups.flatMap((g) => M.adGroupKeywords(g).map((k) => k.text));
  assert.ok(kws.includes('same-day flower delivery') && kws.includes('wedding bouquets'), kws.join(', '));
});
