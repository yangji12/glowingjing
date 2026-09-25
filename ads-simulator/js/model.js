/* AdSim model: state defaults, campaign factories, quick start, and shared analysis helpers. */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});
  var U = AdSim.util;
  var D = AdSim.data;

  var STATE_VERSION = 1;

  function blankHeadlines(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push('');
    return a;
  }

  function newState() {
    return {
      version: STATE_VERSION,
      student: '',
      seed: Math.floor(Math.random() * 1e9),
      account: {
        businessName: '', website: '', industry: 'retail', serviceArea: 'national', goal: 'sales',
        value: 75, margin: 0.4, brandColor: '#1a73e8', description: '', conversionTracking: false, logoUrl: ''
      },
      scan: null,
      products: [],
      campaigns: [],
      rounds: []
    };
  }

  function defaultBidStrategy(type, state) {
    if (type === 'video') return 'max_cpv';
    if (type === 'search') return state.account.conversionTracking ? 'max_conversions' : 'max_clicks';
    if (type === 'display') return state.account.conversionTracking ? 'max_conversions' : 'max_clicks';
    return 'manual_cpc';
  }

  function defaultLocations(state) {
    return state.account.serviceArea === 'local' ? ['r25'] : ['us'];
  }

  function allAges() { return D.AGE_BANDS.map(function () { return true; }); }
  function allGenders() { return D.GENDERS.map(function () { return true; }); }

  function newTargeting() {
    return { audiences: [], topics: [], placementsText: '', ages: allAges(), genders: allGenders(), optimized: true };
  }

  function newRSA(state) {
    return { headlines: blankHeadlines(15), descriptions: blankHeadlines(4), finalUrl: state ? state.account.website : '', path1: '', path2: '' };
  }

  function newRDA(state) {
    var acc = state ? state.account : {};
    return {
      headlines: blankHeadlines(5), longHeadline: '', descriptions: blankHeadlines(5),
      businessName: acc.businessName || '', finalUrl: acc.website || '', landscapeImage: '', squareImage: '',
      logoUrl: acc.logoUrl || '', cta: 'Learn more', color: acc.brandColor || '#1a73e8'
    };
  }

  function newVideoAd(state) {
    var acc = state ? state.account : {};
    return {
      videoUrl: '', length: 30, aspect: '16:9', hook: false, brandEarly: false, captions: false,
      headline: '', longHeadline: '', description: '', cta: 'Learn more', finalUrl: acc.website || '',
      companion: false, thumbnail: ''
    };
  }

  function newAdGroup(type, state, name) {
    var g = { id: U.uid('ag'), name: name || 'Ad group 1', defaultBid: 1.5 };
    if (type === 'search') {
      g.keywordsText = '';
      g.negativesText = '';
      g.ads = [newRSA(state)];
    } else if (type === 'display') {
      g.defaultBid = 0.8;
      g.targeting = newTargeting();
      g.ads = [newRDA(state)];
    } else if (type === 'video') {
      g.targeting = newTargeting();
      g.ads = [newVideoAd(state)];
    }
    return g;
  }

  function newCampaign(type, state, goal) {
    var n = state.campaigns.filter(function (c) { return c.type === type; }).length + 1;
    var c = {
      id: U.uid('cmp'), type: type, name: D.CAMPAIGN_TYPES[type].name + ' campaign ' + n, status: 'enabled',
      goal: goal || state.account.goal, dailyBudget: type === 'video' ? 25 : 30,
      bidStrategy: defaultBidStrategy(type, state), maxCpc: type === 'shopping' ? 0.8 : 2, targetCpa: 0, targetRoas: 0,
      targetIs: 70, maxCpv: 0.05, targetCpm: 8,
      locations: defaultLocations(state), locationOption: 'presenceOrInterest', language: 'en', schedule: 'all',
      devices: { mobile: 0, desktop: 0, tablet: 0 },
      negativesText: ''
    };
    if (type === 'search') {
      c.networks = { searchPartners: true, displayExpansion: true };
      c.assets = { sitelinks: [], callouts: '', snippetHeader: 'Types', snippetValues: '', phone: '' };
      c.adGroups = [newAdGroup('search', state)];
    } else if (type === 'display') {
      c.excludeApps = false;
      c.freqCap = 0;
      c.adGroups = [newAdGroup('display', state)];
    } else if (type === 'video') {
      c.videoFormat = 'skippable';
      c.freqCap = 0;
      c.adGroups = [newAdGroup('video', state)];
    } else if (type === 'shopping') {
      c.priority = 'low';
      c.productGroups = [{ id: U.uid('pg'), dimension: 'all', value: '', bid: 0.8, excluded: false }];
    }
    return c;
  }

  function newProduct() {
    return { id: U.uid('p'), title: '', price: 0, salePrice: 0, marketPrice: 0, brand: '', gtin: '', category: '', imageUrl: '', description: '', availability: 'in_stock', link: '' };
  }

  function absoluteUrl(site, path) {
    if (!path) return site;
    if (/^https?:\/\//i.test(path)) return path;
    return String(site || '').replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  }

  // ---------------------------------------------------------------------------
  // Business vocabulary & relevance
  // ---------------------------------------------------------------------------

  function businessVocab(state) {
    var acc = state.account;
    var vocab = new Map();
    function add(text, w) {
      U.contentTokens(text).forEach(function (t) {
        vocab.set(t, Math.max(vocab.get(t) || 0, w));
      });
    }
    var ind = D.INDUSTRIES[acc.industry];
    if (ind) add(ind.vocab, 0.55);
    add(acc.businessName, 1);
    add(acc.description, 1);
    if (state.scan) {
      add(state.scan.title, 1);
      add(state.scan.description, 1);
      (state.scan.keywords || []).forEach(function (k) { add(k, 1); });
      (state.scan.headings || []).forEach(function (k) { add(k, 0.9); });
      (state.scan.topTerms || []).forEach(function (k) { add(k, 0.8); });
    }
    (state.products || []).forEach(function (p) { add(p.title + ' ' + p.category + ' ' + p.brand, 1); });
    return vocab;
  }

  // 0..1 share of the text's content tokens the business actually offers
  function relevance(text, vocab) {
    var toks = U.contentTokens(text);
    if (!toks.length) return 0.35;
    var s = 0;
    toks.forEach(function (t) { s += vocab.get(t) || 0; });
    return U.clamp(s / toks.length, 0, 1);
  }

  function brandTokens(state) {
    return U.contentTokens(state.account.businessName);
  }

  // intent: brand | competitor | high | low | neutral
  function intentOf(text, state) {
    var w = U.words(text);
    var joined = ' ' + w.join(' ') + ' ';
    var bt = brandTokens(state);
    if (bt.length && bt.every(function (t) { return w.map(U.stem).indexOf(t) >= 0; })) return 'brand';
    var ind = D.INDUSTRIES[state.account.industry];
    if (ind && ind.competitors.some(function (c) { return joined.indexOf(' ' + c + ' ') >= 0; })) return 'competitor';
    if (w.some(function (x) { return D.LOW_INTENT_WORDS.indexOf(x) >= 0; })) return 'low';
    if (w.some(function (x) { return D.HIGH_INTENT_WORDS.indexOf(x) >= 0; }) || joined.indexOf(' near me ') >= 0) return 'high';
    return 'neutral';
  }

  // ---------------------------------------------------------------------------
  // Policy & ad strength
  // ---------------------------------------------------------------------------

  var PHONE_RE = /(\+?\d[\d\-\s().]{7,}\d)/;

  function policyIssues(text, kind) {
    var issues = [];
    if (!text) return issues;
    if (kind === 'headline' && text.indexOf('!') >= 0) issues.push('Exclamation marks are not allowed in headlines');
    if (/([!?.])\1/.test(text)) issues.push('Repeated punctuation (e.g., "!!") is not allowed');
    var caps = (text.match(/\b[A-Z]{4,}\b/g) || []).filter(function (w) { return ['HVAC', 'SAAS', 'USDA', 'HIIT'].indexOf(w) < 0; });
    if (caps.length) issues.push('Excessive capitalization ("' + caps[0] + '")');
    if (PHONE_RE.test(text)) issues.push('Phone numbers are not allowed in ad text — use a call asset');
    return issues;
  }

  function hasCTA(texts) {
    var all = ' ' + texts.join(' ').toLowerCase() + ' ';
    return D.CTA_WORDS.some(function (w) { return all.indexOf(' ' + w + ' ') >= 0 || all.indexOf(' ' + w + '.') >= 0 || all.indexOf(' ' + w + ',') >= 0; });
  }

  function hasOffer(texts) {
    return /(\d|%|\$|free\b|save\b|off\b|★)/i.test(texts.join(' '));
  }

  function normalizeForDupes(s) {
    return U.contentTokens(s).sort().join(' ');
  }

  function keywordTokenCoverage(keywords, texts) {
    if (!keywords.length) return 0;
    var tt = new Set(U.contentTokens(texts.join(' ')));
    var covered = 0;
    keywords.forEach(function (k) {
      var kt = U.contentTokens(k.text);
      if (!kt.length) { covered += 1; return; }
      var hit = kt.filter(function (t) { return tt.has(t); }).length / kt.length;
      covered += hit;
    });
    return covered / keywords.length;
  }

  var STRENGTH_LABELS = ['Poor', 'Average', 'Good', 'Excellent'];

  function strengthLabel(points, max) {
    var r = points / max;
    if (r >= 0.8) return 'Excellent';
    if (r >= 0.6) return 'Good';
    if (r >= 0.4) return 'Average';
    return 'Poor';
  }

  // Responsive search ad strength
  function rsaStrength(ad, keywords) {
    var policy = [];
    var headlines = [];
    var tooLong = [];
    (ad.headlines || []).forEach(function (h, i) {
      h = (h || '').trim();
      if (!h) return;
      if (h.length > 30) { tooLong.push('Headline ' + (i + 1) + ' is ' + h.length + '/30 characters'); return; }
      var p = policyIssues(h, 'headline');
      if (p.length) { policy.push('Headline ' + (i + 1) + ': ' + p[0]); return; }
      headlines.push(h);
    });
    var descriptions = [];
    (ad.descriptions || []).forEach(function (d, i) {
      d = (d || '').trim();
      if (!d) return;
      if (d.length > 90) { tooLong.push('Description ' + (i + 1) + ' is ' + d.length + '/90 characters'); return; }
      var p = policyIssues(d, 'description');
      if (p.length) { policy.push('Description ' + (i + 1) + ': ' + p[0]); return; }
      descriptions.push(d);
    });
    var uniqueH = U.uniq(headlines.map(normalizeForDupes));
    var dupes = headlines.length - uniqueH.length;
    var issues = [];
    var pts = 0;
    var nh = uniqueH.length;
    if (nh >= 11) pts += 3; else if (nh >= 8) pts += 2; else if (nh >= 5) pts += 1;
    if (nh < 8) issues.push('Add more unique headlines (' + nh + ' of recommended 8–15)');
    var nd = descriptions.length;
    if (nd >= 4) pts += 2; else if (nd >= 3) pts += 1.5; else if (nd >= 2) pts += 1;
    if (nd < 3) issues.push('Add more descriptions (' + nd + ' of recommended 3–4)');
    var cov = keywordTokenCoverage(keywords || [], headlines);
    if (cov >= 0.5) pts += 2; else if (cov > 0.15) pts += 1;
    if (keywords && keywords.length && cov < 0.5) issues.push('Include more of your keywords in headlines');
    if (dupes === 0 && nh > 0) pts += 1; else if (dupes > 0) issues.push('Remove ' + dupes + ' duplicate headline(s)');
    if (hasCTA(headlines.concat(descriptions))) pts += 1; else issues.push('Add a call to action (e.g., "Shop Now", "Get a Quote")');
    if (hasOffer(headlines.concat(descriptions))) pts += 0.5; else issues.push('Mention an offer, price or number (e.g., "Free Shipping", "20% Off")');
    var valid = headlines.length >= 3 && descriptions.length >= 2;
    if (!valid) issues.unshift('A responsive search ad needs at least 3 headlines and 2 descriptions');
    var label = valid ? strengthLabel(pts, 9.5) : 'Incomplete';
    return {
      valid: valid, points: pts, max: 9.5, label: label, headlines: headlines, descriptions: descriptions,
      issues: issues, policy: policy.concat(tooLong), keywordCoverage: cov
    };
  }

  // Responsive display ad strength
  function rdaStrength(ad) {
    var policy = [];
    var headlines = (ad.headlines || []).map(function (h) { return (h || '').trim(); }).filter(function (h, i) {
      if (!h) return false;
      if (h.length > 30) { policy.push('Headline ' + (i + 1) + ' exceeds 30 characters'); return false; }
      var p = policyIssues(h, 'headline');
      if (p.length) { policy.push('Headline ' + (i + 1) + ': ' + p[0]); return false; }
      return true;
    });
    var descriptions = (ad.descriptions || []).map(function (d) { return (d || '').trim(); }).filter(function (d, i) {
      if (!d) return false;
      if (d.length > 90) { policy.push('Description ' + (i + 1) + ' exceeds 90 characters'); return false; }
      var p = policyIssues(d, 'description');
      if (p.length) { policy.push('Description ' + (i + 1) + ': ' + p[0]); return false; }
      return true;
    });
    var lh = (ad.longHeadline || '').trim();
    if (lh.length > 90) { policy.push('Long headline exceeds 90 characters'); lh = ''; }
    var bn = (ad.businessName || '').trim();
    if (bn.length > 25) policy.push('Business name exceeds 25 characters');
    var issues = [];
    var pts = 0;
    pts += Math.min(headlines.length, 5) * 0.4; if (headlines.length < 5) issues.push('Add up to 5 short headlines (' + headlines.length + '/5)');
    pts += Math.min(descriptions.length, 5) * 0.4; if (descriptions.length < 5) issues.push('Add up to 5 descriptions (' + descriptions.length + '/5)');
    if (lh) pts += 1; else issues.push('Add a long headline');
    if (bn) pts += 0.5; else issues.push('Add your business name');
    if (ad.landscapeImage) pts += 1.5; else issues.push('Add a landscape (1.91:1) image');
    if (ad.squareImage) pts += 1.5; else issues.push('Add a square (1:1) image');
    if (ad.logoUrl) pts += 1; else issues.push('Add a logo');
    if (hasCTA(headlines.concat(descriptions, [lh]))) pts += 0.5; else issues.push('Add a call to action in the text');
    var valid = headlines.length >= 1 && descriptions.length >= 1 && !!lh && !!bn && !!ad.finalUrl;
    if (!valid) issues.unshift('A responsive display ad needs at least 1 headline, a long headline, 1 description, a business name and a final URL');
    // Formats: without images the ad can only serve as text/native formats
    var formatReach = 0.45 + (ad.landscapeImage ? 0.3 : 0) + (ad.squareImage ? 0.25 : 0);
    return {
      valid: valid, points: pts, max: 9, label: valid ? strengthLabel(pts, 9) : 'Incomplete',
      headlines: headlines, descriptions: descriptions, longHeadline: lh, issues: issues, policy: policy, formatReach: formatReach
    };
  }

  function videoAdCheck(ad, format) {
    var f = D.VIDEO_FORMATS[format] || D.VIDEO_FORMATS.skippable;
    var errors = [];
    var issues = [];
    var len = Number(ad.length) || 0;
    if (!len) errors.push('Enter the video length in seconds');
    if (f.maxLen && len > f.maxLen) errors.push(f.name + ' ads must be ' + f.maxLen + ' seconds or shorter (yours: ' + len + 's)');
    if (format === 'shorts' && ad.aspect !== '9:16') issues.push('Shorts should use vertical 9:16 video');
    if (!ad.finalUrl) errors.push('Add a final URL');
    if (!ad.hook) issues.push('Hook viewers in the first 5 seconds');
    if (!ad.brandEarly) issues.push('Show your brand in the first 5 seconds');
    if (!ad.headline && format !== 'bumper') issues.push('Add a headline / CTA headline');
    if (!ad.cta) issues.push('Add a call-to-action button');
    if (format === 'skippable' && len > 180) issues.push('Skippable ads over 3 minutes lose most viewers — aim for 15–60 seconds');
    if (!ad.companion && (format === 'skippable' || format === 'nonskip')) issues.push('Add a companion banner');
    var pts = (ad.hook ? 2 : 0) + (ad.brandEarly ? 2 : 0) + (ad.headline ? 1 : 0) + (ad.cta ? 1 : 0) + (ad.companion ? 0.5 : 0) + (ad.captions ? 0.5 : 0) +
      (format === 'skippable' ? (len >= 12 && len <= 60 ? 2 : len <= 180 ? 1 : 0) : 2);
    return { valid: errors.length === 0, errors: errors, issues: issues, points: pts, max: 9, label: errors.length ? 'Not eligible' : strengthLabel(pts, 9) };
  }

  // ---------------------------------------------------------------------------
  // Shopping feed quality
  // ---------------------------------------------------------------------------

  var ATTR_RE = /\b(\d+\s?(oz|ml|l|lb|lbs|g|kg|pack|count|ct|in|inch|cm|mm|gb|tb)|small|medium|large|x-large|xl|xs|black|white|red|blue|green|pink|grey|gray|brown|navy|gold|silver|cotton|leather|wool|ceramic|steel|wood|organic|men'?s|women'?s|kids|unisex|light roast|dark roast|medium roast|size \w+)\b/i;

  function feedQuality(p) {
    var issues = [];
    var errors = [];
    var title = (p.title || '').trim();
    if (!title) errors.push('Missing title');
    if (!(Number(p.price) > 0)) errors.push('Missing or invalid price');
    if (!p.imageUrl) errors.push('Missing image link (required)');
    if (p.availability === 'out_of_stock') errors.push('Out of stock — will not serve');
    if (!p.link) issues.push('Missing product page link (will use homepage)');
    var s = 0;
    var tl = title.length;
    if (tl >= 70 && tl <= 150) s += 0.3; else if (tl >= 40) { s += 0.18; issues.push('Title is ' + tl + ' chars — aim for 70–150 with key attributes'); } else if (tl > 150) { s += 0.2; issues.push('Title over 150 characters is truncated'); } else { s += 0.05; issues.push('Title is too short (' + tl + ' chars) — add brand, product type and attributes'); }
    var head = title.slice(0, 70).toLowerCase();
    if (p.brand && head.indexOf(String(p.brand).toLowerCase()) >= 0) s += 0.1; else issues.push(p.brand ? 'Put the brand in the first 70 characters of the title' : 'Add a brand');
    if (ATTR_RE.test(title)) s += 0.1; else issues.push('Add attributes to the title (size, color, material, roast, etc.)');
    if (p.category && U.contentTokens(p.category).some(function (t) { return U.contentTokens(title).indexOf(t) >= 0; })) s += 0.05;
    else issues.push('Include the product type (category) in the title');
    if (/^\d{8}$|^\d{12,14}$/.test(String(p.gtin || '').trim())) s += 0.15; else issues.push('Add a valid GTIN (8, 12, 13 or 14 digits)');
    var dl = (p.description || '').length;
    if (dl >= 500) s += 0.15; else if (dl >= 150) s += 0.1; else { s += 0.02; issues.push('Description is short (' + dl + ' chars) — 150+ required for a good score, 500+ recommended'); }
    if (p.imageUrl) s += 0.1;
    if (p.brand) s += 0.05;
    return { score: U.clamp(s, 0, 1), approved: errors.length === 0, errors: errors, issues: issues };
  }

  // ---------------------------------------------------------------------------
  // Quick start from a website scan
  // ---------------------------------------------------------------------------

  function titleCase(s) {
    return String(s).replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function fit(s, n) {
    s = String(s || '').trim();
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    var sp = cut.lastIndexOf(' ');
    return (sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:|–-]+$/, '');
  }

  function scanKeywords(state) {
    var scan = state.scan || {};
    var ks = (scan.keywords || []).slice();
    (scan.topTerms || []).forEach(function (t) { if (ks.indexOf(t) < 0) ks.push(t); });
    if (!ks.length) {
      var ind = D.INDUSTRIES[state.account.industry];
      ks = ind ? ind.vocab.split(' ').slice(0, 6) : [];
    }
    return ks.filter(function (k) { return k && k.length > 2; }).slice(0, 12);
  }

  // Builds a "Google default"-style draft Search campaign. It is deliberately a starting point:
  // broad match everywhere, network defaults left on, no negatives. Students improve it.
  function quickStartSearch(state) {
    var acc = state.account;
    var scan = state.scan || {};
    var c = newCampaign('search', state, acc.goal);
    c.name = 'Search – ' + (acc.businessName || 'Quick start');
    var kws = scanKeywords(state);
    var groups = [];
    // cluster keywords by their first content token
    kws.forEach(function (k) {
      var head = U.contentTokens(k).slice(-1)[0] || k;
      var g = groups.find(function (x) { return x.head === head; });
      if (!g) { g = { head: head, kws: [] }; groups.push(g); }
      g.kws.push(k);
    });
    groups = groups.slice(0, 3);
    if (!groups.length) groups = [{ head: 'general', kws: [acc.businessName || 'products'] }];
    var name = acc.businessName || U.domainOf(acc.website) || 'Our Business';
    c.adGroups = groups.map(function (g, i) {
      var ag = newAdGroup('search', state, titleCase(g.kws[0]));
      ag.keywordsText = g.kws.join('\n');
      var ad = ag.ads[0];
      var hl = [fit(name, 30), fit(titleCase(g.kws[0]), 30), fit(scan.title ? scan.title.split(/[|–-]/)[0] : name, 30), 'Official Site'];
      hl = U.uniq(hl.filter(Boolean));
      hl.forEach(function (h, j) { ad.headlines[j] = h; });
      ad.descriptions[0] = fit(scan.description || acc.description || '', 90);
      ad.descriptions[1] = fit(acc.description || scan.description || '', 90);
      if (ad.descriptions[0] === ad.descriptions[1]) ad.descriptions[1] = '';
      var link = (scan.links || [])[i];
      ad.finalUrl = link ? absoluteUrl(acc.website, link.url) : acc.website;
      return ag;
    });
    c.assets.sitelinks = (scan.links || []).slice(0, 2).map(function (l) {
      return { text: fit(l.text, 25), d1: '', d2: '', url: absoluteUrl(acc.website, l.url) };
    });
    return c;
  }

  function importScanProducts(state) {
    var scan = state.scan || {};
    return (scan.products || []).map(function (sp) {
      var p = newProduct();
      p.title = sp.name || '';
      p.price = Number(sp.price) || 0;
      p.brand = sp.brand || '';
      p.gtin = sp.gtin || '';
      p.imageUrl = sp.image || '';
      p.description = sp.description || '';
      p.availability = /out/i.test(sp.availability || '') ? 'out_of_stock' : 'in_stock';
      p.link = sp.url || '';
      p.category = sp.category || '';
      return p;
    });
  }

  function applyTemplate(state, tpl) {
    var s = newState();
    s.seed = state.seed;
    s.student = state.student;
    Object.assign(s.account, U.deepClone(tpl.account));
    s.account.conversionTracking = false;
    s.scan = Object.assign({ source: 'template', topTerms: [], headings: [], products: [] }, U.deepClone(tpl.scan));
    s.products = tpl.products.map(function (p) { return Object.assign(newProduct(), U.deepClone(p)); });
    return s;
  }

  // Keywords of an ad group, parsed
  function adGroupKeywords(g) {
    return U.parseKeywordList(g.keywordsText);
  }

  function campaignNegatives(c) {
    return U.parseKeywordList(c.negativesText);
  }

  // State migration hook for imported/older saves
  function migrate(s) {
    if (!s || typeof s !== 'object') return newState();
    var base = newState();
    s.version = STATE_VERSION;
    s.account = Object.assign(base.account, s.account || {});
    s.products = s.products || [];
    s.campaigns = s.campaigns || [];
    s.rounds = s.rounds || [];
    if (typeof s.seed !== 'number') s.seed = base.seed;
    return s;
  }

  AdSim.model = {
    newState: newState, newCampaign: newCampaign, newAdGroup: newAdGroup, newRSA: newRSA, newRDA: newRDA,
    newVideoAd: newVideoAd, newProduct: newProduct, newTargeting: newTargeting, businessVocab: businessVocab,
    relevance: relevance, intentOf: intentOf, policyIssues: policyIssues, rsaStrength: rsaStrength,
    rdaStrength: rdaStrength, videoAdCheck: videoAdCheck, feedQuality: feedQuality, quickStartSearch: quickStartSearch,
    importScanProducts: importScanProducts, applyTemplate: applyTemplate, adGroupKeywords: adGroupKeywords,
    campaignNegatives: campaignNegatives, absoluteUrl: absoluteUrl, keywordTokenCoverage: keywordTokenCoverage,
    hasCTA: hasCTA, migrate: migrate, fit: fit, STRENGTH_LABELS: STRENGTH_LABELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
