"""Grimmich: date photos with Gramps and Immich (runs only on your own computer).

Start (in the grimmich folder):
    ./.venv/bin/python grimmich.py
Then open  http://localhost:8765  in the browser. Quit: Ctrl+C in the terminal.

Grimmich only reads from Immich and Gramps. Immich is only changed when you go through
"Review changes" in the interface (preview, test, write) and have entered the write key
for it.
"""
import csv
import datetime
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))   # the program (code, web, languages)
DATA = os.environ.get("GRIMMICH_DATA") or HERE      # the working data (database, access files, caches); in Docker a separate folder
os.makedirs(DATA, exist_ok=True)
os.chdir(DATA)  # all data files live there, no matter where Grimmich is started from
HOST = os.environ.get("GRIMMICH_HOST") or "127.0.0.1"   # in Docker 0.0.0.0, so the port can be reached from outside the container

import calculation  # noqa: E402
import migration  # noqa: E402
import storage  # noqa: E402
import run_check as run_check_mod  # noqa: E402
from immich import Immich  # noqa: E402
import connections  # noqa: E402
import face_crops  # noqa: E402
import auth  # noqa: E402
import play  # noqa: E402
import credentials  # noqa: E402
import addresses  # noqa: E402
import messages  # noqa: E402
from messages import tx  # noqa: E402

PORT = int(os.environ.get("GRIMMICH_PORT") or 8765)   # a second Grimmich for trying things out runs on another port
READ_ONLY = bool((os.environ.get("GRIMMICH_READ_ONLY") or os.environ.get("GRIMMICH_NUR_LESEN")))   # test environment: nothing is written to Immich or Gramps
WEB = os.path.join(HERE, "web")
WORK = "series_work.json"
SERIES_JSON = "series.json"
PHOTOS_FILE = "photos.json"
RESULT_CSV = "estimates_body.csv"
PHOTO_FOLDER = os.path.join("series_output", "photos")
SCRIPTS = {k: os.path.join(HERE, f) for k, f in {"series": "series.py", "estimate": "estimate.py", "names": "names.py", "state": "immich_state.py",
                                                   "write": "immich_write.py", "provenance": "provenance.py", "gramps": "gramps_write.py"}.items()}
PIPELINE = ["names", "state", "estimate", "series", "provenance"]
NON_CRITICAL = {"provenance"}  # errors here do not stop the run

# files the interface may simply read (GET) and write back as a whole (POST)
READ_ACCESS = {
    "/api/photos": (PHOTOS_FILE, {"photos": []}),
    "/api/changes": ("changes.json", {"photos": {}}),
    "/api/order": ("order.json", {}),
    "/api/write_preview": ("write_preview.json", None),
    "/api/assignment": ("assignment.json", {}),
    "/api/age": ("age_per_photo.json", {}),
    "/api/people": ("people.json", {"people": {}, "all": []}),
    "/api/provenance_albums": ("provenance_albums.json", {"albums": []}),
    "/api/provenance": ("provenance.json", {"pages": {}}),
    "/api/inbox": ("inbox.json", None),
    "/api/immich_data": ("immich_data.json", {"photos": {}}),
    "/api/gramps_preview": ("gramps_preview.json", None),
    "/api/event_assignment": ("event_assignment.json", {}),
    "/api/kinds": ("kinds.json", {}),
    "/api/places": ("place_assignment.json", {}),
}
WRITING = {
    "/api/work": (WORK, "series"),
    "/api/corrections": ("corrections.json", None),
    "/api/order": ("order.json", None),
    "/api/assignment": ("assignment.json", None),
    "/api/event_assignment": ("event_assignment.json", None),
    "/api/kinds": ("kinds.json", None),
    "/api/places": ("place_assignment.json", None),
    "/api/adoption": ("adoption.json", "rows"),
    "/api/changes": ("changes.json", "photos"),
    "/api/provenance": ("provenance.json", "pages"),
    "/api/inbox": ("inbox.json", "seen"),
    "/api/gramps_input": ("gramps_input.json", "items"),
}

_lock_ = threading.Lock()


# ------------------------------------------------------------------ files

