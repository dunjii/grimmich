"""One-time switch of the stored data from German to English names (schema version 2).

What happens, once, when Grimmich starts with an older database (grimmich.db):
  1. A full copy of the database is saved as grimmich.db.vor-englisch (and never overwritten).
  2. All documents, field names and internal codes are renamed according to rename_map.py.
  3. Every renamed document is converted back and compared with the original. Only if ALL documents are
     identical after the round trip, the new data replaces the old data (one transaction, all or nothing).
  4. If anything is wrong, nothing is changed, the program stops with a clear message, and the copy stays.

    python migration.py report     compares grimmich.db with the saved copy and prints the numbers
"""
import json
import shutil
import os
import sqlite3
import sys
import threading

import messages
import rename_map

DB_FILE = "grimmich.db"
BACKUP_FILE = "grimmich.db.vor-englisch"
SCHEMA = 2

_lock = threading.Lock()
_done = set()


class MigrationError(Exception):
    pass


def _invert(mapping):
    inv = {}
    for old, new in mapping.items():
        if new in inv and inv[new] != old:
            raise MigrationError(f"rename table is ambiguous: {inv[new]!r} and {old!r} both become {new!r}")
        inv[new] = old
    return inv


FIELDS_BACK = _invert(rename_map.FIELDS)
VALUES_BACK = {field: _invert(v) for field, v in rename_map.VALUES.items()}
DOCUMENTS_BACK = _invert(rename_map.DOCUMENTS)


def _convert(x, fields, values, doc_values, field=None, reverse=False):
    """Rename dictionary keys and internal codes; returns a new structure."""
    if isinstance(x, dict):
        out = {}
        for k, v in x.items():
            nk = fields.get(k, k) if isinstance(k, str) else k
            if nk in out:
                raise MigrationError(f"two fields become {nk!r}")
            out[nk] = _convert(v, fields, values, doc_values, k if reverse else nk, reverse)
        return out
    if isinstance(x, list):
        return [_convert(v, fields, values, doc_values, field, reverse) for v in x]
    if isinstance(x, str):
        if field in doc_values:
            return doc_values[field].get(x, x)
        if field in values:
            return values[field].get(x, x)
    return x


def to_english(x, doc=None):
    """doc = NEW document name without .json (for the per-document code tables)."""
    return _convert(x, rename_map.FIELDS, rename_map.VALUES, rename_map.VALUES_DOC.get(doc, {}))


def to_german(x, doc=None):
    back = {f: _invert(v) for f, v in rename_map.VALUES_DOC.get(doc, {}).items()}
    return _convert(x, FIELDS_BACK, VALUES_BACK, back, reverse=True)


def new_name(name):
    stem, dot, ext = name.rpartition(".")
    if not dot:
        return name
    return rename_map.DOCUMENTS.get(stem, rename_map.FILES.get(stem, stem)) + "." + ext


def leaves(x):
    if isinstance(x, dict):
        return sum(leaves(v) for v in x.values())
    if isinstance(x, list):
        return sum(leaves(v) for v in x)
    return 1


def _has_table(db, name):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def version(db):
    if not _has_table(db, "meta"):
        return 1 if _has_table(db, "dokumente") else 0
    row = db.execute("SELECT value FROM meta WHERE key='schema'").fetchone()
    return int(row[0]) if row else 1


def _backup(path):
    target = path + ".vor-englisch" if not path.endswith(".db") else path + ".vor-englisch"
    if os.path.exists(target):
        return target
    src = sqlite3.connect(path)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return target


def run(path=DB_FILE):
    """Bring the database to the current schema. Safe to call many times."""
    full = os.path.abspath(path)
    with _lock:
        if full in _done:
            return
        if not os.path.exists(full):
            _done.add(full)
            return
        db = sqlite3.connect(full, timeout=30)
        try:
            v = version(db)
            if v >= SCHEMA or v == 0:
                _done.add(full)
                return
            _migrate_1_to_2(db, full)
            _done.add(full)
        finally:
            db.close()
    _rename_cache_files(os.path.dirname(full) or ".")


