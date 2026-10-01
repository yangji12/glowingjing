/* Digital Ad Lab: YouTube ad mock-ups in context (watch pages, feeds, search, Shorts, TV screens, partners).
 * These are illustrative teaching/research stimuli with neutral branding; they are not official renderings. */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});
  var U = AdSim.util;
  var M = AdSim.model;
  var P = AdSim.previews;
  var D = AdSim.data;
  var esc = P.esc;

  // Which contexts each format can appear in (filtered by the campaign's placements).
  var CONTEXTS = {
    watchDesktop: { label: 'Watch page · desktop', surface: 'instream', device: 'desktop', w: 1280, h: 800, formats: ['skippable', 'nonskip', 'bumper'] },
    watchMobile: { label: 'Watch page · mobile', surface: 'instream', device: 'mobile', w: 390, h: 844, formats: ['skippable', 'nonskip', 'bumper'] },
    ctv: { label: 'TV screen', surface: 'ctv', device: 'tv', w: 1280, h: 760, formats: ['skippable', 'nonskip', 'bumper'] },
    partner: { label: 'Video partner site', surface: 'partners', device: 'desktop', w: 1280, h: 800, formats: ['skippable', 'nonskip', 'bumper', 'infeed'] },
    homeFeed: { label: 'Home feed · desktop', surface: 'feed', device: 'desktop', w: 1280, h: 800, formats: ['infeed'] },
    watchNext: { label: 'Watch Next · desktop', surface: 'feed', device: 'desktop', w: 1280, h: 800, formats: ['infeed'] },
    homeMobile: { label: 'Home feed · mobile', surface: 'feed', device: 'mobile', w: 390, h: 844, formats: ['infeed'] },
    search: { label: 'YouTube search results', surface: 'search', device: 'desktop', w: 1280, h: 800, formats: ['infeed'] },
    shorts: { label: 'Shorts feed', surface: 'shorts', device: 'mobile', w: 390, h: 844, formats: ['shorts', 'skippable', 'bumper'] }
  };

  function contextsFor(format, surfaces) {
    var on = surfaces && surfaces.length ? surfaces : Object.keys(D.YT_SURFACES);
    return Object.keys(CONTEXTS).filter(function (id) {
      var cx = CONTEXTS[id];
      return cx.formats.indexOf(format) >= 0 && on.indexOf(cx.surface) >= 0;
    });
  }

  function topicInfo(state) {
    var t = M.contentTopic(state) || 'video';
    var T = t.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return {
      topic: t,
      titles: ['The ultimate beginner\'s guide to ' + t, T + ' tips nobody tells you', 'I tried ' + t + ' for 30 days', 'Is this the best ' + t + '? Honest review',
        '10 ' + t + ' mistakes to avoid', T + ' explained in 8 minutes', 'Day in the life: ' + t + ' edition', 'Testing viral ' + t + ' hacks'],
      channels: [T + ' Lab', 'Daily ' + T, 'The ' + T + ' Show', 'Weekend Reviews', 'Simple Living', 'Explained Simply', 'Real Talk', 'Trending Now'],
      query: t
    };
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }

  function shade(i) {
    var tones = ['#5f6b7a', '#7a6a5f', '#5f7a6b', '#6b5f7a', '#7a5f68', '#5f747a', '#73705c', '#666c80'];
    return tones[i % tones.length];
  }

  function contentThumb(i, title, w, h) {
    return P.placeholder(shade(i), title.split(' ').slice(0, 2).join(' '), w, h, 'c' + i + title);
  }

  // The ad's own artwork: uploaded thumbnail, else generated brand art with the headline.
  function adArt(ad, acc, vertical) {
    var src = vertical ? (ad.verticalThumb || ad.thumbnail) : ad.thumbnail;
    var label = ad.headline || acc.businessName || 'Your video';
    var ph = vertical ? P.placeholder(acc.brandColor, label, 360, 640, 'v' + label) : P.placeholder(acc.brandColor, label, 640, 360, 'h' + label);
    var s = P.safeUrl(src);
    return s || ph;
  }

  function media(ad, acc, o, vertical) {
    if (o.videoSrc) return '<video class="ytm-media" src="' + esc(o.videoSrc) + '" muted autoplay loop playsinline></video>';
    return '<img class="ytm-media" src="' + esc(adArt(ad, acc, vertical)) + '" alt="">';
  }

  function avatar(acc, cls) {
    var logo = P.safeUrl(acc.logoUrl);
    return logo ? '<img class="' + (cls || 'ytm-av') + '" src="' + esc(logo) + '" alt="">' : '<span class="' + (cls || 'ytm-av') + '" style="background:' + esc(acc.brandColor || '#1a73e8') + '">' + esc((acc.businessName || 'A')[0].toUpperCase()) + '</span>';
  }

  function skipButton(format, o) {
    if (format !== 'skippable') return '';
    if (o.skipState === 'skippable') return '<span class="ytm-skip ready">Skip ▸|</span>';
    return '<span class="ytm-skip" data-skip="' + (o.skipState === 'counting' ? 'static' : 'live') + '">Skip in <b>5</b></span>';
  }

  // The in-stream player with ad overlays.
  function player(ad, acc, format, o, size) {
    var domain = U.domainOf(ad.finalUrl || acc.website) || 'example.com';
    var len = Number(ad.length) || 30;
    var adLen = format === 'bumper' ? Math.min(len, 6) : format === 'nonskip' ? Math.min(len, 15) : len;
    var vertical = ad.aspect === '9:16';
    var name = acc.businessName || 'Advertiser';
    return '<div class="ytm-player ' + (size || '') + (vertical ? ' pillar' : '') + '">' + media(ad, acc, o, vertical) +
      '<div class="ytm-top"><span class="ytm-badge">Sponsored</span> · ' + esc(domain) + '</div>' +
      (size === 'tv' ? '' : '<div class="ytm-card">' + avatar(acc) + '<div class="ytm-card-text"><b>' + esc(ad.headline || name) + '</b><span>' + esc(domain) + '</span></div><span class="ytm-cta">' + esc(ad.cta || 'Learn more') + '</span></div>') +
      skipButton(format, o) +
      '<div class="ytm-bar"><span style="width:' + (o.skipState === 'skippable' ? 35 : 12) + '%"></span></div>' +
      '<div class="ytm-time">Ad · ' + (o.skipState === 'skippable' ? '0:06' : '0:02') + ' / ' + fmtTime(adLen) + (size === 'tv' ? ' · ' + esc(name) : '') + '</div></div>';
  }

  function header(device, query) {
    if (device === 'mobile') return '<div class="ytm-mhead"><span class="ytm-logo">▶</span><span class="ytm-mhead-icons">🔍 ⋮</span></div>';
    return '<div class="ytm-head"><span class="ytm-menu">☰</span><span class="ytm-logo">▶</span><div class="ytm-search">' + esc(query || 'Search') + '<span>🔍</span></div><span class="ytm-head-right">＋ 🔔 ●</span></div>';
  }

  function feedCard(i, t, ti, small) {
    var title = t.titles[ti % t.titles.length];
    return '<div class="ytm-vcard' + (small ? ' small' : '') + '"><div class="ytm-thumb"><img src="' + esc(contentThumb(ti, title, 320, 180)) + '" alt=""><span class="ytm-dur">' + (8 + (ti * 3) % 14) + ':' + ('0' + (ti * 17) % 60).slice(-2) + '</span></div>' +
      '<div class="ytm-vmeta"><b>' + esc(title) + '</b><span>' + esc(t.channels[ti % t.channels.length]) + '</span><span>' + (12 + ti * 37) % 900 + 'K views · ' + (ti % 6 + 1) + ' days ago</span></div></div>';
  }

  function infeedAd(ad, acc, o, layout) {
    var name = acc.businessName || 'Advertiser';
    var len = Number(ad.length) || 30;
    var thumb = o.videoSrc ? '<video src="' + esc(o.videoSrc) + '" muted autoplay loop playsinline></video>' : '<img src="' + esc(adArt(ad, acc, false)) + '" alt="">';
    return '<div class="ytm-vcard ad ' + (layout || '') + '"><div class="ytm-thumb">' + thumb + '<span class="ytm-dur">' + fmtTime(len) + '</span></div>' +
      '<div class="ytm-vmeta"><b>' + esc(ad.headline || 'Your video headline') + '</b>' + (layout === 'row' ? '<span class="ytm-desc">' + esc(ad.description || 'Your description line appears here.') + '</span>' : '') +
      '<span><span class="ytm-badge dark">Sponsored</span> ' + esc(name) + '</span>' + (layout === 'row' || layout === 'grid' ? '<span class="ytm-cta outline">' + esc(ad.cta || 'Learn more') + '</span>' : '') + '</div></div>';
  }

  function companion(ad, acc) {
    var domain = U.domainOf(ad.finalUrl || acc.website) || 'example.com';
    return '<div class="ytm-companion">' + avatar(acc) + '<div class="ytm-card-text"><b>' + esc(ad.longHeadline || ad.headline || acc.businessName || '') + '</b><span>' + esc(domain) + '</span></div><span class="ytm-cta">' + esc(ad.cta || 'Learn more') + '</span></div>';
  }

  function channelRow(t, i) {
    return '<div class="ytm-chan"><span class="ytm-av" style="background:' + shade(i + 3) + '">' + esc(t.channels[i][0]) + '</span><div><b>' + esc(t.channels[i]) + '</b><span>' + (120 + i * 87) + 'K subscribers</span></div><span class="ytm-sub">Subscribe</span><span class="ytm-actions">👍 1.2K &nbsp; ↗ Share &nbsp; ⋯</span></div>';
  }

  // ---------------------------------------------------------------------------
  // Contexts
  // ---------------------------------------------------------------------------

  var R = {};

  R.watchDesktop = function (ad, acc, format, o, t) {
    return header('desktop', t.query) + '<div class="ytm-watch"><div class="ytm-main">' + player(ad, acc, format, o) +
      '<h2 class="ytm-title">' + esc(t.titles[0]) + '</h2>' + channelRow(t, 0) + '<div class="ytm-descbox">' + (40 + t.titles[0].length * 3) + 'K views · 3 days ago<br>In this video we cover everything you need to know about ' + esc(t.topic) + '.</div></div>' +
      '<div class="ytm-side">' + (ad.companion && format !== 'bumper' ? companion(ad, acc) : '') + [1, 2, 3, 4, 5, 6].map(function (i) { return feedCard(0, t, i, true); }).join('') + '</div></div>';
  };

  R.watchMobile = function (ad, acc, format, o, t) {
    var domain = U.domainOf(ad.finalUrl || acc.website) || 'example.com';
    return header('mobile') + player(ad, acc, format, o, 'mobile') +
      '<div class="ytm-mcta">' + avatar(acc) + '<div class="ytm-card-text"><b>' + esc(ad.headline || acc.businessName || '') + '</b><span><span class="ytm-badge dark">Sponsored</span> ' + esc(domain) + '</span></div><span class="ytm-cta">' + esc(ad.cta || 'Learn more') + '</span></div>' +
      '<div class="ytm-mbody"><h2 class="ytm-title small">' + esc(t.titles[0]) + '</h2>' + channelRow(t, 0) + [1, 2].map(function (i) { return feedCard(0, t, i); }).join('') + '</div>';
  };

  R.ctv = function (ad, acc, format, o) {
    var domain = U.domainOf(ad.finalUrl || acc.website) || 'example.com';
    return '<div class="ytm-tv"><div class="ytm-tv-screen">' + player(ad, acc, format, o, 'tv') +
      '<div class="ytm-tv-info">' + avatar(acc) + '<div><b>' + esc(ad.headline || acc.businessName || '') + '</b><span>' + esc(domain) + '</span></div></div></div><div class="ytm-tv-stand"></div></div>';
  };

  R.partner = function (ad, acc, format, o, t) {
    var bars = '<div class="ytm-lines"><i></i><i></i><i class="s"></i><i></i><i class="s"></i></div>';
    return '<div class="ytm-site"><div class="ytm-site-head"><b>THE DAILY BRIEF</b><span>News · Lifestyle · Tech · Sports</span></div><div class="ytm-article"><h1>What the latest ' + esc(t.topic) + ' trend means for you</h1><p class="ytm-byline">By Staff Writer · 4 min read</p>' +
      bars + (format === 'infeed' ? infeedAd(ad, acc, o, 'row') : '<div class="ytm-embed">' + player(ad, acc, format, o) + '</div>') + bars + bars + '</div></div>';
  };

  R.homeFeed = function (ad, acc, format, o, t) {
    var chips = ['All', t.topic, 'Music', 'Live', 'Gaming', 'News', 'Recently uploaded'];
    var cards = [infeedAd(ad, acc, o, 'grid')];
    for (var i = 1; i < 6; i++) cards.push(feedCard(0, t, i));
    return header('desktop') + '<div class="ytm-chips">' + chips.map(function (c, i) { return '<span class="' + (i === 0 ? 'on' : '') + '">' + esc(c) + '</span>'; }).join('') + '</div><div class="ytm-grid">' + cards.join('') + '</div>';
  };

  R.watchNext = function (ad, acc, format, o, t) {
    return header('desktop', t.query) + '<div class="ytm-watch"><div class="ytm-main"><div class="ytm-player"><img class="ytm-media" src="' + esc(contentThumb(0, t.titles[0], 640, 360)) + '" alt=""><div class="ytm-bar"><span style="width:41%"></span></div></div>' +
      '<h2 class="ytm-title">' + esc(t.titles[0]) + '</h2>' + channelRow(t, 0) + '</div><div class="ytm-side">' + infeedAd(ad, acc, o, 'side') + [1, 2, 3, 4, 5].map(function (i) { return feedCard(0, t, i, true); }).join('') + '</div></div>';
  };

  R.homeMobile = function (ad, acc, format, o, t) {
    return header('mobile') + '<div class="ytm-mbody">' + infeedAd(ad, acc, o, 'mobile') + [1, 2].map(function (i) { return feedCard(0, t, i); }).join('') + '</div>';
  };

  R.search = function (ad, acc, format, o, t) {
    var rows = [infeedAd(ad, acc, o, 'row')];
    for (var i = 1; i < 4; i++) rows.push(feedCard(0, t, i).replace('ytm-vcard', 'ytm-vcard row'));
    return header('desktop', t.query) + '<div class="ytm-results">' + rows.join('') + '</div>';
  };

  R.shorts = function (ad, acc, format, o) {
    var vertical = ad.aspect === '9:16';
    var name = acc.businessName || 'Advertiser';
    return '<div class="ytm-shorts' + (vertical ? '' : ' letterbox') + '">' + media(ad, acc, o, vertical) +
      '<div class="ytm-rail"><span>👍<small>Like</small></span><span>👎<small>Dislike</small></span><span>💬<small>0</small></span><span>↗<small>Share</small></span></div>' +
      '<div class="ytm-shorts-ui"><div class="ytm-shorts-meta">' + avatar(acc) + '<b>' + esc(name) + '</b><span class="ytm-badge">Sponsored</span></div><div class="ytm-shorts-title">' + esc(ad.headline || 'Your headline') + '</div><span class="ytm-cta wide">' + esc(ad.cta || 'Learn more') + '</span></div>' +
      (format === 'skippable' ? '<div class="ytm-shorts-skip">' + skipButton(format, o) + '</div>' : '') + '</div>';
  };

  function render(id, ad, acc, format, state, o) {
    o = o || {};
    var cx = CONTEXTS[id];
    var t = topicInfo(state);
    var inner = R[id](ad || {}, acc || {}, format, o, t);
    var frame = cx.device === 'mobile' ? 'phone' : cx.device === 'tv' ? 'tv' : 'desktop';
    return '<div class="ytm ytm-' + frame + '" style="width:' + cx.w + 'px;height:' + cx.h + 'px">' + inner + '</div>';
  }

  // A scaled-down, live-updating preview card for the editor and previews page.
  function thumbnail(id, ad, acc, format, state, o, maxW) {
    var cx = CONTEXTS[id];
    var scale = Math.min(1, (maxW || 520) / cx.w, cx.device === 'mobile' ? 0.62 : 1);
    return '<figure class="ytm-fig"><figcaption>' + esc(cx.label) + ' · ' + esc(D.YT_SURFACES[cx.surface].short) + '</figcaption><div class="ytm-scale" style="width:' + Math.round(cx.w * scale) + 'px;height:' + Math.round(cx.h * scale) + 'px"><div style="transform:scale(' + scale.toFixed(4) + ');transform-origin:0 0">' +
      render(id, ad, acc, format, state, o) + '</div></div></figure>';
  }

  AdSim.youtube = { CONTEXTS: CONTEXTS, contextsFor: contextsFor, render: render, thumbnail: thumbnail };
})(typeof window !== 'undefined' ? window : globalThis);
