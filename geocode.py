"""Place search on the internet (OpenStreetMap Nominatim) for places that are neither in Gramps nor in Grimmich.
Only on request (the person presses Enter), at most one request per second, as the usage policy of Nominatim asks."""
import json
import threading
import time
import urllib.parse
import urllib.request

URL = "https://nominatim.openstreetmap.org/search"
_lock = threading.Lock()
_last = [0.0]


def parse(rows):
    """Nominatim rows -> [{"name", "text", "lat", "lon", "parent"}]"""
    out = []
    for row in rows if isinstance(rows, list) else []:
        try:
            lat, lon = round(float(row["lat"]), 6), round(float(row["lon"]), 6)
        except (KeyError, TypeError, ValueError):
            continue
        parts = [p.strip() for p in str(row.get("display_name") or "").split(",") if p.strip()]
        addr = row.get("address") or {}
        name = str(row.get("name") or (parts[0] if parts else "")).strip()
        parent = next((addr[k] for k in ("city", "town", "village", "municipality", "hamlet", "county") if addr.get(k) and addr[k] != name), "")
        if not parent and len(parts) > 1:
            parent = parts[1]
        out.append({"name": name, "text": ", ".join(parts[:4]), "lat": lat, "lon": lon, "parent": parent})
    return out


def _fetch(url, agent):
    req = urllib.request.Request(url, headers={"User-Agent": agent, "Accept-Language": "de,en"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def search(text, version="", fetch=None):
    """-> {"ok": True, "results": [...]} or {"ok": False, "text": "..."}"""
    text = (text or "").strip()[:200]
    if len(text) < 2:
        return {"ok": True, "results": []}
    url = URL + "?" + urllib.parse.urlencode({"q": text, "format": "jsonv2", "limit": 6, "addressdetails": 1})
    with _lock:
        wait = 1.05 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            rows = (fetch or _fetch)(url, f"Grimmich/{version or '0'} (private family photo tool)")
        except Exception as e:  # noqa: BLE001 - no internet, blocked, timeout: say so, do not crash
            return {"ok": False, "text": str(e)[:200]}
    return {"ok": True, "results": parse(rows)}
