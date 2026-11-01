// Views without a single person: task lists (warnings, series, no estimate, …), inbox and photo albums.
import {S, ui, draw, saveInbox, savePages, loadNewInfo} from "../state.js";
import {esc} from "../util.js";
import {taskUnits, TASKS, taskCounts, unitFromKey, peopleText} from "../model.js";
import {provenanceOf} from "../provenance.js";
import {pagesFrom, albumKeys, setAlbumLane} from "../provenance.js";
import {tileObj, tileGrid} from "./tile.js";
import {seriesView} from "./series.js";
import {tr} from "../language.js";
import {statusHtml} from "../job.js";

// ------------------------------------------------------------------ Aufgabenliste
export function taskHtml() {
  const unitsList = taskUnits(ui.task), heading = TASKS[ui.task] || tr("Photos");
  const text = {
    warnings: tr("For these photos the dating lies before the birth or after the death of a person in them. Either a face is assigned wrongly or the AI estimate is wrong. Check the faces in Immich or set a year by hand."),
    without: tr("These photos have no estimate because no named person with a date of birth was recognized. Enter a year by hand or add names and dates of birth in Immich."),
    series: tr("Series you still need to confirm are listed here, with new suggestions."),
    cards: tr("Postcards, greeting cards and documents. They do not appear in the sorting and are not included in series. Enter a year or a range (“from … to”) if you can place them. In the album, “Year hints” shows which photos are pasted next to them. Pasting is only an upper limit though: the card can be older."),
    changed: tr("Something has changed in Immich for these photos (names, assignment, dates of birth or the image). “Refresh” recalculates them."),
  }[ui.task] || "";
  const head = `<div class="person-head"><div><h1>${esc(heading)}</h1><div class="quiet">${tr("{n} {n:unit|units}", {n: unitsList.length})}</div></div>
    ${ui.task === "changed" && unitsList.length ? '<button data-a="all-seen">' + tr("Mark all as seen") + '</button>' : ""}</div>${text ? `<div class="box info">${esc(text)}</div>` : ""}`;
  if (ui.task === "series") return head + seriesView(unitsList);
  const withVal = unitsList.slice().sort((a, b) => (a.year ? 0 : 1) - (b.year ? 0 : 1) || (a.decimal_year || 0) - (b.decimal_year || 0) || a.uid.localeCompare(b.uid));
  return head + tileGrid(withVal);
}

// Unprocessed single photos grouped by album. If a photo lies in several albums, the smallest counts (the large collective album stays out).
function unprocessedGroups(unitsList) {
  const gr = new Map();
  unitsList.forEach((e) => {
    const k = e.keys[0], hs = provenanceOf(k).map((h) => ({h, a: S.albums.find((x) => x.id === h.albumId)})).filter((x) => x.a);
    hs.sort((p, q) => p.a.keys.length - q.a.keys.length || p.a.name.localeCompare(q.a.name));
    const w = hs[0], id = w ? w.a.id : "-";
    if (!gr.has(id)) gr.set(id, {id, a: w ? w.a : null, name: w ? w.a.name : tr("In no album"), list: []});
    gr.get(id).list.push({e, k, h: w ? w.h : null});
  });
  const groups = [...gr.values()].sort((p, q) => (p.a ? 0 : 1) - (q.a ? 0 : 1) || p.name.localeCompare(q.name));
  groups.forEach((g) => { if (g.a) { const pos = new Map(albumKeys(g.a).map((k, i) => [k, i])); g.list.sort((p, q) => pos.get(p.k) - pos.get(q.k)); } });
  if (!ui.inboxOpen) ui.inboxOpen = new Set(groups.slice(0, 1).map((g) => g.id));
  return groups.map((g) => {
    const up = ui.inboxOpen.has(g.id), withPages = g.a && (S.pages[g.a.id] || []).length;
    return `<div class="e-group"><button class="eg-head" data-a="inbox-group" data-id="${esc(g.id)}"><span>${up ? "▾" : "▸"}</span> <b>${esc(g.name)}</b> <span class="quiet">${tr("{n} unprocessed", {n: g.list.length})}</span></button>
      ${up ? `<div class="grid">${g.list.map(({e, k, h}) => tileObj(e, {key: k, title: (h ? (withPages ? `${tr("p. {seite}, photo {nr}", {seite: h.page, nr: h.nr})}` : `${tr("Photo {nr}", {nr: h.nr})}`) + " · " : "") + (peopleText(k) || tr("unnamed"))})).join("")}</div>` : ""}</div>`;
  }).join("");
}

