// Check view (0.11): a whiteboard around one photo. People point at their faces with lines, the year can be dragged along a
// 10-year strip (life of the people or place in the album) and everything on the page reacts while dragging.
// It uses the actions that exist elsewhere (draft, anchor, place, event). Nothing is written to Immich or Gramps from here;
// the one Undo at the bottom takes back the last change made in this view.
import {S, ui, draw, mark, saveCorr, saveEz, savePlaces} from "../state.js";
import {esc, image, dateLong} from "../util.js";
import {unitOf, unitFromKey, unitList, ageList, warnings, statusLabel, shortName, placeFrom, taskCounts, hintText, lifeDates} from "../model.js";
import {provenanceOf, provenanceText, albumKeys} from "../provenance.js";
import {confirmIt, setDraft} from "./actions.js";
import {isoFrom} from "./event.js";
import {grShort, grDateText, grYearDec, grNear, loadEvents} from "../gramps.js";
import {suggestions, placeArea, actions as aPlaces} from "./places.js";
import {tr} from "../language.js";

const here = () => (ui.focusKey ? unitOf(ui.focusKey) : null);
const keyOf = (e) => (e.keys.includes(ui.photoKey) ? ui.photoKey : e.keys[0]);
const first = (name) => String(name || "").split(/\s+/)[0];

// Units in the order of the album the photo is in (page order); otherwise the order of the work list.
function neighbours(e) {
  const prov = provenanceOf(keyOf(e))[0], a = prov && S.albums.find((x) => x.id === prov.albumId);
  const order = a ? [...new Set(albumKeys(a).map((k) => unitFromKey(k)).filter(Boolean).map((u) => u.uid))].map((uid) => unitOf(uid)) : unitList().list;
  const i = order.findIndex((u) => u.uid === e.uid);
  return {list: order, i, prev: i > 0 ? order[i - 1] : null, next: i >= 0 && i < order.length - 1 ? order[i + 1] : null, page: prov ? prov.page : 0};
}

// ---- Undo: a copy of year, event and place of the photo before a change in this view
const snapshot = (keys) => JSON.stringify({keys, corr: keys.map((k) => S.corr[k] ?? null), ez: keys.map((k) => S.ez[k] ?? null), pl: keys.map((k) => S.places[k] ?? null)});
async function restore(text) {
  const s = JSON.parse(text);
  s.keys.forEach((k, i) => {
    if (s.corr[i]) S.corr[k] = s.corr[i]; else delete S.corr[k];
    if (s.ez[i]) S.ez[k] = s.ez[i]; else delete S.ez[k];
    if (s.pl[i]) S.places[k] = s.pl[i]; else delete S.places[k];
  });
  mark(); await Promise.all([saveCorr(), saveEz(), savePlaces()]);
}
async function change(label, e, work) {
  const before = snapshot(e.keys), warnBefore = taskCounts().warn;
  await work();
  const warnNow = taskCounts().warn, less = warnBefore - warnNow;
  (ui.ckUndo = ui.ckUndo || []).push({label, before});
  ui.ckMsg = less > 0 ? tr("{what}. {n} {n:warning|warnings} less.", {what: label, n: less}) : (less < 0 ? tr("{what}. {n} new {n:warning|warnings}.", {what: label, n: -less}) : label);
  ui.ckYear = null;
  draw();
}

// ---- Data of the page (also used while dragging)
let D = null;
function faceBoxes(key) {
  const out = [];
  (S.pf && S.pf.ok ? S.pf.people : []).forEach((p) => p.photos.filter((f) => f.key === key && f.box).forEach((f) => {
    const b = f.box, W = b[4], H = b[5];
    out.push({pid: p.id, name: p.name, left: 100 * b[0] / W, top: 100 * b[1] / H, width: 100 * (b[2] - b[0]) / W, height: 100 * (b[3] - b[1]) / H});
  }));
  return out;
}
const voteCount = (keys) => S.game.votes.filter((v) => keys.some((k) => v.key === k || v.anchor === k || (v.a && v.a.key === k) || (v.b && v.b.key === k) || (v.keys || []).includes(k))).length;
const pill = (t, c = "") => `<span class="ck-pill ${c}">${esc(t)}</span>`;

