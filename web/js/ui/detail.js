// Right column: the chosen photo (or series) with dating, people, source and actions.
import {S, ui, draw} from "../state.js";
import {setDraft} from "./actions.js";
import {esc, image, dateLong} from "../util.js";
import {unitOf, personTiles, personOf, warnings, statusLabel, statusClass, ageList, shortName, hintKind, hintText, notInAlbum, KINDS, kindOf, roughTime} from "../model.js";
import {provenanceOf, provenanceText} from "../provenance.js";
import {grampsBereich} from "./gramps.js";
import {eventRange} from "./event.js";
import {hintsArea, cardRange} from "./hints.js";
import {placeArea} from "./places.js";
import {tr} from "../language.js";

// A person page exists for people with photos in the work list, not for “… Unknown”
const personPage = (name) => (S.pf && S.pf.ok ? S.pf.people.find((q) => q.name === name && q.photos.length) : null) || null;

// Small timeline: the span of the estimate. The dot can be moved with the mouse; on release the year becomes a draft.
function spanBar(e) {
  if (!e.year || e.confirmedFlag || e.date) return "";
  const sp = e.draftFlag ? e.estimate : e;     // for the draft the original span is kept
  if (!sp || sp.from === undefined || sp.from === null || sp.from === sp.to) return "";
  const lo = Math.min(sp.from, e.year) - 3, hi = Math.max(sp.to, e.year) + 3, pos = (y) => (100 * (y - lo) / (hi - lo)).toFixed(1) + "%";
  return `<div class="span drag" data-uid="${esc(e.uid)}" data-lo="${lo}" data-hi="${hi}" data-from="${sp.from}" data-to="${sp.to}" title="${tr("Grab the dot and move it within the range (becomes a draft)")}">
    <div class="stretch" style="left:${pos(sp.from)};width:${(100 * (sp.to - sp.from) / (hi - lo)).toFixed(1)}%"></div><div class="dot" style="left:${pos(e.year)}"></div></div>
    <div class="quiet" style="font-size:12px;margin-top:4px">${e.draftFlag ? tr("Draft. Moving the dot changes it.") : tr("Moving the dot creates a draft.")}</div>`;
}
let drag = null;
function yearOn(ev) {
  const r = drag.el.getBoundingClientRect(), f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  return Math.min(drag.to, Math.max(drag.from, Math.round(drag.lo + f * (drag.hi - drag.lo))));
}
function showYear(j) {
  drag.j = j;
  drag.point.style.left = (100 * (j - drag.lo) / (drag.hi - drag.lo)).toFixed(1) + "%";
  const t = document.querySelector("#detail .dating .large"); if (t) t.textContent = j + "?";
}
document.addEventListener("pointerdown", (ev) => {
  const el = ev.target.closest(".span.drag");
  if (!el) return;
  const d = el.dataset;
  drag = {el, point: el.querySelector(".dot"), uid: d.uid, lo: +d.lo, hi: +d.hi, from: +d.from, to: +d.to, j: null};
  el.setPointerCapture && el.setPointerCapture(ev.pointerId);
  showYear(yearOn(ev)); ev.preventDefault();
});
document.addEventListener("pointermove", (ev) => { if (drag) showYear(yearOn(ev)); });
document.addEventListener("pointerup", async () => {
  if (!drag) return;
  const {uid, j} = drag; drag = null;
  const e = unitOf(uid);
  if (e && j !== null && !(e.draftFlag && e.year === j)) await setDraft(uid, j); else draw();
});

// Series in the person view: which photo stands for the series in the timeline (the cover photo)?
function titleButton(e, key) {
  if (e.type !== "series" || ui.view !== "person") return "";
  const p = personOf(ui.personId);
  if (!p) return "";
  const kk = personTiles(p).find((k) => k.uid === e.uid);
  if (!kk) return "";
  return kk.f.key === key ? '<div class="quiet" style="margin:6px 0">' + tr("✓ This photo represents the series in timeline and sorting. To change it, click another small picture of the series.") + '</div>' : "";
}
// What Immich says about the capture date of this photo, and why it does or does not count as set by you (shown only when it does not count).
function seenLine(key) {
  const c = S.immichSeen[key]; if (!c || !c.d) return "";
  const d = dateLong(c.d), t = {
    close: tr("Immich: capture date {d}, scan date {s}, only {n} days apart. A date counts as set by you only if it is more than 2 days away from the scan date.", {d, s: dateLong(c.s), n: c.n || 0}) + (c.raw ? ` (${Object.entries(c.raw).map(([k, v]) => k + " " + (v || "–")).join(", ")})` : ""),
    camera: tr("Immich: capture date {d}, but the photo has camera data and is in the working album. It does not count as a date. Put it into the anchor album to use it.", {d}),
    grimmich: tr("Immich: capture date {d}, written by Grimmich.", {d}),
    set: tr("Immich: capture date {d}, counts as set by you.", {d}) + (c.raw ? ` (${Object.entries(c.raw).map(([k, v]) => k + " " + (v || "–")).join(", ")})` : ""),
  }[c.why];
  return t ? `<div class="quiet" style="font-size:12px">${esc(t)}</div>` : "";
}

