"""Provenance of the photos: in which Immich albums does a photo lie? (read only)

Reads all albums except the working album "Scan-Datierung" and writes
provenance_albums.json. You set the pages within an album in Grimmich yourself
(file provenance.json). Changes nothing in Immich.   Usage:  python provenance.py
"""
from messages import tx
import os
import re
import sys
import storage
import addresses
from immich import Immich
from datetime import datetime

ENV_FILE = "immich.env"
WORK_ALBUM = "Scan-Datierung"
ANCHOR_ALBUM = ""
OUTPUT = "provenance_albums.json"


def read_env():
    if not os.path.exists(ENV_FILE):
        sys.exit(tx("The file {file} is missing.", file=ENV_FILE))
    w = {}
    with open(ENV_FILE, encoding="utf-8") as f:
        for z in f:
            z = z.strip()
            if z and not z.startswith("#") and "=" in z:
                k, v = z.split("=", 1)
                w[k.strip()] = v.strip()
    global WORK_ALBUM, ANCHOR_ALBUM
    WORK_ALBUM = w.get("IMMICH_ALBUM") or WORK_ALBUM
    ANCHOR_ALBUM = w.get("IMMICH_ANCHOR_ALBUM", "")
    return addresses.url(w, "immich"), w["IMMICH_API_KEY"]


def natural(text):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", text)]


def main():
    url, key = read_env()

    def api(path_, data_=None):
        return Immich(url, key, timeout=30).request_(None, path_, data_=data_)

    try:
        known_ = {x["key"] for x in storage.load("photos.json", {"photos": []})["photos"]}
    except (KeyError, TypeError):
        known_ = set()
    albums = [a for a in api("/albums") if a.get("albumName") and a["albumName"] != WORK_ALBUM and a["albumName"] != ANCHOR_ALBUM]
    print(tx("{n} albums found (without {work}).", n=len(albums), work=WORK_ALBUM))
    output = []
    for a in albums:
        entries, page = [], 1
        while True:
            response = api("/search/metadata", {"albumIds": [a["id"]], "page": page, "size": 500})["assets"]
            for x in response["items"]:
                name = x.get("originalFileName", "foto")
                entries.append((name, os.path.splitext(name)[0] + "_" + x["id"][:6]))
            if not response.get("nextPage"):
                break
            page = int(response["nextPage"])
        entries.sort(key=lambda e: natural(e[0]))
        keys = [k for _, k in entries if k in known_]
        print(tx("  {album}: {n} photos, {k} of them in the dating album", album=a['albumName'], n=len(entries), k=len(keys)))
        if keys:
            output.append({"id": a["id"], "name": a["albumName"], "keys": keys})
    output.sort(key=lambda a: natural(a["name"]))
    storage.save(OUTPUT, {"state": datetime.now().strftime("%Y-%m-%d %H:%M"), "albums": output})
    print(tx("Done."))


if __name__ == "__main__":
    main()
