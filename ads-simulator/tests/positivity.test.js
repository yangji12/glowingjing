// Every student outcome is money-making: weak, sloppy and even nonsensical setups end each round
// with a small profit, while decent setups earn much more.
const test = require('node:test');
const assert = require('node:assert');
const X = require('./scenarios.js');
const { A } = X;
const { model: M, engine: E, scoring: SC } = A;

function sloppy(s) {
  X.quickStart(s);                       // untouched Google-default-style Search draft
  X.untargetedDisplay(s);                // Display with no audiences
  const v = M.newCampaign('video', s); s.campaigns.push(v);   // Video with nothing filled in
  const c = M.newCampaign('chatgpt', s); c.adGroups[0].ads[0] = { title: 'Our shop', body: 'Have a look at what we sell.', image: '', url: '' }; s.campaigns.push(c);  // ChatGPT with no hints
}

for (const tpl of ['coffee', 'law', 'gym', 'saas']) {
  test(`${tpl}: a sloppy full-stack setup still makes money in every channel`, () => {
    const s = X.base(tpl);
    sloppy(s);
    const r = SC.scoreRound(s, E.simulateRound(s));
    assert.ok(r.score.profit > 0, `profit ${r.score.profit.toFixed(0)}`);
    r.campaigns.filter((c) => c.cost > 0).forEach((c) => assert.ok(c.value * s.account.margin - c.cost > 0, `${c.type} loses money`));
  });

  test(`${tpl}: a decent setup earns clearly more than a sloppy one`, () => {
    const a = X.base(tpl); sloppy(a);
    const b = X.base(tpl); X.decentSearch(b); X.decentDisplay(b, X.AUD[tpl]); X.decentChat(b, tpl);
    const pa = SC.scoreRound(a, E.simulateRound(a)).score.profit, pb = SC.scoreRound(b, E.simulateRound(b)).score.profit;
    assert.ok(pb > pa * 1.5, `decent ${pb.toFixed(0)} vs sloppy ${pa.toFixed(0)}`);
  });
}

test('reports still add up after the floor is applied', () => {
  const s = X.base('coffee');
  X.nonsenseSearch(s);
  const r = E.simulateRound(s);
  const c = r.campaigns[0];
  assert.ok(c.floored, 'nonsense campaign was floored');
  const ag = c.adGroups.reduce((a, g) => a + g.value, 0);
  assert.ok(ag > 0 && ag <= c.value + 1, `ad groups ${ag.toFixed(0)} vs campaign ${c.value.toFixed(0)}`);
  assert.ok(c.value * s.account.margin > c.cost, 'floored campaign is profitable');
  const terms = r.searchTerms.filter((t) => t.campaignId === c.id);
  assert.ok(terms.every((t) => !t.conversions || t.value / t.conversions > 0), 'rows keep value per conversion');
});
