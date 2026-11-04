"""Play mode: the game for several players, also from outside.

Everything the game may reach lies under the path /play/ and is checked here against a fixed list:
- what the game gets to see (build_data): photos, faces, estimates; no settings, keys, connection data, birth dates or events,
- what a player may send (validate_vote): one answer at a time, checked field by field; nothing else is accepted,
- how answers are stored (add_vote, undo_last): they are appended, never the whole file is replaced.
The functions work on plain data, so they can be tested without a server."""
import re
import threading
import time

# what may be asked for under /play/ (everything else is "not found")
ALLOWED_GET = re.compile(r"^/$|^/(style\.css|favicon\.svg|favicon\.png|robots\.txt)$|^/js/(?!.*\.\.)[\w./-]+\.js$|^/api/(all|languages|gramps_places|me)$"
                         r"|^/api/language/[\w-]+$|^/photos/[^/]+\.jpg$|^/crops/[^/]+\.jpg$")
ALLOWED_POST = {"/api/vote", "/api/login", "/api/logout", "/api/password"}   # the game does not need anything else
LOGIN_NEEDED = re.compile(r"^/api/(all|gramps_places|vote|password)$|^/photos/|^/crops/")   # everything with data or answers
ROBOTS = b"User-agent: *\nDisallow: /\n"

TYPES = {None, "older", "who", "place", "anchor", "sort", "decade"}
MAX_VOTES = 200000
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def clean_text(value, limit, allow_empty=True):
    """Text without control characters, at most `limit` characters; None if it is not usable."""
    if not isinstance(value, str):
        return None
    value = _CONTROL.sub("", value).strip()
    if len(value) > limit or (not value and not allow_empty):
        return None
    return value


def clean_player(value):
    return clean_text(value, 60, allow_empty=False)


def _integer(value, low, high):
    return value if isinstance(value, int) and not isinstance(value, bool) and low <= value <= high else None


def validate_vote(vote, photo_keys):
    """One answer as sent by a player -> the clean answer (only known fields), or None when something is wrong."""
    if not isinstance(vote, dict):
        return None
    kind = vote.get("type")
    if kind not in TYPES:
        return None
    key_ok = lambda k: isinstance(k, str) and k in photo_keys   # noqa: E731
    if kind in (None, "older"):
        pid = clean_text(vote.get("pid"), 80, allow_empty=False)
        older = vote.get("older")
        if not (key_ok(vote.get("a")) and key_ok(vote.get("b")) and vote["a"] != vote["b"] and pid and older in ("a", "b", "same", "unknown", "different")):
            return None
        return {"a": vote["a"], "b": vote["b"], "pid": pid, "older": older}
    if kind == "who":
        name = clean_text(vote.get("name"), 120)
        box = vote.get("box")
        if not key_ok(vote.get("key")) or name is None:
            return None
        if box is not None and not (isinstance(box, list) and len(box) == 6 and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in box)):
            return None
        return {"type": "who", "key": vote["key"], "box": box, "name": name}
    if kind == "place":
        place = clean_text(vote.get("place"), 200)
        handle = vote.get("h")
        if not key_ok(vote.get("key")) or place is None or not (handle is None or clean_text(handle, 40, allow_empty=False)):
            return None
        return {"type": "place", "key": vote["key"], "place": place, "h": handle}
    if kind == "anchor":
        year = _integer(vote.get("ay"), 1800, 2100)
        if not (key_ok(vote.get("key")) and key_ok(vote.get("anchor")) and year and vote.get("rel") in ("before", "after", "same", "unknown")):
            return None
        return {"type": "anchor", "key": vote["key"], "anchor": vote["anchor"], "ay": year, "rel": vote["rel"]}
    if kind == "sort":
        keys, ranks = vote.get("keys"), vote.get("ranks")
        pid = clean_text(vote.get("pid"), 80, allow_empty=False)
        if not (isinstance(keys, list) and 3 <= len(keys) <= 5 and len(set(keys)) == len(keys) and all(key_ok(k) for k in keys) and pid):
            return None
        out = {"type": "sort", "pid": pid, "keys": list(keys)}
        if ranks is not None:
            if not (isinstance(ranks, list) and len(ranks) == len(keys) and all(_integer(r, 1, 5) for r in ranks)):
                return None
            out["ranks"] = list(ranks)
        if vote.get("unknown") is True:
            out["unknown"] = True
        return out
    if kind == "decade":
        start, end = vote.get("from"), vote.get("to")
        if not key_ok(vote.get("key")):
            return None
        if start is None and end is None:
            return {"type": "decade", "key": vote["key"], "from": None, "to": None}
        if _integer(start, 1800, 2090) and end == start + 9:
            return {"type": "decade", "key": vote["key"], "from": start, "to": end}
    return None