function buildData(e, key, nb) {
  const people = (S.pf && S.pf.ok ? S.pf.people : []).filter((p) => p.photos.some((f) => e.keys.includes(f.key)));
  const ages = ageList(key, e.decimal_year || e.year);
  const startYear = e.year || (() => {
    const v = people.map((p) => { const l = lifeDates(p.name).born, a = ages.find((x) => x.name === p.name); return l && a && a.ki !== null ? l.decimal_year + a.ki : null; }).filter((x) => x !== null);
    return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : 1940;
  })();
  const lo = startYear - 5, hi = startYear + 5;
  const nbUnits = new Set(nb.list.slice(Math.max(0, nb.i - 4), nb.i + 5).map((u) => u.uid));
  const persons = people.map((p) => {
    const l = lifeDates(p.name), a = ages.find((x) => x.name === p.name);
    const others = [...new Map(p.photos.map((f) => [unitFromKey(f.key), f.key]).filter(([u]) => u && u.uid !== e.uid && u.year)).keys()]
      .map((u) => ({y: u.date ? +String(u.date).slice(0, 4) : u.year, ok: !!u.confirmedFlag, near: nbUnits.has(u.uid)})).filter((f) => f.y >= lo && f.y <= hi);
    if (S.assignMap[p.id] && !S.grEv[p.id]) setTimeout(() => loadEvents(p.id), 0);
    const st = S.grEv[p.id], evs = st && st.list ? st.list.filter((ev) => (ev.own || grNear(ev)) && ev.date && ev.date.from && ev.date.from[0]).map((ev) => ({id: ev.id, pid: p.id, y: Math.floor(grYearDec(ev.date.from)), text: grShort(ev, true), date: grDateText(ev.date), iso: isoFrom(ev)})) : [];
    return {id: p.id, name: p.name, born: l.born ? l.born.decimal_year : null, death: l.death ? l.death.j : null, ki: a ? a.ki : null, others, evs: evs.filter((x) => x.y >= lo && x.y <= hi)};
  });
  const events = [...new Map(persons.flatMap((p) => p.evs).map((x) => [x.id, x])).values()].sort((a, b) => a.y - b.y).slice(0, 10);
  return {lo, hi, sug: startYear, year: ui.ckYear ?? startYear, persons, events};
}
const pct = (y) => (100 * (y - D.lo) / (D.hi - D.lo)).toFixed(2);

function problems(year) {
  const out = [];
  D.persons.forEach((p) => {
    if (p.born !== null && year < Math.floor(p.born)) out.push(tr("{name} would not be born yet", {name: first(p.name)}));
    if (p.death !== null && year > p.death) out.push(tr("{name} would be dead", {name: first(p.name)}));
  });
  if (!out.length && D.persons.some((p) => p.born !== null && p.ki !== null && Math.abs((year - p.born) - p.ki) > 4)) out.push(tr("far from the AI estimate (more than 4 years)"));
  return out;
}