export function detailHtml() {
  const e = ui.focusKey ? unitOf(ui.focusKey) : null;
  if (!e) return `<div class="detail-head"><h2>${tr("Selected photo")}</h2></div><div class="empty">${tr("Click a tile to see its dating, people and source here.")}</div>`;
  const key = e.keys.includes(ui.photoKey) ? ui.photoKey : e.keys[0];
  const w = warnings(e), cssClass = w.length ? "warn" : statusClass(e);
  const heading = e.year ? (e.date ? dateLong(e.date) : (e.confirmedFlag || e.draftFlag || e.from === e.to ? String(e.year) : tr("c. {jahr}", {jahr: e.year}))) : tr("still open");
  const span = e.year && !e.date && !e.confirmedFlag && !e.draftFlag && e.from !== e.to ? `${tr("Range {von} to {bis}", {von: e.from, bis: e.to})}` : statusLabel(e);
  const peopleList = ageList(key, e.decimal_year || e.year);
  const prov = provenanceOf(key);
  const changed = e.keys.filter((k) => S.changed[k]);
  const hKind = hintKind(e.hint);
  return `<div class="detail-head"><h2>${tr("Selected photo")}</h2><span class="quiet">${esc(key)}</span></div>
    <div class="detail-image ${cssClass}" data-a="enlarge" data-keys="${esc(e.keys.join("|"))}" data-key="${esc(key)}" data-uid="${esc(e.uid)}"><img src="${image(key)}" alt=""><span class="hint">${tr("Click for full view")}</span></div>
    ${e.keys.length > 1 ? `<div class="thumb">${e.keys.map((k) => `<img src="${image(k)}" alt="" class="${k === key ? "on" : ""} ${notInAlbum(k) ? "removed" : ""}"${notInAlbum(k) ? ` title="${tr("no longer in the album")}"` : ""} data-a="photo-pick" data-key="${esc(k)}">`).join("")}</div>` : ""}
    ${titleButton(e, key)}
    ${e.keys.some(notInAlbum) ? `<div class="box info">${(() => { const n = e.keys.filter(notInAlbum).length; return tr("<b>{wer} no longer in the working or anchor album</b> (faded in the strip above). {n:It is|They are} not written. Under “Manage series” you can remove {n:it|them} from the series.", {n, wer: n === 1 ? tr("One photo is") : tr("{n} photos are", {n})}); })()}</div>` : ""}
    ${w.length ? `<div class="box warn"><b>${w.length === 1 ? esc(w[0].type) : tr("{n} warnings", {n: w.length})}${w[0].hard ? "" : tr(" (estimated only)")}.</b> ${w.map((x) => esc(x.text)).join(" ")}</div>` : ""}
    ${e.rowOnly && !e.confirmedFlag && !e.draftFlag ? `<div class="box info">${tr("This estimate comes only from the place of the photo in your rows between fixed anchors (there is no AI estimate).")}</div>` : ""}
    ${e.refined && e.estimate && !e.confirmedFlag && !e.draftFlag ? `<div class="box info">${tr("Refined by your answers in the game. The AI alone said: ca. {year} ({from}–{to}).", {year: e.estimate.year, from: e.estimate.from, to: e.estimate.to})}</div>` : ""}
    ${e.hint && !w.length ? `<div class="box ${hKind === "no" ? "warn" : "info"}">${esc(hintText(e.hint))}</div>` : ""}
    ${changed.length ? `<div class="box warn"><b>${tr("Changed in Immich.")}</b> ${esc(S.changed[changed[0]].texts.join(" "))}
      <div><button class="small" data-a="seen" data-key="${esc(changed[0])}">${tr("Seen")}</button></div></div>` : ""}
    ${e.immich ? `<div class="box info"><b>${e.camera ? tr("Digital photo, date from the camera") : tr("Set by you in Immich")}:</b> ${tr("{immichDatum}. This date counts as a fixed anchor and is not touched when writing.{bis}", {immichDatum: esc(dateLong(e.immichDate)), bis: e.estimate ? ` ${tr("For comparison, the AI estimates c. {jahr} ({von}–{bis}).", {jahr: e.estimate.year, von: e.estimate.from, bis: e.estimate.to})}` : ""})}</div>` : ""}
    ${!e.immichIgnored ? seenLine(key) : ""}
    ${e.immichIgnored ? `<div class="box info">${tr("In Immich you set the date {immichDatum}. Grimmich does not use it as an anchor here and writes nothing over it.", {immichDatum: esc(dateLong(e.immichDate))})} <div><button class="small" data-a="immich-anchor" data-uid="${esc(e.uid)}">${tr("Use as anchor again")}</button></div></div>` : ""}
    ${!e.immich && !e.immichIgnored && e.immichDate && e.confirmedFlag && (e.date ? e.date !== e.immichDate : e.year !== +e.immichDate.slice(0, 4)) ? `<div class="box warn">${tr("In Immich you set {immichDatum}. You changed it here. When writing, it is only replaced after your explicit confirmation in the preview.", {immichDatum: esc(dateLong(e.immichDate))})}</div>` : ""}
    <div><div class="field-name">${e.type === "series" ? tr("Type of this photo") : tr("Type")}</div><div class="kind-chips">${[["", tr("Photo")], ...Object.entries(KINDS)].map(([k, n]) => `<button class="small ${kindOf(key) === k ? "good" : ""}" data-a="kind-set" data-uid="${esc(e.uid)}" data-key="${esc(key)}" data-kind="${k}">${esc(n)}</button>`).join("")}</div>
      ${kindOf(key) ? `<div class="quiet" style="font-size:12px;margin-top:6px">${e.type === "series" ? tr("Rough time of the card (only a hint for the series, not a date):") : tr("Rough time of the card (from … to):")}
        <input type="number" id="rough-from" value="${(roughTime(key) || {}).from || ""}" placeholder="${tr("from")}" style="width:7em"> ${tr("to")} <input type="number" id="rough-to" value="${(roughTime(key) || {}).to || ""}" placeholder="${tr("to")}" style="width:7em">
        <button class="small" data-a="rough-set" data-key="${esc(key)}">${tr("Save")}</button></div>
        <div class="quiet" style="font-size:12px;margin-top:4px">${e.type === "series" ? tr("The card stays in the series. Its rough time narrows down the time of the series but does not replace it.") : tr("Is not sorted and not searched for in series automatically. The rough time is shown below as an estimate. With “Set as anchor” it becomes the date, or enter an exact year with “Enter year”.")}</div>` : ""}</div>
    ${cardRange(e)}
    <div><div class="field-name">${tr("Dating")}</div>
      <div class="dating"><span class="large ${cssClass}">${esc(heading)}</span><span class="quiet">${esc(span)}</span></div>${spanBar(e)}</div>
    ${e.type === "series" ? `<div><div class="field-name">${tr("Series {id}", {id: esc(e.s.id)})}</div>
      <div class="row">${tr("{n} {n:photo|photos} · {state}", {n: e.keys.length, state: e.s.status === "ok" ? tr("confirmed") : tr("still to check")})}
      <button class="small good" data-a="ok-series" data-sid="${esc(e.s.id)}">${e.s.status === "ok" ? tr("✓ Series confirmed") : tr("✓ Series is correct")}</button>
      <button class="small" data-a="series-show" data-sid="${esc(e.s.id)}">${tr("Manage series")}</button></div></div>` : ""}
    <div><div class="field-name">${tr("People in the photo")}</div>
      ${peopleList.length ? peopleList.map((p) => { const pp = personPage(p.name); return `<div class="row-pair"><span>${pp ? `<a href="#" class="link" data-a="go-person" data-pid="${esc(pp.id)}" data-key="${esc(key)}" title="${tr("Open person page")}">${esc(shortName(p.name))}</a>` : esc(shortName(p.name))}</span><span class="quiet">${p.currentVal !== null ? (p.currentVal < 0 ? tr("before birth") : tr("Age c. {alter} y", {alter: p.currentVal})) : ""}${p.ki !== null ? (p.currentVal !== null ? ` · ${tr("AI {ki}", {ki: p.ki})}` : `${tr("AI age c. {ki} y", {ki: p.ki})}`) : ""}</span></div>`; }).join("") : '<div class="quiet">' + tr("no named person recognized") + '</div>'}</div>
    <div><div class="field-name">${tr("Source")}</div>
      ${prov.length ? prov.map((h) => `<div><a href="#" class="link" data-a="go-album" data-id="${esc(h.albumId)}" data-key="${esc(key)}" title="${tr("Open album and show this photo there")}">${esc(provenanceText(h))}</a></div>`).join("") : '<div class="quiet">' + tr("Not assigned to a photo album yet. The photo is only in the working album.") + '</div>'}</div>
    ${hintsArea(e, key)}
    ${eventRange(e)}
    ${placeArea(e, key)}
    ${grampsBereich(e, key)}
    <div class="button-column">
      <button class="${w.length ? "warn" : ""}" data-a="faces" data-uid="${esc(e.uid)}" data-key="${esc(key)}">${tr("Check faces")}</button>
      <button data-a="date" data-uid="${esc(e.uid)}">${tr("Enter year")}</button>
      ${e.year && !e.confirmedFlag ? `<button class="primary" data-a="anchor" data-uid="${esc(e.uid)}">${tr("Set as anchor")}</button>` : ""}
      ${e.confirmedFlag ? `<button data-a="anchor-remove" data-uid="${esc(e.uid)}">${e.immich ? (e.camera ? tr("Do not use camera date as anchor") : tr("Do not use Immich date as anchor")) : tr("Release anchor (back to estimate)")}</button>` : ""}
      ${e.draftFlag ? `<button data-a="draft-remove" data-uid="${esc(e.uid)}">${tr("Discard draft")}</button>` : ""}
    </div>`;
}
