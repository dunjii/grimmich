// Gramps: assign people, load events, adopt events as markers. Gramps is only read.
import {tr} from "./language.js";
import {S, draw, saveOrd, mark} from "./state.js";
import {fetchIt, dateValues} from "./util.js";
import {personTiles, personOf} from "./model.js";
import {yearsMap, mirrorChanges, newAnchor, insertAnchor, anchorPosition} from "./ordering.js";

export const GR_KIND = {"Birth": tr("Birth"), "Death": tr("Death"), "Burial": tr("Burial"), "Baptism": tr("Baptism"), "Christening": tr("Baptism"), "Adult Christening": tr("Adult baptism"),
  "Confirmation": tr("Confirmation"), "First Communion": tr("First Communion"), "Marriage": tr("Marriage"), "Divorce": tr("Divorce"), "Engagement": tr("Engagement"),
  "Residence": tr("Residence"), "Census": tr("Census"), "Occupation": tr("Occupation"), "Emigration": tr("Emigration"), "Immigration": tr("Immigration"),
  "Education": tr("Education"), "Graduation": tr("Graduation"), "Military Service": tr("Military service"), "Retirement": tr("Retirement"), "Cremation": tr("Cremation"),
  "Adoption": tr("Adoption"), "Naturalization": tr("Naturalization"), "Property": tr("Property"), "Probate": tr("Probate"), "Will": tr("Will"),
  "Degree": tr("Graduation"), "Elected": tr("Election"), "Ordination": tr("Ordination"), "Blessing": tr("Blessing"), "Bar Mitzvah": tr("Bar Mitzvah"), "Bas Mitzvah": tr("Bat Mitzvah")};
export const GR_SIDE = new Set(["Census", "Occupation", "Property", "Retirement", "Probate", "Will", "Cause Of Death", "Medical Information", "Number Of Marriages",
  "Nationality", "Religion", "Education", "Title of Nobility", "Elected", "Description"]);
export const GR_PLACE_ANCHOR = new Set(["Residence", "Emigration", "Immigration", "Property"]);
const GR_REFERENCE = {"son": tr("Son"), "daughter": tr("Daughter"), "father": tr("Father"), "mother": tr("Mother"), "husband": tr("Husband"), "wife": tr("Wife"), "spouse": tr("Spouse"),
  "brother": tr("Brother"), "sister": tr("Sister"), "stepson": tr("Stepson"), "stepdaughter": tr("Stepdaughter"), "stepfather": tr("Stepfather"), "stepmother": tr("Stepmother"),
  "stepbrother": tr("Stepbrother"), "stepsister": tr("Stepsister"), "grandson": tr("Grandson"), "granddaughter": tr("Granddaughter"), "grandfather": tr("Grandfather"), "grandmother": tr("Grandmother")};
export const grKind = (t) => GR_KIND[t] || t;

// ---- Laden
export async function loadGrampsPeople(fresh) {
  const r = await fetchIt("/api/gramps_people" + (fresh ? "?new=1" : ""));
  S.grP = r.ok ? r : null;
  mark();
  return r;
}
// All places from Gramps (name with higher-level places, coordinates). Load once, “new” fetches them fresh from Gramps.
let placeLoading = false;
export async function loadGrampsPlaces(fresh) {
  if (placeLoading || (S.grPlaces && !fresh)) return;
  placeLoading = true;
  try {
    const r = await fetchIt("/api/gramps_places" + (fresh ? "?new=1" : ""));
    if (r.ok) { const byHandle = {}; r.places.forEach((o) => { byHandle[o.h] = o; }); S.grPlaces = {list: r.places, byHandle, without: r.without}; }
    else S.grPlaces = {errors: r.text, list: [], byHandle: {}, without: 0};
  } catch (e) { S.grPlaces = {errors: tr("The server did not respond."), list: [], byHandle: {}, without: 0}; }
  placeLoading = false;
  mark(); draw();
}
export async function loadEvents(pid, again) {
  if (!S.assignMap[pid] || (S.grEv[pid] && !again)) return;
  S.grEv[pid] = "laeuft";
  try { const r = await fetchIt("/api/gramps_events?h=" + encodeURIComponent(S.assignMap[pid])); S.grEv[pid] = r.ok ? {list: r.events, fields: r.fields || []} : {errors: r.text}; }
  catch (e) { S.grEv[pid] = {errors: tr("The server did not respond.")}; }
  draw();
}

