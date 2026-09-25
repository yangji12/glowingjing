#!/usr/bin/env python3
"""AdLab local server.

Serves the simulator and provides /api/scan?url=... which fetches a public web page and
extracts what a Google Ads quick start needs: title, description, keyword ideas, page links
(sitelink ideas), theme color, logo, and schema.org Product data (for a Shopping feed).

Usage:
    python ads-simulator/server.py            # http://localhost:8000
    python ads-simulator/server.py --port 9000 --host 0.0.0.0

Standard library only.
"""

import argparse
import http.server
import ipaddress
import json
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAX_BYTES = 2_000_000
TIMEOUT = 8
USER_AGENT = "Mozilla/5.0 (compatible; AdLabClassroomScanner/1.0)"

STOPWORDS = set(
    """a about above after again all also am an and any are as at be because been before being below between both but by
    can could did do does doing down during each few for from further get got had has have having he her here hers him his
    how i if in into is it its just me more most my no nor not now of off on once only or other our ours out over own same
    she should so some such than that the their theirs them then there these they this those through to too under until up
    very was we were what when where which while who whom why will with you your yours us new one two use using may might
    must shall per via etc home page site website menu search login sign cart account privacy policy terms cookies contact
    copyright rights reserved click here learn read view see skip content main navigation toggle close open free shop now""".split()
)


class ScanError(Exception):
    pass


def _check_host(host):
    """Reject hosts that resolve to private, loopback, link-local or otherwise internal addresses."""
    if not host:
        raise ScanError("Missing host")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise ScanError("Could not resolve %s" % host)
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
                or ip.is_reserved or ip.is_unspecified):
            raise ScanError("Refusing to scan a private or internal address")


