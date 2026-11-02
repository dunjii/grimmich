"""Creates an invented demo data set, so Grimmich can be tried without your own photos, Immich or Gramps.

    python3 demo_data.py [folder]        (default folder: demo_data)

Everything is made up: people, birth dates, photos (simple drawings), series, estimates. Nothing is real.
The folder gets the documents Grimmich normally stores in its database (as .json files), a table of estimates
(schaetzung_koerper.csv) and the pictures (serien_ausgabe/fotos/). To look at it:

    1. Copy the content of the folder into a NEW, empty Grimmich folder (a copy of the program, without grimmich.db).
    2. Start there with   GRIMMICH_READ_ONLY=1 ./.venv/bin/python grimmich.py   and open http://localhost:8765.

On the first start Grimmich takes the .json files into its database. With READ_ONLY nothing can be written to Immich
or Gramps; there is no Immich or Gramps behind the demo anyway.
The data is the same every time (fixed random seed), so tests can rely on it.
"""
import csv
import json
import os
import random
import sys

SEED = 7
FIRST_NAMES_F = ["Anna", "Berta", "Clara", "Dora", "Elsa", "Frieda", "Greta", "Helga", "Ida", "Julia", "Karla", "Lotte", "Marta", "Nora"]
FIRST_NAMES_M = ["Albert", "Bruno", "Carl", "Dieter", "Emil", "Felix", "Georg", "Hans", "Ivo", "Jonas", "Kurt", "Ludwig", "Max", "Otto"]
FAMILIES = ["Almeida", "Brandt", "Corvin"]   # invented
ALBUMS = ["Photo album 1", "Photo album 2", "Shoebox", "Loose photos"]
FILE_PREFIX = "DEMO"


def asset_id(rng):
    return "".join(rng.choice("0123456789abcdef") for _ in range(32))


def make_people(rng):
    people = []
    for fam in FAMILIES:
        base = rng.choice([1915, 1925, 1935])
        for gen in range(3):
            for _ in range(rng.choice([3, 4])):
                female = rng.random() < 0.5
                first = rng.choice(FIRST_NAMES_F if female else FIRST_NAMES_M)
                birth_year = base + gen * 27 + rng.randint(-3, 6)
                people.append({"id": "demo-person-%02d" % (len(people) + 1), "name": f"{first} {fam}", "birth_year": birth_year,
                               "birth": "%d-%02d-%02d" % (birth_year, rng.randint(1, 12), rng.randint(1, 28)) if rng.random() < 0.8 else ""})
    seen, unique = set(), []
    for p in people:   # no duplicate names
        if p["name"] not in seen:
            seen.add(p["name"])
            unique.append(p)
    return unique


def _bezier(p0, p1, p2, p3, n=14):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                    u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return pts


def _figure(d, cx, cy, r, age, rng):
    """One simple person (head, hair, shoulders), drawn like the figures of the planned game; age changes hair and face."""
    k = r / 40.0
    T = lambda x, y: (cx + (x - 100) * k, cy + (y - 115) * k)
    poly = lambda pts, **kw: d.polygon([T(*p) for p in pts], **kw)
    child = age < 14
    skin = rng.choice([(212, 168, 129), (207, 166, 127), (199, 154, 120), (219, 178, 140)])
    if age < 38:
        hair = rng.choice([(59, 42, 32), (84, 58, 38), (40, 30, 26), (120, 84, 50)])
    elif age < 58:
        hair = rng.choice([(70, 55, 45), (95, 85, 78), (59, 42, 32)])
    elif age < 70:
        hair = (150, 143, 135)
    else:
        hair = (185, 180, 170)
    cloth = rng.choice([(107, 91, 74), (78, 74, 68), (92, 84, 110), (118, 80, 70), (70, 90, 84)])
    line = (154, 118, 88)
    ink = (59, 42, 32)
    sw = 0.7 if child else 1.0   # children: narrower shoulders
    body = _bezier((100 - 80 * sw, 240), (100 - 70 * sw, 190), (70, 175), (100, 175)) + _bezier((100, 175), (130, 175), (100 + 70 * sw, 190), (100 + 80 * sw, 240))
    poly(body, fill=cloth)
    d.rectangle([T(88, 150), T(112, 185)], fill=tuple(int(c * 0.9) for c in skin))
    rx, ry = (36, 44) if child else (40, 50)
    if rng.random() < 0.5 and not child:   # longer hair behind the head
        poly(_bezier((56, 112), (50, 170), (60, 178), (74, 176)) + _bezier((74, 176), (80, 140), (120, 140), (126, 176)) + _bezier((126, 176), (140, 178), (150, 170), (144, 112)), fill=hair)
    d.ellipse([T(100 - rx, 115 - ry), T(100 + rx, 115 + ry)], fill=skin)
    cap = _bezier((58, 108), (56, 58), (144, 58), (142, 108)) + _bezier((142, 108), (132, 84), (68, 84), (58, 108))
    poly(cap, fill=hair)
    eye_y = 120 if child else 116
    er = (4.2 if child else 3.2) * k
    for ex in (84, 116):
        x, y = T(ex, eye_y)
        d.ellipse([x - er, y - er, x + er, y + er], fill=ink)
    w = max(1, int(1.5 * k))
    if age >= 40:   # brows and fine lines
        for bx in ((72, 94), (106, 128)):
            d.line([T(bx[0], 106), T((bx[0] + bx[1]) / 2, 101), T(bx[1], 106)], fill=line, width=w)
    if age >= 58:
        for bx in ((78, 90), (110, 122)):
            d.line([T(bx[0], 130), T((bx[0] + bx[1]) / 2, 134), T(bx[1], 130)], fill=line, width=w)
    my = 148 if child else 143
    d.line([T(*p) for p in _bezier((88, my - 1), (96, my + 6), (104, my + 6), (112, my - 1))], fill=(138, 90, 72), width=max(2, int(2.5 * k)))


