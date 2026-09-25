/* AdSim utilities — shared by the browser app and the Node tests. */
(function (root) {
  'use strict';
  var AdSim = (root.AdSim = root.AdSim || {});

  // FNV-1a string hash -> unsigned 32-bit int
  function hash(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // Deterministic PRNG (mulberry32)
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 0..1 deterministic value from a string
  function unit(str) {
    return hash(str) / 4294967296;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  var STOPWORDS = new Set(
    ('a an the and or of to in on at for with by from my your our me we you i is are be it this that ' +
      'as vs versus do does can get how what where who why when which near best top cheap buy online ' +
      'free price prices cost costs deal deals service services company companies shop store sale local ' +
      'nearby today now new review reviews rated affordable professional quality').split(' ')
  );

  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  // lowercase word tokens (keeps numbers), no stemming
  function words(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .map(function (w) { return w.replace(/^['-]+|['-]+$/g, ''); })
      .filter(Boolean);
  }

  // stemmed content tokens (stopwords and generic modifiers removed)
  function contentTokens(text) {
    return words(text)
      .filter(function (w) { return !STOPWORDS.has(w) && w.length > 1; })
      .map(stem);
  }

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function sum(arr, fn) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += fn ? fn(arr[i], i) : arr[i];
    return s;
  }

  function safeDiv(a, b) {
    return b ? a / b : 0;
  }

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  }

  // Parse a keyword line using Google Ads notation:
  //   word -> broad, "word" -> phrase, [word] -> exact
  function parseKeyword(line) {
    var t = String(line || '').trim();
    if (!t) return null;
    var match = 'broad';
    if (/^\[.*\]$/.test(t)) { match = 'exact'; t = t.slice(1, -1); }
    else if (/^".*"$/.test(t)) { match = 'phrase'; t = t.slice(1, -1); }
    t = t.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!t) return null;
    return { text: t, match: match };
  }

  function formatKeyword(kw) {
    if (kw.match === 'exact') return '[' + kw.text + ']';
    if (kw.match === 'phrase') return '"' + kw.text + '"';
    return kw.text;
  }

  function parseKeywordList(text) {
    return String(text || '')
      .split(/\n|,/)
      .map(parseKeyword)
      .filter(Boolean);
  }

  // Does a negative keyword block a search term? (Google negative match semantics:
  // negatives do not match close variants.)
  function negativeBlocks(neg, term) {
    var tw = words(term);
    var nw = words(neg.text);
    if (!nw.length) return false;
    if (neg.match === 'exact') return tw.join(' ') === nw.join(' ');
    if (neg.match === 'phrase') {
      var t = ' ' + tw.join(' ') + ' ';
      return t.indexOf(' ' + nw.join(' ') + ' ') >= 0;
    }
    return nw.every(function (w) { return tw.indexOf(w) >= 0; });
  }

  function domainOf(url) {
    try {
      var u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
      return u.hostname.replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  }

  function pathOf(url) {
    try {
      var u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
      return u.pathname || '/';
    } catch (e) {
      return '/';
    }
  }

  AdSim.util = {
    hash: hash, rng: rng, unit: unit, clamp: clamp, sigmoid: sigmoid,
    words: words, contentTokens: contentTokens, stem: stem, uniq: uniq, sum: sum,
    safeDiv: safeDiv, deepClone: deepClone, uid: uid, STOPWORDS: STOPWORDS,
    parseKeyword: parseKeyword, parseKeywordList: parseKeywordList, formatKeyword: formatKeyword,
    negativeBlocks: negativeBlocks, domainOf: domainOf, pathOf: pathOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
