// Main screen of a person: head, toggle, lifeline from Gramps and the photos as tiles in time order.
import {S, ui} from "../state.js";
import {esc, dateLong} from "../util.js";
import {personOf, personTiles, warnings, lifeDates, estimateBirth, shortName} from "../model.js";
import {GR_SIDE, grNear, grShort, grKind, grYearDec, grDateText, grWho, grDescr, grPeriod} from "../gramps.js";
import {tileObj} from "./tile.js";
import {connectionOk} from "./settings.js";
import {seriesView} from "./series.js";
import {sortView} from "./sorting.js";
import {tr} from "../language.js";

export function middleWidth() {
  const m = document.getElementById("middle");
  if (m && m.clientWidth > 300) return m.clientWidth - 2 * 24;
  return Math.max(520, innerWidth - (ui.listOpen ? 290 : 56) - 330 - 48);
}

// Gramps ID as a link to the person page at the Gramps address that currently applies (opens in a new tab)
const LINK_SYMBOL = '<svg class="extlink" viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2h4v4M12 2L6.5 7.5M10.5 8.5V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1H5.5"/></svg>';
export function grampsLink(id) {
  const basis = ((S.conn && S.conn.gramps && S.conn.gramps.used_url) || "").replace(/\/+$/, "");
  if (!basis || !/^https?:\/\//.test(basis)) return esc(id);
  return `<a class="link gr-link" href="${esc(basis)}/person/${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer" title="${tr("Open person in Gramps (new window)")}" aria-label="${tr("{id}, open person in Gramps (new window)", {id: esc(id)})}">${esc(id)} ${LINK_SYMBOL}</a>`;
}

// ------------------------------------------------------------------ Lebenslinie
// Genealogical symbols as small drawings (fonts do not contain ⚭ ⚮ everywhere)
const SYM = {
  Birth: '<path d="M7 2v10M2.6 4.5l8.8 5M11.4 4.5l-8.8 5"/>',
  Death: '<path d="M7 1.5v11M3.5 5h7"/>',
  Burial: '<path d="M7 1.5v8M3.5 4.5h7M3 12.5h8"/>',
  Marriage: '<circle cx="5" cy="7" r="3.2"/><circle cx="9" cy="7" r="3.2"/>',
  Divorce: '<circle cx="4" cy="7" r="2.8"/><circle cx="10" cy="7" r="2.8"/><path d="M2 12L12 2"/>',
  Baptism: '<path d="M2 5q1.7-2 3.5 0t3.5 0 3 0M2 9q1.7-2 3.5 0t3.5 0 3 0"/>',
};
SYM.Christening = SYM["Adult Christening"] = SYM.Baptism;
const symbol = (kindVal) => SYM[kindVal] ? `<svg class="gsym" viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">${SYM[kindVal]}</svg>` : "<i></i>";
function lifeline(p, tileList) {
  if (!connectionOk().gramps && !S.assignMap[p.id]) return '<div class="quiet" style="margin:4px 0 10px">' + tr("Life line: Gramps is not connected yet (gear icon at the top right).") + '</div>';
  const L = lifeDates(p.name), birthYear = L.born ? L.born.decimal_year : p.birth;
  const withYear = tileList.filter((k) => k.e.year);
  const st = S.grEv[p.id], eventsArr = st && st.list ? st.list.filter((e) => (ui.grAll || !GR_SIDE.has(e.kind)) && (ui.grUsed || grNear(e))) : [];
  const photoYears = withYear.map((k) => k.e.decimal_year || k.e.year);
  const start = Math.floor(birthYear !== null && birthYear !== undefined ? birthYear : (photoYears.length ? Math.min(...photoYears) - 2 : 1900));
  const eventEnd = eventsArr.map((e) => grYearDec(e.date.to || e.date.from));
  const end = Math.min(2030, Math.ceil(Math.max(start + 15, L.death ? L.death.decimal_year : 0, ...photoYears, ...eventEnd.filter((y) => y < start + 110)) + 2));
  const W = middleWidth() - 36 - 48, ppy = W / (end - start), x = (y) => (y - start) * ppy;
  const boxEl = (headHint, inner, h) => `<div class="lifeline"><div class="ll-head"><b>${tr("Life line from Gramps")}</b><span class="quiet">${headHint}</span></div>
    <div class="ll-field" style="height:${h}px">${inner}</div>
    <div class="legend"><span><i class="ok"></i>${tr("Photo confirmed")}</span><span><i class="estimate"></i>${tr("Photo estimated")}</span><span><i class="draft"></i>${tr("draft")}</span><span><i class="warn"></i>${tr("Photo with warning")}</span></div></div>`;
  // Photos as small squares
  const marks = (yMarks) => withYear.map((k) => {
    const w = warnings(k.e).length;
    return `<div class="f-mark ${w ? "warn" : k.e.confirmedFlag ? "ok" : k.e.draftFlag ? "draft" : "estimate"} ${ui.focusKey === k.uid ? "focus" : ""}" style="left:${x(k.e.decimal_year || k.e.year).toFixed(1)}px;top:${yMarks}px" data-a="choose" data-uid="${esc(k.uid)}" data-key="${esc(k.f.key)}" title="${esc(k.e.year + (k.e.confirmedFlag ? tr(" (confirmed)") : ""))}"></div>`;
  }).join("");
  let ticks = "";
  const stepVal = ppy >= 14 ? 5 : ppy >= 7 ? 10 : 20;
  const axis = (yAxis) => { for (let j = Math.ceil(start / stepVal) * stepVal; j <= end; j += stepVal) ticks += `<div class="tick" style="left:${x(j).toFixed(1)}px;top:${yAxis - 4}px"><span>${j}</span></div>`; return ticks; };
  let hintVal = tr("Events and residences serve as anchors for the photos below"), bars = [], points = [];
  if (!S.assignMap[p.id]) hintVal = '' + tr("Not connected to Gramps yet") + ' <button class="small" data-a="go-dialog">' + tr("Assign person …") + '</button>';
  else if (!st || st === "laeuft") hintVal = tr("Loading events from Gramps …");
  else if (st.errors) hintVal = `<span class="error-text">${esc(st.errors)}</span> <button class="small" data-a="gr-load" data-pid="${esc(p.id)}">${tr("Retry")}</button>`;
  else {
    hintVal = `${tr("{n} {n:event|events}", {n: eventsArr.length})} <label class="quiet"><input type="checkbox" data-a="gr-all" ${ui.grAll ? "checked" : ""}> ${tr("also occupations, censuses etc.")}</label> <label class="quiet"><input type="checkbox" data-a="gr-discard" ${ui.grUsed ? "checked" : ""}> ${tr("also siblings and other relatives")}</label>`;
    eventsArr.forEach((e) => {
      const fromVal = grYearDec(e.date.from), zr = grPeriod(e), bis = zr ? grYearDec(e.date.to) : fromVal;
      if (bis < start || fromVal > end + 1) return;
      (zr ? bars : points).push({e, from: fromVal, to: bis});
    });
  }
  const lanes = (list, widthPx, tilt) => {   // flip: the text stands left of the dot if it would otherwise protrude over the right edge
    const end2 = [];
    return list.sort((a, b) => a.from - b.from).map((it) => {
      const l = x(Math.max(it.from, start)), br = widthPx(it), rev = !!tilt && l + br > W + 20;
      const s = rev ? l - br : l, r = rev ? l + 6 : l + br;
      let lane = end2.findIndex((v) => v <= s - 4);
      if (lane < 0) { lane = end2.length; end2.push(0); }
      end2[lane] = r;
      return {it, l, lane, rev, br};
    });
  };
  const tip = (e) => [grDateText(e.date), grKind(e.kind) + (grWho(e) ? " (" + grWho(e) + ")" : ""), grDescr(e), e.place].filter(Boolean).join(" · ");
  const bl = lanes(bars, (it) => Math.max(10, x(Math.min(it.to, end)) - x(Math.max(it.from, start))));
  const pText = (e) => grShort(e);
  const pl = lanes(points, (it) => (pText(it.e).length + 5) * 6.2 + 22, true);
  const nB = Math.max(0, ...bl.map((o) => o.lane + 1)), nP = Math.max(0, ...pl.map((o) => o.lane + 1));
  const yAxis = 8 + nB * 26 + (nB ? 8 : 0) + 20, yPoints = yAxis + 10, yMarks = yPoints + nP * 22 + 10, h = yMarks + 16;
  const inner = '<div class="axis" style="top:' + yAxis + 'px"></div>' + axis(yAxis)
    + bl.map((o) => `<div class="ll-bar" style="left:${o.l.toFixed(1)}px;top:${8 + o.lane * 26}px;width:${Math.max(10, x(Math.min(o.it.to, end)) - o.l).toFixed(1)}px" title="${esc(tip(o.it.e))}">${esc(grShort(o.it.e, true))}</div>`).join("")
    + pl.map((o) => `<div class="ll-dot ${o.rev ? "rev" : ""}" style="left:${(o.rev ? o.l - o.br + 6 : o.l).toFixed(1)}px;top:${yPoints + o.lane * 22}px;${o.rev ? "width:" + o.br.toFixed(0) + "px" : ""}" title="${esc(tip(o.it.e))}">${symbol(o.it.e.kind)}<span>${esc(pText(o.it.e))} <small>${esc(String(Math.floor(o.it.from)))}</small></span></div>`).join("")
    + marks(yMarks);
  return boxEl(hintVal, inner, h);
}

// ------------------------------------------------------------------ Warnband
function warnBand(tileList) {
  const warn = tileList.filter((k) => warnings(k.e).length);
  if (!warn.length) return "";
  const w = warnings(warn[0].e)[0];
  return `<div class="warn-band"><span><b>${tr("{n} {n:photo|photos} with warning.", {n: warn.length})}</b> ${esc(w.text)}</span>
    <button class="warn" data-a="choose" data-uid="${esc(warn[0].uid)}" data-key="${esc(warn[0].f.key)}" data-scroll="1">${tr("To the photo")}</button></div>`;
}

// ------------------------------------------------------------------ Timeline: tiles by year
function timeline(p, tileList) {
  const yearVal = (k) => k.e.decimal_year || k.e.year;
  const withVal = tileList.filter((k) => k.e.year).sort((a, b) => yearVal(a) - yearVal(b) || a.uid.localeCompare(b.uid));
  // Without a year: ordered by AI age (young first), photos without AI age at the end
  const withoutVal = tileList.filter((k) => !k.e.year).sort((a, b) => (a.ki === null) - (b.ki === null) || (a.ki ?? 0) - (b.ki ?? 0) || a.uid.localeCompare(b.uid));
  const aiText = (k) => (k.ki !== null ? {extra: `<div class="quiet" style="font-size:12px" title="${tr("AI age estimate for {name} in this photo (mean for series)", {name: esc(p.name)})}">${tr("AI age c. {ki} y", {ki: Math.round(k.ki)})}</div>`} : {});
  let html = "", dek = null;
  withVal.forEach((k) => {
    const d = Math.floor(k.e.year / 10) * 10;
    if (d !== dek) { dek = d; html += `<div class="decade" id="dek-${d}">${tr("{d}s", {d})}</div>`; }
    html += tileObj(k.e, {key: k.f.key, ...aiText(k)});
  });
  if (withoutVal.length) html += `<div class="decade">${tr("Without year yet ({n})", {n: withoutVal.length})}</div>` + withoutVal.map((k) => tileObj(k.e, {key: k.f.key, ...aiText(k)})).join("");
  return `<div class="grid">${html || '<div class="empty">' + tr("There are no photos of this person yet.") + '</div>'}</div>`;
}

// Hint for people without an entered birth date: estimate the birth year from photos with a confirmed year
function birthBox(p) {
  if (p.birthSource === "geschätzt") {
    const g = p.birthEstimated;
    return `<div class="box info">${tr("No date of birth is entered for <b>{name}</b>. Grimmich uses the estimated year of birth <b>c. {jahr}</b> (from {n} {n:photo|photos} with a confirmed year, uncertainty about ±{fehler} years). With this there are no warnings about before birth or after death. If you enter a real date in Immich or Gramps, it replaces the estimate.", {name: esc(p.name), jahr: Math.round(p.birth), n: g.n, fehler: g.errors})}
      <div class="actions"><button class="small" data-a="born-new" data-pid="${esc(p.id)}">${tr("Recalculate")}</button><button class="small danger" data-a="born-remove" data-pid="${esc(p.id)}">${tr("Discard estimate")}</button></div></div>`;
  }
  if (p.birth !== null) return "";
  const v = estimateBirth(p);
  return `<div class="box warn">${tr("No date of birth is entered for <b>{name}</b> (neither in Gramps nor in Immich). {als}", {name: esc(p.name), als: v
    ? `${tr("From {n} {n:photo|photos} with a confirmed year, a year of birth of about <b>{jahr}</b> results (±{fehler} years).", {n: v.n, jahr: Math.round(v.year), fehler: v.errors})}
       <div class="actions"><button class="small primary" data-a="born-adopt" data-pid="${esc(p.id)}">${tr("Take over as estimated year of birth")}</button></div>`
    : tr("As soon as a photo of this person has a confirmed year, I can estimate the year of birth from it. Until then you can sort by appearance; there are just no years, only limits like “later than 1960”.")})}</div>`;
}

export function personHtml() {
  if (!S.pf || !S.pf.ok) return `<div class="box info">${S.pf ? esc(S.pf.text) : tr("The person view needs the data from “Refresh”.")}</div>`;
  const p = personOf(ui.personId);
  if (!p) return '<div class="empty">' + tr("Select a person in the work list on the left.") + '</div>';
  const tileList = personTiles(p), openVal = tileList.filter((k) => !k.e.confirmedFlag).length;
  const nSeries = tileList.filter((k) => k.e.type === "series").length;
  const gr = S.assignMap[p.id] && S.grP ? S.grP.people.find((g) => g.h === S.assignMap[p.id]) : null, L = lifeDates(p.name);
  const modes = [["time", tr("Timeline")], ["sort", tr("Sort by appearance")], ["series", `${tr("Series ({nSerien})", {nSerien: nSeries})}`]];
  const head = `<div class="person-head"><div><h1>${esc(shortName(p.name))}</h1>
    <div class="quiet">${tr("{Geburtsdatum} · {n} {n:unit|units} · {offen} open{zugeordnet}", {Geburtsdatum: L.born ? tr("born {datum}", {datum: L.born.full ? dateLong(`${L.born.text.split(".").reverse().join("-")}`) : L.born.text}) : p.birthSource === "Immich" ? tr("born {jahr} (Immich)", {jahr: Math.floor(p.birth)}) : p.birthSource === "geschätzt" ? `${tr("Year of birth estimated: c. {geburt}", {geburt: Math.round(p.birth)})}` : tr("no date of birth"), n: tileList.length, offen: openVal, zugeordnet: gr ? ` ${tr("· assigned to Gramps {id}", {id: grampsLink(gr.id)})}` : ""})}</div></div>
    <div class="toggle">${modes.map(([id, t]) => `<button class="${ui.mode === id ? "on" : ""}" data-a="mode" data-m="${id}">${t}</button>`).join("")}</div></div>`;
  let bodyHtml;
  if (ui.mode === "sort") bodyHtml = birthBox(p) + sortView(p, tileList);
  else if (ui.mode === "series") bodyHtml = seriesView(tileList.map((k) => k.e));
  else bodyHtml = birthBox(p) + lifeline(p, tileList) + warnBand(tileList) + timeline(p, tileList);
  return head + bodyHtml;
}
