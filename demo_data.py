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


def draw_photo(path_, key, rng, boxes, year, size=(640, 480)):
    """A simple drawing: sepia background, head and shoulder shapes where the faces are."""
    from PIL import Image, ImageDraw, ImageFont
    w, h = size
    tone = rng.randint(-12, 12)
    img = Image.new("RGB", size, (214 + tone, 196 + tone, 160 + tone))
    d = ImageDraw.Draw(img)
    for y in range(h):   # soft gradient
        shade = int(30 * y / h)
        d.line([(0, y), (w, y)], fill=(214 + tone - shade, 196 + tone - shade, 160 + tone - shade))
    d.rectangle([8, 8, w - 9, h - 9], outline=(120, 100, 70), width=3)
    for (x1, y1, x2, y2) in boxes:
        cx, cy, r = (x1 + x2) // 2, (y1 + y2) // 2, (x2 - x1) // 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(205, 170, 140), outline=(90, 70, 50), width=2)
        d.ellipse([cx - r // 2 - r // 4, cy - r // 4, cx - r // 2 + r // 6, cy], fill=(70, 50, 40))
        d.ellipse([cx + r // 3, cy - r // 4, cx + r // 3 + r // 4, cy], fill=(70, 50, 40))
        d.pieslice([cx - r * 2, y2 + r // 4, cx + r * 2, y2 + r * 4], 180, 360, fill=(110 + rng.randint(0, 50), 100, 90), outline=(70, 55, 45))
    try:
        font = ImageFont.load_default()
    except OSError:
        font = None
    d.text((18, h - 28), f"demo {key} ~{year}", fill=(90, 70, 50), font=font)
    img.save(path_, "JPEG", quality=82)


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
            faces, boxes, names = [], [], []
            for i, p in enumerate(present):
                r = rng.randint(28, 46)
                cx = int((i + 1) * size[0] / (len(present) + 1))
                cy = rng.randint(150, 230)
                box = [cx - r, cy - r, cx + r, cy + r]
                boxes.append(tuple(box))
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
            records.append({"key": key, "file": file_, "asset": asset, "year": photo_year, "datable": bool(datable), "boxes": boxes, "series": s,
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
        records.append({"key": key, "file": file_, "asset": asset, "year": rng.randint(1900, 1990), "datable": False, "boxes": [], "series": None,
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
            draw_photo(os.path.join(pics, r["key"] + ".jpg"), r["key"], random.Random(r["key"]), r["boxes"], r["year"])
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
