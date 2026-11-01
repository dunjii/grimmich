// Assign photos to Gramps events: suggestions by date and people, assignment (several possible), adopt the date.
import {S, ui, draw, mark, saveEz, saveCorr} from "../state.js";
import {esc} from "../util.js";
import {dateValues} from "../util.js";
import {setCorr, unitOf, unitFromKey} from "../model.js";
import {tileGrid} from "./tile.js";
import {loadEvents, GR_SIDE, grShort, grYearDec, grDateText} from "../gramps.js";
import {tr} from "../language.js";

export const peopleOn = (key) => (S.pf && S.pf.ok ? S.pf.people.filter((p) => p.photos.some((f) => f.key === key)) : []);
const ownRange = (e) => ({from: (e.from || e.year) - 0, to: (e.to || e.year) + 1});   // [from, to+1) in years
function isoFrom(ev) {
  const d = ev.date;
  if (!d || d.mode !== "genau" || d.estimated || !d.from[0] || !d.from[1] || !d.from[2]) return "";
  return `${d.from[0]}-${String(d.from[1]).padStart(2, "0")}-${String(d.from[2]).padStart(2, "0")}`;
}
// Candidates for a unit: events of the people on the photos whose period fits the photo
function candidates(e) {
  const keys = e.keys, pers = [...new Map(keys.flatMap(peopleOn).map((p) => [p.id, p])).values()];
  const already = new Set((S.ez[keys[0]] || []).map((z) => z.id));
  const b = e.year ? ownRange(e) : null, middle = e.decimal_year || e.year;
  const seenSet = new Map();
  pers.forEach((p) => {
    const st = S.grEv[p.id];
    if (!st || !st.list) return;
    st.list.forEach((ev) => {
      if (already.has(ev.id)) return;
      const fromVal = grYearDec(ev.date.from), bis = ev.date.to ? grYearDec(ev.date.to) + (ev.date.to[1] ? 0 : 1) : fromVal;
      const fits = b ? fromVal <= b.to + 1 && bis >= b.from - 1 : false;
      if (!ui.ezAll && !fits) return;
      const dist = b ? Math.max(0, fromVal - b.to, b.from - bis) : 0;
      const iso = isoFrom(ev);
      let score = (fits ? 10 : 0) - dist * 0.5 + (ev.own ? 2 : ev.near ? 1 : 0) - (GR_SIDE.has(ev.kind) ? 3 : 0);
      if (iso && b && +iso.slice(0, 4) >= b.from && +iso.slice(0, 4) < b.to) score += 2 - Math.abs(+iso.slice(0, 4) + 0.5 - middle) * 0.2;
      const alt = seenSet.get(ev.id);
      if (!alt || alt.score < score) seenSet.set(ev.id, {ev, p, score, iso});
    });
  });
  return [...seenSet.values()].sort((a, b2) => b2.score - a.score).slice(0, ui.ezAll ? 40 : 8);
}
const line = (c, i) => `<div class="ez-row"><button class="small" data-a="ev-assign" data-i="${i}">${tr("Assign")}</button>
  <span><b>${esc(grShort(c.ev, true))}</b> <span class="quiet">${tr("{datum} · Life line of {name}", {datum: esc(grDateText(c.ev.date)), name: esc(c.p.name)})}</span></span></div>`;

