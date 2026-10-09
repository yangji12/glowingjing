// The simulated market scales to each business's economics, so cheap products are not judged
// against click prices built for expensive ones, and sensible setups earn a profit.
const test = require('node:test');
const assert = require('node:assert');
const X = require('./scenarios.js');
const { A } = X;
const { model: M, engine: E, scoring: SC, data: D } = A;

function brand(value, margin) {
  const s = M.newState();
  s.scan = {};
  Object.assign(s.account, { businessName: 'Labubu', website: 'https://www.popmart.com', industry: 'retail', value, margin, conversionTracking: true,
    description: 'Labubu blind box collectible plush toys and keychains by Pop Mart. Limited edition monster figures, series boxes and plush pendants for collectors.' });
  return s;
}

test('click prices scale down for cheap products and never up for expensive ones', () => {
  const base = D.INDUSTRIES.retail.search.cpc;
  assert.ok(M.marketFor(brand(25, 0.45)).search.cpc < base * 0.4, 'cheap product gets a much cheaper market');
  assert.ok(M.marketFor(brand(1000, 0.6)).search.cpc <= base, 'expensive product never pays more than the industry benchmark');
  assert.ok(E.chatBench(M.marketFor(brand(25, 0.45)), { competition: 1 }).cpc < E.chatBench(D.INDUSTRIES.retail, { competition: 1 }).cpc * 0.5, 'ChatGPT prices scale too');
});

for (const value of [15, 25, 40]) {
  test(`a $${value} product with a decent setup is profitable in every channel`, () => {
    const s = brand(value, 0.45);
    X.decentSearch(s);
    X.decentDisplay(s, ['im_toys', 'aff_collectors', 'rmk_all']);
    X.decentChat(s, 'coffee', { hints: M.suggestHints(s) });
    const r = SC.scoreRound(s, E.simulateRound(s));
    assert.ok(r.score.profit > 0, `profit ${r.score.profit.toFixed(0)}`);
    r.campaigns.forEach((c) => assert.ok(c.roas > r.score.breakEvenRoas, `${c.type} ROAS ${c.roas.toFixed(2)} vs break-even ${r.score.breakEvenRoas.toFixed(2)}`));
  });
}

test('suggested context hints are specific and relevant to the business', () => {
  const s = brand(25, 0.45);
  const hints = M.suggestHints(s);
  assert.ok(hints.length >= 4);
  const vocab = M.businessVocab(s);
  hints.forEach((h) => assert.strictEqual(M.hintQuality(h, vocab).label, 'Specific', h));
});

test('an ad group without conversation targeting fails its setup check', () => {
  const s = brand(25, 0.45);
  const c = X.decentChat(s, 'coffee', { hints: [] });
  c.adGroups[0].hintsText = '';
  const chk = SC.evaluateSetup(s).checks.find((x) => x.id.endsWith(':chints'));
  assert.strictEqual(chk.status, 'fail');
});
