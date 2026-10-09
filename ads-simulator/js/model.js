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
        value: D.INDUSTRIES.retail.value, margin: D.INDUSTRIES.retail.margin, brandColor: '#1a73e8', description: '', conversionTracking: false, logoUrl: ''
      },
      scan: null,
      products: [],
      campaigns: [],
      rounds: [],
      decisions: {}
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
      videoUrl: '', length: 30, aspect: '16:9', hook: false, pacing: false, brandEarly: false, brandAudio: false,
      people: false, productDemo: false, captions: false, endCard: false,
      headline: '', longHeadline: '', description: '', cta: 'Learn more', finalUrl: acc.website || '',
      companion: false, thumbnail: '', verticalThumb: ''
    };
  }

  function benchCpc(state, type) {
    var ind = D.INDUSTRIES[state && state.account.industry] || D.INDUSTRIES.retail;
    return Math.round(ind[type].cpc * 1.25 * 20) / 20;
  }

  function newAdGroup(type, state, name) {
    var g = { id: U.uid('ag'), name: name || 'Ad group 1', defaultBid: benchCpc(state, 'search') };
    if (type === 'search') {
      g.keywordsText = '';
      g.negativesText = '';
      g.ads = [newRSA(state)];
    } else if (type === 'display') {
      g.defaultBid = benchCpc(state, 'display');
      g.targeting = newTargeting();
      g.ads = [newRDA(state)];
    } else if (type === 'video') {
      g.targeting = newTargeting();
      g.ads = [newVideoAd(state)];
    } else if (type === 'chatgpt') {
      g.bidStrategy = 'max_results';
      g.maxBid = 4;
      g.queryParams = '';
      g.defaultUrl = state ? state.account.website : '';
      g.hintsText = '';
      g.productFilter = { dimension: 'all', value: '' };
      g.ads = [newChatAd(state)];
    }
    return g;
  }

  function newChatAd(state) {
    return { title: '', body: '', image: '', url: '' };
  }

  function newCampaign(type, state, goal) {
    var n = state.campaigns.filter(function (c) { return c.type === type; }).length + 1;
    var c = {
      id: U.uid('cmp'), type: type, name: D.CAMPAIGN_TYPES[type].name + ' campaign ' + n, status: 'enabled',
      goal: goal || state.account.goal, dailyBudget: type === 'video' ? 25 : 30,
      bidStrategy: defaultBidStrategy(type, state), maxCpc: benchCpc(state, type === 'shopping' ? 'shopping' : type === 'display' ? 'display' : 'search'), targetCpa: 0, targetRoas: 0,
      targetIs: 70, maxCpv: 0.05, targetCpv: 0.04, targetCpm: 8,
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
      c.videoSubtype = 'views';
      c.freqGoal = 2;
      c.videoSurfaces = Object.keys(D.YT_SURFACES);
      c.inventory = 'standard';
      c.freqCap = 0;
      c.adGroups = [newAdGroup('video', state)];
    } else if (type === 'chatgpt') {
      c.objective = 'clicks';
      c.convEvent = 'purchase';
      c.convBilling = 'ocpc';
      c.bidStrategy = 'max_results';
      c.budgetType = 'daily';
      c.totalBudget = 900;
      c.locations = ['us'];
      c.platforms = D.CHATGPT.platforms.map(function (p) { return p[0]; });
      c.audienceInclude = false;
      c.audienceExclude = false;
      c.customerListSize = 0;
      c.capi = false;
      c.clickWindow = 7;
      c.viewWindow = 1;
      c.source = 'manual';
      c.adGroups = [newAdGroup('chatgpt', state)];
    } else if (type === 'shopping') {
      c.priority = 'low';
      c.productGroups = [{ id: U.uid('pg'), dimension: 'all', value: '', bid: benchCpc(state, 'shopping'), excluded: false }];
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

  // How well an audience or topic fits this business: its keywords against the business's own words first,
  // then the industry. Returns { key: 'strong' | 'industry' | 'weak' | 'own', rel }.
  function segmentFit(seg, state, vocab) {
    if (!seg) return { key: 'weak', rel: 0.35 };
    if (seg.inds === 'all') return { key: 'own', rel: 1 };
    var isTopic = !seg.type;
    vocab = vocab || businessVocab(state);
    var hits = U.contentTokens(seg.kw || '').filter(function (t) { return (vocab.get(t) || 0) >= 0.8; });
    if (hits.length) return { key: 'strong', rel: isTopic ? 0.85 : 1, hits: hits };
    if ((seg.inds || []).indexOf(state.account.industry) >= 0) return { key: 'industry', rel: isTopic ? 0.6 : 0.7 };
    return { key: 'weak', rel: isTopic ? 0.25 : 0.35 };
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

  // Capitals are allowed for trademarks and acronyms (YETI, IKEA, HVAC) but not for emphasis ("FREE", "BUY NOW").
  var EMPHASIS = ['FREE', 'SALE', 'BEST', 'SHOP', 'DEAL', 'DEALS', 'SAVE', 'HURRY', 'TODAY', 'LIMITED', 'OFFER', 'CHEAP', 'CLICK', 'CALL', 'ORDER', 'GUARANTEED', 'AMAZING', 'HUGE', 'BONUS', 'EXCLUSIVE', 'NOW', 'NEW', 'BUY', 'OFF', 'WIN'];
  var brandCaps = [];
  function setBrand(name) { brandCaps = (String(name || '').match(/[A-Za-z0-9]+/g) || []).map(function (w) { return w.toUpperCase(); }); }
  function excessiveCaps(text) {
    var words = (String(text || '').match(/\b[A-Z]{3,}\b/g) || []).filter(function (w) { return brandCaps.indexOf(w) < 0; });
    var loud = words.filter(function (w) { return EMPHASIS.indexOf(w) >= 0; });
    if (loud.length) return loud[0];
    var long = words.filter(function (w) { return w.length >= 4; });
    return long.length >= 2 ? long[0] + ' ' + long[1] : '';
  }

  function policyIssues(text, kind) {
    var issues = [];
    if (!text) return issues;
    if (kind === 'headline' && text.indexOf('!') >= 0) issues.push('Exclamation marks are not allowed in headlines');
    if (/([!?.])\1/.test(text)) issues.push('Repeated punctuation (e.g., "!!") is not allowed');
    var caps = excessiveCaps(text);
    if (caps) issues.push('Excessive capitalization ("' + caps + '"): capitals are fine for brand names and acronyms, not for emphasis');
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
    var serves = headlines.length >= 1 && descriptions.length >= 1;
    if (!valid) issues.unshift('A responsive search ad needs at least 3 headlines and 2 descriptions');
    var label = valid ? strengthLabel(pts, 9.5) : 'Incomplete';
    return {
      valid: valid, serves: serves, points: pts, max: 9.5, label: label, headlines: headlines, descriptions: descriptions,
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
    var serves = !!(headlines.length || lh) && !!(descriptions.length || lh);
    if (!valid) issues.unshift('A responsive display ad needs at least 1 headline, a long headline, 1 description, a business name and a final URL');
    // Formats: without images the ad can only serve as text/native formats
    var formatReach = 0.45 + (ad.landscapeImage ? 0.3 : 0) + (ad.squareImage ? 0.25 : 0);
    return {
      valid: valid, serves: serves, points: pts, max: 9, label: valid ? strengthLabel(pts, 9) : 'Incomplete',
      headlines: headlines, descriptions: descriptions, longHeadline: lh, issues: issues, policy: policy, formatReach: formatReach
    };
  }

  // ABCD creative score (0..1) and per-letter breakdown for a video ad
  function videoCreative(ad) {
    var parts = D.ABCD.map(function (g) {
      var have = g.items.filter(function (it) { return !!ad[it[0]]; }).length;
      return { key: g.key, name: g.name, have: have, total: g.items.length, score: have / g.items.length };
    });
    // Attract and Brand matter most for view rate and recall
    var w = { A: 0.32, B: 0.28, C: 0.2, D: 0.2 };
    var score = U.sum(parts, function (p) { return p.score * w[p.key]; });
    return { score: score, parts: parts };
  }

  // Video campaign subtype (older saves stored only a format)
  function videoSubtype(c) {
    if (c.videoSubtype && D.VIDEO_SUBTYPES[c.videoSubtype]) return c.videoSubtype;
    return c.videoFormat === 'nonskip' || c.videoFormat === 'bumper' ? 'nonskipReach' : 'views';
  }

  // Can this ad run as this format? (Google picks formats by video length.)
  function videoFits(ad, format) {
    var len = Number(ad.length) || 30;
    var f = D.VIDEO_FORMATS[format];
    return !f.maxLen || len <= f.maxLen;
  }

  // kind: a subtype key ("views") or a single format key ("bumper")
  function videoAdCheck(ad, kind, surfaces) {
    var sub = D.VIDEO_SUBTYPES[kind];
    var formats = sub ? Object.keys(sub.formats) : [kind in D.VIDEO_FORMATS ? kind : 'skippable'];
    var fits = formats.filter(function (f) { return videoFits(ad, f); });
    var errors = [];
    var issues = [];
    var len = Number(ad.length) || 30;
    if (!fits.length) {
      var maxLen = Math.max.apply(null, formats.map(function (f) { return D.VIDEO_FORMATS[f].maxLen || 999; }));
      errors.push((sub ? sub.name : D.VIDEO_FORMATS[formats[0]].name) + ' needs a video of ' + maxLen + ' seconds or less (yours: ' + len + 's)');
    }
    var audio = formats.length === 1 && formats[0] === 'audio';
    var cr = videoCreative(ad);
    D.ABCD.forEach(function (g) {
      g.items.forEach(function (it) {
        if (ad[it[0]] || (it[0] === 'headline' && fits.length === 1 && fits[0] === 'bumper')) return;
        if (audio && ['pacing', 'people', 'productDemo', 'captions'].indexOf(it[0]) >= 0) return;
        issues.push(g.name + ': ' + it[1].toLowerCase());
      });
    });
    if (audio && !ad.brandAudio) issues.unshift('Audio ads are heard, not seen: say the brand name in the voiceover');
    var onShorts = fits.indexOf('shorts') >= 0 && (!surfaces || surfaces.indexOf('shorts') >= 0);
    if (onShorts && ad.aspect !== '9:16') issues.push('Shorts: use vertical 9:16 video, or horizontal video shows small with black bars');
    if (fits.indexOf('skippable') >= 0 && len > 180) issues.push('Skippable ads over 3 minutes lose most viewers: aim for 15–60 seconds');
    if (fits.indexOf('bumper') < 0 && formats.indexOf('bumper') >= 0 && fits.length) issues.push('A 6-second cut would also let this run as a bumper ad');
    if (!ad.companion && (fits.indexOf('skippable') >= 0 || fits.indexOf('nonskip') >= 0)) issues.push('Add a companion banner (desktop)');
    if (fits.indexOf('infeed') >= 0 && !ad.description) issues.push('In-feed ads show a description line: add one');
    var lenScore = fits.indexOf('skippable') >= 0 ? (len >= 12 && len <= 60 ? 1 : len <= 180 ? 0.6 : 0.2) : 1;
    var crScore = audio ? (ad.brandAudio ? 0.5 : 0) + (ad.hook ? 0.25 : 0) + (ad.cta || ad.endCard ? 0.25 : 0) : cr.score;
    var pts = crScore * 8 + lenScore * 1.5 + (ad.companion ? 0.5 : 0);
    return { valid: errors.length === 0, errors: errors, issues: issues, points: pts, max: 10, creative: { score: crScore, parts: cr.parts }, formats: fits, label: errors.length ? 'Not eligible' : strengthLabel(pts, 10) };
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
  // Quick start (demo business data or the business description)
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

  // Product/service phrases from the business description as starter keyword ideas:
  // "Florist offering same-day flower delivery and wedding bouquets" -> same-day flower delivery, wedding bouquets.
  var FILLER = new Set(('made make makes brand brands company companies business businesses items item things stuff collection offering offer offers provide provides providing including include includes specializing specialize ' +
    'based located serving serve serves selling sell sells handling family owned since all every plus also like such etc ' +
    'into over than more most very just only you we our us their its your fast easy great fresh').split(' '));

  function descriptionPhrases(text) {
    var out = [];
    String(text || '').toLowerCase().split(/[.,;:!?()\n]+/).forEach(function (chunk) {
      var seg = [];
      function flush() {
        // drop repeated words ("boy brow brow gel"); long runs keep their last two words, the head noun phrase
        var dedup = seg.filter(function (w, i) { return seg.lastIndexOf(w) === i; });
        var cut = dedup.length < seg.length || dedup.length >= 4 ? dedup.slice(-2) : dedup;
        if (cut.length >= 2) {
          var p = cut.join(' ');
          if (out.indexOf(p) < 0) out.push(p);
        }
        seg = [];
      }
      U.words(chunk).forEach(function (w) {
        if (U.STOPWORDS.has(w) || FILLER.has(w) || w.length < 3 || /\d/.test(w)) flush();
        else seg.push(w);
      });
      flush();
    });
    return out.slice(0, 9);
  }

  function scanKeywords(state) {
    var scan = state.scan || {};
    var ks = (scan.keywords || []).slice();
    (scan.topTerms || []).forEach(function (t) { if (ks.indexOf(t) < 0) ks.push(t); });
    if (!ks.length) ks = descriptionPhrases(state.account.description);
    if (!ks.length) {
      var ind = D.INDUSTRIES[state.account.industry];
      ks = ind ? ind.vocab.split(' ').slice(0, 6) : [];
    }
    return ks.filter(function (k) { return k && k.length > 2; }).slice(0, 12);
  }

  // A short topic for the business ("coffee beans", "car accident"), used to name sample
  // YouTube channels and the content videos in ad mock-ups.
  function contentTopic(state) {
    var k = scanKeywords(state)[0] || '';
    return k || (D.INDUSTRIES[state.account.industry] || D.INDUSTRIES.retail).vocab.split(' ')[0];
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
    s.decisions = s.decisions || {};
    // Google Shopping was removed from the simulator
    s.campaigns = s.campaigns.filter(function (c) { return c.type !== 'shopping'; });
    if (typeof s.seed !== 'number') s.seed = base.seed;
    s.campaigns.forEach(function (c) {
      if (c.type === 'video') {
        if (!c.videoSurfaces) c.videoSurfaces = Object.keys(D.YT_SURFACES);
        if (!c.videoSubtype) c.videoSubtype = videoSubtype(c);
        if (!c.freqGoal) c.freqGoal = 2;
        if (!c.inventory) c.inventory = 'standard';
      }
    });
    return s;
  }

  // ---------------------------------------------------------------------------
  // ChatGPT ads helpers
  // ---------------------------------------------------------------------------

  function chatHints(g) {
    return String(g.hintsText || '').split(/\n/).map(function (h) { return h.trim(); }).filter(Boolean).slice(0, D.CHATGPT.maxHints);
  }

  // How useful a context hint is: relevant to what you sell, and specific enough to describe a conversation.
  function hintQuality(hint, vocab) {
    var n = U.words(hint).length;
    var spec = n <= 1 ? 0.3 : n <= 3 ? 0.65 : n <= 14 ? 1 : 0.8;
    // a hint is natural language: one strong match ("makeup" in "natural everyday makeup routine") makes it relevant
    var toks = U.contentTokens(hint);
    var best = toks.reduce(function (m, t) { return Math.max(m, vocab.get(t) || 0); }, 0);
    var rel = toks.length ? U.clamp(0.6 * best + 0.4 * relevance(hint, vocab), 0, 1) : 0.35;
    return { hint: hint, words: n, specificity: spec, relevance: rel, score: spec * (0.25 + 0.75 * rel), label: n <= 1 ? 'Too vague' : rel < 0.4 ? 'Off-topic' : n <= 3 ? 'Broad' : 'Specific' };
  }

  // Simulated ad review against ChatGPT ad policies
  function chatAdReview(ad, state, g) {
    var C = D.CHATGPT;
    var reasons = [];
    var title = (ad.title || '').trim(), body = (ad.body || '').trim();
    if (title.length < 3 || title.length > C.titleMax) reasons.push('Title must be 3–' + C.titleMax + ' characters');
    if (body.length > C.bodyMax) reasons.push('Body must be ' + C.bodyMax + ' characters or fewer');
    if (!body) reasons.push('Add body copy');
    if (!(ad.url || (g && g.defaultUrl) || state.account.website)) reasons.push('Add a destination URL');
    var text = title + ' ' + body;
    C.prohibited.forEach(function (r) { if (r[0].test(text) && reasons.indexOf(r[1]) < 0) reasons.push(r[1]); });
    setBrand(state.account.businessName);
    var caps = excessiveCaps(text);
    if (caps) reasons.push('Excessive capitalization ("' + caps + '"): capitals are fine for brand names and acronyms, not for emphasis');
    var restricted = C.restricted[state.account.industry];
    var status = reasons.length ? 'Rejected' : restricted ? 'Approved (restricted)' : 'Approved';
    var tips = [];
    if (title && (title.length < C.titleRec[0] || title.length > C.titleRec[1])) tips.push('Titles of ' + C.titleRec[0] + '–' + C.titleRec[1] + ' characters work best (yours: ' + title.length + ')');
    if (body && (body.length < C.bodyRec[0] || body.length > C.bodyRec[1])) tips.push('Body copy of ' + C.bodyRec[0] + '–' + C.bodyRec[1] + ' characters works best (yours: ' + body.length + ')');
    if (!ad.image) tips.push('Add a square image (cards with images stand out)');
    return { status: status, reasons: reasons, tips: tips, restricted: restricted ? restricted + ' is a restricted category: approved advertisers only, and ads stay away from sensitive conversations' : '' };
  }

  AdSim.model = {
    newChatAd: newChatAd, setBrand: setBrand, segmentFit: segmentFit, excessiveCaps: excessiveCaps, chatHints: chatHints, hintQuality: hintQuality, chatAdReview: chatAdReview,
    newState: newState, newCampaign: newCampaign, newAdGroup: newAdGroup, newRSA: newRSA, newRDA: newRDA,
    newVideoAd: newVideoAd, newProduct: newProduct, newTargeting: newTargeting, businessVocab: businessVocab,
    relevance: relevance, intentOf: intentOf, policyIssues: policyIssues, rsaStrength: rsaStrength,
    rdaStrength: rdaStrength, videoAdCheck: videoAdCheck, videoCreative: videoCreative, videoSubtype: videoSubtype, videoFits: videoFits, feedQuality: feedQuality, quickStartSearch: quickStartSearch, contentTopic: contentTopic,
    applyTemplate: applyTemplate, adGroupKeywords: adGroupKeywords,
    campaignNegatives: campaignNegatives, absoluteUrl: absoluteUrl, keywordTokenCoverage: keywordTokenCoverage,
    hasCTA: hasCTA, migrate: migrate, fit: fit, STRENGTH_LABELS: STRENGTH_LABELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
