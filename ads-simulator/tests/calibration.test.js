// Calibration guardrails: sensible setups earn real money, nonsense setups earn only a little, and nothing
// reasonable comes back with zero clicks. Run: node --test ads-simulator/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const X = require('./scenarios.js');
const { A } = X;

function run(tpl, build, opts) {
  const s = X.base(tpl, opts);
  build(s);
  return A.scoring.scoreRound(s, A.engine.simulateRound(s));
}
const TPLS = ['coffee', 'law', 'gym', 'saas'];
const fullAbcd = (s, tpl) => {
  const c = X.decentVideo(s, X.AUD[tpl]);
  Object.assign(c.adGroups[0].ads[0], { pacing: true, brandAudio: true, people: true, productDemo: true, captions: true, endCard: true });
};

for (const tpl of TPLS) {
  test(`${tpl}: decent Search, Display and full-ABCD Video are profitable`, () => {
    for (const [name, build] of [['search', X.decentSearch], ['display', (s) => X.decentDisplay(s, X.AUD[tpl])], ['video', (s) => fullAbcd(s, tpl)]]) {
      const r = run(tpl, build);
      assert.ok(r.totals.clicks > 0, `${name}: has clicks`);
      assert.ok(r.score.profit > 0, `${name}: profit ${r.score.profit.toFixed(0)}`);
    }
  });

  test(`${tpl}: the untouched quick-start campaign gets traffic`, () => {
    const r = run(tpl, X.quickStart, { tracking: false });
    assert.ok(r.totals.clicks > 50 && r.campaigns[0].status !== 'Not running');
  });

  test(`${tpl}: nonsense setups earn far less than decent ones, but never lose`, () => {
    const bad = run(tpl, X.nonsenseSearch).score.profit, good = run(tpl, X.decentSearch).score.profit;
    assert.ok(bad > 0, `nonsense profit ${bad.toFixed(0)}`);
    assert.ok(bad < good * 0.5, `nonsense ${bad.toFixed(0)} vs decent ${good.toFixed(0)}`);
    const ud = run(tpl, X.untargetedDisplay).score.profit, td = run(tpl, (s) => X.decentDisplay(s, X.AUD[tpl])).score.profit;
    assert.ok(ud > 0 && ud < td, `untargeted display ${ud.toFixed(0)} vs targeted ${td.toFixed(0)}`);
  });

  test(`${tpl}: video creative quality drives results`, () => {
    const good = run(tpl, (s) => fullAbcd(s, tpl));
    const bad = run(tpl, (s) => { const c = X.decentVideo(s, X.AUD[tpl]); Object.assign(c.adGroups[0].ads[0], { hook: false, brandEarly: false, headline: '', cta: '' }); });
    assert.ok(good.totals.value > bad.totals.value * 1.4, `${good.totals.value.toFixed(0)} vs ${bad.totals.value.toFixed(0)}`);
    assert.ok(good.campaigns[0].adRecallLift > bad.campaigns[0].adRecallLift);
  });
}


test('display with automated bidding never stalls at zero (auction price floors)', () => {
  for (const tpl of TPLS) assert.ok(run(tpl, X.untargetedDisplay).totals.clicks > 0, tpl);
});