// ------------------------------------------------------------------ Eingang: neue Scans, Aktualisieren
export function inboxHtml() {
  const z = taskCounts(), j = S.job, fresh = taskUnits("new");
  const last = (j.rows || []).filter((l) => l && !l.startsWith("  ")).slice(-1)[0] || "";
  const done = !j.running && j.name && j.rc === 0, problem = !j.running && j.name && j.rc !== null && j.rc !== 0;
  const STEP_LABELS = {names: tr("Load names"), state: tr("Check changes in Immich"), estimate: tr("Estimate ages"), series: tr("Compare series"), provenance: tr("Read albums")};
  return `<div class="person-head"><div><h1>${tr("Inbox")}</h1><div class="quiet">${tr("New scans from the album “{Datierung}” and what has changed in Immich", {Datierung: esc(S.conn && S.conn.immich.album || tr("Scan-Datierung"))})}</div></div></div>
    <div class="counts"><div class="count"><b>${Object.keys(S.photos).length}</b>${tr("Photos known")}</div>
      <div class="count"><b>${S.newInfo && S.newInfo.ok ? z.inAlbum : "–"}</b>${tr("new scans in the album")}<br><span class="quiet">${S.newInfo && S.newInfo.ok ? `${tr("from {album} in the album", {album: S.newInfo.album})}` : esc(S.newInfo ? S.newInfo.text : tr("being checked …"))}</span></div>
      <div class="count"><b>${z.changedFlag}</b>${tr("changed in Immich")}</div>
      <div class="count"><b>${fresh.length}</b>${tr("Photos still unprocessed")}<br><span class="quiet">${tr("in no series, no confirmed year")}</span></div></div>
    <div class="card"><div><b class="large2">${tr("Refresh")}</b><br><span class="quiet">${tr("Loads the names from Immich, checks changes there, reads the photo albums, estimates the age of new photos and compares them with the existing series.")}</span></div>
      <button class="primary large" data-a="pipeline" id="pipeline-button" ${j.running ? "disabled" : ""}>${j.running ? tr("Running …") : tr("Refresh")}</button>
      <div class="quiet" id="jobstatus">${j.running ? statusHtml(j, last, STEP_LABELS) : ""}</div></div>
    ${done ? `<div class="box ok"><b>${tr("Done.")}</b> ${tr("{neu} new series suggestions.", {neu: j.new || 0})}</div>` : ""}
    ${problem ? '<div class="box warn">' + tr("The run ended with an error. You can find the log under the gear icon. Please send the last lines.") + '</div>' : ""}
    <div class="box info">${tr("Do this in Immich first: put new scans in the working album, mirror or rotate them if needed, name people, enter dates of birth and correct wrong face assignments. Immich is only read here.")}</div>
    <h3 class="subheading">${tr("Still unprocessed photos")}</h3>
    <div class="quiet" style="margin-bottom:10px">${tr("A photo counts as processed once it is in a series or has a confirmed year. The rest are listed here, by album and in album order.")}</div>
    ${fresh.length ? unprocessedGroups(fresh) : '<div class="empty">' + tr("All processed. New scans will appear here after the next “Refresh”.") + '</div>'}`
}

// ------------------------------------------------------------------ Photo albums with pages
export function albumHtml() {
  const a = S.albums.find((x) => x.id === ui.albumId);
  if (!a) return '<div class="empty">' + tr("Select a photo album on the left.") + '</div>';
  const pageList = pagesFrom(a), wraps = new Set(S.pages[a.id] || []);
  const withoutVal = a.keys.filter((k) => { const e = unitFromKey(k); return e && !e.year && !e.kind; }).length;
  // Continuous row: a narrow strip between the photos. A click on it starts a new page there (or joins again).
  const parts = `<div class="album-order">${pageList.map((s) => s.keys.map((k, i) => {
    const e = unitFromKey(k);
    let separator = "";
    if (i === 0 && s.nr === 1) separator = `<div class="page-start" title="${tr("Start of the album")}">${tr("Page 1")}</div>`;
    else if (i === 0) separator = `<div class="page-gap on" data-a="page" data-album="${esc(a.id)}" data-key="${esc(k)}" title="${tr("Page {nr} starts here. Click to join it with the previous one.", {nr: s.nr})}"><span>${tr("Page {nr}", {nr: s.nr})}</span></div>`;
    else separator = `<div class="page-gap" data-a="page" data-album="${esc(a.id)}" data-key="${esc(k)}" title="${tr("Start a new page here")}"><span>+</span></div>`;
    return separator + (e ? tileObj(e, {key: k, title: `${tr("p. {nr}, photo {i} · {Namen}", {nr: s.nr, i: i + 1, Namen: peopleText(k) || tr("unnamed")})}`}) : "");
  }).join("")).join("")}</div>`;
  return `<div class="person-head"><div><h1>${esc(a.name)}</h1><div class="quiet">${tr("{keys_n} {keys_n:photo|photos} · {seiten_n} {seiten_n:page|pages} · {datiert}", {keys_n: a.keys.length, seiten_n: pageList.length, datiert: withoutVal ? withoutVal + tr(" without date") : tr("all dated")})}</div></div><div><button data-a="gramps-album" data-id="${esc(a.id)}">${tr("All to Gramps …")}</button></div></div>
    <div class="box info">${tr("The photos are in the order of the file names (scan order). Click the narrow strip between two photos where a new page begins in the photo album. Page and position then appear for each photo under “Source”. A photo can be dragged to another place with the mouse if the order is wrong.{button}", {button: S.aRow[a.id] && S.aRow[a.id].length ? ' <button class="small" data-a="a-lane-back">' + tr("Reset order") + '</button>' : ""})}</div>${parts}`;
}

