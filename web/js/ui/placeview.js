// The menu entry “Places”: places that photos have been assigned to, and the photos of one place.
import {S, ui} from "../state.js";
import {esc} from "../util.js";
import {unitFromKey} from "../model.js";
import {tileGrid} from "./tile.js";
import {keysWithPlaceAnswers} from "../refine.js";
import {geoOf, geoId, geoMapped, geoText, geoOpen, geoConflicts, nearestGramps, kmText} from "../geo.js";
import {tr} from "../language.js";

export function placeState() {
  const m = new Map(), add = (id, name, key, extra) => { const x = m.get(id) || {id, name, keys: [], ...extra}; x.keys.push(key); m.set(id, x); };
  Object.entries(S.places || {}).forEach(([key, p]) => {
    if (!p || !S.photos[key]) return;
    const id = String(p.id || p.h || p.name || ""); if (id) add(id, p.name || id, key);
  });
  // places from Immich: equated with a Gramps place, or on their own (grouped by identical coordinates)
  Object.keys(S.geo || {}).forEach((key) => {
    if (!S.photos[key] || (S.places && S.places[key])) return;
    const g = geoOf(key), mp = geoMapped(g);
    if (mp) add(String(mp.id || mp.h || mp.name), mp.name, key);
    else add("geo:" + geoId(g), geoText(g), key, {immich: true});
  });
  return [...m.values()].map((x) => ({...x, unitList: [...new Set(x.keys.map((k) => unitFromKey(k)).filter(Boolean))]}))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
export function placeList() {
  const l = placeState(), sug = keysWithPlaceAnswers().length;
  const game = sug ? `<button class="row ${ui.view === "place" && ui.placeId === "__game" ? "active" : ""}" data-a="go-place" data-id="__game"><div class="top"><b>🎮 ${tr("Place suggestions from the game")}</b><span>${tr("{n} {n:photo|photos}", {n: sug})}</span></div></button>` : "";
  const open = geoOpen().length, conf = geoConflicts().length;
  const geoRows = (open ? `<button class="row ${ui.view === "place" && ui.placeId === "__geo" ? "active" : ""}" data-a="go-place" data-id="__geo"><div class="top"><b>🔗 ${tr("Match with Gramps")}</b><span>${tr("{n} {n:place|places}", {n: open})}</span></div></button>` : "")
    + (conf ? `<button class="row ${ui.view === "place" && ui.placeId === "__conflict" ? "active" : ""}" data-a="go-place" data-id="__conflict"><div class="top"><b>⚠ ${tr("Places differ")}</b><span>${tr("{n} {n:photo|photos}", {n: conf})}</span></div></button>` : "");
  if (!l.length) return geoRows + game || `<div class="quiet" style="padding:6px 10px">${tr("No places assigned yet.")}</div>`;
  return geoRows + game + l.map((x) => `<button class="row ${ui.view === "place" && ui.placeId === x.id ? "active" : ""}" data-a="go-place" data-id="${esc(x.id)}">
    <div class="top"><b>${x.immich ? "📍 " : ""}${esc(x.name)}</b><span>${tr("{n} {n:photo|photos}", {n: x.keys.length})}</span></div></button>`).join("");
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
  const x = placeState().find((y) => y.id === ui.placeId);
  if (!x) return '<div class="empty">' + tr("Select a place on the left.") + '</div>';
  return `<div class="person-head"><div><h1>${esc(x.name)}</h1><div class="quiet">${tr("{n} {n:photo|photos}", {n: x.keys.length})}${x.immich ? " · " + tr("place from Immich") : ""}</div></div>${x.immich ? `<div>${placeButtons(x)}</div>` : ""}</div>
    ${tileGrid(x.unitList.slice().sort((a, b) => (a.decimal_year || a.year || 0) - (b.decimal_year || b.year || 0)))}`;
}
