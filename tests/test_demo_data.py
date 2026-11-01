"""Tests for demo_data.py: the invented demo data set must be complete, consistent and the same every time."""
import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import demo_data  # noqa: E402


class TestDemoData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.mkdtemp(prefix="demo_test_")
        cls.docs = demo_data.build(cls.folder, pictures=False)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.folder, ignore_errors=True)

    def test_same_every_time(self):
        other = tempfile.mkdtemp(prefix="demo_test2_")
        try:
            again = demo_data.build(other, pictures=False)
            self.assertEqual(json.dumps(again, sort_keys=True), json.dumps(self.docs, sort_keys=True))
        finally:
            shutil.rmtree(other, ignore_errors=True)

    def test_files_are_written_and_valid(self):
        for name in self.docs:
            with open(os.path.join(self.folder, name + ".json"), encoding="utf-8") as f:
                self.assertEqual(json.load(f), self.docs[name])
        self.assertTrue(os.path.exists(os.path.join(self.folder, "schaetzung_koerper.csv")))

    def test_every_key_is_known_everywhere(self):
        keys = {p["key"] for p in self.docs["photos"]["photos"]}
        self.assertEqual(len(keys), len(self.docs["photos"]["photos"]))   # unique
        self.assertEqual(keys, set(self.docs["immich_state"]["photos"]))
        for s in self.docs["series_work"]["series"]:
            self.assertTrue(set(s["photos"]) <= keys)
        for s in self.docs["series"]["series"]:
            self.assertTrue({p["key"] for p in s["photos"]} <= keys)
        for album in self.docs["provenance_albums"]["albums"]:
            self.assertTrue(set(album["keys"]) <= keys)
        self.assertTrue(set(self.docs["corrections"]) <= keys)
        self.assertTrue(set(self.docs["kinds"]) <= keys)
        self.assertTrue(set(self.docs["age_per_photo"]) <= keys)

    def test_faces_belong_to_people_of_the_data_set(self):
        people = set(self.docs["immich_state"]["people"])
        for photo in self.docs["immich_state"]["photos"].values():
            for face in photo["faces"]:
                self.assertIn(face["p"] if face["p"] else next(iter(people)), people)
                x1, y1, x2, y2, w, h = face["b"]
                self.assertTrue(0 <= x1 < x2 <= w and 0 <= y1 < y2 <= h)

    def test_enough_to_look_at(self):
        self.assertGreaterEqual(len(self.docs["immich_state"]["people"]), 15)
        self.assertGreaterEqual(len(self.docs["photos"]["photos"]), 100)
        self.assertGreaterEqual(len(self.docs["series_work"]["series"]), 20)
        self.assertTrue(any(s["status"] == "ok" for s in self.docs["series_work"]["series"]))
        self.assertTrue(any(s["status"] == "open" for s in self.docs["series_work"]["series"]))

    def test_estimates_are_plausible(self):
        with open(os.path.join(self.folder, "schaetzung_koerper.csv"), encoding="utf-8-sig") as f:
            rows = [line.split(";") for line in f.read().strip().split("\n")[1:]]
        self.assertGreater(len(rows), 30)
        for r in rows:
            year, from_, to_ = int(r[2]), int(r[3]), int(r[4])
            self.assertTrue(from_ <= year <= to_ and 1880 <= year <= 2030)


if __name__ == "__main__":
    unittest.main()
