// The data model: units (photo or series), dating, warnings, series operations.
// An “anchor” is a fixed year: a confirmed photo (e.confirmedFlag) or a marker (see ordering.js).
import {S, mark} from "./state.js";
import {median, dateShort} from "./util.js";
import {tr} from "./language.js";
import {narrowed, ordered} from "./refine.js";

// ------------------------------------------------------------------ Serien
let smVer = -1, smCache = {};
export function seriesMap() {
  if (smVer !== S.ver) { smCache = {}; S.work.series.forEach((s) => s.photos.forEach((k) => { smCache[k] = s; })); smVer = S.ver; }
  return smCache;
}
export const singleKeys = () => { const m = seriesMap(); return Object.keys(S.photos).filter((k) => !m[k] && !kindOf(k)); };

// ------------------------------------------------------------------ Kind (photo, postcard, …)
// Everything except a normal photo is in S.kinds. Such single photos are not sorted, not searched for series automatically and not estimated. By hand they may join series.
export const KINDS = {postcard: tr("Postcard"), greeting_card: tr("Greeting card"), document: tr("Document"), other: tr("Other")};
// Entry per photo: {kind, from?, to?}. Formerly only the text of the kind was stored. “from/to” = rough time of the card (only a hint, not a date).
export const kindEntry = (key) => { const v = S.kinds && S.kinds[key]; if (!v) return null; const o = typeof v === "string" ? {kind: v} : v; return KINDS[o.kind] ? o : null; };
export const kindOf = (key) => (kindEntry(key) || {}).kind || "";
export const kindName = (key) => KINDS[kindOf(key)] || tr("Photo");
export const roughTime = (key) => { const o = kindEntry(key); return o && o.from && o.to ? {from: o.from, to: o.to} : null; };

// When merging, an existing anchor (fixed year) should be kept. Order = priority.
function anchorOf(keys) {
  for (const kindVal of [["confirmed", "manual"], ["draft"]])
    for (const k of keys) { const w = S.corr[k]; if (w && kindVal.includes(w.source)) return {...w}; }
  return null;
}
const setAnchors = (keys, anchorObj) => { if (anchorObj) keys.forEach((k) => { S.corr[k] = {...anchorObj}; }); };

// Date of a photo set in Immich: set by you by hand, or a digital photo in the anchor album.
// Camera data in the working album do not count (Grimmich does not even deliver them as a manual date).
export const immichDate = (key) => S.immichData[key] || null;

