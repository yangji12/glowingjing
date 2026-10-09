// Typical student setups used to calibrate the simulator (also used by tests/calibration.test.js).
const A = require('./load.js');
const { model: M, data: D } = A;

function base(tplId, opts = {}) {
  const s = M.applyTemplate(Object.assign(M.newState(), { seed: opts.seed || 21 }), D.TEMPLATES.find((t) => t.id === tplId));
  s.account.conversionTracking = opts.tracking !== false;
  return s;
}

// A reasonable, not expert, Search campaign: what a student does after reading the guidelines once.
function decentSearch(s) {
  const c = M.quickStartSearch(s);
  c.networks.displayExpansion = false;
  c.negativesText = 'free\njobs\nhow to\ndiy\nsalary';
  c.adGroups.forEach((g) => {
    g.keywordsText = g.keywordsText.split('\n').map((k) => '"' + k + '"').join('\n');
    const kw = M.adGroupKeywords(g)[0].text;
    const name = s.account.businessName;
    g.ads[0].headlines = [M.fit(name, 30), M.fit(kw.replace(/\b\w/g, (x) => x.toUpperCase()), 30), 'Shop ' + M.fit(kw, 25), 'Free Shipping Available', 'Trusted by Customers', 'Order Online Today', '', '', '', '', '', '', '', '', ''];
    g.ads[0].descriptions = [M.fit(s.account.description, 90), 'Get started today. Fast, friendly service and great value.', '', ''];
  });
  c.assets.sitelinks = (s.scan.links || []).slice(0, 4).map((l) => ({ text: M.fit(l.text, 25), d1: 'Learn more', d2: 'See details', url: M.absoluteUrl(s.account.website, l.url) }));
  c.assets.callouts = 'Free Shipping\nTrusted Service\nFast Response\nGreat Value';
  if (s.account.serviceArea === 'local') { c.locations = ['r25']; c.locationOption = 'presence'; }
  s.campaigns.push(c);
  return c;
}

// Quick start exactly as generated (Google-style defaults).
function quickStart(s) { const c = M.quickStartSearch(s); s.campaigns.push(c); return c; }

function decentDisplay(s, aud) {
  const c = M.newCampaign('display', s);
  const g = c.adGroups[0];
  g.targeting.audiences = aud;
  Object.assign(g.ads[0], { headlines: ['Discover ' + M.fit(s.account.businessName, 20), 'Shop Today', 'Great Value', '', ''], longHeadline: M.fit(s.account.description, 90),
    descriptions: ['Order today and save.', M.fit(s.account.description, 90), '', '', ''], landscapeImage: 'data:image/jpeg;base64,AA', squareImage: 'data:image/jpeg;base64,AA', logoUrl: 'generated' });
  c.excludeApps = true;
  if (s.account.serviceArea === 'local') { c.locations = ['r25']; c.locationOption = 'presence'; }
  s.campaigns.push(c);
  return c;
}

function decentVideo(s, aud) {
  const c = M.newCampaign('video', s);
  const g = c.adGroups[0];
  g.targeting.audiences = aud;
  Object.assign(g.ads[0], { length: 30, hook: true, brandEarly: true, headline: M.fit(s.account.businessName, 30), cta: 'Learn more', companion: true });
  if (s.account.serviceArea === 'local') { c.locations = ['r25']; c.locationOption = 'presence'; }
  s.campaigns.push(c);
  return c;
}

function shopping(s) { const c = M.newCampaign('shopping', s); s.campaigns.push(c); return c; }

// Nonsense: keywords unrelated to the business and a nearly empty ad.
function nonsenseSearch(s) {
  const c = M.newCampaign('search', s);
  c.adGroups[0].keywordsText = 'cheap flights\nfree games\ncelebrity news';
  c.adGroups[0].ads[0].headlines[0] = 'Click here';
  c.adGroups[0].ads[0].descriptions[0] = 'Best stuff.';
  s.campaigns.push(c);
  return c;
}

function untargetedDisplay(s) {
  const c = M.newCampaign('display', s);
  c.adGroups[0].targeting.optimized = false;
  Object.assign(c.adGroups[0].ads[0], { headlines: ['Ad', '', '', '', ''], longHeadline: 'Ad', descriptions: ['Ad', '', '', '', ''] });
  s.campaigns.push(c);
  return c;
}

const AUD = { coffee: ['im_coffee', 'aff_foodies'], law: ['im_legal'], gym: ['im_fitness'], saas: ['im_software'] };

module.exports = { A, base, decentSearch, quickStart, decentDisplay, decentVideo, shopping, nonsenseSearch, untargetedDisplay, AUD };

// A reasonable ChatGPT ads campaign: specific context hints, clear copy, image, pixel on.
const CHAT_HINTS = {
  coffee: ['choosing fresh whole bean coffee for a home espresso machine', 'best specialty coffee subscription for gifts', 'single origin coffee beans with fruity notes', 'how to brew better pour over coffee at home', 'buying freshly roasted coffee online'],
  law: ['what to do after a car accident in Denver', 'finding a personal injury lawyer near me', 'how much is my car accident claim worth', 'truck accident attorney free consultation', 'slip and fall injury compensation'],
  gym: ['finding a gym with HIIT classes in Austin', 'personal trainer for beginners nearby', 'boutique fitness studio membership prices', 'strength training classes for women', 'yoga and HIIT studio first class free'],
  saas: ['project management software for small agencies', 'best tool to track team tasks and time', 'alternatives to spreadsheets for client projects', 'workflow automation for small teams', 'kanban board app with client portal']
};
function decentChat(s, tpl, opts = {}) {
  const c = M.newCampaign('chatgpt', s);
  Object.assign(c, { objective: opts.objective || 'clicks', capi: !!opts.capi });
  if (s.account.serviceArea === 'local') c.locations = ['r25'];
  const g = c.adGroups[0];
  g.hintsText = (opts.hints || CHAT_HINTS[tpl]).join('\n');
  if (opts.oppref) g.queryParams = 'utm_source=chatgpt&oppref={oppref}';
  g.ads = [
    { title: M.fit(s.account.businessName, 24), body: M.fit(s.account.description, 48), image: 'generated', url: '' },
    { title: 'Try ' + M.fit(s.account.businessName, 18), body: 'Rated 4.9 by local customers. Start today.', image: 'generated', url: '' }
  ];
  s.campaigns.push(c);
  return c;
}
module.exports.decentChat = decentChat;
module.exports.CHAT_HINTS = CHAT_HINTS;
