"""Find series: which photos from the album probably belong to the same shooting series?

Read only. Changes nothing in Immich. It only makes SUGGESTIONS
that you confirm yourself afterwards.

Two hints are used:
  1. The same person (according to Immich) with similar clothes/posture/background
     (comparison of the body crops).
  2. Almost identical whole images (e.g. the same photo scanned twice).

Addition: your own merges go into the text file 'serien_manuell.txt':
one line per group, keys joined with +, e.g.
    2_6c525d+14_26295f+3_f04070
(keys are shown in the contact sheet and in serien.csv; series numbers change
between runs, keys do not.)
Photos that do NOT belong together you enter in 'serien_getrennt.txt'
(one line per pair, keys separated by |, e.g.  2_6c525d|14_26295f).
If 'schaetzung_koerper.csv' exists, series are also suggested that
might belong together because of the same person and a similar year
(file serien_vorschlaege.csv).

Result:
  serien_ausgabe/serie_001.jpg ...  contact sheet per series (photo keys below)
  serien.csv                        table for confirming

Usage:
    python series.py            -> with the default thresholds
    python series.py 0.80 0.90  -> person threshold, whole-image threshold (higher = stricter)"""
from messages import tx
import csv
import os
import sys
from collections import defaultdict

import cv2
import numpy as np
import torch

import estimate as S
import storage

EMBED_MODEL = "facebook/dinov2-small"
CACHE_FILE = "serien_cache.npz"
OUTPUT = "serien_ausgabe"
CSV_FILE = "serien.csv"
MANUAL_FILE = "serien_manuell.txt"
SEPARATE_FILE = "serien_getrennt.txt"
ESTIMATE_FILE = "schaetzung_koerper.csv"
SUGGESTION_FILE = "serien_vorschlaege.csv"
JSON_FILE = "series.json"          # for the browser interface (datierung_gui.py)
PHOTOS_FILE = "photos.json"          # all album photos (for the interface)
PHOTO_FOLDER = os.path.join(OUTPUT, "fotos")
YEAR_GAP = 3  # series suggestion if the estimated years are that close together
THRESHOLD_PERSON = 0.80   # body crops of the same person
THRESHOLD_ALL = 0.80     # whole photos (measured: from 0.80 on about 92 % of the pairs really belong to the same series)
MAX_GROUP = 8           # larger groups are split more strictly
EDGE = 384              # edge length of the crops for the model

_emb = None


def embedder():
    global _emb
    if _emb is None:
        from transformers import AutoImageProcessor, AutoModel
        print(tx("Loading the image comparison model (a download of about 90 MB the first time) ..."))
        worker = AutoImageProcessor.from_pretrained(EMBED_MODEL)
        mod = AutoModel.from_pretrained(EMBED_MODEL).eval()
        _emb = (worker, mod)
    return _emb


def embed(crop):
    """BGR-Ausschnitt -> normierter Vektor."""
    worker, mod = embedder()
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    with torch.no_grad():
        input_ = worker(images=rgb, return_tensors="pt")
        v = mod(**input_).last_hidden_state[:, 0][0].numpy()
    return v / (np.linalg.norm(v) + 1e-9)


def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            d = np.load(CACHE_FILE)
            return {k: d[k] for k in d.files}
        except (OSError, ValueError):
            pass
    return {}


def save_cache(c):
    np.savez(CACHE_FILE, **c)


def split_up(nodes, edges, threshold, bans=()):
    """Connected components; groups that are too large are split again with a higher threshold."""
    parents = {k: k for k in nodes}

    def find(x):
        while parents[x] != x:
            parents[x] = parents[parents[x]]
            x = parents[x]
        return x

    for a, b, s in edges:
        if s >= threshold:
            parents[find(a)] = find(b)
    groups = defaultdict(list)
    for k in nodes:
        groups[find(k)].append(k)
    result = []
    for g in groups.values():
        if len(g) < 2:
            continue
        part = set(g)
        too_big = len(g) > MAX_GROUP or any(v <= part for v in bans)
        if too_big and threshold < 0.995:
            sub = [(a, b, s) for a, b, s in edges if a in part and b in part]
            result.extend(split_up(g, sub, threshold + 0.02, bans))
        else:
            result.append(sorted(g))
    return result


def read_years():
    """Photo ID -> estimated year from schaetzung_koerper.csv (if present)."""
    years = {}
    if not os.path.exists(ESTIMATE_FILE):
        return years
    with open(ESTIMATE_FILE, encoding="utf-8-sig", newline="") as f:
        for z in csv.DictReader(f, delimiter=";"):
            try:
                years[z["Asset-ID"]] = float(z["Schaetzung Jahr"])
            except (KeyError, ValueError):
                continue
    return years


