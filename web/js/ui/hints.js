// “Hints for the year”: for a photo without a fixed year, show what fits the year.
//  - Album neighbours: photos with a fixed year that lie nearby in the album (without the collective album).
//  - Similar photos: photos with a fixed year that resemble the photo overall (basis: series_cache.npz).
// All of these are only hints. “Adopt as draft” sets a year as a draft, not as a confirmed year.
import {S, ui, draw, saveWork, saveCorr} from "../state.js";
import {esc, fetchIt, image} from "../util.js";
import {unitOf, unitFromKey, addTo, mergeUnits, newSeries} from "../model.js";
import {albumNeighbors} from "../provenance.js";
import {setDraft} from "./actions.js";
import {afterJobHooks} from "../job.js";
import {tr} from "../language.js";

const ALBUM_MAX = 10;      // this many places in the album still count as a neighbour (measured: up to 10 places mostly ±2 years)
const SIMILAR_MIN = 0.75; // below this the similarity is no longer a hint (measured: 0.75 about 77 % hits, 0.80 about 92 %)
const SIMILAR_SERIES = 0.80;
afterJobHooks.push(() => { S.similar = {}; });

async function load(key) {
  S.similar = S.similar || {};
  if (S.similar[key]) return;
  S.similar[key] = "laeuft";
  try { S.similar[key] = await fetchIt("/api/similar?key=" + encodeURIComponent(key)); }
  catch (e) { S.similar[key] = {ok: false, text: tr("The server did not respond.")}; }
  draw();
}
const fixed = (u) => u && !u.kind && u.confirmedFlag && u.year;
const yearText = (u) => (u.date ? u.date.split("-").reverse().join(".") : String(u.year));

function collect(e, key, answer) {
  const ev = [], seenSet = new Set([e.uid]);
  // Album neighbours: from all photos of the unit, the nearest per unit, the two nearest overall
  const nb = e.keys.flatMap((k) => albumNeighbors(k, (k2) => { const u = unitFromKey(k2); return fixed(u) && u.uid !== e.uid; }, ALBUM_MAX)).sort((p, q) => p.gap - q.gap);
  const ownOnes = new Set();
  for (const n of nb) {
    const u = unitFromKey(n.key);
    if (ownOnes.has(u.uid)) continue;
    ownOnes.add(u.uid);
    ev.push({kind: "album", u, key: n.key, year: u.year, n});
    if (ownOnes.size >= 2) break;
  }
  // Similar photos
  if (answer && answer.ok) {
    let num = 0;
    for (const t of answer.hits || []) {
      if (t.value < SIMILAR_MIN || num >= 3) break;
      const u = unitFromKey(t.key);
      if (!fixed(u) || seenSet.has(u.uid)) continue;
      seenSet.add(u.uid); num++;
      ev.push({kind: "aehnlich", u, key: t.key, year: u.year, value: t.value});
    }
  }
  return ev;
}

function summary(e, ev) {
  if (!ev.length) return "";
  const js = ev.map((x) => x.year).sort((a, b) => a - b), med = js[Math.floor(js.length / 2)], span = js[js.length - 1] - js[0];
  const sources = [...new Set(ev.map((x) => (x.kind === "album" ? tr("Album neighbors") : tr("similar photos"))))].join(tr(" and "));
  if (span <= 3) {
    return `<div class="hand-sum ok"><span><b>${tr("{quellen} suggest about {med}.", {quellen: sources, med: med})}</b></span>
      <button class="small good" data-a="hand-draft" data-year="${med}" data-uid="${esc(e.uid)}">${tr("Take over as draft: {med}", {med: med})}</button></div>`;
  }
  return `<div class="hand-sum warn"><span><b>${tr("The hints contradict each other")}</b> ${tr("({join}). Have a look at the photos.", {join: [...new Set(js)].join(", ")})}</span></div>`;
}

