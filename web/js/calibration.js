// Calibration of the AI age estimate on photos whose year is fixed independently of the AI.
// Evaluation only: changes no estimate and writes nothing.
import {S} from "./state.js";
import {seriesMap, immichDate} from "./model.js";

const SHRINK = 5;                     // this many photos a person needs for their correction to count by half
const MIN_PERSON = 5;                   // below that, nothing is corrected for the person
const LEVELS = [[0, 10], [10, 20], [20, 35], [35, 55], [55, 200]];   // nach KI-Alter
const median = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const meanVal = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function decimal(dateVal) {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(dateVal || "");
  return m ? +m[1] + (+m[2] - 1) / 12 + (+m[3] - 1) / 365 : null;
}
// Year of a photo that does not come from the AI (otherwise null).
export function independentYear(key) {
  const k = S.corr[key];
  if (k && k.source === "ignoriert") return null;
  if (k && k.source === "manual" && (k.own || k.date)) return k.decimal_year || k.year;
  const hd = immichDate(key);
  if (!k && hd) return decimal(hd.date);
  return null;
}

export function compare() {
  const sm = seriesMap(), entryList = [];
  Object.keys(S.age).forEach((key) => {
    const j = independentYear(key);
    if (j === null) return;
    const group = sm[key] ? "s:" + sm[key].id : "f:" + key;
    (S.age[key] || []).forEach((a) => {
      if (a.age === null || a.birth === null || a.birth === undefined) return;
      const trueAge = j - a.birth;
      if (trueAge < 0 || trueAge > 110) return;
      entryList.push({key, group, name: a.name, ki: a.age, trueAge, dev: a.age - trueAge});
    });
  });
  return entryList;
}

const levelOf = (ki) => LEVELS.findIndex(([a, b]) => ki >= a && ki < b);

// Corrections from the comparison photos (without the group 'without')
export function correctionMap(entryList, withoutVal) {
  const basis = withoutVal ? entryList.filter((e) => e.group !== withoutVal) : entryList;
  const general = LEVELS.map(([a, b], i) => {
    const l = basis.filter((e) => levelOf(e.ki) === i).map((e) => e.dev);
    return l.length ? median(l) * l.length / (l.length + SHRINK) : 0;
  });
  const peopleList = {};
  [...new Set(basis.map((e) => e.name))].forEach((n) => {
    const l = basis.filter((e) => e.name === n).map((e) => e.dev - general[levelOf(e.ki)]);
    peopleList[n] = l.length >= MIN_PERSON ? median(l) * l.length / (l.length + SHRINK) : 0;
  });
  return {general, people: peopleList};
}
export const correction = (k, name, ki) => (k.general[levelOf(ki)] || 0) + (k.people[name] || 0);

export function evaluate() {
  const e = compare();
  if (!e.length) return {n: 0};
  const k = correctionMap(e);
  // Backward check: leave out each group (series or single photo) once, correct with the rest
  const groups = [...new Set(e.map((x) => x.group))];
  const raw = [], fresh = [];
  groups.forEach((g) => {
    const kk = correctionMap(e, g);
    e.filter((x) => x.group === g).forEach((x) => { raw.push(Math.abs(x.dev)); fresh.push(Math.abs(x.dev - correction(kk, x.name, x.ki))); });
  });
  const nameList = [...new Set(e.map((x) => x.name))].sort((a, b) => a.localeCompare(b, "de"));
  const perPerson = nameList.map((n) => {
    const l = e.filter((x) => x.name === n);
    return {name: n, n: l.length, photos: new Set(l.map((x) => x.group)).size, mean: meanVal(l.map((x) => x.dev)), corr: k.people[n] || 0};
  });
  const perLevel = LEVELS.map(([a, b], i) => {
    const l = e.filter((x) => levelOf(x.ki) === i);
    return {from: a, to: b, n: l.length, median: l.length ? median(l.map((x) => x.dev)) : null, corr: k.general[i]};
  });
  // Effect on photos without an independent year
  let total = 0, shifted = 0, sum = 0;
  Object.keys(S.age).forEach((key) => {
    if (independentYear(key) !== null) return;
    (S.age[key] || []).forEach((a) => {
      if (a.age === null) return;
      total++;
      const d = correction(k, a.name, a.age);
      if (Math.abs(d) >= 1) { shifted++; sum += Math.abs(d); }
    });
  });
  return {n: e.length, photos: groups.length, rawError: meanVal(raw), newError: meanVal(fresh), perPerson, perLevel, total, shifted, meanShift: shifted ? sum / shifted : 0};
}
