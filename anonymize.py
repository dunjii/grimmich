"""Create anonymised copies of the Grimmich data, to hand over to Claude.

Usage (in the Grimmich folder):   ./.venv/bin/python anonymize.py

Reads the JSON files from the current folder and writes copies into the subfolder "anonym".
The originals are not changed. Replaced are:
  - person names (also first and last names separately)   -> "Person 1", "Person 2" ...
  - album names, place names                               -> "Album 1", "Place 1" ...
  - photo keys and file names                              -> "F0001", "F0002" ...
  - Immich IDs (UUIDs)                                     -> "ID-0001" ...
  - free texts (description, note, title ...)              -> "Text 1" ...
  - coordinates are rounded to 0.1 degree (about 10 km).
Not changed are years, dates and birth dates. That is the data that matters.
The mapping "Person 3 = real name" is in anonymize_key.json (in the Grimmich folder, NOT in
"anonym"). Please do not pass this file on. Credentials (.env) are never read.
"""
import json
import os
import re
import sys

import storage

OFF = "anonym"
KEY_CONST = "anonymize_key.json"
# files Claude needs for tests. More with:  anonymize.py file1.json file2.json
DEFAULT = [
    "immich_state.json", "age_per_photo.json", "photos.json", "corrections.json", "series_work.json", "series.json",
    "kinds.json", "place_assignment.json", "order.json", "provenance_albums.json", "provenance.json", "immich_data.json",
    "people.json", "assignment.json", "event_assignment.json", "inbox.json", "changes.json", "adoption.json",
    "write_preview.json", "write_result.json", "dating_written.json", "dating_backup.json",
]
# files with names of albums or places (for the rest: names are people)
ALBUM_FILES = {"provenance_albums.json"}
PLACE_FILES = {"place_assignment.json"}
TEXT_FIELDS = {"beschreibung", "notiz", "text", "titel", "kommentar", "anmerkung", "description", "datei", "title", "file", "note", "comment", "remark", "new_note",
               "originalFileName", "originalPath", "pfad", "url", "adresse", "address"}
NAME_FIELDS = {"name", "personName", "albumName", "albumname"}
NAME_LISTS = {"namen", "personen", "alle", "names", "people", "all"}   # fields with lists of names
COORD_FIELDS = {"lat", "lon", "latitude", "longitude"}
KEY_RE = re.compile(r"^.+_[0-9a-f]{6}$")
UUID_RE = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
SMALL_WORDS = {"von", "van", "der", "die", "das", "und", "zu", "zur", "dem", "den", "de", "da", "del", "la", "le"}


def load_(path_):
    # reads from the database (grimmich.db) or, if not there, from a file
    data_ = storage.load(path_, None)
    if data_ is None:
        print(f"  {path_}: nicht vorhanden oder nicht lesbar, uebersprungen")
    return data_


def run_it(x, f_value, f_key, field=None):
    """Walk through a JSON structure and rebuild it with replaced values."""
    if isinstance(x, dict):
        return {f_key(k): run_it(v, f_value, f_key, k) for k, v in x.items()}
    if isinstance(x, list):
        return [run_it(v, f_value, f_key, field) for v in x]
    return f_value(x, field)


class Zuordnung:
    def __init__(self):
        self.name_list = {}      # echter Text -> Ersatz
        self.counters = {}

    def new_(self, previous, prefix_, width_=0):
        if previous in self.name_list:
            return self.name_list[previous]
        n = self.counters[prefix_] = self.counters.get(prefix_, 0) + 1
        replacement = f"{prefix_}{n:0{width_}d}" if width_ else f"{prefix_} {n}"
        self.name_list[previous] = replacement
        return replacement