// ---- Page
export function checkHtml() {
  const e = here();
  if (!e) return `<div class="ck-page"><div class="empty">${tr("No photo chosen.")} <button data-a="ck-back">${tr("Back")}</button></div></div>`;
  const key = keyOf(e), nb = neighbours(e), w = warnings(e), prov = provenanceOf(key), boxes = faceBoxes(key);
  D = buildData(e, key, nb);
  const zu = S.ez[e.keys[0]] || [], nowPlace = placeFrom(key), sug = suggestions(e, key).filter((x) => !nowPlace || x.o.h !== nowPlace.h);
  ui.placeSuggestions = sug;
  const yearText = e.year ? (e.date ? dateLong(e.date) : (e.confirmedFlag || e.draftFlag || e.from === e.to ? String(e.year) : tr("c. {jahr}", {jahr: e.year}))) : tr("still open");
  const last = (ui.ckUndo || [])[(ui.ckUndo || []).length - 1];
  const stripKeys = nb.list.slice(Math.max(0, nb.i - 3), nb.i + 4);
  const changed = D.year !== D.sug || ui.ckYear != null;

  const left = `<div class="ck-col"><div class="ck-eyebrow">${tr("Who")}</div>
    ${D.persons.length ? D.persons.map((p) => `<div class="ck-card" id="ck-pc-${esc(p.id)}" data-hl="${esc(p.id)}"><b>${esc(shortName(p.name))}</b><div class="ck-sub" data-age="${esc(p.id)}"></div></div>`).join("") : `<div class="quiet">${tr("no named person recognized")}</div>`}
    <div class="ck-eyebrow" style="margin-top:8px">${tr("Events in the strip")}</div><div class="ck-col" id="ck-evlist"></div>
    ${zu.length ? `<div class="ck-eyebrow" style="margin-top:8px">${tr("Assigned")}</div>${zu.map((z, i) => `<div class="ck-card ok"><b>${esc(z.text)}</b> ${pill("✓", "ok")}<div class="ck-sub">${esc(z.date)}</div><button class="small" data-a="ev-remove" data-i="${i}" data-uid="${esc(e.uid)}" title="${tr("Remove assignment")}">✕</button></div>`).join("")}` : ""}</div>`;

  const middle = `<div class="ck-stage"><div class="ck-photo ${w.length ? "warn" : ""}" data-a="enlarge" data-keys="${esc(e.keys.join("|"))}" data-key="${esc(key)}" data-uid="${esc(e.uid)}"><img src="${image(key)}" alt="">
      ${boxes.map((b) => `<div class="ck-face" id="ck-pf-${esc(b.pid)}" data-hl="${esc(b.pid)}" style="left:${b.left}%;top:${b.top}%;width:${b.width}%;height:${b.height}%"><span>${esc(first(b.name))}</span></div>`).join("")}</div>
    <div class="ck-line"><span class="ck-year" id="ck-bigyear"></span><span class="quiet" id="ck-bigstate"></span></div>
    <div class="ck-warnline" id="ck-warn"></div>
    ${w.length ? `<div class="box warn">${w.map((x) => esc(x.text)).join(" ")}</div>` : ""}
    <div class="ck-eyebrow">${nb.page ? tr("Page {nr} in the album", {nr: nb.page}) : tr("Neighbors")}</div>
    <div class="ck-strip" aria-label="${tr("Neighbors")}">${stripKeys.map((u) => `<button class="ck-thumb ${u.uid === e.uid ? "cur" : ""}" data-a="ck-go" data-uid="${esc(u.uid)}" title="${esc(u.year ? String(u.year) : tr("open"))}"><img src="${image(u.keys[0])}" alt=""><span>${esc(u.year ? (u.confirmedFlag ? "✓ " : "") + u.year : "?")}</span></button>`).join("")}</div></div>`;

  const right = `<div class="ck-col"><div class="ck-eyebrow">${tr("Around it")}</div>
    ${e.type === "series" ? `<div class="ck-card"><b>${tr("Series {id}", {id: esc(e.s.id)})}</b> ${pill(tr("{n} {n:photo|photos}", {n: e.keys.length}))}<div class="ck-sub">${e.s.status === "ok" ? tr("confirmed") : tr("still to check")}</div></div>` : ""}
    <div class="ck-card"><b>${tr("Estimate")}</b> ${e.estimate ? pill(tr("c. {jahr}", {jahr: e.estimate.year})) : ""}<div class="ck-sub">${e.estimate ? tr("Range {von} to {bis}", {von: e.estimate.from, bis: e.estimate.to}) : tr("no AI estimate")}${e.refined ? " · " + tr("refined by game answers") : ""}${e.rowOnly ? " · " + tr("from the row only") : ""}</div></div>
    <div class="ck-card"><b>${tr("Game")}</b> ${pill(String(voteCount(e.keys)), voteCount(e.keys) ? "ok" : "")}<div class="ck-sub">${tr("answers that involve this photo")}</div></div>
    <div class="ck-card"><b>${tr("Source")}</b><div class="ck-sub">${prov.length ? prov.map((h) => esc(provenanceText(h))).join("<br>") : tr("Not assigned to a photo album yet. The photo is only in the working album.")}</div></div>
    ${e.hint && !w.length ? `<div class="ck-card"><div class="ck-sub">${esc(hintText(e.hint))}</div></div>` : ""}
    <button class="small" data-a="ck-detail">${tr("All details of the photo")}</button></div>`;

  // the strip: lanes of the people (life) or one lane of the album page
  const years = Array.from({length: D.hi - D.lo + 1}, (_, i) => D.lo + i);
  const lanes = D.persons.map((p) => `<div class="ck-lane"><div class="ck-lbl">${esc(first(p.name))}<small>${p.born !== null ? "*" + Math.floor(p.born) : ""}${p.death !== null ? " †" + p.death : ""}</small></div><div class="ck-bar"></div>
      ${p.evs.map((x) => `<div class="ck-ev" data-y="${x.y}" title="${esc(x.text)} ${x.y}" style="left:${pct(x.y)}%"></div>`).join("")}
      ${p.born !== null && p.ki !== null && p.born + p.ki >= D.lo && p.born + p.ki <= D.hi ? `<div class="ck-ki" style="left:${pct(p.born + p.ki)}%"><span>${tr("AI")}</span></div>` : ""}
      ${p.others.map((f) => `<div class="ck-dot ${f.ok ? "ok" : ""}" title="${tr("other photo")} ${f.y}" style="left:${pct(f.y)}%"></div>`).join("")}</div>`).join("") || `<div class="quiet" style="padding:10px 0">${tr("no named person recognized")}</div>`;
  const focus = `<div class="ck-focus"><div class="ck-fhead"><b>${tr("When?")}</b>
      <span class="space"></span>
      <button class="small" data-a="ck-reset" ${changed ? "" : "disabled"}>${tr("Back to suggestion")}</button>
      <button class="small primary" data-a="ck-draft" data-uid="${esc(e.uid)}">${tr("Take over as draft")}</button>
      <button class="small good" data-a="ck-year" data-uid="${esc(e.uid)}">${tr("That is right")}</button>
      ${e.confirmedFlag ? `<button class="small" data-a="anchor-remove" data-uid="${esc(e.uid)}">${tr("Release anchor")}</button>` : ""}</div>
    <div class="ck-scroll"><div style="min-width:640px"><div class="ck-track" id="ck-track">${lanes}<div class="ck-pick" id="ck-pick"><div class="ck-knob">⇄</div></div></div>
      <div class="ck-axis">${years.map((y) => `<span style="left:${pct(y)}%">${y}</span>`).join("")}</div></div></div>
    <div class="ck-sub">${tr("Drag the year left or right. Saved is only what you take over.")} ${tr("Now: {text}", {text: esc(yearText)})} · ${esc(statusLabel(e))}</div></div>`;

  const out = `<div class="ck-out"><div class="ck-eyebrow">${tr("What comes out of this")}</div>
    <div class="ck-orow ${e.confirmedFlag ? "done" : ""}"><div><b>${tr("Year")} ${esc(yearText)}</b><br><span class="quiet">${e.confirmedFlag ? tr("confirmed, counts as an anchor") : (e.draftFlag ? tr("draft, not an anchor yet") : tr("estimate, not confirmed"))}</span></div>
      <div class="ck-targets">${pill(tr("Immich: date"))}${pill(tr("Immich: description"))}</div><div class="ck-btns"></div></div>
    <div class="ck-orow ${nowPlace ? "done" : ""}"><div><b>${tr("Place")} ${esc(nowPlace ? nowPlace.name : (sug[0] ? sug[0].o.n : tr("none yet")))}</b><br><span class="quiet">${nowPlace ? esc(nowPlace.source || "") : (sug[0] ? esc(sug[0].reason) : tr("No suggestion."))}</span></div>
      <div class="ck-targets">${pill(tr("Immich: place"))}${pill(tr("Gramps: place"))}</div>
      <div class="ck-btns">${!nowPlace && sug[0] ? `<button class="small good" data-a="ck-place" data-i="0" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("That is right")}</button>` : ""}
        ${nowPlace ? `<button class="small" data-a="place-remove" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("Remove place")}</button>` : ""}</div></div>
    <details class="ck-more"><summary>${tr("Search or change the place")}</summary>${placeArea(e, key)}</details>
    <div class="ck-undo"><span>${esc(ui.ckMsg || tr("Nothing changed yet. Nothing is written to Immich or Gramps from here."))}</span>
      ${last ? `<a href="#" class="link" data-a="ck-undo">${tr("Undo")}</a>` : ""}<span class="space"></span>
      <button class="small" data-a="ck-go" data-uid="${esc(nb.prev ? nb.prev.uid : e.uid)}" ${nb.prev ? "" : "disabled"}>${tr("← Previous photo")}</button>
      <button class="small primary" data-a="ck-go" data-uid="${esc(nb.next ? nb.next.uid : e.uid)}" ${nb.next ? "" : "disabled"}>${tr("Next photo →")}</button></div></div>`;

  return `<div class="ck-page" id="ck-board"><svg class="ck-svg" id="ck-svg" aria-hidden="true"></svg>
    <div class="ck-top"><button data-a="ck-back">${tr("← Back")}</button><h2>${tr("Check")}</h2><span class="quiet">${esc(key)}</span></div>
    <div class="ck-grid">${left}${middle}${right}</div>${focus}${out}</div>`;
}