def _validate_url(url):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise ScanError("Only http(s) URLs can be scanned")
    if parts.port not in (None, 80, 443):
        raise ScanError("Only standard web ports can be scanned")
    _check_host(parts.hostname)
    return url


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url):
    _validate_url(url)
    opener = urllib.request.build_opener(_SafeRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    start = time.time()
    try:
        with opener.open(req, timeout=TIMEOUT) as resp:
            ctype = resp.headers.get("Content-Type", "")
            if "html" not in ctype and "xml" not in ctype:
                raise ScanError("The URL did not return an HTML page")
            body = resp.read(MAX_BYTES + 1)
            final_url = resp.geturl()
            charset = resp.headers.get_content_charset() or "utf-8"
    except urllib.error.HTTPError as e:
        raise ScanError("The site returned HTTP %s" % e.code)
    except urllib.error.URLError as e:
        raise ScanError("Could not reach the site (%s)" % getattr(e, "reason", e))
    except socket.timeout:
        raise ScanError("The site took too long to respond")
    elapsed = int((time.time() - start) * 1000)
    truncated = len(body) > MAX_BYTES
    html = body[:MAX_BYTES].decode(charset, errors="replace")
    return html, final_url, elapsed, len(body), truncated


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta = {}
        self.links = []
        self.icons = []
        self.headings = []
        self.jsonld = []
        self.text = []
        self._in = []
        self._href = None
        self._anchor = []
        self._heading = None
        self._script_type = None
        self._buf = []

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        self._in.append(tag)
        if tag == "meta":
            key = (a.get("name") or a.get("property") or "").lower()
            if key and "content" in a:
                self.meta[key] = a["content"].strip()
        elif tag == "link":
            rel = a.get("rel", "").lower()
            if "icon" in rel and a.get("href"):
                self.icons.append(a["href"])
        elif tag == "a":
            self._href = a.get("href")
            self._anchor = []
        elif tag in ("h1", "h2", "h3"):
            self._heading = []
        elif tag == "script":
            self._script_type = a.get("type", "").lower()
            self._buf = []

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            text = " ".join("".join(self._anchor).split())
            if text:
                self.links.append((text, self._href))
            self._href = None
        elif tag in ("h1", "h2", "h3") and self._heading is not None:
            text = " ".join("".join(self._heading).split())
            if text:
                self.headings.append(text)
            self._heading = None
        elif tag == "script":
            if self._script_type == "application/ld+json":
                self.jsonld.append("".join(self._buf))
            self._script_type = None
        if self._in and self._in[-1] == tag:
            self._in.pop()
        elif tag in self._in:
            while self._in and self._in.pop() != tag:
                pass

    def handle_data(self, data):
        cur = self._in[-1] if self._in else ""
        if cur == "script":
            if self._script_type == "application/ld+json":
                self._buf.append(data)
            return
        if cur in ("style", "noscript", "svg"):
            return
        if cur == "title":
            self.title += data
        if self._href is not None:
            self._anchor.append(data)
        if self._heading is not None:
            self._heading.append(data)
        self.text.append(data)


def _walk_jsonld(node, out):
    if isinstance(node, list):
        for n in node:
            _walk_jsonld(n, out)
    elif isinstance(node, dict):
        t = node.get("@type")
        types = t if isinstance(t, list) else [t]
        if "Product" in types:
            out.append(node)
        for key in ("@graph", "itemListElement", "item", "mainEntity"):
            if key in node:
                _walk_jsonld(node[key], out)


def _first(v):
    return v[0] if isinstance(v, list) and v else v


def extract_products(blocks, base):
    found = []
    for raw in blocks:
        try:
            _walk_jsonld(json.loads(raw.strip()), found)
        except ValueError:
            continue
    products = []
    for p in found[:25]:
        offers = _first(p.get("offers")) or {}
        if isinstance(offers, dict) and offers.get("@type") == "AggregateOffer":
            price = offers.get("lowPrice")
        else:
            price = offers.get("price") if isinstance(offers, dict) else None
        brand = p.get("brand")
        if isinstance(brand, dict):
            brand = brand.get("name")
        image = _first(p.get("image"))
        if isinstance(image, dict):
            image = image.get("url")
        url = p.get("url") or (offers.get("url") if isinstance(offers, dict) else None)
        products.append({
            "name": str(p.get("name") or "")[:150],
            "description": re.sub(r"\s+", " ", str(p.get("description") or ""))[:5000],
            "price": price,
            "brand": brand or "",
            "gtin": str(p.get("gtin13") or p.get("gtin12") or p.get("gtin14") or p.get("gtin8") or p.get("gtin") or ""),
            "image": urllib.parse.urljoin(base, image) if image else "",
            "url": urllib.parse.urljoin(base, url) if url else "",
            "availability": str(offers.get("availability", "")) if isinstance(offers, dict) else "",
            "category": str(p.get("category") or ""),
        })
    return products


def top_terms(text, limit=15):
    words = [w for w in re.findall(r"[a-z][a-z'-]{2,}", text.lower()) if w not in STOPWORDS]
    counts = Counter(words)
    bigrams = Counter(
        a + " " + b for a, b in zip(words, words[1:]) if a != b
    )
    terms = [b for b, n in bigrams.most_common(limit) if n >= 2]
    terms += [w for w, n in counts.most_common(limit) if n >= 2]
    seen, out = set(), []
    for t in terms:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out[:limit]


def scan(url):
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    html, final_url, elapsed, size, truncated = fetch(url)
    p = PageParser()
    p.feed(html)
    base = final_url
    host = urllib.parse.urlsplit(final_url).hostname or ""
    meta = p.meta
    title = " ".join(p.title.split())
    description = meta.get("description") or meta.get("og:description") or ""
    keywords = [k.strip() for k in meta.get("keywords", "").split(",") if k.strip()][:15]
    text = " ".join(" ".join(p.text).split())

    links, seen = [], set()
    for label, href in p.links:
        full = urllib.parse.urljoin(base, href)
        parts = urllib.parse.urlsplit(full)
        if parts.scheme not in ("http", "https") or (parts.hostname or "").replace("www.", "") != host.replace("www.", ""):
            continue
        path = parts.path or "/"
        if path in ("/", "") or path in seen or len(label) > 40 or len(label) < 3:
            continue
        if re.search(r"login|signin|sign-in|account|cart|privacy|terms|cookie|javascript", path + label, re.I):
            continue
        seen.add(path)
        links.append({"text": label, "url": full})
        if len(links) >= 12:
            break

    icon = urllib.parse.urljoin(base, p.icons[0]) if p.icons else ""
    return {
        "url": url,
        "finalUrl": final_url,
        "https": final_url.lower().startswith("https://"),
        "title": title[:200],
        "description": description[:300],
        "siteName": meta.get("og:site_name", ""),
        "image": urllib.parse.urljoin(base, meta["og:image"]) if meta.get("og:image") else "",
        "logo": icon,
        "themeColor": meta.get("theme-color", ""),
        "hasViewport": "viewport" in meta,
        "keywords": keywords,
        "headings": p.headings[:15],
        "topTerms": top_terms(" ".join([title, description, " ".join(p.headings), text])),
        "links": links,
        "products": extract_products(p.jsonld, base),
        "wordCount": len(text.split()),
        "bytes": size,
        "truncated": truncated,
        "loadMs": elapsed,
    }


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self):
        parts = urllib.parse.urlsplit(self.path)
        if parts.path.rstrip("/").endswith("/api/scan"):
            qs = urllib.parse.parse_qs(parts.query)
            target = (qs.get("url") or [""])[0].strip()
            try:
                if not target:
                    raise ScanError("Missing url parameter")
                self._json(200, scan(target))
            except ScanError as e:
                self._json(422, {"error": str(e)})
            except Exception as e:  # keep the classroom server alive on unexpected pages
                self._json(500, {"error": "Scan failed: %s" % e.__class__.__name__})
            return
        super().do_GET()

    def _json(self, status, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def main():
    ap = argparse.ArgumentParser(description="AdLab classroom server")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    httpd = http.server.ThreadingHTTPServer((args.host, args.port), Handler)
    print("AdLab running at http://%s:%d  (Ctrl+C to stop)" % (args.host if args.host != "0.0.0.0" else "localhost", args.port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
