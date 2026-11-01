// Actions that occur in several views: choose tile, date, anchor, draft.
import {S, ui, draw, saveCorr, saveChanges, saveOrd, saveKinds, saveWork, mark} from "../state.js";
import {setCorr, unitOf, unitFromKey, personOf, estimateBirth, setKindOf, setRoughTime, KINDS} from "../model.js";
import {provenanceOf, albumKeys} from "../provenance.js";
import {dateDialog, facesDialog, lightbox, ask, modal, closeIt} from "./dialog.js";
import {esc, toast} from "../util.js";
import {sortKeys} from "./sorting.js";
const albumName = (a) => tr("Album “{name}”", {name: a.name});
import {tr} from "../language.js";

export async function confirmIt(units) {
  units.forEach((u) => {
    if (u.draftFlag) setCorr(u.keys, {year: u.year, decimal_year: u.decimal_year || u.year, from: u.year, to: u.year, source: "manual"});
    else if (u.estimate) setCorr(u.keys, {year: u.estimate.year, decimal_year: u.estimate.decimal_year || u.estimate.year, from: u.estimate.from, to: u.estimate.to, source: "confirmed"});
  });
  await saveCorr(); draw();
}
export async function setDraft(uid, yearVal) {
  const e = unitOf(uid);
  if (!e) return;
  const k0 = S.corr[e.keys[0]], previous = e.draftFlag ? (k0.before || null) : (k0 ? {...k0} : null);
  setCorr(e.keys, {year: yearVal, decimal_year: yearVal, from: yearVal, to: yearVal, source: "draft", ...(previous ? {before: previous} : {})});
  await saveCorr(); draw();
}
export async function discardDraft(uid) {
  const e = unitOf(uid);
  if (!e) return;
  const v = (S.corr[e.keys[0]] || {}).before;
  e.keys.forEach((k) => { if (v) S.corr[k] = {...v}; else delete S.corr[k]; });
  mark();
  await saveCorr(); draw();
}
async function setBirth(pid) {
  const p = personOf(pid), v = p && estimateBirth(p);
  if (!v) return;
  (S.ord._birth = S.ord._birth || {})[pid] = {year: v.year, n: v.n, errors: v.errors};
  mark(); await saveOrd(); draw();
}
// Order of the tiles in the current view (for the large view)
export let visibleKeys = [];
// Each tile stands for its whole unit: a series counts with all its photos (not only the cover photo of the tile)
const viewKeys = () => [...new Set(visibleKeys.flatMap((k) => { const u = unitFromKey(k); return u && u.type === "series" ? u.keys.filter((x) => S.photos[x]) : [k]; }))];
export const setVisible = (k) => { visibleKeys = k; };

// Set kind: kind = "" (normal photo) or a key from KINDS. Applies to single photos; a series is not switched as a whole.
export async function setKind(uids, kindVal, keys) {
  const unitsList = uids.map(unitOf).filter(Boolean), ok = unitsList.filter((e) => e.type === "photo"), seriesList = unitsList.length - ok.length;
  const goal = keys || ok.flatMap((e) => e.keys);
  if (goal.length) { setKindOf(goal, kindVal); await saveKinds(); }
  if (seriesList && !keys) toast(tr("{n} {n:series was|series were} skipped. You don't convert a series as a whole: select the photo in the series, then choose the card under “Type”.", {n: seriesList}));
  ui.sel.clear(); draw();
}
function kindDialog(uids) {
  modal(`<h3>${tr("Set the type of {n} {n:unit|units}", {n: uids.length})}</h3>
    <div class="quiet" style="margin-bottom:10px">${tr("Cards and documents do not appear in the sorting, in series or in the year hints. They stay in the album and get their own date under “Cards and documents”.")}</div>
    <div class="kind-chips">${[["", tr("Photo")], ...Object.entries(KINDS)].map(([k, n]) => `<button class="${k ? "" : "good"}" data-kind="${k}">${esc(n)}</button>`).join("")}</div>
    <div class="actions" style="margin-top:14px"><button id="kind-no">${tr("Cancel")}</button></div>`);
  document.getElementById("kind-no").onclick = closeIt;
  document.querySelectorAll(".kind-chips [data-kind]").forEach((b) => { b.onclick = async () => { closeIt(); await setKind(uids, b.dataset.kind); }; });
}