def _migrate_1_to_2(db, full):
    rows = db.execute("SELECT name, inhalt, geaendert FROM dokumente").fetchall()
    backup = _backup(full)
    print(messages.tx("The database is switched to English names once. Copy of the old data: {file_path}", file_path=backup), flush=True)
    converted = []
    for name, content, changed in rows:
        try:
            data = json.loads(content)
        except ValueError:
            raise MigrationError(messages.tx("The database switch did not work ({grund}). Nothing was changed. The copy is in {file_path}.", grund=name, file_path=backup))
        doc = new_name(name)[:-5]
        new = to_english(data, doc)
        if to_german(new, doc) != data or leaves(new) != leaves(data):
            raise MigrationError(messages.tx("The database switch did not work ({grund}). Nothing was changed. The copy is in {file_path}.", grund=name, file_path=backup))
        converted.append((new_name(name), json.dumps(new, ensure_ascii=False), changed))
    names = [c[0] for c in converted]
    if len(set(names)) != len(names):
        raise MigrationError("two documents get the same new name; nothing was changed")
    with db:
        db.execute("CREATE TABLE documents (name TEXT PRIMARY KEY, content TEXT NOT NULL, changed TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        db.executemany("INSERT INTO documents (name, content, changed) VALUES (?, ?, ?)", converted)
        db.execute("DROP TABLE dokumente")
        db.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)", (str(SCHEMA),))
    print(messages.tx("Switch done: {n} documents checked and taken over.", n=len(converted)), flush=True)


def _rename_cache_files(folder):
    """Cache files next to the database: convert the content and use the new file name. The old file stays as .vor-englisch."""
    for old_stem, new_stem in rename_map.FILES.items():
        old = os.path.join(folder, old_stem + ".json")
        new = os.path.join(folder, new_stem + ".json")
        if not os.path.exists(old) or os.path.exists(new):
            continue
        try:
            with open(old, encoding="utf-8") as f:
                data = json.load(f)
            conv = to_english(data)
            if to_german(conv) != data:
                continue
            with open(new + ".tmp", "w", encoding="utf-8") as f:
                json.dump(conv, f, ensure_ascii=False)
            os.replace(new + ".tmp", new)
            os.replace(old, old + ".vor-englisch")
        except (OSError, ValueError, MigrationError):
            continue   # cache files are rebuilt when missing


# ---- German file and folder names of earlier versions -> English (renamed once, never overwriting)
FILE_NAMES = {
    "schaetzung.csv": "estimates.csv", "schaetzung_koerper.csv": "estimates_body.csv",
    "bekannte_jahre.csv": "known_years.csv", "serien.csv": "series.csv", "serien_vorschlaege.csv": "series_suggestions.csv",
    "serien_manuell.txt": "series_manual.txt", "serien_getrennt.txt": "series_separate.txt", "serien_cache.npz": "series_cache.npz",
    "ausgabe_immich": "control_images", "ausgabe_immich_koerper": "control_images_body",
    "serien_ausgabe": "series_output", "json_alt": "json_old",
}
CSV_HEADERS = {
    "Datei": "File", "Schaetzung Jahr": "Estimated year", "von": "from", "bis": "to", "Gesichter genutzt": "Faces used",
    "Hinweis": "Hint", "Ausreisser": "Outliers", "Vorschlag ohne Ausreisser": "Suggestion without outliers",
    "Aktuelles Datum": "Current date", "Asset-ID": "Asset ID", "Serie": "Series", "Einzelschaetzung": "Single estimate",
    "Serie A": "Series A", "Serie B": "Series B", "Schluessel A": "Key A", "Schluessel B": "Key B",
    "Gemeinsame Personen": "Shared people", "Jahr A": "Year A", "Jahr B": "Year B", "Bestaetigt (ja/nein)": "Confirmed (yes/no)",
    "Schluessel": "Key", "Zusammenhalt der Serie": "Series cohesion",
}


def _translate_header(path):
    """First line of a CSV file: German column names -> English. Everything else stays as it is."""
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            text = f.read()
        first, sep, rest = text.partition("\n")
        cr = "\r" if first.endswith("\r") else ""
        names = first.rstrip("\r").split(";")
        if not any(n in CSV_HEADERS for n in names):
            return
        first = ";".join(CSV_HEADERS.get(n, n) for n in names) + cr
        with open(path + ".tmp", "w", encoding="utf-8-sig", newline="") as f:
            f.write(first + sep + rest)
        os.replace(path + ".tmp", path)
    except OSError:
        pass


