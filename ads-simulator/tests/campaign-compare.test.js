// Campaign comparison: per-campaign diagnosis, and best-vs-weakest pairs on the same platform
// explained by their setup differences.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const X = require('./scenarios.js');
const { A } = X;
require(path.join(__dirname, '..', 'js', 'crosschannel.js'));
const { model: M, engine: E, scoring: SC } = A;

test('two Search campaigns with different setups produce a pair with explained differences', () => {
  const s = X.base('coffee');
  X.decentSearch(s);
  const weak = X.quickStart(s) || s.campaigns[s.campaigns.length - 1];
  const r = SC.scoreRound(s, E.simulateRound(s));
  const x = A.channels.analyze(s, r, null);
  assert.strictEqual(x.pairs.length, 1);
  const p = x.pairs[0];
  assert.strictEqual(p.type, 'search');
  assert.ok(p.best.roas >= p.worst.roas);
  assert.ok(p.diffs.length >= 2, p.diffs.join(' | '));
  assert.ok(p.diffs.some((d) => /negative|phrase\/exact|expansion|Ad strength|sitelinks/.test(d)), p.diffs.join(' | '));
  x.campaigns.forEach((c) => { assert.ok(c.diagnosis && c.diagnosis.next.length >= 1); assert.ok(c.setup && c.setup.budget >= 0); });
});

test('a single campaign per platform gives no pairs but still a per-campaign diagnosis', () => {
  const s = X.base('gym');
  X.decentSearch(s);
  X.decentDisplay(s, X.AUD.gym);
  X.decentVideo(s, X.AUD.gym);
  X.decentChat(s, 'gym');
  const r = SC.scoreRound(s, E.simulateRound(s));
  const x = A.channels.analyze(s, r, null);
  assert.deepStrictEqual(x.pairs, []);
  assert.strictEqual(x.campaigns.length, 4);
  const v = x.campaigns.find((c) => c.type === 'video');
  assert.match(v.setup.abcd, /\d+\/\d+/);
  assert.ok(x.campaigns.find((c) => c.type === 'chatgpt').setup.hints >= 1);
  assert.ok(x.bestCampaign && x.worstCampaign);
});