export function newSeries(keys) {
  const anchorObj = anchorOf(keys);
  const m = seriesMap();
  keys.forEach((k) => { const alt = m[k]; if (alt) alt.photos = alt.photos.filter((x) => x !== k); });
  S.work.series = S.work.series.filter((s) => s.photos.length >= 2);
  S.work.counters++;
  const s = {id: "S" + String(S.work.counters).padStart(3, "0"), photos: [...keys], status: "open", cohesion: 1, source: "manual", suggested_new: [], rejected: []};
  S.work.series.push(s);
  keys.forEach((k) => { delete S.corr[k]; });
  setAnchors(s.photos, anchorObj);
  mark();
  return s;
}
export function addTo(s, keys) {
  const m = seriesMap(), anchorObj = anchorOf([...s.photos, ...keys]);
  keys.forEach((k) => {
    const alt = m[k];
    if (alt && alt !== s) alt.photos = alt.photos.filter((x) => x !== k);
    if (!s.photos.includes(k)) s.photos.push(k);
  });
  s.suggested_new = (s.suggested_new || []).filter((k) => !keys.includes(k));
  S.work.series = S.work.series.filter((x) => x.photos.length >= 2);
  s.status = "open";
  keys.forEach((k) => { delete S.corr[k]; });
  s.photos.forEach((k) => { delete S.corr[k]; });
  setAnchors(s.photos, anchorObj);
  mark();
}
export function mergeUnits(seriesItems, keys) {
  const goal = seriesItems.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
  const m = seriesMap();
  const anchorObj = anchorOf([...goal.photos, ...seriesItems.flatMap((x) => x.photos), ...keys]);
  const merged = [];
  seriesItems.forEach((s) => s.photos.forEach((k) => { if (!merged.includes(k)) merged.push(k); }));
  keys.forEach((k) => {
    const alt = m[k];
    if (alt && !seriesItems.includes(alt)) alt.photos = alt.photos.filter((x) => x !== k);
    if (!merged.includes(k)) merged.push(k);
  });
  goal.photos = merged; goal.status = "open"; goal.source = "manual";
  goal.cohesion = Math.min(...seriesItems.map((s) => Number(s.cohesion) || 1));
  goal.suggested_new = [...new Set(seriesItems.flatMap((s) => s.suggested_new || []))].filter((k) => !merged.includes(k));
  if (!goal.description) goal.description = (seriesItems.find((s) => s.description) || {}).description;
  S.work.series = S.work.series.filter((s) => s === goal || !seriesItems.includes(s)).filter((s) => s.photos.length >= 2);
  merged.forEach((k) => { delete S.corr[k]; });
  setAnchors(merged, anchorObj);
  mark();
  return goal;
}
export function removeIt(s, key) {
  s.photos = s.photos.filter((k) => k !== key);
  delete S.corr[key];
  if (s.photos.length < 2) S.work.series = S.work.series.filter((x) => x !== s);
  else { s.status = "open"; s.photos.forEach((k) => { delete S.corr[k]; }); }
  mark();
}
export function dissolve(s, discard) {
  if (discard) S.work.discarded.push([...s.photos].sort());
  s.photos.forEach((k) => { delete S.corr[k]; });
  S.work.series = S.work.series.filter((x) => x !== s);
  mark();
}

// Set the kind for photos ("" = normal photo). The photos stay in their series.
export function setKindOf(keys, kindVal) {
  keys.forEach((k) => {
    if (kindVal) S.kinds[k] = {...(kindEntry(k) || {}), kind: kindVal};
    else delete S.kinds[k];
  });
  mark();
}
// Rough time of a card (from, to; empty = delete). Only a hint, not a date.
export function setRoughTime(keys, fromVal, bis) {
  keys.forEach((k) => {
    const o = kindEntry(k);
    if (!o) return;
    const n = {kind: o.kind}; if (fromVal && bis) { n.from = Math.min(fromVal, bis); n.to = Math.max(fromVal, bis); }
    S.kinds[k] = n;
  });
  mark();
}

// Place of a photo (from Gramps). entry = null removes it.
export const placeFrom = (key) => (S.places && S.places[key]) || null;
export function setPlace(keys, entry) {
  keys.forEach((k) => { if (entry) S.places[k] = {...entry}; else delete S.places[k]; });
  mark();
}

// ------------------------------------------------------------------ Corrections (= confirmed, manually set and draft years)
export function setCorr(keys, val) {
  keys.forEach((k) => { if (val) S.corr[k] = {...val}; else delete S.corr[k]; });
  mark();
}

// ------------------------------------------------------------------ Einheiten
// The hints of the estimate are in the data as (German) text; here they are translated for display.
export function hintText(h) {
  return String(h || "").split("; ").map((partVal) => {
    const m = partVal.match(/^(?:Einzelschaetzungen der Serie weichen stark ab|Individual estimates in the series differ strongly) \((.+)\)$/);
    return m ? tr("Individual estimates in the series differ strongly ({bereich})", {bereich: m[1]}) : tr(partVal);
  }).join("; ");
}
export function hintKind(h) {
  if (!h) return "";
  return /widersprechen|Altersreihenfolge|noch nicht geboren|weichen stark ab|contradict|Age order|not have been born|differ strongly/.test(h) ? "nein" : "warn";
}

