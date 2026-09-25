/* AdSim ad previews: Search results, responsive Display, YouTube and Shopping.
 * Previews are illustrative mockups for teaching; they are not official ad renderings. */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});
  var U = AdSim.util;
  var M = AdSim.model;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(u) {
    u = String(u || '').trim();
    return /^(https?:\/\/|data:image\/)/i.test(u) ? u : '';
  }

  function initial(name) {
    return esc((String(name || '?').trim()[0] || '?').toUpperCase());
  }

  // Generated placeholder artwork (SVG data URI) in the brand color
  function placeholder(color, label, w, h, seed) {
    color = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#1a73e8';
    var r = U.rng(U.hash(String(seed || label)));
    var shapes = '';
    for (var i = 0; i < 5; i++) {
      shapes += '<circle cx="' + Math.round(r() * w) + '" cy="' + Math.round(r() * h) + '" r="' + Math.round(20 + r() * Math.min(w, h) * 0.45) + '" fill="#fff" fill-opacity="' + (0.06 + r() * 0.12).toFixed(2) + '"/>';
    }
    var txt = String(label || '').slice(0, 18).replace(/[<&>"]/g, '');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + color + '"/><stop offset="1" stop-color="' + color + '" stop-opacity="0.65"/></linearGradient></defs>' +
      '<rect width="100%" height="100%" fill="url(#g)"/>' + shapes +
      '<text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="' + Math.max(10, Math.round(Math.min(Math.min(w, h) / 7, w * 1.5 / Math.max(txt.length, 1)))) + '" fill="#fff" fill-opacity="0.92">' + txt + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function img(src, fallback, cls, alt) {
    var s = safeUrl(src) || fallback;
    return '<img class="' + (cls || '') + '" src="' + esc(s) + '" alt="' + esc(alt || '') + '" data-fallback="' + esc(fallback) + '" loading="lazy">';
  }

  function pickRotating(list, n, combo) {
    if (!list.length) return [];
    var out = [];
    for (var i = 0; i < Math.min(n, list.length); i++) out.push(list[(combo + i * (combo % 3 + 1)) % list.length]);
    return U.uniq(out);
  }

  function displayUrl(ad, account) {
    var d = U.domainOf(ad.finalUrl || account.website) || 'example.com';
    var p = [ad.path1, ad.path2].filter(Boolean).map(function (x) { return String(x).slice(0, 15); });
    return 'https://www.' + d + (p.length ? ' › ' + p.join(' › ') : '');
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  function searchAd(opts) {
    var ad = opts.ad || {};
    var acc = opts.account || {};
    var c = opts.campaign || {};
    var combo = opts.combo || 0;
    var mobile = opts.device === 'mobile';
    var s = M.rsaStrength(ad, opts.keywords || []);
    var hs = s.headlines.length ? pickRotating(s.headlines, 3, combo) : ['Your headline 1', 'Your headline 2', 'Your headline 3'];
    var ds = s.descriptions.length ? pickRotating(s.descriptions, 2, combo) : ['Your description appears here. Add descriptions to see them.'];
    var assets = c.assets || {};
    var callouts = String(assets.callouts || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 4);
    var sitelinks = (assets.sitelinks || []).filter(function (x) { return x.text; }).slice(0, mobile ? 4 : 4);
    var snippetVals = String(assets.snippetValues || '').split(/\n|,/).map(function (x) { return x.trim(); }).filter(Boolean);
    var name = acc.businessName || U.domainOf(acc.website) || 'Your Business';
    var html = '<div class="serp-ad' + (mobile ? ' mobile' : '') + '">' +
      '<div class="serp-sponsored">Sponsored</div>' +
      '<div class="serp-source"><span class="serp-favicon" style="background:' + esc(acc.brandColor || '#1a73e8') + '">' + initial(name) + '</span>' +
      '<div><div class="serp-name">' + esc(name) + '</div><div class="serp-url">' + esc(displayUrl(ad, acc)) + '</div></div></div>' +
      '<a class="serp-headline" tabindex="-1">' + hs.map(esc).join(mobile ? ' - ' : ' | ') + '</a>' +
      '<div class="serp-desc">' + esc(ds.join(' ')) + (callouts.length ? ' <span class="serp-callouts">' + callouts.map(esc).join(' · ') + '</span>' : '') + '</div>';
    if (snippetVals.length >= 3) html += '<div class="serp-desc serp-snippet">' + esc(assets.snippetHeader || 'Types') + ': ' + snippetVals.slice(0, 4).map(esc).join(', ') + '</div>';
    if (sitelinks.length >= 2) {
      html += mobile
        ? '<div class="serp-sitelinks-chips">' + sitelinks.map(function (l) { return '<span>' + esc(l.text) + '</span>'; }).join('') + '</div>'
        : '<div class="serp-sitelinks">' + sitelinks.map(function (l) { return '<div><a tabindex="-1">' + esc(l.text) + '</a><div>' + esc([l.d1, l.d2].filter(Boolean).join(' ')) + '</div></div>'; }).join('') + '</div>';
    }
    if (assets.phone && mobile) html += '<div class="serp-call">📞 Call ' + esc(assets.phone) + '</div>';
    html += '</div>';
    return html;
  }

  function serpPage(opts) {
    var q = opts.query || 'your keyword';
    return '<div class="serp' + (opts.device === 'mobile' ? ' serp-mobile' : '') + '">' +
      '<div class="serp-search"><span class="serp-logo">Search</span><div class="serp-box">' + esc(q) + '<span>🔍</span></div></div>' +
      '<div class="serp-tabs"><span class="on">All</span><span>Images</span><span>Shopping</span><span>Maps</span><span>News</span></div>' +
      searchAd(opts) +
      '<div class="serp-organic"><div class="bar w40"></div><div class="bar w70 big"></div><div class="bar w90"></div><div class="bar w60"></div></div>' +
      '<div class="serp-organic"><div class="bar w30"></div><div class="bar w60 big"></div><div class="bar w80"></div></div>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // Display (responsive display ad rendered in several formats)
  // ---------------------------------------------------------------------------

  function displayAssets(ad, acc, combo) {
    var s = M.rdaStrength(ad);
    var name = ad.businessName || acc.businessName || 'Your Business';
    var color = ad.color || acc.brandColor || '#1a73e8';
    var hl = s.headlines.length ? s.headlines : ['Your short headline'];
    var ds = s.descriptions.length ? s.descriptions : ['Your description goes here.'];
    return {
      name: name, color: color,
      headline: hl[combo % hl.length],
      long: s.longHeadline || hl[(combo + 1) % hl.length],
      desc: ds[combo % ds.length],
      cta: ad.cta || 'Learn more',
      land: img(ad.landscapeImage, placeholder(color, name, 600, 314, name + 'L' + combo), 'ph', name),
      square: img(ad.squareImage || ad.landscapeImage, placeholder(color, name, 300, 300, name + 'S' + combo), 'ph', name),
      logo: safeUrl(ad.logoUrl || acc.logoUrl) ? img(ad.logoUrl || acc.logoUrl, placeholder(color, name[0], 64, 64, 'logo'), 'logo', name + ' logo') : '<span class="logo-ph" style="background:' + esc(color) + '">' + initial(name) + '</span>',
      domain: U.domainOf(ad.finalUrl || acc.website)
    };
  }

  function adChoices() {
    return '<span class="adchoices" title="Ad">▷ ✕</span>';
  }

  function displayFormats(ad, acc, combo) {
    var a = displayAssets(ad, acc, combo || 0);
    var cta = '<span class="d-cta" style="background:' + esc(a.color) + '">' + esc(a.cta) + '</span>';
    var fmts = [];
    fmts.push({ label: 'Medium rectangle 300×250', html: '<div class="dsp d300x250">' + adChoices() + '<div class="d-img">' + a.land + '</div><div class="d-body"><div class="d-head">' + esc(a.headline) + '</div><div class="d-desc">' + esc(a.desc) + '</div><div class="d-foot">' + a.logo + '<span class="d-name">' + esc(a.name) + '</span>' + cta + '</div></div></div>' });
    fmts.push({ label: 'Leaderboard 728×90', html: '<div class="dsp d728x90">' + adChoices() + '<div class="d-sq">' + a.square + '</div><div class="d-body"><div class="d-head">' + esc(a.long) + '</div><div class="d-desc">' + esc(a.name) + '</div></div>' + cta + '</div>' });
    fmts.push({ label: 'Mobile banner 320×50', html: '<div class="dsp d320x50">' + adChoices() + a.logo + '<div class="d-body"><div class="d-head">' + esc(a.headline) + '</div></div><span class="d-arrow" style="color:' + esc(a.color) + '">›</span></div>' });
    fmts.push({ label: 'Half page 300×600', html: '<div class="dsp d300x600">' + adChoices() + '<div class="d-top">' + a.logo + '<span class="d-name">' + esc(a.name) + '</span></div><div class="d-img">' + a.square + '</div><div class="d-body"><div class="d-head big">' + esc(a.long) + '</div><div class="d-desc">' + esc(a.desc) + '</div>' + cta + '</div></div>' });
    fmts.push({ label: 'Skyscraper 160×600', html: '<div class="dsp d160x600">' + adChoices() + a.logo + '<div class="d-head">' + esc(a.headline) + '</div><div class="d-img">' + a.square + '</div><div class="d-desc">' + esc(a.desc) + '</div>' + cta + '</div>' });
    fmts.push({ label: 'Native in-feed (news / Discover style)', html: '<div class="dsp dnative">' + '<div class="d-img">' + a.land + '</div><div class="d-body"><div class="d-meta">' + a.logo + '<span>' + esc(a.name) + '</span><span class="d-spons">· Sponsored</span></div><div class="d-head big">' + esc(a.long) + '</div><div class="d-desc">' + esc(a.desc) + '</div></div>' + cta + '</div>' });
    fmts.push({ label: 'Text-only (when no images fit)', html: '<div class="dsp dtext">' + adChoices() + '<div class="d-head big">' + esc(a.headline) + '</div><div class="d-desc">' + esc(a.desc) + '</div><div class="d-foot"><span class="d-name">' + esc(a.domain || a.name) + '</span>' + cta + '</div></div>' });
    return fmts;
  }

  function displayGallery(ad, acc, combo) {
    return '<div class="dsp-gallery">' + displayFormats(ad, acc, combo).map(function (f) {
      return '<figure><figcaption>' + esc(f.label) + '</figcaption>' + f.html + '</figure>';
    }).join('') + '</div>';
  }

  // ---------------------------------------------------------------------------
  // YouTube
  // ---------------------------------------------------------------------------

  function youtubeId(url) {
    var m = String(url || '').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  function videoThumb(ad, acc, w, h) {
    var id = youtubeId(ad.videoUrl);
    var ph = placeholder(acc.brandColor, acc.businessName || 'Video', w, h, 'vid' + (acc.businessName || ''));
    if (ad.thumbnail) return img(ad.thumbnail, ph, 'vthumb', 'Video thumbnail');
    if (id) return img('https://img.youtube.com/vi/' + id + '/hqdefault.jpg', ph, 'vthumb', 'Video thumbnail');
    return '<img class="vthumb" src="' + esc(ph) + '" alt="">';
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }

  function videoPreview(ad, format, acc) {
    ad = ad || {};
    acc = acc || {};
    var name = acc.businessName || 'Your Business';
    var domain = U.domainOf(ad.finalUrl || acc.website) || 'example.com';
    var len = Number(ad.length) || 30;
    var out = [];
    var ctaBtn = '<span class="yt-cta">' + esc(ad.cta || 'Learn more') + '</span>';
    if (format === 'shorts') {
      out.push({ label: 'YouTube Shorts (9:16)', html: '<div class="yt-shorts">' + videoThumb(ad, acc, 270, 480) + '<div class="yt-shorts-ui"><div class="yt-shorts-meta"><span class="logo-ph" style="background:' + esc(acc.brandColor || '#1a73e8') + '">' + initial(name) + '</span><b>' + esc(name) + '</b> <span class="yt-badge">Sponsored</span></div><div class="yt-shorts-title">' + esc(ad.headline || 'Your headline') + '</div>' + ctaBtn.replace('yt-cta', 'yt-cta wide') + '</div>' + (ad.aspect !== '9:16' ? '<div class="yt-warn">Not vertical — black bars shown</div>' : '') + '</div>' });
    } else if (format === 'infeed') {
      out.push({ label: 'In-feed video (search results / watch next)', html: '<div class="yt-infeed"><div class="yt-infeed-thumb">' + videoThumb(ad, acc, 320, 180) + '<span class="yt-dur">' + fmtTime(len) + '</span></div><div class="yt-infeed-body"><div class="yt-infeed-title">' + esc(ad.headline || 'Your video headline') + '</div><div class="yt-infeed-desc">' + esc(ad.description || 'Your description line.') + '</div><div class="yt-infeed-meta"><span class="yt-badge">Sponsored</span> ' + esc(name) + '</div></div></div>' });
    } else {
      var skip = format === 'skippable'
        ? '<span class="yt-skip">Skip <span class="yt-skip-count">5</span> ▸|</span>'
        : '';
      var label = format === 'bumper' ? 'Bumper ad (6s, non-skippable)' : format === 'nonskip' ? 'Non-skippable in-stream (≤15s)' : 'Skippable in-stream (skip after 5s)';
      var adLen = format === 'bumper' ? Math.min(len, 6) : format === 'nonskip' ? Math.min(len, 15) : len;
      out.push({
        label: label,
        html: '<div class="yt-player">' + videoThumb(ad, acc, 640, 360) +
          '<div class="yt-overlay-top"><span class="yt-badge">Sponsored</span> · ' + esc(domain) + '</div>' +
          '<div class="yt-card"><span class="logo-ph" style="background:' + esc(acc.brandColor || '#1a73e8') + '">' + initial(name) + '</span><div><b>' + esc(ad.headline || name) + '</b><div>' + esc(domain) + '</div></div>' + ctaBtn + '</div>' +
          skip + '<div class="yt-progress"><span></span></div><div class="yt-time">Ad · 0:0' + (format === 'skippable' ? '3' : '1') + ' / ' + fmtTime(adLen) + '</div></div>' +
          (ad.companion && format !== 'bumper' ? '<div class="yt-companion"><span class="logo-ph" style="background:' + esc(acc.brandColor || '#1a73e8') + '">' + initial(name) + '</span><div><b>' + esc(ad.longHeadline || ad.headline || name) + '</b><div>' + esc(domain) + '</div></div>' + ctaBtn + '</div>' : '')
      });
    }
    return out;
  }

  function videoGallery(ad, format, acc) {
    return '<div class="yt-gallery">' + videoPreview(ad, format, acc).map(function (f) {
      return '<figure><figcaption>' + esc(f.label) + '</figcaption>' + f.html + '</figure>';
    }).join('') + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Shopping
  // ---------------------------------------------------------------------------

  function shoppingCard(p, acc) {
    var name = acc.businessName || U.domainOf(acc.website) || 'Your Store';
    var title = String(p.title || '(missing title)');
    var shown = title.length > 70 ? title.slice(0, 67) + '…' : title;
    var sale = p.salePrice > 0 && p.salePrice < p.price;
    var price = sale ? p.salePrice : p.price;
    var r = U.rng(U.hash(p.id || title));
    var rating = (4 + r()).toFixed(1);
    var reviews = Math.round(20 + r() * 900);
    var fq = M.feedQuality(p);
    return '<div class="shop-card' + (fq.approved ? '' : ' disapproved') + '">' +
      '<div class="shop-img">' + img(p.imageUrl, placeholder(acc.brandColor, (p.category || title).split(' ')[0], 200, 200, title), 'ph', title) + (sale ? '<span class="shop-sale">Sale</span>' : '') + '</div>' +
      '<div class="shop-title" title="' + esc(title) + '">' + esc(shown) + '</div>' +
      '<div class="shop-price">$' + (Number(price) || 0).toFixed(2) + (sale ? ' <s>$' + Number(p.price).toFixed(2) + '</s>' : '') + '</div>' +
      '<div class="shop-store">' + esc(name) + '</div>' +
      '<div class="shop-rating">' + '★★★★★'.slice(0, Math.round(rating)) + ' <span>' + rating + ' (' + reviews + ')</span></div>' +
      (fq.approved ? '' : '<div class="shop-error">Disapproved: ' + esc(fq.errors[0]) + '</div>') +
      '</div>';
  }

  function shoppingCarousel(products, acc, query) {
    var list = (products || []).slice(0, 8);
    if (!list.length) return '<div class="empty">Add products to your feed to preview Shopping ads.</div>';
    var competitors = [
      { title: 'Competitor product listing', price: 0 },
      { title: 'Another store\'s listing', price: 0 }
    ];
    return '<div class="shop-wrap"><div class="shop-head">Sponsored · Shop ' + esc(query || '') + '</div><div class="shop-row">' +
      list.map(function (p) { return shoppingCard(p, acc); }).join('') +
      competitors.map(function (c) { return '<div class="shop-card ghost"><div class="shop-img"></div><div class="shop-title">' + esc(c.title) + '</div><div class="bar w40"></div><div class="bar w60"></div></div>'; }).join('') +
      '</div></div>';
  }

  AdSim.previews = {
    esc: esc, placeholder: placeholder, searchAd: searchAd, serpPage: serpPage, displayGallery: displayGallery,
    displayFormats: displayFormats, videoGallery: videoGallery, shoppingCarousel: shoppingCarousel, shoppingCard: shoppingCard,
    youtubeId: youtubeId, safeUrl: safeUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
