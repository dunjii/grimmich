"""Automatic tests for the write logic (immich_write.plan).

Run in the Grimmich folder:   ./.venv/bin/python -m unittest discover -s tests -v
The tests need neither Immich nor Gramps. They work with invented photos.
If anonymised files are in tests/data (adoption.json, dating_backup.json),
additional tests run with the real tricky cases.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import immich_write as s  # noqa: E402

DATA = os.path.join(os.path.dirname(__file__), "data")


def asset(date_="2026-04-13T10:00:00.000Z", scan="2026-04-13", description="", tags=(), lat=None, lon=None):
    exif = {"dateTimeOriginal": date_, "description": description}
    if lat is not None:
        exif.update(latitude=lat, longitude=lon)
    return {"exifInfo": exif, "fileCreatedAt": scan + "T10:00:00.000Z", "tags": [{"value": t} for t in tags]}


def entry_row(**kw):
    z = {"key": "F0001", "asset": "ID-0001", "year": 1960, "date": "", "from": 1955, "to": 1965, "status": "Schätzung",
         "source": "", "sourceUntouched": True, "onlySource": False, "onlyPlace": False, "place": None, "force": False,
         "manual_date": "", "kind": ""}
    z.update(kw)
    return z


def apply(p, a):
    """Was Immich nach dem Schreiben enthaelt (vereinfacht)."""
    exif = dict(a["exifInfo"])
    tags = {t["value"] for t in a["tags"]}
    if p["action"] == "write":
        if p.get("new_date"):
            exif["dateTimeOriginal"] = p["new_date"]
        exif["description"] = p["new_description"]
        tags = (tags | set(p["tags_add"])) - set(p["tags_remove"])
        if p.get("new_place"):
            exif["latitude"], exif["longitude"] = p["new_place"]
    return {"exifInfo": exif, "fileCreatedAt": a["fileCreatedAt"], "tags": [{"value": t} for t in sorted(tags)]}


class BasicRules(unittest.TestCase):
    def test_nur_jahr_wird_geschaetzt_markiert(self):
        p = s.plan(entry_row(), asset(), {})
        self.assertEqual(p["action"], "write")
        self.assertEqual(p["new_date"], "1960-07-01T12:00:00.000Z")
        self.assertIn(s.TAG_ESTIMATED, p["tags_add"])
        self.assertEqual(p["new_description"], "[GRM] ~1960 (1955–1965) [/GRM]")

    def test_volles_datum_ohne_schaetz_tag(self):
        p = s.plan(entry_row(date="1960-05-17", status="manuell"), asset(), {})
        self.assertEqual(p["new_date"], "1960-05-17T12:00:00.000Z")
        self.assertNotIn(s.TAG_ESTIMATED, p["tags_add"])
        self.assertNotIn("[GRM]", p["new_description"])   # a fixed date alone needs no block

    def test_ohne_jahr_wird_offen(self):
        p = s.plan(entry_row(year="", **{"from": "", "to": ""}), asset(), {})
        self.assertEqual(p["new_date"], "")
        self.assertIn(s.TAG_OPEN, p["tags_add"])

    def test_geschaetzt_wird_zu_exakt(self):
        a = asset(tags=[s.TAG_ESTIMATED])
        p = s.plan(entry_row(date="1960-05-17", status="manuell"), a, {})
        self.assertIn(s.TAG_ESTIMATED, p["tags_remove"])

    def test_tag_in_another_language_is_recognised_and_replaced(self):
        a = asset(tags=["Datierung geschätzt", "Datierung offen"])
        p = s.plan(entry_row(), a, {})
        self.assertNotEqual(p["action"], "skip")   # recognised as written by Grimmich
        if s.TAG_ESTIMATED != "Datierung geschätzt":
            self.assertIn("Datierung geschätzt", p["tags_remove"])
            self.assertIn(s.TAG_ESTIMATED, p["tags_add"])
        self.assertIn("Datierung offen", p["tags_remove"])
        p = s.plan(entry_row(date="1960-05-17", status="manuell"), asset(tags=["Dating estimated"]), {})
        self.assertIn("Dating estimated", p["tags_remove"])

    def test_source_block_in_another_language_is_replaced(self):
        for old, gone in (("Text\n\n[Quelle] Album 3 [/Quelle]", "Album 3"), ("Text\n\n[Source] Album 4 [/Source]", "Album 4")):
            text = s.new_description(old, s.note(entry_row(source="Album 5", sourceUntouched=False), old))
            self.assertNotIn(gone, text)
            self.assertNotIn("[Quelle]", text)
            self.assertNotIn("[Source]", text)
            self.assertIn("Album 5", text)
            self.assertEqual(text.count("Album"), 1)
            self.assertTrue(text.startswith("Text"))

    def test_art_tag_kommt_und_geht(self):
        p = s.plan(entry_row(kind="postcard"), asset(), {})
        self.assertIn(s.ART_TAGS["postcard"], p["tags_add"])
        for old_word in ("Ansichtskarte", "Postcard"):
            p = s.plan(entry_row(kind=""), asset(tags=[old_word]), {})
            self.assertIn(old_word, p["tags_remove"])


class UnifiedBlock(unittest.TestCase):
    def test_parts_and_format(self):
        self.assertEqual(s.note(entry_row(series_id="S038")), "[GRM] ~1960 (1955–1965) · S038 [/GRM]")
        self.assertEqual(s.note(entry_row(date="1951-03-12", status="manuell", series_id="S038")), "[GRM] 1951-03-12 · S038 [/GRM]")
        self.assertEqual(s.note(entry_row(year=1951, date="", status="manuell", series_id="S038")), "[GRM] 1951 · S038 [/GRM]")
        self.assertEqual(s.note(entry_row(year="", series_id="")), "[GRM] ? [/GRM]")
        self.assertEqual(s.note(entry_row(source="Photo album 3, p. 2, no. 1", sourceUntouched=False, series_id="S038")),
                         "[GRM] ~1960 (1955–1965) · S038 · Photo album 3, p. 2, no. 1 [/GRM]")
        self.assertEqual(s.note(entry_row(year=1951, status="manuell")), "")   # fixed date alone: no block

    def test_old_blocks_are_replaced(self):
        for old in ("Text\n\n[Grimmich] ca. 1984 (1974-1993) [/Grimmich]", "Text\n\n[Datierung automatisch]\nGeschätzt: ca. 1960.\n[/Datierung]"):
            p = s.plan(entry_row(), asset(description=old, tags=[s.TAG_ESTIMATED]), {})
            self.assertEqual(p["new_description"], "Text\n\n[GRM] ~1960 (1955–1965) [/GRM]")

    def test_old_source_block_moves_into_the_block(self):
        old = "Text\n\n[Grimmich] ca. 1984 [/Grimmich]\n\n[Quelle] Fotoalbum 3, Seite 2 [/Quelle]"
        text = s.new_description(old, s.note(entry_row(), old))   # source untouched: kept
        self.assertIn("[GRM] ~1960 (1955–1965) · Fotoalbum 3, Seite 2 [/GRM]", text)
        self.assertNotIn("[Quelle]", text)

    def test_source_only_keeps_date_and_series_part(self):
        old = "[GRM] ~1960 (1955–1965) · S038 [/GRM]"
        text = s.new_description(old, s.note(entry_row(source="Album 5", sourceUntouched=False, onlySource=True, year=1999, series_id="S038"), old, keep_date=True))
        self.assertEqual(text, "[GRM] ~1960 (1955–1965) · S038 · Album 5 [/GRM]")

    def test_series_disappears_when_dissolved(self):
        old = "[GRM] ~1960 (1955–1965) · S038 [/GRM]"
        self.assertEqual(s.new_description(old, s.note(entry_row(series_id=""), old)), "[GRM] ~1960 (1955–1965) [/GRM]")

    def test_parse_block(self):
        self.assertEqual(s.block_parts("x [GRM] ~1960 (1955–1965) · S038 · Album 3 · p. 2 [/GRM]"),
                         {"date": "~1960 (1955–1965)", "series": "S038", "source": "Album 3 · p. 2"})
        self.assertEqual(s.block_parts("[GRM] ? [/GRM]")["date"], "?")
        self.assertEqual(s.block_parts("nothing"), {"date": "", "series": "", "source": ""})

    def test_existing_text_is_kept_and_rerun_is_unchanged(self):
        a = asset(description="My own note")
        p = s.plan(entry_row(series_id="S038"), a, {})
        self.assertEqual(p["new_description"], "My own note\n\n[GRM] ~1960 (1955–1965) · S038 [/GRM]")
        p2 = s.plan(entry_row(series_id="S038"), asset(date_=p["new_date"], description=p["new_description"], tags=[s.TAG_ESTIMATED]), {})
        self.assertEqual(p2["action"], "unchanged")


class ProtectHandData(unittest.TestCase):
    def test_von_hand_gesetztes_datum_wird_nicht_ueberschrieben(self):
        a = asset(date_="1987-03-02T12:00:00.000Z", scan="2026-04-13")
        p = s.plan(entry_row(), a, {})
        self.assertEqual(p["action"], "skip")

    def test_mit_bestaetigung_wird_ueberschrieben(self):
        a = asset(date_="1987-03-02T12:00:00.000Z", scan="2026-04-13")
        p = s.plan(entry_row(force=True), a, {})
        self.assertEqual(p["action"], "write")

    def test_datum_nach_unserem_schreiben_geaendert(self):
        fr = {"F0001": {"asset": "ID-0001", "date": "1960-07-01T12:00:00.000Z"}}
        a = asset(date_="1971-01-01T12:00:00.000Z", tags=[s.TAG_ESTIMATED])
        p = s.plan(entry_row(), a, fr)
        self.assertEqual(p["action"], "skip")

    def test_digitalfoto_im_arbeitsalbum_wird_normal_geschrieben(self):
        a = asset(date_="2026-04-14T10:00:00.000Z", scan="2026-04-13")
        self.assertEqual(s.plan(entry_row(), a, {})["action"], "write")
        a["exifInfo"].update(make="NIKON", model="Z6", dateTimeOriginal="1999-05-05T10:00:00.000Z")
        p = s.plan(entry_row(), a, {})
        self.assertEqual(p["action"], "write")
        self.assertTrue(p["date_change"])

    def test_ohne_kameradaten_bleibt_hand_datum_geschuetzt(self):
        a = asset(date_="1999-05-05T10:00:00.000Z", scan="2026-04-13")
        self.assertEqual(s.plan(entry_row(), a, {})["action"], "skip")

    def test_scan_datum_innerhalb_toleranz_gilt_nicht_als_hand(self):
        a = asset(date_="2026-04-14T10:00:00.000Z", scan="2026-04-13")
        self.assertEqual(s.plan(entry_row(), a, {})["action"], "write")


class OnlySourceAndPlace(unittest.TestCase):
    def test_nur_quelle_laesst_datum_in_ruhe(self):
        z = entry_row(onlySource=True, sourceUntouched=False, source="Fotoalbum 3, Seite 2, Foto 1")
        a = asset(date_="2011-08-07T10:00:00.000Z", scan="2011-08-07")
        p = s.plan(z, a, {})
        self.assertEqual(p["action"], "write")
        self.assertEqual(p["new_date"], "")
        self.assertFalse(p["date_change"])
        self.assertIn("Fotoalbum 3", p["new_description"])
        self.assertEqual(p["tags_add"], [])

    def test_nur_quelle_zweiter_lauf_unveraendert(self):
        z = entry_row(onlySource=True, sourceUntouched=False, source="Fotoalbum 3, Seite 2, Foto 1")
        a = asset(date_="2011-08-07T10:00:00.000Z", scan="2011-08-07")
        a2 = apply(s.plan(z, a, {}), a)
        self.assertEqual(s.plan(z, a2, {})["action"], "unchanged")

    def test_ort_nur_wenn_immich_keinen_hat(self):
        z = entry_row(onlyPlace=True, place={"lat": 51.7, "lon": 11.1, "name": "Ort 1"})
        p = s.plan(z, asset(), {})
        self.assertEqual(p["action"], "write")
        self.assertEqual(p["new_place"], (51.7, 11.1))
        a = asset(lat=48.0, lon=9.0)
        self.assertEqual(s.plan(z, a, {})["action"], "skip")
        z["placeForce"] = True
        self.assertEqual(s.plan(z, a, {})["new_place"], (51.7, 11.1))

    def test_gleicher_ort_ist_unveraendert(self):
        z = entry_row(onlyPlace=True, place={"lat": 51.7, "lon": 11.1, "name": "Ort 1"})
        self.assertEqual(s.plan(z, asset(lat=51.7004, lon=11.1004), {})["action"], "unchanged")


class Repeatability(unittest.TestCase):
    """Zweimal planen darf nichts Neues ergeben."""

    def check(self, z, a, fr=None):
        p1 = s.plan(z, a, fr or {})
        self.assertEqual(p1["action"], "write", p1["reason"])
        a2 = apply(p1, a)
        fr2 = {z["key"]: {"asset": z["asset"], "date": p1["new_date"]}} if p1["new_date"] else {}
        p2 = s.plan(z, a2, fr2)
        self.assertEqual(p2["action"], "unchanged", p2["reason"])

    def test_schaetzung(self):
        self.check(entry_row(), asset())

    def test_exakt(self):
        self.check(entry_row(date="1960-05-17", status="manuell"), asset())

    def test_offen(self):
        self.check(entry_row(year="", **{"from": "", "to": ""}), asset())

    def test_mit_art_und_ort(self):
        self.check(entry_row(kind="greeting_card", place={"lat": 51.7, "lon": 11.1, "name": "Ort 1"}), asset())


@unittest.skipUnless(os.path.exists(os.path.join(DATA, "adoption.json")) and os.path.exists(os.path.join(DATA, "dating_backup.json")),
                     "keine anonymisierten Testdaten in tests/data")
class WithRealData(unittest.TestCase):
    """Fuer jedes Foto der Uebernahme: Zustand VOR dem Schreiben aus der Sicherung nachbauen und pruefen."""

    @classmethod
    def setUpClass(cls):
        with open(os.path.join(DATA, "adoption.json"), encoding="utf-8") as f:
            cls.rows = json.load(f)["rows"]
        with open(os.path.join(DATA, "dating_backup.json"), encoding="utf-8") as f:
            cls.sure = json.load(f)

    def previous(self, z):
        sv = self.sure[z["key"]]
        return {"exifInfo": {"dateTimeOriginal": sv["date"], "description": sv["description"],
                             **({"latitude": sv["latitude"], "longitude": sv["longitude"]} if sv.get("latitude") is not None else {})},
                "fileCreatedAt": "", "tags": [{"value": t} for t in sv["tags"]]}

    def test_alle_zeilen_planbar_und_wiederholbar(self):
        n = 0
        for z in self.rows:
            if z["key"] not in self.sure:
                continue
            a = self.previous(z)
            p1 = s.plan(z, a, {})
            self.assertIn(p1["action"], ("write", "unchanged", "skip"), z["key"])
            if p1["action"] != "write":
                continue
            a2 = apply(p1, a)
            fr = {z["key"]: {"asset": z["asset"], "date": p1["new_date"], **({"only_source": True} if p1.get("only_source") else {})}}
            p2 = s.plan(z, a2, fr)
            self.assertEqual(p2["action"], "unchanged", f"{z['key']}: {p2['reason']}")
            n += 1
        self.assertGreater(n, 100)

    def test_nur_quelle_zeilen_aendern_kein_datum(self):
        for z in self.rows:
            if z.get("onlySource") or z.get("onlyPlace"):
                a = self.previous(z)
                p = s.plan(z, a, {})
                self.assertEqual(p["new_date"], "", z["key"])
                self.assertFalse(p["date_change"], z["key"])


if __name__ == "__main__":
    unittest.main()