// For a single card (or a series of cards only) the rough time is the estimate. “Set as anchor” turns it into the date.
function cardEstimate(u) {
  if (u.year) return;   // already a date or a draft
  const gz = u.keys.map(roughTime).filter(Boolean);
  if (!gz.length) return;
  const fromVal = Math.min(...gz.map((g) => g.from)), bis = Math.max(...gz.map((g) => g.to)), middle = Math.round((fromVal + bis) / 2);
  u.estimate = {year: middle, decimal_year: middle, from: fromVal, to: bis};
  Object.assign(u, {year: middle, decimal_year: middle, from: fromVal, to: bis});
}
function buildUnits() {
  const zm = {};
  ((S.res && S.res.rows) || []).forEach((z) => { zm[z.key] = z; });
  const data = (keys, live) => {
    const e = {year: null, decimal_year: null, from: null, to: null, hint: "", manualFlag: false, confirmedFlag: false, draftFlag: false, estimate: null, date: ""};
    if (live) {
      e.estimate = {year: Math.round(live.year), decimal_year: live.year, from: live.from, to: live.to};
      e.hint = live.hint || "";
    } else if (live === undefined) {
      const zs = keys.map((k) => zm[k]).filter((z) => z && z.year);
      if (zs.length) {
        e.estimate = {year: median(zs.map((z) => z.year)), from: Math.min(...zs.map((z) => z.from)), to: Math.max(...zs.map((z) => z.to))};
        e.hint = [...new Set(zs.map((z) => z.hint).filter(Boolean))].join("; ");
      }
    }
    if (e.estimate) {
      e.year = e.estimate.year; e.decimal_year = e.estimate.decimal_year || e.estimate.year; e.from = e.estimate.from; e.to = e.estimate.to;
      const n = narrowed(e.estimate, keys);   // your answers in the game narrow the span (before / after an anchor, decade)
      if (n) { Object.assign(e, {year: n.year, decimal_year: n.decimal_year, from: n.from, to: n.to}); e.refined = true; }
    }
    const k0 = S.corr[keys[0]], hd = keys.map((k) => immichDate(k)).find(Boolean);
    if (hd) { e.immichDate = hd.date; if (hd.camera) e.camera = true; }
    if (k0 && k0.source === "ignoriert") e.immichIgnored = true;
    if (hd && !k0) {   // date set by you in Immich = fixed anchor
      const y = +hd.date.slice(0, 4), t = Date.parse(hd.date + "T00:00:00Z");
      e.year = y; e.decimal_year = y + (t - Date.UTC(y, 0, 1)) / (365 * 864e5); e.from = y; e.to = y; e.date = hd.date;
      e.confirmedFlag = true; e.manualFlag = true; e.immich = true; e.draftFlag = false;
    } else if (k0 && k0.source !== "ignoriert") {
      e.year = k0.year; e.decimal_year = k0.decimal_year || k0.year; e.from = k0.from; e.to = k0.to; e.date = k0.date || "";
      if (k0.source === "draft") e.draftFlag = true;
      else { e.confirmedFlag = true; e.manualFlag = k0.source !== "confirmed"; }
    }
    if (e.confirmedFlag || e.draftFlag) e.refined = false;
    return e;
  };
  const unitsList = [];
  const cards = [];
  S.work.series.forEach((s) => {
    const u = {uid: "s:" + s.id, type: "series", s, keys: s.photos, ...data(s.photos, S.seriesYear[s.id])};
    const kk = s.photos.filter((k) => kindOf(k));
    if (kk.length) {   // series with cards: the rough time of the cards narrows the time of the series
      u.cardKeys = kk;
      const gz = kk.map(roughTime).filter(Boolean);
      if (gz.length) u.rough = {from: Math.min(...gz.map((g) => g.from)), to: Math.max(...gz.map((g) => g.to))};
    }
    if (kk.length === s.photos.length) { u.kind = kindOf(kk[0]); cardEstimate(u); cards.push(u); } else unitsList.push(u);   // cards only: belongs to “Cards and documents”
  });
  singleKeys().forEach((k) => unitsList.push({uid: "f:" + k, type: "photo", keys: [k], ...data([k], undefined)}));
  const before = new Map(unitsList.map((u) => [u, [u.year, u.from, u.to]]));
  ordered(unitsList);   // your order answers (older / sorting) move estimates that contradict them
  unitsList.forEach((u) => { const b = before.get(u); if (b && (u.year !== b[0] || u.from !== b[1] || u.to !== b[2])) u.refined = true; });
  const m = seriesMap();   // single cards and documents: their own units without AI estimate
  Object.keys(S.photos).filter((k) => kindOf(k) && !m[k]).sort().forEach((k) => { const u = {uid: "f:" + k, type: "photo", keys: [k], kind: kindOf(k), ...data([k], null)}; cardEstimate(u); cards.push(u); });
  return {unitsList, cards};
}
let eVer = -1, eCache = null;
export function unitList() {   // {list, afterUid, afterKey}, only recomputed on changes
  if (eVer !== S.ver || !eCache) {
    const {unitsList: list, cards} = buildUnits(), byUid = {}, byKey = {};
    [...list, ...cards].forEach((e) => { byUid[e.uid] = e; e.keys.forEach((k) => { byKey[k] = e; }); });
    eCache = {list, cards, byUid, byKey}; eVer = S.ver;
  }
  return eCache;
}
// Photo that is no longer in either of the two albums (working and anchor album) but still in a stored series
export const notInAlbum = (k) => !S.photos[k];
export const unitOf = (uid) => unitList().byUid[uid] || null;
export const unitFromKey = (key) => unitList().byKey[key] || null;