// ---- Live update while dragging (nothing is saved)
function live(year) {
  D.year = year;
  const pick = document.getElementById("ck-pick");
  if (!pick) return;
  pick.style.left = pct(year) + "%";
  D.persons.forEach((p) => {
    const el = document.querySelector(`[data-age="${CSS.escape(p.id)}"]`);
    if (!el) return;
    const a = p.born !== null ? Math.round(year - p.born) : null;
    el.innerHTML = a === null ? "" : tr("Age in {jahr}: <b>{a}</b>", {jahr: year, a}) + (p.ki !== null ? ` · ${tr("AI {ki}", {ki: p.ki})} (${Math.abs(a - p.ki) <= 2 ? `<span class="ck-fits">${tr("fits")}</span>` : `<span class="ck-nofit">${tr("differs")}</span>`})` : "");
  });
  const prob = problems(year), w = document.getElementById("ck-warn");
  w.className = "ck-warnline " + (prob.length ? "bad" : "ok");
  w.textContent = prob.length ? "⚠ " + prob.join(" · ") : "✓ " + tr("fits age, events and order");
  document.getElementById("ck-bigyear").textContent = year === D.sug ? tr("c. {jahr}", {jahr: year}) : year + "?";
  document.getElementById("ck-bigstate").textContent = year === D.sug ? tr("suggested") : tr("moved, not saved");
  const reset = document.querySelector('[data-a="ck-reset"]'); if (reset) reset.disabled = year === D.sug;
  document.querySelectorAll(".ck-ev").forEach((x) => x.classList.toggle("fit", Math.abs(+x.dataset.y - year) <= 1));
  const assigned = new Set([].concat(...Object.values(S.ez).map((l) => (l || []).map((z) => z.id))).filter(Boolean));
  const mine = new Set((S.ez[unitOf(ui.focusKey).keys[0]] || []).map((z) => z.id));
  document.getElementById("ck-evlist").innerHTML = D.events.length ? D.events.map((x, i) => {
    const f = Math.abs(x.y - year) <= 1;
    return `<div class="ck-card ${f ? "on" : ""}"><b>${esc(x.text)}</b><div class="ck-sub">${esc(x.date)} · <span class="${f ? "ck-fits" : "ck-nofit"}">${f ? tr("in range") : (x.y < year ? tr("before") : tr("after"))}</span></div>
      ${mine.has(x.id) ? pill("✓", "ok") : `<button class="small" data-a="ck-event" data-i="${i}" data-uid="${esc(ui.focusKey)}">${tr("Assign")}</button>`}</div>`;
  }).join("") : `<div class="quiet">${tr("No events in this strip.")}</div>`;
  void assigned;
  lines();
}
export function checkAfter() {
  if (ui.view !== "check" || !D) return;
  live(D.year);
}

