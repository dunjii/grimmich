"""Accounts for the game from outside (everything under /play/).

You create the players yourself (no mail server, no self-registration): a name and a password that Grimmich makes up and shows once.
Passwords are never stored, only a salted scrypt hash. A signed cookie keeps a player signed in; it stops working when the
password is changed, the account is blocked or removed. All functions work on the plain document (a dict) so they can be tested
without a server; the document lives in the database as players.json."""
import base64
import hashlib
import hmac
import secrets
import threading
import time

import play

COOKIE = "grimmich_play"
SESSION_DAYS = 30
MIN_PASSWORD = 8
ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"   # without letters that look alike (i, l, o, 0, 1)
_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1, "maxmem": 64 * 1024 * 1024}


def empty():
    return {"players": {}, "secret": "", "exclude_on": False, "excluded": []}


def prepared(doc):
    """The document with all parts in place (also from an older or empty one)."""
    doc = dict(doc) if isinstance(doc, dict) else {}
    base = empty()
    for k, v in base.items():
        if not isinstance(doc.get(k), type(v)):
            doc[k] = v
    if not doc["secret"]:
        doc["secret"] = secrets.token_hex(32)
    return doc


def name_key(name):
    """Sign-in is not case sensitive: 'Anna  Test' and 'anna test' are the same player."""
    clean = play.clean_text(name, 40, allow_empty=False)
    return " ".join(clean.lower().split()) if clean else None


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, **_SCRYPT)
    return "scrypt$" + salt.hex() + "$" + digest.hex()


def check_password(password, stored):
    try:
        kind, salt, digest = stored.split("$")
        expected = bytes.fromhex(digest)
        got = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), **_SCRYPT)
    except (ValueError, AttributeError, TypeError):
        return False
    return kind == "scrypt" and hmac.compare_digest(got, expected)


_DUMMY = hash_password("not-a-real-password", salt=b"\0" * 16)


def new_password():
    """Twelve characters in three groups, e.g. k7mq-x3ra-9pdw (about 60 bits, easy to read out and type)."""
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(3))


def public_list(doc):
    """What the settings page may see: names and state, never hashes."""
    return [{"key": k, "name": p.get("name", k), "blocked": bool(p.get("blocked")), "created": p.get("created", "")}
            for k, p in sorted(prepared(doc)["players"].items())]


# ---- changes of the accounts (each returns the new document and, where there is one, the new password)

def add_player(doc, name, now):
    """-> (doc, password, error). error is None or "name" (unusable) / "exists"."""
    doc = prepared(doc)
    clean = play.clean_text(name, 40, allow_empty=False)
    key = name_key(name)
    if not clean or not key:
        return doc, None, "name"
    clean = " ".join(clean.split())
    if key in doc["players"]:
        return doc, None, "exists"
    password = new_password()
    doc["players"] = {**doc["players"], key: {"name": clean, "hash": hash_password(password), "epoch": 1, "blocked": False, "created": now}}
    return doc, password, None


def reset_password(doc, key):
    doc = prepared(doc)
    p = doc["players"].get(key)
    if not p:
        return doc, None
    password = new_password()
    doc["players"] = {**doc["players"], key: {**p, "hash": hash_password(password), "epoch": int(p.get("epoch", 1)) + 1}}
    return doc, password


def set_blocked(doc, key, blocked):
    doc = prepared(doc)
    p = doc["players"].get(key)
    if p:
        doc["players"] = {**doc["players"], key: {**p, "blocked": bool(blocked), "epoch": int(p.get("epoch", 1)) + 1}}
    return doc


def remove_player(doc, key):
    doc = prepared(doc)
    doc["players"] = {k: v for k, v in doc["players"].items() if k != key}
    return doc


def change_own_password(doc, key, old, new):
    """-> (doc, error). error is None, "wrong" (old password does not match) or "short"."""
    doc = prepared(doc)
    p = doc["players"].get(key)
    if not p or not isinstance(old, str) or not check_password(old, p.get("hash", "")):
        return doc, "wrong"
    if not isinstance(new, str) or not (MIN_PASSWORD <= len(new) <= 100):
        return doc, "short"
    doc["players"] = {**doc["players"], key: {**p, "hash": hash_password(new), "epoch": int(p.get("epoch", 1)) + 1}}
    return doc, None


# ---- sign in and the cookie

def sign_in(doc, name, password):
    """-> the key of the player, or None. Takes the same time for unknown names (no way to find out which names exist)."""
    doc = prepared(doc)
    key = name_key(name) if isinstance(name, str) else None
    p = doc["players"].get(key) if key else None
    ok = check_password(password if isinstance(password, str) and len(password) <= 200 else "", p["hash"] if p else _DUMMY)
    return key if (p and ok and not p.get("blocked")) else None


def _sign(secret, text):
    return hmac.new(secret.encode("utf-8"), text.encode("utf-8"), hashlib.sha256).hexdigest()[:40]


def make_token(doc, key, now=None):
    doc = prepared(doc)
    p = doc["players"][key]
    body = "{}.{}.{}".format(base64.urlsafe_b64encode(key.encode("utf-8")).decode("ascii").rstrip("="), int((now or time.time()) + SESSION_DAYS * 86400), int(p.get("epoch", 1)))
    return body + "." + _sign(doc["secret"], body)


def read_token(doc, token, now=None):
    """-> (key, entry) of the signed-in player, or None (wrong, expired, blocked, password changed, removed)."""
    try:
        doc = prepared(doc)
        b64, expiry, epoch, sig = token.split(".")
        if not hmac.compare_digest(_sign(doc["secret"], f"{b64}.{expiry}.{epoch}"), sig) or int(expiry) < (now or time.time()):
            return None
        key = base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4)).decode("utf-8")
        p = doc["players"].get(key)
    except (ValueError, AttributeError, TypeError):
        return None
    if not p or p.get("blocked") or int(p.get("epoch", 1)) != int(epoch):
        return None
    return key, p


def cookie_value(header):
    """The value of our cookie from a Cookie header (None if not there)."""
    for part in (header or "").split(";"):
        name, _, value = part.strip().partition("=")
        if name == COOKIE:
            return value
    return None


def cookie_header(token, secure, clear=False):
    return "{}={}; Path=/play/; HttpOnly; SameSite=Lax; Max-Age={}{}".format(COOKIE, "" if clear else token, 0 if clear else SESSION_DAYS * 86400, "; Secure" if secure else "")


# ---- slowing down guessing

class FailLimit:
    """Counts failures per key within a time window; blocked(key) is true once `limit` failures are reached."""
    def __init__(self, limit, window):
        self.limit, self.window, self.fails, self.lock = limit, window, {}, threading.Lock()

    def _recent(self, key, now):
        self.fails[key] = [t for t in self.fails.get(key, []) if now - t < self.window]
        return self.fails[key]

    def blocked(self, key, now=None):
        now = time.time() if now is None else now
        with self.lock:
            return len(self._recent(key, now)) >= self.limit

    def fail(self, key, now=None):
        now = time.time() if now is None else now
        with self.lock:
            self._recent(key, now).append(now)
            if len(self.fails) > 5000:   # do not grow without end under a flood of different keys
                self.fails = {k: v for k, v in self.fails.items() if v and now - v[-1] < self.window}

    def clear(self, key):
        with self.lock:
            self.fails.pop(key, None)
