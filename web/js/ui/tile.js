// Photo tile: image, year, people, status. Used in timeline, task lists, inbox and albums.
import {S, ui} from "../state.js";
import {esc, image, dateShort} from "../util.js";
import {warnings, statusLabel, statusClass, peopleTextUnit, yearShort, unitOf, KINDS} from "../model.js";
import {tr} from "../language.js";

export function yearMark(e) {
  if (!e.year) return tr("open");
  if (e.date) return (e.confirmedFlag ? "✓ " : "") + dateShort(e.date);
  if (e.confirmedFlag) return "✓ " + e.year;
  return (e.draftFlag ? "" : tr("c. ")) + e.year + (e.draftFlag ? "?" : "");
}
export function tileObj(e, opt = {}) {
  const w = warnings(e), cssClass = w.length ? "warn" : statusClass(e), key = opt.key || e.keys[0];
  const chosen = ui.focusKey === e.uid, marked = ui.sel.has(e.uid);
  const status = w.length ? `${tr("Warning: {typ}{hart}", {typ: w[0].type, hart: w[0].hard ? "" : "?"})}` : statusLabel(e) + (e.type === "series" ? `${tr(", series {id}", {id: e.s.id})}` : "") + (opt.extraVal ? ", " + opt.extraVal : "");
  const fresh = opt.new ? '<span class="new-mark">' + tr("new") + '</span>' : "";
  return `<div class="tile ${cssClass} ${chosen ? "focus" : ""} ${marked ? "marked" : ""}" data-uid="${esc(e.uid)}" data-key="${esc(key)}">
    <div class="image" data-a="choose" data-uid="${esc(e.uid)}" data-key="${esc(key)}">
      <img loading="lazy" src="${image(key)}" alt="" onerror="this.style.display='none'">
      <span class="year ${cssClass}">${esc(yearMark(e))}</span>${fresh}${e.kind ? `<span class="kind-mark">${esc(KINDS[e.kind])}</span>` : ""}
      ${S.gw && S.gw[key] ? `<span class="gr-mark" title="${tr("Already in Gramps: {gid}", {gid: esc(S.gw[key].gid)})}">Gramps</span>` : ""}
      ${e.type === "series" ? `<span class="series-mark" title="${tr("Series {id}", {id: esc(e.s.id)})}">${tr("{n} {n:photo|photos}", {n: e.keys.length})}${e.cardKeys && !e.kind ? tr(", {n} {n:card|cards}", {n: e.cardKeys.length}) : ""}</span>` : ""}
      <span class="tick-box ${marked ? "on" : ""}" data-a="select" data-uid="${esc(e.uid)}" title="${tr("Select for merging")}">${marked ? "✓" : ""}</span></div>
    <div class="info" data-a="choose" data-uid="${esc(e.uid)}" data-key="${esc(key)}"><div class="person">${esc(opt.title || peopleTextUnit(e) || tr("unnamed"))}</div><div class="stat ${cssClass}">${esc(status)}</div>${opt.extra || ""}</div></div>`;
}
export function tileGrid(unitsList, opt = {}) {
  if (!unitsList.length) return '<div class="empty">' + tr("Nothing in this view.") + '</div>';
  const fresh = opt.new || new Set();
  return `<div class="grid">${unitsList.map((e) => tileObj(e, {new: e.keys.some((k) => fresh.has(k))})).join("")}</div>`;
}
// Selection bar at the bottom (only when units are selected)
export function selectionBar() {
  const n = ui.sel.size;
  if (!n) return "";
  const chips = [...ui.sel].map(unitOf).filter(Boolean).map((e) => `<span class="basket-chip" title="${tr("Take out of the basket")}">${esc((e.type === "series" ? tr("Series {id}", {id: e.s.id}) : peopleTextUnit(e) || tr("unnamed")) + (e.year ? " " + yearShort(e) : ""))}<button data-a="select" data-uid="${esc(e.uid)}" aria-label="${tr("Take out of the basket")}">×</button></span>`).join("");
  return `<div class="selection-bar"><b>${tr("{n} {n:unit|units} selected", {n})}</b><span class="basket-chips">${chips}</span>
    <button class="primary" data-a="merge" ${n >= 2 ? "" : "disabled"}>${tr("Merge into one series")}</button>
    <button data-a="date-select">${tr("Set date …")}</button><button data-a="kind-select">${tr("Type: card, document …")}</button><button class="good" data-a="confirmed-select">${tr("✓ Set as anchor")}</button>
    <span class="space"></span><button class="small" data-a="deselect">${tr("Clear selection")}</button></div>`;
}
