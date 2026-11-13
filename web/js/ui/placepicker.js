// The window to choose a place: search (Gramps places, your own places, the internet), a map with a pin, name and "belongs to".
// A place from Gramps is taken over as it is. Everything else becomes your own place in Grimmich (it does not have to exist in Gramps).
import {S, ui, draw, mark, savePlaces, saveOrd} from "../state.js";
import {esc} from "../util.js";
import {modal, closeIt} from "./dialog.js";
import {setPlace, placeFrom} from "../model.js";
import {loadGrampsPlaces} from "../gramps.js";
import {createMap} from "../map.js";
import {distKm, geoOf} from "../geo.js";
import {tr} from "../language.js";

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
const myPlaces = () => Object.entries((S.ord && S.ord._myplaces) || {}).map(([id, p]) => ({id, n: p.name, t: p.parent ? `${p.name}, ${p.parent}` : p.name, lat: p.lat, lon: p.lon, parent: p.parent || "", own: true}));
export const knownPlaces = () => [...myPlaces(), ...(((S.grPlaces && S.grPlaces.list) || []).filter((o) => o.lat != null && o.lon != null).map((o) => ({...o, parent: o.t.slice(o.n.length).replace(/^,\s*/, ""), gramps: true})))];
const tag = (o) => (o.gramps ? tr("in Gramps") : o.own ? tr("in Grimmich") : "OpenStreetMap");

