// Start, drawing and distributing the clicks.
import {S, ui, hook, loading, loadNewInfo, draw, mark} from "./state.js";
import {$, remember, send, toast, PLAY} from "./util.js";
import {unitList, unitOf, unitFromKey, personForPhotos} from "./model.js";
import "./joint.js";   // rows, anchors and answers together (registers itself in model.js)
import {loadGrampsPeople, loadEvents} from "./gramps.js";
import {loadWrite} from "./review.js";
import {checkJob, startJob} from "./job.js";
import {headHtml} from "./ui/header.js";
import {listHtml, peopleState} from "./ui/list.js";
import {personHtml} from "./ui/person.js";
import {detailHtml} from "./ui/detail.js";
import {taskHtml, inboxHtml, albumHtml, actions as aViews} from "./ui/views.js";
import {writeHtml, actions as aWrite} from "./ui/write.js";
import {selectionBar} from "./ui/tile.js";
import {redrawAfterSort, actions as aSort} from "./ui/sorting.js";
import {actions as aSeries, descriptionChanged} from "./ui/series.js";
import {actions as aCommon, setVisible} from "./ui/actions.js";
import {actions as aSettings, openSettings, assignmentChosen, connectionOk} from "./ui/settings.js";
import {closeIt} from "./ui/dialog.js";
import {actions as aHelp} from "./ui/help.js";
import {actions as aSearch} from "./ui/search.js";
import {actions as aGramps} from "./ui/gramps.js";
import {actions as aSimilar} from "./ui/hints.js";
import {actions as aEvent, eventHtml} from "./ui/event.js";
import {actions as aPlaces} from "./ui/places.js";
import {checkHtml, actions as aCheck} from "./ui/check.js";
import {gameHtml, actions as aGame, startOnPhone} from "./ui/game.js";
import {gameEvalHtml, actions as aGameEval} from "./ui/gameeval.js";
import {checkSignIn} from "./ui/login.js";
import {grAnchor} from "./gramps.js";
import {tr, translatePage, setLanguage} from "./language.js";

// ------------------------------------------------------------------ Zeichnen
function startHtml() {
  const n = Object.keys(S.photos).length;
  if (!n) return `<div class="empty large-empty"><h1>${tr("Welcome to Grimmich")}</h1><p>${tr("No photos have been loaded yet. Enter the connection to Immich under the gear icon, then click “Refresh” on the start page.")}</p><p><button class="primary" data-a="go-inbox">${tr("Go to start page")}</button> <button data-a="settings">${tr("Set up connections")}</button></p></div>`;
  return '<div class="empty large-empty"><h1>' + tr("Choose a person or a task on the left") + '</h1></div>';
}
function middleHtml() {
  return {person: personHtml, task: taskHtml, inbox: inboxHtml, album: albumHtml, event: eventHtml, gameeval: gameEvalHtml}[ui.view]?.() ?? startHtml();
}
let calcSig = "", calcNo = 0;
async function calcSeries() {
  if (PLAY) return false;   // the game does not need the series years
  const nr = ++calcNo;
  try {
    const r = await send("/api/series_calc", {series: S.work.series.map((s) => ({id: s.id, photos: s.photos}))});
    if (nr === calcNo) { S.seriesYear = r; return true; }
  } catch (e) { /* ohne Serienjahr weiter */ }
  return false;
}
function drawAll() {
  mark();
  const write_it = ui.view === "write" || ui.view === "game" || ui.view === "check", frame = $("frame");
  const scroll = {list: $("list").scrollTop, detail: $("detail").scrollTop};
  document.body.classList.toggle("write", write_it);
  frame.classList.toggle("list-closed", !ui.listOpen);
  frame.classList.toggle("no-detail", ui.view === "start" || ui.view === "write" || ui.view === "gameeval");
  frame.classList.toggle("detail-empty", !(ui.focusKey && unitOf(ui.focusKey)));   // nothing chosen: narrow column
  const searchFocus = document.activeElement && document.activeElement.id === "search-field", searchPos = searchFocus ? document.activeElement.selectionStart : 0;
  $("handle").innerHTML = write_it ? "" : `<button data-a="${ui.listOpen ? "list-close" : "list-open"}" title="${ui.listOpen ? tr("Collapse work list") : tr("Open work list")}" aria-label="${ui.listOpen ? tr("Collapse work list") : tr("Open work list")}">${ui.listOpen ? "◂" : "▸"}</button>`;
  $("handle").classList.toggle("closed", !ui.listOpen);
  $("head").innerHTML = headHtml();
  if (searchFocus && $("search-field")) { $("search-field").focus(); $("search-field").setSelectionRange(searchPos, searchPos); }
  if (write_it) { $("page").innerHTML = ui.view === "game" ? gameHtml() : ui.view === "check" ? checkHtml() : writeHtml(); $("frame").hidden = true; $("page").hidden = false; }
  else {
    $("page").hidden = true; $("frame").hidden = false;
    $("list").innerHTML = listHtml(); $("middle").innerHTML = middleHtml(); $("detail").innerHTML = detailHtml();
    $("list").scrollTop = scroll.list; $("detail").scrollTop = scroll.detail;
  }
  $("selection").innerHTML = write_it ? "" : selectionBar();
  document.body.classList.toggle("with-bar", ui.sel.size > 0 && !write_it);
  setVisible([...document.querySelectorAll("#middle .tile[data-key], #middle .pface[data-key]")].map((t) => t.dataset.key).filter((k, i, a) => a.indexOf(k) === i));
  if (ui.scrollZu) { const t = document.querySelector(`#middle [data-uid="${CSS.escape(ui.scrollZu)}"]`); ui.scrollZu = null; if (t) t.scrollIntoView({block: "center"}); }
  redrawAfterSort();
  if (ui.view === "person" && ui.personId && S.assignMap[ui.personId]) loadEvents(ui.personId);
  const sig = JSON.stringify(S.work.series.map((s) => [s.id, s.photos.slice().sort()])) + Object.keys(S.age).length;
  if (sig !== calcSig) { calcSig = sig; calcSeries().then((ok) => { if (ok) drawAll(); }); }
}
hook.render = () => { drawAll(); historyKeep(); };

