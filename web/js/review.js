// What should be written to Immich: one row per photo, from the current state of the datings.
import {S, ui, writtenNames} from "./state.js";
import {send, fetchIt} from "./util.js";
import {unitList, immichDate, kindOf, placeFrom, warnings} from "./model.js";
import {provenanceOf, provenanceText} from "./provenance.js";

// Option “write confirmed photos only”: drafts, estimates and open photos stay untouched in Immich. Remembered in the browser.
export const onlyConfirmedFlag = () => { try { const w = localStorage.getItem("grimmich.nurBestaetigt"); if (w !== null) return w === "1"; } catch (e) { /* ohne Speicher */ } return !!ui.onlyConfirmed; };
export function setOnlyConfirmed(onValue) { ui.onlyConfirmed = onValue; try { localStorage.setItem("grimmich.nurBestaetigt", onValue ? "1" : "0"); } catch (e) { /* ohne Speicher */ } }
export function adoptionRows() {
  const zm = {};
  ((S.res && S.res.rows) || []).forEach((z) => { zm[z.key] = z; });
  const lines = [];
  const everyone = unitList();
  [...everyone.list, ...everyone.cards].forEach((e) => e.keys.forEach((k) => {
    const z = zm[k] || {};
    let status = "offen", tag = writtenNames().tag_open, readOnly = false, handDate = "";
    const k0 = S.corr[k];
    if (e.immich && immichDate(k)) { status = "in Immich gesetzt"; tag = ""; readOnly = true; }   // only photos with their own manual date; siblings in the series get the same date   // your date in Immich: not touched
    else if (e.year) { status = e.draftFlag ? "Entwurf" : e.confirmedFlag ? (e.manualFlag ? "manuell" : "bestätigt") : "Schätzung"; tag = writtenNames().tag_estimated; }
    if (kindOf(k) && e.year && !e.date && e.from && e.to && e.from !== e.to && (status === "manuell" || status === "bestätigt")) status = "Schätzung";   // card with a range: stays marked as “ca.”
    if (e.immichDate && k0 && k0.source !== "ignoriert" && !e.immich) {   // you changed the Immich date in Grimmich
      const same = e.date ? e.date === e.immichDate : e.year === +e.immichDate.slice(0, 4);
      if (same) { if (immichDate(k)) readOnly = true; } else handDate = e.immichDate;
    }
    lines.push({key: k, asset: (S.photos[k] || {}).id || "", names: S.people[k] || [], file: (S.photos[k] || {}).file || "", series_id: e.type === "series" ? e.s.id : "",
                 fixed: !!e.confirmedFlag, warn: warnings(e).length > 0, year: e.year || "", date: e.date || "", from: e.from || "", to: e.to || "", status, tag, current: z.current || "", hint: e.hint || "", readOnly, manual_date: handDate, anchor: !!(S.immichData[k] || {}).anchor, source: e.camera ? "" : provenanceOf(k).map(provenanceText).join("; "), force: !!(k0 && k0.overwrite), kind: kindOf(k),
                 place: (placeFrom(k) && placeFrom(k).lat != null && placeFrom(k).lon != null) ? {lat: placeFrom(k).lat, lon: placeFrom(k).lon, name: placeFrom(k).name} : null, placeWithout: !!(placeFrom(k) && placeFrom(k).lat == null), placeForce: !!(placeFrom(k) && placeFrom(k).force)});
  }));
  return lines.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.key.localeCompare(b.key));
}
// What should be written? Scope (all photos or one album) and content (date and tags, source, place). Remembered in the browser.
const readIt = (k, std) => { try { const w = localStorage.getItem("grimmich." + k); return w === null ? std : w; } catch (e) { return std; } };
const remember = (k, w) => { try { localStorage.setItem("grimmich." + k, w); } catch (e) { /* ohne Speicher */ } };
export const withWarning = () => readIt("mitWarnung", "0") === "1";
export const setWithWarning = (onValue) => remember("mitWarnung", onValue ? "1" : "0");
export const writeWhat = () => ({date: readIt("wasDatum", "1") === "1", source: readIt("wasQuelle", "0") === "1", place: readIt("wasOrt", "1") === "1"});
export const setWhat = (fieldName, onValue) => remember("was" + fieldName[0].toUpperCase() + fieldName.slice(1), onValue ? "1" : "0");
export const writeAlbum = () => { const id = readIt("schreibAlbum", ""); return S.albums.some((a) => a.id === id) ? id : ""; };
export const setWriteAlbum = (id) => remember("schreibAlbum", id || "");
export const writeSig = () => JSON.stringify([onlyConfirmedFlag(), writeAlbum(), writeWhat(), withWarning()]);
// Places: a photo with a place is also written for “confirmed only” and for photos with your Immich date, then only the place goes (onlyPlace).
export function writeRows() {
  const what = writeWhat(), nb = onlyConfirmedFlag(), alb = S.albums.find((a) => a.id === writeAlbum()), inAlbum = alb ? new Set(alb.keys) : null, off = [];
  adoptionRows().forEach((r) => {
    if (!r.asset || r.anchor || (inAlbum && !inAlbum.has(r.key))) return;   // anchor album: read only
    if (r.warn && !withWarning()) return;   // Warning (date does not fit birth or death): is not written unless allowed
    const sourceAt = what.source && !!r.source && (!nb || r.fixed), placeVal = what.place ? r.place : null;
    const dateAt = what.date && !r.readOnly && (!nb || r.fixed);
    if (!dateAt && !sourceAt && !placeVal) return;
    off.push({key: r.key, source: sourceAt ? r.source : "", sourceUntouched: !what.source, onlySource: !dateAt && sourceAt, onlyPlace: !dateAt && !sourceAt,
      place: placeVal, placeForce: r.placeForce, asset: r.asset, names: r.names, year: r.year || 0, date: r.date, from: r.from || 0, to: r.to || 0, status: r.status, series_id: r.series_id,
      hint: r.hint, manual_date: r.manual_date, force: r.force, kind: r.kind});
  });
  return off;
}
export const saveAdoption = () => send("/api/adoption", {rows: writeRows()});
export async function loadWrite() {
  try { S.sv = await fetchIt("/api/write_preview"); } catch (e) { S.sv = null; }
  try { S.ss = await fetchIt("/api/write_status"); } catch (e) { /* alter Stand bleibt */ }
}
export function loadCsv() {
  const head = ["Schluessel", "Datei", "Serie", "Jahr", "Datum", "von", "bis", "Status", "Tag", "Aktuelles Datum", "Hinweis"];
  const lines = [head, ...adoptionRows().map((r) => [r.key, r.file, r.series_id, r.year, r.date, r.from, r.to, r.status, r.tag, r.current, r.hint])];
  const csv = "﻿" + lines.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
  a.download = "datierung_vorschau.csv"; a.click();
}
