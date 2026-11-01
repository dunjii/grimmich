"""Detect changes in Immich (read only).

Compares today's state of the photos in the album (faces, people, names,
birth dates) with the state at the last run and reports what changed.
Changes nothing in Immich.   Usage:  python immich_state.py

Files:
  immich_state.json   state at the last run (basis of comparison)
  changes.json        changes found per photo (they stay until you mark them as seen in the interface)
  reload.json         photos whose image changed (rotated/mirrored/newly recognised);
                      estimate.py and series.py recompute them
"""
from messages import tx
import os
from datetime import datetime

import estimate as S
import storage
from immich_write import DEVIATION_DAYS, ESTIMATED_ALL, OPEN_ALL, any_of, has_block, WRITTEN

STATE = "immich_state.json"
CHANGES = "changes.json"
RELOAD = "reload.json"
HAND_DATA = "immich_data.json"   # photos where you set the capture date in Immich yourself


def read_(path_, default):
    return storage.load(path_, default)


def write_doc(path_, data_):
    storage.save(path_, data_)


def frame(g):
    return [round(float(g.get(k) or 0)) for k in ("boundingBoxX1", "boundingBoxY1", "boundingBoxX2", "boundingBoxY2")] \
        + [int(g.get("imageWidth") or 0), int(g.get("imageHeight") or 0)]


def _by_grimmich(photo, key, written):
    exif = photo.get("exifInfo") or {}
    tags = {(t.get("value") or t.get("name") or "") for t in (photo.get("tags") or [])}
    return bool((key in written and not written[key].get("only_source")) or any_of(tags, ESTIMATED_ALL) or any_of(tags, OPEN_ALL)
                or has_block(exif.get("description")))


def camera_without_anchor(photo, key, written):
    """Digital photo (camera data) in the working album: does not count as a date. Really belongs in the anchor album."""
    exif = photo.get("exifInfo") or {}
    return bool(not photo.get("_anker") and (exif.get("make") or exif.get("model")) and exif.get("dateTimeOriginal")
                and not _by_grimmich(photo, key, written))


def hand_date(photo, key, written):
    """Has someone (you) set the capture date in Immich by hand, or is it a digital photo with a camera date?
    -> {"date", "scan", "camera"?} or None.
    Same rule as when writing (immich_write.py): deviation from the scan date, and the photo does not come from Grimmich."""
    exif = photo.get("exifInfo") or {}
    date_ = (exif.get("dateTimeOriginal") or "")[:10]
    scan = (photo.get("fileCreatedAt") or photo.get("localDateTime") or "")[:10]
    if not date_ or not scan:
        return None
    if _by_grimmich(photo, key, written):
        return None
    if photo.get("_anker"):   # anchor album: a real digital photo, the date counts (read only)
        return {"date": date_, "scan": scan, "camera": True, "anchor": True}
    if exif.get("make") or exif.get("model"):   # camera data in the working album do not count until you make it an anchor
        return None
    try:
        distance = abs((datetime.fromisoformat(date_) - datetime.fromisoformat(scan)).days)
    except ValueError:
        return None
    return {"date": date_, "scan": scan} if distance > DEVIATION_DAYS else None


DIAG = {"reloaded": 0, "with_date": 0, "with_camera": 0}


def snapshot():
    people_ = S.load_people()
    photos = S.load_album_photos()
    print(tx("{n} photos in the album. Reading faces ...", n=len(photos)))
    per_photo = {}
    hand_ = {}
    DIAG["camera_without_anchor"] = []
    written = read_(WRITTEN, {})
    for i, photo in enumerate(photos, 1):
        if i % 100 == 0:
            print(f"  {i} / {len(photos)}")
        try:
            faces = S.request_("/faces", {"id": photo["id"]})
        except S.ApiError as e:
            print(tx("Skipped {name}: {error}", name=photo.get('originalFileName', ''), error=e))
            continue
        key = os.path.splitext(photo.get("originalFileName", "foto"))[0] + "_" + photo["id"][:6]
        if not photo.get("exifInfo"):   # some Immich versions do not deliver the Exif data in the album list
            try:
                photo["exifInfo"] = S.request_(f"/assets/{photo['id']}").get("exifInfo") or {}
                DIAG["reloaded"] += 1
            except S.ApiError:
                photo["exifInfo"] = {}
        ex = photo["exifInfo"]
        DIAG["with_date"] += bool(ex.get("dateTimeOriginal"))
        DIAG["with_camera"] += bool(ex.get("make") or ex.get("model"))
        h = hand_date(photo, key, written)
        if h:
            hand_[key] = h
        elif camera_without_anchor(photo, key, written):
            DIAG["camera_without_anchor"].append(key)
        per_photo[key] = {"asset": photo["id"],
                        "faces": [{"id": g["id"], "p": (g.get("person") or {}).get("id") or "", "b": frame(g)}
                                      for g in faces]}
    return {"people": {pid: {"name": p["name"], "birth": p["birthDate"] or ""} for pid, p in people_.items()},
            "photos": per_photo}, hand_


