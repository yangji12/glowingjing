// Single-platform rounds: only that platform runs, it is scored on its own campaigns, and
// Smart Bidding learning follows each campaign's own last run.
const test = require('node:test');
const assert = require('node:assert');
const X = require('./scenarios.js');
const { A } = X;
const { engine: E, scoring: SC } = A;

function mixed() {
  const s = X.base('coffee');
  X.decentSearch(s);
  X.decentDisplay(s, X.AUD.coffee);
  X.decentChat(s, 'coffee');
  return s;
}
const run = (s, scope) => { const r = SC.scoreRound(s, E.simulateRound(s, { scope })); s.rounds.push(r); return r; };

test('a platform round simulates only that platform', () => {
  const s = mixed();
  const r = run(s, 'chatgpt');
  assert.strictEqual(r.scope, 'chatgpt');
  assert.deepStrictEqual(r.campaigns.map((c) => c.type), ['chatgpt']);
  assert.ok(r.totals.clicks > 0);
  assert.ok(r.setupChecks.every((c) => !c.campaign || c.campaign === s.campaigns.find((x) => x.type === 'chatgpt').name), 'setup checks cover only ChatGPT campaigns');
});

test('all-platform rounds still run everything', () => {
  const s = mixed();
  const r = run(s, 'all');
  assert.deepStrictEqual(r.campaigns.map((c) => c.type).sort(), ['chatgpt', 'display', 'search']);
});

test('Smart Bidding learning follows the campaign, not the last round', () => {
  const s = mixed();
  run(s, 'search');
  run(s, 'display');
  const r3 = run(s, 'search');
  const search = r3.campaigns.find((c) => c.type === 'search');
  assert.notStrictEqual(search.learning, 'learning', 'search ran in round 1, so it is not learning again in round 3');
});

test('progress feedback compares with the previous round of the same scope', () => {
  const s = mixed();
  run(s, 'search');
  run(s, 'display');
  const r3 = run(s, 'search');
  const prog = r3.feedback.find((f) => f.area === 'Progress');
  assert.ok(prog && /round 1/.test(prog.title), prog && prog.title);
});
