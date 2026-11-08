// Check view (0.11, step 1): one photo in the middle, all evidence around it, and below it what would come out of it.
// It only uses the actions that exist elsewhere (anchor, place, event). Nothing is written to Immich or Gramps from here;
// the one Undo at the bottom takes back the last change made in this view.
import {S, ui, draw, mark, saveCorr, saveEz, savePlaces} from "../state.js";
import {esc, image, dateLong} from "../util.js";
import {unitOf, unitFromKey, unitList, ageList, warnings, statusLabel, shortName, placeFrom, taskCounts, hintText} from "../model.js";
import {provenanceOf, provenanceText, albumKeys} from "../provenance.js";
import {confirmIt} from "./actions.js";
import {candidates} from "./event.js";
import {grShort, grDateText} from "../gramps.js";
import {suggestions, placeArea, actions as aPlaces} from "./places.js";
import {actions as aEvent} from "./event.js";
import {tr} from "../language.js";

const here = () => (ui.focusKey ? unitOf(ui.focusKey) : null);
const keyOf = (e) => (e.keys.includes(ui.photoKey) ? ui.photoKey : e.keys[0]);

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
  draw();
}

// ---- Page
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

export function checkHtml() {
  const e = here();
  if (!e) return `<div class="ck-page"><div class="empty">${tr("No photo chosen.")} <button data-a="ck-back">${tr("Back")}</button></div></div>`;
  const key = keyOf(e), nb = neighbours(e), w = warnings(e), prov = provenanceOf(key);
  const people = ageList(key, e.decimal_year || e.year), boxes = faceBoxes(key);
  const zu = S.ez[e.keys[0]] || [], cand = candidates(e), nowPlace = placeFrom(key), sug = suggestions(e, key).filter((x) => !nowPlace || x.o.h !== nowPlace.h);
  ui.ezCand = cand; ui.placeSuggestions = sug;
  const yearText = e.year ? (e.date ? dateLong(e.date) : (e.confirmedFlag || e.draftFlag || e.from === e.to ? String(e.year) : tr("c. {jahr}", {jahr: e.year}))) : tr("still open");
  const last = (ui.ckUndo || [])[ (ui.ckUndo || []).length - 1];
  const stripKeys = nb.list.slice(Math.max(0, nb.i - 3), nb.i + 4);

  const left = `<div class="ck-col"><div class="ck-eyebrow">${tr("Who")}</div>
    ${people.length ? people.map((p) => { const b = boxes.find((x) => x.name === p.name); return `<div class="ck-card" data-hl="${b ? esc(b.pid) : ""}"><b>${esc(shortName(p.name))}</b>
      <div class="ck-sub">${p.currentVal !== null ? (p.currentVal < 0 ? tr("before birth") : tr("Age c. {alter} y", {alter: p.currentVal})) : ""}${p.ki !== null ? (p.currentVal !== null ? ` · ${tr("AI {ki}", {ki: p.ki})}` : tr("AI age c. {ki} y", {ki: p.ki})) : ""}</div></div>`; }).join("") : `<div class="quiet">${tr("no named person recognized")}</div>`}
    <div class="ck-eyebrow" style="margin-top:8px">${tr("Event")}</div>
    ${zu.map((z, i) => `<div class="ck-card ok"><b>${esc(z.text)}</b> ${pill("✓", "ok")}<div class="ck-sub">${esc(z.date)}</div><button class="small" data-a="ev-remove" data-i="${i}" data-uid="${esc(e.uid)}" title="${tr("Remove assignment")}">✕</button></div>`).join("")}
    ${!zu.length && !cand.length ? `<div class="quiet">${e.year ? tr("No matching events in the period of the photo.") : tr("The photo has no year yet, so there are no suggestions.")}</div>` : ""}
    ${cand.slice(0, 3).map((c, i) => `<div class="ck-card"><b>${esc(grShort(c.ev, true))}</b><div class="ck-sub">${esc(grDateText(c.ev.date))} · ${esc(c.p.name)}</div><button class="small" data-a="ck-event" data-i="${i}" data-uid="${esc(e.uid)}">${tr("Assign")}</button></div>`).join("")}</div>`;

  const middle = `<div class="ck-stage"><div class="ck-photo ${w.length ? "warn" : ""}" data-a="enlarge" data-keys="${esc(e.keys.join("|"))}" data-key="${esc(key)}" data-uid="${esc(e.uid)}"><img src="${image(key)}" alt="">
      ${boxes.map((b) => `<div class="ck-face" data-hl="${esc(b.pid)}" style="left:${b.left}%;top:${b.top}%;width:${b.width}%;height:${b.height}%"><span>${esc(shortName(b.name))}</span></div>`).join("")}</div>
    <div class="ck-line"><span class="ck-year">${esc(yearText)}</span><span class="quiet">${esc(statusLabel(e))}</span></div>
    ${w.length ? `<div class="box warn">${w.map((x) => esc(x.text)).join(" ")}</div>` : ""}
    <div class="ck-eyebrow">${nb.page ? tr("Page {nr} in the album", {nr: nb.page}) : tr("Neighbors")}</div>
    <div class="ck-strip">${stripKeys.map((u) => `<button class="ck-thumb ${u.uid === e.uid ? "cur" : ""}" data-a="ck-go" data-uid="${esc(u.uid)}" title="${esc(u.year ? String(u.year) : tr("open"))}"><img src="${image(u.keys[0])}" alt=""><span>${esc(u.year ? (u.confirmedFlag ? "✓ " : "") + u.year : "?")}</span></button>`).join("")}</div></div>`;

  const right = `<div class="ck-col"><div class="ck-eyebrow">${tr("Around it")}</div>
    ${e.type === "series" ? `<div class="ck-card"><b>${tr("Series {id}", {id: esc(e.s.id)})}</b> ${pill(tr("{n} {n:photo|photos}", {n: e.keys.length}))}<div class="ck-sub">${e.s.status === "ok" ? tr("confirmed") : tr("still to check")}</div></div>` : ""}
    <div class="ck-card"><b>${tr("Estimate")}</b> ${e.estimate ? pill(tr("c. {jahr}", {jahr: e.estimate.year})) : ""}<div class="ck-sub">${e.estimate ? tr("Range {von} to {bis}", {von: e.estimate.from, bis: e.estimate.to}) : tr("no AI estimate")}${e.refined ? " · " + tr("refined by game answers") : ""}${e.rowOnly ? " · " + tr("from the row only") : ""}</div></div>
    <div class="ck-card"><b>${tr("Game")}</b> ${pill(String(voteCount(e.keys)), voteCount(e.keys) ? "ok" : "")}<div class="ck-sub">${tr("answers that involve this photo")}</div></div>
    <div class="ck-card"><b>${tr("Source")}</b><div class="ck-sub">${prov.length ? prov.map((h) => esc(provenanceText(h))).join("<br>") : tr("Not assigned to a photo album yet. The photo is only in the working album.")}</div></div>
    ${e.hint && !w.length ? `<div class="ck-card"><div class="ck-sub">${esc(hintText(e.hint))}</div></div>` : ""}
    <div class="ck-card ${w.length ? "bad" : ""}"><b>${tr("Contradictions")}</b><div class="ck-sub">${w.length ? w.map((x) => esc(x.text)).join(" ") : tr("none")}</div></div>
    <button class="small" data-a="ck-detail">${tr("All details of the photo")}</button></div>`;

  const out = `<div class="ck-out"><div class="ck-eyebrow">${tr("What comes out of this")}</div>
    <div class="ck-orow ${e.confirmedFlag ? "done" : ""}"><div><b>${tr("Year")} ${esc(yearText)}</b><br><span class="quiet">${e.confirmedFlag ? tr("confirmed, counts as an anchor") : (e.draftFlag ? tr("draft, not an anchor yet") : tr("estimate, not confirmed"))}</span></div>
      <div class="ck-targets">${pill(tr("Immich: date"))}${pill(tr("Immich: description"))}</div>
      <div class="ck-btns">${e.confirmedFlag ? `<button class="small" data-a="anchor-remove" data-uid="${esc(e.uid)}">${tr("Release anchor")}</button>` : (e.year ? `<button class="small good" data-a="ck-year" data-uid="${esc(e.uid)}">${tr("That is right")}</button>` : "")}
        <button class="small" data-a="date" data-uid="${esc(e.uid)}">${tr("Other year …")}</button></div></div>
    <div class="ck-orow ${nowPlace ? "done" : ""}"><div><b>${tr("Place")} ${esc(nowPlace ? nowPlace.name : (sug[0] ? sug[0].o.n : tr("none yet")))}</b><br><span class="quiet">${nowPlace ? esc(nowPlace.source || "") : (sug[0] ? esc(sug[0].reason) : tr("No suggestion."))}</span></div>
      <div class="ck-targets">${pill(tr("Immich: place"))}${pill(tr("Gramps: place"))}</div>
      <div class="ck-btns">${!nowPlace && sug[0] ? `<button class="small good" data-a="ck-place" data-i="0" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("That is right")}</button>` : ""}
        ${nowPlace ? `<button class="small" data-a="place-remove" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("Remove place")}</button>` : ""}</div></div>
    <div class="ck-orow ${zu.length ? "done" : ""}"><div><b>${tr("Event")} ${esc(zu.length ? zu.map((z) => z.text).join(", ") : (cand[0] ? grShort(cand[0].ev, true) : tr("none yet")))}</b><br><span class="quiet">${zu.length ? tr("A photo can belong to several events.") : (cand[0] ? tr("Life line of {name}", {name: esc(cand[0].p.name)}) : tr("No suggestion."))}</span></div>
      <div class="ck-targets">${pill(tr("Gramps: event"))}</div>
      <div class="ck-btns">${cand[0] ? `<button class="small good" data-a="ck-event" data-i="0" data-uid="${esc(e.uid)}">${tr("That is right")}</button>` : ""}</div></div>
    <details class="ck-more"><summary>${tr("Search or change the place")}</summary>${placeArea(e, key)}</details>
    <div class="ck-undo"><span>${esc(ui.ckMsg || tr("Nothing changed yet. Nothing is written to Immich or Gramps from here."))}</span>
      ${last ? `<a href="#" class="link" data-a="ck-undo">${tr("Undo")}</a>` : ""}<span class="space"></span>
      <button class="small" data-a="ck-go" data-uid="${esc(nb.prev ? nb.prev.uid : e.uid)}" ${nb.prev ? "" : "disabled"}>${tr("← Previous photo")}</button>
      <button class="small primary" data-a="ck-go" data-uid="${esc(nb.next ? nb.next.uid : e.uid)}" ${nb.next ? "" : "disabled"}>${tr("Next photo →")}</button></div></div>`;

  return `<div class="ck-page"><div class="ck-top"><button data-a="ck-back">${tr("← Back")}</button><h2>${tr("Check")}</h2><span class="quiet">${esc(key)}</span></div>
    <div class="ck-grid">${left}${middle}${right}</div>${out}</div>`;
}

