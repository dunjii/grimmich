"""Tests for migration.py: the one-time switch of an older database (German names) to English names.

Most important: nothing gets lost, the old data stays available as a copy, and a problem changes nothing.
"""
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import migration  # noqa: E402
import rename_map  # noqa: E402
import storage  # noqa: E402

OLD = {
    "korrekturen.json": {"fotos_F1": {"jahr": 1960, "von": 1958, "bis": 1962, "quelle": "bestaetigt", "eigen": True},
                         "fotos_F2": {"jahr": 1970, "quelle": "entwurf"}, "fotos_F3": {"jahr": 1980, "quelle": "manuell", "handdatum": "1980-05-02"}},
    "serien_arbeit.json": {"serien": [{"id": "S001", "fotos": ["F1", "F2"], "status": "offen", "quelle": "vorschlag", "zusammenhalt": 0.8,
                                       "vorschlag_neu": [], "abgelehnt": []}], "verworfen": [], "zaehler": 1, "einzel_ok": False},
    "arten.json": {"F1": {"art": "ansichtskarte"}, "F2": {"art": "dokument"}},
    "schreib_vorschau.json": {"zeilen": [{"key": "F1", "aktion": "unveraendert", "grund": "x", "neu_datum": "", "tags_dazu": ["a"]},
                                         {"key": "F2", "aktion": "schreiben", "grund": "", "neu_datum": "1960-01-01", "tags_dazu": []}]},
    "fotos.json": {"fotos": [{"key": "F1", "datei": "a.jpg", "gesichter": []}]},
    "uebernahme.json": {"zeilen": [{"key": "F1", "status": "manuell", "ort": None}]},
}


