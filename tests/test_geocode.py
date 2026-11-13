"""Place search on the internet: results are cleaned, errors do not crash, short texts are not sent."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import geocode  # noqa: E402


ROWS = [{"lat": "50.7183", "lon": "12.4964", "name": "Marienkirche", "display_name": "Marienkirche, Zwickau, Sachsen, Deutschland",
         "address": {"city": "Zwickau"}},
        {"lat": "x", "lon": "1"}]


class Search(unittest.TestCase):
    def test_results_are_cleaned(self):
        r = geocode.search("Marienkirche Zwickau", fetch=lambda url, agent: ROWS)
        self.assertTrue(r["ok"])
        self.assertEqual(r["results"], [{"name": "Marienkirche", "text": "Marienkirche, Zwickau, Sachsen, Deutschland", "lat": 50.7183, "lon": 12.4964, "parent": "Zwickau"}])

    def test_error_does_not_crash(self):
        def boom(url, agent):
            raise OSError("no network")
        r = geocode.search("Zwickau", fetch=boom)
        self.assertFalse(r["ok"])
        self.assertIn("no network", r["text"])

    def test_short_text_is_not_sent(self):
        def never(url, agent):
            raise AssertionError("must not be called")
        self.assertEqual(geocode.search("a", fetch=never), {"ok": True, "results": []})

    def test_agent_names_the_program(self):
        seen = []
        geocode.search("Zwickau", version="1.2", fetch=lambda url, agent: seen.append(agent) or [])
        self.assertTrue(seen[0].startswith("Grimmich/1.2"))


if __name__ == "__main__":
    unittest.main()
