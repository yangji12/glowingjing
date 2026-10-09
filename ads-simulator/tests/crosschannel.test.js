// Cross-channel analysis: verdicts, diagnosis and the budget plan. Run: node --test ads-simulator/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const X = require('./scenarios.js');
const { A } = X;
require(path.join(__dirname, '..', 'js', 'crosschannel.js'));

function round(build, opts) {
  const s = X.base('coffee', opts);
  build(s);
  const r = A.scoring.scoreRound(s, A.engine.simulateRound(s));
  return { s, r, x: A.channels.analyze(s, r, null) };
}

test('a mixed plan rolls campaigns up by channel and the totals add up', () => {
  const { r, x } = round((s) => { X.decentSearch(s); X.decentDisplay(s, X.AUD.coffee); X.decentChat(s, 'coffee'); });
  assert.deepStrictEqual(x.channels.map((c) => c.type), ['search', 'chatgpt', 'display']);
  const spend = x.channels.reduce((a, c) => a + c.cost, 0);
  assert.ok(Math.abs(spend - r.totals.cost) < 0.01);
  assert.ok(Math.abs(x.channels.reduce((a, c) => a + c.shareSpend, 0) - 1) < 1e-6);
  x.channels.forEach((c) => { assert.ok(c.verdict.label); assert.ok(c.diagnosis.next.length >= 1); });
  assert.strictEqual(x.best.type, x.channels.slice().sort((a, b) => b.roas - a.roas)[0].type);
});

test('a losing channel is flagged and the plan moves budget to a profitable one', () => {
  const { x } = round((s) => { X.decentSearch(s); X.nonsenseSearch(s); });
  const camps = x.campaigns;
  assert.ok(camps.some((c) => c.verdict.key === 'bad'), camps.map((c) => c.verdict.label).join(','));
  assert.ok(x.plan.length >= 1);
});

test('without conversion tracking the plan asks for tracking first', () => {
  const { x } = round((s) => { X.decentSearch(s); X.decentDisplay(s, X.AUD.coffee); }, { tracking: false });
  assert.match(x.plan[0].text, /conversion tracking/);
  x.channels.forEach((c) => assert.match(c.verdict.label, /Unmeasured|No delivery|Not running/));
});
