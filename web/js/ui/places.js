// Places: each photo gets a place from Gramps (coordinates go to Immich later). For series the place applies to all photos by default.
// Suggestions: place of an assigned event, residence of a person on the photo at the matching time, place of the neighbouring photo in the album. Plus a search with a suggestion list.
import {S, ui, draw, mark, savePlaces} from "../state.js";
import {esc} from "../util.js";
import {unitOf, setPlace, placeFrom} from "../model.js";
import {loadGrampsPlaces, grYearDec, grPeriod} from "../gramps.js";
import {albumNeighbors} from "../provenance.js";
import {peopleOn} from "./event.js";
import {tr} from "../language.js";

export const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
const same = (a, b) => (a && a.h) === (b && b.h);
const coordText = (o) => (o && o.lat != null && o.lon != null ? `${Number(o.lat).toFixed(4)}, ${Number(o.lon).toFixed(4)}` : "");

export function suggestions(e, key) {
  const G = S.grPlaces;
  if (!G || !G.byHandle) return [];
  const off = [], da = new Set();
  const add = (h, reasonText) => { const o = G.byHandle[h]; if (h && o && !da.has(h)) { da.add(h); off.push({o, reason: reasonText}); } };
  const pers = [...new Map(e.keys.flatMap(peopleOn).map((p) => [p.id, p])).values()];
  // 1. place of an event assigned to the photo
  const ez = new Map(e.keys.flatMap((k) => S.ez[k] || []).map((z) => [z.id, z]));
  ez.forEach((z) => {
    const st = S.grEv[z.pid], ev = st && st.list && st.list.find((x) => x.id === z.id);
    if (ev && ev.place_h) add(ev.place_h, `${tr("Event “{text}”", {text: z.text})}`);
  });
  // 2. residence of a person on the photo whose time fits the year of the photo
  const yearVal = e.decimal_year || e.year;
  if (yearVal) pers.forEach((p) => {
    const st = S.grEv[p.id];
    ((st && st.list) || []).filter((ev) => ev.kind === "Residence" && ev.place_h).forEach((ev) => {
      const fromVal = grYearDec(ev.date.from), bis = grPeriod(ev) ? grYearDec(ev.date.to) + (ev.date.to[1] ? 0 : 1) : fromVal;
      if (grPeriod(ev) ? yearVal >= fromVal - 1 && yearVal <= bis + 1 : Math.abs(yearVal - fromVal) <= 3) add(ev.place_h, `${tr("Residence of {s}", {s: p.name.split(/\s+/)[0]})}`);
    });
  });
  // 3. the next photo in the album that already has a place
  const nb = albumNeighbors(key, (k2) => { const o = placeFrom(k2); return !!(o && o.h); }, 3)[0];
  if (nb) add(placeFrom(nb.key).h, `${tr("Neighbor photo in the album ({entfernt})", {entfernt: nb.gap === 1 ? tr("right next to it") : tr("{n} places away", {n: nb.gap})})}`);
  return off;
}

