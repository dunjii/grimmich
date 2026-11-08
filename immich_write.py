"""Write dating to Immich (with preview, backup and undo).

Usage (usually the interface starts this for you):
    python immich_write.py preview        only look, writes NOTHING to Immich
    python immich_write.py write          really write
    python immich_write.py write 3        really write, but only the first 3 photos (test)
    python immich_write.py undo           write back everything this script changed

Input:    adoption.json     (comes from the interface, tab 'Adopt')
Keys:
    preview  reads with  immich.env           (the read-only key is enough)
    write    reads with  immich_write.env     (second key with write permission)

Files created on the way:
    dating_backup.json   original values of every photo BEFORE the first change (never overwritten)
    dating_written.json  what this script wrote to Immich last
    write_preview.json   result of the preview
    write_result.json    result of the writing

Rules (variant B): every photo with an estimate gets date + tag 'Datierung geschätzt'
+ a note in the description. Photos without an estimate get the tag 'Datierung offen' + a note.
Existing descriptions are never overwritten, the note stands as its own block at the end.
"""
import os
import re
import sys
import naming
import storage
import credentials
import addresses
from immich import ApiError, Immich  # noqa: F401  (still reachable here, the other parts import it from here)
from datetime import datetime, date
from messages import tx

INPUT_FILE = "adoption.json"
BACKUP = "dating_backup.json"
WRITTEN = "dating_written.json"
PREVIEW = "write_preview.json"
RESULT = "write_result.json"
READ_ENV = "immich.env"
WRITE_ENV = "immich_write.env"   # only a name for messages now; credentials.py says which file applies

_NAMES = naming.active()   # the words written into Immich (see naming.py)
TAG_ESTIMATED = _NAMES["tag_estimated"]
TAG_OPEN = _NAMES["tag_open"]
ESTIMATED_ALL = naming.variants("tag_estimated")   # all spellings that are recognised when reading
OPEN_ALL = naming.variants("tag_open")
ART_TAGS = {k: _NAMES["tag_" + k] for k in ("postcard", "greeting_card", "document", "other")}
ART_ALL = sorted({w for k in ART_TAGS for w in naming.variants("tag_" + k)})   # all spellings, for reading and removing
BLOCK_START = "[GRM]"   # one block per photo; the marker is language independent and never changes
BLOCK_END = "[/GRM]"
def scan_date(asset):
    """The day the photo was scanned/imported. Not fileCreatedAt: Immich moves that along when you change the capture date,
    so it would always look 'unchanged'. The file's modification date and the day it was added to Immich stay put."""
    for k in ("fileModifiedAt", "createdAt", "fileCreatedAt", "localDateTime"):
        if asset.get(k):
            return asset[k][:10]
    return ""


EARLIEST_SCAN_YEAR = 2005   # no scanner dates a file earlier: a capture date before this was entered by someone (the scanner, not the photo, sets the date otherwise)


def far_from_scan(asset, date_):
    """Is the capture date (YYYY-MM-DD) so far from the scan date that someone must have set it? -> (bool, scan date, days apart or None)"""
    scan = scan_date(asset)
    try:
        if int(date_[:4]) < EARLIEST_SCAN_YEAR:
            return True, scan, None
        if scan:
            n = abs((datetime.fromisoformat(date_[:10]) - datetime.fromisoformat(scan)).days)
            return n > DEVIATION_DAYS, scan, n
    except ValueError:
        pass
    return False, scan, None


DEVIATION_DAYS = 2   # how far the capture date may deviate from the scan date before we assume 'set by yourself'




# ------------------------------------------------------------------ helpers

def read_(path_, default):
    return storage.load(path_, default)


def write_doc(path_, data_):
    storage.save(path_, data_)


def load_env(file_path):
    if not os.path.exists(file_path):
        return None
    values_ = {}
    with open(file_path, encoding="utf-8") as f:
        for z in f:
            z = z.strip()
            if z and not z.startswith("#") and "=" in z:
                k, v = z.split("=", 1)
                values_[k.strip()] = v.strip()
    address = addresses.url(values_, "immich")
    if not address or not values_.get("IMMICH_API_KEY"):
        return None
    return address, values_["IMMICH_API_KEY"]


