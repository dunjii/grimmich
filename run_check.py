"""Does the heavy evaluation (age estimate, series comparison) really have to run on Update?

After a complete, successful run Grimmich remembers a "fingerprint" of everything
that influences the results. On the next update, after checking the changes in Immich, it is
compared: if everything is the same, age estimate and series comparison are skipped. When in doubt everything runs.
What counts: the state in Immich (photos, faces, names, birth dates), confirmed series, kinds (card, document ...),
the text files for manual/separated series, known years, the version and the program code of the evaluation.
"""
import hashlib
import json
import os
from datetime import datetime

import storage

MARKER = "run_marker.json"
CODE = ("estimate.py", "series.py", "calculation.py", "immich.py", "VERSION")
TEXTS = ("series_manual.txt", "series_separate.txt", "known_years.csv")
RESULTS = ("estimates_body.csv",)   # if one of these files is missing, it has to be computed


def _file(name):
    try:
        with open(name, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None


def fingerprint():
    """-> text, or None = it must be computed in any case."""
    if not storage.present("immich_state.json") or not storage.present("age_per_photo.json") or not storage.present("series.json"):
        return None
    if any(not os.path.exists(n) for n in RESULTS):
        return None
    new_ = storage.load("reload.json", None)
    if new_ and new_.get("assets"):
        return None   # photos with a changed image still wait for a new computation
    work = storage.load("series_work.json", {}) or {}
    confirmed = sorted((s.get("id", ""), list(s.get("photos", []))) for s in work.get("series", []) if s.get("status") == "ok")
    parts = {
        "state": storage.load("immich_state.json", None),
        "series_ok": confirmed,
        "kinds": storage.load("kinds.json", {}),
        "texts": {n: _file(n) for n in TEXTS},
        "code": {n: _file(n) for n in CODE},
    }
    return hashlib.sha256(json.dumps(parts, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def remember(fp):
    """Call after a complete, successful run."""
    if fp:
        storage.save(MARKER, {"fp": fp, "time": datetime.now().strftime("%Y-%m-%d %H:%M")})


def forget():
    """At the start of every job that changes results: the fingerprint only applies again after a new, complete run."""
    storage.remove(MARKER)


def old():
    m = storage.load(MARKER, None)
    return m.get("fp") if isinstance(m, dict) else None


def unchanged(age_fp):
    fp = fingerprint()
    return bool(fp) and fp == age_fp, fp