def version():
    try:
        with open(os.path.join(HERE, "VERSION"), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def read_json(path_, default):
    return storage.load(path_, default)


def write_json(path_, data_):
    storage.save(path_, data_)


def new_work():
    work = {"series": [], "discarded": [], "counters": 0, "single_ok": False}
    for s in read_json(SERIES_JSON, {"series": []})["series"]:
        keys = [x["key"] for x in s["photos"]]
        if len(keys) < 2:
            continue
        work["counters"] += 1
        work["series"].append({"id": f"S{work['counters']:03d}", "photos": keys, "status": "open",
                                 "cohesion": s.get("cohesion", 0), "source": "suggestion"})
    return work


def apply_suggestions(work):
    """Read new suggestions from series.json without touching anything already decided.

    A group of free photos only -> new series; a group with one existing series -> extension suggestion
    ('suggested_new'); a group with several series -> hint 'merge_hints'. Returns: number of new entries."""
    suggestion = read_json(SERIES_JSON, {"series": []})["series"]
    work.setdefault("merge_hints", [])
    work.setdefault("merge_rejected", [])
    from_ = {}
    for s in work["series"]:
        s.setdefault("suggested_new", [])
        s.setdefault("rejected", [])
        for k in s["photos"]:
            from_[k] = s
    known_ = {frozenset(s["photos"]) for s in work["series"]} | {frozenset(v) for v in work["discarded"]}
    new_ = 0
    for p in suggestion:
        keys = [x["key"] for x in p["photos"]]
        if frozenset(keys) in known_:
            continue
        series = []
        for k in keys:
            if k in from_ and from_[k] not in series:
                series.append(from_[k])
        free = [k for k in keys if k not in from_]
        if not series:
            if len(free) < 2:
                continue
            work["counters"] += 1
            work["series"].append({"id": f"S{work['counters']:03d}", "photos": free, "status": "open",
                                     "cohesion": p.get("cohesion", 0), "source": "suggestion",
                                     "suggested_new": [], "rejected": []})
            for k in free:
                from_[k] = work["series"][-1]
            new_ += 1
        elif len(series) == 1:
            s = series[0]
            cand = [k for k in free if k not in s["rejected"] and k not in s["suggested_new"]]
            if cand:
                s["suggested_new"].extend(cand)
                new_ += len(cand)
        else:
            ids = sorted(s["id"] for s in series)
            if ids in work["merge_rejected"] or any(h["series"] == ids for h in work["merge_hints"]):
                continue
            work["merge_hints"].append({"series": ids, "new": free})
            new_ += 1
    return new_


def load_work():
    work = read_json(WORK, None)
    if work is None:
        work = new_work()
        write_json(WORK, work)
    return work


def read_results():
    """estimate_body.csv -> list of dicts (key = file name without extension + _ + 6 characters of the ID)."""
    if not os.path.exists(RESULT_CSV):
        return None
    rows = []
    with open(RESULT_CSV, encoding="utf-8-sig", newline="") as f:
        for z in csv.DictReader(f, delimiter=";"):
            file_path = z.get("File", "")
            key = os.path.splitext(file_path)[0] + "_" + z.get("Asset ID", "")[:6]
            try:
                year_num, from_, to_ = int(float(z["Estimated year"])), int(float(z["from"])), int(float(z["to"]))
            except (KeyError, ValueError):
                year_num = from_ = to_ = None
            rows.append({"key": key, "file": file_path, "year": year_num, "from": from_, "to": to_, "hint": z.get("Hint", ""),
                           "series_id": z.get("Series", ""), "single": z.get("Single estimate", ""), "current": z.get("Current date", "")})
    return rows


def people_photos():
    """Faces per person (from the state written by immich_state.py)."""
    st = read_json("immich_state.json", None)
    if not st:
        return {"ok": False, "text": tx('No state from Immich yet. Please click “Refresh” once.')}
    pers = st.get("people", {})
    per, unnamed = {}, []
    for key, f in st.get("photos", {}).items():
        seen = set()
        for g in f.get("faces", []):
            pid, b = g.get("p"), g.get("b") or []
            if len(b) >= 6 and b[4] and b[5] and not (pid and (pers.get(pid) or {}).get("name")) and len(unnamed) < 3000:
                unnamed.append({"key": key, "box": b})
            if not pid or not (pers.get(pid) or {}).get("name") or len(b) < 6 or not b[4] or not b[5] or (pid, key) in seen:
                continue
            seen.add((pid, key))
            per.setdefault(pid, []).append({"key": key, "box": b})
    output = []
    for pid, items_list in per.items():
        p = pers[pid]
        output.append({"id": pid, "name": p["name"], "birth": calculation.decimal_year_value(p["birth"]) if p.get("birth") else None,
                        "photos": items_list})
    output.sort(key=lambda x: (-len(x["photos"]), x["name"]))
    return {"ok": True, "people": output, "unnamed": unnamed}


def count_new_photos():
    """Compare the album in Immich (read only) with the known photos."""
    values_ = {}
    try:
        with open("immich.env", encoding="utf-8") as f:
            for z in f:
                if "=" in z and not z.strip().startswith("#"):
                    k, v = z.strip().split("=", 1)
                    values_[k.strip()] = v.strip()
        url, key = addresses.url(values_, "immich"), values_["IMMICH_API_KEY"]

        def api(path_, data_=None):
            return Immich(url, key, timeout=15).request_(None, path_, data_=data_)

        album = next((a["id"] for a in api("/albums") if a.get("albumName") == connections.arbeitsalbum()), None)
        if not album:
            return {"ok": False, "text": tx('Album “{name}” not found', name=connections.arbeitsalbum())}
        keys, page = [], 1
        while True:
            response = api("/search/metadata", {"albumIds": [album], "page": page, "size": 500})["assets"]
            keys += [os.path.splitext(a.get("originalFileName", "foto"))[0] + "_" + a["id"][:6] for a in response["items"]]
            if not response.get("nextPage"):
                break
            page = int(response["nextPage"])
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "text": tx('Immich not reachable ({grund})', grund=e)}
    known_ = {f["key"] for f in read_json(PHOTOS_FILE, {"photos": []})["photos"]}
    return {"ok": True, "album": len(keys), "new": len([k for k in keys if k not in known_])}