def iso_date(entry_row):
    """The date that should appear in Immich (always 12:00 UTC, so the day does not shift anywhere)."""
    d = entry_row.get("date") or ""
    t = d.split("-")
    try:
        if len(t) == 3:
            date(int(t[0]), int(t[1]), int(t[2]))
            return f"{t[0]}-{t[1]}-{t[2]}T12:00:00.000Z"
        if len(t) == 2:
            return f"{t[0]}-{t[1]}-15T12:00:00.000Z"
    except ValueError:
        pass
    return f"{int(entry_row['year']):04d}-07-01T12:00:00.000Z"


# ---- the block in the description:  [GRM] ~1960 (1952–1968) · S038 · Photo album 3, p. 2, no. 1 [/GRM]
# parts, in this order: date (~ = estimated, none = fixed, ? = open), series, source. Only the source part is free text.
SEP = " · "
OLD_BLOCKS = (("[Grimmich]", "[/Grimmich]"), ("[Datierung automatisch]", "[/Datierung]"))   # earlier versions: still recognised, replaced when written
PATTERN = re.compile("|".join(re.escape(a) + r".*?" + re.escape(b) for a, b in ((BLOCK_START, BLOCK_END),) + OLD_BLOCKS), re.S)
PATTERN_Q = re.compile("|".join(re.escape("[" + w + "]") + r".*?" + re.escape("[/" + w + "]") for w in naming.variants("source")), re.S)   # the earlier separate source block
_DATE_PART = re.compile(r"^(?:\?|~?\d{4}(?:-\d{2}(?:-\d{2})?)?(?: \(\d{4}[–-]\d{4}\))?)$")
_SERIES_PART = re.compile(r"^S\d{3,}$")


def any_of(tags, spellings):
    return any(t in tags for t in spellings)


def has_block(text):
    text = text or ""
    return any(a in text for a in (BLOCK_START,) + tuple(a for a, _b in OLD_BLOCKS))


def block_parts(text):
    """What the description already says: {"date": ..., "series": ..., "source": ...} (each possibly empty). Reads the new block,
    and the earlier separate source block."""
    parts = {"date": "", "series": "", "source": ""}
    m = re.search(re.escape(BLOCK_START) + r"(.*?)" + re.escape(BLOCK_END), text or "", re.S)
    if m:
        tokens = [t.strip() for t in m.group(1).strip().split(SEP.strip())]
        rest = []
        for t in tokens:
            if not rest and not parts["date"] and _DATE_PART.match(t):
                parts["date"] = t
            elif not rest and not parts["series"] and _SERIES_PART.match(t):
                parts["series"] = t
            elif t:
                rest.append(t)
        parts["source"] = SEP.join(rest)
    else:
        q = PATTERN_Q.search(text or "")
        if q:
            inner = re.sub(r"^\[[^\]]*\]|\[/[^\]]*\]$", "", q.group(0)).strip()
            parts["source"] = inner
    return parts


def date_part(entry_row):
    """'~1960 (1952–1968)' for an estimate, '1951' or '1951-03-12' for a fixed date, '?' for open. '' if there is nothing."""
    if not entry_row.get("year"):
        return "?"
    status = entry_row.get("status", "")
    if entry_row.get("date") or status in ("manuell", "bestätigt"):
        return entry_row.get("date") or str(entry_row["year"])
    text = f"~{entry_row['year']}"
    if entry_row.get("from") and entry_row.get("to") and entry_row["from"] != entry_row["to"]:
        text += f" ({entry_row['from']}–{entry_row['to']})"
    return text


def is_fixed(entry_row):
    return bool(entry_row.get("year")) and (bool(entry_row.get("date")) or entry_row.get("status", "") in ("manuell", "bestätigt"))


def make_block(date_, series_, source_):
    """Puts the parts together. A fixed date alone (nothing else to say) gets no block: the date in Immich says it."""
    parts = [x for x in (date_, series_, source_) if x]
    return f"{BLOCK_START} {SEP.join(parts)} {BLOCK_END}" if parts else ""


def note(entry_row, old_text="", keep_date=False):
    """The block for the description ('' = no block). keep_date: leave the date part of the existing block as it is.
    The source part: the row's source if source writing is on, else what the description already has."""
    old = block_parts(old_text)
    date_ = old["date"] if keep_date else date_part(entry_row)
    series_ = entry_row.get("series_id") or ""
    source_ = old["source"] if entry_row.get("sourceUntouched") else (entry_row.get("source") or "").strip()
    if not keep_date and is_fixed(entry_row) and not (series_ or source_):
        date_ = ""
    return make_block(date_, series_, source_)


