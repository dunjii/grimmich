"""Tests for the anchor album and separate access: anchor photos count as a date, camera data in the working album does not,
anchors are never written, switch for the second access. No network.
Run in the Grimmich folder:   python3 -m unittest discover -s tests -v"""
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
for name in ("torch", "transformers", "numpy", "cv2", "PIL", "PIL.Image", "ultralytics", "timm"):   # the tests do not need the heavy packages
    try:
        __import__(name)
    except ImportError:
        sys.modules[name] = mock.MagicMock()
import estimate  # noqa: E402
import immich_state  # noqa: E402
import immich_write  # noqa: E402
import connections  # noqa: E402
import credentials  # noqa: E402


def photo(id_, date_="2026-07-03T10:00:00.000Z", scan="2026-10-20", make="", tags=(), description="", anchor_=False):
    f = {"id": id_, "originalFileName": id_ + ".jpg", "fileCreatedAt": scan + "T10:00:00.000Z", "tags": [{"value": t} for t in tags],
         "exifInfo": {"dateTimeOriginal": date_, "make": make, "description": description}}
    if anchor_:
        f["_anker"] = True
    return f


class TestHandDate(unittest.TestCase):
    def test_anchor_photo_counts_as_a_date(self):
        h = immich_state.hand_date(photo("a", make="Nikon", anchor_=True), "k", {})
        self.assertEqual(h["date"], "2026-07-03")
        self.assertTrue(h["camera"] and h["anchor"])

    def test_camera_in_the_working_album_does_not_count(self):
        self.assertIsNone(immich_state.hand_date(photo("a", make="Nikon"), "k", {}))

    def test_camera_in_the_working_album_goes_on_the_hint_list(self):
        self.assertTrue(immich_state.camera_without_anchor(photo("a", make="Nikon"), "k", {}))
        self.assertFalse(immich_state.camera_without_anchor(photo("a", make="Nikon", anchor_=True), "k", {}))
        self.assertFalse(immich_state.camera_without_anchor(photo("a"), "k", {}))                       # Scan ohne Kamera
        self.assertFalse(immich_state.camera_without_anchor(photo("a", make="Nikon", tags=["Datierung geschätzt"]), "k", {}))   # schon von Grimmich bearbeitet

    def test_date_set_by_hand_without_camera_stays_an_anchor(self):
        h = immich_state.hand_date(photo("a"), "k", {})
        self.assertEqual(h["date"], "2026-07-03")
        self.assertNotIn("anker", h)


class TestLoadAlbums(unittest.TestCase):
    def loading(self, work, anchor_, responses):
        def important(path_, data_=None, **kw):
            if path_ == "/albums":
                return [{"id": "A1", "albumName": "Arbeit"}, {"id": "A2", "albumName": "Anker"}]
            return {"assets": {"items": responses[data_["albumIds"][0]], "nextPage": None}}
        with mock.patch.object(estimate, "important", important), mock.patch.object(estimate, "ALBUM_NAME", work), mock.patch.object(estimate, "ANCHOR_NAME", anchor_):
            return estimate.load_album_photos()

    def test_without_anchor_album_only_the_working_album(self):
        photos = self.loading("Arbeit", "", {"A1": [{"id": "x"}], "A2": [{"id": "y"}]})
        self.assertEqual([f["id"] for f in photos], ["x"])

    def test_anchor_photos_are_marked(self):
        photos = self.loading("Arbeit", "Anker", {"A1": [{"id": "x"}], "A2": [{"id": "y"}]})
        self.assertEqual({f["id"]: bool(f.get("_anker")) for f in photos}, {"x": False, "y": True})

    def test_photo_in_both_albums_counts_as_working_photo(self):
        photos = self.loading("Arbeit", "Anker", {"A1": [{"id": "x"}], "A2": [{"id": "x"}, {"id": "y"}]})
        self.assertEqual({f["id"]: bool(f.get("_anker")) for f in photos}, {"x": False, "y": True})

    def test_unknown_anchor_album_is_ignored(self):
        photos = self.loading("Arbeit", "Gibt es nicht", {"A1": [{"id": "x"}]})
        self.assertEqual([f["id"] for f in photos], ["x"])


