"""Write photos to Gramps Web (with preview and undo).

Usage (usually the interface starts this for you):
    python gramps_write.py preview          only look, writes NOTHING
    python gramps_write.py write            really write
    python gramps_write.py undo [key ...]   undo (without arguments: everything Grimmich created)

Input:    gramps_input.json   (comes from the interface)
Access:   gramps_write.env    (GRAMPS_URL, GRAMPS_USER, GRAMPS_PASSWORD: a user with the Editor role)
          immich.env          (read: fetch image and faces)
          immich_write.env    (optional: sets the tag 'Gramps/O0458' on the photo in Immich)

For each photo Grimmich creates in Gramps: the media object (reduced JPEG, uploaded), date, title,
the source (once per album) with a citation 'Page N, photo M' and, for named people, the face box.
Files: gramps_written.json (what was created, for undo), gramps_preview.json, gramps_result.json
"""
import json
import os
import sys

os.environ.setdefault("OPENCV_LOG_LEVEL", "SILENT")   # no TIFF warnings from OpenCV in the log
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from immich_write import Immich, ApiError, load_env, read_, write_doc, tag_ids
import credentials
import addresses
from messages import tx

INPUT_FILE = "gramps_input.json"
WRITTEN = "gramps_written.json"
PREVIEW = "gramps_preview.json"
RESULT = "gramps_result.json"
GRAMPS_ENV = "gramps_write.env"
READ_ENV = "immich.env"
WRITE_ENV = "immich_write.env"
MAX_EDGE = 2000
MARGIN = 0.15        # face boxes: margin around the face (share of the face size), as in Bifrost
ATTR_ID = "Immich ID"
TAG_ROOT = "Gramps"


class GrampsError(Exception):
    pass


# ------------------------------------------------------------------ Gramps

class Gramps:
    def __init__(self):
        w = {}
        try:
            with open(credentials.write_env_name("gramps"), encoding="utf-8") as f:
                for z in f:
                    z = z.strip()
                    if z and not z.startswith("#") and "=" in z:
                        k, v = z.split("=", 1)
                        w[k.strip()] = v.strip()
        except OSError:
            pass
        self.url = addresses.url(w, "gramps")
        self.citation_image = w.get("GRAMPS_CITATION_IMAGE", "1") != "0"   # also enter the photo at the find spot (citation) as an image
        self.user, self.pw = w.get("GRAMPS_USER", ""), w.get("GRAMPS_PASSWORD", "")
        if not (self.url and self.user and self.pw):
            raise GrampsError(f"{credentials.write_env_name('gramps')} fehlt oder ist unvollstaendig (Adresse, Benutzer und Passwort fuer Gramps zum Schreiben).")
        self.token = None

    def raw(self, methode, path_, data_=None, head=None, body=None, params=None, new_=True):
        if not self.token:
            self.log_in()
        head = dict(head or {})
        if body is not None:
            data_ = json.dumps(body).encode("utf-8")
            head["Content-Type"] = "application/json"
        head["Authorization"] = "Bearer " + self.token
        address = self.url + "/api" + path_ + ("?" + urllib.parse.urlencode(params) if params else "")
        try:
            with urllib.request.urlopen(urllib.request.Request(address, data=data_, headers=head, method=methode), timeout=120) as r:
                resp, code = r.read(), r.status
        except urllib.error.HTTPError as e:
            resp, code = e.read(), e.code
        except (urllib.error.URLError, OSError) as e:
            raise GrampsError(f"No connection to {self.url} ({getattr(e, 'reason', e)}).")
        if code == 401 and new_:
            self.token = None
            return self.raw(methode, path_, data_, head, None, params, new_=False)
        return code, resp

    def log_in(self):
        data_ = json.dumps({"username": self.user, "password": self.pw}).encode("utf-8")
        try:
            with urllib.request.urlopen(urllib.request.Request(self.url + "/api/token/", data=data_, method="POST",
                                                               headers={"Content-Type": "application/json"}), timeout=60) as r:
                resp = json.loads(r.read())
        except urllib.error.HTTPError as e:
            code = e.code
            raise GrampsError("Gramps rejected the login (wrong user or password?)" if e.code in (401, 403)
                               else f"Login to Gramps not possible (answer {code}). Is the address right (without /api at the end)?")
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise GrampsError(f"No connection to {self.url} ({getattr(e, 'reason', e)}).")
        self.token = resp.get("access_token") or resp.get("access")
        if not self.token:
            raise GrampsError("Gramps sent no login token.")

    def json(self, methode, path_, body=None, params=None):
        code, resp = self.raw(methode, path_, body=body, params=params)
        if code >= 400:
            raise GrampsError(f"{methode} {path_}: error {code}: {resp[:300].decode('utf-8', 'replace')}")
        return json.loads(resp) if resp.strip() else None

    def items_list(self, path_, keys):
        out_, page = [], 1
        while True:
            part = self.json("GET", path_, params={"keys": keys, "pagesize": 200, "page": page})
            if not isinstance(part, list) or not part:
                return out_
            out_ += part
            if len(part) < 200:
                return out_
            page += 1

    def delete(self, path_):
        """Gramps Web sometimes answers a delete with an error although it worked: check afterwards."""
        code, resp = self.raw("DELETE", path_)
        if code < 400:
            return True
        code2, _ = self.raw("GET", path_)
        return code2 == 404


