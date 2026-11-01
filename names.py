"""Fetch the names of the people per photo from Immich (read only).

Writes 'people.json' for the interface so you can search by name there.
Changes nothing in Immich.   Usage:  python names.py
"""
from messages import tx
import os
from collections import Counter

import estimate as S
import storage


def main():
    S.URL, S.API_KEY = S.load_settings()
    print(tx("Connecting to {url} ...", url=S.URL))
    people_ = S.load_people()
    photos = S.load_album_photos()
    print(tx("{n} photos in the album '{album}'. Reading people ...", n=len(photos), album=S.ALBUM_NAME))
    per_photo = {}
    counters = Counter()
    for i, photo in enumerate(photos, 1):
        if i % 100 == 0:
            print(f"  {i} / {len(photos)}")
        try:
            faces = S.request_("/faces", {"id": photo["id"]})
        except S.ApiError as e:
            print(tx("Skipped {name}: {error}", name=photo.get('originalFileName', ''), error=e))
            continue
        name_list = sorted({people_[g["person"]["id"]]["name"] for g in faces
                        if (g.get("person") or {}).get("id") in people_
                        and people_[g["person"]["id"]]["name"]})
        key = os.path.splitext(photo.get("originalFileName", "foto"))[0] + "_" + photo["id"][:6]
        per_photo[key] = name_list
        counters.update(name_list)
    data_ = {"people": per_photo, "all": [n for n, _ in counters.most_common()]}
    storage.save("people.json", data_)
    print(tx("Done: {people} people on {photos} photos. File people.json", people=len(counters), photos=sum(1 for v in per_photo.values() if v)))


if __name__ == "__main__":
    main()
