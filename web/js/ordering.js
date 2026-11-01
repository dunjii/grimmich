// Sorting by appearance: order, smoothing (PAV), anchors, markers, mirroring to the second person.
// Anchors = fixed places of the row: photos with a confirmed year, and markers (also from Gramps events).
import {S, ui, saveOrd} from "./state.js";
import {dateShort, newId} from "./util.js";
import {personTiles, personOf} from "./model.js";
import {tr} from "./language.js";

const sigmaJs = (a) => (a < 6 ? 1.2 : a < 12 ? 1.8 : a < 20 ? 2.5 : a < 35 ? 3.5 : a < 55 ? 5 : 6.5);
function stdDev(a) { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }
function pav(werte, weight) {   // monotonically rising smoothing (pool adjacent violators)
  const bl = [];
  werte.forEach((v, i) => {
    bl.push({m: v, w: weight[i], n: 1});
    while (bl.length > 1 && bl[bl.length - 2].m > bl[bl.length - 1].m) {
      const b = bl.pop(), a = bl.pop();
      bl.push({m: (a.m * a.w + b.m * b.w) / (a.w + b.w), w: a.w + b.w, n: a.n + b.n});
    }
  });
  const off = [];
  bl.forEach((b) => { for (let i = 0; i < b.n; i++) off.push(b.m); });
  return off;
}

// Row of a person: list of photo keys and marker IDs ("@m:ID")
export function sortLane(p, tileList) {
  const keyToTile = {};
  tileList.forEach((k) => k.keys.forEach((x) => { keyToTile[x] = k; }));
  const seenSet = new Set(), laneVal = [], parts = [], anchorItem = [];
  (S.ord[p.id] || []).forEach((x) => {
    if (typeof x === "string" && x.startsWith("@m:")) {
      const md = S.ord._anchor[x.slice(3)];
      if (md) {
        const m = {id: x.slice(3), token: x, pos: laneVal.length, year: md.decimal_year || md.year, display: (md.imprecise ? "ca. " : "") + (md.date ? dateShort(md.date) : String(md.year)),
                   text: md.text || "", imprecise: !!md.imprecise, gramps: !!md.event};
        anchorItem.push(m); parts.push({m});
      }
      return;
    }
    const k = keyToTile[x];
    if (k && !seenSet.has(k.uid)) { seenSet.add(k.uid); laneVal.push(k); parts.push({k}); }
  });
  return {laneVal, remaining: tileList.filter((k) => !seenSet.has(k.uid)), keyToTile, parts, anchorItem};
}
export const tokens = (p, tileList) => sortLane(p, tileList).parts.map((t) => (t.k ? t.k.f.key : t.m.token));

export function anchorList(p, laneVal, anchorItem) {
  const anc = [];   // x = index of the photo or place between two photos (marker)
  laneVal.forEach((k, i) => { if (k.e.confirmedFlag && k.e.year) anc.push({x: i, age: (k.e.decimal_year || k.e.year) - p.birth, photo: true}); });
  (anchorItem || []).forEach((m) => anc.push({x: m.pos - 0.5, age: m.year - p.birth, photo: false}));
  return anc.sort((u, v) => u.x - v.x);
}