def everything():
    """Everything the interface needs at startup, in one response."""
    with _lock_:
        work = load_work()
    photos = read_json(PHOTOS_FILE, {"photos": []})
    inbox = read_json("inbox.json", None)
    if inbox is None:  # first start: photos that already exist count as seen
        inbox = {"seen": [f["key"] for f in photos["photos"]]}
        write_json("inbox.json", inbox)
    return {
        "photos": photos, "work": work, "results": {"rows": read_results(), "corrections": read_json("corrections.json", {})},
        "people": read_json("people.json", {"people": {}, "all": []}), "changes": read_json("changes.json", {"photos": {}}),
        "age": read_json("age_per_photo.json", {}), "people_photos": people_photos(), "order": read_json("order.json", {}),
        "assignment": read_json("assignment.json", {}), "connection": connections.status(), "write_preview": read_json("write_preview.json", None),
        "write_status": write_status(), "job": JOB.status(), "provenance_albums": read_json("provenance_albums.json", {"albums": []}),
        "provenance": read_json("provenance.json", {"pages": {}}), "inbox": inbox, "game_votes": read_json("game_votes.json", {"votes": []}),
        "immich_data": read_json("immich_data.json", {"photos": {}}),
        "gramps_preview": read_json("gramps_preview.json", None), "gramps_written": read_json("gramps_written.json", {}),
        "gramps_status": grampsstatus(), "event_assignment": read_json("event_assignment.json", {}), "kinds": read_json("kinds.json", {}), "places": read_json("place_assignment.json", {}), "version": version(),
    }


_SIMILAR = {"mtime": None, "keys": [], "mat": None}


def similar_photos(key, n=40):
    """The photos most similar to the photo `key` overall (from series_cache.npz, vectors are normalised).
    -> {"ok": True, "hits": [{"key", "value"}]}; value = cosine similarity 0..1"""
    try:
        import numpy as np
    except ImportError:
        return {"ok": False, "text": tx('numpy is missing.')}
    file_path = "series_cache.npz"
    if not os.path.exists(file_path):
        return {"ok": False, "text": tx('No image comparison data yet. “Refresh” in the Inbox creates it.')}
    with _lock_:
        mt = os.path.getmtime(file_path)
        if _SIMILAR["mtime"] != mt:
            try:
                d = np.load(file_path)
                id2key = {f["id"]: f["key"] for f in read_json(PHOTOS_FILE, {"photos": []})["photos"]}
                ks, vs = [], []
                for name in d.files:
                    if name.startswith("g_") and name[2:] in id2key:
                        ks.append(id2key[name[2:]]); vs.append(d[name])
                _SIMILAR.update(mtime=mt, keys=ks, mat=np.vstack(vs).astype("float32") if vs else None)
            except (OSError, ValueError):
                return {"ok": False, "text": tx('The image comparison data cannot be read.')}
        ks, mat = _SIMILAR["keys"], _SIMILAR["mat"]
    if mat is None or key not in ks:
        return {"ok": True, "hits": []}
    w = mat @ mat[ks.index(key)]
    row_ = np.argsort(-w)
    return {"ok": True, "hits": [{"key": ks[i], "value": round(float(w[i]), 3)} for i in row_ if ks[i] != key][:n]}


def write_status():
    return {"key_set": bool(connections.read_env(credentials.write_env_name("immich")).get("IMMICH_API_KEY")), "written": len(read_json("dating_written.json", {})),
            "result": read_json("write_result.json", None)}


def grampsstatus():
    return {"key_set": bool(connections.read_env(credentials.write_env_name("gramps")).get("GRAMPS_PASSWORD")), "result": read_json("gramps_result.json", None)}


