// Everything together: the estimate of a photo or series is refined in several steps, each step builds on the one before:
//   1. AI estimate and series (as delivered)            2. your game answers as bounds (refine.js, in model.js)
//   3. the rows “sort by appearance” of all people (your order, fixed anchors, markers) pull the year of every unit along,
//      a series has ONE year for all rows it appears in                    4. order answers of the game, where no row decides
// Fixed years (confirmed, from Immich, drafts) never move. Nothing is stored: all of it is recomputed after every change.
import {S} from "./state.js";
import {setJoint, personOf, personTiles} from "./model.js";
import {sortLane, yearsMap, limits} from "./ordering.js";
import {ordered, boundsOf} from "./refine.js";

const W_AI = 1, W_ROW = 2;   // weight of the AI estimate and of a row sorted by you
export const info = {conflicts: [], moved: 0};

const today = () => { const d = new Date(); return d.getFullYear() + d.getMonth() / 12; };
const fixed = (e) => e.confirmedFlag || e.draftFlag || e.immich || e.kind;

function refine(cache) {
  info.conflicts = []; info.moved = 0;
  const units = cache.list.filter((e) => !fixed(e) && e.year);
  if (!units.length || !S.pf || !S.pf.ok) return;
  const before = new Map(units.map((e) => [e, [e.year, e.from, e.to]]));
  const sum = new Map(units.map((e) => [e, {w: W_AI, s: W_AI * (e.decimal_year || e.year), lo: -Infinity, hi: Infinity}]));
  const laneIndex = [];   // per person: uid -> position in the row
  S.pf.people.forEach((raw) => {
    const p = personOf(raw.id);
    if (!p) return;
    const tiles = personTiles(p), {laneVal, anchorItem} = sortLane(p, tiles);
    if (laneVal.length < 2) return;
    const idx = new Map(laneVal.map((k, i) => [k.uid, i]));
    laneIndex.push(idx);
    // fixed anchors before and after in the row give hard bounds (works without a birth date)
    limits(laneVal, anchorItem).forEach((g, i) => {
      const a = sum.get(laneVal[i].e);
      if (a && g) { if (g.lo !== null) a.lo = Math.max(a.lo, g.lo); if (g.hi !== null) a.hi = Math.min(a.hi, g.hi); }
    });
    if (p.birth === null || p.birth === undefined || laneVal.length < 3) return;
    const years = yearsMap(p, tiles);
    laneVal.forEach((k) => {
      const a = sum.get(k.e), y = years[k.uid];
      if (a && y !== null && y !== undefined) { a.s += W_ROW * y; a.w += W_ROW; }
    });
  });
  const now = today();
  units.forEach((e) => {
    const a = sum.get(e);
    let y = Math.min(a.s / a.w, now);
    const b = boundsOf(e.keys);
    let lo = a.lo, hi = a.hi;
    if (lo > hi) { lo = -Infinity; hi = Infinity; }   // fixed anchors contradict each other: ignore here, other places warn
    if (b) { lo = Math.max(lo, b.lo); hi = Math.min(hi, b.hi); if (lo > hi) { lo = b.lo; hi = b.hi; } }   // your answers decide between bounds
    y = Math.min(Math.max(y, lo), hi);
    const yr = Math.round(y), cap = Math.floor(now);
    const from = Math.min(Math.max(lo, Math.min(e.from, Math.floor(y))), yr), to = Math.max(Math.min(hi, cap, Math.max(e.to, Math.ceil(y))), yr);
    Object.assign(e, {decimal_year: y, year: yr, from, to});
  });
  // order answers of the game: where one of your rows decides the order, the row wins (a contradiction is only counted)
  const rowOrder = (y, o) => {
    for (const idx of laneIndex) {
      let iy = null, io = null;
      y.keys.forEach((k) => { cache.byKey[k] && idx.has(cache.byKey[k].uid) && (iy = idx.get(cache.byKey[k].uid)); });
      o.keys.forEach((k) => { cache.byKey[k] && idx.has(cache.byKey[k].uid) && (io = idx.get(cache.byKey[k].uid)); });
      if (iy !== null && io !== null) return iy < io ? "agree" : "conflict";
    }
    return "none";
  };
  const seen = new Set();
  ordered(units, (y, o) => {
    const r = rowOrder(y, o);
    if (r === "conflict" && !seen.has(y.uid + o.uid)) { seen.add(y.uid + o.uid); info.conflicts.push({young: y.uid, old: o.uid}); }
    return r !== "none";
  });
  units.forEach((e) => {
    const b = before.get(e);
    if (e.year !== b[0] || e.from !== b[1] || e.to !== b[2]) { e.refined = true; info.moved++; }
  });
}
setJoint(refine);
