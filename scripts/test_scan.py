#!/usr/bin/env python3
"""Unit tests for scripts/opportunities.py — run in CI via `python3 scripts/test_scan.py`.
No network: everything tested here is a pure parser/extractor function."""
import os, sys, unittest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location(
    "opp", os.path.join(os.path.dirname(os.path.abspath(__file__)), "opportunities.py"))
opp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(opp)

TODAY = opp.TODAY


class TestKeep(unittest.TestCase):
    def test_keeps_vendor_market(self):
        self.assertTrue(opp.keep("Riverside Artisan Market", "vendors wanted"))

    def test_keeps_tabling_college(self):
        self.assertTrue(opp.keep("Campus Tabling Day", "", "college"))

    def test_rejects_career_fair(self):
        self.assertFalse(opp.keep("Spring Career Fair", ""))
        self.assertFalse(opp.keep("Orientation", "", "college"))

    def test_rejects_meeting_board(self):
        self.assertFalse(opp.keep("City Council Meeting"))


class TestMk(unittest.TestCase):
    SRC = ("Test City", "civic", "https://x", "city", "Jacksonville", "Duval", "FL")

    def test_basic_shape(self):
        it = opp.mk(self.SRC, "River Market", TODAY, "https://x/1")
        self.assertEqual(it["title"], "River Market")
        self.assertEqual(it["state"], "FL")
        self.assertEqual(it["date"], TODAY.isoformat())
        self.assertEqual(it["source"], "Test City")
        self.assertIn("id", it)

    def test_college_kind_retags_tabling(self):
        src = ("KSU", "engage", "https://k", "college", "Kennesaw", "Cobb", "GA")
        it = opp.mk(src, "Table for sorority week at the Student Center", TODAY, "u")
        self.assertEqual(it["type"], "tabling")

    def test_rejects_out_of_horizon(self):
        self.assertIsNone(opp.mk(self.SRC, "Far Future Market", TODAY + timedelta(days=400), "u"))

    def test_marks_vendor_match(self):
        it = opp.mk(self.SRC, "Food Truck Festival Vendors Needed", TODAY, "u")
        self.assertTrue(it["vendorMatch"])


class TestJsonLd(unittest.TestCase):
    def test_extracts_events(self):
        html = ('<script type="application/ld+json">'
                '{"@context":"http://schema.org","@type":"Event","name":"Fall Bazaar",'
                '"startDate":"2026-11-21T10:00","url":"https://x/event",'
                '"location":{"@type":"Place","name":"Town Green","address":{"addressLocality":"Savannah","addressRegion":"GA"}}}'
                '</script>')
        evs = list(opp._jsonld_events(html))
        self.assertEqual(len(evs), 1)
        self.assertEqual(evs[0]["name"], "Fall Bazaar")
        self.assertEqual(evs[0]["startDate"], "2026-11-21T10:00")


class TestDdgParse(unittest.TestCase):
    def test_parses_redirect_links(self):
        fixture = ('<div class="result">'
                   '<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.example.org%2Fapply">'
                   'Vendor Application</a>'
                   '<a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.example.org%2Fapply">Booths from $45</a>'
                   '</div>')
        rows = opp.ddg_results(fixture)
        self.assertEqual(len(rows), 1)
        title, url, sni = rows[0]
        self.assertEqual(url.rstrip("/"), "https://www.example.org/apply")
        self.assertIn("Vendor", title)
        self.assertIn("$45", sni)


class TestBingParse(unittest.TestCase):
    def test_parses_b_algo_results(self):
        fixture = ('<ol id="b_results"><li class="b_algo">'
                   '<h2><a href="https://www.example.org/vendors">River Market — Apply to Vend</a></h2>'
                   '<p>Booths from $45. Application deadline Nov 30.</p>'
                   '</li></ol>')
        rows = opp.bing_results(fixture)
        self.assertEqual(len(rows), 1)
        title, url, sni = rows[0]
        self.assertIn("River Market", title)
        self.assertEqual(url, "https://www.example.org/vendors")
        self.assertIn("$45", sni)

    def test_unwraps_bing_redirect(self):
        import base64, urllib.parse
        target = "https://www.example.org/apply"
        wrapped = "https://www.bing.com/ck/a?!&u=" + urllib.parse.quote(base64.b64encode(target.encode()).decode())
        self.assertEqual(opp.real_url(wrapped), target)

    def test_keeps_undecodable_bing_link(self):
        wrapped = "https://www.bing.com/ck/a?&amp;&amp;p=abc123"
        self.assertEqual(opp.real_url(wrapped), "https://www.bing.com/ck/a?&&p=abc123")


class TestVetParse(unittest.TestCase):
    def test_full_extraction(self):
        html = """<html><head>
        <script type="application/ld+json">
        {"@context":"http://schema.org","@type":"Event","name":"Holiday Makers Market",
         "startDate":"2026-12-05T09:00","url":"https://www.example.org/event/123",
         "location":{"@type":"Place","name":"Old Town Hall","address":{"addressLocality":"Athens","addressRegion":"GA"}},
         "offers":{"@type":"Offer","price":"45.00","url":"https://forms.example.org/booth-application"}}
        </script></head><body>
        <h1>Holiday Makers Market</h1>
        <p>Apply by December 1, 2026. Fee $45.</p>
        <a href="/vendor-application" class="btn">Apply to Vend</a>
        <a href="mailto:booth@example.org">booth@example.org</a>
        </body></html>"""
        it = {"city": "", "state": ""}
        upd = opp.vet_parse(html, "https://www.example.org/event/123", it)
        self.assertTrue(upd["verified"])
        self.assertIn("verifiedAt", upd)
        self.assertEqual(upd["date"], "2026-12-05")
        self.assertEqual(upd["registration_url"], "https://forms.example.org/booth-application")
        self.assertEqual(upd["city"], "Athens")
        self.assertEqual(upd["state"], "GA")
        self.assertEqual(upd["email"], "booth@example.org")
        self.assertTrue(upd["fee"])

    def test_registration_link_fallback_resolves_relative(self):
        html = '<a href="/apply/booth">Vendor Booth Application</a>'
        upd = opp.vet_parse(html, "https://www.example.org/events/1", {})
        self.assertEqual(upd["registration_url"], "https://www.example.org/apply/booth")
        self.assertTrue(upd["verified"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
