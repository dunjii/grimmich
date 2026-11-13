// The menu entry “Places”: places that photos have been assigned to, and the photos of one place.
import {S, ui, draw} from "../state.js";
import {esc} from "../util.js";
import {unitFromKey} from "../model.js";
import {tileGrid} from "./tile.js";
import {keysWithPlaceAnswers} from "../refine.js";
import {geoOf, geoId, geoMapped, geoText, geoOpen, geoConflicts, nearestGramps, kmText} from "../geo.js";
import {tr} from "../language.js";
import {createMap} from "../map.js";
import {openPlacePicker} from "./placepicker.js";

export function placeState() {
  const m = new Map(), add = (id, name, key, extra) => { const x = m.get(id) || {id, name, keys: [], ...extra}; x.keys.push(key); m.set(id, x); };
  Object.entries(S.places || {}).forEach(([key, p]) => {
    if (!p || !S.photos[key]) return;
    const id = String(p.id || p.h || p.name || ""); if (id) add(id, p.name || id, key, p.lat != null && p.lon != null ? {lat: +p.lat, lon: +p.lon} : {});
  });
  // places from Immich: equated with a Gramps place, or on their own (grouped by identical coordinates)
  Object.keys(S.geo || {}).forEach((key) => {
    if (!S.photos[key] || (S.places && S.places[key])) return;
    const g = geoOf(key), mp = geoMapped(g);
    if (mp) add(String(mp.id || mp.h || mp.name), mp.name, key, mp.lat != null && mp.lon != null ? {lat: +mp.lat, lon: +mp.lon} : {lat: g.lat, lon: g.lon});
    else add("geo:" + geoId(g), geoText(g), key, {immich: true, lat: g.lat, lon: g.lon});
  });
  return [...m.values()].map((x) => ({...x, unitList: [...new Set(x.keys.map((k) => unitFromKey(k)).filter(Boolean))]}))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
const placeRow = (x) => `<button class="row ${ui.view === "place" && ui.placeId === x.id ? "active" : ""}" data-a="go-place" data-id="${esc(x.id)}">
    <div class="top"><b>${x.immich ? "📍 " : ""}${esc(x.name)}</b><span>${tr("{n} {n:photo|photos}", {n: x.keys.length})}</span></div></button>`;
const placeRows = () => {
  const q = String(ui.placeQ || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), l = placeState();
  const hit = q ? l.filter((x) => x.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)) : l;
  return hit.map(placeRow).join("") || `<div class="quiet" style="padding:6px 10px">${tr("No places assigned yet.")}</div>`;
};
const withoutCoords = () => placeState().filter((x) => x.lat == null);
export function placeList() {
  const sug = keysWithPlaceAnswers().length, open = geoOpen().length, conf = geoConflicts().length, nc = withoutCoords().length;
  const task = (id, icon, text, n, what) => (n ? `<button class="row ${ui.view === "place" && ui.placeId === id ? "active" : ""}" data-a="go-place" data-id="${id}"><div class="top"><b>${icon} ${text}</b><span>${what}</span></div></button>` : "");
  const tasks = task("__geo", "🔗", tr("Match with Gramps"), open, tr("{n} {n:place|places}", {n: open}))
    + task("__conflict", "⚠", tr("Places differ"), conf, tr("{n} {n:photo|photos}", {n: conf}))
    + task("__game", "🎮", tr("Place suggestions from the game"), sug, tr("{n} {n:photo|photos}", {n: sug}))
    + task("__nocoord", "📌", tr("Without coordinates"), nc, tr("{n} {n:place|places}", {n: nc}));
  return `<button class="row ${ui.view === "place" && !ui.placeId ? "active" : ""}" data-a="go-place" data-id=""><div class="top"><b>🗺 ${tr("Map")}</b><span>${placePoints().length}</span></div></button>
    ${tasks ? `<div class="group">${tr("To do")}</div>${tasks}` : ""}
    <div class="group">${tr("Places")}</div>
    <div style="padding:2px 10px 6px"><input type="text" id="ort-q" value="${esc(ui.placeQ || "")}" placeholder="${esc(tr("Search place"))}" autocomplete="off" style="width:100%"></div>
    <div id="ort-rows">${placeRows()}</div>`;
}
document.addEventListener("input", (ev) => {
  if (!ev.target || ev.target.id !== "ort-q") return;
  ui.placeQ = ev.target.value; const box = document.getElementById("ort-rows"); if (box) box.innerHTML = placeRows();
});