// keys: the photos that get the place. text: search text to start with.
export async function openPlacePicker({keys, title, text = "", onDone}) {
  if (!keys.length) return;
  if (!S.grPlaces) loadGrampsPlaces(false).then(() => { if (document.getElementById("of-q")) fillHits(); });
  const cur = placeFrom(keys[0]), g = geoOf(keys[0]);
  const start = cur && cur.lat != null ? {lat: +cur.lat, lon: +cur.lon, z: 17} : g ? {lat: g.lat, lon: g.lon, z: 17} : null;
  const city = g && g.t ? g.t.split(",")[0].trim() : "";
  modal(`<div class="ort-fenster"><h3>${esc(title || tr("Choose a place"))}</h3>
    <input type="text" id="of-q" value="${esc(text)}" placeholder="${esc(tr("Search place (Enter: also on the internet)"))}" autocomplete="off">
    <div id="of-hits" class="place-list"></div>
    <div id="of-map" style="margin-top:8px"></div>
    <div id="of-near" class="quiet" style="margin-top:4px"></div>
    <div class="row2"><div><label>${tr("Name")}</label><input type="text" id="of-name" value="${esc(cur ? cur.name : "")}"></div>
      <div><label>${tr("Belongs to")}</label><input type="text" id="of-parent" value="${esc(cur ? "" : city)}" placeholder="${esc(tr("e.g. the town"))}"></div></div>
    <div class="actions" style="margin-top:14px"><button id="of-no">${tr("Cancel")}</button><button class="primary" id="of-ok">${tr("Apply")}</button></div></div>`, 1100);
  const $ = (id) => document.getElementById(id);
  let chosen = null, net = [];
  const map = createMap($("of-map"), {lat: start ? start.lat : 51.0, lon: start ? start.lon : 10.4, zoom: start ? start.z : 6, pin: start ? {lat: start.lat, lon: start.lon} : null,
    onPick: () => { chosen = null; near(); ready(); }});
  const ready = () => { const p = map.pin(); $("of-ok").disabled = !(chosen || (p && $("of-name").value.trim())); };
  function near() {
    const p = map.pin();
    const list = p ? knownPlaces().map((o) => ({o, km: distKm(p, {lat: +o.lat, lon: +o.lon})})).filter((x) => x.km <= 0.15).sort((a, b) => a.km - b.km).slice(0, 3) : [];
    $("of-near").innerHTML = list.length ? tr("Nearby:") + " " + list.map((x, i) => `<button class="small" data-i="${i}">${esc(x.o.t)} (${Math.round(x.km * 1000)} m)</button>`).join(" ") : "";
    $("of-near").querySelectorAll("button").forEach((b) => { b.onclick = () => pick(list[+b.dataset.i].o); });
  }
  function pick(o) {
    chosen = o.gramps || o.own ? o : null;
    $("of-name").value = o.gramps ? o.t : o.n || o.name || "";
    $("of-parent").value = o.gramps ? "" : o.parent || "";
    map.setPin(+o.lat, +o.lon, 17); near(); ready();
  }
  function fillHits() {
    const q = norm($("of-q").value).split(/\s+/).filter(Boolean), box = $("of-hits");
    const local = q.length ? knownPlaces().filter((o) => { const x = norm(o.t + " " + o.id); return q.every((w) => x.includes(w)); })
      .sort((a, b) => (norm(a.n).startsWith(q[0]) ? 0 : 1) - (norm(b.n).startsWith(q[0]) ? 0 : 1) || a.t.length - b.t.length).slice(0, 6) : [];
    const all = [...local, ...net];
    box.innerHTML = all.map((o, i) => `<div class="place-pick" data-i="${i}"><b>${esc(o.n || o.name)}</b> <span class="quiet">${esc((o.t || o.text || "").slice((o.n || o.name || "").length))} · ${tag(o)}</span></div>`).join("")
      || (q.length ? `<div class="quiet" style="padding:4px 8px">${tr("No place found.")}</div>` : "");
    box.querySelectorAll(".place-pick").forEach((b) => { b.onclick = () => pick(all[+b.dataset.i]); });
  }
  $("of-q").addEventListener("input", () => { net = []; fillHits(); });
  $("of-q").addEventListener("keydown", async (ev) => {
    if (ev.key !== "Enter") return;
    const q = $("of-q").value.trim();
    if (q.length < 2) return;
    $("of-hits").insertAdjacentHTML("beforeend", `<div class="quiet" style="padding:4px 8px">${tr("Searching on the internet …")}</div>`);
    try {
      const r = await (await fetch("/api/geocode?q=" + encodeURIComponent(q))).json();
      net = r.ok ? r.results.map((x) => ({...x, n: x.name, t: x.text, net: true})) : [];
      fillHits();
      if (!r.ok) $("of-hits").insertAdjacentHTML("beforeend", `<div class="quiet" style="padding:4px 8px">${tr("Internet search not available: {fehler}", {fehler: esc(r.text || "")})}</div>`);
    } catch (e) { fillHits(); }
  });
  $("of-name").addEventListener("input", () => { chosen = null; ready(); });
  $("of-no").onclick = closeIt;
  $("of-ok").onclick = async () => {
    const p = map.pin();
    let entry;
    if (chosen && chosen.gramps) entry = {h: chosen.h, id: chosen.id, name: chosen.t, lat: chosen.lat, lon: chosen.lon, source: tr("chosen by hand")};
    else {
      const name = $("of-name").value.trim(), parent = $("of-parent").value.trim();
      let mine = chosen && chosen.own ? chosen : null;
      if (!mine) {   // an own place at (nearly) the same spot with the same name is reused
        mine = myPlaces().find((o) => norm(o.n) === norm(name) && distKm(p, {lat: o.lat, lon: o.lon}) < 0.03) || null;
        if (!mine) {
          const id = "G" + Date.now().toString(36);
          (S.ord._myplaces = S.ord._myplaces || {})[id] = {name, parent, lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6)};
          mine = {id, ...S.ord._myplaces[id], t: parent ? `${name}, ${parent}` : name, n: name};
          mark(); await saveOrd();
        }
      }
      entry = {id: mine.id, name: parent || mine.parent ? `${mine.n}, ${mine.parent || parent}` : mine.n, lat: mine.lat, lon: mine.lon, own: true, source: tr("chosen by hand")};
    }
    setPlace(keys, entry); closeIt(); await savePlaces();
    if (onDone) onDone();
    draw();
  };
  near(); ready(); fillHits(); $("of-q").focus();
}