def _replace(old, pattern, block):
    if pattern.search(old):
        return pattern.sub(lambda _m: block, old, count=1).strip()
    if not block:
        return old.strip()
    return (old.rstrip() + "\n\n" + block).strip()


def new_description(old, block):
    """Puts the block (or removes it, if empty) and removes the earlier separate source block."""
    old = old or ""
    if PATTERN_Q.search(old):
        old = re.sub(r"\n{3,}", "\n\n", PATTERN_Q.sub("", old)).strip()
    return _replace(old, PATTERN, block or "")


def tag_names(asset):
    return {(t.get("value") or t.get("name") or "") for t in (asset.get("tags") or [])}


PLACE_TOLERANCE = 0.001   # degrees (about 100 m): this close the place in Immich counts as the same


def plan_place(entry_row, exif):
    """The place (coordinates from Gramps). Only if Immich has no place yet, or you confirmed overwriting.
    -> {"new": (lat, lon) or None, "old": (lat, lon) or None, "action": "", "reason": ""}"""
    place_ = entry_row.get("place")
    res = {"new": None, "old": None, "action": "", "reason": ""}
    lat, lon = exif.get("latitude"), exif.get("longitude")
    if lat is not None and lon is not None:
        res["old"] = (float(lat), float(lon))
    if not place_:
        return res
    try:
        new_ = (float(place_["lat"]), float(place_["lon"]))
    except (KeyError, TypeError, ValueError):
        return res
    old = res["old"]
    if old and abs(old[0] - new_[0]) < PLACE_TOLERANCE and abs(old[1] - new_[1]) < PLACE_TOLERANCE:
        res["action"] = "same"
    elif old and not entry_row.get("placeForce"):
        res.update(action="skip", reason=tx('Immich already has a different place ({a}, {b}). It is only replaced after your confirmation.', a=f"{old[0]:.4f}", b=f"{old[1]:.4f}"))
    else:
        res.update(new=new_, action="write")
    return res