def main():
    files_ = sys.argv[1:] or DEFAULT
    data_ = {}
    for d in files_:
        if d.endswith(".env") or not os.path.exists(d):
            continue
        content = load_(d)
        if content is not None:
            data_[d] = content
    if not data_:
        sys.exit("Keine JSON-Dateien gefunden. Bitte im Grimmich-Ordner starten (dort liegt auch grimmich.py).")

    # ---- first round: collect what has to be replaced
    people_, albums, places_, key_ = [], [], [], set()

    def collect_value(w, field):
        if isinstance(w, str):
            if KEY_RE.match(w) or any(KEY_RE.match(t) for t in w.split("|") if t):
                key_.update(t for t in w.split("|") if KEY_RE.match(t))
        return w

    def collect_keys(k):
        if isinstance(k, str) and KEY_RE.match(k):
            key_.add(k)
        return k

    for d, x in data_.items():
        run_it(x, collect_value, collect_keys)

        def collect_names(x, d):
            if isinstance(x, dict):
                for k, v in x.items():
                    if k in NAME_FIELDS and isinstance(v, str) and v.strip():
                        (albums if d in ALBUM_FILES else places_ if d in PLACE_FILES else people_).append(v)
                    elif k in NAME_LISTS and isinstance(v, (list, dict)):
                        # list of names, or (people.json) dictionary photo -> list of names
                        for items_list in (v.values() if isinstance(v, dict) else [v]):
                            if isinstance(items_list, list):
                                people_.extend(s for s in items_list if isinstance(s, str) and s.strip())
                    collect_names(v, d)
            elif isinstance(x, list):
                for v in x:
                    collect_names(v, d)
        collect_names(x, d)

    z = Zuordnung()
    # order: people first (so that person 1 is the same person everywhere), then albums, places
    for n in sorted(set(people_)):
        z.new_(n, "Person")
    for n in sorted(set(albums)):
        z.new_(n, "Album")
    for n in sorted(set(places_)):
        z.new_(n, "Ort")
    for i, k in enumerate(sorted(key_), 1):
        z.name_list[k] = f"F{i:04d}"
    # replace name parts (first/last names) one by one, so they disappear in texts like "Anna: 31.2 y" as well
    parts = {}
    for n in set(people_) | set(albums) | set(places_):
        for t in re.split(r"[\s,;/()]+", n):
            t = t.strip(".-")
            if len(t) >= 3 and not any(c.isdigit() for c in t) and t.lower() not in SMALL_WORDS and t not in parts and t not in z.name_list:   # never replace numbers (years in album names) on their own
                parts[t] = z.name_list[n]
    replacements = {**parts, **{k: v for k, v in z.name_list.items()}}
    # longest first, so that "Anna Smith" is replaced before "Anna"
    muster = sorted(replacements, key=len, reverse=True)
    # replace whole words only (never inside a word like "confirmed")
    GRENZE_V, GRENZE_N = r"(?<![\w])", r"(?![\w])"
    regex = re.compile(GRENZE_V + "(?:" + "|".join(re.escape(m) for m in muster) + ")" + GRENZE_N) if muster else None
    uuids = {}
    texts = {}

    def uuid_replacement(m):
        u = m.group(0).lower()
        if u not in uuids:
            uuids[u] = f"ID-{len(uuids) + 1:04d}"
        return uuids[u]

    def replace_text(s):
        if regex:
            # replace keys only as a whole or between "|"; names also in the middle of a text
            s = regex.sub(lambda m: replacements[m.group(0)], s)
        return UUID_RE.sub(uuid_replacement, s)

    def value(w, field):
        if isinstance(w, bool) or w is None:
            return w
        if isinstance(w, (int, float)):
            if field in COORD_FIELDS:
                return round(w, 1)
            return w
        if isinstance(w, str):
            if field in TEXT_FIELDS and w.strip():
                if w not in texts:
                    texts[w] = f"Text {len(texts) + 1}"
                return texts[w]
            return replace_text(w)
        return w

    def ky(k):
        # field names (e.g. "birth", "confirmed") always stay unchanged. Only photo keys and IDs are replaced.
        if not isinstance(k, str):
            return k
        if k in z.name_list:
            return z.name_list[k]
        if "|" in k:
            k = "|".join(z.name_list.get(t, t) for t in k.split("|"))
        return UUID_RE.sub(uuid_replacement, k)

    os.makedirs(OFF, exist_ok=True)
    for d, x in data_.items():
        new_ = run_it(x, value, ky)
        with open(os.path.join(OFF, d), "w", encoding="utf-8") as f:
            json.dump(new_, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {d}: geschrieben")

    # coordinates in lists [lat, lon] or box values stay unchanged (face boxes are pixels).
    with open(KEY_CONST, "w", encoding="utf-8") as f:
        json.dump({"names": z.name_list, "uuids": uuids, "texts": texts}, f, ensure_ascii=False, indent=1)

    # ---- check: is anything real left in the copies?
    real_ones = [n for n in set(people_) | set(albums) | set(places_) | set(parts) if len(n) >= 3] + sorted(key_) + list(uuids)
    real_ones = [e for e in real_ones if e]
    problems = {}
    for d in data_:
        with open(os.path.join(OFF, d), encoding="utf-8") as f:
            content = f.read()
        # fast: collect all words of the file once and check by set comparison
        words = set(re.findall(r"\w+", content)) | set(re.findall(r"[\w-]+", content))
        for e in real_ones:
            if e in ("Person", "Album", "Ort", "Text"):
                continue
            if re.fullmatch(r"[\w-]+", e):
                hits = e in words
            else:
                hits = e in content   # names with spaces or similar
            if hits:
                problems.setdefault(d, set()).add(e)
    print()
    print(f"Personen: {len(set(people_))}, Alben: {len(set(albums))}, Orte: {len(set(places_))}, Fotos: {len(key_)}, IDs: {len(uuids)}, Freitexte: {len(texts)}")
    if problems:
        print("ACHTUNG: In den Kopien kommt noch Echtes vor (bitte nicht weitergeben, sondern mir melden):")
        for d, s in problems.items():
            print(f"  {d}: {', '.join(sorted(s)[:8])}")
    else:
        print("Pruefung bestanden: kein echter Name, Fotoschluessel oder ID steht mehr in den Kopien.")
    print(f"\nFertig. Die anonymen Kopien liegen im Ordner '{OFF}'. Der Schluessel '{KEY_CONST}' bleibt bei dir.")


if __name__ == "__main__":
    main()
