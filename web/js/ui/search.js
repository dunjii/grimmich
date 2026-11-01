// Search field in the header: file names of photos, people, photo albums and series.
import {S, ui} from "../state.js";
import {$, esc} from "../util.js";
import {unitFromKey, personForPhotos, shortName} from "../model.js";
import {tr} from "../language.js";

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const MAX = 6;

export function hitList(input) {
  const q = norm(input).trim();
  if (q.length < 1) return [];
  const off = [];
  const peopleList = (S.pf && S.pf.ok ? S.pf.people : []).filter((p) => p.photos.length && norm(p.name).includes(q));
  peopleList.slice(0, MAX).forEach((p) => off.push({kind: tr("Person"), text: shortName(p.name), extraVal: `${tr("{n} {n:photo|photos}", {n: p.photos.length})}`, action: "go-person", data: {pid: p.id}}));
  S.albums.filter((a) => norm(a.name).includes(q)).slice(0, MAX).forEach((a) => off.push({kind: tr("Album"), text: a.name, extraVal: `${tr("{n} {n:photo|photos}", {n: a.keys.length})}`, action: "go-album", data: {id: a.id}}));
  const sq = q.replace(/^s?0*/, "");
  S.work.series.filter((s) => norm(s.id).includes(q) || (sq && /^\d+$/.test(sq) && norm(s.id).replace(/^s0*/, "") === sq)).slice(0, MAX)
    .forEach((s) => off.push({kind: tr("Series"), text: tr("Series {id}", {id: s.id}), extraVal: `${tr("{n} {n:photo|photos}", {n: s.photos.length})}`, action: "series-show", data: {sid: s.id}}));
  Object.keys(S.photos).filter((k) => norm(k).includes(q)).sort().slice(0, MAX)
    .forEach((k) => off.push({kind: tr("Photo"), text: k, extraVal: (unitFromKey(k) || {}).year ? tr("c. {jahr}", {jahr: unitFromKey(k).year}) : tr("without year"), action: "such-foto", data: {key: k}}));
  return off;
}
export function resultHtml(input) {
  if (!String(input || "").trim()) return "";
  const t = hitList(input);
  if (!t.length) return '<div class="search-list"><div class="quiet" style="padding:8px 12px">' + tr("Nothing found.") + '</div></div>';
  return `<div class="search-list">${t.map((x, i) => `<button class="search-hit ${i === 0 ? "first" : ""}" data-a="search-go" data-i="${i}"><span class="s-kind">${x.kind}</span><span>${esc(x.text)}</span><span class="quiet">${esc(x.extraVal)}</span></button>`).join("")}</div>`;
}
export function searchHtml() {
  return `<div class="search-box"><input id="search-field" type="search" autocomplete="off" placeholder="${tr("Search: photo, person, album, series")}" value="${esc(ui.search || "")}" aria-label="${tr("Search")}">
    <div id="search-result">${ui.searchOpen ? resultHtml(ui.search) : ""}</div></div>`;
}
let last = [];
function show() { const el = $("search-result"); if (el) { ui.searchOpen = true; el.innerHTML = resultHtml(ui.search); last = hitList(ui.search); } }
export function closeSearch(clearIt) { ui.searchOpen = false; if (clearIt) ui.search = ""; const el = $("search-result"), f = $("search-field"); if (el) el.innerHTML = ""; if (f && clearIt) f.value = ""; }

document.addEventListener("input", (ev) => { if (ev.target.id === "search-field") { ui.search = ev.target.value; show(); } });
document.addEventListener("focusin", (ev) => { if (ev.target.id === "search-field" && ui.search) show(); });
document.addEventListener("keydown", (ev) => {
  if (ev.target.id !== "search-field") return;
  if (ev.key === "Enter") { const b = document.querySelector("#search-result .search-hit"); if (b) b.click(); }
  if (ev.key === "Escape") { closeSearch(false); ev.target.blur(); ev.stopPropagation(); }
}, true);
document.addEventListener("click", (ev) => { if (!ev.target.closest(".search-box")) { if (ui.searchOpen) closeSearch(false); } });

// small placeholder element so the jump actions can read their data values as for a click
const sheet = (data) => { const e = document.createElement("span"); Object.entries(data).forEach(([k, v]) => { e.dataset[k] = v; }); return e; };
export const actions = {
  "search-go": (el, ev) => {
    const t = hitList(ui.search)[+el.dataset.i];
    if (!t) return;
    closeSearch(true);
    (window.__grimmichActions || {})[t.action]?.(sheet(t.data), ev);
  },
  "such-foto": (el) => {   // Photo: show on the page of the first named person, otherwise under “All photos”
    const k = el.dataset.key, e = unitFromKey(k);
    if (!e) return;
    const p = personForPhotos([k]);
    if (p) window.__grimmichActions["go-person"](sheet({pid: p.id, key: k}));
    else window.__grimmichActions["go-task"](sheet({task: "all", key: k}));
  },
};
