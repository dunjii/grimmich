"""Tests for the Gramps planning (gramps_write.py): date conversion and preview (plan).

No network, nothing is written to Gramps. Run in the Grimmich folder:
    python3 -m unittest discover -s tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from gramps_write import gramps_datum, plan  # noqa: E402


class TestGrampsDate(unittest.TestCase):
    def test_genau(self):
        d, text = gramps_datum({"kind": "genau", "date": "1957-03-09"})
        self.assertEqual(d["dateval"], [9, 3, 1957, False])
        self.assertEqual((d["modifier"], d["quality"]), (0, 0))
        self.assertEqual(text, "09.03.1957")

    def test_jahr(self):
        d, text = gramps_datum({"kind": "jahr", "year": 1962})
        self.assertEqual(d["dateval"], [0, 0, 1962, False])
        self.assertEqual((d["modifier"], d["quality"]), (0, 0))
        self.assertEqual(text, "1962")

    def test_ca_ist_geschaetzt(self):
        d, text = gramps_datum({"kind": "ca", "year": 1948})
        self.assertEqual((d["modifier"], d["quality"]), (3, 1))   # "etwa", "geschaetzt"
        self.assertEqual(text, "ca. 1948")

    def test_bereich(self):
        d, text = gramps_datum({"kind": "bereich", "year": 1950, "from": 1946, "to": 1951})
        self.assertEqual(d["dateval"], [0, 0, 1946, False, 0, 0, 1951, False])
        self.assertEqual((d["modifier"], d["quality"]), (4, 1))   # "zwischen", "geschaetzt"
        self.assertIn("1946", text)
        self.assertIn("1951", text)

    def test_bereich_mit_gleichem_anfang_und_ende_ist_ein_jahr(self):
        d, text = gramps_datum({"kind": "bereich", "year": 1950, "from": 1950, "to": 1950})
        self.assertEqual(d["dateval"], [0, 0, 1950, False])
        self.assertEqual(text, "1950")

    def test_genau_ohne_datum_faellt_auf_jahr_zurueck(self):
        d, text = gramps_datum({"kind": "genau", "year": 1960})
        self.assertEqual(text, "1960")


def item(key, asset=None, **kw):
    it = {"key": key, "asset": asset or "a-" + key, "date": {"kind": "jahr", "year": 1960}, "people": [], "events": []}
    it.update(kw)
    return it


STATE = ({"a-vorhanden": ("h-med", "O0007")}, {"I0001": "h-p1", "I0002": "h-p2"}, {"Album 1": "h-q1"})


class TestPlans(unittest.TestCase):
    def test_neues_foto(self):
        z, n = plan([item("F1", source={"album": "Album 1", "seite": 3, "nr": 2}, people=[{"name": "Anna", "gid": "I0001"}])], STATE, {})
        self.assertEqual(z[0]["action"], "new")
        self.assertEqual(z[0]["people_ok"], ["Anna"])
        self.assertEqual(z[0]["source_text"], "Album 1: Seite 3, Foto 2")
        self.assertFalse(z[0]["new_source"])   # Quelle gibt es schon
        self.assertEqual((n["new"], n["present"], n["citations"], n["people"]), (1, 0, 1, 1))

    def test_foto_schon_in_gramps_wird_nicht_angefasst(self):
        z, n = plan([item("F2", asset="a-vorhanden")], STATE, {})
        self.assertEqual(z[0]["action"], "present")
        self.assertEqual(z[0]["gid"], "O0007")
        self.assertEqual((n["new"], n["present"]), (0, 1))

    def test_foto_schon_von_grimmich_geschrieben(self):
        z, _ = plan([item("F3")], STATE, {"F3": {"gid": "O0042"}})
        self.assertEqual((z[0]["action"], z[0]["gid"]), ("present", "O0042"))

    def test_zweimal_planen_aendert_nichts_bei_geschriebenen(self):
        z, n = plan([item("F3"), item("F4")], STATE, {"F3": {"gid": "O1"}, "F4": {"gid": "O2"}})
        self.assertEqual((n["new"], n["present"]), (0, 2))

    def test_neue_quelle_wird_nur_einmal_angelegt(self):
        q = {"album": "Album 9", "seite": 1, "nr": 1}
        z, n = plan([item("F5", source=q), item("F6", source=q), item("F7", source={"album": "Album 1", "seite": 1, "nr": 1})], STATE, {})
        self.assertEqual([x["new_source"] for x in z], [True, False, False])
        self.assertEqual(n["sources_new"], 1)

    def test_bei_vorhandenem_foto_keine_neue_quelle(self):
        z, n = plan([item("F8", asset="a-vorhanden", source={"album": "Album 9", "seite": 1, "nr": 1})], STATE, {})
        self.assertFalse(z[0]["new_source"])
        self.assertEqual(n["sources_new"], 0)

    def test_person_nicht_in_gramps(self):
        z, n = plan([item("F9", people=[{"name": "Anna", "gid": "I0001"}, {"name": "Unbekannt", "gid": "I9999"}])], STATE, {})
        self.assertEqual(z[0]["people_ok"], ["Anna"])
        self.assertEqual(z[0]["people_missing"], ["Unbekannt"])
        self.assertIn("Unbekannt", z[0]["reason"])
        self.assertEqual(z[0]["action"], "new")   # wird trotzdem geschrieben, nur ohne diese Verknuepfung
        self.assertEqual(n["people"], 1)

    def test_ereignisse_werden_gezaehlt_aber_nicht_bei_vorhandenen(self):
        ev = [{"text": "Heirat 1950"}, {"text": "Umzug"}]
        z, n = plan([item("F10", events=ev), item("F11", asset="a-vorhanden", events=ev)], STATE, {})
        self.assertEqual(z[0]["events"], ["Heirat 1950", "Umzug"])
        self.assertEqual(n["events"], 2)

    def test_leere_liste(self):
        self.assertEqual(plan([], STATE, {})[1]["new"], 0)


if __name__ == "__main__":
    unittest.main()