def write_suggestions(groups, pers, info):
    """Suggest series that might belong together because of the same person + a similar year."""
    years = read_years()
    if not years:
        print(tx("({file} is missing or empty: no merge suggestions.)", file=ESTIMATE_FILE))
        return
    photo_series = {fid: no for no, g in enumerate(groups, 1) for fid in g}
    series_years = {}
    for no, g in enumerate(groups, 1):
        js = sorted(years[f] for f in g if f in years)
        if js:
            series_years[no] = js[len(js) // 2]
    # photos that are in no series do not count as single "series"
    common = defaultdict(set)   # (nrA, nrB) -> Personen
    for pid, d in pers.items():
        nos = sorted({photo_series[f] for f in d if f in photo_series})
        for a in range(len(nos)):
            for b in range(a + 1, len(nos)):
                common[(nos[a], nos[b])].add(pid)
    rows = []
    for (a, b), pids in sorted(common.items()):
        if a in series_years and b in series_years and abs(series_years[a] - series_years[b]) <= YEAR_GAP:
            ka = info[groups[a - 1][0]][0]
            kb = info[groups[b - 1][0]][0]
            rows.append([f"{a:03d}", f"{b:03d}", ka, kb, len(pids),
                           round(series_years[a]), round(series_years[b]), ""])
    with open(SUGGESTION_FILE, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Serie A", "Serie B", "Schluessel A", "Schluessel B",
                    "Gemeinsame Personen", "Jahr A", "Jahr B", "Bestaetigt (ja/nein)"])
        w.writerows(rows)
    print(tx("Merge suggestions: {n} (file {file})", n=len(rows), file=SUGGESTION_FILE))