// ------------------------------------------------------------------ Verlauf (Maus-Daumentasten / Browser-Pfeile)
// Every new view (person, task, album, inbox, write, timeline/sort/series) becomes an entry
// in the browser history. The chosen photo is only stored along so that “Back” selects it again.
const historyKey = (d) => [d.view, d.personId, d.task, d.albumId, d.eventId, d.view === "person" ? d.mode : ""].join("|");
const historyState = () => ({view: ui.view, personId: ui.personId, task: ui.task, albumId: ui.albumId, eventId: ui.eventId, mode: ui.mode, focusKey: ui.focusKey, photoKey: ui.photoKey, p2: ui.p2});
let historyFirst = true;
function historyKeep() {
  const currentVal = historyState();
  try {
    if (historyFirst || !history.state || historyKey(history.state) === historyKey(currentVal)) history.replaceState(currentVal, "");
    else history.pushState(currentVal, "");
  } catch (e) { /* ohne Verlauf weiter */ }
  historyFirst = false;
}
window.addEventListener("popstate", async (ev) => {
  if (!ev.state) return;
  Object.assign(ui, ev.state); ui.sel.clear(); ui.more = 0; ui.scrollZu = ui.focusKey; closeIt(); ui.settings = false;
  draw();
  if (ui.view === "write") { await loadWrite(); draw(); }
  else if (ui.view === "inbox") loadNewInfo().then(draw);
});

