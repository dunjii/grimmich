// The whole state of Grimmich in one place, plus loading and saving.
import {fetchIt, send, toast, recall} from "./util.js";
import {tr} from "./language.js";

export const S = {
  photos: {},                       // key -> {key, datei, id, gesichter, benannt, datierbar}
  work: {series: [], discarded: [], counters: 0},
  res: null,                       // {zeilen, korrekturen}
  corr: {},                        // key -> {year, decimal_year, from, to, date?, source: confirmed|manual|draft, before?}
  people: {}, allNames: [],     // key -> [Namen]
  age: {},                       // key -> [{name, geburt, alter}]
  changed: {},                      // key -> {texts, image, since}  (changes in Immich)
  pf: null,                        // {ok, personen:[{id, name, geburt, fotos:[{key, box}]}]}
  ord: {_anchor: {}},             // person ID -> order; _marker: markers without a photo
  assignMap: {},                       // Immich-Person-Id -> Gramps-Handle
  conn: null,                      // connections (without keys)
  sv: null, ss: {key_set: false, written: 0, result: null},   // write preview and status
  job: {running: false, rows: [], rc: null, name: null},
  newInfo: null,                   // {ok, album, neu}
  albums: [], pages: {}, aRow: {},           // Provenance: albums (id, name, keys) and page breaks per album
  inbox: {seen: []},
  immichData: {}, immichSeen: {},                 // key -> {date, scan}: capture date you set yourself in Immich
  seriesYear: {},                   // Serien-Id -> berechnetes Datum (Server)
  version: "",
  ez: {},                          // photo key -> [{id, pid, text, date, iso}]: Gramps events assigned to the photo
  gv: null, gw: {}, gs: {key_set: false, result: null},   // Nach Gramps: Vorschau, Geschriebenes (key -> Eintrag), Status
  kinds: {},                       // key -> postcard | greeting_card | document | other (missing = normal photo)
  places: {},                        // key -> {h, id, name, lat, lon, source, force?}: place of the photo (from Gramps)
  grPlaces: null,                    // {liste, nachH, ohne}: alle Orte aus Gramps
  similar: {},                        // similar photos per photo (response of the server)
  grP: null, grEv: {},             // Gramps: Personenliste, Ereignisse je Immich-Person
  notes: [],                       // notes on photos: {id, key, text, player, t} (from outside only the player's own)
  game: {votes: [], muted: []},                 // answers of the game: {type?, ...}; older: {a, b, pid, older: a|b|same|unknown|different}, who, year, place
  ver: 0,                          // counts changes so that derived data is recomputed
};

export const ui = {
  view: "start",                // start | person | aufgabe | eingang | album | schreiben | game
  personId: null, task: "", albumId: null, menu: null, placeId: null, seriesId: null,
  mode: "time",                   // time | sort | series (only for a person)
  focusKey: null, photoKey: null,      // chosen unit (uid) and the photo chosen in it
  sel: new Set(recall("korb", [])),                  // selected units (for merging etc.)
  p2: null, grAll: false, grUsed: false, listFilter: "all", listOpen: recall("listeOffen", true),
  settings: false, searchOpen: false, writeFilter: "skip", more: 0, search: "",
  thresholdPerson: 0.72, thresholdAll: 0.80,
};

export const hook = {render() {}};
export const mark = () => { S.ver++; };
export const draw = () => hook.render();

const indexIt = (d) => { const m = {}; (d.photos || []).forEach((f) => { m[f.key] = f; }); return m; };