def main():
    s_person = float(sys.argv[1]) if len(sys.argv) > 1 else THRESHOLD_PERSON
    s_ganz = float(sys.argv[2]) if len(sys.argv) > 2 else THRESHOLD_ALL

    S.URL, S.API_KEY = S.load_settings()
    print(tx("Connecting to {url} ...", url=S.URL))
    people_ = S.load_people()
    photos = S.load_album_photos()
    print(tx("{n} photos in the album.", n=len(photos)))
    os.makedirs(OUTPUT, exist_ok=True)
    os.makedirs(PHOTO_FOLDER, exist_ok=True)
    for n in os.listdir(OUTPUT):
        if n.lower().endswith(".jpg"):
            os.remove(os.path.join(OUTPUT, n))

    cache = load_cache()
    reload = set()            # photos with a changed image (reported by immich_state.py)
    try:
        reload = set((storage.load("reload.json", {}) or {}).get("assets", []))
    except (AttributeError, TypeError):
        pass
    if reload:
        print(tx("{n} photos with a changed image are read again.", n=len(reload)))
    whole = {}                    # foto-id -> Vektor
    pers = defaultdict(dict)     # person-id -> {foto-id: Vektor}
    info = {}                    # photo id -> (key, file)
    thumbnails = {}
    photo_info = {}               # key -> data for the interface

    for i, photo in enumerate(photos, 1):
        if i % 50 == 0:
            print(f"  {i} / {len(photos)}")
        fid = photo["id"]
        file_path = photo.get("originalFileName", "")
        info[fid] = (os.path.splitext(file_path)[0] + "_" + fid[:6], file_path)
        try:
            faces = S.request_("/faces", {"id": fid})
        except S.ApiError as e:
            print(tx("Skipped {name}: {error}", name=file_path, error=e))
            continue
        # already fully computed and preview present? Then do not load the image again.
        thumb = os.path.join(PHOTO_FOLDER, info[fid][0] + ".jpg")
        with_person = [g for g in faces if (g.get("person") or {}).get("id")]
        small = None
        if fid in reload:
            cache.pop(f"g_{fid}", None)
            for g in with_person:
                cache.pop(f"p_{g['id']}", None)
        if (f"g_{fid}" in cache and os.path.exists(thumb)
                and all(f"p_{g['id']}" in cache for g in with_person)):
            small = cv2.imread(thumb)
        image = None
        if small is None:
            try:
                image = S.load_image(fid)
            except S.ApiError as e:
                print(tx("Skipped {name}: {error}", name=file_path, error=e))
                continue
        source_ = image if image is not None else small
        h, w = source_.shape[:2]
        named = [g for g in faces
                   if people_.get((g.get("person") or {}).get("id"), {}).get("name")]
        datable = any(
            people_[(g.get("person") or {}).get("id")].get("birthDate")
            and S.decimal_year_value(people_[(g.get("person") or {}).get("id")]["birthDate"]) is not None
            for g in named
        )
        photo_info[info[fid][0]] = {
            "key": info[fid][0], "file": file_path, "id": fid,
            "faces": len(faces), "named": len(named), "datable": bool(datable),
        }
        f = 160 / max(h, w)
        thumbnails[fid] = cv2.resize(source_, (max(1, int(w * f)), max(1, int(h * f))))
        if image is not None:
            f2 = 1000 / max(h, w)
            cv2.imwrite(thumb, cv2.resize(image, (max(1, int(w * f2)), max(1, int(h * f2)))),
                        [cv2.IMWRITE_JPEG_QUALITY, 82])
        if image is None:  # everything from the cache
            whole[fid] = cache[f"g_{fid}"]
            for g in with_person:
                pers[g["person"]["id"]][fid] = cache[f"p_{g['id']}"]
            continue

        if f"g_{fid}" not in cache:
            cache[f"g_{fid}"] = embed(image)
        whole[fid] = cache[f"g_{fid}"]

        frame = None
        for g in faces:
            pid = (g.get("person") or {}).get("id")
            if not pid:
                continue
            ky = f"p_{g['id']}"
            if ky not in cache:
                try:
                    box = S.box_in_pixeln(g, image)
                except S.FrameError:
                    continue
                if frame is None:
                    frame = S.find_person_frame(image) if S.BODY else []
                x1, y1, x2, y2 = [int(v) for v in box]
                person = S.choose_person((x1, y1, x2, y2), frame) if frame else None
                if person:
                    bx1, by1, bx2, by2 = [int(v) for v in person]
                else:
                    bw, bh = x2 - x1, y2 - y1
                    bx1, bx2 = max(0, x1 - bw), min(w, x2 + bw)
                    by1, by2 = max(0, y1 - bh // 3), min(h, y2 + 4 * bh)
                crop = image[max(0, by1):by2, max(0, bx1):bx2]
                if crop.size == 0:
                    continue
                cache[ky] = embed(crop)
            if ky in cache:
                pers[pid][fid] = cache[ky]
        if i % 50 == 0:
            save_cache(cache)
    save_cache(cache)
    if reload:
        storage.remove("reload.json")

    # cards, documents and other (kind set in Grimmich) belong to no series
    none = {k for k, a in (storage.load("kinds.json", {}) or {}).items() if a and a != "foto"}
    if none:
        except_ = {fid for fid, v in info.items() if v[0] in none}
        for fid in except_:
            whole.pop(fid, None)
        for d in pers.values():
            for fid in except_:
                d.pop(fid, None)
        print(tx("{n} cards/documents are not included in series.", n=len(except_)))

    # Kanten sammeln
    edges = []
    ids = sorted(whole)
    M = np.stack([whole[k] for k in ids]) if ids else np.zeros((0, 1))
    sim = M @ M.T if ids else None
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            if sim[a, b] >= s_ganz:
                edges.append((ids[a], ids[b], float(sim[a, b])))
    n_ganz = len(edges)
    for pid, d in pers.items():
        k = sorted(d)
        for a in range(len(k)):
            for b in range(a + 1, len(k)):
                s = float(d[k[a]] @ d[k[b]])
                if s >= s_person:
                    edges.append((k[a], k[b], s))
    print(tx("Connections found: {n} ({whole} of them through the whole image)", n=len(edges), whole=n_ganz))

    # own merges (key -> photo ID)
    key2id = {v[0]: k for k, v in info.items()}
    if os.path.exists(MANUAL_FILE):
        with open(MANUAL_FILE, encoding="utf-8") as f:
            for entry_row in f:
                entry_row = entry_row.strip()
                if not entry_row or entry_row.startswith("#"):
                    continue
                parts = [t.strip() for t in entry_row.split("+") if t.strip()]
                missing_ones = [t for t in parts if t not in key2id]
                if missing_ones:
                    print(tx("(Note: unknown keys in {file}: {keys})", file=MANUAL_FILE, keys=', '.join(missing_ones)))
                ok = [key2id[t] for t in parts if t in key2id]
                for x in ok[1:]:
                    edges.append((ok[0], x, 1.0))
        print(tx("Own merges from {file} taken into account.", file=MANUAL_FILE))

    # for person edges the person threshold applies, for whole-image edges the whole-image threshold;
    # when splitting groups that are too large, both are raised equally
    bans = []
    if os.path.exists(SEPARATE_FILE):
        with open(SEPARATE_FILE, encoding="utf-8") as f:
            for entry_row in f:
                entry_row = entry_row.strip()
                if not entry_row or entry_row.startswith("#"):
                    continue
                t = [x.strip() for x in entry_row.split("|") if x.strip()]
                if len(t) == 2 and t[0] in key2id and t[1] in key2id:
                    bans.append(frozenset((key2id[t[0]], key2id[t[1]])))
                else:
                    print(tx("(Note: line in {file} not readable or unknown: {line})", file=SEPARATE_FILE, line=entry_row))
        print(tx("Separation rules from {file}: {n}", file=SEPARATE_FILE, n=len(bans)))
    groups = split_up(ids, edges, min(s_person, s_ganz), bans)
    groups.sort(key=lambda g: (-len(g), g[0]))

    # How certain is each series? The highest threshold at which the series still holds together.
    def strength(g):
        part = set(g)
        sub = sorted((s for a, b, s in edges if a in part and b in part), reverse=True)
        parents = {k: k for k in g}

        def fi(x):
            while parents[x] != x:
                parents[x] = parents[parents[x]]
                x = parents[x]
            return x
        comp = len(g)
        for a, b, s in sorted(((a, b, s) for a, b, s in edges if a in part and b in part),
                              key=lambda e: -e[2]):
            if fi(a) != fi(b):
                parents[fi(a)] = fi(b)
                comp -= 1
                if comp == 1:
                    return s
        return 0.0

    strengths = [strength(g) for g in groups]
    weak = sorted(range(len(groups)), key=lambda i: strengths[i])[:12]
    print(tx("Least certain series (check first):"))
    for i in weak:
        print(tx("  Series {nr}: {n} photos, cohesion {strength}", nr=format(i + 1, "03d"), n=len(groups[i]), strength=format(strengths[i], ".2f")))

    rows = []
    for no, g in enumerate(groups, 1):
        head = 24
        cells = []
        for fid in g:
            m = thumbnails.get(fid)
            if m is None:
                continue
            z = np.full((m.shape[0] + head, 170, 3), 255, np.uint8)
            z[head:head + m.shape[0], :m.shape[1]] = m[:, :170]
            cv2.putText(z, info[fid][0][:26], (2, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 1)
            cells.append(z)
            rows.append([f"{no:03d}", info[fid][0], info[fid][1], fid, "", f"{strengths[no - 1]:.2f}"])
        if cells:
            height_ = max(z.shape[0] for z in cells)
            cells = [np.pad(z, ((0, height_ - z.shape[0]), (0, 0), (0, 0)), constant_values=255) for z in cells]
            cv2.imwrite(os.path.join(OUTPUT, f"serie_{no:03d}.jpg"), np.hstack(cells))

    write_suggestions(groups, pers, info)

    years = read_years()
    data_ = {"series": []}
    for no, g in enumerate(groups, 1):
        fl = []
        for fid in g:
            entry = {"key": info[fid][0], "file": info[fid][1]}
            if fid in years:
                entry["year"] = round(years[fid])
            fl.append(entry)
        data_["series"].append({
            "id": "+".join(sorted(e["key"] for e in fl)),
            "number": no,
            "cohesion": round(strengths[no - 1], 3),
            "photos": fl,
        })
    storage.save(JSON_FILE, data_)
    storage.save(PHOTOS_FILE, {"photos": list(photo_info.values())})

    with open(CSV_FILE, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Serie", "Schluessel", "Datei", "Asset-ID", "Bestaetigt (ja/nein)", "Zusammenhalt der Serie"])
        w.writerows(rows)

    print()
    print(tx("=== SUMMARY ==="))
    print(tx("Photos compared:         {n}", n=len(ids)))
    print(tx("Suggested series:        {n}", n=len(groups)))
    print(tx("Photos in series:        {n}", n=sum(len(g) for g in groups)))
    if groups:
        sizes = sorted(len(g) for g in groups)
        print(tx("Series size:             smallest {smallest}, median {median}, largest {largest}", smallest=sizes[0], median=sizes[len(sizes)//2], largest=sizes[-1]))
    print(tx("Contact sheets:           folder {folder}/ (serie_001.jpg ...)", folder=OUTPUT))
    print(tx("Table:                  {file}", file=CSV_FILE))


if __name__ == "__main__":
    main()
