// Places: each photo gets a place from Gramps (coordinates go to Immich later). For series the place applies to all photos by default.
// Suggestions: place of an assigned event, residence of a person on the photo at the matching time, place of the neighbouring photo in the album. Plus a search with a suggestion list.
import {S, ui, draw, mark, savePlaces, saveOrd} from "../state.js";
import {esc, toast} from "../util.js";
import {modal, closeIt} from "./dialog.js";
import {unitOf, setPlace, placeFrom} from "../model.js";
import {loadGrampsPlaces, grYearDec, grPeriod} from "../gramps.js";
import {albumNeighbors} from "../provenance.js";
import {peopleOn} from "./event.js";
import {placeAnswers} from "../refine.js";
import {openPlacePicker} from "./placepicker.js";
import {geoOf, geoId, geoMapped, geoText, geoGroups, geoConflict, nearestGramps, kmText} from "../geo.js";
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

// Answers of the game for this photo (read-only when the places from Gramps are not available)
function gameAnswersReadOnly(key) {
  const ans = placeAnswers(key);
  return ans.length ? '<div class="quiet" style="margin-top:6px">' + tr("Answers from the game:") + '</div>' + ans.map((g) => `<div class="ez-row"><span><b>${esc(g.text)}</b> <span class="quiet">${esc(g.players.join(", "))}</span></span></div>`).join("") : "";
}
export function placeArea(e, key) {
  const head = '<div class="field-name">' + tr("Place") + '</div>';
  if (!S.grPlaces) setTimeout(() => loadGrampsPlaces(false), 0);
  const gp = S.grPlaces && !S.grPlaces.errors ? S.grPlaces : null;
  const nowVal = placeFrom(key), seriesVal = e.keys.length > 1;
  const deviating = e.keys.filter((k) => !same(placeFrom(k), nowVal)).length;
  let content = "";
  if (nowVal) {
    content += `<div class="place-row"><span><b>${esc(nowVal.name)}</b><br><span class="quiet">${nowVal.lat != null ? esc(coordText(nowVal)) : ""} ${nowVal.source ? "· " + esc(nowVal.source) : ""}</span></span>
      <button class="small" data-a="place-remove" data-uid="${esc(e.uid)}" data-key="${esc(key)}" title="${seriesVal && !ui.placeOnly ? tr("Remove place from all photos of the series") : tr("Remove place")}">✕</button></div>`;
    if (nowVal.lat == null) content += '<div class="box warn" style="margin-top:6px">' + tr("In Gramps this place has no coordinates. It is therefore not written to Immich. Add them in Gramps and reload the place list.") + '</div>';
  } else content += '<div class="quiet">' + tr("No place yet.") + '</div>';
  if (seriesVal && deviating) content += `<div class="quiet" style="font-size:12px;margin-top:4px">${tr("{abweichend} of {n} {n:photo|photos} in the series have a different place or none. {button}", {abweichend: deviating, n: e.keys.length, button: nowVal ? `<button class="small" data-a="place-all" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("Apply to all photos in the series")}</button>` : ""})}</div>`;
  const ans = nowVal ? [] : placeAnswers(key);
  ui.gamePlaces = ans;
  if (ans.length) content += '<div class="quiet" style="margin-top:6px">' + tr("Answers from the game:") + '</div>' + ans.map((g, i) => `<div class="ez-row">
    ${g.h && gp && gp.byHandle[g.h] ? `<button class="small good" data-a="place-game" data-i="${i}" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("Take over")}</button>` : `<button class="small" data-a="place-search-for" data-i="${i}">${tr("Search")}</button>`}
    <span><b>${esc(g.h && gp && gp.byHandle[g.h] ? gp.byHandle[g.h].t : tr("new place: {name}", {name: g.text}))}</b> <span class="quiet">${esc(g.players.join(", "))}</span></span></div>`).join("");
  const v = gp ? suggestions(e, key).filter((x) => !nowVal || x.o.h !== nowVal.h) : [];
  ui.placeSuggestions = v;
  if (v.length) content += '<div class="quiet" style="margin-top:6px">' + tr("Suggestions:") + '</div>' + v.map((x, i) => `<div class="ez-row"><button class="small" data-a="place-prefill" data-i="${i}" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("Take over")}</button>
    <span><b>${esc(x.o.t)}</b> <span class="quiet">${esc(x.reason)}${x.o.lat == null ? tr(" · without coordinates") : ""}</span></span></div>`).join("");
  content += `<div style="margin-top:8px"><button class="small primary" data-a="place-open" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${nowVal ? tr("Change …") : tr("Choose place …")}</button></div>
    ${seriesVal ? `<label class="quiet" style="font-size:12px;display:block;margin-top:4px"><input type="checkbox" data-a="place-only" ${ui.placeOnly ? "checked" : ""}> ${tr("only for this photo (otherwise the place applies to the whole series)")}</label>` : ""}
    ${gp ? "" : `<div class="quiet" style="font-size:12px;margin-top:4px">${tr("Places from Gramps not available: {fehler}", {fehler: esc((S.grPlaces && S.grPlaces.errors) || tr("loading …"))})} <a href="#" class="link" data-a="place-new">${tr("Try again")}</a></div>`}`;
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

