// “Sort by appearance”: put the faces of a person in a row from young to old.
// Anchors (confirmed photos and markers) keep their year, the photos in between are aligned to them.
import {S, ui, draw, saveCorr, saveOrd} from "../state.js";
import {esc, $, cropStyle, toast, image} from "../util.js";
import {setCorr, personTiles, personOf} from "../model.js";
import {sortLane, calcSorting, limits, limitText, tokens, yearsMap, mirrorIt, mirrorChanges, secondPeople} from "../ordering.js";
import {GR_SIDE, grNear, grKind, grDateText, grSort, grWho, grDescr, grPeriod} from "../gramps.js";
import {ask, lightbox, anchorDialog, anchorDialog2, deleteAnchor} from "./dialog.js";
import {confirmIt} from "./actions.js";
import {tr} from "../language.js";

const FACE = 112;
const lbMap = {};
export const sortKeys = (pid) => lbMap[pid] || [];   // Order of the tiles when sorting (for the large view)

function sortTile(k, nr, fit, geburt, pid, shared, limit) {
  const e = k.e, stat = e.confirmedFlag ? "confirmed" : e.draftFlag ? "draft" : "";
  const proposal = fit !== undefined && fit !== null && geburt != null ? Math.round(geburt + fit) : null;
  // One year per photo; the colour tells the state: anchor (green), draft (yellow), uncertain (grey "c.")
  const differs = proposal !== null && e.year && Math.abs(proposal - e.year) >= (e.confirmedFlag ? 5 : 2);
  let badge = "";
  if (e.confirmedFlag) badge = `<span class="p-year y-anchor">✓ ${e.year}</span>${differs ? `<span class="p-warn" title="${esc(tr("The row suggests c. {jahr}, far from the anchor.", {jahr: proposal}))}">⚠</span>` : ""}`;
  else if (e.draftFlag) badge = `<span class="p-year y-draft">${e.year}${differs ? " → " + proposal : ""}</span>`;
  else if (proposal !== null) badge = `<span class="p-year y-guess" data-a="s-anchor" data-pid="${esc(pid)}" data-uid="${esc(k.uid)}" data-j="${proposal}" title="${tr("Click to enter a fixed year")}">${tr("c. {jahr}", {jahr: proposal})}</span>`;
  const hint = [k.ki !== null ? tr("AI age {ki}", {ki: Math.round(k.ki)}) + (fit !== undefined && fit !== null ? " → " + Math.round(fit) : "") : tr("AI age –"), limit || "", k.f.key, shared ? tr("also in the other person") : ""].filter(Boolean).join(" · ");
  return `<div class="ptile ${stat} ${ui.focusKey === k.uid ? "focus" : ""}" data-tile="${esc(k.uid)}" data-pid="${esc(pid)}" title="${esc(hint)}">
    <div class="pface" data-pa="sortdrag" data-pid="${esc(pid)}" data-uid="${esc(k.uid)}" data-key="${esc(k.f.key)}" style="${k.f.box ? cropStyle(k.f.key, k.f.box, FACE) : `background-image:url(${image(k.f.key)});background-size:cover;background-position:center;`}">
      ${nr ? `<span class="pnr">${nr}</span>` : ""}${k.n > 1 ? `<span class="p-series">${esc(k.series_id)} · ${k.n}</span>` : ""}${shared ? '<span class="p-shared" title="' + tr("This photo is also in the other person") + '">⇄</span>' : ""}${badge}</div></div>`;
}
function lanesHtml(p, parts, res2, tileObj, pid) {
  if (!parts.length) return '<span class="quiet" style="padding:10px">' + tr("Still empty. Drag faces here.") + '</span>';
  const plus = (pos) => p.birth === null ? "" : `<div class="plus-gap" data-a="m-new" data-pid="${pid}" data-pos="${pos}" title="${tr("Insert anchor (e.g. wedding 1975)")}"><span>+</span></div>`;
  let n = 0, h = plus(0);
  parts.forEach((t, ti) => {
    if (t.k) { h += tileObj(t.k, n + 1, res2 ? res2.fit[n] : undefined); n++; }
    else h += `<div class="ptile marker" data-tile="m:${esc(t.m.id)}" data-pid="${pid}" title="${t.m.gramps ? tr("Anchor without photo (from Gramps)") : tr("Anchor without photo")}">
      <div class="pface mface" data-pa="sortdrag" data-pid="${pid}" data-uid="m:${esc(t.m.id)}" data-key="@m:${esc(t.m.id)}">
        <span class="m-year">${esc(t.m.display)}</span>${t.m.text ? `<span class="m-text">${esc(t.m.text)}</span>` : ""}<span class="m-age">${Math.round(t.m.year - p.birth)} J</span></div>
      <div class="p-label">${tr("Anchor")}${t.m.gramps ? ' <span class="shared" title="' + tr("from Gramps") + '">G</span>' : ""}</div>
      <div class="p-buttons"><button class="small" data-a="m-edit" data-pid="${pid}" data-id="${esc(t.m.id)}" title="${tr("Change year or text")}">✎</button><button class="small" data-a="m-del" data-pid="${pid}" data-id="${esc(t.m.id)}" title="${tr("Delete anchor")}">×</button></div></div>`;
    h += plus(ti + 1);
  });
  return h;
}