export function yearText(e) {
  if (!e.year) return tr("no estimate");
  if (e.date) return dateShort(e.date);
  if (e.draftFlag || e.from === e.to) return `${e.year}`;
  return `ca. ${e.year} (${e.from}–${e.to})`;
}
export const yearShort = (e) => (e.date ? dateShort(e.date) : String(e.year));
export const statusLabel = (e) => (!e.year ? tr("not dated yet") : e.confirmedFlag ? (e.immich ? (e.camera ? tr("Digital photo, date from the camera") : tr("set by you in Immich")) : e.manualFlag ? tr("set by hand") : tr("confirmed")) : e.draftFlag ? tr("draft") : tr("estimated"));
export const statusClass = (e) => (!e.year ? "open" : e.confirmedFlag ? "ok" : e.draftFlag ? "draft" : "estimate");

// ------------------------------------------------------------------ People on photos
// Display name: if Immich has only a first name (no surname), a "?" is appended
export const shortName = (n) => { const t = String(n || "").trim(); return t && !/\s/.test(t) ? t + " ?" : t; };
export const firstName = (n) => String(n || "").split(/\s+/)[0];
export function peopleText(key) { return (S.people[key] || []).map(firstName).join(", "); }
export function peopleTextUnit(e) { return [...new Set(e.keys.flatMap((k) => (S.people[k] || []).map(firstName)))].join(", "); }
// Age per person on the photo: {name, ai, now}
export function ageList(key, yearVal) {
  return (S.people[key] || []).map((n) => {
    const i = (S.age[key] || []).find((x) => x.name === n);
    return {name: n, ki: i && i.age != null ? Math.round(i.age) : null, currentVal: yearVal && i && i.birth ? Math.round(yearVal - i.birth) : null};
  });
}

