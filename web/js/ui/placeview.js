// The menu entry “Places”: places that photos have been assigned to, and the photos of one place.
import {S, ui} from "../state.js";
import {esc} from "../util.js";
import {unitFromKey} from "../model.js";
import {tileGrid} from "./tile.js";
import {tr} from "../language.js";

export function placeState() {
  const m = new Map();
  Object.entries(S.places || {}).forEach(([key, p]) => {
    if (!p || !S.photos[key]) return;
    const id = String(p.id || p.h || p.name || ""); if (!id) return;
    const x = m.get(id) || {id, name: p.name || id, keys: []};
    x.keys.push(key); m.set(id, x);
  });
  return [...m.values()].map((x) => ({...x, unitList: [...new Set(x.keys.map((k) => unitFromKey(k)).filter(Boolean))]}))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
export function placeList() {
  const l = placeState();
  if (!l.length) return `<div class="quiet" style="padding:6px 10px">${tr("No places assigned yet.")}</div>`;
  return l.map((x) => `<button class="row ${ui.view === "place" && ui.placeId === x.id ? "active" : ""}" data-a="go-place" data-id="${esc(x.id)}">
    <div class="top"><b>${esc(x.name)}</b><span>${tr("{n} {n:photo|photos}", {n: x.unitList.length})}</span></div></button>`).join("");
}
export function placeHtml() {
  const x = placeState().find((y) => y.id === ui.placeId);
  if (!x) return '<div class="empty">' + tr("Select a place on the left.") + '</div>';
  return `<div class="person-head"><div><h1>${esc(x.name)}</h1><div class="quiet">${tr("{n} {n:photo|photos}", {n: x.unitList.length})}</div></div></div>
    ${tileGrid(x.unitList.slice().sort((a, b) => (a.decimal_year || a.year || 0) - (b.decimal_year || b.year || 0)))}`;
}
