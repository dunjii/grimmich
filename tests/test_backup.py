import datetime
import os
import sqlite3
import tempfile
import unittest

import backup


class TestBackup(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.mkdtemp()
        self.db = os.path.join(self.folder, "grimmich.db")
        c = sqlite3.connect(self.db)
        c.execute("create table t (x text)")
        c.execute("insert into t values ('hello')")
        c.commit()
        c.close()

    def test_a_copy_is_made_once_a_day_and_readable(self):
        day = datetime.date(2026, 11, 4)
        path = backup.make_copy(self.db, day)
        self.assertEqual(os.path.basename(path), "grimmich-2026-11-04.db")
        self.assertEqual(sqlite3.connect(path).execute("select x from t").fetchone()[0], "hello")
        self.assertIsNone(backup.make_copy(self.db, day))   # the same day: nothing new

    def test_only_the_last_copies_are_kept(self):
        os.environ["GRIMMICH_BACKUPS_KEEP"] = "3"
        try:
            for i in range(6):
                backup.make_copy(self.db, datetime.date(2026, 11, 1) + datetime.timedelta(days=i))
        finally:
            del os.environ["GRIMMICH_BACKUPS_KEEP"]
        names = sorted(os.listdir(os.path.join(self.folder, "backups")))
        self.assertEqual(names, ["grimmich-2026-11-04.db", "grimmich-2026-11-05.db", "grimmich-2026-11-06.db"])

    def test_no_database_no_copy_and_switch_off(self):
        self.assertIsNone(backup.make_copy(os.path.join(self.folder, "none.db")))
        os.environ["GRIMMICH_BACKUPS"] = "0"
        try:
            self.assertFalse(backup.enabled())
            self.assertIsNone(backup.start(self.db))
        finally:
            del os.environ["GRIMMICH_BACKUPS"]


if __name__ == "__main__":
    unittest.main()