// ------------------------------------------------------------------ Aktionen
export const actions = {
  "inbox-group": (el) => { const s = ui.inboxOpen || (ui.inboxOpen = new Set()); s.has(el.dataset.id) ? s.delete(el.dataset.id) : s.add(el.dataset.id); draw(); },
  "eingang-gesehen": async () => { S.inbox.seen = Object.keys(S.photos); await saveInbox(); draw(); },
  "a-lane-back": async () => {
    const a = S.albums.find((x) => x.id === ui.albumId);
    if (!a) return;
    setAlbumLane(a, a.keys); delete S.aRow[a.id];
    await savePages(); draw();
  },
  "page": async (el) => {
    const id = el.dataset.album, k = el.dataset.key, list = new Set(S.pages[id] || []);
    list.has(k) ? list.delete(k) : list.add(k);
    S.pages[id] = [...list];
    await savePages(); draw();
  },
};
export async function newCheck() { await loadNewInfo(); }

// ---- rearrange photos in the album with the mouse
let azug = null;
const albumTiles = () => [...document.querySelectorAll("#middle .album-order .tile")];
function albumTarget(ev, key) {
  const tiles = albumTiles().filter((t) => t.dataset.key !== key);
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect(), line = ev.clientY >= r.top - 6 && ev.clientY <= r.bottom + 6;
    if (line && ev.clientX < r.left + r.width / 2) return {idx: i, tiles};
    if (ev.clientY < r.top - 6) return {idx: i, tiles};
  }
  return {idx: tiles.length, tiles};
}
document.addEventListener("pointerdown", (ev) => {
  const b = ev.target.closest("#middle .album-order .tile .image");
  if (!b || ev.button || ev.target.closest(".tick-box")) return;
  azug = {key: b.closest(".tile").dataset.key, tile: b.closest(".tile"), x0: ev.clientX, y0: ev.clientY, moved: false, ghost: null};
});
document.addEventListener("pointermove", (ev) => {
  if (!azug) return;
  if (!azug.moved && Math.hypot(ev.clientX - azug.x0, ev.clientY - azug.y0) > 8) {
    azug.moved = true;
    azug.ghost = azug.tile.cloneNode(true); azug.ghost.classList.add("pghost"); azug.ghost.style.cssText = "width:150px";
    document.body.appendChild(azug.ghost); azug.tile.style.opacity = ".35";
  }
  if (!azug.moved) return;
  azug.ghost.style.left = (ev.clientX - 60) + "px"; azug.ghost.style.top = (ev.clientY - 40) + "px";
  document.querySelectorAll(".tile.before, .tile.after").forEach((t) => t.classList.remove("before", "after"));
  const z = albumTarget(ev, azug.key);
  if (z.tiles.length) z.tiles[Math.min(z.idx, z.tiles.length - 1)].classList.add(z.idx < z.tiles.length ? "before" : "after");
});
document.addEventListener("pointerup", async (ev) => {
  if (!azug) return;
  const z = azug; azug = null;
  if (!z.moved) return;
  if (z.ghost) z.ghost.remove();
  z.tile.style.opacity = "";
  document.querySelectorAll(".tile.before, .tile.after").forEach((t) => t.classList.remove("before", "after"));
  const goal = albumTarget(ev, z.key), a = S.albums.find((x) => x.id === ui.albumId);
  if (!a) return;
  const withoutVal = albumKeys(a).filter((k) => k !== z.key), previous = albumKeys(a);
  const shorter = goal.tiles.map((t) => t.dataset.key);
  const priorVal = shorter[goal.idx];   // photo before which it is inserted (or undefined = at the end)
  const i = priorVal === undefined ? withoutVal.length : withoutVal.indexOf(priorVal);
  const fresh = withoutVal.slice(); fresh.splice(i < 0 ? withoutVal.length : i, 0, z.key);
  z.shifted = true;
  if (fresh.join("|") !== previous.join("|")) { setAlbumLane(a, fresh); await savePages(); }
  draw();
});
document.addEventListener("pointercancel", () => { if (azug) { if (azug.ghost) azug.ghost.remove(); azug.tile.style.opacity = ""; azug = null; } });
// After a drag the click should not additionally choose the photo
let lastDrag = 0;
document.addEventListener("pointerup", () => { if (azug && azug.moved) lastDrag = Date.now(); }, true);
document.addEventListener("click", (ev) => { if (Date.now() - lastDrag < 250 && ev.target.closest("#middle .album-order")) { ev.stopPropagation(); ev.preventDefault(); } }, true);
document.addEventListener("dragstart", (ev) => { if (ev.target.closest && ev.target.closest("#middle .album-order")) ev.preventDefault(); });
