// Provenance: in which album, on which page, as which photo. You set the page breaks yourself.
import {S} from "./state.js";
import {tr} from "./language.js";

// Order of the photos in the album: file names, or your own (dragging in the album view). New photos go to the end.
export function albumKeys(album) {
  const o = S.aRow[album.id];
  if (!o || !o.length) return album.keys;
  const da = new Set(album.keys), first = o.filter((k) => da.has(k)), set = new Set(first);
  return [...first, ...album.keys.filter((k) => !set.has(k))];
}
// Set a new order. The page breaks stay at their position (not at the photo).
export function setAlbumLane(album, fresh) {
  const alt = albumKeys(album), wrapIt = new Set(S.pages[album.id] || []);
  const pos = alt.map((k, i) => (wrapIt.has(k) && i > 0 ? i : -1)).filter((i) => i > 0);
  S.aRow[album.id] = fresh.slice();
  S.pages[album.id] = pos.map((i) => fresh[i]).filter(Boolean);
}
export function pagesFrom(album) {   // -> [{nr, keys}]
  const wraps = new Set(S.pages[album.id] || []), pageList = [];
  let cur = null;
  albumKeys(album).forEach((k) => {
    if (!cur || wraps.has(k)) { cur = {nr: pageList.length + 1, keys: []}; pageList.push(cur); }
    cur.keys.push(k);
  });
  return pageList;
}
export function provenanceOf(key) {   // -> [{album, albumId, seite, nr}]
  return S.albums.filter((a) => a.keys.includes(key)).map((a) => {
    const s = pagesFrom(a).find((x) => x.keys.includes(key));
    return {album: a.name, albumId: a.id, page: s.nr, nr: s.keys.indexOf(key) + 1};
  });
}
export const provenanceText = (h) => `${tr("{album}, page {seite}, photo {nr}", {album: h.album, seite: h.page, nr: h.nr})}`;

// The collective album (the largest) delivers no neighbours: everything lies there without order.
export const collectionAlbum = () => S.albums.reduce((m, a) => (!m || a.keys.length > m.keys.length ? a : m), null);
// Neighbours of a photo in the other albums: [{album, albumId, key, distance, page, nr}], the nearest first.
// `fits(key)` chooses which neighbours come into question (e.g. only photos with a fixed year); `max` is the largest distance in places.
export function albumNeighbors(key, fits, max) {
  const sam = collectionAlbum(), off = [];
  S.albums.forEach((a) => {
    if (a === sam || !a.keys.includes(key)) return;
    const ks = albumKeys(a), i = ks.indexOf(key), pageList = pagesFrom(a);
    ks.forEach((k, j) => {
      if (k === key || Math.abs(j - i) > max || !fits(k)) return;
      const s = pageList.find((x) => x.keys.includes(k));
      off.push({album: a.name, albumId: a.id, key: k, gap: Math.abs(j - i), page: s.nr, nr: s.keys.indexOf(k) + 1, withPages: (S.pages[a.id] || []).length > 0});
    });
  });
  return off.sort((p, q) => p.gap - q.gap);
}
