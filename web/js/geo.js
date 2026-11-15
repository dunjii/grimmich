// Places that Immich has for the photos (coordinates). Photos with identical coordinates share one place.
// You can equate such a place with a Gramps place; the equation is kept in S.ord._geo and applies to all photos with these coordinates.
import {S} from "./state.js";
import {tr} from "./language.js";

export const geoOf = (key) => (S.geo && S.geo[key]) || null;
export const geoId = (g) => g.lat.toFixed(4) + "," + g.lon.toFixed(4);
export const geoMap = () => (S.ord && S.ord._geo) || {};
export const geoMapped = (g) => geoMap()[geoId(g)] || null;
export const geoText = (g) => { const m = geoMapped(g); return m ? m.name : g.t || `${g.lat.toFixed(4)} / ${g.lon.toFixed(4)}`; };

export function distKm(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// The next Gramps place with coordinates: {o, km} or null
export function nearestGramps(g) {
  const list = (S.grPlaces && S.grPlaces.list) || [];
  let best = null;
  list.forEach((o) => {
    if (o.lat == null || o.lon == null) return;
    const km = distKm(g, {lat: +o.lat, lon: +o.lon});
    if (!best || km < best.km) best = {o, km};
  });
  return best;
}
// All different Immich places of the photos in Grimmich: [{id, g, keys, mapped}]
export function geoGroups() {
  const m = new Map();
  Object.entries(S.geo || {}).forEach(([key, g]) => {
    if (!S.photos[key]) return;
    const id = geoId(g), x = m.get(id) || {id, g, keys: [], mapped: geoMapped(g)};
    x.keys.push(key); m.set(id, x);
  });
  return [...m.values()];
}
export const geoOpen = () => geoGroups().filter((x) => !x.mapped);
// Grimmich place and Immich place of a photo differ (more than 300 m) and you have not decided yet
export function geoConflict(key) {
  const p = S.places && S.places[key], g = geoOf(key);
  if (!p || !g || p.lat == null || p.lon == null) return false;
  if (S.ord && S.ord._geoOk && S.ord._geoOk[key]) return false;
  return distKm(g, {lat: +p.lat, lon: +p.lon}) > 0.3;
}
export const geoConflicts = () => Object.keys(S.geo || {}).filter((k) => S.photos[k] && geoConflict(k));
export const kmText = (km) => (km < 1 ? tr("{m} m", {m: Math.round(km * 1000)}) : tr("{km} km", {km: km.toFixed(1)}));

// Coordinates typed or pasted by the user: 51°04'30.8"N 11°20'40.4"E, 51°04.513'N 11°20.673'E, 51.0752, 11.3446 (also with a decimal comma). → {lat, lon} or null
export function parseCoords(text) {
  let t = String(text || "").trim().replace(/[′’´‘]/g, "'").replace(/[″”“]|''/g, '"').replace(/[º˚]/g, "°");
  if (!t) return null;
  if (/^[NSEOWnseow]\s*\d/.test(t)) t = t.replace(/([NSEOWnseow])\s*(\d[^NSEOWnseow]*)/g, (a, h, rest) => rest.trim() + h + " ");   // letter in front: N 51° 4' 30.8" O 11° …
  const num = "(\\d+(?:[.,]\\d+)?)", f = (x) => parseFloat(String(x).replace(",", "."));
  const part = new RegExp(`${num}\\s*°\\s*(?:${num}\\s*'\\s*)?(?:${num}\\s*"\\s*)?([NSEOWnseow])?|${num}\\s*°?\\s*([NSEOWnseow])(?![a-zA-Z])`, "g");
  const found = [...t.matchAll(part)];
  let two = null;
  if (found.length === 2 && t.replace(part, "").replace(/[\s,;]/g, "") === "") {
    two = found.map((m) => {
      const hasDeg = m[1] !== undefined, deg = hasDeg ? f(m[1]) : f(m[5]), min = hasDeg && m[2] !== undefined ? f(m[2]) : 0, sec = hasDeg && m[3] !== undefined ? f(m[3]) : 0;
      const h = (hasDeg ? m[4] : m[6]) || "";
      let v = deg + min / 60 + sec / 3600;
      if (/[SsWw]/.test(h)) v = -v;
      return {v, h: h.toUpperCase()};
    });
    // order: with letters N/S before E/O/W or the other way round; without letters latitude first
    const isLon = (x) => /[EOW]/.test(x.h), isLat = (x) => /[NS]/.test(x.h);
    if (isLon(two[0]) || isLat(two[1])) two.reverse();
    if (isLat(two[1]) || isLon(two[0])) return null;
    two = [two[0].v, two[1].v];
  } else if (!found.length) {
    let m = t.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/) || t.match(/^(-?\d+(?:[.,]\d+)?)\s*;\s*(-?\d+(?:[.,]\d+)?)$/) || t.match(/^(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)$/);
    if (m) two = [f(m[1]), f(m[2])];
  }
  if (!two || two.some((x) => !isFinite(x)) || Math.abs(two[0]) > 90 || Math.abs(two[1]) > 180) return null;
  return {lat: two[0], lon: two[1]};
}