export function calcSorting(p, laneVal, anchorItem) {
  // 1) smoothing of the AI ages along the row
  const withVal = laneVal.map((k, i) => [i, k]).filter(([, k]) => k.ki !== null);
  const fitWith = withVal.length ? pav(withVal.map(([, k]) => k.ki), withVal.map(([, k]) => Math.min(3, k.keys.length))) : [];
  const fit = new Array(laneVal.length).fill(null);
  withVal.forEach(([i], j) => { fit[i] = fitWith[j]; });
  for (let i = 0; i < laneVal.length; i++) if (fit[i] === null && withVal.length) {
    let l = i - 1, r = i + 1;
    while (l >= 0 && fit[l] === null) l--;
    while (r < laneVal.length && fit[r] === null) r++;
    fit[i] = l >= 0 && r < laneVal.length ? fit[l] + (fit[r] - fit[l]) * (i - l) / (r - l) : (l >= 0 ? fit[l] : fit[r]);
  }
  const fitPerUid = {};
  laneVal.forEach((k, i) => { fitPerUid[k.uid] = fit[i]; });
  // 2) anchors keep their year; in between it is distributed evenly (half order, half AI age)
  const anc = anchorList(p, laneVal, anchorItem);
  const fitA = fit.slice();
  if (anc.length) {
    const kl = (v, u, w) => Math.max(Math.min(u, w), Math.min(Math.max(u, w), v));
    for (let i = 0; i < laneVal.length; i++) {
      const selfVal = anc.find((q) => q.photo && q.x === i);
      if (selfVal) { fitA[i] = selfVal.age; continue; }
      let l = null, r = null;
      anc.forEach((q) => { if (q.x < i) l = q; else if (q.x > i && !r) r = q; });
      if (l && r) {
        const lin = l.age + (r.age - l.age) * (i - l.x) / (r.x - l.x);
        fitA[i] = 0.5 * (fit[i] === null ? lin : kl(fit[i], l.age, r.age)) + 0.5 * lin;
      } else if (l) fitA[i] = fit[i] === null ? l.age : Math.max(fit[i], l.age);
      else if (r) fitA[i] = fit[i] === null ? r.age : Math.min(fit[i], r.age);
    }
  }
  const fitAPerUid = {};
  laneVal.forEach((k, i) => { fitAPerUid[k.uid] = fitA[i]; });
  // 3) measure 1: spread to the other people on the same photos
  const priorVal = [], afterVal = [];
  p.photos.forEach((f) => {
    const k = laneVal.find((x) => x.keys.includes(f.key));
    if (!k || fitPerUid[k.uid] === null) return;
    const info = S.age[f.key] || [];
    const me = info.find((x) => x.name === p.name && x.age != null);
    const others = info.filter((x) => x.name !== p.name && x.age != null && x.birth != null);
    if (!me || !others.length) return;
    let sw = 0, sj = 0;
    others.forEach((q) => { const w = 1 / sigmaJs(q.age) ** 2; sw += w; sj += w * (q.birth + q.age); });
    const basis = sj / sw, d1 = p.birth + me.age - basis, d2 = p.birth + fitPerUid[k.uid] - basis;
    if (Math.abs(d1) <= 15) { priorVal.push(d1); afterVal.push(d2); }
  });
  // 4) measure 2: photos with a confirmed year
  const fixed = laneVal.filter((k, i) => k.e.confirmedFlag && k.ki !== null && fit[i] !== null);
  const fv = fixed.map((k) => Math.abs((k.e.decimal_year || k.e.year) - p.birth - k.ki));
  const fn = fixed.map((k) => Math.abs((k.e.decimal_year || k.e.year) - p.birth - fitPerUid[k.uid]));
  const mw = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {fit: fitA, fitPerUid: fitAPerUid, anchorCount: anc.length, m1: {n: priorVal.length, given: stdDev(priorVal), surnames: stdDev(afterVal)},
          m2: {n: fixed.length, given: fv.length ? mw(fv) : null, surnames: fixed.length ? mw(fn) : null}};
}

// Year of each unit in a person's row (birth + smoothed age), null if it cannot be computed
export function yearsMap(person, tileList) {
  if (person.birth === null || person.birth === undefined) return {};
  const {laneVal, anchorItem} = sortLane(person, tileList);
  const res = laneVal.length >= 3 ? calcSorting(person, laneVal, anchorItem) : null;
  const m = {};
  laneVal.forEach((k, i) => { const f = res ? res.fit[i] : k.ki; m[k.uid] = f === null || f === undefined ? null : person.birth + f; });
  return m;
}

