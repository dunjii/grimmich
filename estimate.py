"""Age estimate for the datable photos in the album (TEST RUN).

Writes NOTHING to Immich. Result: table 'schaetzung.csv' and
control images in the folder 'ausgabe_immich'.

Usage:
    python estimate.py        -> all datable photos
    python estimate.py 10     -> only the first 10 datable photos (test)

Optional: if the file 'bekannte_jahre.csv' is in the same folder
(columns: key;year;confidence), the script compares its estimates
with these years at the end. The key is the name of the control
image without '.jpg' (e.g. 2_6c525d); the year may be a range.
"""
from messages import tx
import csv
import json
import os
import re
import sys
from collections import Counter

import cv2
import numpy as np
import storage
from immich import ApiError, Immich
import addresses
import torch
from transformers import AutoImageProcessor, AutoModelForImageClassification

from calculation import (SERIES_DIFFERENCE, CORRELATION, SYSTEM_ERROR, decimal_year_value, sigma, _mean,  # noqa: F401
                     _span, order_violated, find_outliers, combine, combine_series)

ENV_FILE = "immich.env"


def _env_value(name, default=""):
    try:
        with open(ENV_FILE, encoding="utf-8") as f:
            for z in f:
                if z.strip().startswith(name + "="):
                    return z.split("=", 1)[1].strip() or default
    except OSError:
        pass
    return default


def _work_album():
    """Album name from immich.env (IMMICH_ALBUM), otherwise the default."""
    return _env_value("IMMICH_ALBUM", "Scan-Datierung")


def _anchor_album():
    """Name of the anchor album (IMMICH_ANCHOR_ALBUM): real digital photos, read only. Empty = none."""
    return _env_value("IMMICH_ANCHOR_ALBUM", "")


ALBUM_NAME = _work_album()
ANCHOR_NAME = _anchor_album()
MODEL_NAME = "iitolstykh/mivolo_v2"
CSV_FILE = "schaetzung.csv"
CACHE_FILE = "estimate_cache.json"
KNOWN_FILE = "bekannte_jahre.csv"
SERIES_JSON = "series.json"                      # from series.py
SERIES_DECISION = "series_decisions.json"  # old interface (serien_gui.py)
SERIES_WORK = "series_work.json"             # new interface (datierung_gui.py)
IMAGE_FOLDER = "ausgabe_immich"
PAGE_SIZE = 500

# True: every face is additionally computed mirrored, both results
# are averaged (less noise, but double the computing time).
MIRROR = True

# True: the body crop is delivered by the detector 'YOLO-Face-Person-Detector'
# (real person boxes). False: estimated from the face box as before.
BODY = True

# systematic minimum error (years) that is added to the spread in the
# stated span. Calibrated on the known years.

if BODY:  # separate files, so the results of both variants stay comparable
    CSV_FILE = "schaetzung_koerper.csv"
    CACHE_FILE = "estimate_cache_body.json"
    IMAGE_FOLDER = "ausgabe_immich_koerper"


# ---------------------------------------------------------------- Immich access

def load_settings():
    if not os.path.exists(ENV_FILE):
        sys.exit(tx("The file {file} is missing. Please start in the Grimmich folder.", file=ENV_FILE))
    values_ = {}
    with open(ENV_FILE, encoding="utf-8") as f:
        for entry_row in f:
            entry_row = entry_row.strip()
            if not entry_row or entry_row.startswith("#") or "=" not in entry_row:
                continue
            k, v = entry_row.split("=", 1)
            values_[k.strip()] = v.strip()
    url = addresses.url(values_, "immich")
    key = values_.get("IMMICH_API_KEY", "")
    if not url or not key:
        sys.exit(tx("IMMICH_URL or IMMICH_API_KEY is missing in {file}.", file=ENV_FILE))
    return url, key




URL = API_KEY = None