def compare(old, new_):
    """-> ({key: {"texts": [...], "image": bool}}, list of the photos with a changed image)"""
    result = {}
    pa, pn = old["people"], new_["people"]

    def name(state, pid):
        return (state.get(pid) or {}).get("name") or ""

    def entry(key):
        return result.setdefault(key, {"texts": [], "image": False})

    for key, f in new_["photos"].items():
        a = old["photos"].get(key)
        if not a:
            continue  # new photo, no change
        old_g = {g["id"]: g for g in a["faces"]}
        new_g = {g["id"]: g for g in f["faces"]}
        if set(old_g) != set(new_g):
            entry(key)["image"] = True
            entry(key)["texts"].append(tx("Faces newly recognised or mirrored/rotated (face boxes changed)"))
        else:
            if any(old_g[i]["b"] != new_g[i]["b"] for i in new_g):
                entry(key)["image"] = True
                entry(key)["texts"].append(tx("Image rotated/mirrored or edited (face boxes moved)"))
        for gid, g in new_g.items():
            if gid not in old_g:
                continue
            p_old, p_new = old_g[gid]["p"], g["p"]
            if p_old != p_new:
                n_alt, n_new = name(pa, p_old) or "ohne Person", name(pn, p_new) or "ohne Person"
                if n_alt != n_new:
                    entry(key)["texts"].append(f"Gesicht zugeordnet: {n_alt} -> {n_new}")
            if p_new and p_new == p_old:
                if name(pa, p_old) != name(pn, p_new):
                    entry(key)["texts"].append(f"Person umbenannt: {name(pa, p_old) or 'ohne Namen'} -> {name(pn, p_new) or 'ohne Namen'}")
                if (pa.get(p_old) or {}).get("birth", "") != (pn.get(p_new) or {}).get("birth", ""):
                    entry(key)["texts"].append(
                        tx("Birth date of {name}: {old} -> {new}", name=name(pn, p_new) or tx("Person"), old=(pa.get(p_old) or {}).get('birth') or tx("empty"), new=(pn.get(p_new) or {}).get('birth') or tx("empty")))
    for e in result.values():  # drop duplicate rows, keep the order
        e["texts"] = list(dict.fromkeys(e["texts"]))
    return {k: v for k, v in result.items() if v["texts"]}


def main():
    S.URL, S.API_KEY = S.load_settings()
    print(tx("Connecting to {url} ...", url=S.URL))
    new_, hand_ = snapshot()
    write_doc(HAND_DATA, {"state": datetime.now().strftime("%Y-%m-%d %H:%M"), "photos": hand_,
                         "camera_without_anchor": DIAG.get("camera_without_anchor", [])})
    print(tx("Exif data: {dated} photos with a capture date, {camera} with camera data ({reloaded} loaded individually).", dated=DIAG['with_date'], camera=DIAG['with_camera'], reloaded=DIAG['reloaded']))
    if DIAG.get("camera_without_anchor"):
        print(tx("{n} digital photos are in the working album, not in the anchor album. Their camera date does not count.", n=len(DIAG['camera_without_anchor'])))
    print(tx("{n} photos have a date that you set yourself in Immich or that comes from a camera.", n=len(hand_)))
    old = read_(STATE, None)
    if old is None:
        write_doc(STATE, new_)
        print(tx("First run: state saved. From now on changes are reported."))
        return
    found = compare(old, new_)
    open_ = read_(CHANGES, {"photos": {}})
    photos = open_.get("photos", {})
    for key, e in found.items():
        old_e = photos.get(key, {"texts": [], "image": False})
        photos[key] = {"texts": list(dict.fromkeys(old_e["texts"] + e["texts"])),
                      "image": bool(old_e.get("image") or e["image"]),
                      "since": old_e.get("since") or datetime.now().strftime("%Y-%m-%d %H:%M")}
    write_doc(CHANGES, {"photos": photos})
    image = sorted({new_["photos"][k]["asset"] for k, e in found.items() if e["image"]})
    if image:
        previous = read_(RELOAD, {"assets": []}).get("assets", [])
        write_doc(RELOAD, {"assets": sorted(set(previous) | set(image))})
    write_doc(STATE, new_)
    print(tx("{n} photos changed in Immich ({image} of them with a changed image).", n=len(found), image=len(image)))
    for key, e in list(found.items())[:15]:
        print(f"  {key}: " + "; ".join(e["texts"]))


if __name__ == "__main__":
    main()
