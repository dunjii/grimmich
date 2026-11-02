"""The words Grimmich writes into Immich: the tags (estimated, open, and the kinds postcard / greeting card / document / other),
the text 'dating open' (older versions) and the source marker (older versions).

They are chosen once and then stay: otherwise photos written in German could not be found again after switching the language.
- An installation that has already written to Immich keeps the German words (as before).
- A new installation takes the words of the language it is first used in: a language file may have a section "written"
  with the keys tag_estimated, tag_open, note_open and source; without it English applies (German for 'de').
- The choice is stored (document written_names.json). Reading recognises the words of every language, so a changed choice
  never loses a photo.
"""
import messages
import storage

DOCUMENT = "written_names.json"
GERMAN = {"tag_estimated": "Datierung geschätzt", "tag_open": "Datierung offen", "note_open": "Datierung offen", "source": "Quelle",
          "tag_postcard": "Ansichtskarte", "tag_greeting_card": "Grußkarte", "tag_document": "Dokument", "tag_other": "Sonstiges (Grimmich)"}
ENGLISH = {"tag_estimated": "Dating estimated", "tag_open": "Dating open", "note_open": "Dating open", "source": "Source",
           "tag_postcard": "Postcard", "tag_greeting_card": "Greeting card", "tag_document": "Document", "tag_other": "Other (Grimmich)"}
KEYS = tuple(GERMAN)


def _of_language(code):
    if code == "de":
        return dict(GERMAN)
    doc = messages.document(code) or {}
    own = doc.get("written") if isinstance(doc.get("written"), dict) else {}
    return {k: str(own.get(k) or ENGLISH[k]) for k in KEYS}


OLDER_KEYS = ("tag_estimated", "tag_open", "note_open", "source")   # the first version of the stored choice had only these


def _stored():
    doc = storage.load(DOCUMENT, None)
    if isinstance(doc, dict) and all(isinstance(doc.get(k), str) and doc.get(k) for k in OLDER_KEYS):
        # the kind tags (postcard ...) were always written in German before they became part of the choice
        return {k: (doc[k] if isinstance(doc.get(k), str) and doc.get(k) else GERMAN[k]) for k in KEYS}
    return None


def _already_written():
    try:
        return bool(storage.load("dating_written.json", None))
    except Exception:   # no database yet
        return False


def active():
    """The words used for writing. Does not store anything (see freeze)."""
    return _stored() or (dict(GERMAN) if _already_written() else _of_language(messages.language()))


def freeze():
    """Stores the choice, once. Called when a preview or a write starts."""
    names = active()
    if _stored() is None:
        storage.save(DOCUMENT, names)
    return names


def variants(key):
    """Every known spelling of one word (German, English, the active one and those of the language files)."""
    found = {GERMAN[key], ENGLISH[key], active()[key]}
    for lang in messages.available():
        found.add(_of_language(lang["code"])[key])
    return sorted(found)