// ---- Gramps-Ereignisse als Anker anbieten
function grPanel(p) {
  const h = S.assignMap[p.id], openVal = ui.grOpen && ui.grOpen[p.id];
  let inner;
  if (!S.conn || !(S.conn.gramps.url && S.conn.gramps.user && S.conn.gramps.password)) inner = '<span class="quiet">' + tr("Gramps is not connected yet (gear icon at the top right).") + '</span>';
  else if (!h) inner = '' + tr("This person is not assigned to a Gramps person yet.") + ' <button class="small primary" data-a="go-dialog">' + tr("Assign person …") + '</button>';
  else {
    const st = S.grEv[p.id];
    if (!st) inner = `<button class="small primary" data-a="gr-load" data-pid="${esc(p.id)}">${tr("Fetch events from Gramps")}</button>`;
    else if (st === "laeuft") inner = '<span class="quiet">' + tr("Loading from Gramps …") + '</span>';
    else if (st.errors) inner = `<span class="error-text">✗ ${esc(st.errors)}</span> <button class="small" data-a="gr-load" data-pid="${esc(p.id)}">${tr("Retry")}</button>`;
    else inner = grList(p, st.list);
  }
  return `<details class="gramps" data-gpid="${esc(p.id)}" ${openVal ? "open" : ""}><summary>${tr("Use events from Gramps as anchors")}</summary>${inner}</details>`;
}
function grList(p, list) {
  const anchorFrom = {};
  Object.values(S.ord._anchor || {}).forEach((m) => { if (m.event) (anchorFrom[m.event] = anchorFrom[m.event] || []).push(m.part); });
  const visibleVal = list.filter((e) => (ui.grAll || !GR_SIDE.has(e.kind)) && (ui.grUsed || grNear(e))).sort((a, b) => grSort(a) - grSort(b));
  const btn = (e, partVal, text) => `<button class="small" data-a="gr-marker" data-pid="${esc(p.id)}" data-ev="${esc(e.id)}" data-part="${partVal}">${text}</button>`;
  const lines = visibleVal.map((e) => {
    const already = anchorFrom[e.id] || [];
    const buttonEl = grPeriod(e)
      ? `${already.includes("beginn") ? tr("✓ Start") : btn(e, "beginn", tr("+ Start"))} ${already.includes("ende") ? tr("✓ End") : btn(e, "ende", tr("+ End"))} ${already.length ? "" : btn(e, "beide", tr("+ both"))}`
      : (already.length ? tr("✓ Anchor") : btn(e, "ein", tr("+ Anchor")));
    const bs = grDescr(e), who0 = grWho(e), whoVal = who0.split(/\s+/).every((t) => bs.includes(t)) ? "" : who0;
    return `<div class="gr-row"><span class="gr-date">${esc(grDateText(e.date))}</span>
      <span class="gr-kind"><b>${esc(grKind(e.kind))}</b>${whoVal ? ` <span class="quiet">(${esc(whoVal)})</span>` : ""}${bs ? `<span class="gr-describe">${esc(bs)}</span>` : ""}${e.place ? `<span class="gr-place">📍 ${esc(e.place)}</span>` : ""}</span><span class="gr-button">${buttonEl}</span></div>`;
  }).join("");
  return `<div class="actions" style="margin:6px 0"><span class="quiet">${tr("{sichtbar_n} of {liste_n} events with date", {sichtbar_n: visibleVal.length, liste_n: list.length})}</span>
      <label class="quiet"><input type="checkbox" data-a="gr-all" ${ui.grAll ? "checked" : ""}> ${tr("also occupations, censuses etc.")}</label>
      <label class="quiet"><input type="checkbox" data-a="gr-discard" ${ui.grUsed ? "checked" : ""}> ${tr("also siblings and other relatives")}</label>
      <button class="small" data-a="gr-load" data-pid="${esc(p.id)}" data-new="1">${tr("reload")}</button></div>
    <div class="gr-list">${lines || '<span class="quiet">' + tr("No events with date.") + '</span>'}</div>`;
}

