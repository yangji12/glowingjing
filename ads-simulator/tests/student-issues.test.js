// Regressions for issues found by playing through the app as a student (three retail brands).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const X = require('./scenarios.js');
const { A } = X;
const { model: M, data: D, engine: E, scoring: SC } = A;
require(path.join(__dirname, '..', 'js', 'crosschannel.js'));

function shop(name, desc) {
  const s = M.newState();
  Object.assign(s.account, { businessName: name, website: 'https://www.' + name.toLowerCase() + '.example', description: desc, conversionTracking: true });
  return s;
}

test('brand names and acronyms in capitals pass review; capitals for emphasis do not', () => {
  const s = shop('YETI', 'Coolers and insulated tumblers built for the outdoors.');
  M.setBrand('YETI');
  assert.deepStrictEqual(M.policyIssues('Shop YETI Coolers', 'headline'), []);
  assert.deepStrictEqual(M.policyIssues('HVAC Repair', 'headline'), []);
  assert.ok(M.policyIssues('FREE Shipping', 'headline').length);
  assert.ok(M.policyIssues('LOWEST PRICES EVER', 'headline').length);
  const r = M.chatAdReview({ title: 'YETI Tundra Coolers', body: 'Keeps ice for days on any trip.', image: 'generated' }, s, { defaultUrl: s.account.website });
  assert.notStrictEqual(r.status, 'Rejected', r.reasons.join('; '));
});

test('starter keywords are clean phrases from the description', () => {
  const s = shop('Glossier', 'Skincare and makeup brand. Boy Brow brow gel, Cloud Paint cream blush, Balm Dotcom lip balm.');
  const names = M.quickStartSearch(s).adGroups.map((g) => g.keywordsText);
  assert.deepStrictEqual(names, ['brow gel', 'cream blush', 'lip balm']);
});

test('audience fit follows what the business sells, not just the industry', () => {
  const s = shop('Allbirds', 'Sustainable wool sneakers and running shoes for men and women.');
  const fit = (id) => M.segmentFit(D.AUDIENCES.find((a) => a.id === id), s).key;
  assert.strictEqual(fit('im_apparel'), 'strong');
  assert.strictEqual(fit('aff_fitness'), 'strong');
  assert.strictEqual(fit('aff_foodies'), 'weak');
  assert.strictEqual(fit('im_coffee'), 'weak');
});

test('a retail brand gets product-style search terms, not service ones', () => {
  const s = X.base('coffee');
  X.decentSearch(s);
  s.campaigns[0].adGroups.forEach((g) => { g.keywordsText = g.keywordsText.replace(/"/g, ''); });
  const terms = E.simulateRound(s).searchTerms.map((t) => t.term).join(' | ');
  assert.doesNotMatch(terms, /\b(book|hire|quote|internship|salary)\b/);
});

test('Search CTR feedback ignores Display expansion impressions', () => {
  const s = X.base('coffee');
  const c = X.decentSearch(s) || s.campaigns[0];
  s.campaigns[0].networks.displayExpansion = true;
  const r = SC.scoreRound(s, E.simulateRound(s));
  const camp = r.campaigns[0];
  assert.ok(camp.searchCtr > camp.ctr, 'search-only CTR is higher than the blended CTR');
  assert.ok(r.feedback.some((f) => /Display expansion in your Search campaign/.test(f.title)));
});

test('ChatGPT feedback uses its own benchmark wording, once', () => {
  const s = X.base('coffee');
  X.decentChat(s, 'coffee', { hints: ['coffee', 'drinks', 'beans'] });
  const r = SC.scoreRound(s, E.simulateRound(s));
  const cg = r.feedback.filter((f) => f.area === s.campaigns[0].name && /CTR/.test(f.title));
  assert.ok(cg.every((f) => !/Shopping/.test(f.detail)));
  assert.ok(cg.length <= 1);
});

test('the budget plan never takes ChatGPT ads below the $25/day minimum', () => {
  const s = X.base('coffee');
  X.decentSearch(s);
  const cg = X.decentChat(s, 'coffee', { hints: ['coffee'] });
  cg.dailyBudget = 28;
  cg.adGroups[0].ads.forEach((a) => { a.title = 'Hi'; a.body = 'x'; });
  const r = SC.scoreRound(s, E.simulateRound(s));
  const x = A.channels.analyze(s, r, null);
  x.plan.filter((p) => p.from === 'chatgpt').forEach((p) => assert.ok(cg.dailyBudget - p.amount >= 25 || p.amount === 0, p.text));
});

test('decent Display returns less than Search for the same business', () => {
  for (const tpl of ['coffee', 'law', 'gym', 'saas']) {
    const run = (build) => { const s = X.base(tpl); build(s); return E.simulateRound(s).campaigns[0].roas; };
    const search = run(X.decentSearch), display = run((s) => X.decentDisplay(s, X.AUD[tpl]));
    assert.ok(display < search, `${tpl}: display ${display.toFixed(2)} vs search ${search.toFixed(2)}`);
  }
});