def request_(path_, params=None, data_=None, raw=False):
    return Immich(URL, API_KEY, timeout=120).request_(None, path_, data_=data_, params=params, raw=raw)


def important(*args, **kwargs):
    """Like request(), but ends the script on an error."""
    try:
        return request_(*args, **kwargs)
    except ApiError as e:
        sys.exit(str(e))


def load_people():
    people_ = {}
    page = 1
    while True:
        response = important("/people", {"page": page, "size": 500})
        if isinstance(response, list):
            items_list, next_ = response, False
        else:
            items_list, next_ = response.get("people", []), response.get("hasNextPage")
        for p in items_list:
            people_[p["id"]] = {
                "name": (p.get("name") or "").strip(),
                "birthDate": p.get("birthDate"),
            }
        if not next_:
            return people_
        page += 1


def _album_photos(album_id):
    photos = []
    page = 1
    while True:
        response = important(
            "/search/metadata",
            data_={"albumIds": [album_id], "page": page, "size": PAGE_SIZE, "withExif": True},
        )
        assets = response.get("assets", {})
        photos.extend(assets.get("items", []))
        next_ = assets.get("nextPage")
        if not next_:
            return photos
        page = int(next_)


def load_album_photos():
    """Photos of the working album and, if configured, of the anchor album (these carry "_anchor": True)."""
    ids = {}
    for a in important("/albums"):
        ids[a.get("albumName")] = a["id"]
    if ALBUM_NAME not in ids:
        sys.exit(tx("Album '{album}' not found.", album=ALBUM_NAME))
    photos = _album_photos(ids[ALBUM_NAME])
    if ANCHOR_NAME and ANCHOR_NAME != ALBUM_NAME:
        if ANCHOR_NAME not in ids:
            print(tx("Note: anchor album '{album}' not found - it is ignored.", album=ANCHOR_NAME))
        else:
            present = {f["id"] for f in photos}
            for f in _album_photos(ids[ANCHOR_NAME]):
                if f["id"] in present:
                    continue   # in both albums: counts as a working photo
                f["_anker"] = True
                photos.append(f)
    return photos


# ---------------------------------------------------------------- computing

# ---------------------------------------------------------------- model

_model = None
_processor = None


def load_model():
    global _model, _processor
    if _model is None:
        print(tx("Loading the MiVOLO model ..."))
        _model = AutoModelForImageClassification.from_pretrained(
            MODEL_NAME, trust_remote_code=True, torch_dtype=torch.float32
        )
        _model.eval()
        _processor = AutoImageProcessor.from_pretrained(
            MODEL_NAME, trust_remote_code=True
        )
    return _model, _processor


_detector = None
_detector_error = False


def load_detector():
    """Load the person/face detector (only loading this one file
    switches off torch's strict safety mode). None if not possible."""
    global _detector, _detector_error
    if _detector is None and not _detector_error:
        try:
            from huggingface_hub import hf_hub_download
            from ultralytics import YOLO
            print(tx("Loading the person detector ..."))
            path_ = hf_hub_download("iitolstykh/YOLO-Face-Person-Detector",
                                   "yolov8x_person_face.pt")
            original = torch.load
            torch.load = lambda *a, **k: original(*a, **{**k, "weights_only": False})
            try:
                _detector = YOLO(path_)
            finally:
                torch.load = original
        except Exception as e:  # noqa: BLE001
            _detector_error = True
            print(tx("(Note: person detector not available: {error})", error=e))
            print(tx("(Continuing with an estimated body crop.)"))
    return _detector


def find_person_frame(image):
    """List of (x1, y1, x2, y2) of all recognised people in the image."""
    det = load_detector()
    if det is None:
        return []
    res = det.predict(source=image, conf=0.3, iou=0.7, verbose=False)[0]
    frame = []
    for b in res.boxes:
        if res.names[int(b.cls)] == "person":
            frame.append(tuple(float(v) for v in b.xyxy[0].tolist()))
    return frame