// ---- One block = one person
function block(p, tileList, shared, second) {
  const {laneVal, remaining, parts, anchorItem} = sortLane(p, tileList);
  const res2 = laneVal.length >= 3 && p.birth !== null ? calcSorting(p, laneVal, anchorItem) : null, gr = limits(laneVal, anchorItem);
  lbMap[p.id] = [...laneVal, ...remaining].map((k) => k.f.key);
  const pid = esc(p.id), nDraft = tileList.filter((k) => k.e.draftFlag).length;
  const tileObj = (k, i, f) => sortTile(k, i, f, p.birth, p.id, shared.has(k.uid), i ? limitText(gr[i - 1]) : "");
  return `
    <div class="bar-strip ${second ? "second" : ""}">${second ? "<b>" + tr("Second person:") + "</b>" : ""}<b>${esc(p.name)}</b> <span class="quiet">${tr("{reihe_n} of {kacheln_n} {kacheln_n:unit|units} sorted in", {reihe_n: laneVal.length, kacheln_n: tileList.length})}</span><span class="space"></span>
      <button class="small" data-a="s-presort" data-pid="${pid}">${tr("Sort in automatically")}</button>
      <button class="small" data-a="s-clear" data-pid="${pid}" ${laneVal.length ? "" : "disabled"}>${tr("Clear row")}</button>
      <button class="small good" data-a="s-confirm-all" data-pid="${pid}" ${nDraft ? "" : "disabled"} title="${tr("Confirm all drafts of this person as anchors")}">${tr("✓ Confirm all drafts ({nEntw})", {nEntw: nDraft})}</button></div>
    ${p.birth === null ? "" : grPanel(p)}
    <b>${tr("Row (young → old)")}</b>
    <div class="anchor-legend"><span class="lg lg-fest"></span> ${tr("Anchor: ✓ year (fixed)")} <span class="lg lg-entw"></span> ${tr("Draft: year not confirmed yet")} <span class="lg lg-vorschlag"></span> ${tr("Uncertain: c. year, suggestion from the row (click to fix it)")} <span class="lg-warn">⚠</span> ${tr("far from an anchor")} <span class="lg lg-ohne"></span> ${tr("Anchor without photo")} <span class="shared">G</span> ${tr("from Gramps")}<br><span class="quiet">${tr("Hover over a photo: AI age, limits from the anchors.")}</span></div>
    <div class="sort-lane" id="sreihe_${pid}" data-pid="${pid}">${lanesHtml(p, parts, res2, tileObj, pid)}</div>
    ${res2 ? `<div class="effect"><b>${tr("Effect of the order (AI age, smoothed along the row)")}</b>
        <div>${tr("Comparison with the other people in the same photos ({n} {n:photo|photos}): spread", {n: res2.m1.n})} <b>${tr("{vor} → {nach} years", {vor: res2.m1.given.toFixed(1), nach: res2.m1.surnames.toFixed(1)})}</b> <span class="quiet">${tr("(if it drops, the faces fit better with the others)")}</span></div>
        <div>${res2.m2.n ? `${tr("Photos with confirmed year ({n}): mean error", {n: res2.m2.n})} <b>${tr("{vor} → {nach} years", {vor: res2.m2.given.toFixed(1), nach: res2.m2.surnames.toFixed(1)})}</b>` : '<span class="quiet">' + tr("No photo of this person with a confirmed year yet, so no second comparison.") + '</span>'}</div>
        <div class="actions"><button class="primary small" data-a="s-apply" data-pid="${pid}">${tr("Take over new years as draft")}</button>
          <span class="quiet">${tr("Sets the year = year of birth + smoothed age for all sorted-in photos that are not confirmed yet (as a draft, you confirm afterwards).")}</span></div></div>`
      : (laneVal.length ? `<div class="quiet" style="margin:10px 0">${p.birth === null ? tr("Without a date of birth there is only the order and limits (“later than”, “earlier than”) from photos with a fixed year.") : tr("From 3 sorted-in faces on I show the effect.")}</div>` : "")}
    <div style="margin-top:14px"><b>${tr("Not sorted in yet ({n})", {n: remaining.length})}</b></div>
    <div class="sort-lane" id="srest_${pid}" data-pid="${pid}">${remaining.map((k) => tileObj(k, 0, undefined)).join("") || '<span class="quiet" style="padding:10px">' + tr("All sorted in.") + '</span>'}</div>`;
}