// ------------------------------------------------------------------ Navigation
const toTop = () => window.scrollTo(0, 0);
function goTo(view, data = {}) {
  Object.assign(ui, {view, focusKey: null, photoKey: null, more: 0}, data);
  ui.sel.clear(); closeIt(); toTop(); draw();
}
const aNavigation = {
  "go-person": (el) => {
    const e = el.dataset.key ? unitFromKey(el.dataset.key) : null;   // with photo: select it again there
    goTo("person", {personId: el.dataset.pid, ...(e ? {mode: "time"} : {}), ...(e ? {focusKey: e.uid, photoKey: el.dataset.key, scrollZu: e.uid} : {})});
  },
  "person-open": (el) => goTo("person", {personId: el.dataset.pid, mode: "time"}),
  "go-task": (el) => {
    const e = el.dataset.key ? unitFromKey(el.dataset.key) : null;   // with photo: select it there (e.g. from the search)
    goTo("task", {task: el.dataset.task, ...(e ? {focusKey: e.uid, photoKey: el.dataset.key, scrollZu: e.uid} : {})});
  },
  "go-inbox": () => { goTo("inbox"); loadNewInfo().then(draw); },
  "go-album": (el) => {
    const e = el.dataset.key ? unitFromKey(el.dataset.key) : null;
    goTo("album", {albumId: el.dataset.id, ...(e ? {focusKey: e.uid, photoKey: el.dataset.key, scrollZu: e.uid} : {})});
  },
  "go-event": (el) => goTo("event", {eventId: el.dataset.id}),
  "go-write": async () => { goTo("write"); await loadWrite(); draw(); },
  "back": () => { const p = peopleState().find((x) => !x.done); goTo(p ? "person" : "start", p ? {personId: p.p.id} : {}); },
  "list-open": () => { ui.listOpen = true; remember("listeOffen", true); draw(); },
  "list-close": () => { ui.listOpen = false; remember("listeOffen", false); draw(); },
  "list-filter": (el) => { ui.listFilter = el.dataset.f; draw(); },
  "series-show": (el) => {
    const e = unitList().byUid["s:" + el.dataset.sid];
    if (ui.view === "person") { ui.mode = "series"; ui.focusKey = e ? e.uid : null; ui.scrollZu = e ? e.uid : null; draw(); }
    else {   // from tasks, album or inbox: to the person of the series, otherwise to the series list
      const p = e ? personForPhotos(e.keys) : null;
      if (p) goTo("person", {personId: p.id, mode: "series", focusKey: e.uid, scrollZu: e.uid});
      else goTo("task", {task: "series", ...(e ? {focusKey: e.uid, scrollZu: e.uid} : {})});
    }
  },
  "pipeline": () => startJob("pipeline", [ui.thresholdPerson, ui.thresholdAll]),
  "gr-load": (el) => { delete S.grEv[el.dataset.pid]; (ui.grOpen = ui.grOpen || {})[el.dataset.pid] = true; return loadEvents(el.dataset.pid, true); },
  "gr-all": () => { ui.grAll = !ui.grAll; draw(); },
  "gr-discard": () => { ui.grUsed = !ui.grUsed; draw(); },
  "gr-marker": (el) => grAnchor(el.dataset.pid, el.dataset.ev, el.dataset.part),
  "vb-leer": () => {},
};
const ACTION_TEXT = {...aCheck, ...aGame, ...aGameEval, ...aPlaces, ...aSimilar, ...aEvent, ...aGramps, ...aSearch, ...aCommon, ...aSeries, ...aSort, ...aViews, ...aWrite, ...aSettings, ...aHelp, ...aNavigation};

window.__grimmichActions = ACTION_TEXT;   // for the search: jumps through the same actions as the buttons
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-a]");
  if (!el) return;
  const fn = ACTION_TEXT[el.dataset.a];
  if (!fn || el.dataset.a === "describe" || el.tagName === "SELECT") return;
  if (el.tagName === "A") ev.preventDefault();
  try { await fn(el, ev); } catch (e) { console.error(e); toast(tr("That did not work: ") + e.message); }
});
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.id === "language-pick") setLanguage(t.value);
  else if (t.id === "p2-select") { ui.p2 = t.value || null; draw(); }
  else if (t.dataset && t.dataset.a === "go-pick") assignmentChosen(t.dataset.pid, t.value);
  else if (t.dataset && t.dataset.a === "sv-album") ACTION_TEXT["sv-album"](t);
  else if (t.dataset && t.dataset.a === "describe") descriptionChanged(t);
});
document.addEventListener("toggle", (ev) => {
  const t = ev.target;
  if (t && t.classList && t.classList.contains("gramps")) (ui.grOpen = ui.grOpen || {})[t.dataset.gpid] = t.open;
}, true);
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.getAttribute && ev.target.getAttribute("role") === "link") ev.target.click();
  if (ev.key === "Escape" && !document.querySelector(".lightbox") && $("layer").innerHTML) { ui.settings = false; closeIt(); }
});

// ------------------------------------------------------------------ Start
(async function start() {
  translatePage();
  if (PLAY) { const me = await checkSignIn(); if (!me) return; S.signedIn = me; }   // from outside only after signing in
  try { await loading(); }
  catch (e) { $("middle").innerHTML = '<div class="box warn">' + tr("The data could not be loaded. Is Grimmich still running?") + '</div>'; return; }
  if (PLAY) { ui.view = "game"; draw(); return; }   // play mode: only the game
  const openOnes = peopleState().find((x) => !x.done);
  if (!Object.keys(S.photos).length) ui.view = "inbox";
  else if (startOnPhone()) ui.view = "game";   // small screen: the full interface is made for the desktop
  else if (openOnes) { ui.view = "person"; ui.personId = openOnes.p.id; }
  draw();
  if (S.job.running) setTimeout(checkJob, 1500);
  loadNewInfo().then(draw);
  if (Object.keys(S.assignMap).length) loadGrampsPeople(false).then(() => draw()).catch(() => {});
  if (!connectionOk().immich) openSettings();
})();