def new_entry(response):
    for e in response or []:
        n = e.get("new") or e
        if n.get("handle"):
            return n
    raise GrampsError(f"Gramps hat kein neues Objekt gemeldet: {str(response)[:200]}")


# ------------------------------------------------------------------ Immich (read only, plus tag)

def immich_raw(access, path_, params=None):
    url, key = access
    return Immich(url, key, timeout=180).request_("GET", path_, params=params, raw=True)


def jpeg_reduced(data_):
    """Decode the image, shrink it to at most MAX_KANTE pixels, encode as JPEG -> (bytes, width, height)."""
    try:
        import cv2
        import numpy as np
        image = cv2.imdecode(np.frombuffer(data_, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(tx("not readable"))
        h, w = image.shape[:2]
        f = min(1.0, MAX_EDGE / max(w, h))
        if f < 1:
            image = cv2.resize(image, (round(w * f), round(h * f)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not ok:
            raise ValueError("Kodieren fehlgeschlagen")
        return buf.tobytes(), image.shape[1], image.shape[0]
    except ImportError:
        import io
        from PIL import Image, ImageOps
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(data_))).convert("RGB")
        image.thumbnail((MAX_EDGE, MAX_EDGE))
        out_ = io.BytesIO()
        image.save(out_, "JPEG", quality=90)
        return out_.getvalue(), image.width, image.height


def fetch_image(access, asset_id):
    """Unedited photos: the original, reduced. Photos edited in Immich (rotated, mirrored): the preview image,
    so that orientation and face boxes match what you see in Immich. -> (bytes, width, height, source)"""
    info = json.loads(immich_raw(access, f"/assets/{asset_id}"))
    if info.get("isEdited") is False:
        try:
            return (*jpeg_reduced(immich_raw(access, f"/assets/{asset_id}/original")), "Original")
        except (ValueError, OSError, ApiError, Exception) as e:   # e.g. a format that cannot be read
            print(tx("  (Original not readable, using the preview image: {error})", error=str(e)[:80]))
    data_ = immich_raw(access, f"/assets/{asset_id}/thumbnail", {"size": "preview", "edited": "true"})
    return (*jpeg_reduced(data_), "Vorschaubild")


def faces(access, asset_id):
    """Immich person ID -> list of boxes [x1, y1, x2, y2] in percent, with margin."""
    out_ = {}
    for g in json.loads(immich_raw(access, "/faces", {"id": asset_id})):
        pid, w, h = (g.get("person") or {}).get("id"), g.get("imageWidth") or 0, g.get("imageHeight") or 0
        x1, y1, x2, y2 = (g.get(k) for k in ("boundingBoxX1", "boundingBoxY1", "boundingBoxX2", "boundingBoxY2"))
        if not pid or not w or not h or None in (x1, y1, x2, y2) or x2 <= x1 or y2 <= y1:
            continue
        bw, bh = (x2 - x1) * MARGIN, (y2 - y1) * MARGIN
        r = [round((x1 - bw) / w * 100), round((y1 - bh) / h * 100), round((x2 + bw) / w * 100), round((y2 + bh) / h * 100)]
        out_.setdefault(pid, []).append([min(100, max(0, v)) for v in r])
    return out_


# ------------------------------------------------------------------ date

def gramps_datum(d):
    """{kind: exact|year|range|about, date, year, from, to} -> (Gramps date, text to display)"""
    kind_name = d.get("kind")
    if kind_name == "genau" and d.get("date"):
        j, m, t = (int(x) for x in d["date"].split("-"))
        return ({"_class": "Date", "dateval": [t, m, j, False], "modifier": 0, "quality": 0, "text": ""}, f"{t:02d}.{m:02d}.{j}")
    j = int(d.get("year") or 0)
    if kind_name == "bereich" and d.get("from") and d.get("to") and d["from"] != d["to"]:
        v, b = int(d["from"]), int(d["to"])
        return ({"_class": "Date", "dateval": [0, 0, v, False, 0, 0, b, False], "modifier": 4, "quality": 1, "text": ""},
                f"estimated between {v} and {b}")
    if kind_name == "ca":
        return ({"_class": "Date", "dateval": [0, 0, j, False], "modifier": 3, "quality": 1, "text": ""}, f"ca. {j}")
    return ({"_class": "Date", "dateval": [0, 0, j, False], "modifier": 0, "quality": 0, "text": ""}, str(j))


# ------------------------------------------------------------------ planning

def load_state(g):
    """What already exists in Gramps: photos with Immich ID, people by Gramps ID, sources by title."""
    medien = {}
    for m in g.items_list("/media/", "handle,gramps_id,attribute_list"):
        for a in m.get("attribute_list") or []:
            if a.get("type") == ATTR_ID and a.get("value"):
                medien[a["value"]] = (m["handle"], m.get("gramps_id", ""))
    people_ = {p.get("gramps_id"): p["handle"] for p in g.items_list("/people/", "handle,gramps_id") if p.get("handle")}
    sources = {}
    for q in g.items_list("/sources/", "handle,title"):
        sources.setdefault((q.get("title") or "").strip(), q["handle"])
    return medien, people_, sources


def plan(items, state, written):
    medien, people_, sources = state
    rows, new_sources = [], set()
    for it in items:
        key = it["key"]
        z = {"key": key, "events": [e.get("text", "") for e in it.get("events") or []], "title": it.get("title", ""), "date_text": gramps_datum(it.get("date") or {})[1], "people_ok": [], "people_missing": [],
             "source_text": "", "new_source": False, "action": "new", "reason": "", "gid": ""}
        if key in written:
            z.update(action="present", reason=tx('Already written to Gramps by Grimmich ({gid}).', gid=written[key].get('gid', '')), gid=written[key].get("gid", ""))
        elif it["asset"] in medien:
            z.update(action="present", reason=tx('This photo is already in Gramps ({gid}). It is not touched.', gid=medien[it['asset']][1]), gid=medien[it["asset"]][1])
        q = it.get("source")
        if q:
            z["source_text"] = f"{q['album']}: Seite {q['seite']}, Foto {q['nr']}"
            if q["album"].strip() not in sources and q["album"].strip() not in new_sources and z["action"] == "new":
                z["new_source"] = True
                new_sources.add(q["album"].strip())
        for p in it.get("people") or []:
            (z["people_ok"] if p.get("gid") in people_ else z["people_missing"]).append(p["name"])
        if z["people_missing"] and z["action"] == "new":
            z["reason"] = "Not found in Gramps (no link to the photo): " + ", ".join(z["people_missing"])
        rows.append(z)
    n = lambda a: sum(1 for z in rows if z["action"] == a)
    return rows, {"new": n("new"), "present": n("present"), "sources_new": sum(1 for z in rows if z["new_source"]),
                    "citations": sum(1 for z in rows if z["action"] == "new" and z["source_text"]),
                    "events": sum(len(z["events"]) for z in rows if z["action"] == "new"),
                    "people": sum(len(z["people_ok"]) for z in rows if z["action"] == "new")}


def load_items():
    one = read_(INPUT_FILE, None)
    if not one or not one.get("items"):
        sys.exit(tx("{file} is missing or empty. Please choose the photos in the interface.", file=INPUT_FILE))
    return one["items"]


def tree_name(g):
    try:
        m = g.json("GET", "/metadata/")
        return (m.get("database") or {}).get("name") or ""
    except GrampsError:
        return ""


def preview():
    g = Gramps()
    g.log_in()
    items = load_items()
    print(tx("Connected to {url} as {user}. Reading the state of Gramps ...", url=g.url, user=g.user))
    state = load_state(g)
    rows, z = plan(items, state, read_(WRITTEN, {}))
    write_doc(PREVIEW, {"time": datetime.now().strftime("%Y-%m-%d %H:%M"), "target": g.url, "tree": tree_name(g), "rows": rows, "counters": z})
    print(tx("Preview done: {new} new photos, {present} already present, {sources} new sources, {citations} citations, {people} person links. Nothing has been written.", new=z['new'], present=z['present'], sources=z['sources_new'], citations=z['citations'], people=z['people']))


# ------------------------------------------------------------------ writing

def attribut(type_, value):
    return {"_class": "Attribute", "type": type_, "value": value, "private": False, "citation_list": [], "note_list": []}


def save_record(written, key, rec):
    written[key] = rec
    write_doc(WRITTEN, written)


def write_one(g, it, state, written, sources_new, immich_read, immich_write_, tag_cache):
    key, asset = it["key"], it["asset"]
    medien, people_, sources = state
    rec = {"asset": asset, "title": it.get("title", ""), "time": datetime.now().strftime("%Y-%m-%d %H:%M"), "target": g.url, "people": [], "unfinished": True}
    data_, w, h, source_image = fetch_image(immich_read, asset)
    print(tx("  Image: {w}x{h} ({source}), {kb} KB", w=w, h=h, source=source_image, kb=len(data_) // 1024))
    code, resp = g.raw("POST", "/media/", data_=data_, head={"Content-Type": "image/jpeg"})
    if code >= 400:
        raise GrampsError(f"Upload rejected (error {code}): {resp[:200].decode('utf-8', 'replace')}")
    new_ = new_entry(json.loads(resp))
    rec.update(media=new_["handle"], gid=new_.get("gramps_id", ""))
    save_record(written, key, rec)
    # source (once per album) and citation
    cite = None
    q = it.get("source")
    if q:
        title = q["album"].strip()
        if title in sources:
            source_h = sources[title]
        else:
            source_h = new_entry(g.json("POST", "/sources/", {"_class": "Source", "title": title}))["handle"]
            sources[title] = source_h
            rec["source_new"] = True
            sources_new[title] = source_h
        cite = new_entry(g.json("POST", "/citations/", {"_class": "Citation", "source_handle": source_h,
                                                              "page": f"Seite {q['seite']}, Foto {q['nr']}",
                                                              **({"media_list": [{"_class": "MediaRef", "ref": rec["media"], "rect": None, "private": False,
                                                                                  "attribute_list": [], "citation_list": [], "note_list": []}]} if g.citation_image else {})}))["handle"]
        rec.update(source=source_h, citation=cite, source_title=title)
        save_record(written, key, rec)
    # title, date, citation, Immich id on the media object
    m = g.json("GET", f"/media/{rec['media']}")
    m["desc"] = it.get("title") or key
    m["date"] = gramps_datum(it.get("date") or {})[0]
    m["attribute_list"] = [a for a in (m.get("attribute_list") or []) if a.get("type") != ATTR_ID] + [attribut(ATTR_ID, asset)]
    if cite:
        m["citation_list"] = list(m.get("citation_list") or []) + [cite]
    g.json("PUT", f"/media/{rec['media']}", m)
    medien[asset] = (rec["media"], rec["gid"])
    # people with face boxes
    frame = faces(immich_read, asset)
    for p in it.get("people") or []:
        ph = people_.get(p.get("gid"))
        if not ph:
            print(tx("  Person {name} ({gid}) not found in Gramps, skipped.", name=p['name'], gid=p.get('gid')))
            continue
        boxen = frame.get(p.get("pid")) or [[]]
        person = g.json("GET", f"/people/{ph}")
        for b in boxen:
            person.setdefault("media_list", []).append({"_class": "MediaRef", "ref": rec["media"], "rect": b, "attribute_list": [],
                                                         "citation_list": [], "note_list": [], "private": False})
        g.json("PUT", f"/people/{ph}", person)
        rec["people"].append({"handle": ph, "gid": p.get("gid"), "name": p["name"]})
        save_record(written, key, rec)
    # enter the photo at the assigned events (whole image, without box)
    rec.setdefault("events", [])
    for ev in it.get("events") or []:
        try:
            e = g.json("GET", f"/events/{ev['id']}")
            if not any(r.get("ref") == rec["media"] for r in e.get("media_list") or []):
                e.setdefault("media_list", []).append({"_class": "MediaRef", "ref": rec["media"], "rect": None, "attribute_list": [],
                                                       "citation_list": [], "note_list": [], "private": False})
                g.json("PUT", f"/events/{ev['id']}", e)
            rec["events"].append(ev["id"])
            save_record(written, key, rec)
        except GrampsError as err:
            print(tx("  Event {event} not found or not writable: {error}", event=ev.get('text', ev.get('id')), error=err))
    # Tag in Immich
    if immich_write_ and rec["gid"]:
        try:
            name = f"{TAG_ROOT}/{rec['gid']}"
            ids = tag_ids(immich_write_, [name], create=True)
            immich_write_.request_("PUT", f"/tags/{ids[name]}/assets", {"ids": [asset]})
            rec["tag"] = name
        except ApiError as e:
            print(tx("  Tag in Immich not set: {error}", error=e))
    rec.pop("unfinished", None)
    save_record(written, key, rec)
    return rec


def write_it():
    g = Gramps()
    g.log_in()
    access = load_env(READ_ENV)
    if not access:
        sys.exit(tx("{file} is missing or incomplete (it is needed to load the images).", file=READ_ENV))
    between = load_env(credentials.write_env_name("immich"))
    immich_write_ = Immich(*between) if between else None
    if not immich_write_:
        print(tx("({file} is missing: the tag with the Gramps number is not set in Immich.)", file=credentials.write_env_name('immich')))
    items = load_items()
    written = read_(WRITTEN, {})
    print(tx("Connected to {url} (tree: {tree}). Reading the state ...", url=g.url, tree=tree_name(g) or tx('unknown')))
    state = load_state(g)
    rows, _ = plan(items, state, written)
    target_ = [it for it, z in zip(items, rows) if z["action"] == "new"]
    for it, z in zip(items, rows):
        if z["action"] != "new":
            print(tx("Skipped {name}: {error}", name=it['key'], error=z['reason']))
    print(tx("Writing {n} photos ...", n=len(target_)))
    success, fail, in_folge, sources_new = [], [], 0, {}
    for i, it in enumerate(target_, 1):
        print(tx("{i} of {n}: {key}", i=i, n=len(target_), key=it['key']))
        try:
            rec = write_one(g, it, state, written, sources_new, access, immich_write_, {})
            success.append(it["key"])
            in_folge = 0
            print(tx("  done: {gid}", gid=rec['gid']))
        except (GrampsError, ApiError, ValueError, KeyError) as e:
            fail.append({"key": it["key"], "errors": str(e)})
            print(tx("  Error: {error}", error=e))
            in_folge += 1
            if in_folge >= 3:
                break
    write_doc(RESULT, {"time": datetime.now().strftime("%Y-%m-%d %H:%M"), "written": len(success), "errors": fail, "target": g.url})
    print(tx("Done: {ok} photos written, {fail} errors.", ok=len(success), fail=len(fail)))
    if in_folge >= 3:
        sys.exit(tx("Three errors in a row. I stopped. Please send the message."))
    if fail:
        sys.exit(tx("There were errors. Photos with errors can be cleaned up with 'Undo' and tried again."))


# ------------------------------------------------------------------ undo

def back_(key_):
    g = Gramps()
    g.log_in()
    written = read_(WRITTEN, {})
    keys = key_ or list(written)
    if not keys:
        print(tx("Nothing to undo."))
        return
    between = load_env(credentials.write_env_name("immich"))
    immich_write_ = Immich(*between) if between else None
    print(tx("Undoing {n} photos in Gramps ({url}) ...", n=len(keys), url=g.url))
    ok = 0
    for key in keys:
        rec = written.get(key)
        if not rec:
            continue
        if rec.get("target") and rec["target"] != g.url:
            print(tx("Skipped {key}: was created in {target}, not in {url}.", key=key, target=rec['target'], url=g.url))
            continue
        errors = False
        for p in rec.get("people") or []:     # remove the links to the photo from the people
            try:
                person = g.json("GET", f"/people/{p['handle']}")
                person["media_list"] = [r for r in person.get("media_list") or [] if r.get("ref") != rec.get("media")]
                g.json("PUT", f"/people/{p['handle']}", person)
            except GrampsError as e:
                print(tx("  Person {name}: {error}", name=p.get('name'), error=e))
                errors = True
        for eh in rec.get("events") or []:   # remove the link to the photo from the events
            try:
                e = g.json("GET", f"/events/{eh}")
                e["media_list"] = [r for r in e.get("media_list") or [] if r.get("ref") != rec.get("media")]
                g.json("PUT", f"/events/{eh}", e)
            except GrampsError as err:
                print(tx("  Event {event}: {error}", event=eh, error=err))
                errors = True
        if rec.get("media") and not g.delete(f"/media/{rec['media']}"):
            print(tx("  Photo {gid} could not be deleted.", gid=rec.get('gid')))
            errors = True
        if rec.get("citation") and not g.delete(f"/citations/{rec['citation']}"):
            print(tx("  Citation could not be deleted."))
            errors = True
        if rec.get("source_new") and rec.get("source"):
            others = [k for k, r in written.items() if k != key and k not in keys and r.get("source") == rec["source"]]
            if not others:
                g.delete(f"/sources/{rec['source']}")
        if immich_write_ and rec.get("tag"):
            try:
                ids = tag_ids(immich_write_, [rec["tag"]], create=False)
                if rec["tag"] in ids:
                    immich_write_.request_("DELETE", f"/tags/{ids[rec['tag']]}")
            except ApiError as e:
                print(tx("  Tag in Immich not removed: {error}", error=e))
        if not errors:
            written.pop(key, None)
            ok += 1
            print(tx("  {key}: undone", key=key))
        write_doc(WRITTEN, written)
    print(tx("Done: {ok} of {n} undone.", ok=ok, n=len(keys)))
    if ok < len(keys):
        sys.exit(tx("Not everything could be undone. Please look at the messages."))


def main():
    modus = sys.argv[1] if len(sys.argv) > 1 else "preview"
    try:
        if modus == "preview":
            preview()
        elif modus == "write":
            write_it()
        elif modus == "undo":
            back_(sys.argv[2:])
        else:
            sys.exit("Usage: python gramps_write.py preview | write | undo [key ...]")
    except (GrampsError, ApiError) as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