export function placeArea(e, key) {
  const head = '<div class="field-name">' + tr("Place") + '</div>';
  if (!S.grPlaces) { setTimeout(() => loadGrampsPlaces(false), 0); return `<div>${head}<div class="quiet">${tr("Loading places from Gramps …")}</div></div>`; }
  if (S.grPlaces.errors) return `<div>${head}<div class="quiet">${tr("Places from Gramps not available: {fehler}", {fehler: esc(S.grPlaces.errors)})} <a href="#" class="link" data-a="place-new">${tr("Try again")}</a></div></div>`;
  const nowVal = placeFrom(key), seriesVal = e.keys.length > 1;
  const deviating = e.keys.filter((k) => !same(placeFrom(k), nowVal)).length;
  let content = "";
  if (nowVal) {
    content += `<div class="place-row"><span><b>${esc(nowVal.name)}</b><br><span class="quiet">${nowVal.lat != null ? esc(coordText(nowVal)) : ""} ${nowVal.source ? "· " + esc(nowVal.source) : ""}</span></span>
      <button class="small" data-a="place-remove" data-uid="${esc(e.uid)}" data-key="${esc(key)}" title="${seriesVal && !ui.placeOnly ? tr("Remove place from all photos of the series") : tr("Remove place")}">✕</button></div>`;
    if (nowVal.lat == null) content += '<div class="box warn" style="margin-top:6px">' + tr("In Gramps this place has no coordinates. It is therefore not written to Immich. Add them in Gramps and reload the place list.") + '</div>';
  } else content += '<div class="quiet">' + tr("No place yet.") + '</div>';
  if (seriesVal && deviating) content += `<div class="quiet" style="font-size:12px;margin-top:4px">${tr("{abweichend} of {n} {n:photo|photos} in the series have a different place or none. {button}", {abweichend: deviating, n: e.keys.length, button: nowVal ? `<button class="small" data-a="place-all" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("Apply to all photos in the series")}</button>` : ""})}</div>`;
  const v = suggestions(e, key).filter((x) => !nowVal || x.o.h !== nowVal.h);
  ui.placeSuggestions = v;
  if (v.length) content += '<div class="quiet" style="margin-top:6px">' + tr("Suggestions:") + '</div>' + v.map((x, i) => `<div class="ez-row"><button class="small" data-a="place-prefill" data-i="${i}" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("Take over")}</button>
    <span><b>${esc(x.o.t)}</b> <span class="quiet">${esc(x.reason)}${x.o.lat == null ? tr(" · without coordinates") : ""}</span></span></div>`).join("");
  content += `<div style="margin-top:8px"><input type="text" id="place-search" data-uid="${esc(e.uid)}" data-key="${esc(key)}" placeholder="${tr("Search place: type name or Gramps number")}" autocomplete="off" style="width:100%;box-sizing:border-box">
    <div id="place-hits" class="place-list"></div>
    ${seriesVal ? `<label class="quiet" style="font-size:12px;display:block;margin-top:4px"><input type="checkbox" data-a="place-only" ${ui.placeOnly ? "checked" : ""}> ${tr("only for this photo (otherwise the place applies to the whole series)")}</label>` : ""}
    <div class="quiet" style="font-size:12px;margin-top:4px">${tr("{n} {n:place|places} from Gramps{Koordinaten}.", {n: S.grPlaces.list.length, Koordinaten: S.grPlaces.without ? `${tr(", {ohne} of them without coordinates", {ohne: S.grPlaces.without})}` : ""})} <a href="#" class="link" data-a="place-new">${tr("Reload")}</a></div></div>`;
  return `<div>${head}${content}</div>`;
}

// ---- assigning: for a series by default for all photos, with “only for this photo” for one
async function assignTo(uid, key, o, reasonText, everyone) {
  const e = unitOf(uid);
  if (!e) return;
  const keys = everyone || !ui.placeOnly || e.keys.length < 2 ? e.keys : [key];
  setPlace(keys, o ? {h: o.h, id: o.id, name: o.t, lat: o.lat, lon: o.lon, source: reasonText} : null);
  await savePlaces(); draw();
}

// suggestion list while typing (without redrawing the page, so the input field keeps its focus)
document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (!t || t.id !== "place-search") return;
  const box = document.getElementById("place-hits"), q = norm(t.value).split(/\s+/).filter(Boolean);
  if (!q.length || !S.grPlaces) { box.innerHTML = ""; return; }
  const hitList = S.grPlaces.list.filter((o) => { const s = norm(o.t + " " + o.id); return q.every((w) => s.includes(w)); })
    .sort((a, b) => (norm(a.n).startsWith(q[0]) ? 0 : 1) - (norm(b.n).startsWith(q[0]) ? 0 : 1) || a.t.length - b.t.length).slice(0, 8);
  box.innerHTML = hitList.length ? hitList.map((o) => `<div class="place-pick" data-a="place-pick" data-h="${esc(o.h)}" data-uid="${esc(t.dataset.uid)}" data-key="${esc(t.dataset.key)}"><b>${esc(o.n)}</b> <span class="quiet">${esc(o.t.slice(o.n.length).replace(/^,\s*/, ""))} · ${esc(o.id)}${o.lat == null ? tr(" · without coordinates") : ""}</span></div>`).join("")
    : '<div class="quiet" style="padding:4px 8px">' + tr("No place found.") + '</div>';
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target && ev.target.id === "place-search") { const z = document.querySelector("#place-hits .place-pick"); if (z) z.click(); }
});

export const actions = {
  "place-pick": (el) => assignTo(el.dataset.uid, el.dataset.key, S.grPlaces.byHandle[el.dataset.h], tr("chosen by hand")),
  "place-prefill": (el) => { const x = (ui.placeSuggestions || [])[+el.dataset.i]; if (x) return assignTo(el.dataset.uid, el.dataset.key, x.o, x.reason); },
  "place-remove": (el) => assignTo(el.dataset.uid, el.dataset.key, null),
  "place-all": (el) => { const o = placeFrom(el.dataset.key); if (o) return assignTo(el.dataset.uid, el.dataset.key, S.grPlaces.byHandle[o.h] || {h: o.h, id: o.id, t: o.name, lat: o.lat, lon: o.lon}, o.source, true); },
  "place-only": (el) => { ui.placeOnly = el.checked; draw(); },
  "place-new": () => { S.grPlaces = null; return loadGrampsPlaces(true); },
};
