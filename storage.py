"""Storage: all of Grimmich's working data lives in ONE database file (grimmich.db, SQLite).

Earlier, each kind of data lay in its own .json file. Now each of these documents is a row
in the database. The shape of the data stays the same, only the place changes. Advantages: a crash
cannot leave anything half written (every change applies completely or not at all), and a backup is a single file.

On first start existing .json files are adopted automatically and then moved to the folder
json_old (as a backup). To look at the data or pass it on:
    python storage.py export        writes all documents as .json files into the folder export
"""
from messages import tx
import json
import os
import shutil
import sqlite3
import sys
import threading

import migration

DB_FILE_NAME = "grimmich.db"
OLD_FOLDER = "json_old"

# documents that live in the database. Everything else (caches, probes, keys) stays a file.
NAMES = (
    "adoption.json", "age_per_photo.json", "assignment.json", "changes.json", "corrections.json",
    "dating_backup.json", "dating_written.json", "event_assignment.json", "gramps_input.json", "gramps_preview.json",
    "game_votes.json", "notes.json", "gramps_result.json", "gramps_written.json", "immich_data.json", "immich_state.json", "inbox.json", "kinds.json", "model_check.json",
    "order.json", "people.json", "photos.json", "players.json", "place_assignment.json", "provenance.json", "provenance_albums.json",
    "reload.json", "run_marker.json", "series.json", "series_work.json", "write_preview.json", "write_result.json",
)

_lock_ = threading.Lock()
_migrated = set()


def _connect():
    migration.run(DB_FILE_NAME)   # older databases (German names) are switched once; see migration.py
    db = sqlite3.connect(DB_FILE_NAME, timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE IF NOT EXISTS documents (name TEXT PRIMARY KEY, content TEXT NOT NULL, changed TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    db.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    db.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema', ?)", (str(migration.SCHEMA),))
    return db


def _name(path_):
    return os.path.basename(str(path_))


def in_db(path_):
    return _name(path_) in NAMES


def migriere():
    """Adopt existing .json files into the database once and move them to json_old."""
    with _lock_:
        path_ = os.path.abspath(DB_FILE_NAME)
        if path_ in _migrated:
            return []
        _migrated.add(path_)
        adopted = []
        present = [n for n in NAMES if os.path.exists(n)]
        if not present:
            return adopted
        db = _connect()
        try:
            for n in present:
                try:
                    with open(n, encoding="utf-8") as f:
                        text = f.read()
                    data_ = json.loads(text)
                except (OSError, ValueError):
                    continue   # broken file: stays where it is, is not adopted
                with db:
                    new_ = db.execute("INSERT OR IGNORE INTO documents (name, content) VALUES (?, ?)", (n, json.dumps(data_, ensure_ascii=False))).rowcount == 1
                if new_:   # check back for safety before the file is put away
                    row = db.execute("SELECT content FROM documents WHERE name = ?", (n,)).fetchone()
                    if row is None or json.loads(row[0]) != data_:
                        continue
                os.makedirs(OLD_FOLDER, exist_ok=True)
                target_ = os.path.join(OLD_FOLDER, n)
                if os.path.exists(target_):   # never overwrite an earlier backup
                    target_ = os.path.join(OLD_FOLDER, f"{n}.{int(os.path.getmtime(n))}")
                try:
                    shutil.move(n, target_)
                except OSError:
                    continue
                adopted.append(n)
        finally:
            db.close()
        return adopted


def present(path_):
    if not in_db(path_):
        return os.path.exists(path_)
    migriere()
    db = _connect()
    try:
        return db.execute("SELECT 1 FROM documents WHERE name = ?", (_name(path_),)).fetchone() is not None
    finally:
        db.close()


def load(path_, default=None):
    if not in_db(path_):
        try:
            with open(path_, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return default
    migriere()
    db = _connect()
    try:
        row = db.execute("SELECT content FROM documents WHERE name = ?", (_name(path_),)).fetchone()
    finally:
        db.close()
    if row is None:
        return default
    try:
        return json.loads(row[0])
    except ValueError:
        return default


def save(path_, data_):
    if not in_db(path_):
        tmp = str(path_) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data_, f, ensure_ascii=False)
        os.replace(tmp, path_)
        return
    migriere()
    text = json.dumps(data_, ensure_ascii=False)
    db = _connect()
    try:
        with db:
            db.execute("INSERT INTO documents (name, content, changed) VALUES (?, ?, CURRENT_TIMESTAMP) "
                       "ON CONFLICT(name) DO UPDATE SET content = excluded.content, changed = CURRENT_TIMESTAMP", (_name(path_), text))
    finally:
        db.close()


def remove(path_):
    if not in_db(path_):
        try:
            os.remove(path_)
        except OSError:
            pass
        return
    migriere()
    db = _connect()
    try:
        with db:
            db.execute("DELETE FROM documents WHERE name = ?", (_name(path_),))
    finally:
        db.close()


def all_names():
    migriere()
    db = _connect()
    try:
        return [r[0] for r in db.execute("SELECT name FROM documents ORDER BY name")]
    finally:
        db.close()


def export(folder="export"):
    """Output all documents as readable .json files (for looking at, passing on or for anonymising)."""
    os.makedirs(folder, exist_ok=True)
    n = 0
    for name in all_names():
        data_ = load(name, None)
        with open(os.path.join(folder, name), "w", encoding="utf-8") as f:
            json.dump(data_, f, ensure_ascii=False, indent=1)
        n += 1
    return n


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    if len(sys.argv) > 1 and sys.argv[1] == "export":
        print(tx("{n} documents written to the folder 'export'.", n=export()))
    else:
        u = migriere()
        print(tx("{n} files taken over into the database.", n=len(u)) if u else tx("Nothing to take over."))
        print(tx("Documents in the database:"), ", ".join(all_names()) or "keine")
