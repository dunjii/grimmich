"""Sharper face pictures for the game: the face is cut out of the large picture in Immich (only for faces that are too small
in the stored photo) and the small cut-out is kept in the folder face_cutouts/. The large picture itself is not kept.

Nothing is written to Immich. If Immich cannot be reached or the picture does not fit the face box, there is simply no
cut-out and the game keeps showing the stored photo.
"""
import hashlib
import os
import threading

import addresses
import storage
from immich import Immich, ApiError

FOLDER = "face_cutouts"
MAX_SIDE = 480                 # the cut-out is at most this many pixels wide
_lock = threading.Lock()       # one large picture at a time (they can be big)
_ids = {"mtime": None, "map": {}}


def _asset_id(key):
    try:
        m = os.path.getmtime("grimmich.db")
    except OSError:
        m = None
    if _ids["mtime"] != m or not _ids["map"]:
        _ids["map"] = {f["key"]: f["id"] for f in (storage.load("photos.json", {"photos": []}) or {}).get("photos", []) if f.get("id")}
        _ids["mtime"] = m
    return _ids["map"].get(key)


def _client():
    values_ = {}
    with open("immich.env", encoding="utf-8") as f:
        for z in f:
            if "=" in z and not z.strip().startswith("#"):
                k, v = z.strip().split("=", 1)
                values_[k.strip()] = v.strip()
    return Immich(addresses.url(values_, "immich"), values_["IMMICH_API_KEY"], timeout=120)


def _load_big(asset_id):
    """The big picture the way Immich shows it (rotated and edited), otherwise the original."""
    import cv2
    import numpy as np
    api = _client()
    for path_, params in ((f"/assets/{asset_id}/thumbnail", {"size": "fullsize", "edited": "true"}),
                          (f"/assets/{asset_id}/original", None)):
        try:
            data_ = api.request_(None, path_, params=params, raw=True)
        except ApiError:
            continue
        image = cv2.imdecode(np.frombuffer(data_, np.uint8), cv2.IMREAD_COLOR)
        if image is not None:
            return image
    return None


def crop(key, W, H, x0, y0, side):
    """-> JPEG bytes of the square (x0, y0, side) given in the coordinates of the face box (image size W x H), or None."""
    if min(W, H, side) < 1 or x0 < 0 or y0 < 0 or x0 + side > W + 1 or y0 + side > H + 1:
        return None
    name = hashlib.sha1(f"{key}|{W}|{H}|{x0}|{y0}|{side}".encode("utf-8")).hexdigest() + ".jpg"
    path_ = os.path.join(FOLDER, name)
    if os.path.isfile(path_):
        return open(path_, "rb").read()
    if os.path.isfile(path_ + ".none"):
        return None
    asset_id = _asset_id(key)
    if not asset_id or not os.path.isfile("immich.env"):
        return None
    import cv2
    with _lock:
        if os.path.isfile(path_):
            return open(path_, "rb").read()
        try:
            image = _load_big(asset_id)
        except (OSError, KeyError, ValueError):
            return None   # no connection: try again later
        os.makedirs(FOLDER, exist_ok=True)
        if image is None:
            return None
        h, w = image.shape[:2]
        if abs(h / w - H / W) > 0.02:   # turned or cut differently than the face box: the box would not fit
            open(path_ + ".none", "wb").close()
            return None
        s = w / W
        a, b = int(round(x0 * s)), int(round(y0 * s))
        n = max(8, int(round(side * s)))
        piece = image[b:b + n, a:a + n]
        if piece.size == 0:
            open(path_ + ".none", "wb").close()
            return None
        target = min(MAX_SIDE, n)
        piece = cv2.resize(piece, (target, target), interpolation=cv2.INTER_AREA if n > target else cv2.INTER_CUBIC)
        ok, buf = cv2.imencode(".jpg", piece, [cv2.IMWRITE_JPEG_QUALITY, 88])
        if not ok:
            return None
        with open(path_, "wb") as f:
            f.write(buf.tobytes())
        return buf.tobytes()