# ------------------------------------------------------------------ background jobs

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]|\[(?:\d{1,2};?)+m")


class Job:
    def __init__(self):
        self.name, self.running, self.rc, self.new_ = None, False, None, 0
        self.rows = deque(maxlen=20000)   # the whole log of a run (counter lines overwrite each other)
        self.step = self.step_name = ""
        self.step_no, self.step_total, self.sub = 0, 0, 0.0   # sub: progress inside the step (0..1), from lines like "  12 / 340"
        self.args = []

    def add(self, line):
        """A counter line ('  12 / 340') replaces the previous one, so the log stays complete but short."""
        line = ANSI.sub("", line)   # colour codes of some libraries do not belong in the log
        if self.rows and PROGRESS_LINE.match(line) and PROGRESS_LINE.match(self.rows[-1]):
            self.rows[-1] = line
        else:
            self.rows.append(line)

    def status(self, all_rows=False):
        done = self.step_no - 1 + self.sub if self.running else self.step_total
        progress = round(max(0.0, min(1.0, done / self.step_total)), 3) if self.step_total else 0
        return {"args": self.args, "step": self.step, "step_no": self.step_no, "step_total": self.step_total, "progress": progress,
                "step_name": self.step_name, "name": self.name,
                "running": self.running, "rc": self.rc, "rows": list(self.rows) if all_rows else list(self.rows)[-60:], "new": self.new_}


JOB = Job()
PROGRESS_LINE = re.compile(r"^\s+(\d+) / (\d+)\s*$")   # the scripts report '  12 / 340'


def start_job(name, args):
    """name: series | estimate | names | state | provenance | write | gramps | pipeline (= names, state, estimate, series, provenance)."""
    steps = [(s, args if s == "series" else []) for s in PIPELINE] if name == "pipeline" else [(name, args)]
    for sname, _ in steps:
        if sname not in SCRIPTS:
            return False, tx('unknown job')
        if not os.path.exists(SCRIPTS[sname]):
            return False, tx('{file_path} is missing in this folder', file_path=os.path.basename(SCRIPTS[sname]))
    if READ_ONLY and name in ("write", "gramps") and [str(x) for x in args][:1] != ["preview"]:   # the preview only reads
        return False, tx('Write protection: nothing is written to Immich or Gramps in this test environment.')
    language_job = messages.language()
    if JOB.running:
        return False, tx('a job is already running')
    JOB.name, JOB.running, JOB.rc, JOB.new_ = name, True, None, 0
    JOB.args = [str(a) for a in args]
    JOB.rows.clear()
    JOB.step, JOB.step_name, JOB.step_no, JOB.step_total, JOB.sub = "", "", 0, 0, 0.0

    # the fingerprint of the last complete evaluation only counts if this job does not change the results
    age_fp = run_check_mod.old() if name == "pipeline" else None
    if name in ("pipeline", "estimate", "series", "state", "names"):
        run_check_mod.forget()

    def run_inner():
        fp_now, skipped = None, set()
        for no, (sname, sargs) in enumerate(steps, 1):
            if sname in ("estimate", "series") and name == "pipeline":
                if sname == "estimate":
                    same, fp_now = run_check_mod.unchanged(age_fp)
                    if same:
                        skipped = {"estimate", "series"}
                        JOB.rows.append(tx("Nothing has changed: age estimate and series comparison are skipped."))
                if sname in skipped:
                    continue
            JOB.step, JOB.step_name = f"{no}/{len(steps)}", sname
            JOB.step_no, JOB.step_total, JOB.sub = no, len(steps), 0.0
            JOB.rows.append("> " + " ".join(["python", os.path.basename(SCRIPTS[sname])] + [str(a) for a in sargs]))
            try:
                p = subprocess.Popen([sys.executable, "-u", SCRIPTS[sname]] + [str(a) for a in sargs], stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, text=True, bufsize=1, env=dict(os.environ, PYTHONUNBUFFERED="1", GRIMMICH_LANGUAGE=language_job))
                for entry_row in p.stdout:
                    JOB.add(entry_row.rstrip())
                    m = PROGRESS_LINE.match(entry_row)
                    if m and int(m.group(2)) > 0:
                        JOB.sub = min(1.0, int(m.group(1)) / int(m.group(2)))
                JOB.rc = p.wait()
                p.stdout.close()
            except OSError as e:
                JOB.rows.append(tx("Start failed: {error}", error=e))
                JOB.rc = -1
            if JOB.rc != 0 and sname in NON_CRITICAL and name == "pipeline":
                JOB.rows.append(tx("({step} is not critical, continuing.)", step=sname))
                JOB.rc = 0
            if JOB.rc != 0:
                break
            if sname == "series":
                with _lock_:
                    work = load_work()
                    JOB.new_ = apply_suggestions(work)
                    write_json(WORK, work)
                JOB.rows.append(tx("{n} new suggestions adopted.", n=JOB.new_))
        if name == "pipeline" and JOB.rc == 0:
            run_check_mod.remember(run_check_mod.fingerprint())

    def run_():
        try:
            run_inner()
        except Exception as e:  # noqa: BLE001  (an error here must never leave the job "hanging")
            JOB.rows.append(tx("Unexpected error: {error}", error=e))
            JOB.rc = -1
        finally:
            JOB.running = False

    threading.Thread(target=run_, daemon=True).start()
    return True, "gestartet"


# ------------------------------------------------------------------ Server

RATE = play.RateLimit()
PLAYERS_FILE = "players.json"
_players_lock = threading.Lock()
LOGIN_BY_NAME, LOGIN_BY_IP, LOGIN_ALL = auth.FailLimit(8, 900), auth.FailLimit(20, 900), auth.FailLimit(100, 900)   # wrong passwords: per name, per address, in total
UNKNOWN_PATHS = auth.FailLimit(40, 60)   # a source asking for many addresses that do not exist (scanners) is slowed down
_HIDDEN = {"t": 0.0, "sig": None, "value": (frozenset(), frozenset(), frozenset())}


def players_doc():
    """The accounts (see auth.py); the secret for the cookies is made once and kept."""
    with _players_lock:
        raw = read_json(PLAYERS_FILE, {})
        doc = auth.prepared(raw)
        if not isinstance(raw, dict) or raw.get("secret") != doc["secret"]:
            write_json(PLAYERS_FILE, doc)
        return doc


def change_players(fn):
    """Applies fn(doc) -> (doc, result) to the accounts under a lock and saves the new document."""
    with _players_lock:
        doc, result = fn(auth.prepared(read_json(PLAYERS_FILE, {})))
        write_json(PLAYERS_FILE, doc)
        _HIDDEN["sig"] = None
    return result


def hidden():
    """(photo keys, person ids, names) that are not shown to players from outside (only when the list is switched on)."""
    doc = players_doc()
    ids = tuple(sorted(doc["excluded"])) if doc["exclude_on"] else ()
    if not ids:
        return frozenset(), frozenset(), frozenset()
    if _HIDDEN["sig"] == ids and time.time() - _HIDDEN["t"] < 30:
        return _HIDDEN["value"]
    pp = people_photos()
    keys, names = set(), set()
    for p in (pp.get("people", []) if pp.get("ok") else []):
        if p["id"] in ids:
            keys |= {f["key"] for f in p["photos"]}
            names.add(p["name"])
    _HIDDEN.update(t=time.time(), sig=ids, value=(frozenset(keys), frozenset(ids), frozenset(names)))
    return _HIDDEN["value"]


def players_view():
    """For the settings page: who may play, and what is hidden. No password hashes."""
    doc = players_doc()
    return {"ok": True, "players": auth.public_list(doc), "exclude_on": doc["exclude_on"], "excluded": doc["excluded"], "hidden_count": len(hidden()[0])}


def players_change(data_):
    """One change of the accounts from the settings page. A new password is only returned here, once."""
    op, key = data_.get("op"), data_.get("key")
    state = {"password": None, "name": None, "error": None}

    def run(doc):
        if op == "add":
            doc, state["password"], state["error"] = auth.add_player(doc, data_.get("name"), datetime.datetime.now().isoformat(timespec="seconds"))
            state["name"] = play.clean_text(data_.get("name"), 40)
        elif op == "reset" and key in doc["players"]:
            doc, state["password"] = auth.reset_password(doc, key)
            state["name"] = doc["players"][key]["name"]
        elif op == "block" and key in doc["players"]:
            doc = auth.set_blocked(doc, key, data_.get("blocked") is True)
        elif op == "remove" and key in doc["players"]:
            doc = auth.remove_player(doc, key)
        elif op == "exclude":
            ids = data_.get("people")
            doc["exclude_on"] = data_.get("on") is True
            doc["excluded"] = sorted({i for i in (ids if isinstance(ids, list) else []) if play.clean_text(i, 80, allow_empty=False)})
        else:
            state["error"] = "unknown"
        return doc, None

    change_players(run)
    out = players_view()
    if state["error"]:
        return {"ok": False, "error": state["error"]}, 400
    if state["password"]:
        out.update(password=state["password"], password_for=state["name"])
    return out, 200


def play_all():
    """What the game gets (see play.py): only the parts it needs."""
    photos = read_json(PHOTOS_FILE, {"photos": []})
    with _lock_:
        work = load_work()
    people = read_json("people.json", {"people": {}, "all": []})
    hidden_keys, hidden_people, hidden_names = hidden()
    return play.build_data(photos, work, read_results(), read_json("corrections.json", {}), [n for n in people.get("all", []) if n not in hidden_names], read_json("age_per_photo.json", {}),
                           people_photos(), (read_json("immich_data.json", {"photos": {}}) or {}).get("photos", {}), read_json("place_assignment.json", {}),
                           read_json("kinds.json", {}), read_json("game_votes.json", {"votes": []}).get("votes", []), version(), hidden_keys, hidden_people)


def handle_vote(data_, signed_in=None):
    """One answer of a player, added to the list (op "add") or the last answer of this player taken back (op "undo"). -> (answer, code)"""
    if not isinstance(data_, dict):
        return {"ok": False}, 400
    player, op = signed_in or play.clean_player(data_.get("player")), data_.get("op")   # from outside the name comes from the sign-in, never from the request
    if not player or op not in ("add", "undo"):
        return {"ok": False}, 400
    if not RATE.allow():
        return {"ok": False}, 429
    with _lock_:
        votes = read_json("game_votes.json", {"votes": []}).get("votes", [])
        if op == "undo":
            new = play.undo_last(votes, player)
        else:
            keys = {p["key"] for p in read_json(PHOTOS_FILE, {"photos": []}).get("photos", []) if "key" in p}
            if signed_in:
                keys -= hidden()[0]
            vote = play.validate_vote(data_.get("vote"), keys)
            if vote is None:
                return {"ok": False}, 400
            new = play.add_vote(votes, vote, player, datetime.datetime.now().isoformat(timespec="seconds"))
            if new is None:
                return {"ok": False}, 507
        write_json("game_votes.json", {"votes": new})
    return {"ok": True, "votes": new}, 200


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, data_, type_, headers=()):
        self.send_response(code)
        self.send_header("Content-Type", type_)
        self.send_header("Content-Length", str(len(data_)))
        # pictures are only kept in the browser, not in shared caches (from outside they are for signed-in players only)
        self.send_header("Cache-Control", "private, max-age=3600" if type_ == "image/jpeg" and self.path.startswith("/play/") else "max-age=3600" if type_ == "image/jpeg" else "no-store")
        if self.path.startswith("/play"):
            self.send_header("X-Robots-Tag", "noindex, nofollow")
            self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data_)

    def _json(self, obj, code=200, headers=()):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json", headers)

    def _ip(self):
        """Where the request comes from (behind a tunnel the address is in X-Forwarded-For)."""
        forwarded = (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        return forwarded or self.client_address[0]

    def _secure(self):
        return (self.headers.get("X-Forwarded-Proto") or "").lower() == "https"

    def _player(self):
        """(key, entry) of the signed-in player, or None."""
        token = auth.cookie_value(self.headers.get("Cookie"))
        return auth.read_token(players_doc(), token) if token else None

    def _from_funnel(self, path_):
        """A request that came in through Tailscale Funnel may only reach /play/ (everything else is for you alone)."""
        return bool(self.headers.get("Tailscale-Funnel-Request")) and not (path_ == "/play" or path_.startswith("/play/"))

    def _file(self, path_):
        type_ = mimetypes.guess_type(path_)[0] or "application/octet-stream"
        if type_.startswith("text/") or type_ in ("application/javascript", "application/json"):
            type_ += "; charset=utf-8"
        with open(path_, "rb") as f:
            self._send(200, f.read(), type_)

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if self.path.startswith("/play/") and length > 100000:   # from outside nobody needs more than a short answer
            return None
        try:
            return json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except ValueError:
            return None

    def do_GET(self):
        messages.set_language(self.headers.get("X-Language"))
        url = urllib.parse.urlparse(self.path)
        path_, q = url.path, urllib.parse.parse_qs(url.query)
        if path_ == "/play":   # the game lives under /play/ (relative addresses need the slash)
            self.send_response(301)
            self.send_header("Location", "/play/")
            self.end_headers()
            return
        if self._from_funnel(path_):
            self._send(404, b"not found", "text/plain")
            return
        if path_.startswith("/play/"):   # play mode: only what play.ALLOWED_GET lets through, data only for signed-in players
            path_ = path_[len("/play"):]
            ip = self._ip()
            if UNKNOWN_PATHS.blocked(ip):
                self._send(429, b"too many requests", "text/plain")
                return
            if not play.ALLOWED_GET.match(path_):
                UNKNOWN_PATHS.fail(ip)
                self._send(404, b"not found", "text/plain")
                return
            if path_ == "/robots.txt":
                self._send(200, play.ROBOTS, "text/plain")
                return
            me = self._player()
            if path_ == "/api/me":
                self._json({"ok": True, "name": me[1]["name"]} if me else {"ok": False}, 200 if me else 401)
                return
            if play.LOGIN_NEEDED.match(path_) and not me:
                self._json({"ok": False, "login": True}, 401)
                return
            if path_ == "/api/all":
                self._json(play_all())
                return
            if path_ == "/api/gramps_places":
                self._json(connections.gramps_orte(new_=False))
                return
            if path_.startswith(("/photos/", "/crops/")):   # photos with hidden people do not exist for players
                name = os.path.basename(urllib.parse.unquote(path_.split("/", 2)[2]))
                m = re.match(r"^(.+)_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)\.jpg$", name) if path_.startswith("/crops/") else None
                if (m.group(1) if m else name[:-4]) in hidden()[0]:
                    self._send(404, b"not found", "text/plain")
                    return
        if path_ in READ_ACCESS:
            self._json(read_json(*READ_ACCESS[path_]))
        elif path_ == "/api/players":
            self._json(players_view())
        elif path_ == "/api/all":
            self._json(everything())
        elif path_ == "/api/work":
            with _lock_:
                self._json(load_work())
        elif path_ == "/api/people_photos":
            self._json(people_photos())
        elif path_ == "/api/write_status":
            self._json(write_status())
        elif path_ == "/api/languages":
            self._json(messages.available())
        elif path_.startswith("/api/language/"):
            doc = messages.document(path_[len("/api/language/"):])
            self._json(doc) if doc is not None else self._send(404, b"not found", "text/plain")
        elif path_ == "/api/connection":
            self._json(connections.status())
        elif path_ == "/api/gramps_people":
            self._json(connections.gramps_personen(new_=bool(q.get("new"))))
        elif path_ == "/api/gramps_places":
            self._json(connections.gramps_orte(new_=bool(q.get("new"))))
        elif path_ == "/api/gramps_events":
            self._json(connections.gramps_ereignisse((q.get("h") or [""])[0]))
        elif path_ == "/api/similar":
            self._json(similar_photos((q.get("key") or [""])[0]))
        elif path_ == "/api/results":
            self._json({"rows": read_results(), "corrections": read_json("corrections.json", {})})
        elif path_ == "/api/job":
            self._json(JOB.status(all_rows=(q.get("all") or [""])[0] == "1"))
        elif path_ == "/api/new":
            self._json(count_new_photos())
        elif path_.startswith("/crops/"):   # sharper face picture: /crops/<key>_<W>_<H>_<x0>_<y0>_<side>.jpg
            m = re.match(r"^(.+)_(\d+)_(\d+)_(\d+)_(\d+)_(\d+)\.jpg$", urllib.parse.unquote(path_[len("/crops/"):]))
            data = face_crops.crop(m.group(1), *[int(x) for x in m.groups()[1:]]) if m else None
            if data:
                self._send(200, data, "image/jpeg")
            else:
                self._send(404, b"not found", "text/plain")
        elif path_.startswith("/photos/"):
            name = os.path.basename(urllib.parse.unquote(path_[len("/photos/"):]))
            file_path = os.path.join(PHOTO_FOLDER, name)
            if name.lower().endswith(".jpg") and os.path.isfile(file_path):
                with open(file_path, "rb") as f:
                    self._send(200, f.read(), "image/jpeg")
            else:
                self._send(404, b"not found", "text/plain")
        elif not path_.startswith("/api/"):  # interface: files from web/
            rel = "index.html" if path_ == "/" else urllib.parse.unquote(path_.lstrip("/"))
            file_path = os.path.normpath(os.path.join(WEB, rel))
            if file_path.startswith(WEB + os.sep) and os.path.isfile(file_path):
                self._file(file_path)
            else:
                self._send(404, b"not found", "text/plain")
        else:
            self._send(404, b"not found", "text/plain")

    def _play_post(self, path_, data_, ip):
        """Sign in, sign out, change the own password, give an answer (only for signed-in players)."""
        if not isinstance(data_, dict):
            self._json({"ok": False}, 400)
            return
        if path_ == "/api/login":
            name, password = data_.get("name"), data_.get("password")
            key = auth.name_key(name) if isinstance(name, str) else None
            if any(limit.blocked(k) for limit, k in ((LOGIN_BY_NAME, key or ""), (LOGIN_BY_IP, ip), (LOGIN_ALL, "all"))):
                self._json({"ok": False, "wait": True}, 429)
                return
            found = auth.sign_in(players_doc(), name, password)
            if found is None:
                for limit, k in ((LOGIN_BY_NAME, key or ""), (LOGIN_BY_IP, ip), (LOGIN_ALL, "all")):
                    limit.fail(k)
                self._json({"ok": False}, 401)
                return
            LOGIN_BY_NAME.clear(found)
            doc = players_doc()
            self._json({"ok": True, "name": doc["players"][found]["name"]}, 200, [("Set-Cookie", auth.cookie_header(auth.make_token(doc, found), self._secure()))])
            return
        if path_ == "/api/logout":
            self._json({"ok": True}, 200, [("Set-Cookie", auth.cookie_header("", self._secure(), clear=True))])
            return
        me = self._player()
        if not me:
            self._json({"ok": False, "login": True}, 401)
            return
        key, entry = me
        if path_ == "/api/password":
            if LOGIN_BY_NAME.blocked("pw:" + key):
                self._json({"ok": False, "wait": True}, 429)
                return
            result = {}

            def run(doc):
                doc, result["error"] = auth.change_own_password(doc, key, data_.get("old"), data_.get("new"))
                return doc, None
            change_players(run)
            if result["error"]:
                if result["error"] == "wrong":
                    LOGIN_BY_NAME.fail("pw:" + key)
                self._json({"ok": False, "error": result["error"]}, 400)
                return
            self._json({"ok": True}, 200, [("Set-Cookie", auth.cookie_header(auth.make_token(players_doc(), key), self._secure()))])
            return
        answer, code = handle_vote(data_, signed_in=entry["name"])   # the name comes from the sign-in, never from the request
        self._json(answer, code)

    def do_POST(self):
        messages.set_language(self.headers.get("X-Language"))
        path_ = urllib.parse.urlparse(self.path).path
        data_ = self._body()
        if data_ is None:
            self._send(400, b"ungueltig", "text/plain")
            return
        if self._from_funnel(path_):
            self._send(404, b"not found", "text/plain")
            return
        if path_.startswith("/play/"):   # play mode: only sign-in and answers
            path_ = path_[len("/play"):]
            ip = self._ip()
            if path_ not in play.ALLOWED_POST or UNKNOWN_PATHS.blocked(ip):
                UNKNOWN_PATHS.fail(ip)
                self._send(404, b"not found", "text/plain")
                return
            self._play_post(path_, data_, ip)
            return
        if path_ == "/api/vote":
            answer, code = handle_vote(data_)
            self._json(answer, code)
        elif path_ == "/api/players" and isinstance(data_, dict):
            answer, code = players_change(data_)
            self._json(answer, code)
        elif path_ in WRITING and isinstance(data_, dict):
            file_path, required = WRITING[path_]
            if required and required not in data_:
                self._send(400, b"ungueltig", "text/plain")
                return
            with _lock_:
                write_json(file_path, data_)
            self._json({"ok": True})
        elif path_ == "/api/connection" and isinstance(data_, dict):
            self._json(connections.store(data_.get("kind"), data_.get("fields")))
        elif path_ == "/api/connection_test" and isinstance(data_, dict):
            self._json(connections.test_it(data_.get("kind")))
        elif path_ == "/api/gramps_probe":
            self._json(connections.sample())
        elif path_ == "/api/series_calc" and isinstance(data_, dict):
            info = read_json("age_per_photo.json", {})
            result = {}
            for s in data_.get("series", []):
                try:
                    result[s["id"]] = calculation.series_result(s["photos"], info)
                except (KeyError, TypeError, ValueError):
                    result[s.get("id", "?")] = None
            self._json(result)
        elif path_ == "/api/job":
            ok, text = start_job(data_.get("name"), data_.get("args", []))
            self._json({"ok": ok, "text": text}, 200 if ok else 409)
        else:
            self._send(404, b"not found", "text/plain")


def main():
    if not os.path.isfile(os.path.join(WEB, "index.html")):
        sys.exit(tx("The folder web with index.html is missing. It has to lie next to grimmich.py."))
    migration.rename_files()   # file and folder names of earlier versions (German) -> English
    try:
        storage.all_names()   # an older database is switched to the current schema here, before anything else runs
    except migration.MigrationError as e:
        sys.exit(str(e))
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        sys.exit(tx("Port {port} is in use. Is Grimmich (or the old interface) already running in another terminal window?", port=PORT))
    print(tx("Grimmich is running: http://localhost:{port}", port=PORT))
    print(tx("Quit with Ctrl+C."))
    try:  # quitting without a terminal (menu starter) arrives as signal TERM; treat it like Ctrl+C
        import signal
        signal.signal(signal.SIGTERM, signal.default_int_handler)
    except (ValueError, AttributeError, OSError):
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(tx("\nStopped. Your data is in grimmich.db."))


if __name__ == "__main__":
    main()