def old_database(path_="grimmich.db"):
    db = sqlite3.connect(path_)
    db.execute("CREATE TABLE dokumente (name TEXT PRIMARY KEY, inhalt TEXT NOT NULL, geaendert TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    for n, d in OLD.items():
        db.execute("INSERT INTO dokumente (name, inhalt) VALUES (?, ?)", (n, json.dumps(d, ensure_ascii=False)))
    db.commit()
    db.close()


class Base(unittest.TestCase):
    def setUp(self):
        self.old = os.getcwd()
        self.folder = tempfile.mkdtemp(prefix="migration_test_")
        os.chdir(self.folder)
        migration._done.clear()
        storage._migrated.clear()

    def tearDown(self):
        os.chdir(self.old)
        migration._done.clear()
        storage._migrated.clear()
        shutil.rmtree(self.folder, ignore_errors=True)


class TestTables(unittest.TestCase):
    def test_tabellen_sind_eindeutig(self):
        # raises when two old names would become the same new name
        migration._invert(rename_map.FIELDS)
        migration._invert(rename_map.DOCUMENTS)
        for values_ in rename_map.VALUES.values():
            migration._invert(values_)

    def test_hin_und_zurueck_ist_gleich(self):
        data_ = {"fotos": [{"jahr": 1, "quelle": "entwurf", "art": "grusskarte"}], "x": {"von": 1, "bis": 2}}
        self.assertEqual(migration.to_german(migration.to_english(data_)), data_)

    def test_keine_alten_namen_im_ergebnis(self):
        new_ = migration.to_english({"jahr": 1, "ort": {"lat": 1}, "personen": ["A"]})
        self.assertEqual(new_, {"year": 1, "place": {"lat": 1}, "people": ["A"]})


class TestSwitch(Base):
    def test_umstellung_ueber_storage(self):
        old_database()
        k = storage.load("corrections.json", None)
        self.assertEqual(k["fotos_F1"], {"year": 1960, "from": 1958, "to": 1962, "source": "confirmed", "own": True})
        self.assertEqual(k["fotos_F2"]["source"], "draft")
        self.assertEqual(k["fotos_F3"], {"year": 1980, "source": "manual", "manual_date": "1980-05-02"})
        s = storage.load("series_work.json", None)
        self.assertEqual(s["series"][0]["status"], "open")
        self.assertEqual(s["series"][0]["source"], "suggestion")
        self.assertEqual(storage.load("kinds.json", None), {"F1": {"kind": "postcard"}, "F2": {"kind": "document"}})
        z = storage.load("write_preview.json", None)["rows"]
        self.assertEqual((z[0]["action"], z[1]["action"]), ("unchanged", "write"))
        self.assertEqual(z[1]["tags_add"], [])
        # status in the adoption document is text that is written to the photos: it stays as it was
        self.assertEqual(storage.load("adoption.json", None)["rows"][0]["status"], "manuell")

    def test_kopie_wird_angelegt_und_enthaelt_die_alten_daten(self):
        old_database()
        storage.load("corrections.json", None)
        self.assertTrue(os.path.exists(migration.BACKUP_FILE))
        db = sqlite3.connect(migration.BACKUP_FILE)
        n = db.execute("SELECT COUNT(*) FROM dokumente").fetchone()[0]
        db.close()
        self.assertEqual(n, len(OLD))

    def test_bericht_sagt_alles_identisch(self):
        old_database()
        storage.load("corrections.json", None)
        self.assertEqual(migration.report(), 0)

    def test_zweimal_ist_wie_einmal(self):
        old_database()
        storage.load("corrections.json", None)
        before = storage.load("series_work.json", None)
        migration._done.clear()
        storage._migrated.clear()
        storage.load("corrections.json", None)
        self.assertEqual(storage.load("series_work.json", None), before)
        db = sqlite3.connect("grimmich.db")
        self.assertEqual(db.execute("SELECT value FROM meta WHERE key='schema'").fetchone()[0], str(migration.SCHEMA))
        self.assertIsNone(db.execute("SELECT 1 FROM sqlite_master WHERE name='dokumente'").fetchone())
        db.close()

    def test_geaenderte_daten_nach_der_umstellung_bleiben(self):
        old_database()
        storage.save("corrections.json", {"mine": 1})
        migration._done.clear()
        storage._migrated.clear()
        self.assertEqual(storage.load("corrections.json", None), {"mine": 1})

    def test_kaputtes_dokument_aendert_nichts(self):
        old_database()
        db = sqlite3.connect("grimmich.db")
        db.execute("UPDATE dokumente SET inhalt = '{kaputt' WHERE name = 'arten.json'")
        db.commit()
        db.close()
        with self.assertRaises(migration.MigrationError):
            migration.run("grimmich.db")
        db = sqlite3.connect("grimmich.db")
        self.assertIsNotNone(db.execute("SELECT 1 FROM sqlite_master WHERE name='dokumente'").fetchone())
        self.assertIsNone(db.execute("SELECT 1 FROM sqlite_master WHERE name='documents'").fetchone())
        db.close()

    def test_neue_datenbank_braucht_keine_umstellung(self):
        storage.save("corrections.json", {"a": {"year": 1}})
        self.assertFalse(os.path.exists(migration.BACKUP_FILE))
        self.assertEqual(storage.load("corrections.json", None), {"a": {"year": 1}})

    def test_zwischenspeicher_dateien_bekommen_neue_namen(self):
        old_database()
        with open("schaetzung_cache.json", "w", encoding="utf-8") as f:
            json.dump({"F1": {"gesichter": [1], "jahr": 1950}}, f)
        storage.load("corrections.json", None)
        self.assertFalse(os.path.exists("schaetzung_cache.json"))
        self.assertTrue(os.path.exists("schaetzung_cache.json.vor-englisch"))
        with open("estimate_cache.json", encoding="utf-8") as f:
            self.assertEqual(json.load(f), {"F1": {"faces": [1], "year": 1950}})


class TestEnv(Base):
    def test_zugangsdateien_bekommen_neue_namen(self):
        for n, text in (("immich.env", "IMMICH_URL=http://x\nIMMICH_ANKERALBUM=Anker\nSCHREIB_GETRENNT=1\n# IMMICH_AKTIV kommentar\n"),
                        ("gramps_schreiben.env", "GRAMPS_USER=u\nGRAMPS_PASSWORT=geheim\n")):
            with open(n, "w", encoding="utf-8") as f:
                f.write(text)
        self.assertEqual(migration.migrate_env(), 2)
        with open("immich.env", encoding="utf-8") as f:
            self.assertEqual(f.read(), "IMMICH_URL=http://x\nIMMICH_ANCHOR_ALBUM=Anker\nSEPARATE_WRITE=1\n# IMMICH_AKTIV kommentar\n")
        with open("gramps_write.env", encoding="utf-8") as f:
            self.assertEqual(f.read(), "GRAMPS_USER=u\nGRAMPS_PASSWORD=geheim\n")
        self.assertFalse(os.path.exists("gramps_schreiben.env"))
        self.assertTrue(os.path.exists("gramps_schreiben.env.vor-englisch"))
        self.assertTrue(os.path.exists("immich.env.vor-englisch"))
        self.assertEqual(migration.migrate_env(), 0)   # a second time changes nothing


if __name__ == "__main__":
    unittest.main()