// ---- Lines from the people to their faces
function lines() {
  const board = document.getElementById("ck-board"), svg = document.getElementById("ck-svg");
  if (!board || !svg) return;
  const br = board.getBoundingClientRect();
  let out = "";
  D.persons.forEach((p) => {
    const c = document.getElementById("ck-pc-" + p.id), f = document.getElementById("ck-pf-" + p.id);
    if (!c || !f) return;
    const a = c.getBoundingClientRect(), b = f.getBoundingClientRect();
    const x1 = a.right - br.left, y1 = a.top + a.height / 2 - br.top, x2 = b.left - br.left, y2 = b.top + b.height / 2 - br.top, dx = Math.max(40, (x2 - x1) / 2);
    out += `<path data-l="${esc(p.id)}" d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}"/><circle cx="${x2}" cy="${y2}" r="3.5"/>`;
  });
  svg.innerHTML = out;
}
window.addEventListener("resize", lines);
document.addEventListener("load", (ev) => { if (ev.target && ev.target.closest && ev.target.closest(".ck-photo")) lines(); }, true);

// ---- Dragging the year
let dragging = false;
function yearAt(ev) {
  const r = document.getElementById("ck-track").getBoundingClientRect();
  return Math.round(D.lo + Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * (D.hi - D.lo));
}
document.addEventListener("pointerdown", (ev) => {
  const t = ev.target.closest && ev.target.closest("#ck-track");
  if (!t || !D) return;
  dragging = true; t.setPointerCapture && t.setPointerCapture(ev.pointerId);
  ui.ckYear = yearAt(ev); live(ui.ckYear); ev.preventDefault();
});
document.addEventListener("pointermove", (ev) => { if (dragging && D) { ui.ckYear = yearAt(ev); live(ui.ckYear); } });
document.addEventListener("pointerup", () => { dragging = false; });

