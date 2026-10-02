// YouTube campaign subtypes behave the way Google describes them.
const test = require('node:test');
const assert = require('node:assert');
const X = require('./scenarios.js');
const { A } = X;
const { model: M, data: D, engine: E } = A;

const FULL = { hook: true, pacing: true, brandEarly: true, brandAudio: true, people: true, productDemo: true, captions: true, endCard: true, headline: 'Fresh Coffee', cta: 'Shop now', companion: true, description: 'Roasted to order' };

function camp(sub, lengths, opts = {}) {
  const s = X.base('gym', opts);
  const c = M.newCampaign('video', s);
  c.videoSubtype = sub;
  c.bidStrategy = D.VIDEO_SUBTYPES[sub].bids[0];
  if (opts.freqGoal) c.freqGoal = opts.freqGoal;
  c.adGroups[0].targeting.audiences = X.AUD.gym;
  c.adGroups[0].ads = lengths.map((len) => Object.assign(M.newVideoAd(s), FULL, opts.ad || {}, { length: len }));
  s.campaigns.push(c);
  return E.simulateRound(s).campaigns[0];
}
const SHORT_CUTS = [30, 15, 6];

test('every subtype runs when its ads fit', () => {
  for (const sub of Object.keys(D.VIDEO_SUBTYPES)) {
    const r = camp(sub, sub === 'audio' ? [30] : SHORT_CUTS);
    assert.notStrictEqual(r.status, 'Not running', sub + ': ' + r.errors.join(';'));
    assert.ok(r.impressions > 0 && r.cost > 0, sub);
    assert.strictEqual(r.subtype, sub);
  }
});

test('formats are chosen by video length', () => {
  const r = camp('efficientReach', [30]);
  assert.ok(!r.formats.includes('bumper'), 'a 30s video cannot run as a bumper');
  assert.ok(camp('efficientReach', [30, 6]).formats.includes('bumper'));
  const nonskip = camp('nonskipReach', [30]);
  assert.strictEqual(nonskip.status, 'Not running');
  assert.ok(/15 seconds/.test(nonskip.errors.join(' ') + nonskip.warnings.join(' ')));
});

test('target frequency reaches about the weekly goal', () => {
  const r = camp('targetFrequency', SHORT_CUTS, { freqGoal: 3 });
  assert.ok(Math.abs(r.weeklyFrequency - 3) < 0.6, String(r.weeklyFrequency));
});

test('each subtype wins at what it is for', () => {
  const views = camp('views', SHORT_CUTS);
  const reach = camp('efficientReach', SHORT_CUTS);
  const conv = camp('conversions', SHORT_CUTS);
  const freq = camp('targetFrequency', SHORT_CUTS);
  const eng = camp('engagement', SHORT_CUTS);
  assert.ok(reach.reach > views.reach && reach.cpm < views.cpm, 'efficient reach: more reach, lower CPM');
  assert.ok(conv.roas > views.roas, 'drive conversions: best return');
  assert.ok(freq.adRecallLift > reach.adRecallLift, 'target frequency: highest recall');
  assert.ok(eng.subscribers > views.subscribers * 2, 'engagements: most subscribers');
});

test('ad sequence needs steps; audio needs the brand in the voiceover', () => {
  const one = camp('sequence', [30]);
  assert.ok(one.warnings.some((w) => /2 or more ads/.test(w)));
  const three = camp('sequence', SHORT_CUTS);
  assert.ok(three.adRecallLift > one.adRecallLift);
  const said = camp('audio', [30]);
  const silent = camp('audio', [30], { ad: { brandAudio: false } });
  assert.ok(said.adRecallLift > silent.adRecallLift * 1.5);
});

test('drive conversions without tracking runs but warns', () => {
  const r = camp('conversions', SHORT_CUTS, { tracking: false });
  assert.ok(r.warnings.some((w) => /conversion tracking/.test(w)));
});

test('older saves with only a format still work', () => {
  const s = X.base('gym');
  const c = M.newCampaign('video', s);
  delete c.videoSubtype;
  c.videoFormat = 'bumper';
  c.bidStrategy = 'target_cpm';
  c.adGroups[0].ads[0] = Object.assign(M.newVideoAd(s), FULL, { length: 6 });
  s.campaigns.push(c);
  const m = M.migrate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(m.campaigns[0].videoSubtype, 'nonskipReach');
  assert.notStrictEqual(E.simulateRound(m).campaigns[0].status, 'Not running');
});
