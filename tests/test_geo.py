"""Places that Immich has for a photo are read in (coordinates and text)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import immich_state as st  # noqa: E402


class GeoOf(unittest.TestCase):
    def test_coordinates_and_text(self):
        g = st.geo_of({"latitude": 50.7183, "longitude": 12.4964, "city": "Zwickau", "state": "Sachsen", "country": "Deutschland"})
        self.assertEqual(g, {"lat": 50.7183, "lon": 12.4964, "t": "Zwickau, Sachsen, Deutschland"})

    def test_without_place_nothing(self):
        self.assertIsNone(st.geo_of({}))
        self.assertIsNone(st.geo_of({"latitude": None, "longitude": None}))

    def test_coordinates_without_text(self):
        self.assertEqual(st.geo_of({"latitude": "1.5", "longitude": "2.5"})["t"], "")


if __name__ == "__main__":
    unittest.main()
