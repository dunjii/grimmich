"""Immich capture date: which dates count as set by you, and the reason for the rest."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import immich_state  # noqa: E402


def photo(date, scan, **kw):
    return {"id": "abcdef123456", "originalFileName": "x.tif", "fileModifiedAt": scan + "T10:00:00Z", "fileCreatedAt": scan + "T10:00:00Z",
            "exifInfo": {"dateTimeOriginal": date + "T00:00:00Z", **kw}}


class DateCheckTest(unittest.TestCase):
    def why(self, p):
        return immich_state.date_check(p, "x_abcdef", {})["why"]

    def test_far_from_scan_counts(self):
        self.assertEqual(self.why(photo("1951-06-01", "2026-11-02")), "set")
        self.assertEqual(immich_state.hand_date(photo("1951-06-01", "2026-11-02"), "x_abcdef", {})["date"], "1951-06-01")

    def test_same_as_scan_does_not_count(self):
        p = photo("2026-11-02", "2026-11-02")
        self.assertEqual(self.why(p), "close")
        self.assertIsNone(immich_state.hand_date(p, "x_abcdef", {}))

    def test_immich_moves_fileCreatedAt_along(self):
        # after you change the date in Immich, fileCreatedAt shows the new date too; the file's own date stays
        p = photo("1927-07-01", "2026-11-02"); p["fileCreatedAt"] = "1927-07-01T00:00:00Z"
        self.assertEqual(self.why(p), "set")

    def test_camera_data_does_not_count(self):
        self.assertEqual(self.why(photo("1951-06-01", "2026-11-02", make="EPSON")), "camera")

    def test_no_date(self):
        self.assertEqual(self.why({"id": "a", "exifInfo": {}}), "nodate")


if __name__ == "__main__":
    unittest.main()