def draw_photo(path_, key, rng, boxes, year, size=(640, 480), ages=None):
    """A simple drawing: sepia background, small figures (head, hair, shoulders) where the faces are."""
    from PIL import Image, ImageDraw, ImageFont
    w, h = size
    ss = 2   # draw twice as large and shrink: smooth edges
    tone = rng.randint(-12, 12)
    img = Image.new("RGB", (w * ss, h * ss), (214 + tone, 196 + tone, 160 + tone))
    d = ImageDraw.Draw(img)
    for y in range(h * ss):   # soft gradient
        shade = int(30 * y / (h * ss))
        d.line([(0, y), (w * ss, y)], fill=(214 + tone - shade, 196 + tone - shade, 160 + tone - shade))
    for i, (x1, y1, x2, y2) in enumerate(boxes):
        cx, cy, r = (x1 + x2) * ss // 2, (y1 + y2) * ss // 2, (x2 - x1) * ss // 2
        age = ages[i] if ages and i < len(ages) else 35
        _figure(d, cx, cy, r, age, random.Random(f"{key}-{i}"))
    d.rectangle([8 * ss, 8 * ss, (w - 9) * ss, (h - 9) * ss], outline=(120, 100, 70), width=3 * ss)
    img = img.resize((w, h), Image.LANCZOS)
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default()
    except OSError:
        font = None
    d.text((18, h - 28), f"demo {key} ~{year}", fill=(90, 70, 50), font=font)
    img.save(path_, "JPEG", quality=84)