def plan(entry_row, asset, written):
    """Decides for a photo what should happen."""
    exif = asset.get("exifInfo") or {}
    old_date_value = exif.get("dateTimeOriginal") or ""
    old_text = exif.get("description") or ""
    tags = tag_names(asset)
    key = entry_row["key"]
    earlier = written.get(key)
    by_us = bool(earlier and not earlier.get("only_source")) or any_of(tags, ESTIMATED_ALL) or any_of(tags, OPEN_ALL) or has_block(old_text)

    p = {"key": key, "old_date": old_date_value[:10], "new_date": "", "action": "write", "reason": "",
         "tags_add": [], "tags_remove": [], "description": old_text, "new_description": old_text, "date_change": False}
    o = plan_place(entry_row, exif)
    p.update(new_place=o["new"], old_place=o["old"], place_name=(entry_row.get("place") or {}).get("name", ""), place_reason=o["reason"], place_confirm=o["action"] == "skip")

    # anchor album: never changed
    if entry_row.get("anchor"):
        p.update(action="skip", reason=tx('Anchor photo (anchor album): Grimmich writes nothing here'), new_place=None, place_confirm=False)
        return p

    # only the source (photo album, page, photo) into the description: date, tags and dating block stay untouched
    if entry_row.get("onlySource") or entry_row.get("onlyPlace"):
        if entry_row.get("onlySource"):
            p["new_description"] = new_description(old_text, note(entry_row, old_text, keep_date=True))
        p["only_source"] = True
        if p["new_description"] != old_text or p["new_place"]:
            q_new, o_new = p["new_description"] != old_text, bool(p["new_place"])
            p["reason"] = tx('Only the source (album, page, photo) into the description and the place, the date stays') if q_new and o_new else \
                tx('Only the source (album, page, photo) into the description, the date stays') if q_new else tx('Only the place, the date stays')
        if p["new_description"] == old_text and not p["new_place"]:
            if o["action"] == "skip":
                p.update(action="skip", reason=o["reason"])
            else:
                p.update(action="unchanged", reason=tx('Source is already like this in Immich') if entry_row.get("onlySource") else tx('Place is already like this in Immich'))
        return p

    # if you explicitly confirmed the change in Grimmich, a date set by hand may be replaced.
    force_ = bool(entry_row.get("force"))
    hand_date = entry_row.get("manual_date") or ""

    # was anything changed by hand?
    if earlier and earlier.get("date") and old_date_value[:10] != earlier["date"][:10] and not force_:
        p.update(action="skip", reason=tx('The date was changed in Immich since my last write (by you?)'))
        return p
    # digital photo in the working album: camera data does not count there as set by you (real digital photos belong in the anchor album,
    # Grimmich writes nothing there). The original is saved before every write.
    camera = bool(exif.get("make") or exif.get("model"))
    if not by_us and not camera:
        hand_, scan, distance = far_from_scan(asset, old_date_value) if old_date_value else (False, "", None)
        if old_date_value:
            if hand_ and not force_:
                reason_ = tx('Capture date {alt} differs from the scan date {scan} (probably set by you)', alt=old_date_value[:10], scan=scan)
                if hand_date:
                    reason_ = tx('You changed the date you set ({alt}) in Grimmich. It is only overwritten if you confirm it here.', alt=old_date_value[:10])
                    p["confirm"] = True
                p.update(action="skip", reason=reason_)
                return p

    p["new_description"] = new_description(old_text, note(entry_row, old_text))
    if entry_row.get("year"):
        p["new_date"] = iso_date(entry_row)
        p["date_change"] = old_date_value[:10] != p["new_date"][:10]
        if not entry_row.get("date"):  # only the year known or estimated -> mark as estimated
            p["tags_add"].append(TAG_ESTIMATED)
        else:
            p["tags_remove"] += [t for t in ESTIMATED_ALL if t in tags]
        p["tags_remove"] += [t for t in OPEN_ALL if t in tags]
        if not entry_row.get("date"):   # a tag in another spelling is replaced by the current one
            p["tags_remove"] += [t for t in ESTIMATED_ALL if t in tags and t != TAG_ESTIMATED]
    else:
        p["tags_add"].append(TAG_OPEN)
        p["tags_remove"] += [t for t in ESTIMATED_ALL if t in tags]
        p["tags_remove"] += [t for t in OPEN_ALL if t in tags and t != TAG_OPEN]
    # kind (postcard, greeting card, document): its own tag; if the kind is withdrawn, the tag is removed
    kind_tag = ART_TAGS.get(entry_row.get("kind") or "")
    if kind_tag:
        p["tags_add"].append(kind_tag)
    p["tags_remove"] += [t for t in ART_ALL if t != kind_tag]
    p["tags_add"] = [t for t in p["tags_add"] if t not in tags]
    p["tags_remove"] = [t for t in p["tags_remove"] if t in tags]
    if not p["date_change"] and p["new_description"] == old_text and not p["tags_add"] and not p["tags_remove"] and not p["new_place"]:
        p.update(action="unchanged", reason=tx('already like this in Immich'))
    return p


# ------------------------------------------------------------------ flow

def get_plans(immich, rows, written):
    plans, errors = [], []
    for i, z in enumerate(rows, 1):
        if i % 100 == 0:
            print(tx("  {i} / {n} photos read", i=i, n=len(rows)))
        try:
            asset = immich.request_("GET", f"/assets/{z['asset']}")
        except ApiError as e:
            errors.append({"key": z["key"], "errors": str(e)})
            continue
        p = plan(z, asset, written)
        p["asset"] = z["asset"]
        p["row"] = z
        p["asset_info"] = {"date": ((asset.get("exifInfo") or {}).get("dateTimeOriginal") or ""),
                           "local": asset.get("localDateTime") or "", "description": (asset.get("exifInfo") or {}).get("description") or "",
                           "tags": sorted(tag_names(asset)),
                           "latitude": (asset.get("exifInfo") or {}).get("latitude"), "longitude": (asset.get("exifInfo") or {}).get("longitude")}
        plans.append(p)
    return plans, errors


def counters(plans, errors):
    z = {"write": 0, "with_date": 0, "open": 0, "unchanged": 0, "skipped": 0, "errors": len(errors),
         "places": sum(1 for p in plans if p.get("new_place") and p["action"] == "write"),
         "places_confirm": sum(1 for p in plans if p.get("place_confirm"))}
    for p in plans:
        if p["action"] == "write":
            z["write"] += 1
            if p.get("only_source"):
                z["only_source_place"] = z.get("only_source_place", 0) + 1   # only source or place: no date, no tags
            else:
                z["with_date" if p["new_date"] else "open"] += 1
        elif p["action"] == "unchanged":
            z["unchanged"] += 1
        else:
            z["skipped"] += 1
    return z


