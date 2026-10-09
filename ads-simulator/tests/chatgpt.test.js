// ChatGPT ads: calibration, measurement and policy behavior. Run: node --test ads-simulator/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const X = require('./scenarios.js');
const { A } = X;
const { model: M, engine: E, scoring: SC } = A;

function run(tpl, build, opts) {
  const s = X.base(tpl, opts);
  const c = build(s);
  return { s, c, r: SC.scoreRound(s, E.simulateRound(s)) };
}
const camp = (r, c) => r.campaigns.find((x) => x.id === c.id);
const check = (s, id) => SC.evaluateSetup(s).checks.find((x) => x.id.endsWith(':' + id));

for (const tpl of ['coffee', 'gym', 'saas']) {
  test(`${tpl}: a decent ChatGPT campaign with specific hints is profitable`, () => {
    const { r } = run(tpl, (s) => X.decentChat(s, tpl, { capi: true, oppref: true }));
    assert.ok(r.totals.clicks > 50, `clicks ${r.totals.clicks}`);
    assert.ok(r.score.profit > 0, `profit ${r.score.profit.toFixed(0)}`);
  });
}

test('vague one-word hints perform worse than specific hints', () => {
  const good = run('coffee', (s) => X.decentChat(s, 'coffee')).r;
  const vague = run('coffee', (s) => X.decentChat(s, 'coffee', { hints: ['coffee', 'drinks', 'food'] })).r;
  assert.ok(vague.score.profit < good.score.profit, `vague ${vague.score.profit.toFixed(0)} vs good ${good.score.profit.toFixed(0)}`);
  assert.ok(vague.chatTopics.some((t) => t.status === 'Off-target' && t.impressions > 0), 'vague hints drift off-target');
});

test('reported conversions never exceed actual, and CAPI + oppref report more', () => {
  const pixel = camp(...(({ r, c }) => [r, c])(run('coffee', (s) => X.decentChat(s, 'coffee'))));
  const full = camp(...(({ r, c }) => [r, c])(run('coffee', (s) => X.decentChat(s, 'coffee', { capi: true, oppref: true }))));
  assert.ok(pixel.reportedConversions <= pixel.conversions + 0.5);
  assert.ok(full.reportedConversions <= full.conversions + 0.5);
  assert.ok(full.matchRate > pixel.matchRate);
});

test('no pixel means no reported conversions and a failing measurement check', () => {
  const { s, r, c } = run('coffee', (s) => X.decentChat(s, 'coffee'), { tracking: false });
  assert.strictEqual(camp(r, c).reportedConversions, 0);
  assert.strictEqual(check(s, 'cmeasure').status, 'fail');
});

test('prohibited ads are rejected by review', () => {
  const s = X.base('coffee');
  const c = X.decentChat(s, 'coffee');
  c.adGroups[0].ads.forEach((a) => { a.title = 'Online casino bonus'; a.body = 'Bet now and win big at our casino.'; });
  assert.strictEqual(M.chatAdReview(c.adGroups[0].ads[0], s, c.adGroups[0]).status, 'Rejected');
  assert.strictEqual(check(s, 'creview').status, 'fail');
});

test('a daily budget under $25 is flagged', () => {
  const s = X.base('coffee');
  const c = X.decentChat(s, 'coffee');
  c.dailyBudget = 10;
  const r = E.simulateRound(s);
  assert.ok(camp(r, c).warnings.some((w) => /\$25/.test(w)));
});

test('the mock-up renders a sponsored card and a product carousel', () => {
  ['previews', 'chatgpt'].forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
  const s = X.base('coffee');
  const c = X.decentChat(s, 'coffee');
  const g = c.adGroups[0];
  const card = A.chatgpt.render('desktop', { ad: g.ads[0], g, state: s });
  assert.match(card, /Sponsored/);
  assert.ok(card.includes(g.ads[0].title.replace(/&/g, '&amp;')));
  const carousel = A.chatgpt.render('mobile', { products: s.products, g, state: s });
  assert.match(carousel, /cg-carousel|Add approved products/);
});
