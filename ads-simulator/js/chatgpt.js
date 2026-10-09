/* Digital Ad Lab: ChatGPT ad mock-ups (sponsored card or product carousel below an answer).
 * Illustrative teaching/research stimuli with neutral branding; not an official rendering. */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});
  var U = AdSim.util;
  var M = AdSim.model;
  var P = AdSim.previews;
  var E = AdSim.engine;
  var esc = P.esc;

  var CONTEXTS = {
    desktop: { label: 'Chat answer · desktop', w: 1280, h: 800 },
    mobile: { label: 'Chat answer · mobile', w: 390, h: 844 }
  };

  function logo(acc, cls) {
    var l = P.safeUrl(acc.logoUrl);
    return l ? '<img class="' + cls + '" src="' + esc(l) + '" alt="">' : '<span class="' + cls + '" style="background:' + esc(acc.brandColor || '#1a73e8') + '">' + esc((acc.businessName || 'A')[0].toUpperCase()) + '</span>';
  }

  // The conversation the ad appears in: built from the ad group's first context hint.
  function conversation(state, g) {
    var hints = g ? M.chatHints(g) : [];
    var topic = hints[0] || M.contentTopic(state);
    var intent = M.intentOf(topic, state);
    var question = E.chatPrompt(topic, intent === 'high' ? 'decision' : intent === 'low' ? 'info' : 'research');
    return {
      question: question,
      // a neutral answer: ads never change what the assistant says
      answer: '<p>Good question. Here is a simple way to think about it:</p><ol>' +
        '<li><b>Start with what matters most to you.</b> Budget, quality, convenience and timing usually decide the right choice.</li>' +
        '<li><b>Compare two or three options.</b> Look at recent reviews, what is included, and any trial, return or cancellation terms.</li>' +
        '<li><b>Check the details before you commit.</b> Delivery or scheduling, total cost, and support often matter more than the headline price.</li></ol>' +
        '<p>If you share a bit more about your situation, I can narrow it down further.</p>'
    };
  }

  function sponsoredCard(ad, acc, mobile) {
    var domain = U.domainOf(ad.url || acc.website) || 'example.com';
    var img = P.safeUrl(ad.image) || (ad.image ? P.placeholder(acc.brandColor, acc.businessName || 'Ad', 240, 240, 'cg' + (ad.title || '')) : '');
    return '<div class="cg-ad' + (mobile ? ' mobile' : '') + '"><div class="cg-spons">Sponsored</div>' +
      '<div class="cg-card">' + (img ? '<img class="cg-img" src="' + esc(img) + '" alt="">' : '') +
      '<div class="cg-text"><div class="cg-adv">' + logo(acc, 'cg-logo') + '<span>' + esc(acc.businessName || 'Advertiser') + '</span><span class="cg-dom">' + esc(domain) + '</span></div>' +
      '<div class="cg-title">' + esc(ad.title || 'Your ad title') + '</div><div class="cg-body">' + esc(ad.body || 'Your ad body copy appears here.') + '</div></div>' +
      '<span class="cg-go">›</span></div>' +
      '<div class="cg-ask">✦ Ask about this ad</div></div>';
  }

  function productCarousel(products, acc) {
    var list = (products || []).slice(0, 6);
    if (!list.length) return '<div class="cg-ad"><div class="cg-spons">Sponsored</div><div class="cg-empty">Add approved products to your feed to preview product ads.</div></div>';
    return '<div class="cg-ad"><div class="cg-spons">Sponsored</div><div class="cg-carousel">' + list.map(function (p) {
      var sale = p.salePrice > 0 && p.salePrice < p.price;
      var price = sale ? p.salePrice : p.price;
      var img = P.safeUrl(p.imageUrl) || P.placeholder(acc.brandColor, (p.category || p.title || 'Product').split(' ')[0], 200, 200, p.title);
      return '<div class="cg-prod"><img src="' + esc(img) + '" alt=""><div class="cg-prod-title">' + esc(M.fit(p.title || '', 50)) + '</div><div class="cg-prod-price">$' + Number(price || 0).toFixed(2) + (sale ? ' <s>$' + Number(p.price).toFixed(2) + '</s>' : '') + '</div><div class="cg-prod-store">' + esc(acc.businessName || '') + '</div></div>';
    }).join('') + '</div><div class="cg-ask">✦ Ask about these products</div></div>';
  }

  // opts: { ad, products (feed campaigns), g (ad group), state }
  function render(id, opts) {
    var cx = CONTEXTS[id];
    var acc = opts.state.account;
    var conv = conversation(opts.state, opts.g);
    var mobile = id === 'mobile';
    var adHtml = opts.products ? productCarousel(opts.products, acc) : sponsoredCard(opts.ad || {}, acc, mobile);
    var thread = '<div class="cg-thread"><div class="cg-user">' + esc(conv.question) + '</div><div class="cg-answer">' + conv.answer + '</div>' + adHtml + '</div>';
    var composer = '<div class="cg-composer"><span>＋</span><span class="cg-ph">Ask anything</span><span class="cg-send">↑</span></div>';
    if (mobile) {
      return '<div class="cgm cgm-mobile" style="width:' + cx.w + 'px;height:' + cx.h + 'px"><div class="cg-mtop"><span>☰</span><b>AI assistant</b><span>✎</span></div>' + thread + composer + '</div>';
    }
    return '<div class="cgm cgm-desktop" style="width:' + cx.w + 'px;height:' + cx.h + 'px"><div class="cg-side"><div class="cg-side-new">✎ New chat</div>' +
      [70, 55, 80, 62, 48, 74].map(function (w) { return '<i style="width:' + w + '%"></i>'; }).join('') + '</div>' +
      '<div class="cg-main"><div class="cg-top"><b>AI assistant</b> <span>▾</span></div>' + thread + composer + '</div></div>';
  }

  function thumbnail(id, opts, maxW) {
    var cx = CONTEXTS[id];
    var scale = Math.min(1, (maxW || 520) / cx.w, id === 'mobile' ? 0.62 : 1);
    return '<figure class="ytm-fig"><figcaption>' + esc(cx.label) + ' (ChatGPT-style mock-up)</figcaption><div class="ytm-scale" style="width:' + Math.round(cx.w * scale) + 'px;height:' + Math.round(cx.h * scale) + 'px"><div style="transform:scale(' + scale.toFixed(4) + ');transform-origin:0 0">' +
      render(id, opts) + '</div></div></figure>';
  }

  AdSim.chatgpt = { CONTEXTS: CONTEXTS, render: render, thumbnail: thumbnail, sponsoredCard: sponsoredCard };
})(typeof window !== 'undefined' ? window : globalThis);
