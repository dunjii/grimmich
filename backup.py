"""A daily copy of the database next to it (folder "backups"), the last 14 are kept.

It is a safety net against a wrong click or a broken file, not against a broken disk: the copy lies on the same disk.
Switch it off with GRIMMICH_BACKUPS=0; GRIMMICH_BACKUPS_KEEP sets how many copies are kept (default 14)."""
import datetime
import glob
import os
import sqlite3
import threading
import time

FOLDER = "backups"
PATTERN = "grimmich-*.db"


def enabled():
    return os.environ.get("GRIMMICH_BACKUPS", "1").strip() not in ("0", "off", "no", "false")


def keep_count(db_size=0):
    try:
        keep = max(1, int(os.environ.get("GRIMMICH_BACKUPS_KEEP", "14")))
    except ValueError:
        keep = 14
    if db_size > 2 * 1024 ** 3:   # a huge database: fewer copies so that the disk does not fill up
        keep = min(keep, 3)
    return keep


def make_copy(db_file, today=None):
    """Copies the database (SQLite backup, also fine while it is in use) to backups/grimmich-YYYY-MM-DD.db unless today's copy exists.
    -> path of the new copy, or None (exists already / no database). Old copies beyond the limit are removed."""
    db_file = os.path.abspath(db_file)
    if not os.path.isfile(db_file):
        return None
    folder = os.path.join(os.path.dirname(db_file), FOLDER)
    target = os.path.join(folder, "grimmich-{}.db".format((today or datetime.date.today()).isoformat()))
    if os.path.exists(target):
        return None
    os.makedirs(folder, exist_ok=True)
    part = target + ".part"
    src = sqlite3.connect(db_file, timeout=30)
    dst = sqlite3.connect(part)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    os.replace(part, target)
    for old in sorted(glob.glob(os.path.join(folder, PATTERN)))[:-keep_count(os.path.getsize(db_file))]:
        try:
            os.remove(old)
        except OSError:
            pass
    return target


def start(db_file, log=print):
    """Checks once an hour in the background whether today's copy exists."""
    if not enabled():
        return None

    def run():
        while True:
            try:
                made = make_copy(db_file)
                if made:
                    log("Backup: " + made)
            except Exception as e:   # a failed copy must never stop Grimmich
                log("Backup failed: {}".format(e))
            time.sleep(3600)
    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t