// Photos of a person as units (a series counts as one tile)
export function personTiles(p) {
  const sm = seriesMap(), byUid = unitList().byUid, groups = {};
  p.photos.forEach((f) => {
    if (!S.photos[f.key]) return;
    const s = sm[f.key];
    const uid = s ? "s:" + s.id : "f:" + f.key;
    (groups[uid] = groups[uid] || []).push(f);
  });
  return Object.entries(groups).map(([uid, fl]) => {
    const e = byUid[uid];
    if (!e || e.kind) return null;
    const area = (f) => (f.box[2] - f.box[0]) * (f.box[3] - f.box[1]);
    const choice = ((S.ord || {})._title || {})[uid];   // cover photo of the series chosen by hand
    // cover photo by hand: also a photo of the series on which this person was not recognised (then without a face crop)
    const f = fl.find((x) => x.key === choice) || (choice && e.keys.includes(choice) && S.photos[choice] ? {key: choice, box: null} : fl.slice().sort((a, b) => area(b) - area(a))[0]);
    const kis = fl.map((x) => ((S.age[x.key] || []).find((i) => i.name === p.name) || {}).age).filter((x) => x != null);
    return {uid, e, f, keys: fl.map((x) => x.key), n: e.keys.length, ki: kis.length ? kis.reduce((a, b) => a + b, 0) / kis.length : null,
            series_id: uid.startsWith("s:") ? uid.slice(2) : ""};
  }).filter(Boolean);
}
const sigmaAge = (a) => (a < 6 ? 1.2 : a < 12 ? 1.8 : a < 20 ? 2.5 : a < 35 ? 3.5 : a < 55 ? 5 : 6.5);
// Birth year from photos with a confirmed year: year minus AI age, weighted by the accuracy of the age estimate
export function estimateBirth(p) {
  let sw = 0, sj = 0, n = 0;
  personTiles(p).forEach((k) => {
    if (!k.e.confirmedFlag || !k.e.year || k.ki === null) return;
    const w = 1 / sigmaAge(k.ki) ** 2;
    sw += w; sj += w * ((k.e.decimal_year || k.e.year) - k.ki); n++;
  });
  return n ? {year: Math.round(sj / sw * 10) / 10, n, errors: Math.round(Math.sqrt(1 / sw) * 10) / 10} : null;
}
// Person with the best birth year: Gramps, otherwise Immich, otherwise the estimated one you adopted (birthSource: Gramps | Immich | estimated | null)
let pvVer = -1, pvMap = {};
export function personOf(id) {
  const raw = (S.pf && S.pf.ok ? S.pf.people.find((p) => p.id === id) : null) || null;
  if (!raw) return null;
  if (pvVer !== S.ver) { pvVer = S.ver; pvMap = {}; }
  if (pvMap[id]) return pvMap[id];
  const L = lifeDates(raw.name), g = S.ord && S.ord._birth && S.ord._birth[id];
  let geburt = null, sourceVal = null;
  if (L.born) { geburt = L.born.decimal_year; sourceVal = L.source; }
  else if (raw.birth !== null && raw.birth !== undefined) { geburt = raw.birth; sourceVal = "Immich"; }
  else if (g) { geburt = g.year; sourceVal = "geschätzt"; }
  return pvMap[id] = {...raw, birth: geburt, birthSource: sourceVal, birthEstimated: g || null};
}