// Hovering a person card or a face frame lights up the other one and the line.
const lit = (ev, on) => {
  const el = ev.target.closest && ev.target.closest("[data-hl]");
  if (!el || !el.dataset.hl) return;
  document.querySelectorAll(`#page [data-hl="${CSS.escape(el.dataset.hl)}"]`).forEach((x) => x.classList.toggle("hot", on));
  const l = document.querySelector(`#ck-svg path[data-l="${CSS.escape(el.dataset.hl)}"]`);
  if (l) l.classList.toggle("hot", on);
};
document.addEventListener("mouseover", (ev) => lit(ev, true));
document.addEventListener("mouseout", (ev) => lit(ev, false));

// ---- Actions
const toTop = () => window.scrollTo(0, 0);
export const actions = {
  "ck-open": (el) => {
    const e = unitOf(el.dataset.uid);
    if (!e) return;
    ui.checkBack = {view: ui.view, personId: ui.personId, task: ui.task, albumId: ui.albumId, eventId: ui.eventId, mode: ui.mode};
    ui.ckUndo = []; ui.ckMsg = ""; ui.ckYear = null;
    ui.focusKey = e.uid; ui.photoKey = el.dataset.key || keyOf(e); ui.view = "check";
    toTop(); draw();
  },
  "ck-back": () => {
    Object.assign(ui, ui.checkBack || {view: "start"});
    if (ui.view === "check") ui.view = "start";
    draw();
  },
  "ck-go": (el) => {
    const e = unitOf(el.dataset.uid);
    if (!e) return;
    ui.focusKey = e.uid; ui.photoKey = e.keys[0]; ui.ckYear = null; toTop(); draw();
  },
  "ck-detail": () => { Object.assign(ui, ui.checkBack || {view: "start"}); if (ui.view === "check") ui.view = "start"; draw(); },
  "ck-reset": () => { ui.ckYear = null; draw(); },
  "ck-draft": (el) => {
    const e = unitOf(el.dataset.uid), y = ui.ckYear ?? (D && D.year);
    if (!e || !y) return;
    return change(tr("Draft {jahr}? set", {jahr: y}), e, () => setDraft(e.uid, y));
  },
  "ck-year": (el) => {
    const e = unitOf(el.dataset.uid), y = ui.ckYear;
    if (!e) return;
    if (y != null && y !== e.year) return change(tr("Year {jahr} confirmed", {jahr: y}), e, async () => { await setDraft(e.uid, y); await confirmIt([unitOf(e.uid)]); });
    return change(tr("Year confirmed"), e, () => confirmIt([e]));
  },
  "ck-place": (el) => { const e = here(); if (e) return change(tr("Place set"), e, () => aPlaces["place-prefill"](el)); },
  "ck-event": (el) => {
    const e = here(), x = D && D.events[+el.dataset.i];
    if (!e || !x) return;
    return change(tr("Event assigned"), e, async () => {
      const entry = {id: x.id, pid: x.pid, text: x.text, date: x.date, iso: x.iso};
      e.keys.forEach((k) => { S.ez[k] = [...(S.ez[k] || []).filter((z) => z.id !== entry.id), entry]; });
      mark(); await saveEz();
    });
  },
  "ck-undo": async (el, ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    const last = (ui.ckUndo || []).pop();
    if (!last) return;
    await restore(last.before);
    ui.ckMsg = tr("Undone: {what}", {what: last.label}); draw();
  },
};
