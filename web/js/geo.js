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