// ------------------------------------------------------------------ Life dates and warnings
export function grDateNumber(t) {
  const m = String(t || "").match(/(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return null;
  const mon = m[2] ? +m[2] : 0, tag = m[3] ? +m[3] : 0, z = (x) => String(x).padStart(2, "0");
  return {j: +m[1], decimal_year: +m[1] + ((mon || 1) - 1) / 12 + ((tag || 1) - 1) / 365, full: !!(mon && tag),
          text: tag ? `${z(tag)}.${z(mon)}.${m[1]}` : mon ? `${z(mon)}.${m[1]}` : m[1]};
}
let lebMemo = {}, lebSig = "";
export function lifeDates(name) {   // Gramps preferred, Immich as fallback
  const sig = (S.pf ? S.pf.people.length : 0) + "|" + (S.grP ? S.grP.state : "") + "|" + Object.keys(S.assignMap).length;
  if (sig !== lebSig) { lebMemo = {}; lebSig = sig; }
  if (lebMemo[name]) return lebMemo[name];
  const p = S.pf && S.pf.ok ? S.pf.people.find((x) => x.name === name) : null;
  const h = p && S.assignMap[p.id], g = h && S.grP ? S.grP.people.find((x) => x.h === h) : null;
  let bornVal = null, deathYear = null, sourceVal = "";
  if (g) { bornVal = grDateNumber(g.birth); deathYear = grDateNumber(g.death); sourceVal = "Gramps"; }
  if (!bornVal && p && p.birth !== null && p.birth !== undefined) { bornVal = {j: Math.floor(p.birth), decimal_year: p.birth, full: false, text: String(Math.floor(p.birth))}; sourceVal = "Immich"; }
  return lebMemo[name] = {born: bornVal, death: deathYear, source: sourceVal};
}
const cause = (e) => (e.confirmedFlag
  ? tr("Either a face is assigned wrongly, or the confirmed year or the date of birth/death is wrong.")
  : tr("Either a face is assigned wrongly, or the AI estimate is wrong."));
export function warnings(e) {
  if (!e || !e.year) return [];
  const fy = e.date ? +String(e.date).slice(0, 4) : e.year;
  const pd = e.date ? grDateNumber(e.date) : null;
  const nameList = [...new Set(e.keys.flatMap((k) => S.people[k] || []))];
  const off = [];
  nameList.forEach((n) => {
    const L = lifeDates(n), short = n;
    if (L.born) {
      const beforeVal = pd && pd.full && L.born.full ? pd.decimal_year < L.born.decimal_year - 0.002 : fy < L.born.j;
      if (beforeVal) off.push({type: tr("before birth"), name: short, hard: !!(e.confirmedFlag || (e.to && e.to < L.born.j)),
        text: `${tr("Dating {e}, but {kurz} was born {text} ({quelle}). {e2}", {e: yearShort(e), kurz: short, text: L.born.text, quelle: L.source, e2: cause(e)})}`});
    }
    if (L.death) {
      const after = pd && pd.full && L.death.full ? pd.decimal_year > L.death.decimal_year + 0.002 : fy > L.death.j;
      if (after) off.push({type: tr("after death"), name: short, hard: !!(e.confirmedFlag || (e.from && e.from > L.death.j)),
        text: `${tr("Dating {e}, but {kurz} died {text} ({quelle}). {e2}", {e: yearShort(e), kurz: short, text: L.death.text, quelle: L.source, e2: cause(e)})}`});
    }
  });
  return off;
}
export const warnCount = (list) => list.filter((e) => warnings(e).length).length;

// ------------------------------------------------------------------ Tasks (for the work list and the task view)
// “Unprocessed”: a single photo that lies in no series and has no confirmed year (also no fixed date from Immich)
export const unprocessed = (e) => e.type === "photo" && !e.confirmedFlag;
export function taskCounts() {
  const unitsList = unitList().list;
  return {
    new: unitsList.filter(unprocessed).length,
    inAlbum: S.newInfo && S.newInfo.ok ? S.newInfo.new : 0,
    warn: warnCount(unitsList),
    series: unitsList.filter((e) => e.type === "series" && e.s.status === "open").length + S.work.merge_hints.length,
    without: unitsList.filter((e) => !e.year).length,
    cards: unitList().cards.length,
    cardsOpen: unitList().cards.filter((e) => !e.year).length,
    open: unitsList.filter((e) => !e.confirmedFlag).length,
    changedFlag: unitsList.filter((e) => e.keys.some((k) => S.changed[k])).length,
  };
}
export function taskUnits(kindVal) {
  if (kindVal === "cards") return unitList().cards;
  const unitsList = unitList().list;
  const f = {
    warnings: (e) => warnings(e).length > 0,
    without: (e) => !e.year,
    series: (e) => e.type === "series" && (e.s.status === "open" || (e.s.suggested_new || []).length || S.work.merge_hints.some((h) => h.series.includes(e.s.id))),
    new: unprocessed,
    changed: (e) => e.keys.some((k) => S.changed[k]),
  }[kindVal] || (() => true);
  return unitsList.filter(f);
}
export const TASKS = {
  all: tr("All photos"), warnings: tr("Warnings"), without: tr("No estimate"), series: tr("Series to review"), new: tr("Unprocessed photos"), changed: tr("Changed in Immich"), cards: tr("Cards and documents"),
};

// First person with their own page who can be seen on one of these photos (names without a person page stay text)
export function personForPhotos(keys) {
  const ks = new Set(keys);
  return (S.pf && S.pf.ok ? S.pf.people : []).find((q) => q.photos.length && q.photos.some((f) => ks.has(f.key))) || null;
}