def build(folder, pictures=True):
    rng = random.Random(SEED)
    people = make_people(rng)
    photos, state_photos, ages, series_list, records = [], {}, {}, [], []
    people_of_photo = {}
    n_series = 24
    counter = 0
    for s in range(n_series):
        while True:   # a year in which at least two people were alive and born
            year = rng.randint(1932, 1998)
            pool = [p for p in people if year - 85 < p["birth_year"] < year - 1]
            if len(pool) >= 2:
                break
        album = ALBUMS[s % 2 if s < 18 else 2 + s % 2]
        group_people = rng.sample(pool, rng.randint(2, min(5, len(pool))))
        keys = []
        for _ in range(rng.randint(3, 7)):
            counter += 1
            file_ = "%s%04d.JPG" % (FILE_PREFIX, counter)
            asset = asset_id(rng)
            key = f"{os.path.splitext(file_)[0]}_{asset[:6]}"
            present = rng.sample(group_people, rng.randint(0, min(3, len(group_people))))
            wrong = [p for p in people if p["birth"] and p["birth_year"] > year + 2]
            if present and wrong and rng.random() < 0.06:   # now and then a face that was named wrongly: this gives a few warnings
                present[0] = rng.choice(wrong)
            size = (640, 480)
            faces, boxes, names, face_ages = [], [], [], []
            for i, p in enumerate(present):
                r = rng.randint(28, 46)
                cx = int((i + 1) * size[0] / (len(present) + 1))
                cy = rng.randint(150, 230)
                box = [cx - r, cy - r, cx + r, cy + r]
                boxes.append(tuple(box))
                face_ages.append(max(1, year - p["birth_year"]))
                named = rng.random() < 0.85
                faces.append({"id": asset_id(rng), "p": p["id"] if named else "", "b": box + [size[0], size[1]]})
                if named:
                    names.append(p)
            photo_year = year + rng.choice([0, 0, 0, 1, -1])
            datable = [p for p in names if p["birth"]]
            photos.append({"key": key, "file": file_, "id": asset, "faces": len(faces), "named": len(names), "datable": bool(datable)})
            state_photos[key] = {"asset": asset, "faces": faces}
            people_of_photo[key] = [p["name"] for p in names]
            if datable:
                ages[key] = [{"name": p["name"], "birth": float(p["birth"][:4]) + 0.4, "age": round(max(0.3, photo_year - (float(p["birth"][:4]) + 0.4) + rng.uniform(-3, 3)), 4)} for p in datable]
            records.append({"key": key, "file": file_, "asset": asset, "year": photo_year, "datable": bool(datable), "boxes": boxes, "face_ages": face_ages, "series": s,
                            "album": album, "estimate": None})
            keys.append(key)
        series_list.append({"keys": keys, "year": year})
    # photos without a series (a few single photos, postcards, a document)
    for _ in range(14):
        counter += 1
        file_ = "%s%04d.JPG" % (FILE_PREFIX, counter)
        asset = asset_id(rng)
        key = f"{os.path.splitext(file_)[0]}_{asset[:6]}"
        photos.append({"key": key, "file": file_, "id": asset, "faces": 0, "named": 0, "datable": False})
        state_photos[key] = {"asset": asset, "faces": []}
        people_of_photo[key] = []
        records.append({"key": key, "file": file_, "asset": asset, "year": rng.randint(1900, 1990), "datable": False, "boxes": [], "face_ages": [], "series": None,
                        "album": ALBUMS[3], "estimate": None})
    kinds = {r["key"]: {"kind": k} for r, k in zip([r for r in records if r["series"] is None][:4], ["postcard", "postcard", "greeting_card", "document"])}

    # estimates: datable photos get the median of the single estimates, others none
    for r in records:
        if r["key"] in ages:
            vals = sorted(a["birth"] + a["age"] for a in ages[r["key"]])
            est = vals[len(vals) // 2]
            width = max(2, int(abs(rng.gauss(0, 2))) + 4)
            r["estimate"] = (int(round(est)), int(round(est)) - width, int(round(est)) + width)

    series_docs, work = [], []
    for i, s in enumerate(series_list, 1):
        cohesion = round(rng.uniform(0.62, 0.9), 3)
        by_key = {r["key"]: r for r in records}
        series_docs.append({"id": s["keys"][0], "number": i, "cohesion": cohesion,
                            "photos": [dict({"key": k, "file": by_key[k]["file"]}, **({"year": by_key[k]["estimate"][0]} if by_key[k]["estimate"] else {})) for k in s["keys"]]})
        work.append({"id": "S%03d" % i, "photos": s["keys"], "status": "ok" if i % 3 == 0 else "open", "cohesion": cohesion,
                     "source": "manual" if i % 7 == 0 else "suggestion", "suggested_new": [], "rejected": []})
    corrections = {}
    for r in records[:60]:
        if r["estimate"] and rng.random() < 0.35:
            y = r["year"]
            corrections[r["key"]] = {"year": y, "decimal_year": y + 0.5, "from": y, "to": y, "source": rng.choice(["confirmed", "manual", "draft"])}

    docs = {
        "photos": {"photos": photos},
        "immich_state": {"people": {p["id"]: {"name": p["name"], "birth": p["birth"]} for p in people}, "photos": state_photos},
        "age_per_photo": ages,
        "people": {"people": people_of_photo, "all": sorted(p["name"] for p in people)},
        "series": {"series": series_docs},
        "series_work": {"series": work, "discarded": [], "counters": len(work), "single_ok": False, "merge_hints": [], "merge_rejected": []},
        "corrections": corrections,
        "kinds": kinds,
        "inbox": {"seen": []},
        "changes": {"photos": {}},
        "provenance_albums": {"state": "2026-01-01 12:00", "albums": [
            {"id": "demo-album-%d" % (i + 1), "name": name, "keys": [r["key"] for r in records if r["album"] == name]} for i, name in enumerate(ALBUMS)]},
        "immich_data": {"state": "2026-01-01 12:00", "photos": {}},
    }
    os.makedirs(folder, exist_ok=True)
    for name, doc in docs.items():
        with open(os.path.join(folder, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
    with open(os.path.join(folder, "schaetzung_koerper.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Datei", "Asset-ID", "Schaetzung Jahr", "from", "to", "Hinweis", "Serie", "Einzelschaetzung", "Aktuelles Datum"])
        for r in records:
            if r["estimate"]:
                w.writerow([r["file"], r["asset"], r["estimate"][0], r["estimate"][1], r["estimate"][2], "", "S%03d" % (r["series"] + 1) if r["series"] is not None else "", "", ""])
    if pictures:
        pics = os.path.join(folder, "serien_ausgabe", "fotos")
        os.makedirs(pics, exist_ok=True)
        for r in records:
            draw_photo(os.path.join(pics, r["key"] + ".jpg"), r["key"], random.Random(r["key"]), r["boxes"], r["year"], ages=r["face_ages"])
    return docs


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else "demo_data"
    try:
        import PIL  # noqa: F401
        pictures = True
    except ImportError:
        pictures = False
        print("Pillow is not installed: the data is created without pictures (pip install pillow).")
    docs = build(folder, pictures)
    print("Demo data written to %s: %d people, %d photos, %d series." % (folder, len(docs["immich_state"]["people"]), len(docs["photos"]["photos"]), len(docs["series"]["series"])))


if __name__ == "__main__":
    main()
