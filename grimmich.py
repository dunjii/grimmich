"""Grimmich: date photos with Gramps and Immich (runs only on your own computer).

Start (in the grimmich folder):
    ./.venv/bin/python grimmich.py
Then open  http://localhost:8765  in the browser. Quit: Ctrl+C in the terminal.

Grimmich only reads from Immich and Gramps. Immich is only changed when you go through
"Review changes" in the interface (preview, test, write) and have entered the write key
for it.
"""
import csv
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
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
    "/api/game_votes": ("game_votes.json", "votes"),
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
    per = {}
    for key, f in st.get("photos", {}).items():
        seen = set()
        for g in f.get("faces", []):
            pid, b = g.get("p"), g.get("b") or []
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
    return {"ok": True, "people": output}


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

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, data_, type_):
        self.send_response(code)
        self.send_header("Content-Type", type_)
        self.send_header("Content-Length", str(len(data_)))
        self.send_header("Cache-Control", "max-age=3600" if type_ == "image/jpeg" else "no-store")
        self.end_headers()
        self.wfile.write(data_)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json")

    def _file(self, path_):
        type_ = mimetypes.guess_type(path_)[0] or "application/octet-stream"
        if type_.startswith("text/") or type_ in ("application/javascript", "application/json"):
            type_ += "; charset=utf-8"
        with open(path_, "rb") as f:
            self._send(200, f.read(), type_)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except ValueError:
            return None

    def do_GET(self):
        messages.set_language(self.headers.get("X-Language"))
        url = urllib.parse.urlparse(self.path)
        path_, q = url.path, urllib.parse.parse_qs(url.query)
        if path_ in READ_ACCESS:
            self._json(read_json(*READ_ACCESS[path_]))
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

    def do_POST(self):
        messages.set_language(self.headers.get("X-Language"))
        path_ = urllib.parse.urlparse(self.path).path
        data_ = self._body()
        if data_ is None:
            self._send(400, b"ungueltig", "text/plain")
            return
        if path_ in WRITING and isinstance(data_, dict):
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