// ---- Namen vergleichen (Immich <-> Gramps)
const normTokens = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss")
  .replace(/\b(geb|geborene?|nee)\b\.?/g, " ").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
export const yearFromText = (t) => { const m = String(t || "").match(/(\d{4})/); return m ? +m[1] : null; };
// All spellings of a Gramps person: main and further names, each with given/called name and every surname alone and all together
function grVariants(g) {
  const nameList = [{given: g.given, called: g.called || "", surnames: g.surnames}, ...(g.old || []).map((a) => ({given: a.given || g.given, called: "", surnames: a.surnames}))];
  const firstNames = new Set();
  nameList.forEach((n) => { [n.given, String(n.given || "").split(/\s+/)[0], n.called].forEach((v) => { if (v) firstNames.add(v); }); });
  const lastNames = [...new Set(nameList.flatMap((n) => n.surnames))], allSurnames = lastNames.join(" "), var_ = [];
  firstNames.forEach((v) => { lastNames.forEach((n) => var_.push(v + " " + n)); if (lastNames.length > 1) var_.push(v + " " + allSurnames); });
  return var_.map((t) => new Set(normTokens(t)));
}
export function grCandidates(p) {
  if (!S.grP) return [];
  const mt = new Set(normTokens(p.name)), yearVal = p.birth !== null ? Math.floor(p.birth) : null;
  return S.grP.people.map((g) => {
    let score = 0;
    grVariants(g).forEach((gt) => { score = Math.max(score, [...mt].filter((x) => gt.has(x)).length / Math.max(1, new Set([...mt, ...gt]).size)); });
    const gj = yearFromText(g.birth);
    return {g, score, gj, yearOk: yearVal === null || gj === null ? null : Math.abs(yearVal - gj) <= 1};
  }).filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score || (b.yearOk === true) - (a.yearOk === true)).slice(0, 8);
}
export function grStatus(k) {
  if (!k.length) return "none";
  const b = k[0], z = k[1], unique = !(z && z.score >= b.score - 0.001 && z.yearOk === b.yearOk);
  if (b.score >= 0.99 && b.yearOk === true && unique) return "certain";
  if (b.score >= 0.6 && b.yearOk !== false && unique) return "suggestion";
  return "unclear";
}
export const GR_STATUS = {certain: tr("certain"), suggestion: tr("suggestion"), unclear: tr("unclear"), none: tr("no match")};
export const grName = (g) => [g.given, ...g.surnames].join(" ");