// Search dialog for a Gramps place; onChoose(o) gets the chosen entry {h, id, t, n, lat, lon}
async function pickPlace(title, onChoose) {
  if (!S.grPlaces) await loadGrampsPlaces(false);
  if (!S.grPlaces || !S.grPlaces.list) return toast(tr("Places from Gramps not available: {fehler}", {fehler: (S.grPlaces && S.grPlaces.errors) || ""}));
  modal(`<h3>${esc(title)}</h3>
    <input type="text" id="basket-place" placeholder="${tr("Search place: type name or Gramps number")}" autocomplete="off" style="width:100%;box-sizing:border-box">
    <div id="basket-hits" class="place-list"></div>
    <div class="actions" style="margin-top:14px"><button id="basket-place-no">${tr("Cancel")}</button></div>`);
  document.getElementById("basket-place-no").onclick = closeIt;
  const input = document.getElementById("basket-place"), box = document.getElementById("basket-hits");
  const fill = () => {
    const q = norm(input.value).split(/\s+/).filter(Boolean);
    const hits = q.length ? S.grPlaces.list.filter((o) => { const x = norm(o.t + " " + o.id); return q.every((w) => x.includes(w)); })
      .sort((a, b) => (norm(a.n).startsWith(q[0]) ? 0 : 1) - (norm(b.n).startsWith(q[0]) ? 0 : 1) || a.t.length - b.t.length).slice(0, 8) : [];
    box.innerHTML = q.length && !hits.length ? '<div class="quiet" style="padding:4px 8px">' + tr("No place found.") + '</div>'
      : hits.map((o, i) => `<div class="place-pick" data-i="${i}"><b>${esc(o.n)}</b> <span class="quiet">${esc(o.t.slice(o.n.length))}</span></div>`).join("");
    box.querySelectorAll(".place-pick").forEach((b) => { b.onclick = () => { closeIt(); onChoose(hits[+b.dataset.i]); }; });
  };
  input.addEventListener("input", fill);
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { const z = box.querySelector(".place-pick"); if (z) z.click(); } });
  input.focus();
}
// Basket: one place for all photos in the basket
async function placeSelection() {
  const keys = [...ui.sel].map(unitOf).filter(Boolean).flatMap((e) => e.keys);
  if (!keys.length) return;
  openPlacePicker({keys, title: tr("Set a place for {n} {n:photo|photos}", {n: keys.length}), onDone: () => ui.sel.clear()});
}
// Equate an Immich place (identical coordinates) with a Gramps place: applies to all photos with these coordinates
async function equate(id, o) {
  const x = geoGroups().find((y) => y.id === id);
  if (!x || !o) return;
  S.ord._geo = S.ord._geo || {};
  S.ord._geo[id] = {h: o.h, id: o.id, name: o.t, lat: o.lat, lon: o.lon};
  mark(); await saveOrd(); draw();
}
// Immich place of the photo, equation with Gramps, and the decision when Grimmich and Immich differ
export function geoBlock(key) {
  const g = geoOf(key);
  if (!g) return "";
  const mp = geoMapped(g), gid = geoId(g), p = S.places && S.places[key];
  let h = `<div><div class="field-name">${tr("Place in Immich")}</div><div><b>${esc(geoText(g))}</b> <span class="quiet">${g.lat.toFixed(4)} / ${g.lon.toFixed(4)}</span>`;
  if (mp) h += `<div class="quiet">${tr("Equated with the Gramps place {name}.", {name: esc(mp.name)})} <a href="#" class="link" data-a="geo-unmap" data-id="${esc(gid)}">${tr("Undo")}</a></div>`;
  else h += `<div class="actions"><button class="small" data-a="geo-pick" data-id="${esc(gid)}">${tr("Equate with Gramps place …")}</button></div>`;
  if (geoConflict(key)) h += `<div class="box warn" style="margin-top:6px">${tr("The place in Grimmich ({a}) differs from the place in Immich ({b}). Which one counts?", {a: esc(p.name || ""), b: esc(geoText(g))})}
    <div class="actions"><button class="small" data-a="geo-keep" data-key="${esc(key)}">${tr("Keep Grimmich place")}</button><button class="small" data-a="geo-use-immich" data-key="${esc(key)}">${tr("Take Immich place")}</button></div></div>`;
  return h + "</div></div>";
}