def rename_files(folder="."):
    """Use the English names for files and folders of earlier versions (once; an existing new name is never overwritten)."""
    for old, new in FILE_NAMES.items():
        old_path, new_path = os.path.join(folder, old), os.path.join(folder, new)
        if os.path.exists(old_path) and not os.path.exists(new_path):
            try:
                os.rename(old_path, new_path)
            except OSError:
                continue
    out = os.path.join(folder, "series_output")
    if os.path.isdir(out):
        old_photos, new_photos = os.path.join(out, "fotos"), os.path.join(out, "photos")
        if os.path.isdir(old_photos) and not os.path.exists(new_photos):
            try:
                os.rename(old_photos, new_photos)
            except OSError:
                pass
        for name in os.listdir(out):
            if name.startswith("serie_") and name.endswith(".jpg") and not os.path.exists(os.path.join(out, "series_" + name[6:])):
                try:
                    os.rename(os.path.join(out, name), os.path.join(out, "series_" + name[6:]))
                except OSError:
                    pass
    for name in ("estimates.csv", "estimates_body.csv", "series.csv", "series_suggestions.csv"):
        if os.path.isfile(os.path.join(folder, name)):
            _translate_header(os.path.join(folder, name))


def report(path=DB_FILE):
    backup = path + ".vor-englisch"
    if not os.path.exists(backup):
        print("No copy found (grimmich.db.vor-englisch): this database was never switched.")
        return 1
    old = sqlite3.connect(backup)
    new = sqlite3.connect(path)
    bad = 0
    print(f"{'document (old -> new)':58s}{'entries':>9s}{'values':>10s}  check")
    for name, content in old.execute("SELECT name, inhalt FROM dokumente ORDER BY name"):
        data = json.loads(content)
        row = new.execute("SELECT content FROM documents WHERE name = ?", (new_name(name),)).fetchone()
        if row is None:
            print(f"{name:58s}MISSING"); bad += 1; continue
        now = json.loads(row[0])
        same = to_german(now, new_name(name)[:-5]) == data
        n_old = len(data) if isinstance(data, (dict, list)) else 1
        n_new = len(now) if isinstance(now, (dict, list)) else 1
        label = f"{name} -> {new_name(name)}"
        ok = same and n_old == n_new and leaves(data) == leaves(now)
        bad += 0 if ok else 1
        print(f"{label:58s}{n_new:9d}{leaves(now):10d}  {'identical' if ok else 'DIFFERENT'}")
    print("ALL IDENTICAL" if not bad else f"{bad} PROBLEMS")
    return 1 if bad else 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "report":
        sys.exit(report())
    run()
    print("Database is up to date.")


# ---------------------------------------------------------------------------------------------
# Access files (.env): file names and variable names are English now. Done once; the old files stay as *.vor-englisch.

ENV_FILES = {"immich_schreiben.env": "immich_write.env", "gramps_schreiben.env": "gramps_write.env"}
ENV_VARS = {"GRAMPS_PASSWORT": "GRAMPS_PASSWORD", "IMMICH_ANKERALBUM": "IMMICH_ANCHOR_ALBUM", "SCHREIB_GETRENNT": "SEPARATE_WRITE",
            "GRAMPS_ZITAT_BILD": "GRAMPS_CITATION_IMAGE", "IMMICH_AKTIV": "IMMICH_ACTIVE", "GRAMPS_AKTIV": "GRAMPS_ACTIVE"}


def _env_text(text):
    out = []
    for line in text.split("\n"):
        key, sep, rest = line.partition("=")
        out.append(ENV_VARS.get(key.strip(), key) + sep + rest if sep and not line.lstrip().startswith("#") else line)
    return "\n".join(out)


def migrate_env(folder="."):
    """Rename the old access files and variables. Returns the number of files changed. Safe to call again."""
    changed = 0
    for old, new in [(o, n) for o, n in ENV_FILES.items()] + [("immich.env", "immich.env"), ("gramps.env", "gramps.env")]:
        src, dst = os.path.join(folder, old), os.path.join(folder, new)
        if not os.path.exists(src):
            continue
        if old != new and os.path.exists(dst):
            continue   # the new file exists already: leave both alone
        try:
            with open(src, encoding="utf-8") as f:
                text = f.read()
            new_text = _env_text(text)
            if old == new and new_text == text:
                continue
            backup = src + ".vor-englisch"
            if not os.path.exists(backup):
                shutil.copy2(src, backup)
            with open(dst, "w", encoding="utf-8") as f:
                f.write(new_text)
            if old != new:
                os.remove(src)
            changed += 1
        except OSError:
            pass
    return changed