// ---- Ereignisse beschreiben
const z2 = (x) => String(x).padStart(2, "0");
const grDatePart = (a) => (a[2] ? `${z2(a[2])}.${z2(a[1])}.${a[0]}` : a[1] ? `${z2(a[1])}.${a[0]}` : String(a[0]));
export function grDateText(d) {
  const g = d.estimated ? tr("estimated ") : "";
  if (d.mode === "zeitraum" || d.mode === "zwischen") return `${g}${grDatePart(d.from)} – ${grDatePart(d.to)}`;
  return `${g}${{um: tr("around "), vor: tr("before "), nach: tr("after ")}[d.mode] || ""}${grDatePart(d.from)}`;
}
export const grYearDec = (a) => a[0] + ((a[1] || 1) - 1) / 12 + ((a[2] || 1) - 1) / 365;
export const grSort = (e) => e.date.from[0] * 400 + (e.date.from[1] || 6) * 32 + (e.date.from[2] || 15);
export const grPeriod = (e) => e.date.mode === "zeitraum" || e.date.mode === "zwischen";
// Close relatives (parents, spouses, children) belong in the lifeline by default, siblings and other relatives only on request.
const GR_NEAR = new Set(["self", "eltern", "vater", "mutter", "father", "mother", "ehefrau", "ehemann", "ehepartner", "partner", "partnerin", "wife", "husband", "spouse", "sohn", "tochter", "son", "daughter"]);
export const grNear = (e) => typeof e.near === "boolean" ? e.near : !e.who || GR_NEAR.has(String(e.who).toLowerCase());
export const grSelf = (e) => String(e.who || "").toLowerCase() === "self";
export function grWho(e) {   // Bezug zur Person („Sohn Paul“); eigene Ereignisse (Gramps meldet „self“) haben keinen Bezug
  if (grSelf(e)) return "";
  const lm = String(e.label || "").match(/\(([^)]+)\)/);
  const rel = e.who ? (GR_REFERENCE[String(e.who).toLowerCase()] || e.who) : (lm ? lm[1] : "");
  const n = String(e.who_name || (e.names || [])[0] || "");
  const priorVal = n.includes(",") ? n.split(",")[1].trim().split(/\s+/)[0] : n.split(/\s+/)[0];
  return [rel, priorVal].filter(Boolean).join(" ");
}
export function grDescr(e) {
  const b = String(e.descr || "").trim(), l = String(e.label || "").trim();
  const text = b && b !== grKind(e.kind) && b !== e.kind ? b : (l && l !== grKind(e.kind) && l !== e.kind ? l : "");
  const nameList = (e.names || []).join(" & ");
  return nameList && !text.includes(nameList) ? (text ? text + " – " + nameList : nameList) : text;
}
// Short text: “Residence (Halle)”, “Birth (son Oskar)”, “Marriage to Margarete”. The place is always in brackets; for dots only for place events (placeAll: for all, for bars).
const PARTNER_KIND = new Set(["Marriage", "Divorce", "Engagement"]);
export function grShort(e, placeAll) {
  const partner = !grWho(e) && PARTNER_KIND.has(e.kind) && e.own && (e.names || [])[0] ? tr(" with ") + String(e.names[0]).split(/\s+/)[0] : "";
  const placeVal = e.place && (placeAll || GR_PLACE_ANCHOR.has(e.kind)) ? e.place.split(",")[0].replace(/\s*\(([^)]*)\)/g, ", $1").trim() : "";   // “Halle (Saale)” -> “Halle, Saale” (no bracket inside the bracket)
  const insideVal = [grWho(e), placeVal].filter(Boolean).join(", ");
  return grKind(e.kind) + partner + (insideVal ? " (" + insideVal + ")" : "");
}

// ---- adopt an event as a marker into the person's row (part: one | begin | end | both)
export async function grAnchor(pid, evId, partVal) {
  const p = personOf(pid), st = S.grEv[pid];
  if (!p || !st || !st.list) return;
  const e = st.list.find((x) => x.id === evId);
  if (!e) return;
  const tileList = personTiles(p), previous = yearsMap(p, tileList);
  (partVal === "beide" ? ["beginn", "ende"] : [partVal]).forEach((t) => {
    const a = t === "ende" ? e.date.to : e.date.from;
    const w = dateValues({tag: a[2] || 0, mon: a[1] || 0, j: a[0]});
    if (w.errors) return;
    const keyword = `${grShort(e)}${t === "beginn" ? tr(" Start") : t === "ende" ? tr(" End") : ""}`;
    const id = newAnchor({year: w.j, decimal_year: w.decimal_year, date: w.date, text: keyword, imprecise: e.date.mode !== "genau" || !!e.date.estimated, event: e.id, part: t, source: "gramps"});
    insertAnchor(p, id, anchorPosition(p, tileList, w.decimal_year));
  });
  mirrorChanges(p, previous);
  await saveOrd();
  draw();
}
