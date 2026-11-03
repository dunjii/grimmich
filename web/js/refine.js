// Answers of the game as constraints on the estimates (only suggestions, nothing is written anywhere):
//  - bounds: “before / after the photo from 1950”, “in the 1940s” narrow the span of a photo
//  - order: “this one is older”, a sorted row of 3–5 photos say which photo is earlier than which
import {S} from "./state.js";

// Latest answer per question wins (the same question can be answered again later).
function latest() {
  const m = new Map();
  S.game.votes.forEach((v) => {
    const t = v.type || "older";
    const id = t === "older" ? `o|${[v.a, v.b].sort().join("|")}` : t === "anchor" ? `a|${v.key}|${v.anchor}` : t === "sort" ? `s|${[...(v.keys || [])].sort().join("|")}` : `${t}|${v.key}`;
    m.set(id, v);
  });
  return [...m.values()];
}

let ver = -1, cache = null;
// {bounds: key -> {lo, hi}, pairs: [[youngerKey, olderKey]]}, recomputed when the answers change
export function constraints() {
  const n = S.game.votes.length;
  if (cache && ver === n) return cache;
  const bounds = {}, pairs = [];
  const narrow = (key, lo, hi) => {
    const b = bounds[key] || (bounds[key] = {lo: -Infinity, hi: Infinity});
    if (lo > b.lo) b.lo = lo;
    if (hi < b.hi) b.hi = hi;
  };
  latest().forEach((v) => {
    const t = v.type || "older";
    if (t === "older") {
      if (v.older === "a") pairs.push([v.b, v.a]);
      else if (v.older === "b") pairs.push([v.a, v.b]);
    } else if (t === "sort" && Array.isArray(v.keys)) {
      for (let i = 0; i + 1 < v.keys.length; i++) pairs.push([v.keys[i], v.keys[i + 1]]);   // from young to old
    } else if (t === "anchor" && v.ay) {
      if (v.rel === "before") narrow(v.key, -Infinity, v.ay);
      else if (v.rel === "after") narrow(v.key, v.ay, Infinity);
      else if (v.rel === "same") narrow(v.key, v.ay - 3, v.ay + 3);
    } else if (t === "decade" && v.from && v.to) narrow(v.key, v.from, v.to);
  });
  cache = {bounds, pairs}; ver = n;
  return cache;
}
export const hasAnswers = () => { const c = constraints(); return Object.keys(c.bounds).length > 0 || c.pairs.length > 0; };

// Bounds of a unit (a series: all photos share one time, so the bounds of all its photos count together).
// Bounds that contradict each other are ignored completely.
export function boundsOf(keys) {
  const c = constraints().bounds;
  let lo = -Infinity, hi = Infinity;
  keys.forEach((k) => { if (c[k]) { lo = Math.max(lo, c[k].lo); hi = Math.min(hi, c[k].hi); } });
  return lo > hi || (lo === -Infinity && hi === Infinity) ? null : {lo, hi};
}
// Narrows an estimate {year, from, to} by the bounds; returns the new estimate or null when nothing changes.
export function narrowed(est, keys) {
  const b = boundsOf(keys);
  if (!b || !est || !est.year) return null;
  if (b.hi < est.from || b.lo > est.to) {   // the estimate lies completely outside: the answers decide
    const from = b.lo === -Infinity ? b.hi - 15 : b.lo, to = b.hi === Infinity ? b.lo + 15 : b.hi;
    return {year: Math.round((from + to) / 2), decimal_year: (from + to) / 2, from, to};
  }
  const from = Math.max(est.from, b.lo), to = Math.min(est.to, b.hi);
  const dec = Math.min(Math.max(est.decimal_year || est.year, from), to);
  const year = Math.round(dec);
  if (from === est.from && to === est.to && year === est.year) return null;
  return {year, decimal_year: dec, from, to};
}

// Order: where a younger photo got a later year than an older one, both move towards each other (a fixed one stays).
// units: list of {keys, year, decimal_year, from, to, confirmedFlag}; changes the units and returns the count of moved ones.
export function ordered(units) {
  const {pairs} = constraints();
  if (!pairs.length) return 0;
  const byKey = {};
  units.forEach((u) => u.keys.forEach((k) => { byKey[k] = u; }));
  const moved = new Set();
  for (let round = 0; round < 4; round++) {
    let changed = false;
    pairs.forEach(([young, old]) => {
      const y = byKey[young], o = byKey[old];
      if (!y || !o || y === o || !y.year || !o.year) return;
      const yy = y.decimal_year || y.year, oy = o.decimal_year || o.year;
      if (yy <= oy) return;
      const mid = (yy + oy) / 2;
      const set = (u, val) => {
        if (u.confirmedFlag || u.draftFlag) return;
        const b = boundsOf(u.keys);
        const v = b ? Math.min(Math.max(val, b.lo), b.hi) : val;
        u.decimal_year = v; u.year = Math.round(v);
        u.from = Math.min(u.from, u.year); u.to = Math.max(u.to, u.year);
        moved.add(u);
      };
      if (y.confirmedFlag || y.draftFlag) set(o, yy);
      else if (o.confirmedFlag || o.draftFlag) set(y, oy);
      else { set(y, mid); set(o, mid); }
      changed = true;
    });
    if (!changed) break;
  }
  return moved.size;
}