def choose_person(face, people_):
    """Choose a fitting person box for the face (the smallest one that almost
    fully contains the face and in whose upper part the face sits) or None."""
    fx1, fy1, fx2, fy2 = face
    farea = max(1.0, (fx2 - fx1) * (fy2 - fy1))
    best = None
    for (px1, py1, px2, py2) in people_:
        ix = max(0.0, min(fx2, px2) - max(fx1, px1))
        iy = max(0.0, min(fy2, py2) - max(fy1, py1))
        if ix * iy / farea < 0.8:
            continue
        ph = py2 - py1
        if ph <= 0 or ((fy1 + fy2) / 2 - py1) / ph > 0.5:
            continue
        if (px2 - px1) < (fx2 - fx1) * 1.2:
            continue
        area = (px2 - px1) * ph
        if best is None or area < best[0]:
            best = (area, (px1, py1, px2, py2))
    return best[1] if best else None


body_stats = {"echt": 0, "estimated": 0}
last_bodies = []  # per face box of the last call: (x1,y1,x2,y2,real)


def estimate_age(image, boxen):
    """boxes: list of (x1, y1, x2, y2) in pixels of the image. -> list of ages (or None)."""
    model_obj, processor = load_model()
    h, w = image.shape[:2]
    faces, body_part, index = [], [], []
    last_bodies[:] = [None] * len(boxen)
    people_ = find_person_frame(image) if BODY else []
    for i, (x1, y1, x2, y2) in enumerate(boxen):
        x1, y1 = max(0, int(x1)), max(0, int(y1))
        x2, y2 = min(w, int(x2)), min(h, int(y2))
        bw, bh = x2 - x1, y2 - y1
        if bw < 8 or bh < 8:
            continue
        faces.append(image[y1:y2, x1:x2])
        person = choose_person((x1, y1, x2, y2), people_) if people_ else None
        if person is not None:
            px1, py1, px2, py2 = person
            bx1, bx2 = max(0, int(px1)), min(w, int(px2))
            by1, by2 = max(0, int(py1)), min(h, int(py2))
            body_stats["echt"] += 1
            real = True
        else:
            bx1, bx2 = max(0, x1 - bw), min(w, x2 + bw)
            by1, by2 = max(0, y1 - bh // 3), min(h, y2 + 4 * bh)
            body_stats["estimated"] += 1
            real = False
        body_part.append(image[by1:by2, bx1:bx2])
        last_bodies[i] = (bx1, by1, bx2, by2, real)
        index.append(i)
    age_value = [None] * len(boxen)
    if not faces:
        return age_value
    amount = len(faces)
    if MIRROR:
        faces = faces + [cv2.flip(c, 1) for c in faces]
        body_part = body_part + [cv2.flip(c, 1) for c in body_part]
    with torch.no_grad():
        fi = processor(images=faces)["pixel_values"]
        bi = processor(images=body_part)["pixel_values"]
        fi = fi.to(dtype=model_obj.dtype, device=model_obj.device)
        bi = bi.to(dtype=model_obj.dtype, device=model_obj.device)
        out = model_obj(faces_input=fi, body_input=bi)
    for pos, i in enumerate(index):
        a = float(out.age_output[pos].item())
        if MIRROR:
            a = (a + float(out.age_output[pos + amount].item())) / 2
        age_value[i] = a
    return age_value


def load_image(asset_id):
    # edited=true: load the image the way Immich displays it (after
    # mirroring/rotating/cropping). Only the face boxes match that.
    data_ = request_(
        f"/assets/{asset_id}/thumbnail",
        {"size": "preview", "edited": "true"},
        raw=True,
    )
    image = cv2.imdecode(np.frombuffer(data_, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ApiError("Vorschaubild konnte nicht gelesen werden")
    return image


class FrameError(Exception):
    """The face boxes obviously do not fit the image."""


def box_in_pixeln(face, image):
    try:
        x1, y1 = face["boundingBoxX1"], face["boundingBoxY1"]
        x2, y2 = face["boundingBoxX2"], face["boundingBoxY2"]
    except KeyError:
        raise ApiError(
            "Unerwartetes Format der Gesichtsdaten. Gefundene Felder: "
            f"{sorted(face.keys())}"
        )
    h, w = image.shape[:2]
    iw = face.get("imageWidth") or w
    ih = face.get("imageHeight") or h
    if abs(iw / ih - w / h) > 0.03 * (w / h):
        raise FrameError("Rahmen passen nicht zum Bild (anderes Seitenverhaeltnis)")
    sx, sy = w / iw, h / ih
    x1, y1, x2, y2 = x1 * sx, y1 * sy, x2 * sx, y2 * sy
    if x2 <= x1 or y2 <= y1 or x1 < -0.03 * w or y1 < -0.03 * h \
            or x2 > 1.03 * w or y2 > 1.03 * h:
        raise FrameError("Rahmen liegen ausserhalb des Bildes")
    return (x1, y1, x2, y2)


# ---------------------------------------------------------------- cache

# If anything changes in the age calculation, the cache is discarded.
CACHE_VERSION = 4


def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, encoding="utf-8") as f:
                data_ = json.load(f)
        except (OSError, ValueError):
            return {}
        if (isinstance(data_, dict) and data_.get("version") == CACHE_VERSION
                and data_.get("mirror") == MIRROR
                and data_.get("body") == BODY):
            return data_.get("age", {})
    return {}


def save_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump({"version": CACHE_VERSION, "mirror": MIRROR,
                   "body": BODY, "age": cache}, f)


# ---------------------------------------------------------------- known years

def read_known():
    """key;year;confidence  ->  {key: (from, to, confidence)}

    key: either the file name (with extension) or, unambiguously,
    'name_firstSixCharsOfID' as with the control images.
    year: '1955' or a range like '1954-1955' or '1954/1955'.
    Split only at semicolons (file names may contain commas).
    """
    known_ = {}
    if not os.path.exists(KNOWN_FILE):
        return known_
    muster = re.compile(r"^\s*(\d{4})\s*(?:[-/–]\s*(\d{4}))?\s*$")
    with open(KNOWN_FILE, encoding="utf-8-sig") as f:
        for entry_row in f:
            entry_row = entry_row.strip()
            if not entry_row:
                continue
            parts = [t.strip() for t in entry_row.split(";")]
            if len(parts) < 2:
                continue
            m = muster.match(parts[1])
            if not m:
                continue  # header line or unreadable
            from_ = int(m.group(1))
            to_ = int(m.group(2)) if m.group(2) else from_
            known_[parts[0]] = (min(from_, to_), max(from_, to_),
                                 parts[2] if len(parts) > 2 else "")
    return known_


def hint_text(hint):
    """Hints are stored in English; for the log they are shown in the language of the interface."""
    return "; ".join(tx(h) for h in str(hint).split("; "))


def compare_with_known(rows, title=None):
    title = title or tx("COMPARISON WITH KNOWN YEARS")
    known_ = read_known()
    if not known_:
        return
    print()
    print(f"=== {title} ===")
    hits = []
    found = set()
    for key_, (kvon, kbis, sure) in known_.items():
        matching = [z for z in rows if z["key_set"] == key_]
        if not matching:  # fallback: unique file name
            matching = [z for z in rows if z["file"] == key_]
            if len(matching) != 1:
                matching = []
        if matching:
            hits.append((matching[0], kvon, kbis, sure))
            found.add(key_)
    missing = len(known_) - len(found)
    if not hits:
        print(tx("None of the {n} entries from {file} has an estimate.", n=len(known_), file=KNOWN_FILE))
        return

    def distance(z, kvon, kbis):
        """0 if the estimate lies within the known range, otherwise the distance to it."""
        if z["year"] < kvon:
            return z["year"] - kvon
        if z["year"] > kbis:
            return z["year"] - kbis
        return 0

    dist = [distance(z, kv, kb) for z, kv, kb, _ in hits]
    amounts = sorted(abs(a) for a in dist)
    inside = sum(a == 0 for a in dist)
    overlaps = sum(z["from"] <= kb and z["to"] >= kv for z, kv, kb, _ in hits)
    print(tx("Compared photos:                           {n}", n=len(hits))
          + (tx("   (without estimate/not found: {n})", n=missing) if missing else ""))
    print(tx("Estimate lies within the known span:        {n} of {total}", n=inside, total=len(hits)))
    print(tx("Estimated span overlaps the known one:      {n} of {total}", n=overlaps, total=len(hits)))
    print(tx("Mean distance to the known span:        {n} years", n=format(sum(dist) / len(dist), "+.1f")))
    print(tx("Typical size of the distance (median):   {n} years", n=amounts[len(amounts) // 2]))
    for z, kv, kb, s in hits:
        known = f"{kv}" if kv == kb else f"{kv}-{kb}"
        print(tx("  {key}: known {known} ({source}), estimated {year} ({from_}-{to}), distance {dist}", key=z['key_set'], known=known, source=s or '?', year=z['year'], from_=z['from'], to=z['to'], dist=format(distance(z, kv, kb), '+d'))
              + (f"  !! {hint_text(z['hint'])}" if z["hint"] else ""))


# ---------------------------------------------------------------- series



def load_confirmed_series():
    """-> list (number, [key]) of the confirmed series, or None if no files exist."""
    if storage.present(SERIES_WORK):
        work = storage.load(SERIES_WORK, None)
        if not isinstance(work, dict):
            return None
        result = []
        for s_ in work.get("series", []):
            if s_.get("status") == "ok" and len(s_.get("photos", [])) >= 2:
                digits = "".join(c for c in str(s_.get("id", "")) if c.isdigit())
                result.append((int(digits) if digits else 0, list(s_["photos"])))
        return result
    if not (storage.present(SERIES_JSON) and storage.present(SERIES_DECISION)):
        return None
    try:
        series = storage.load(SERIES_JSON, {})["series"]
        dec = storage.load(SERIES_DECISION, None)
        if dec is None:
            return None
    except (KeyError, TypeError):
        return None
    result = []
    for s_ in series:
        d = dec.get(s_["id"])
        if not d or d.get("status") != "ok":
            continue
        leave_out = set(d.get("out", []))
        keys = [x["key"] for x in s_["photos"] if x["key"] not in leave_out]
        if len(keys) >= 2:
            result.append((s_["number"], keys))
    return result


def apply_series(rows, photos, series):
    """Returns (new list of rows, statistics). The single estimates stay unchanged in 'rows'."""
    by_key = {z["key_set"]: z for z in rows}
    photo_by_key = {
        os.path.splitext(f.get("originalFileName", "foto"))[0] + "_" + f["id"][:6]: f for f in photos
    }
    new_ = {z["key_set"]: dict(z, series_id="", single="") for z in rows}
    stat = {"series": 0, "adopted": 0, "differs": 0, "without_data": 0, "unknown": 0}
    for number, keys in series:
        known_keys = [k for k in keys if k in photo_by_key]
        stat["unknown"] += len(keys) - len(known_keys)
        value_lists = [by_key[k]["values"] for k in known_keys if k in by_key]
        if not value_lists:
            stat["without_data"] += 1
            continue
        res, amount = combine_series(value_lists)
        single_one = sorted(by_key[k]["year"] for k in known_keys if k in by_key)
        hints = [res["hint"]] if res["hint"] else []
        if single_one[-1] - single_one[0] > SERIES_DIFFERENCE:
            hints.append(f"Individual estimates in the series differ strongly ({single_one[0]}-{single_one[-1]})")
            stat["differs"] += 1
        stat["series"] += 1
        for k in known_keys:
            photo = photo_by_key[k]
            old = by_key.get(k)
            entry_row = {
                "file": photo.get("originalFileName", ""),
                "key_set": k,
                "id": photo["id"],
                "year": round(res["year"]),
                "from": res["from"],
                "to": res["to"],
                "count": amount,
                "hint": "; ".join(hints),
                "details": old["details"] if old else "von der Serie uebernommen (eigene Gesichter nicht datierbar)",
                "outliers": "",
                "suggestion": "",
                "current": (photo.get("localDateTime") or photo.get("fileCreatedAt") or "")[:10],
                "series_id": f"{number:03d} ({len(known_keys)} Fotos)",
                "single": f"{old['year']} ({old['from']}-{old['to']})" if old else "",
                "values": old["values"] if old else [],
            }
            if not old:
                stat["adopted"] += 1
            new_[k] = entry_row
    return list(new_.values()), stat


# ---------------------------------------------------------------- main part

def main():
    global URL, API_KEY
    URL, API_KEY = load_settings()
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None

    print(tx("Connecting to {url} ...", url=URL))
    people_ = load_people()
    photos = load_album_photos()
    print(tx("{n} photos in the album '{album}'.", n=len(photos), album=ALBUM_NAME))
    os.makedirs(IMAGE_FOLDER, exist_ok=True)

    body_boxes = {}  # face id -> body box (only for control images)
    cache = load_cache()  # face id -> estimated age
    if not cache:  # fresh run: clear away old control images
        for name in os.listdir(IMAGE_FOLDER):
            if name.lower().endswith(".jpg"):
                os.remove(os.path.join(IMAGE_FOLDER, name))
    reload = set()  # photos whose image changed in Immich (reported by immich_state.py)
    try:
        reload = set((storage.load("reload.json", {}) or {}).get("assets", []))
    except (AttributeError, TypeError):
        pass
    if reload:
        print(tx("{n} photos with a changed image are recomputed.", n=len(reload)))
    age_info = {}  # key -> people with birth year and single age (for the interface)
    rows = []
    errors = []
    datable = 0
    errors_in_row = 0

    def remember_error(photo, reason_):
        errors.append({
            "file": photo.get("originalFileName", ""),
            "id": photo["id"],
            "reason": reason_,
            "current": (photo.get("localDateTime") or photo.get("fileCreatedAt") or "")[:10],
        })

    try:
        for photo in photos:
            if limit is not None and datable >= limit:
                break
            try:
                faces = request_("/faces", {"id": photo["id"]})
                if photo["id"] in reload:
                    for g in faces:
                        cache.pop(g["id"], None)
                candidates = []
                for g in faces:
                    pid = (g.get("person") or {}).get("id")
                    info = people_.get(pid)
                    if not info or not info["name"]:
                        continue
                    birth = decimal_year_value(info["birthDate"]) if info["birthDate"] else None
                    candidates.append((g, info, birth))   # also without a birth date: the age is estimated but not used for dating
                if not candidates:
                    continue
                with_birth = any(k[2] is not None for k in candidates)
                key_photo = os.path.splitext(photo.get("originalFileName", "foto"))[0] + "_" + photo["id"][:6]
                age_info[key_photo] = [{"name": k[1]["name"], "birth": round(k[2], 4) if k[2] is not None else None, "age": None} for k in candidates]
                if with_birth:
                    datable += 1

                missing_ = [k for k in candidates if k[0]["id"] not in cache]
                image = None
                if missing_:
                    image = load_image(photo["id"])
                    boxen = [box_in_pixeln(k[0], image) for k in missing_]
                    age_list = estimate_age(image, boxen)
                    for k, kb in zip(missing_, last_bodies):
                        body_boxes[k[0]["id"]] = kb
                    for k, a in zip(missing_, age_list):
                        cache[k[0]["id"]] = a  # None = face too small
                errors_in_row = 0

                values_, details, marks = [], [], []
                for g, info, birth in candidates:
                    age_value = cache.get(g["id"])
                    if age_value is None:
                        continue
                    for ai in age_info[key_photo]:
                        if ai["name"] == info["name"] and ai["age"] is None:
                            ai["age"] = round(age_value, 4)
                            break
                    if birth is None:
                        continue   # without a birth date only remember the age
                    year_num = birth + age_value
                    values_.append({"year": year_num, "sigma": sigma(age_value), "birth": birth,
                                  "age": age_value, "name": info["name"]})
                    details.append(tx("{name}: {age} y -> {year}", name=info['name'], age=format(age_value, ".1f"), year=format(year_num, ".1f")))
                    if image is not None:
                        marks.append((box_in_pixeln(g, image), age_value, year_num,
                                             body_boxes.get(g["id"])))

                if not values_:
                    if with_birth:
                        remember_error(photo, "alle Gesichter zu klein")
                    continue

                res = combine(values_)
                outl = res["outliers"]
                rows.append(
                    {
                        "file": photo.get("originalFileName", ""),
                        "key_set": os.path.splitext(photo.get("originalFileName", "foto"))[0]
                        + "_" + photo["id"][:6],
                        "id": photo["id"],
                        "year": round(res["year"]),
                        "from": res["from"],
                        "to": res["to"],
                        "count": len(values_),
                        "hint": res["hint"],
                        "details": " | ".join(details),
                        "outliers": outl["text"] if outl else "",
                        "suggestion": outl["suggestion"] if outl else "",
                        "current": (photo.get("localDateTime") or photo.get("fileCreatedAt") or "")[:10],
                        "values": values_,
                    }
                )
                print(tx("[{n}] {name}: {faces} face(s) -> approx. {year} ({from_}-{to})", n=datable, name=photo.get('originalFileName', ''), faces=len(values_), year=round(res['year']), from_=res['from'], to=res['to'])
                      + (f"  !! {hint_text(res['hint'])}" if res["hint"] else ""))

                if image is not None and marks:
                    for (x1, y1, x2, y2), age_value, j, kb in marks:
                        if BODY and kb:  # blue = from the detector, yellow = estimated
                            color = (255, 120, 0) if kb[4] else (0, 220, 255)
                            cv2.rectangle(image, (int(kb[0]), int(kb[1])), (int(kb[2]), int(kb[3])), color, 3)
                            cv2.putText(image, f"{age_value:.0f}J -> {j:.0f}",
                                        (int(kb[0]) + 6, max(25, int(kb[3]) - 12)),
                                        cv2.FONT_HERSHEY_SIMPLEX, max(0.8, image.shape[1] / 1500),
                                        color, 2)
                        cv2.rectangle(image, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 3)
                        cv2.putText(image, f"{age_value:.0f}J -> {j:.0f}", (int(x1), max(25, int(y1) - 10)),
                                    cv2.FONT_HERSHEY_SIMPLEX, max(0.8, image.shape[1] / 1500),
                                    (0, 255, 0), 2)
                    root = os.path.splitext(photo.get("originalFileName", "foto"))[0]
                    cv2.imwrite(os.path.join(IMAGE_FOLDER, f"{root}_{photo['id'][:6]}.jpg"), image)

                if datable % 20 == 0:
                    save_cache(cache)

            except FrameError as e:
                remember_error(photo, str(e))
                print(tx("Skipped: {name}: {error}", name=photo.get('originalFileName', ''), error=e))
            except ApiError as e:
                remember_error(photo, str(e))
                errors_in_row += 1
                print(tx("Error with {name}: {error}", name=photo.get('originalFileName', ''), error=e))
                if errors_in_row >= 3:
                    sys.exit(tx("Three errors in a row - I am stopping. Please send the message."))
    finally:
        save_cache(cache)
        try:  # age per person and photo for the interface (in partial runs, merge with what exists)
            old_ai = {}
            if limit is not None:
                old_ai = storage.load("age_per_photo.json", {}) or {}
            old_ai.update(age_info)
            storage.save("age_per_photo.json", old_ai)
        except OSError:
            pass

    series = load_confirmed_series()
    rows_single = rows
    series_stat = None
    if series:
        rows, series_stat = apply_series(rows_single, photos, series)
        rows.sort(key=lambda z: z["file"])
    else:
        rows = [dict(z, series_id="", single="") for z in rows_single]

    with open(CSV_FILE, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Datei", "Schaetzung Jahr", "von", "bis", "Gesichter genutzt",
                    "Hinweis", "Details", "Ausreisser", "Vorschlag ohne Ausreisser",
                    "Aktuelles Datum", "Asset-ID", "Serie", "Einzelschaetzung"])
        for z in rows:
            w.writerow([z["file"], z["year"], z["from"], z["to"], z["count"],
                        z["hint"], z["details"], z["outliers"], z["suggestion"],
                        z["current"], z["id"], z["series_id"], z["single"]])
        for e in errors:
            w.writerow([e["file"], "", "", "", 0, "UEBERSPRUNGEN: " + e["reason"],
                        "", "", "", e["current"], e["id"]])

    print()
    print(tx("=== SUMMARY ==="))
    if BODY:
        print(tx("Body crop:                      {real} from the detector, {est} estimated (fallback)", real=body_stats['echt'], est=body_stats['estimated']))
    print(tx("Datable photos processed:       {n}", n=datable))
    print(tx("  with estimate:               {n}", n=len(rows)))
    print(tx("  skipped / errors:            {n}", n=len(errors)))
    print(tx("  hint 'contradict':           {n}", n=sum('contradict' in z['hint'] for z in rows)))
    print(tx("  hint 'age order':            {n}", n=sum('Age order' in z['hint'] for z in rows)))
    print(tx("  hint 'not born yet':         {n}", n=sum('not have been born' in z['hint'] for z in rows)))
    print(tx("  hint 'only older people':    {n}", n=sum('only older' in z['hint'] for z in rows)))
    print(tx("  with outlier suggestion:     {n}", n=sum(bool(z['suggestion']) for z in rows)))
    if rows:
        widths = sorted(z["to"] - z["from"] for z in rows)
        print(tx("Mean width of the span:         {n} years (median)", n=widths[len(widths) // 2]))
        decades = Counter(z["year"] // 10 * 10 for z in rows)
        print(tx("Distribution by decade:"))
        for jz in sorted(decades):
            print(tx("  {decade}s: {n}", decade=jz, n=decades[jz]))
    if series_stat:
        print()
        print(tx("=== SERIES ==="))
        print(tx("Confirmed series applied:       {n}", n=series_stat['series']))
        print(tx("Photos with adopted date:       {n}  (had no estimate before)", n=series_stat['adopted']))
        print(tx("Series with strongly differing single estimates: {n}  (see column hint)", n=series_stat['differs']))
        if series_stat["without_data"]:
            print(tx("Series without any datable person: {n}", n=series_stat['without_data']))
        if series_stat["unknown"]:
            print(tx("Keys no longer in the album: {n}", n=series_stat['unknown']))
        compare_with_known(rows_single, tx("COMPARISON WITH KNOWN YEARS (without series)"))
        compare_with_known(rows, tx("COMPARISON WITH KNOWN YEARS (with series)"))
    else:
        if storage.present(SERIES_JSON):
            print(tx("(No confirmed series found - series are not applied.)"))
        compare_with_known(rows)
    print()
    print(tx("Table: {file}   Control images: {folder}/", file=CSV_FILE, folder=IMAGE_FOLDER))


if __name__ == "__main__":
    main()