// ------------------------------------------------------------------ second person: pull along shared photos
export function secondPeople(p) {
  const mine = new Set(p.photos.map((f) => f.key));
  return S.pf.people.map((q) => personOf(q.id)).filter((q) => q.id !== p.id && q.birth !== null)
    .map((q) => ({q, n: q.photos.filter((f) => mine.has(f.key)).length})).filter((x) => x.n > 0).sort((x, y) => y.n - x.n);
}
export function mirrorIt(sourceVal, uid) {
  if (!ui.p2) return false;
  const others = personOf(sourceVal.id === ui.personId ? ui.p2 : ui.personId);
  if (!others || others.birth === null || sourceVal.birth === null) return false;
  const j = yearsMap(sourceVal, personTiles(sourceVal))[uid];
  if (j === null || j === undefined) return false;
  const sr = sortLane(others, personTiles(others)), laneVal = sr.laneVal;
  const i = laneVal.findIndex((k) => k.uid === uid);
  if (i < 0) return false;
  const res = laneVal.length >= 3 ? calcSorting(others, laneVal, sr.anchorItem) : null;
  const withoutVal = laneVal.map((k, n) => { const f = res ? res.fit[n] : k.ki; return {k, y: f === null || f === undefined ? null : others.birth + f}; }).filter((x) => x.k.uid !== uid);
  let pos = withoutVal.length;
  for (let n = 0; n < withoutVal.length; n++) if (withoutVal[n].y !== null && withoutVal[n].y > j) { pos = n; break; }
  if (pos === i) return false;
  const tok = laneVal[i].f.key;
  const list = sr.parts.map((t) => (t.k ? t.k.f.key : t.m.token)).filter((t) => t !== tok);
  list.splice(pos < withoutVal.length ? list.indexOf(withoutVal[pos].k.f.key) : list.length, 0, tok);
  S.ord[others.id] = list;
  return true;
}
// After a change (e.g. marker): pull shared photos whose year has shifted along in the other row
export function mirrorChanges(sourceVal, previous) {
  if (!ui.p2 || !previous) return;
  const afterwards = yearsMap(sourceVal, personTiles(sourceVal)), uids = [];
  Object.keys(afterwards).forEach((u) => {
    if (previous[u] != null && afterwards[u] != null && Math.round(afterwards[u]) !== Math.round(previous[u]) && mirrorIt(sourceVal, u)) uids.push(u);
  });
  if (uids.length) { ui.blink = {uids}; ui.blinkFrom = sourceVal.id; }
}

// ------------------------------------------------------------------ Marker
export function newAnchor(data) { const id = newId(); S.ord._anchor[id] = data; return id; }
export function insertAnchor(p, id, pos) {
  const tl = tokens(p, personTiles(p)); tl.splice(pos, 0, "@m:" + id); S.ord[p.id] = tl;
}
// Position for a marker with year dj: before the first entry whose year is later
export function anchorPosition(p, tileList, dj) {
  const sr = sortLane(p, tileList), jm = yearsMap(p, tileList);
  for (let i = 0; i < sr.parts.length; i++) {
    const y = sr.parts[i].m ? sr.parts[i].m.year : jm[sr.parts[i].k.uid];
    if (y !== null && y !== undefined && y > dj) return i;
  }
  return sr.parts.length;
}
export async function saveOrder() { await saveOrd(); }

// Bounds for photos without their own fixed year: the row is ordered in time, so a photo lies after the anchors before it
// ("later than") and before the anchors after it ("earlier than"). Works without a birth date too. -> field per row index: {lo, hi} or null
export function limits(laneVal, anchorItem) {
  const anc = [];
  laneVal.forEach((k, i) => { if (k.e.confirmedFlag && k.e.year) anc.push({x: i, j: k.e.year}); });
  (anchorItem || []).forEach((m) => anc.push({x: m.pos - 0.5, j: Math.round(m.year)}));
  return laneVal.map((k, i) => {
    if (k.e.confirmedFlag && k.e.year) return null;
    const beforeVal = anc.filter((a) => a.x < i).map((a) => a.j), after = anc.filter((a) => a.x > i).map((a) => a.j);
    const lo = beforeVal.length ? Math.max(...beforeVal) : null, hi = after.length ? Math.min(...after) : null;
    if (lo === null && hi === null) return null;
    if (lo !== null && hi !== null && lo > hi) return null;
    return {lo, hi};
  });
}
export const limitText = (g) => (!g ? "" : g.lo !== null && g.hi !== null ? (g.lo === g.hi ? tr("around {lo}", {lo: g.lo}) : `${tr("between {lo} and {hi}", {lo: g.lo, hi: g.hi})}`) : g.lo !== null ? `${tr("later than {lo}", {lo: g.lo})}` : `${tr("earlier than {hi}", {hi: g.hi})}`);
