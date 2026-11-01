"""Connections to Immich and Gramps Web: save settings, test the connection, fetch a sample from Gramps.

Used by datierung2_gui.py. Keys and passwords are only written into the .env files
in the folder and never returned to the browser. Gramps is only read (GET requests only,
the one exception is the login POST /api/token/).
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

import credentials
import addresses
import naming
from messages import tx

IMMICH_READ_ENV = "immich.env"
IMMICH_WRITE_ENV = "immich_write.env"
GRAMPS = "gramps.env"
GRAMPS_WRITE_ENV = "gramps_write.env"
DEFAULT_ALBUM = "Scan-Datierung"
RIGHTS_READ = {"asset.read", "album.read", "person.read", "face.read"}
RIGHTS_WRITE = RIGHTS_READ | {"asset.update", "tag.read", "tag.create", "tag.asset"}
SAMPLE = "gramps_probe.json"


def read_env(file_path):
    values_ = {}
    try:
        with open(file_path, encoding="utf-8") as f:
            for entry_row in f:
                entry_row = entry_row.strip()
                if entry_row and not entry_row.startswith("#") and "=" in entry_row:
                    k, v = entry_row.split("=", 1)
                    values_[k.strip()] = v.strip()
    except OSError:
        pass
    return values_


def arbeitsalbum():
    """Name of the working album (line IMMICH_ALBUM in immich.env, otherwise the default)."""
    return read_env(IMMICH_READ_ENV).get("IMMICH_ALBUM") or DEFAULT_ALBUM


def write_env(file_path, values_):
    tmp = file_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for k, v in values_.items():
            f.write(f"{k}={v}\n")
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, file_path)


def _address_block(w, service):
    addr = {n: (name, url) for n, name, url in addresses.items_list(w, service)}
    p = addresses.PREFIX[service]
    slots = [{"name": w.get(addresses._key(service, n, True), ""), "url": addr[n][1] if n in addr else ""} for n in (1, 2, 3)]
    b = {"addresses": slots, "auto": addresses.automatic(w, service), "active": addresses.active_no(w, service)}
    if addr:
        name, url = addresses.choose(w, service)
        b["used_url"] = url
        if len(addr) > 1:
            b["used"] = name
    return b


def _save_addresses(w, service, f):
    """Take the address fields from the browser into the values of an .env file (address 1 empty = keep the old one)."""
    p = addresses.PREFIX[service]
    for n in (1, 2, 3):
        field = "url" if n == 1 else f"url{n}"
        if field not in f:
            continue
        u, name = f[field].rstrip("/"), f.get("name" if n == 1 else f"name{n}", "")
        if u:
            w[addresses._key(service, n)] = u
            if name:
                w[addresses._key(service, n, True)] = name
            else:
                w.pop(addresses._key(service, n, True), None)
        elif n > 1:
            w.pop(addresses._key(service, n), None)
            w.pop(addresses._key(service, n, True), None)
    if f.get("auto") in ("0", "1"):
        w[p + "_AUTO"] = f["auto"]
    if f.get("active") in ("1", "2", "3"):
        w[p + "_ACTIVE"] = f["active"]
    addresses.forget_it()


def _addresses_ok(f):
    for k in ("url", "url2", "url3"):
        u = f.get(k, "")
        if u and not u.startswith(("http://", "https://")):
            return {"ok": False, "text": tx('The address must start with http:// or https://.')}
    return None


def status():
    i, w, g, gs = read_env(IMMICH_READ_ENV), read_env(IMMICH_WRITE_ENV), read_env(GRAMPS), read_env(GRAMPS_WRITE_ENV)
    return {
        "immich": {**_address_block({**w, **i} if not i.get("IMMICH_URL") else i, "immich"), "url": i.get("IMMICH_URL", "") or w.get("IMMICH_URL", ""), "read": bool(i.get("IMMICH_API_KEY")),
                   "write_access": bool(read_env(credentials.write_env_name("immich")).get("IMMICH_API_KEY")), "write_stored": bool(w.get("IMMICH_API_KEY")), "separate": credentials.separate("immich"), "album": i.get("IMMICH_ALBUM") or DEFAULT_ALBUM,
                   "anchor": i.get("IMMICH_ANCHOR_ALBUM", "")},
        "gramps": {**_address_block(g, "gramps"), "url": g.get("GRAMPS_URL", ""), "user": g.get("GRAMPS_USER", ""), "password": bool(g.get("GRAMPS_PASSWORD"))},
        "gramps_write": {"url": gs.get("GRAMPS_URL", ""), "user": gs.get("GRAMPS_USER", ""), "password": bool(read_env(credentials.write_env_name("gramps")).get("GRAMPS_PASSWORD")), "stored": bool(gs.get("GRAMPS_PASSWORD")), "citation_image": read_env(credentials.write_env_name("gramps")).get("GRAMPS_CITATION_IMAGE", "1") != "0",
                             "separate": credentials.separate("gramps")},
        "written": naming.active(),   # the words Grimmich writes into Immich (tags ...), see naming.py
    }


def store(kind_name, f):
    """f: fields from the browser. Empty keys/passwords leave the stored value unchanged."""
    f = {k: str(v or "").strip() for k, v in (f or {}).items()}
    if kind_name == "immich":
        errors = _addresses_ok(f)
        if errors:
            return errors
        album = f.get("album", "")
        for file_path, field in ((IMMICH_READ_ENV, "read"), (IMMICH_WRITE_ENV, "write_access")):
            w = read_env(file_path)
            _save_addresses(w, "immich", f)
            if f.get(field) and (file_path == IMMICH_READ_ENV or f.get("separate") != "0"):
                w["IMMICH_API_KEY"] = f[field]
            if file_path == IMMICH_READ_ENV and album:
                w["IMMICH_ALBUM"] = album
            if file_path == IMMICH_READ_ENV and f.get("separate") in ("0", "1"):
                w["SEPARATE_WRITE"] = f["separate"]
            if file_path == IMMICH_READ_ENV and "anchor" in f:
                if f["anchor"]:
                    w["IMMICH_ANCHOR_ALBUM"] = f["anchor"]
                else:
                    w.pop("IMMICH_ANCHOR_ALBUM", None)
            if w.get("IMMICH_API_KEY") or file_path == IMMICH_READ_ENV:
                if w:
                    write_env(file_path, w)
        return {"ok": True}
    if kind_name in ("gramps", "gramps_schreiben"):
        if kind_name == "gramps" and f.get("separate") in ("0", "1"):
            w0 = read_env(GRAMPS)
            w0["SEPARATE_WRITE"] = f["separate"]
            write_env(GRAMPS, w0)
        file_path = GRAMPS if kind_name == "gramps" else credentials.write_env_name("gramps")
        w = read_env(file_path)
        if kind_name == "gramps_schreiben" and file_path == GRAMPS:   # one access for both: only store the extra option here
            f = {k: v for k, v in f.items() if k == "citation_image"}
        errors = _addresses_ok(f)
        if errors:
            return errors
        if kind_name == "gramps":
            _save_addresses(w, "gramps", f)
        elif f.get("url"):   # separate write user: a separate address
            w["GRAMPS_URL"] = f["url"].rstrip("/")
        if f.get("user"):
            w["GRAMPS_USER"] = f["user"]
        if f.get("password"):
            w["GRAMPS_PASSWORD"] = f["password"]
        if kind_name == "gramps_schreiben" and f.get("citation_image") in ("0", "1"):
            w["GRAMPS_CITATION_IMAGE"] = f["citation_image"]
        if w:
            write_env(file_path, w)
        return {"ok": True}
    return {"ok": False, "text": tx('Unknown connection.')}


# ------------------------------------------------------------------ Immich

def _http(methode, url, head=None, data_=None, timeout=20):
    """-> (status, answer dict or text, header). Raises only when there is no connection."""
    head = dict(head or {})
    body_part = None
    if data_ is not None:
        body_part = json.dumps(data_).encode("utf-8")
        head["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body_part, headers=head, method=methode)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as a:
            content, code, hdr = a.read(), a.status, dict(a.headers)
    except urllib.error.HTTPError as e:
        content, code, hdr = e.read(), e.code, dict(e.headers)
    text = content.decode("utf-8", "replace")
    try:
        return code, json.loads(text), hdr
    except ValueError:
        return code, text, hdr


def _immich_test(file_path, needed, name):
    rows = []
    w = read_env(file_path)
    addr_name, url = addresses.choose(w, "immich", fresh=True)
    key = w.get("IMMICH_API_KEY", "")
    if not url:
        return [(False, tx('No address entered.'))]
    if not key:
        return [(False, tx('No {name} has been entered yet.', name=name))]
    try:
        code, _, _ = _http("GET", url + "/api/server/ping")
    except OSError as e:
        return [(False, tx('No connection to {url} ({grund}). Is the address correct, is Immich running?', url=url, grund=getattr(e, 'reason', e)))]
    several = len(addresses.items_list(w, "immich")) > 1
    rows.append((code == 200, (tx('Immich answers at {url} (address “{name}”).', url=url, name=addr_name) if several else tx('Immich answers at {url}.', url=url)) if code == 200 else tx('Unexpected response ({code}) from {url}.', code=code, url=url)))
    if code != 200:
        return rows
    head = {"x-api-key": key, "Accept": "application/json"}
    code, resp, _ = _http("GET", url + "/api/albums", head)
    if code in (401, 403):
        rows.append((False, tx('The {name} is rejected ({code}). Copied wrongly, or the “album.read” permission is missing.', name=name, code=code)))
        return rows
    if code != 200 or not isinstance(resp, list):
        rows.append((False, tx('Albums could not be read (response {code}).', code=code)))
        return rows
    rows.append((True, tx('The {name} works.', name=name)))
    album = arbeitsalbum()
    found = [a for a in resp if a.get("albumName") == album]
    rows.append((bool(found), tx('Album “{name}” found.', name=album) if found else tx('The album “{name}” does not exist. Please create it in Immich or change the name above.', name=album)))
    anchor_ = read_env(IMMICH_READ_ENV).get("IMMICH_ANCHOR_ALBUM", "")
    if anchor_ and file_path == IMMICH_READ_ENV:
        da = [a for a in resp if a.get("albumName") == anchor_]
        rows.append((bool(da), tx('Anchor album “{name}” found.', name=anchor_) if da else tx('The anchor album “{name}” does not exist. Please create it in Immich or change the name.', name=anchor_)))
    code, resp, _ = _http("GET", url + "/api/api-keys/me", head)
    if code == 200 and isinstance(resp, dict) and isinstance(resp.get("permissions"), list):
        rights = set(resp["permissions"])
        if "all" in rights:
            rows.append((True, tx('The key has all permissions (more than needed, fewer would do).')))
        else:
            is_missing = sorted(needed - rights)
            rows.append((not is_missing, tx('All necessary permissions are present.') if not is_missing else tx('Missing permissions: {items}', items=", ".join(is_missing))))
    else:
        rows.append((None, tx('I could not check the permissions of the key (Immich does not provide them here).')))
    return rows


# ------------------------------------------------------------------ Gramps

class GrampsError(Exception):
    pass


class Gramps:
    def __init__(self, file_path=GRAMPS):
        w = read_env(file_path)
        self.url = addresses.url(w, "gramps")
        self.user = w.get("GRAMPS_USER", "")
        self.pw = w.get("GRAMPS_PASSWORD", "")
        self.token = None
        if not (self.url and self.user and self.pw):
            raise GrampsError(tx('Address, user and password for Gramps have not all been entered yet.'))

    def log_in(self):
        try:
            code, resp, _ = _http("POST", self.url + "/api/token/", {"Accept": "application/json"},
                                  {"username": self.user, "password": self.pw})
        except OSError as e:
            raise GrampsError(tx('No connection to {url} ({grund}).', url=self.url, grund=getattr(e, 'reason', e)))
        if code in (401, 403):
            raise GrampsError(tx('User name or password were rejected.'))
        if code == 429:
            raise GrampsError(tx('Gramps Web saw too many logins in a short time (response 429). Wait a minute and test again.'))
        if code != 200 or not isinstance(resp, dict) or not resp.get("access_token"):
            raise GrampsError(tx('Login not possible (response {code}). Is the address correct (without /api at the end)?', code=code))
        self.token = resp["access_token"]

    def get(self, path_, params=None, new_=True):
        """Read-only request. On an expired token (401) log in once more."""
        if not self.token:
            self.log_in()
        address = self.url + "/api" + path_
        if params:
            address += "?" + urllib.parse.urlencode(params)
        try:
            code, resp, hdr = _http("GET", address, {"Authorization": "Bearer " + self.token, "Accept": "application/json"}, timeout=60)
        except OSError as e:
            raise GrampsError(tx('No connection to {url} ({grund}).', url=self.url, grund=getattr(e, 'reason', e)))
        if code == 401 and new_:
            self.token = None
            return self.get(path_, params, new_=False)
        if code >= 400:
            raise GrampsError(tx('Gramps responds with error {code} for {pfad}.', code=code, pfad=path_))
        return resp, hdr


def _gramps_test(file_path=GRAMPS, gv=None):
    try:
        g = gv or Gramps(file_path)
        if not g.token:
            g.log_in()
    except GrampsError as e:
        return [(False, str(e))]
    z = [(True, tx('Login at {url} as “{user}” works.', url=g.url, user=g.user))]
    try:
        resp, hdr = g.get("/people/", {"pagesize": 1, "keys": "handle"})
        total = next((v for k, v in hdr.items() if k.lower() == "x-total-count"), None)
        z.append((True, tx('People readable ({n} people in Gramps).', n=total) if total else tx('People readable.')))
    except GrampsError as e:
        z.append((False, str(e)))
    return z


def _gramps_write_test():
    try:
        g = Gramps(credentials.write_env_name("gramps"))
    except GrampsError as e:
        return [(False, str(e))]
    z = _gramps_test(credentials.write_env_name("gramps"), g)   # only one login: Gramps Web limits logins per minute (response 429)
    if not z or not z[0][0]:
        return z
    try:
        resp, _ = g.get("/metadata/")
        db = (resp.get("database") or {}) if isinstance(resp, dict) else {}
        numbers = (resp.get("object_counts") or {}) if isinstance(resp, dict) else {}
        z.append((True, tx('Tree: {name} ({personen} people, {medien} media objects).', name=db.get('name') or db.get('id') or tx('unknown'), personen=numbers.get('people', '?'), medien=numbers.get('media', '?'))))
        z.append((None, tx('Whether this user may write (Editor role) only shows when writing for the first time. The preview does not check this.')))
    except GrampsError as e:
        z.append((False, str(e)))
    return z


def test_it(kind_name):
    if kind_name == "immich_lesen":
        z = _immich_test(IMMICH_READ_ENV, RIGHTS_READ, tx('Key for reading'))
    elif kind_name == "immich_schreiben":
        z = _immich_test(credentials.write_env_name("immich"), RIGHTS_WRITE, tx('Key for writing') if credentials.separate("immich") else tx('Key'))
    elif kind_name == "gramps":
        z = _gramps_test()
    elif kind_name == "gramps_schreiben":
        z = _gramps_write_test()
    else:
        z = [(False, "Unbekannte Verbindung.")]
    return {"rows": [{"ok": o, "text": t} for o, t in z]}


# ------------------------------------------------------------------ Gramps probe (diagnosis)

NAMES = {"first_name", "surname", "name_display", "name_given", "name_surname", "name_suffix", "call", "nick", "famnick",
         "title", "suffix", "description", "label", "summary", "street", "city", "locality", "phone", "family_surname"}


def _mask(x, clear_=False):
    if clear_:
        return x
    if isinstance(x, dict):
        return {k: ("…" if k in NAMES and isinstance(v, str) and v else _mask(v)) for k, v in x.items()}
    if isinstance(x, list):
        return [_mask(v) for v in x]
    return x


def sample():
    """Fetch a person with timeline and unusual dates from Gramps. Read only."""
    try:
        g = Gramps()
        g.log_in()
    except GrampsError as e:
        return {"ok": False, "text": str(e)}
    res = {}
    try:
        items_list, _ = g.get("/people/", {"pagesize": 100, "keys": "handle,gramps_id,event_ref_list,birth_ref_index", "strip": "true"})
        items_list = [p for p in items_list if isinstance(p, dict) and p.get("handle")]
        if not items_list:
            return {"ok": False, "text": tx('No people were found in Gramps.')}
        choice = max(items_list, key=lambda p: len(p.get("event_ref_list") or []))
        res["person_profil"], _ = g.get("/people/", {"pagesize": 3, "profile": "self", "extend": "event_ref_list",
                                                      "keys": "handle,gramps_id,primary_name,alternate_names,gender,profile,birth_ref_index,death_ref_index"})
        res["timeline"], _ = g.get(f"/people/{choice['handle']}/timeline", {"pagesize": 60, "locale": "de", "strip": "true",
                                                                           "keys": "age,date,description,gramps_id,handle,label,type,person"})
        ev, _ = g.get("/events/", {"pagesize": 300, "keys": "date,type,gramps_id,handle", "strip": "true"})
        ev = [e for e in ev if isinstance(e, dict) and isinstance(e.get("date"), dict) and e["date"]]
        unusual = [e for e in ev if e["date"].get("modifier") or e["date"].get("quality") or e["date"].get("calendar")
                         or not e["date"].get("dateval") or e["date"].get("text")]
        normal = [e for e in ev if e not in unusual]
        res["events_unusual_dates"] = unusual[:10]
        res["events_normal_dates"] = normal[:4]
    except GrampsError as e:
        return {"ok": False, "text": str(e)}
    res = _mask(res)
    tmp = SAMPLE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    os.replace(tmp, SAMPLE)
    return {"ok": True, "text": tx('Sample saved in {file_path}. Names and descriptions in it are replaced by “…”.', file_path=SAMPLE),
            "timeline": len(res.get("timeline") or []) if isinstance(res.get("timeline"), list) else 0,
            "unusual": len(res["events_unusual_dates"])}


# ------------------------------------------------------------------ Gramps: people and events (read only)

CACHE = "gramps_cache.json"
MODUS = {0: "genau", 1: "vor", 2: "nach", 3: "um", 4: "zwischen", 5: "zeitraum"}


def _read_cache():
    try:
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _write_cache(c):
    tmp = CACHE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False)
    os.replace(tmp, CACHE)


def _name_parts(n):
    n = n or {}
    return {"given": n.get("first_name") or "", "called": n.get("call") or n.get("nick") or "",
            "surnames": [s.get("surname") or "" for s in (n.get("surname_list") or []) if s.get("surname")]}


def _type_text(t):
    """Name type as text (depending on the version Gramps delivers text or an object)."""
    if isinstance(t, dict):
        return str(t.get("string") or t.get("value") or "")
    return str(t or "")


def gramps_personen(new_=False):
    """Compact list of people (name, birth names, birth and death date as text). Is cached."""
    c = _read_cache()
    if not new_ and c.get("people") and "old" in c["people"][0]:
        return {"ok": True, "people": c["people"], "state": c.get("state", "")}
    try:
        g = Gramps()
        items_list, _ = g.get("/people/", {"profile": "self", "strip": "true",
                                      "keys": "handle,gramps_id,primary_name,alternate_names,gender,profile"})
    except GrampsError as e:
        return {"ok": False, "text": str(e)}
    out_ = []
    for p in items_list if isinstance(items_list, list) else []:
        if not isinstance(p, dict) or not p.get("handle"):
            continue
        n = _name_parts(p.get("primary_name"))
        # all further names (birth name, married name, called name ...), regardless of the name type
        old = []
        for a in (p.get("alternate_names") or []):
            t = _name_parts(a)
            if t["given"] or t["surnames"]:
                old.append({"given": t["given"], "surnames": t["surnames"], "type": _type_text(a.get("type"))})
        born = [x for a in old for x in a["surnames"] if x not in n["surnames"]]
        pr = p.get("profile") or {}
        out_.append({"h": p["handle"], "id": p.get("gramps_id", ""), "given": n["given"], "surnames": n["surnames"], "called": n["called"], "old": old, "born": born,
                    "birth": (pr.get("birth") or {}).get("date", ""), "death": (pr.get("death") or {}).get("date", "")})
    import time
    c["people"] = out_
    c["state"] = time.strftime("%Y-%m-%d %H:%M")
    _write_cache(c)
    return {"ok": True, "people": out_, "state": c["state"]}


def _norm_date(d):
    """Gramps date (dateval, modifier, quality) -> {mode, estimated, from:[y,m,d], to:[y,m,d]} or None."""
    if not isinstance(d, dict):
        return None
    v = d.get("dateval") or []
    mod = d.get("modifier") or 0
    try:
        if mod in (4, 5) and len(v) >= 7 and v[2]:
            from_, to_ = [v[2], v[1], v[0]], [v[6], v[5], v[4]]
        elif len(v) >= 3 and v[2]:
            from_ = to_ = [v[2], v[1], v[0]]
        else:
            return None
    except (TypeError, IndexError):
        return None
    return {"mode": MODUS.get(mod, "text"), "estimated": (d.get("quality") or 0) == 1, "computed": (d.get("quality") or 0) == 2,
            "from": from_, "to": to_}


def _place_text(x):
    """Place name from a place object of the timeline, or text (display_name, otherwise name plus higher-level places)."""
    if isinstance(x, str):
        return x.strip()
    if not isinstance(x, dict):
        return ""
    for k in ("display_name", "title"):
        if isinstance(x.get(k), str) and x[k].strip():
            return x[k].strip()
    n = x.get("name")
    if isinstance(n, dict):
        n = n.get("value")
    if not isinstance(n, str) or not n.strip():
        return ""
    parts = [n.strip()]
    for pp in x.get("parent_places") or []:
        t = pp if isinstance(pp, str) else (pp.get("name") if isinstance(pp, dict) else "")
        if isinstance(t, dict):
            t = t.get("value")
        if isinstance(t, str) and t.strip():
            parts.append(t.strip())
    return ", ".join(parts[:3])


def _place_from_profile(profile):
    """Fallback: first text under a key 'place' in the event profile."""
    def search_(x, depth=0):
        if depth > 5:
            return ""
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ("place", "place_name", "location"):
                    t = _place_text(v)
                    if t:
                        return t
            for v in x.values():
                if isinstance(v, (dict, list)):
                    t = search_(v, depth + 1)
                    if t:
                        return t
        elif isinstance(x, list):
            for v in x:
                t = search_(v, depth + 1)
                if t:
                    return t
        return ""
    return search_(profile)


def _participants(profile):
    """Names of the participants of an event from profile.participants (shape differs between Gramps versions, so searched generically)."""
    out_, seen = [], set()

    def go(x, depth=0):
        if depth > 6:
            return
        if isinstance(x, dict):
            nm = x.get("name_display") if isinstance(x.get("name_display"), str) else ""
            if nm or x.get("name_given") or x.get("name_surname"):
                if x.get("name_given") or x.get("name_surname"):
                    nm = " ".join(t for t in (x.get("name_given"), x.get("name_surname")) if t)
                elif "," in nm:
                    a, b = nm.split(",", 1)
                    nm = (b.strip() + " " + a.strip()).strip()
                ky = x.get("handle") or nm
                if nm and ky not in seen:
                    seen.add(ky)
                    out_.append({"name": nm, "handle": x.get("handle", ""), "sex": x.get("sex", "")})
            for v in x.values():
                if isinstance(v, (dict, list)):
                    go(v, depth + 1)
        elif isinstance(x, list):
            for v in x:
                go(v, depth + 1)
    go((profile or {}).get("participants") if isinstance(profile, dict) else None)
    return out_


# ------------------------------------------------------------------ Places (read only)
def _coordinate(s):
    """Gramps stores coordinates as text: '51.4833', '51,4833' or in degrees/minutes/seconds ('N51.29.0', "51° 29' 0\" N"). -> decimal degrees or None."""
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    try:
        return float(t.replace(",", "."))
    except ValueError:
        pass
    m = re.match(r"^([NSEWnsew])?\s*(\d+)\.(\d+)\.(\d+(?:[.,]\d+)?)\s*([NSEWnsew])?$", t)   # N51.29.0 = Grad.Minuten.Sekunden
    if m:
        value = float(m.group(2)) + float(m.group(3)) / 60 + float(m.group(4).replace(",", ".")) / 3600
        return -value if (m.group(1) or m.group(5) or "").upper() in ("S", "W") else value
    numbers = re.findall(r"\d+(?:[.,]\d+)?", t)
    if not numbers or len(numbers) > 3:
        return None
    try:
        parts = [float(z.replace(",", ".")) for z in numbers] + [0.0, 0.0]
    except ValueError:
        return None
    value = parts[0] + parts[1] / 60 + parts[2] / 3600
    if re.search(r"[SsWw]", t) or t.startswith("-"):
        value = -value
    return value


def _page_through(g, path_, keys, size_=500):
    page, everyone = 1, []
    while True:
        resp, _ = g.get(path_, {"keys": keys, "page": page, "pagesize": size_})
        if not isinstance(resp, list) or not resp:
            break
        everyone += resp
        if len(resp) < size_:
            break
        page += 1
    return everyone


def gramps_orte(new_=False):
    """All places from Gramps with names including higher-level places and coordinates (from the cache, 'new' loads fresh)."""
    c = _read_cache()
    if c.get("places_list") and not new_:
        return {"ok": True, "places": c["places_list"], "without": sum(1 for o in c["places_list"] if o.get("lat") is None)}
    try:
        g = Gramps()
        raw = _page_through(g, "/places/", "handle,gramps_id,name,lat,long,placeref_list")
        after = {p["handle"]: p for p in raw if isinstance(p, dict) and p.get("handle")}

        def name(p):
            n = p.get("name")
            n = n.get("value") if isinstance(n, dict) else n
            return str(n or "").strip()

        def chain(h):
            parts, seen = [], set()
            while h and h in after and h not in seen and len(parts) < 4:
                seen.add(h)
                t = name(after[h])
                if t:
                    parts.append(t)
                refs = after[h].get("placeref_list") or []
                h = refs[0].get("ref") if refs and isinstance(refs[0], dict) else None
            return parts

        items_list = []
        for h, p in after.items():
            parts = chain(h)
            if not parts:
                continue
            items_list.append({"h": h, "id": p.get("gramps_id", ""), "n": parts[0], "t": ", ".join(parts),
                          "lat": _coordinate(p.get("lat")), "lon": _coordinate(p.get("long"))})
        items_list.sort(key=lambda o: o["t"].lower())
        c["places_list"] = items_list
        c["event_place"] = {e["handle"]: e.get("place") or "" for e in _page_through(g, "/events/", "handle,place") if isinstance(e, dict) and e.get("handle")}
        _write_cache(c)
    except GrampsError as e:
        return {"ok": False, "text": str(e)}
    return {"ok": True, "places": items_list, "without": sum(1 for o in items_list if o.get("lat") is None)}


def gramps_ereignisse(handle):
    """Timeline of a person (own events and those of relatives) with structured dates."""
    if not handle:
        return {"ok": False, "text": tx('No Gramps person given.')}
    try:
        g = Gramps()
        tl, _ = g.get(f"/people/{urllib.parse.quote(handle)}/timeline",
                      {"locale": "de", "strip": "true", "keys": "date,description,gramps_id,handle,label,type,person,age,place"})
        c = _read_cache()
        data_ = c.setdefault("date", {})
        partic = c.setdefault("teilnehmer2", {})
        places_ = c.setdefault("place", {})
        if "event_place" not in c:
            gramps_orte(new_=True)   # also fills the mapping event -> place
            c = _read_cache()
            data_, partic, places_ = c.setdefault("date", {}), c.setdefault("teilnehmer2", {}), c.setdefault("place", {})
        event_place = c.get("event_place", {})
        # Which events really belong to this person? For family events (marriage) Gramps names some family member as "person",
        # so we decide ourselves whose event it is: from the person's families and the list of participants.
        own_ev, fam_event, parents_ev, disc = set(), {}, set(), {}   # verw: Handle -> (Art, Familie)
        try:
            pe, _ = g.get(f"/people/{urllib.parse.quote(handle)}", {"keys": "event_ref_list,family_list,parent_family_list"})
            pe = pe if isinstance(pe, dict) else {}
            own_ev = {r.get("ref") for r in pe.get("event_ref_list") or [] if isinstance(r, dict)}
            for fh in pe.get("family_list") or []:
                f, _ = g.get(f"/families/{urllib.parse.quote(fh)}", {"keys": "father_handle,mother_handle,event_ref_list,child_ref_list"})
                f = f if isinstance(f, dict) else {}
                partner = f.get("mother_handle") if f.get("father_handle") == handle else f.get("father_handle")
                for r in f.get("event_ref_list") or []:
                    fam_event[r.get("ref")] = partner
                if partner:
                    disc[partner] = "partner"
                for r in f.get("child_ref_list") or []:
                    if r.get("ref"):
                        disc[r["ref"]] = "kind"
            for fh in pe.get("parent_family_list") or []:
                f, _ = g.get(f"/families/{urllib.parse.quote(fh)}", {"keys": "father_handle,mother_handle,event_ref_list,child_ref_list"})
                f = f if isinstance(f, dict) else {}
                parents_ev |= {r.get("ref") for r in f.get("event_ref_list") or [] if isinstance(r, dict)}
                for k in ("father_handle", "mother_handle"):
                    if f.get(k):
                        disc[f[k]] = "elternteil"
                for r in f.get("child_ref_list") or []:
                    if r.get("ref") and r["ref"] != handle:
                        disc.setdefault(r["ref"], "geschwister")
        except GrampsError:
            pass
        word = {("partner", "F"): "Ehefrau", ("partner", "M"): "Ehemann", ("partner", ""): "Ehepartner", ("kind", "F"): "Tochter", ("kind", "M"): "Sohn", ("kind", ""): "Kind",
                ("elternteil", "F"): "Mutter", ("elternteil", "M"): "Vater", ("elternteil", ""): "Elternteil",
                ("geschwister", "F"): "Schwester", ("geschwister", "M"): "Bruder", ("geschwister", ""): "Geschwister"}
        out_ = []
        for e in tl if isinstance(tl, list) else []:
            h = e.get("handle")
            if not h:
                continue
            if h not in data_ or h not in partic:
                ev, _ = g.get(f"/events/{urllib.parse.quote(h)}", {"keys": "date,description,profile", "profile": "participants", "name_format": "%f %l"})
                ev = ev if isinstance(ev, dict) else {}
                data_[h] = _norm_date(ev.get("date"))
                partic[h] = _participants(ev.get("profile"))
            d = data_[h]
            if not d:
                continue
            if h not in places_:
                place_ = _place_text(e.get("place"))
                if not place_:
                    # the timeline gives no place: ask the place record of the event (errors here do not matter)
                    try:
                        ev2, _ = g.get(f"/events/{urllib.parse.quote(h)}", {"extend": "place", "keys": "extended,place"})
                        pl = ((ev2 or {}).get("extended") or {}).get("place") if isinstance(ev2, dict) else None
                        place_ = _place_text(pl) if isinstance(pl, dict) else ""
                        places_[h] = place_
                    except GrampsError:
                        place_ = ""
                else:
                    places_[h] = place_
            p = e.get("person") if isinstance(e.get("person"), dict) else {}
            name = p.get("name_display") or ", ".join(x for x in (p.get("name_surname"), p.get("name_given")) if x)
            name_list = [n["name"] for n in partic[h] if n.get("handle") != handle and n.get("name")]
            who = p.get("relationship", "")
            own = h in own_ev or h in fam_event
            near = own or disc.get(p.get("handle")) in ("partner", "kind", "elternteil")   # close = own, parents, partners, children (siblings and others only on request)
            if h in fam_event:   # own family: only the partner matters, not the children
                name_list = [n["name"] for n in partic[h] if n.get("name") and n.get("handle") == fam_event[h]]
            if own:
                who, name = "self", ""
            elif h in parents_ev:
                who, name = "Eltern", ""
                name_list = []
                near = True
            elif e.get("role") == "Familie" or str(e.get("type", "")).lower() in ("marriage", "divorce", "engagement"):
                # family event of a relative: whose marriage is it? The first known family member among the participants
                hits = next((n for n in partic[h] if disc.get(n.get("handle")) in ("kind", "geschwister", "elternteil", "partner")), None)
                near = bool(hits) and disc.get(hits.get("handle")) != "geschwister"
                if hits:
                    who, name = word[(disc[hits["handle"]], hits.get("sex", "") if hits.get("sex", "") in ("F", "M") else "")], hits["name"]
                else:
                    who, name = "Verwandte", ""
                name_list = []
            out_.append({"id": h, "gid": e.get("gramps_id", ""), "kind": _type_text(e.get("type")), "label": e.get("label", ""),
                        "own": own, "near": near, "descr": e.get("description", ""), "who": who, "who_name": name, "names": name_list,
                        "place": _place_text(e.get("place")) or places_.get(h, ""), "place_h": event_place.get(h, ""), "text": e.get("date", ""), "date": d})
        fields = sorted(set(k for e in (tl if isinstance(tl, list) else [])[:5] if isinstance(e, dict) for k in e))
        if not any(a["names"] for a in out_):
            fields.append(tx('(no participants found)'))
        _write_cache(c)
    except GrampsError as e:
        return {"ok": False, "text": str(e)}
    return {"ok": True, "events": out_, "fields": fields}
