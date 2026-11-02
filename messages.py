"""Translation of the messages the server sends to the interface (counterpart of web/js/language.js).

The texts in the code are English. Every other language is one file in the folder languages/ (for example languages/de.json):
    {"language": {"code": "de", "name": "Deutsch", "date_input": "dmy"}, "texts": {"English text": "translated text"}}
A language file is picked up automatically: it appears in the language switch and is used for the interface and for the server messages.
t("Text {name}", name=...) returns the text in the current language. Plurals as in the interface: {n:singular|plural}.
The language comes from the header X-Language for each request, and from the environment variable GRIMMICH_LANGUAGE for
background jobs. Without a value English applies.

What Grimmich writes into Immich or Gramps (the tags such as "Datierung geschätzt" and the language-independent [GRM] block) follows naming.py: the words are chosen once
and then stay, so photos can be found again across languages."""
import json
import os
import re
import threading

FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "languages")
BASE = "en"   # the language of the texts in the code; it needs no translations
_local = threading.local()
_PATTERN = re.compile(r"\{(\w+)(?::([^{}|]*)\|([^{}]*))?\}")
_cache = {}


def _read(code):
    try:
        with open(os.path.join(FOLDER, code + ".json"), encoding="utf-8") as f:
            doc = json.load(f)
        return doc if isinstance(doc, dict) else None
    except (OSError, ValueError):
        return None


def available():
    """[{code, name, date_input}] of all language files, English first."""
    found = []
    try:
        names = sorted(os.listdir(FOLDER))
    except OSError:
        names = []
    for n in names:
        if n.endswith(".json"):
            doc = _read(n[:-5]) or {}
            meta = doc.get("language") or {}
            code = str(meta.get("code") or n[:-5])
            found.append({"code": code, "name": str(meta.get("name") or code), "date_input": str(meta.get("date_input") or "iso")})
    if not any(x["code"] == BASE for x in found):
        found.append({"code": BASE, "name": "English", "date_input": "iso"})
    return sorted(found, key=lambda x: (x["code"] != BASE, x["name"].lower()))


def document(code):
    """The complete language file (for the interface), or None."""
    code = str(code or "").lower()
    return _read(code) if code.isalnum() or "-" in code or "_" in code else None


def _normal(code):
    code = str(code or "").strip().lower().replace("_", "-")
    if not code:
        return None
    known = {x["code"].lower() for x in available()}
    if code in known:
        return code
    return code.split("-")[0] if code.split("-")[0] in known else None


def set_language(code):
    """Language for this thread (one request). Unknown or empty: no own language (then the environment decides)."""
    _local.code = _normal(code)


def language():
    return getattr(_local, "code", None) or _normal(os.environ.get("GRIMMICH_LANGUAGE") or os.environ.get("GRIMMICH_SPRACHE")) or BASE


def _texts(code):
    if code not in _cache:
        doc = _read(code) or {}
        _cache[code] = doc.get("texts") if isinstance(doc.get("texts"), dict) else {}
    return _cache[code]


def t(text, **values_):
    code = language()
    s = _texts(code).get(text, text) if code != BASE else text
    if not values_:
        return s

    def replace_it(m):
        k = m.group(1)
        if k not in values_:
            return m.group(0)
        if m.group(2) is None:
            return str(values_[k])
        return m.group(2) if values_[k] == 1 else m.group(3)
    return _PATTERN.sub(replace_it, s)


tx = t