def add_vote(votes, vote, player, now):
    """New list of answers with this one appended (the clean vote gets the player and the time); None when the list is full."""
    if len(votes) >= MAX_VOTES:
        return None
    return votes + [{**vote, "player": player, "t": now}]


def undo_last(votes, player):
    """New list without the last answer of this player (unchanged when the player has none)."""
    for i in range(len(votes) - 1, -1, -1):
        if votes[i].get("player") == player:
            return votes[:i] + votes[i + 1:]
    return votes


class RateLimit:
    """At most `limit` answers per minute for the whole server (cheap protection against flooding)."""
    def __init__(self, limit=240):
        self.limit, self.times, self.lock = limit, [], threading.Lock()

    def allow(self, now=None):
        now = time.time() if now is None else now
        with self.lock:
            self.times = [t for t in self.times if now - t < 60]
            if len(self.times) >= self.limit:
                return False
            self.times.append(now)
            return True


def vote_keys(vote):
    """All photo keys an answer refers to."""
    keys = [vote.get(f) for f in ("key", "a", "b", "anchor")]
    keys += vote.get("keys") if isinstance(vote.get("keys"), list) else []
    return {k for k in keys if isinstance(k, str)}


def build_data(photos, work, rows, corrections, names, age, people_photos, immich_data, places, kinds, votes, version, hidden_keys=frozenset(), hidden_people=frozenset(), muted=()):
    """What the game gets: the same shape as the full interface expects at start, but only the parts the game needs.
    Not included: connection data and keys, write preview, order, assignments to Gramps, events, birth dates, descriptions."""
    keys = {p["key"] for p in photos.get("photos", []) if isinstance(p, dict) and "key" in p} - set(hidden_keys)   # hidden = photos with people who are not to be shown
    votes = [v for v in votes if isinstance(v, dict) and not (vote_keys(v) & set(hidden_keys))]
    series = [{"id": s.get("id"), "photos": [k for k in s.get("photos", []) if k in keys]} for s in work.get("series", []) if isinstance(s, dict)]
    people = {"ok": False, "text": ""}
    if people_photos.get("ok"):
        people = {"ok": True, "people": [{"id": p["id"], "name": p["name"], "birth": None, "photos": [f for f in p["photos"] if f["key"] in keys]}
                                         for p in people_photos.get("people", []) if p["id"] not in hidden_people],
                  "unnamed": [u for u in people_photos.get("unnamed", []) if u.get("key") in keys]}
        people["people"] = [p for p in people["people"] if p["photos"]]
    own = {k: {"year": c.get("year"), "decimal_year": c.get("decimal_year"), "from": c.get("from"), "to": c.get("to"), "source": c.get("source")}
           for k, c in (corrections or {}).items() if k in keys and isinstance(c, dict) and c.get("source") in ("confirmed", "draft", "manual")}
    return {
        "photos": {"photos": [{"key": k} for k in sorted(keys)]},
        "work": {"series": series, "merge_hints": [], "merge_rejected": [], "discarded": []},
        "results": {"rows": [{"key": r["key"], "year": r.get("year"), "from": r.get("from"), "to": r.get("to"), "hint": ""} for r in (rows or []) if r.get("key") in keys],
                    "corrections": own},
        "people": {"people": {}, "all": [n for n in names if isinstance(n, str)]},
        "changes": {"photos": {}},
        "age": {k: [{"name": x.get("name"), "age": x.get("age")} for x in v if isinstance(x, dict)] for k, v in (age or {}).items() if k in keys and isinstance(v, list)},
        "people_photos": people, "order": {}, "assignment": {},
        "connection": {"immich": {}, "gramps": {}, "gramps_write": {}, "written": {}},
        "write_preview": None, "write_status": {}, "job": {"running": False},
        "provenance_albums": {"albums": []}, "provenance": {"pages": {}}, "inbox": {"seen": []},
        "game_votes": {"votes": votes, "muted": list(muted)},
        "immich_data": {"photos": {k: {"date": v.get("date"), "camera": bool(v.get("camera"))} for k, v in (immich_data or {}).items() if k in keys and isinstance(v, dict) and v.get("date")}},
        "gramps_preview": None, "gramps_written": {}, "gramps_status": {"key_set": False, "result": None}, "event_assignment": {},
        "kinds": {k: {"kind": v.get("kind")} for k, v in (kinds or {}).items() if k in keys and isinstance(v, dict) and v.get("kind")},
        "places": {k: {} for k in (places or {}) if k in keys}, "version": version,
    }
