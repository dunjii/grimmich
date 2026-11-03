"""Tests for storage.py (a database instead of many .json files).

Mainly check: on the first start NO data is lost, old files stay as a backup,
and nothing is taken over twice or wrongly. With the anonymised data from tests/data, if present.
Run in the Grimmich folder:   ./.venv/bin/python -m unittest discover -s tests -v
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import storage  # noqa: E402

DATA = os.path.join(HERE, "data")


class Base(unittest.TestCase):
    def setUp(self):
        self.old = os.getcwd()
        self.folder = tempfile.mkdtemp(prefix="speicher_test_")
        os.chdir(self.folder)
        storage._migrated.clear()

    def tearDown(self):
        os.chdir(self.old)
        storage._migrated.clear()
        shutil.rmtree(self.folder, ignore_errors=True)

    def json(self, name, data_):
        with open(name, "w", encoding="utf-8") as f:
            json.dump(data_, f, ensure_ascii=False)


class TestBasicFunctions(Base):
    def test_write_and_read(self):
        d = {"photos": {"F1": {"year": 1962, "name": "Müller ä ö ü ß"}}, "liste": [1, 2, None]}
        storage.save("corrections.json", d)
        self.assertEqual(storage.load("corrections.json", None), d)
        self.assertTrue(storage.present("corrections.json"))

    def test_missing_gives_default(self):
        self.assertEqual(storage.load("kinds.json", {"x": 1}), {"x": 1})
        self.assertFalse(storage.present("kinds.json"))

    def test_overwrite(self):
        storage.save("kinds.json", {"a": 1})
        storage.save("kinds.json", {"b": 2})
        self.assertEqual(storage.load("kinds.json", None), {"b": 2})

    def test_remove(self):
        storage.save("reload.json", {"assets": ["x"]})
        storage.remove("reload.json")
        self.assertFalse(storage.present("reload.json"))
        storage.remove("reload.json")   # zweites Mal macht keinen Fehler

    def test_path_with_folder_only_the_name_counts(self):
        storage.save("kinds.json", {"a": 1})
        self.assertEqual(storage.load("./kinds.json", None), {"a": 1})

    def test_other_files_stay_normal_files(self):
        storage.save("estimate_cache.json", {"c": 1})
        self.assertTrue(os.path.exists("estimate_cache.json"))
        self.assertEqual(storage.load("estimate_cache.json", None), {"c": 1})
        self.assertNotIn("estimate_cache.json", storage.all_names())

    def test_simultaneous_writing_from_several_threads(self):
        storage.save("assignment.json", {})
        errors = []

        def run_(i):
            try:
                for j in range(15):
                    storage.save("assignment.json", {"from": i, "n": j})
                    storage.load("assignment.json", None)
            except Exception as e:  # noqa: BLE001
                errors.append(e)
        ts = [threading.Thread(target=run_, args=(i,)) for i in range(6)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        self.assertEqual(errors, [])
        self.assertIn("from", storage.load("assignment.json", None))


class TestTakeover(Base):
    def test_files_are_taken_over_and_put_away(self):
        self.json("kinds.json", {"F1": "karte"})
        self.json("corrections.json", {"F2": {"year": 1970}})
        self.assertEqual(sorted(storage.migriere()), ["corrections.json", "kinds.json"])
        self.assertEqual(storage.load("kinds.json", None), {"F1": "karte"})
        self.assertFalse(os.path.exists("kinds.json"))
        self.assertTrue(os.path.exists(os.path.join("json_old", "kinds.json")))   # Sicherung bleibt

    def test_second_start_changes_nothing(self):
        self.json("kinds.json", {"F1": "karte"})
        storage.migriere()
        storage.save("kinds.json", {"F1": "document"})
        storage._migrated.clear()
        self.assertEqual(storage.migriere(), [])
        self.assertEqual(storage.load("kinds.json", None), {"F1": "document"})

    def test_newer_state_in_database_is_not_overwritten_by_old_file(self):
        storage.save("kinds.json", {"new": 1})
        self.json("kinds.json", {"old": 1})   # alte Datei taucht wieder auf (z. B. aus einem Backup zurueckkopiert)
        storage._migrated.clear()
        storage.migriere()
        self.assertEqual(storage.load("kinds.json", None), {"new": 1})
        self.assertTrue(os.path.exists(os.path.join("json_old", "kinds.json")))

    def test_earlier_backup_is_never_overwritten(self):
        self.json("kinds.json", {"v": 1})
        storage.migriere()
        storage.save("kinds.json", {"v": 2})
        self.json("kinds.json", {"v": 3})
        storage._migrated.clear()
        storage.migriere()
        with open(os.path.join("json_old", "kinds.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"v": 1})
        self.assertEqual(len(os.listdir("json_old")), 2)

    def test_broken_file_stays_where_it_is(self):
        with open("kinds.json", "w", encoding="utf-8") as f:
            f.write("{kaputt")
        self.json("corrections.json", {"ok": 1})
        storage.migriere()
        self.assertTrue(os.path.exists("kinds.json"))
        self.assertFalse(storage.present("kinds.json"))
        self.assertEqual(storage.load("corrections.json", None), {"ok": 1})

    def test_reading_triggers_the_takeover_by_itself(self):
        self.json("inbox.json", {"seen": ["a"]})
        self.assertEqual(storage.load("inbox.json", None), {"seen": ["a"]})   # ohne extra migriere()

    def test_export_returns_the_same_data(self):
        self.json("kinds.json", {"ä": "ö"})
        storage.migriere()
        self.assertEqual(storage.export("ex"), 1)
        with open(os.path.join("ex", "kinds.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"ä": "ö"})


@unittest.skipUnless(os.path.isdir(DATA) and os.listdir(DATA), "keine anonymisierten Testdaten")
class TestRealData(Base):
    def test_all_test_data_unchanged_after_the_takeover(self):
        before = {}
        for n in storage.NAMES:
            q = os.path.join(DATA, n)
            if os.path.exists(q):
                shutil.copy(q, n)
                with open(q, encoding="utf-8") as f:
                    before[n] = json.load(f)
        self.assertGreater(len(before), 10)
        storage.migriere()
        for n, d in before.items():
            self.assertEqual(storage.load(n, "FEHLT"), d, n)
            self.assertFalse(os.path.exists(n), n)
        # and after export and a new takeover into a fresh database still the same
        storage.export("ex")
        os.remove(storage.DB_FILE_NAME)
        for ext in ("-wal", "-shm"):
            if os.path.exists(storage.DB_FILE_NAME + ext):
                os.remove(storage.DB_FILE_NAME + ext)
        shutil.rmtree("json_old")
        for n in before:
            shutil.copy(os.path.join("ex", n), n)
        storage._migrated.clear()
        storage.migriere()
        for n, d in before.items():
            self.assertEqual(storage.load(n, "FEHLT"), d, n)


if __name__ == "__main__":
    unittest.main()
