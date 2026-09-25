"""Run: python -m unittest discover ads-simulator/tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402

HTML = """<!doctype html><html><head><title>Brew Haven | Fresh Coffee Beans</title>
<meta name="description" content="Fresh roasted coffee beans shipped free.">
<meta name="viewport" content="width=device-width"><meta name="theme-color" content="#6b3e26">
<meta property="og:site_name" content="Brew Haven"><link rel="icon" href="/favicon.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Ethiopia Coffee Beans 12 oz",
"brand":{"@type":"Brand","name":"Brew Haven"},"gtin13":"0850012345671","image":"/img/eth.jpg",
"offers":{"@type":"Offer","price":"18.50","availability":"https://schema.org/InStock"}}]}</script>
<style>.x{}</style></head><body><h1>Specialty coffee beans</h1><a href="/shop">Shop Coffee</a>
<a href="/subscribe">Coffee Subscriptions</a><a href="/cart">Cart</a><a href="https://other.example/x">Elsewhere</a>
<p>Coffee beans roasted to order. Coffee beans shipped fast.</p></body></html>"""


class ParserTest(unittest.TestCase):
    def test_extracts_page_data(self):
        p = server.PageParser()
        p.feed(HTML)
        self.assertEqual(p.title.strip(), "Brew Haven | Fresh Coffee Beans")
        self.assertEqual(p.meta["theme-color"], "#6b3e26")
        self.assertIn("Specialty coffee beans", p.headings)
        products = server.extract_products(p.jsonld, "https://brewhaven.example/")
        self.assertEqual(products[0]["brand"], "Brew Haven")
        self.assertEqual(products[0]["gtin"], "0850012345671")
        self.assertEqual(products[0]["image"], "https://brewhaven.example/img/eth.jpg")
        self.assertIn("coffee beans", server.top_terms("coffee beans are great. coffee beans again"))

    def test_scan_filters_links(self):
        orig = server.fetch
        server.fetch = lambda url: (HTML, "https://brewhaven.example/", 120, len(HTML), False)
        try:
            data = server.scan("brewhaven.example")
        finally:
            server.fetch = orig
        urls = [l["url"] for l in data["links"]]
        self.assertIn("https://brewhaven.example/shop", urls)
        self.assertNotIn("https://brewhaven.example/cart", urls)
        self.assertFalse(any("other.example" in u for u in urls))
        self.assertTrue(data["https"] and data["hasViewport"])
        self.assertEqual(len(data["products"]), 1)


class SafetyTest(unittest.TestCase):
    def test_rejects_internal_and_odd_urls(self):
        for url in ["http://127.0.0.1/", "http://localhost/", "http://10.0.0.5/", "http://169.254.169.254/latest/",
                    "file:///etc/passwd", "ftp://example.com/", "http://example.com:8080/"]:
            with self.assertRaises(server.ScanError, msg=url):
                server._validate_url(url)


if __name__ == "__main__":
    unittest.main()