export function sortView(p, tileList) {
  const candidates = secondPeople(p), choice = ui.p2 ? candidates.find((x) => x.q.id === ui.p2) : null, p2 = choice ? choice.q : null;
  if (!choice) ui.p2 = null;
  const tiles2 = p2 ? personTiles(p2) : null, shared = new Set();
  if (tiles2) { const u2 = new Set(tiles2.map((k) => k.uid)); tileList.forEach((k) => { if (u2.has(k.uid)) shared.add(k.uid); }); }
  return `<div class="box info">${tr("Put the faces in the row from <b>young (left)</b> to <b>old (right)</b>, by appearance only and without years. Drag a face from the lower area to the place where it fits by age. You can move faces within the row or drag them back down. If unsure, leave them down. Photos with a fixed year (green) and points in time without a photo are anchors: the photos in between are aligned evenly to them.")}</div>
    <div class="bar-strip"><b>${tr("Second person for sorting at the same time")}</b>
      <select id="p2-select"><option value="">${tr("– none –")}</option>${candidates.map((x) => `<option value="${esc(x.q.id)}" ${p2 && p2.id === x.q.id ? "selected" : ""}>${tr("{name} ({n} {n:shared photo|shared photos})", {name: esc(x.q.name), n: x.n})}</option>`).join("")}</select>
      ${p2 ? '<span class="quiet">' + tr("Hover over a photo with the mouse: the same photo lights up in both rows (⇄). If you move it in one row, it jumps to the matching place in the other.") + '</span>' : ""}</div>
    ${block(p, tileList, shared, false)}${p2 ? block(p2, tiles2, shared, true) : ""}`;
}
export function redrawAfterSort() {   // Highlighting of mirrored photos
  if (!ui.blink) return;
  const us = ui.blink.uids; ui.blink = null;
  [...document.querySelectorAll(".ptile[data-pid]")].filter((t) => us.includes(t.dataset.tile) && t.dataset.pid !== ui.blinkFrom).forEach((t) => t.classList.add("blink"));
}