// ---- the map: one point per place (with the number of photos), points close together become one circle
let mapView = null, mapObj = null;
export const placePoints = () => placeState().filter((x) => x.lat != null).map((x) => ({id: x.id, lat: x.lat, lon: x.lon, n: x.keys.length, title: x.name}));
export const setPlaceView = (lat, lon) => { mapView = {lat, lon, zoom: Math.max(15, mapView ? mapView.zoom : 0)}; };
export function placeMapInit() {
  if (mapObj) { try { mapObj.destroy(); } catch (e) { /* alte Karte ist schon weg */ } mapObj = null; }
  const box = document.getElementById("orte-map");
  if (!box) return;
  const pts = placePoints(), v = mapView;
  mapObj = createMap(box, {lat: v ? v.lat : 51.0, lon: v ? v.lon : 10.4, zoom: v ? v.zoom : 5, pickable: false, onView: (x) => { mapView = x; }});
  mapObj.setMarks(pts.map((p) => ({...p, sel: p.id === ui.placeId})), (m) => {
    Object.assign(ui, {view: "place", menu: null, placeId: m.id, focusKey: null, photoKey: null}); draw();
  });
  if (!v) mapObj.fit(pts);
}
const placeButtons = (x) => `<button class="small primary" data-a="geo-pick" data-id="${esc(x.id)}">${tr("Equate with Gramps place …")}</button>`;
export function placeHtml() {
  if (ui.placeId === "__conflict") {
    const units = [...new Set(geoConflicts().map((k) => unitFromKey(k)).filter(Boolean))];
    return `<div class="person-head"><div><h1>${tr("Places differ")}</h1><div class="quiet">${tr("The place in Grimmich and the place in Immich are more than 300 m apart. Open a photo and decide which one counts.")}</div></div></div>${tileGrid(units)}`;
  }
  if (ui.placeId === "__geo") {
    const rows = geoOpen().sort((a, b) => b.keys.length - a.keys.length).map((x) => {
      const n = nearestGramps(x.g);
      return `<div class="ez-row" style="align-items:center"><span style="flex:1"><b>${esc(geoText(x.g))}</b> <span class="quiet">${tr("{n} {n:photo|photos}", {n: x.keys.length})} · ${x.g.lat.toFixed(4)} / ${x.g.lon.toFixed(4)}</span><br>
        ${n ? `<span class="quiet">${tr("Next Gramps place:")}</span> ${esc(n.o.t)} <span class="quiet">(${kmText(n.km)})</span>` : `<span class="quiet">${tr("No Gramps place with coordinates found.")}</span>`}</span>
        ${n ? `<button class="small good" data-a="geo-equate" data-id="${esc(x.id)}">${tr("Equate")}</button>` : ""}<button class="small" data-a="geo-pick" data-id="${esc(x.id)}">${tr("Other place …")}</button></div>`;
    }).join("");
    return `<div class="person-head"><div><h1>${tr("Match with Gramps")}</h1><div class="quiet">${tr("Places that Immich has for your photos and that are not equated with a Gramps place yet. A place you leave alone stays as it is in Immich.")}</div></div></div>
      ${S.grPlaces && S.grPlaces.list ? "" : `<div class="box warn">${tr("Places from Gramps are not loaded yet.")} <button class="small" data-a="geo-load">${tr("Load")}</button></div>`}
      <div style="padding:8px 14px">${rows || `<div class="quiet">${tr("All places are matched.")}</div>`}</div>`;
  }
  if (ui.placeId === "__game") {
    const units = [...new Set(keysWithPlaceAnswers().map((k) => unitFromKey(k)).filter(Boolean))];
    return `<div class="person-head"><div><h1>${tr("Place suggestions from the game")}</h1><div class="quiet">${tr("Photos without a place that players have given a place for. Open a photo to take over a suggestion.")}</div></div></div>${tileGrid(units)}`;
  }
  if (ui.placeId === "__nocoord") {
    const rows = withoutCoords().map((x) => `<div class="ez-row" style="align-items:center"><span style="flex:1"><b>${esc(x.name)}</b> <span class="quiet">${tr("{n} {n:photo|photos}", {n: x.keys.length})}</span></span>
      <button class="small" data-a="place-edit" data-id="${esc(x.id)}">${tr("Set on map …")}</button> <button class="small" data-a="go-place" data-id="${esc(x.id)}">${tr("Show photos")}</button></div>`).join("");
    return `<div class="person-head"><div><h1>${tr("Without coordinates")}</h1><div class="quiet">${tr("These places have no point on the map yet. Set them on the map to see them there.")}</div></div></div><div style="padding:8px 14px">${rows || `<div class="quiet">${tr("All places have coordinates.")}</div>`}</div>`;
  }
  const x = ui.placeId ? placeState().find((y) => y.id === ui.placeId) : null;
  const total = placeState().reduce((n, y) => n + y.keys.length, 0), pts = placePoints();
  const head = x
    ? `<div class="person-head"><div><h1>${esc(x.name)}</h1><div class="quiet">${tr("{n} {n:photo|photos}", {n: x.keys.length})}${x.immich ? " · " + tr("place from Immich") : ""}${x.lat == null ? " · " + tr("no coordinates") : ""}</div></div>
        <div>${x.immich ? placeButtons(x) + " " : ""}<button class="small" data-a="place-edit" data-id="${esc(x.id)}">${x.lat == null ? tr("Set on map …") : tr("Edit …")}</button></div></div>`
    : `<div class="person-head"><div><h1>${tr("Places")}</h1><div class="quiet">${pts.length ? tr("{n} {n:photo|photos} at {p} {p:point|points}. Click a point to see its photos.", {n: total, p: pts.length}) : tr("No place with coordinates yet.")}</div></div></div>`;
  const grid = x ? tileGrid(x.unitList.slice().sort((a, b) => (a.decimal_year || a.year || 0) - (b.decimal_year || b.year || 0))) : "";
  return `${head}<div id="orte-map" class="orte-karte"></div><div style="margin-top:10px">${grid}</div>`;
}

export const actions = {
  "place-edit": (el) => {
    const x = placeState().find((y) => y.id === el.dataset.id);
    if (x) openPlacePicker({keys: x.keys, title: x.name, text: x.immich ? "" : x.name});
  },
};