def short(p):
    return {"key": p["key"], "action": p["action"], "reason": p["reason"], "old_date": p["old_date"], "confirm": bool(p.get("confirm")),
            "new_date": p["new_date"][:10], "tags_add": p["tags_add"], "tags_remove": p["tags_remove"],
            "new_place": p["new_place"], "place_name": p["place_name"], "old_place": p["old_place"], "place_reason": p["place_reason"], "place_confirm": p["place_confirm"],
            "new_note": note(p["row"], p["description"], keep_date=bool(p["row"].get("onlySource"))) if p["action"] == "write" else ""}


def load_rows():
    data_ = read_(INPUT_FILE, None)
    if not data_ or not data_.get("rows"):
        sys.exit(tx("{file} is missing or empty. Please open the tab 'Adopt' in the interface and create the preview.", file=INPUT_FILE))
    return data_["rows"]


def preview():
    naming.freeze()
    access = load_env(READ_ENV) or load_env(credentials.write_env_name("immich"))
    if not access:
        sys.exit(tx("{file} is missing or incomplete.", file=READ_ENV))
    immich = Immich(*access)
    rows = load_rows()
    print(tx("Preview for {n} photos (nothing is written) ...", n=len(rows)))
    plans, errors = get_plans(immich, rows, read_(WRITTEN, {}))
    z = counters(plans, errors)
    write_doc(PREVIEW, {"time": datetime.now().strftime("%Y-%m-%d %H:%M"), "counters": z,
                        "rows": [short(p) for p in plans], "errors": errors})
    output(z)
    print(tx("Preview saved. NOTHING was changed in Immich."))


def output(z):
    print(tx("  would be written:    {write}  (of them with date {dated}, only marked 'open' {open_}, only source or place {only})", write=z['write'], dated=z['with_date'], open_=z['open'], only=z.get('only_source_place', 0)))
    print(tx("  already current:     {n}", n=z['unchanged']))
    print(tx("  skipped:             {n}  (probably set by you)", n=z['skipped']))
    print(tx("  places (GPS):        {n} would be set, {confirm} need your confirmation (Immich already has another place)", n=z.get('places', 0), confirm=z.get('places_confirm', 0)))
    print(tx("  errors when reading: {n}", n=z['errors']))


def tag_ids(immich, name_list, create):
    present = {(t.get("value") or t.get("name")): t["id"] for t in (immich.request_("GET", "/tags") or [])}
    ids = {}
    for n in name_list:
        if n in present:
            ids[n] = present[n]
        elif create:
            new_ = immich.request_("POST", "/tags", {"name": n})
            ids[n] = new_["id"]
    return ids