// ---- Aktionen
async function sortAction(a, pid) {
  const p = personOf(pid || ui.personId);
  if (!p) return;
  const tileList = personTiles(p);
  if (a === "s-clear") S.ord[p.id] = tokens(p, tileList).filter((t) => t.startsWith("@m:"));
  if (a === "s-presort") {
    // Sort in the photos that are not in the row yet. What is already in the row stays where it is (your hand positions win).
    // Anchors, drafts and markers go by their year, uncertain photos by AI age, always between the anchors/drafts that bound them.
    const lane = tokens(p, tileList).slice(), byKey = new Map(tileList.map((k) => [k.f.key, k]));
    const markerYear = new Map(sortLane(p, tileList).anchorItem.map((m) => [m.token, m.year]));
    const info = (t) => {
      if (markerYear.has(t)) return {fixed: true, v: p.birth !== null ? markerYear.get(t) - p.birth : null};
      const k = byKey.get(t);
      if (!k) return {fixed: false, v: null};
      if (k.e.confirmedFlag || k.e.draftFlag) { const y = k.e.decimal_year || k.e.year; return {fixed: true, v: p.birth !== null && y ? y - p.birth : null}; }
      return {fixed: false, v: k.ki};
    };
    const inRow = new Set(lane);
    const todo = [...markerYear.keys(), ...tileList.map((k) => k.f.key)].filter((t) => !inRow.has(t)).map((t) => ({t, ...info(t)})).filter((x) => x.v !== null && x.v !== undefined)
      .sort((x, y) => (x.fixed === y.fixed ? x.v - y.v : x.fixed ? -1 : 1));
    todo.forEach((me) => {
      const inf = lane.map(info);
      let hi = inf.findIndex((x) => x.fixed && x.v !== null && x.v > me.v);
      if (hi < 0) hi = lane.length;
      let lo = -1;
      inf.forEach((x, i) => { if (i < hi && x.fixed && x.v !== null && x.v <= me.v) lo = i; });
      let at = hi;
      for (let i = lo + 1; i < hi; i++) if (inf[i].v !== null && inf[i].v !== undefined && inf[i].v > me.v) { at = i; break; }
      lane.splice(at, 0, me.t);
    });
    S.ord[p.id] = lane;
    toast(tr("{n} {n:photo|photos} sorted in.", {n: todo.filter((x) => !markerYear.has(x.t)).length}));
  }
  if (a === "s-apply" && p.birth !== null) {
    const {laneVal, anchorItem} = sortLane(p, tileList);
    if (laneVal.length < 3) return;
    const r = calcSorting(p, laneVal, anchorItem);
    let n = 0;
    laneVal.forEach((k, i) => {
      if (k.e.confirmedFlag || r.fit[i] === null) return;
      const j = Math.round(p.birth + r.fit[i]), k0 = S.corr[k.e.keys[0]], previous = k.e.draftFlag ? (k0.before || null) : (k0 ? {...k0} : null);
      setCorr(k.e.keys, {year: j, decimal_year: j, from: j, to: j, source: "draft", ...(previous ? {before: previous} : {})});
      n++;
    });
    await saveCorr();
    toast(`${tr("{n} {n:year was|years were} set as a draft. Check and confirm them in the timeline.", {n: n})}`);
  }
  await saveOrd(); draw();
}
export const actions = {
  "s-presort": (el) => sortAction("s-presort", el.dataset.pid),
  "s-clear": (el) => sortAction("s-clear", el.dataset.pid),
  "s-apply": (el) => sortAction("s-apply", el.dataset.pid),
  "s-confirm-all": (el) => {
    const p = personOf(el.dataset.pid || ui.personId);
    if (!p) return;
    const ents = personTiles(p).filter((k) => k.e.draftFlag).map((k) => k.e);
    if (!ents.length) return;
    ask(tr("Confirm drafts"), `${tr("Confirm <b>{n}</b> {n:draft|drafts} of <b>{name}</b> ({k} {k:photo|photos}) as anchors?", {n: ents.length, name: esc(p.name), k: ents.reduce((n, e) => n + e.keys.length, 0)})}<br><br>
      ${tr("Confirmed years count as certain. They also affect other people in the same photos. Writing to Immich only happens under “Review changes”.")}`,
      tr("Confirm {n} {n:draft|drafts}", {n: ents.length}), () => confirmIt(ents));
  },
  "s-anchor": (el) => anchorDialog(el.dataset.uid, +el.dataset.j, el.dataset.pid),
  "m-new": (el) => anchorDialog2(el.dataset.pid, +el.dataset.pos, null),
  "m-edit": (el) => anchorDialog2(el.dataset.pid, null, el.dataset.id),
  "m-del": (el) => deleteAnchor(el.dataset.pid, el.dataset.id),
};