export function hintsArea(e, key) {
  if (e.confirmedFlag) return "";
  const head = '<div class="field-name">' + tr("Year hints") + '</div>';
  const card = !!e.kind;   // Cards: album neighbours only, no image similarity
  const a = card ? {ok: false, text: tr("not used for cards")} : (S.similar || {})[key];
  if (!a) setTimeout(() => load(key), 0);
  const ev = collect(e, key, a && a !== "laeuft" ? a : null);
  ui.hwEv = ev;
  const isLoading = !a || a === "laeuft";
  const line = (x, i) => {
    const where = x.kind === "album"
      ? `${tr(x.n.withPages ? "Album “{album}”, p. {seite}, photo {nr} · {entfernt}" : "Album “{album}”, photo {nr} · {entfernt}", {album: esc(x.n.album), seite: x.n.page, nr: x.n.nr, entfernt: x.n.gap === 1 ? tr("right next to it") : tr("{n} places away", {n: x.n.gap})})}`
      : `${tr("similar photo (similarity {toFixed}){id}", {toFixed: x.value.toFixed(2), id: x.u.type === "series" ? tr(" · series ") + esc(x.u.s.id) : ""})}`;
    return `<div class="ae-row"><img src="${image(x.key)}" alt="" data-a="enlarge" data-key="${esc(x.key)}" data-keys="${esc(x.key)}" onerror="this.style.visibility='hidden'">
      <div><b>${esc(yearText(x.u))}</b> <span class="quiet">· ${where}</span>
        <div class="actions"><button class="small" data-a="hand-draft" data-year="${x.year}" data-uid="${esc(e.uid)}">${tr("As draft: {jahr}", {jahr: x.year})}</button>
        ${x.kind === "aehnlich" && x.value >= SIMILAR_SERIES ? `<button class="small" data-a="hand-series" data-i="${i}" data-uid="${esc(e.uid)}">${tr("Add to series")}</button>` : ""}</div></div></div>`;
  };
  let content;
  if (ev.length) content = summary(e, ev) + ev.map(line).join("")
    + `<div class="quiet" style="font-size:12px">${isLoading ? tr("Similar photos are still being searched … ") : ""}${card ? tr("For a card the album year is only an upper limit: it was pasted in, the card can be older.") : tr("Hints only: album neighbors are usually from the same year, but similar places or clothing can be from other years.")}</div>`;
  else if (isLoading) content = '<div class="quiet">' + tr("being searched …") + '</div>';
  else if (card) content = '<div class="quiet">' + tr("No album neighbors with a year nearby.") + '</div>';
  else if (a && a.ok === false) content = `<div class="quiet">${tr("No album neighbors with a year. Similar photos: {text}", {text: esc(a.text || tr("not available"))})}</div>`;
  else content = `<div class="quiet">${tr("No hints: no photo with a fixed year within {ALBUM_MAX} places in the album and no similar photo from {replace}.", {ALBUM_MAX: ALBUM_MAX, replace: SIMILAR_MIN.toFixed(2).replace(".", ",")})}</div>`;
  return `<div>${head}${content}</div>`;
}

// Series with card(s): the rough time of the cards (only a hint) compared with the time of the series.
// A card was printed before it was pasted in, so the series usually lies within or after its rough time.
export function cardRange(e) {
  if (e.type !== "series" || !e.cardKeys || e.kind) return "";
  const head = '<div class="field-name">' + tr("Cards in this series") + '</div>';
  if (!e.rough) return `<div>${head}<div class="quiet">${tr("{n} {n:card has|cards have} no rough time. Enter a rough time for the card under “Type”, then it narrows down the time of the series.", {n: e.cardKeys.length}) + (e.confirmedFlag ? "" : tr(" Once the series is confirmed, the card gets its date."))}</div></div>`;
  const g = e.rough, gtext = g.from === g.to ? g.from : `${g.from}–${g.to}`;
  if (e.confirmedFlag) {
    const fits = e.year >= g.from - 2;
    return `<div>${head}<div class="box ${fits ? "info" : "warn"}">${tr("Rough time of the card: {gtext}. The series is set to {jahr}. {Datum}", {gtext: gtext, jahr: esc(String(e.date ? e.date.split("-").reverse().join(".") : e.year)), Datum: fits ? tr("That fits together.") : tr("The card would then have been printed only after the photo was taken. Check card and date.")})}</div></div>`;
  }
  if (!e.year) return `<div>${head}<div class="quiet">${tr("Rough time of the card: {gtext}. The series has no estimate yet. Set a year by hand; it should not be before {von}.", {gtext: gtext, von: g.from})}</div></div>`;
  const fromVal = Math.max(e.from, g.from), bis = Math.min(e.to, g.to + 10);   // Untergrenze fest, Obergrenze weich (+10 Jahre)
  if (fromVal > bis) return `<div>${head}<div class="box warn">${tr("Rough time of the card: {gtext}. The estimate of the series ({von}–{bis}) lies outside. One of the two is wrong.", {gtext: gtext, von: e.from, bis: e.to})}</div></div>`;
  const middle = Math.round((fromVal + bis) / 2);
  return `<div>${head}<div class="hand-sum ok"><span><b>${tr("Together with the card ({gtext}) this leaves {bis}", {gtext: gtext, bis: fromVal === bis ? fromVal : fromVal + "–" + bis})}</b>${tr(", the estimate of the series alone: {von}–{bis}.", {von: e.from, bis: e.to})}</span>
    <button class="small good" data-a="hand-draft" data-year="${middle}" data-uid="${esc(e.uid)}">${tr("Take over as draft: {mitte}", {mitte: middle})}</button></div>
    <div class="quiet" style="font-size:12px">${tr("Only a hint: before the card was printed the photo can hardly have been taken (fixed lower limit). Cards were often bought years later though, so the upper limit is only the rough time plus 10 years.")}</div></div>`;
}

export const actions = {
  "hand-draft": async (el) => { const j = +el.dataset.year; if (j) await setDraft(el.dataset.uid, j); },
  "hand-series": async (el) => {
    const x = (ui.hwEv || [])[+el.dataset.i], e = unitOf(el.dataset.uid);
    if (!x || !e) return;
    let goal;
    if (e.type === "series" && x.u.type === "series") goal = mergeUnits([e.s, x.u.s], []);
    else if (x.u.type === "series") { addTo(x.u.s, e.keys); goal = x.u.s; }
    else if (e.type === "series") { addTo(e.s, x.u.keys); goal = e.s; }
    else goal = newSeries([...x.u.keys, ...e.keys]);
    ui.focusKey = "s:" + ((goal && goal.id) || (e.s && e.s.id));
    await saveCorr(); saveWork(); draw();
  },
};
