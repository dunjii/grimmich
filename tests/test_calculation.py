"""Tests for the dating calculation (calculation.py). No connection to Immich or Gramps needed."""
import json
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import calculation as r  # noqa: E402

DATA = os.path.join(os.path.dirname(__file__), "data")
TODAY = date.today().year


def person(name="P", birth=1950.5, age_value=30.0):
    return {"name": name, "birth": birth, "age": age_value}


class Basics(unittest.TestCase):
    def test_sigma_waechst_mit_dem_alter(self):
        values_ = [r.sigma(a) for a in (2, 8, 15, 25, 45, 70)]
        self.assertEqual(values_, sorted(values_))

    def test_einfaches_foto(self):
        e = r.series_result(["F1"], {"F1": [person(birth=1950.5, age_value=30)]})
        self.assertAlmostEqual(e["year"], 1980.5, places=3)
        self.assertLessEqual(e["from"], 1980)
        self.assertGreaterEqual(e["to"], 1981)

    def test_person_ohne_geburtsdatum_wird_nicht_zum_datieren_benutzt(self):
        self.assertIsNone(r.series_result(["F1"], {"F1": [{"name": "P", "birth": None, "age": 40}]}))
        self.assertEqual(r.values_from_info([{"name": "P", "birth": None, "age": 40}]), [])

    def test_kein_alter_wird_uebersprungen(self):
        self.assertIsNone(r.series_result(["F1"], {"F1": [{"name": "P", "birth": 1950, "age": None}]}))

    def test_nie_nach_heute(self):
        e = r.series_result(["F1"], {"F1": [person(birth=TODAY - 5.0, age_value=40)]})
        self.assertLessEqual(e["year"], r.day_now() + 1e-6)
        self.assertLessEqual(e["to"], TODAY)
        self.assertIn("future", e["hint"])

    def test_nie_vor_der_geburt(self):
        e = r.series_result(["F1"], {"F1": [person(birth=1990.2, age_value=1)]})
        self.assertGreaterEqual(e["from"], 1990)

    def test_mehrere_gleiche_personen_machen_sicherer(self):
        first = r.series_result(["F1"], {"F1": [person()]})
        three = r.series_result(["F1", "F2", "F3"], {k: [person()] for k in ("F1", "F2", "F3")})
        self.assertLessEqual(three["to"] - three["from"], first["to"] - first["from"])

    def test_widerspruch_wird_gemeldet(self):
        info = {"F1": [person("A", 1950, 30), person("B", 1900, 30)]}   # eine Person 50 Jahre "frueher"
        e = r.series_result(["F1"], info)
        self.assertIn("contradict", e["hint"])

    def test_serie_mit_stark_abweichenden_fotos(self):
        info = {"F1": [person(birth=1950, age_value=10)], "F2": [person(birth=1950, age_value=40)]}
        e = r.series_result(["F1", "F2"], info)
        self.assertIn("differ strongly", e["hint"])

    def test_dezimaljahr(self):
        self.assertAlmostEqual(r.decimal_year_value("1938-07-01"), 1938.5, places=1)
        self.assertIsNone(r.decimal_year_value("kein datum"))


@unittest.skipUnless(os.path.exists(os.path.join(DATA, "age_per_photo.json")), "keine anonymisierten Testdaten")
class WithRealData(unittest.TestCase):
    def test_alle_fotos_geben_stimmige_ergebnisse(self):
        with open(os.path.join(DATA, "age_per_photo.json"), encoding="utf-8") as f:
            info = json.load(f)
        n = 0
        for k, people_ in info.items():
            e = r.series_result([k], {k: people_})
            with_ = [p for p in people_ if p.get("birth") is not None and p.get("age") is not None]
            if not with_:
                self.assertIsNone(e, k)
                continue
            n += 1
            self.assertIsNotNone(e, k)
            self.assertEqual(e["year"], e["year"], k)                      # kein NaN
            self.assertLessEqual(e["from"], e["to"], k)
            self.assertLessEqual(e["to"], TODAY, k)
            self.assertLessEqual(e["year"], r.day_now() + 1e-6, k)
        self.assertGreater(n, 300)


if __name__ == "__main__":
    unittest.main()