// ---- Dragging in sort mode (mouse or finger)
let szug = null;
function insertIndex(ev, pid, uid) {
  const laneVal = $("sreihe_" + pid);
  if (!laneVal) return null;
  const rr = laneVal.getBoundingClientRect();
  if (ev.clientX < rr.left - 20 || ev.clientX > rr.right + 20 || ev.clientY < rr.top - 30 || ev.clientY > rr.bottom + 30) return null;
  const tiles = [...laneVal.querySelectorAll(".ptile")].filter((t) => t.dataset.tile !== uid);
  let idx = tiles.length;
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect(), line = ev.clientY >= r.top - 6 && ev.clientY <= r.bottom + 6;
    if (line && ev.clientX < r.left + r.width / 2) { idx = i; break; }
    if (ev.clientY < r.top - 6) { idx = i; break; }
  }
  return {idx, tiles};
}
document.addEventListener("pointerdown", (ev) => {
  const f = ev.target.closest(".pface[data-pa=sortdrag]");
  if (!f || ev.button || ev.target.closest(".p-year.new")) return;
  ev.preventDefault();
  szug = {uid: f.dataset.uid, key: f.dataset.key, pid: f.dataset.pid, tile: f.closest(".ptile"), x0: ev.clientX, y0: ev.clientY, moved: false, ghost: null};
});
document.addEventListener("pointermove", (ev) => {
  if (!szug) return;
  if (!szug.moved && Math.hypot(ev.clientX - szug.x0, ev.clientY - szug.y0) > 6) {
    szug.moved = true;
    szug.ghost = szug.tile.cloneNode(true); szug.ghost.classList.add("pghost"); szug.ghost.classList.remove("hl"); szug.ghost.style.cssText = "";
    document.body.appendChild(szug.ghost); szug.tile.style.opacity = ".35";
  }
  if (!szug.moved) return;
  szug.ghost.style.left = (ev.clientX - 48) + "px"; szug.ghost.style.top = (ev.clientY - 48) + "px";
  document.querySelectorAll(".ptile.before, .ptile.after").forEach((t) => t.classList.remove("before", "after"));
  const e = insertIndex(ev, szug.pid, szug.uid);
  if (e && e.tiles.length) e.tiles[Math.min(e.idx, e.tiles.length - 1)].classList.add(e.idx < e.tiles.length ? "before" : "after");
});
document.addEventListener("pointerup", async (ev) => {
  if (!szug) return;
  const z = szug, e = z.moved ? insertIndex(ev, z.pid, z.uid) : null;
  szug = null;
  if (z.ghost) z.ghost.remove();
  z.tile.style.opacity = "";
  document.querySelectorAll(".ptile.before, .ptile.after").forEach((t) => t.classList.remove("before", "after"));
  const isAnchor = z.uid.startsWith("m:");
  if (!z.moved) {
    if (isAnchor) { anchorDialog2(z.pid, null, z.uid.slice(2)); return; }
    ui.focusKey = z.uid; ui.photoKey = z.key; draw(); return;   // Click: choose photo (dating and details appear on the right)
  }
  const p = personOf(z.pid);
  if (!p) return;
  const tileList = personTiles(p), tok = isAnchor ? "@" + z.uid : (tileList.find((k) => k.uid === z.uid) || {f: {}}).f.key;
  if (!tok) return;
  const previous = isAnchor ? yearsMap(p, tileList) : null, withoutVal = tokens(p, tileList).filter((t) => t !== tok);
  let fresh;
  if (e) { fresh = withoutVal.slice(); fresh.splice(Math.min(e.idx, fresh.length), 0, tok); }
  else {
    const pool = $("srest_" + z.pid) && $("srest_" + z.pid).getBoundingClientRect();
    const inPool = pool && ev.clientX >= pool.left && ev.clientX <= pool.right && ev.clientY >= pool.top - 20 && ev.clientY <= pool.bottom + 20;
    if (inPool && !isAnchor) fresh = withoutVal; else return;
  }
  S.ord[p.id] = fresh;
  if (isAnchor) mirrorChanges(p, previous);
  else if (e && mirrorIt(p, z.uid)) { ui.blink = {uids: [z.uid]}; ui.blinkFrom = p.id; }
  await saveOrd(); draw();
});
document.addEventListener("pointercancel", () => { if (szug) { if (szug.ghost) szug.ghost.remove(); szug.tile.style.opacity = ""; szug = null; } });
// Mouse over a photo: the same photo lights up in the row of the other person
let hlUid = null;
document.addEventListener("pointerover", (ev) => {
  const t = ev.target.closest ? ev.target.closest(".ptile[data-pid]") : null, u = t ? t.dataset.tile : null;
  if (u === hlUid) return;
  document.querySelectorAll(".ptile.hl").forEach((x) => x.classList.remove("hl"));
  hlUid = u;
  if (!u) return;
  const equals = [...document.querySelectorAll(".ptile[data-pid]")].filter((x) => x.dataset.tile === u);
  if (equals.length > 1) equals.forEach((x) => x.classList.add("hl"));
});