const keysFor = (el) => { const e = unitOf(el.dataset.uid); return !e ? [] : !ui.placeOnly || e.keys.length < 2 ? e.keys : [el.dataset.key]; };
export const actions = {
  "place-open": (el) => openPlacePicker({keys: keysFor(el)}),
  "geo-equate": (el) => { const x = geoGroups().find((y) => y.id === el.dataset.id), n = x && nearestGramps(x.g); if (n) return equate(x.id, n.o); },
  "geo-pick": (el) => { const x = geoGroups().find((y) => y.id === el.dataset.id) || {id: el.dataset.id}; return pickPlace(tr("Equate with Gramps place …"), (o) => equate(x.id, o)); },
  "geo-load": () => loadGrampsPlaces(false).then(draw),
  "geo-unmap": async (el) => { if (S.ord._geo) delete S.ord._geo[el.dataset.id]; mark(); await saveOrd(); draw(); },
  "geo-keep": async (el) => { (S.ord._geoOk = S.ord._geoOk || {})[el.dataset.key] = true; mark(); await saveOrd(); draw(); },
  "geo-use-immich": async (el) => { setPlace([el.dataset.key], null); mark(); await savePlaces(); draw(); },
  "place-select": () => placeSelection(),
  "place-prefill": (el) => { const x = (ui.placeSuggestions || [])[+el.dataset.i]; if (x) return assignTo(el.dataset.uid, el.dataset.key, x.o, x.reason); },
  "place-game": (el) => { const g = (ui.gamePlaces || [])[+el.dataset.i]; if (g && S.grPlaces.byHandle[g.h]) return assignTo(el.dataset.uid, el.dataset.key, S.grPlaces.byHandle[g.h], tr("answer from the game: {names}", {names: g.players.join(", ")})); },
  "place-search-for": (el) => { const g = (ui.gamePlaces || [])[+el.dataset.i], b = document.querySelector('[data-a="place-open"]'); if (g && b) openPlacePicker({keys: keysFor(b), text: g.text}); },
  "place-remove": (el) => assignTo(el.dataset.uid, el.dataset.key, null),
  "place-all": (el) => { const o = placeFrom(el.dataset.key); if (o) return assignTo(el.dataset.uid, el.dataset.key, S.grPlaces.byHandle[o.h] || {h: o.h, id: o.id, t: o.name, lat: o.lat, lon: o.lon}, o.source, true); },
  "place-only": (el) => { ui.placeOnly = el.checked; draw(); },
  "place-new": () => { S.grPlaces = null; return loadGrampsPlaces(true); },
};
