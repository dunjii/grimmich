"""Gramps places: chain of names, higher-level place, type and dates are taken from the raw API data."""
import unittest

import connections


def place(h, name, parent=None, type_=None, date=None, lat=None, lon=None):
    refs = [{"ref": parent, "date": {"text": date} if date else {}}] if parent else []
    return {"handle": h, "gramps_id": "P" + h, "name": {"value": name}, "placeref_list": refs, "place_type": type_, "lat": lat, "long": lon}


class PlacesFromRaw(unittest.TestCase):
    def setUp(self):
        self.raw = [place("s", "Sachsen", type_={"value": 2, "string": ""}), place("z", "Zwickau", "s", {"value": 4, "string": ""}),
                    place("m", "Marienkirche", "z", {"value": 0, "string": "Kirche"}, date="1900", lat="50.7183", lon="12.4964"),
                    place("x", "Irgendwo"), place("o", "Waise", "gibt-es-nicht", "City")]
        self.by = {o["h"]: o for o in connections.places_from_raw(self.raw)}

    def test_chain_and_parent(self):
        self.assertEqual(self.by["m"]["t"], "Marienkirche, Zwickau, Sachsen")
        self.assertEqual(self.by["m"]["n"], "Marienkirche")
        self.assertEqual(self.by["m"]["p"], "z")
        self.assertEqual(self.by["z"]["p"], "s")
        self.assertEqual(self.by["s"]["p"], "")

    def test_type(self):
        self.assertEqual(self.by["s"]["ty"], "State")
        self.assertEqual(self.by["z"]["ty"], "City")
        self.assertEqual(self.by["m"]["ty"], "Kirche")   # own type name
        self.assertEqual(self.by["o"]["ty"], "City")     # as text
        self.assertEqual(self.by["x"]["ty"], "")

    def test_date_and_coordinates(self):
        self.assertEqual(self.by["m"]["pd"], "1900")
        self.assertEqual(self.by["z"]["pd"], "")
        self.assertAlmostEqual(self.by["m"]["lat"], 50.7183)

    def test_unknown_parent_is_dropped(self):
        self.assertEqual(self.by["o"]["p"], "")
        self.assertEqual(self.by["o"]["t"], "Waise")


if __name__ == "__main__":
    unittest.main()