export const actions = {
  "kind-set": (el) => setKind([el.dataset.uid], el.dataset.kind, el.dataset.key ? [el.dataset.key] : null),
  "rough-set": async (el) => {
    const v = parseInt(document.getElementById("rough-from").value) || 0, b = parseInt(document.getElementById("rough-to").value) || 0;
    if ((v || b) && !(v && b)) return toast(tr("Please fill in “from” and “to” (or clear both)."));
    setRoughTime([el.dataset.key], v, b); await saveKinds(); draw();
  },
  "kind-select": () => kindDialog([...ui.sel]),
  "choose": (el) => {
    ui.focusKey = el.dataset.uid; ui.photoKey = el.dataset.key || null;
    if (el.dataset.scroll) ui.scrollZu = el.dataset.uid;
    draw();
  },
  "photo-pick": async (el) => {
    ui.photoKey = el.dataset.key;
    // Person view: the chosen photo of a series immediately becomes the cover photo in timeline and sorting
    const p = ui.view === "person" ? personOf(ui.personId) : null, e = unitFromKey(el.dataset.key);
    if (p && e && e.type === "series" && e.keys.includes(el.dataset.key) && ((S.ord._title || {})[e.uid] !== el.dataset.key)) {
      (S.ord._title = S.ord._title || {})[e.uid] = el.dataset.key;
      mark(); await saveOrd();
    }
    draw();
  },
  "select": (el, ev) => { ev.stopPropagation(); const u = el.dataset.uid; ui.sel.has(u) ? ui.sel.delete(u) : ui.sel.add(u); draw(); },
  "deselect": () => { ui.sel.clear(); draw(); },
  "born-adopt": async (el) => { await setBirth(el.dataset.pid); },
  "born-new": async (el) => { await setBirth(el.dataset.pid); },
  "born-remove": async (el) => { S.ord._birth = S.ord._birth || {}; delete S.ord._birth[el.dataset.pid]; mark(); await saveOrd(); draw(); },
  "titel-setzen": async (el) => {
    (S.ord._title = S.ord._title || {})[el.dataset.uid] = el.dataset.key;
    mark(); await saveOrd(); ui.photoKey = el.dataset.key; draw();
  },
  "enlarge": (el) => {
    // For a person: timeline and sorting page through the tiles of the view (one tile per series, the cover photo)
    const modeName = ui.view === "person" ? ui.mode : "";
    if (modeName === "time" || modeName === "sort") {
      const pers = personOf(ui.personId), ak = modeName === "sort" ? sortKeys(ui.personId) : visibleKeys.filter((k) => !k.startsWith("@"));
      const k0 = el.dataset.key, eu = unitFromKey(k0);
      let i = ak.indexOf(k0);
      if (i < 0 && eu) i = ak.findIndex((x) => (unitFromKey(x) || {}).uid === eu.uid);
      if (i >= 0 && ak.length) {
        const laneList = [{name: (modeName === "sort" ? tr("Sorting {name}", {name: pers ? pers.name : ""}) : tr("Timeline {name}", {name: pers ? pers.name : ""})), keys: ak}];
        if (modeName === "time") {   // Series and albums stay selectable as further rows
          const sk = eu && eu.type === "series" ? eu.keys.filter((k) => S.photos[k]) : null;
          if (sk && sk.length > 1) laneList.push({name: tr("Series {id}", {id: eu.s.id}), keys: sk});
          provenanceOf(k0).forEach((h) => { const a = S.albums.find((x) => x.id === h.albumId); if (a && albumKeys(a).length > 1 && !laneList.some((r) => r.name === albumName(a))) laneList.push({name: albumName(a), keys: albumKeys(a)}); });
        }
        return lightbox(ak, i, laneList, 0);
      }
    }
    // Order of the images for paging: the series or group in which the click happened, otherwise all visible tiles
    let keys;
    if (ui.view === "album" && visibleKeys.includes(el.dataset.key)) keys = visibleKeys;   // in the album: page in album order
    else if (el.dataset.keys && el.dataset.keys.includes("|")) keys = el.dataset.keys.split("|");
    else if (el.closest("[data-gruppe]")) keys = [...new Set([...el.closest("[data-gruppe]").querySelectorAll('[data-a="enlarge"]')].map((x) => x.dataset.key))];
    else { const ak = viewKeys(); keys = ak.includes(el.dataset.key) ? ak : [el.dataset.key]; }
    // All sequences that can be paged through; the one used first is preselected
    const key = el.dataset.key, laneList = [], add = (name, ks) => { if (ks && ks.length > 1 && ks.includes(key) && !laneList.some((x) => x.keys.join("|") === ks.join("|"))) laneList.push({name, keys: ks}); };
    const e = unitFromKey(key), alb = ui.view === "album" ? S.albums.find((x) => x.id === ui.albumId) : null;
    const seriesKeys = e && e.type === "series" ? e.keys.filter((k) => S.photos[k]) : null;
    // Order of the view (e.g. timeline): each tile stands for its whole unit, so a series with all its photos
    const pers = ui.view === "person" ? personOf(ui.personId) : null;
    const viewName = alb ? albumName(alb) : pers ? (ui.mode === "time" ? tr("Timeline {name}", {name: pers.name}) : tr("View {name}", {name: pers.name})) : tr("Visible photos");
    const firstKeys = keys.join("|");
    add(e && e.type === "series" ? tr("Series {id}", {id: e.s.id}) : "", seriesKeys);
    add(viewName, viewKeys());
    provenanceOf(key).forEach((h) => { const a = S.albums.find((x) => x.id === h.albumId); if (a && !(alb && alb.id === a.id)) add(albumName(a), albumKeys(a)); });
    let r0 = laneList.findIndex((x) => x.keys.join("|") === firstKeys);
    if (r0 < 0) { laneList.unshift({name: keys.length > 1 ? tr("Selection") : "", keys}); r0 = 0; }
    const list = laneList.filter((x, n) => n === r0 || x.keys.length > 1 || laneList.length === 1);   // the clicked row always stays, even with only one photo
    lightbox(keys, Math.max(0, keys.indexOf(key)), list, Math.max(0, list.findIndex((x) => x.keys.join("|") === firstKeys)));
  },
  "date": (el) => dateDialog([el.dataset.uid]),
  "date-select": () => dateDialog([...ui.sel]),
  "confirmed-select": async () => { const u = [...ui.sel].map(unitOf).filter(Boolean); ui.sel.clear(); await confirmIt(u); },
  "anchor": async (el) => { const e = unitOf(el.dataset.uid); if (e) await confirmIt([e]); },
  "anchor-remove": (el) => {
    const e = unitOf(el.dataset.uid);
    if (!e) return;
    if (e.immich) ask(tr("Do not use Immich date as anchor"), `${tr("The date you set in Immich ({datum}) will no longer be used as an anchor in Grimmich. The photo gets the AI estimate again. The date in Immich stays unchanged and is not overwritten when writing.", {datum: e.date})}`, tr("Do not use"),
      async () => { setCorr(e.keys, {source: "ignoriert"}); await saveCorr(); draw(); });
    else ask(tr("Release anchor"), `${tr("The fixed date ({jahr}) will be discarded. The photo gets the AI estimate again.", {jahr: e.date || e.year})}`, tr("Release anchor"), async () => { setCorr(e.keys, null); await saveCorr(); draw(); });
  },
  "immich-anchor": async (el) => { const e = unitOf(el.dataset.uid); if (e) { setCorr(e.keys, null); await saveCorr(); draw(); } },
  "draft-remove": (el) => discardDraft(el.dataset.uid),
  "year-minus": (el) => { const e = unitOf(el.dataset.uid); if (e && e.year) return setDraft(e.uid, e.year - 1); },
  "year-plus": (el) => { const e = unitOf(el.dataset.uid); if (e && e.year) return setDraft(e.uid, e.year + 1); },
  "faces": (el) => facesDialog(el.dataset.uid, el.dataset.key),
  "seen": async (el) => { delete S.changed[el.dataset.key]; await saveChanges(); draw(); },
  "all-seen": async () => { S.changed = {}; await saveChanges(); draw(); },
  "mode": (el) => { ui.mode = el.dataset.m; ui.sel.clear(); draw(); },
};