// ---- Actions
export const actions = {
  "ck-open": (el) => {
    const e = unitOf(el.dataset.uid);
    if (!e) return;
    ui.checkBack = {view: ui.view, personId: ui.personId, task: ui.task, albumId: ui.albumId, eventId: ui.eventId, mode: ui.mode};
    ui.ckUndo = []; ui.ckMsg = "";
    ui.focusKey = e.uid; ui.photoKey = el.dataset.key || keyOf(e); ui.view = "check";
    window.scrollTo(0, 0); draw();
  },
  "ck-back": () => {
    Object.assign(ui, ui.checkBack || {view: "start"});
    if (ui.view === "check") ui.view = "start";
    draw();
  },
  "ck-go": (el) => {
    const e = unitOf(el.dataset.uid);
    if (!e) return;
    ui.focusKey = e.uid; ui.photoKey = e.keys[0]; window.scrollTo(0, 0); draw();
  },
  "ck-detail": () => { Object.assign(ui, ui.checkBack || {view: "start"}); if (ui.view === "check") ui.view = "start"; draw(); },
  "ck-year": (el) => { const e = unitOf(el.dataset.uid); if (e) return change(tr("Year confirmed"), e, () => confirmIt([e])); },
  "ck-place": (el) => { const e = here(); if (e) return change(tr("Place set"), e, () => aPlaces["place-prefill"](el)); },
  "ck-event": (el) => { const e = here(); if (e) return change(tr("Event assigned"), e, () => aEvent["ev-assign"](el)); },
  "ck-undo": async (el, ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    const last = (ui.ckUndo || []).pop();
    if (!last) return;
    await restore(last.before);
    ui.ckMsg = tr("Undone: {what}", {what: last.label}); draw();
  },
};

// Hovering a person card or a face frame lights up the other one.
const lit = (ev, on) => {
  const el = ev.target.closest && ev.target.closest("[data-hl]");
  if (!el || !el.dataset.hl) return;
  document.querySelectorAll(`#page [data-hl="${CSS.escape(el.dataset.hl)}"]`).forEach((x) => x.classList.toggle("hot", on));
};
document.addEventListener("mouseover", (ev) => lit(ev, true));
document.addEventListener("mouseout", (ev) => lit(ev, false));