class TestWriteProtection(unittest.TestCase):
    def entry_row(self, **kw):
        z = {"key": "F1", "asset": "A", "year": 1960, "date": "", "from": 1955, "to": 1965, "status": "Schätzung", "source": "", "sourceUntouched": True,
             "onlySource": False, "onlyPlace": False, "place": None, "force": False, "manual_date": "", "kind": ""}
        z.update(kw)
        return z

    def test_anchor_row_is_never_written(self):
        a = photo("A", scan="2026-07-03")
        p = immich_write.plan(self.entry_row(anchor=True), a, {})
        self.assertEqual(p["action"], "skip")

    def test_camera_photo_in_the_working_album_is_written_normally(self):
        # working album = everything uncertain: camera data does not count there (real digital photos belong in the anchor album)
        a = photo("A", make="Nikon", scan="2026-07-03")
        p = immich_write.plan(self.entry_row(), a, {})
        self.assertEqual(p["action"], "write")

    def test_scan_without_camera_is_written_normally(self):
        a = photo("A", scan="2026-07-03")
        p = immich_write.plan(self.entry_row(), a, {})
        self.assertEqual(p["action"], "write")


class TestAccess(unittest.TestCase):
    def setUp(self):
        self.old = os.getcwd()
        self.tmp = tempfile.TemporaryDirectory()
        os.chdir(self.tmp.name)

    def tearDown(self):
        os.chdir(self.old)
        self.tmp.cleanup()

    def test_new_one_access(self):
        self.assertFalse(credentials.separate("immich"))
        self.assertEqual(credentials.write_env_name("immich"), "immich.env")

    def test_old_installation_with_write_file_stays_separate(self):
        with open("immich_write.env", "w") as f:
            f.write("IMMICH_API_KEY=x\n")
        self.assertTrue(credentials.separate("immich"))
        self.assertEqual(credentials.write_env_name("immich"), "immich_write.env")

    def test_switch_off_keeps_the_saved_key(self):
        connections.store("immich", {"url": "http://x", "read": "LESEN", "separate": "1", "write_access": "SCHREIBEN"})
        self.assertEqual(connections.status()["immich"]["separate"], True)
        connections.store("immich", {"separate": "0"})
        s = connections.status()["immich"]
        self.assertFalse(s["separate"])
        self.assertTrue(s["write_stored"])
        self.assertEqual(credentials.write_env_name("immich"), "immich.env")
        connections.store("immich", {"separate": "1"})
        self.assertEqual(connections.read_env("immich_write.env")["IMMICH_API_KEY"], "SCHREIBEN")

    def test_one_access_writes_no_second_key(self):
        connections.store("immich", {"url": "http://x", "read": "LESEN", "separate": "0", "write_access": "UNGEBRAUCHT"})
        self.assertFalse(os.path.exists("immich_write.env"))
        self.assertTrue(connections.status()["immich"]["write_access"])   # the one key also works for writing

    def test_save_and_remove_anchor_album(self):
        connections.store("immich", {"url": "http://x", "read": "L", "anchor": "Anker-Fotos"})
        self.assertEqual(connections.status()["immich"]["anchor"], "Anker-Fotos")
        connections.store("immich", {"anchor": ""})
        self.assertEqual(connections.status()["immich"]["anchor"], "")

    def test_gramps_one_user_for_both(self):
        connections.store("gramps", {"url": "http://g", "user": "u", "password": "p", "separate": "0"})
        self.assertEqual(credentials.write_env_name("gramps"), "gramps.env")
        connections.store("gramps_schreiben", {"url": "http://andere", "user": "w", "password": "q", "citation_image": "0"})
        self.assertFalse(os.path.exists("gramps_write.env"))   # im Ein-Zugang-Modus entsteht keine zweite Datei
        self.assertFalse(connections.status()["gramps_write"]["citation_image"])
        self.assertEqual(connections.read_env("gramps.env")["GRAMPS_USER"], "u")


if __name__ == "__main__":
    unittest.main()