export async function loading() {
  const a = await fetchIt("/api/all");
  S.photos = indexIt(a.photos);
  S.work = a.work;
  S.work.merge_hints = S.work.merge_hints || []; S.work.merge_rejected = S.work.merge_rejected || [];
  const live = new Set(S.work.series.map((s) => s.id));   // merge hints about series that no longer exist are dropped
  S.work.merge_hints = S.work.merge_hints.filter((h) => Array.isArray(h.series) && h.series.length > 1 && h.series.every((id) => live.has(id)));
  S.work.series.forEach((s) => { s.suggested_new = s.suggested_new || []; s.rejected = s.rejected || []; });
  S.res = a.results; S.corr = a.results.corrections || {};
  S.people = a.people.people || {}; S.allNames = a.people.all || [];
  S.changed = a.changes.photos || {};
  S.age = a.age || {};
  S.pf = a.people_photos;
  S.ord = a.order && typeof a.order === "object" ? a.order : {};
  if (!S.ord._anchor) S.ord._anchor = {};
  S.assignMap = a.assignment && typeof a.assignment === "object" ? a.assignment : {};
  S.conn = a.connection; S.sv = a.write_preview; S.ss = a.write_status; S.job = a.job;
  S.albums = (a.provenance_albums || {}).albums || []; S.pages = (a.provenance || {}).pages || {}; S.aRow = (a.provenance || {}).order || {};
  S.inbox = a.inbox || {seen: []};
  S.immichData = (a.immich_data || {}).photos || {};
  S.immichSeen = (a.immich_data || {}).seen || {};
  S.geo = (a.immich_data || {}).geo || {};          // places Immich has: {key: {lat, lon, t}}
  S.version = a.version || "";
  S.game = a.game_votes && Array.isArray(a.game_votes.votes) ? {votes: a.game_votes.votes, muted: a.game_votes.muted || []} : {votes: [], muted: []};
  S.notes = a.notes && Array.isArray(a.notes.notes) ? a.notes.notes : [];
  S.player = S.signedIn || recall("player", "");   // from outside the name comes from the sign-in
  S.kinds = a.kinds && typeof a.kinds === "object" ? a.kinds : {};
  S.places = a.places && typeof a.places === "object" ? a.places : {};
  S.ez = a.event_assignment && typeof a.event_assignment === "object" ? a.event_assignment : {};
  S.gv = a.gramps_preview || null; S.gw = a.gramps_written || {}; S.gs = a.gramps_status || {key_set: false, result: null};
  mark();
}
export async function loadNewInfo() { try { S.newInfo = await fetchIt("/api/new"); } catch (e) { S.newInfo = null; } }

// ---- Speichern (jede Datei hat ihre eigene Funktion)
const problem = () => toast(tr("Saving failed. Is Grimmich still running?"));
let workTimer = null;
export function saveWork() { clearTimeout(workTimer); workTimer = setTimeout(() => send("/api/work", S.work).catch(problem), 150); }
export const saveCorr = () => send("/api/corrections", S.corr).catch(problem);
export const saveOrd = () => send("/api/order", S.ord).catch(problem);
export const saveKinds = () => send("/api/kinds", S.kinds).catch(problem);
export const savePlaces = () => send("/api/places", S.places).catch(problem);
export const saveEz = () => send("/api/event_assignment", S.ez).catch(problem);
export const saveAssign = () => send("/api/assignment", S.assignMap).catch(problem);
export const saveChanges = () => send("/api/changes", {photos: S.changed}).catch(problem);
export const savePages = () => send("/api/provenance", {pages: S.pages, order: S.aRow}).catch(problem);
// An answer of the game goes to the server on its own (op "add") or the last answer of this player is taken back (op "undo");
// the server returns the whole list, so the answers of other players are there too.
export async function sendVote(op, vote) {
  try {
    const r = await send("/api/vote", {op, vote, player: S.player});
    if (r && r.ok) { S.game = {votes: r.votes, muted: r.muted || []}; mark(); } else problem();
  } catch (e) { problem(); }
}
// Notes on photos: op "add" ({key, text}) or "delete" ({id}); the game sends the player's name, Grimmich itself none (= the owner).
export async function sendNote(op, note, player = S.player) {
  try {
    const r = await send("/api/note", {op, ...note, player});
    if (r && r.ok) { S.notes = r.notes || []; mark(); return true; }
    problem();
  } catch (e) { problem(); }
  return false;
}
export const saveInbox = () => send("/api/inbox", S.inbox).catch(problem);

// The words Grimmich writes into Immich (chosen once on the server, see naming.py); German until the server has answered.
export const writtenNames = () => {
  const w = (S.conn && S.conn.written) || {};
  return {tag_estimated: w.tag_estimated || "Datierung geschätzt", tag_open: w.tag_open || "Datierung offen"};
};