def write_it(limit):
    naming.freeze()
    access = load_env(credentials.write_env_name("immich"))
    if not access:
        sys.exit(tx("{file} is missing or incomplete. It must contain the key with write permission.", file=credentials.write_env_name('immich')))
    immich = Immich(*access)
    rows = load_rows()
    written = read_(WRITTEN, {})
    backup = read_(BACKUP, {})
    print(tx("Reading the current state of {n} photos ...", n=len(rows)))
    plans, errors = get_plans(immich, rows, written)
    z = counters(plans, errors)
    output(z)
    target_ = [p for p in plans if p["action"] == "write"]
    if limit:
        target_ = target_[:limit]
        print(tx("Test mode: only the first {n} photos.", n=len(target_)))
    if not target_:
        print(tx("Nothing to write."))
        return
    ids = tag_ids(immich, [TAG_ESTIMATED, TAG_OPEN] + sorted({t for p in target_ for t in p["tags_add"] + p["tags_remove"]} - {TAG_ESTIMATED, TAG_OPEN}), create=True)
    print(tx("Writing {n} photos ...", n=len(target_)))
    tag_to, tag_from = {n: [] for n in ids}, {n: [] for n in ids}
    success, fail, in_folge = 0, [], 0
    for i, p in enumerate(target_, 1):
        key = p["key"]
        if key not in backup:   # back up the original only the first time, never touch it again
            backup[key] = {"asset": p["asset"], **p["asset_info"], "saved": datetime.now().strftime("%Y-%m-%d %H:%M")}
            write_doc(BACKUP, backup)
        data_ = {}
        if p["date_change"]:
            data_["dateTimeOriginal"] = p["new_date"]
        if p["new_description"] != p["description"]:
            data_["description"] = p["new_description"]
        if p.get("new_place"):
            data_["latitude"], data_["longitude"] = p["new_place"]
        try:
            if data_:
                immich.request_("PUT", f"/assets/{p['asset']}", data_)
            for t in p["tags_add"]:
                tag_to[t].append(p["asset"])
            for t in p["tags_remove"]:
                tag_from[t].append(p["asset"])
            written[key] = {"asset": p["asset"], "date": p["new_date"] or p["old_date"],
                                "time": datetime.now().strftime("%Y-%m-%d %H:%M"),
                                **({"only_source": True} if p.get("only_source") else {}),
                                **({"place": True} if p.get("new_place") else {})}
            success += 1
            in_folge = 0
        except ApiError as e:
            fail.append({"key": key, "errors": str(e)})
            print(tx("Error with {key}: {error}", key=key, error=e))
            in_folge += 1
            if in_folge >= 3:
                write_doc(WRITTEN, written)
                sys.exit(tx("Three errors in a row. I am stopping. Please send the message."))
        if i % 50 == 0:
            print(f"  {i} / {len(target_)}")
            write_doc(WRITTEN, written)
    try:
        for n, items_list in tag_to.items():
            if items_list:
                immich.request_("PUT", f"/tags/{ids[n]}/assets", {"ids": items_list})
        for n, items_list in tag_from.items():
            if items_list:
                immich.request_("DELETE", f"/tags/{ids[n]}/assets", {"ids": items_list})
    except ApiError as e:
        fail.append({"key": "(Tags)", "errors": str(e)})
        print(tx("Error with the tags: {error}", error=e))
    write_doc(WRITTEN, written)
    write_doc(RESULT, {"time": datetime.now().strftime("%Y-%m-%d %H:%M"), "written": success, "errors": fail,
                        "limit": limit or 0})
    print(tx("Done: {ok} photos written, {fail} errors.", ok=success, fail=len(fail)))
    print(tx("The original values are in {file}. With 'undo' everything can be reverted.", file=BACKUP))


def back_():
    access = load_env(credentials.write_env_name("immich"))
    if not access:
        sys.exit(tx("{file} is missing or incomplete.", file=credentials.write_env_name('immich')))
    immich = Immich(*access)
    backup = read_(BACKUP, {})
    written = read_(WRITTEN, {})
    target_ = [k for k in written if k in backup]
    if not target_:
        print(tx("Nothing to undo."))
        return
    print(tx("Restoring {n} photos ...", n=len(target_)))
    ids = tag_ids(immich, ESTIMATED_ALL + OPEN_ALL + ART_ALL, create=False)
    remove_it = {n: [] for n in ids}
    fail = 0
    for k in target_:
        s = backup[k]
        data_ = {"description": s.get("description", "")}
        date_ = s.get("date") or s.get("local")
        if date_:
            data_["dateTimeOriginal"] = date_
        if written.get(k, {}).get("place") and s.get("latitude") is not None and s.get("longitude") is not None:
            data_["latitude"], data_["longitude"] = s["latitude"], s["longitude"]
        try:
            immich.request_("PUT", f"/assets/{s['asset']}", data_)
            for n in ids:
                remove_it[n].append(s["asset"])
            del written[k]
        except ApiError as e:
            fail += 1
            print(tx("Error with {key}: {error}", key=k, error=e))
    for n, items_list in remove_it.items():
        if items_list:
            try:
                immich.request_("DELETE", f"/tags/{ids[n]}/assets", {"ids": items_list})
            except ApiError as e:
                print(tx("Tag '{tag}' could not be removed everywhere: {error}", tag=n, error=e))
    write_doc(WRITTEN, written)
    print(tx("Done: {ok} photos reset, {fail} errors.", ok=len(target_) - fail, fail=fail))


def main():
    modus = sys.argv[1] if len(sys.argv) > 1 else "preview"
    if modus == "preview":
        preview()
    elif modus == "write":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else None
        write_it(limit)
    elif modus == "undo":
        back_()
    else:
        sys.exit("Usage: python immich_write.py preview | write [count] | undo")


if __name__ == "__main__":
    main()