export function eventRange(e) {
  const keys = e.keys, k0 = keys[0], zu = S.ez[k0] || [];
  const pers = [...new Map(keys.flatMap(peopleOn).map((p) => [p.id, p])).values()];
  pers.forEach((p) => { if (S.assignMap[p.id] && !S.grEv[p.id]) setTimeout(() => loadEvents(p.id), 0); });
  const locked = pers.some((p) => S.grEv[p.id] === "laeuft");
  const withGramps = pers.filter((p) => S.assignMap[p.id]);
  let content = "";
  if (zu.length) content += zu.map((z, i) => `<div class="ez-row"><span><a href="#" class="link" data-a="go-event" data-id="${esc(z.id)}" title="${tr("Show all photos of this event")}"><b>${esc(z.text)}</b></a> <span class="quiet">${esc(z.date)}</span></span>
    ${z.iso && !(e.confirmedFlag && e.date === z.iso) ? `<button class="small" data-a="ev-date" data-i="${i}" data-uid="${esc(e.uid)}">${tr("Take over date")}</button>` : ""}
    <button class="small" data-a="ev-remove" data-i="${i}" data-uid="${esc(e.uid)}" title="${tr("Remove assignment")}">✕</button></div>`).join("");
  if (!withGramps.length) content += '<div class="quiet">' + tr("No person in the photo is connected to Gramps.") + '</div>';
  else if (locked) content += '<div class="quiet">' + tr("Loading events …") + '</div>';
  else {
    const c = candidates(e);
    ui.ezCand = c;
    if (!e.year && !ui.ezAll) content += '<div class="quiet">' + tr("The photo has no year yet, so there are no suggestions.") + '</div>';
    else if (!c.length) content += `<div class="quiet">${(zu.length ? (ui.ezAll ? tr("No further matching events.") : tr("No further matching events in the period of the photo.")) : (ui.ezAll ? tr("No matching events.") : tr("No matching events in the period of the photo.")))}</div>`;
    else content += `<div class="quiet" style="margin-top:4px">${ui.ezAll ? tr("All events") : tr("Matching events")}:</div>` + c.map(line).join("");
    content += `<div><a href="#" class="link quiet" data-a="ev-all">${ui.ezAll ? tr("Show matching only") : tr("Show all events")}</a></div>`;
  }
  return `<div><div class="field-name">${tr("Event")}</div>${content}</div>`;
}
const unitFromData = (el) => unitOf(el.dataset.uid);
export const actions = {
  "ev-all": () => { ui.ezAll = !ui.ezAll; draw(); },
  "ev-assign": async (el) => {
    const c = (ui.ezCand || [])[+el.dataset.i], e = ui.focusKey && unitOf(ui.focusKey);
    if (!c || !e) return;
    const entry = {id: c.ev.id, pid: c.p.id, text: grShort(c.ev, true), date: grDateText(c.ev.date), iso: c.iso};
    e.keys.forEach((k) => { S.ez[k] = [...(S.ez[k] || []).filter((z) => z.id !== entry.id), entry]; });
    mark(); await saveEz(); draw();
  },
  "ev-remove": async (el) => {
    const e = unitFromData(el), z = e && (S.ez[e.keys[0]] || [])[+el.dataset.i];
    if (!z) return;
    e.keys.forEach((k) => { S.ez[k] = (S.ez[k] || []).filter((x) => x.id !== z.id); if (!S.ez[k].length) delete S.ez[k]; });
    mark(); await saveEz(); draw();
  },
  "ev-date": async (el) => {
    const e = unitFromData(el), z = e && (S.ez[e.keys[0]] || [])[+el.dataset.i];
    if (!z || !z.iso) return;
    const [j, m, t] = z.iso.split("-").map(Number), w = dateValues({tag: t, mon: m, j});
    if (w.errors) return;
    setCorr(e.keys, {year: w.j, decimal_year: w.decimal_year, date: w.date, from: w.j, to: w.j, source: "manual"});
    await saveCorr(); draw();
  },
};

// ---- sidebar and the “Events” view: only events to which photos are assigned
const yearFrom = (z) => (z.iso ? +z.iso.slice(0, 4) : +((String(z.date).match(/(\d{4})/) || [])[1] || 0));
export function eventState() {
  const m = new Map();
  Object.entries(S.ez).forEach(([key, list]) => (list || []).forEach((z) => {
    if (!S.photos[key]) return;
    const x = m.get(z.id) || {id: z.id, text: z.text, date: z.date, year: yearFrom(z), iso: z.iso || "", keys: []};
    x.keys.push(key); m.set(z.id, x);
  }));
  return [...m.values()].map((x) => ({...x, unitList: [...new Set(x.keys.map((k) => unitFromKey(k)).filter(Boolean))]}))
    .sort((a, b) => (a.iso || String(a.year)).localeCompare(b.iso || String(b.year)));
}
export function eventList() {
  const l = eventState();
  if (!l.length) return "";
  return `<div class="group">${tr("Events ({n})", {n: l.length})}</div>` + l.map((x) => `<button class="row ${ui.view === "event" && ui.eventId === x.id ? "active" : ""}" data-a="go-event" data-id="${esc(x.id)}">
    <div class="top"><b>${esc(x.text)}</b><span>${tr("{n} {n:photo|photos}", {n: x.unitList.length})}</span></div><div class="bottom">${esc(x.date)}</div></button>`).join("");
}
export function eventHtml() {
  const x = eventState().find((y) => y.id === ui.eventId);
  if (!x) return '<div class="empty">' + tr("Select an event on the left.") + '</div>';
  return `<div class="person-head"><div><h1>${esc(x.text)}</h1><div class="quiet">${tr("{datum} · {n} {n:photo|photos}", {datum: esc(x.date), n: x.unitList.length})}</div></div></div>
    ${tileGrid(x.unitList.slice().sort((a, b) => (a.decimal_year || a.year || 0) - (b.decimal_year || b.year || 0)))}`;
}
