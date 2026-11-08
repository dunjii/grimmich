// Left column: the work list (collapsible) with tasks, albums and people including progress.
import {S, ui} from "../state.js";
import {esc} from "../util.js";
import {eventList} from "./event.js";
import {unitList, warnings, taskCounts, personOf, shortName, peopleText} from "../model.js";
import {menuOf} from "./menu.js";
import {placeList} from "./placeview.js";
import {tr} from "../language.js";

export function peopleState() {
  const byKey = unitList().byKey;
  return (S.pf && S.pf.ok ? S.pf.people : []).filter((p) => p.photos.length).map((p) => {
    const list = [...new Set(p.photos.map((f) => byKey[f.key]).filter((e) => e && !e.kind))];
    const ok = list.filter((e) => e.confirmedFlag).length, draft = list.filter((e) => e.draftFlag).length;
    const short = p.name;
    const warn = list.filter((e) => warnings(e).some((w) => w.name === short)).length;
    return {p, n: list.length, ok, draft, warn, open: list.length - ok, done: list.length > 0 && ok === list.length};
  }).sort((a, b) => (b.warn > 0) - (a.warn > 0) || (a.done - b.done) || b.open - a.open || a.p.name.localeCompare(b.p.name, "de"));
}
export function albumsState() {
  const byKey = unitList().byKey;
  return S.albums.map((a) => {
    const unitsList = a.keys.map((k) => byKey[k]).filter(Boolean), withoutVal = unitsList.filter((e) => !e.year && !e.kind).length;
    const ok = unitsList.filter((e) => e.confirmedFlag || (e.year && !e.draftFlag)).length;
    return {a, n: a.keys.length, without: withoutVal, pct: a.keys.length ? Math.round(100 * (a.keys.length - withoutVal) / a.keys.length) : 0, ok};
  });
}
const bar = (pct, color) => `<div class="bar"><div style="width:${pct}%;background:${color}"></div></div>`;

export function listHtml() {
  if (!ui.listOpen) return "";
  const z = taskCounts(), f = ui.listFilter;
  const task = (n, name, text, a, extra) => (n ? `<button class="row ${ui.view === a.view && (!a.task || ui.task === a.task) ? "active" : ""}" data-a="${a.action}" ${a.task ? `data-task="${a.task}"` : ""}>
      <div class="top" title="${esc(text)}"><b>${esc(name)}</b><span>${extra || ""}${n}</span></div></button>` : "");
  const inboxVal = z.inAlbum || z.new ? task(z.inAlbum || z.new, tr("Inbox"), z.inAlbum ? tr("new scans in the album, not processed yet") : tr("Photos without series and without confirmed year"), {action: "go-inbox", view: "inbox"}) : "";
  const tasks = inboxVal
    + (f !== "open" ? task(z.warn, tr("Warnings"), tr("Dating does not match birth or death"), {action: "go-task", task: "warnings", view: "task"}, '<span class="tag warn">!</span> ') : "")
    + (f !== "warnings" ? task(z.without, tr("No estimate"), tr("not datable yet or not calculated"), {action: "go-task", task: "without", view: "task"})
      + task(z.cards, tr("Cards and documents"), z.cardsOpen ? tr("{n} without date", {n: z.cardsOpen}) : tr("all dated"), {action: "go-task", task: "cards", view: "task"})
      + task(z.changedFlag, tr("Changed in Immich"), tr("Names, assignment or image changed"), {action: "go-task", task: "changed", view: "task"}) : "")
    + (f === "all" ? task(S.game.votes.length, tr("Game evaluation"), tr("Who answered how much, what the answers changed"), {action: "go-gameeval", view: "gameeval"}) : "");
  const peopleList = peopleState().filter((x) => f === "all" || (f === "warnings" && x.warn) || (f === "open" && !x.done));
  const line = (x0) => { const x = {...x0, p: personOf(x0.p.id) || x0.p}; return `<button class="row ${ui.view === "person" && ui.personId === x.p.id ? "active" : ""}" data-a="go-person" data-pid="${esc(x.p.id)}">
      <div class="top"><b>${esc(shortName(x.p.name))}</b><span>${tr("{geburt}{n} {n:photo|photos}", {geburt: x.p.birth !== null ? (x.p.birthSource === "geschätzt" ? tr("c. *{geburt}", {geburt: Math.round(x.p.birth)}) : "*" + Math.floor(x.p.birth)) + " · " : "", n: x.p.photos.length})}</span></div>
      ${bar(x.n ? Math.round(100 * x.ok / x.n) : 0, x.warn ? "var(--warn)" : x.done ? "var(--ok)" : "var(--akzent)")}
      <div class="bottom">${x.done ? tr("done") : `${tr("{offen} open{Entwurf}", {offen: x.open, Entwurf: x.draft ? `${tr(", {entw} draft", {entw: x.draft})}` : ""})}`}${x.warn ? `<span class="tag warn">${tr("{n} {n:warning|warnings}", {n: x.warn})}</span>` : ""}${x.p.birth === null ? '<span class="tag">' + tr("no date of birth") + '</span>' : x.p.birthSource === "geschätzt" ? '<span class="tag">' + tr("Birth estimated") + '</span>' : ""}</div></button>`; };
  const openOnes = peopleList.filter((x) => !x.done), finished = peopleList.filter((x) => x.done);
  const albumList = albumsState().map((x) => `<button class="row ${ui.view === "album" && ui.albumId === x.a.id ? "active" : ""}" data-a="go-album" data-id="${esc(x.a.id)}">
      <div class="top"><b>${esc(x.a.name)}</b><span>${tr("{n} {n:photo|photos}", {n: x.n})}</span></div>${bar(x.pct, "var(--akzent)")}
      <div class="bottom">${x.without ? `${tr("{ohne} without date", {ohne: x.without})}` : tr("all dated")}</div></button>`).join("");
  const m = menuOf(), none = `<div class="quiet" style="padding:6px 10px">${tr("Nothing to do.")}</div>`;
  const albumsAll = albumsState(), albumRow = (x) => `<button class="row ${ui.view === "album" && ui.albumId === x.a.id ? "active" : ""}" data-a="go-album" data-id="${esc(x.a.id)}">
      <div class="top"><b>${esc(x.a.name)}</b><span>${tr("{n} {n:photo|photos}", {n: x.n})}</span></div>${bar(x.pct, "var(--akzent)")}
      <div class="bottom">${x.without ? `${tr("{ohne} without date", {ohne: x.without})}` : tr("all dated")}</div></button>`;
  const albumsOpen = albumsAll.filter((x) => x.without), albumsDone = albumsAll.filter((x) => !x.without);
  const seriesAll = unitList().list.filter((e) => e.type === "series"), seriesRow = (e) => `<button class="row" data-a="series-show" data-sid="${esc(e.s.id)}">
      <div class="top"><b>${tr("Series {id}", {id: e.s.id})}</b><span>${tr("{n} {n:photo|photos}", {n: e.keys.length})}</span></div><div class="bottom">${esc(peopleText(e.keys[0]) || "")}</div></button>`;
  const seriesOpen = seriesAll.filter((e) => e.s.status === "open"), seriesDone = seriesAll.filter((e) => e.s.status !== "open");
  const grp = (text, list, row) => (list.length ? `<div class="group">${text}</div>${list.map(row).join("")}` : "");
  const chips = m === "tasks" || m === "people" ? `<div class="chips">${[["all", tr("All")], ["warnings", tr("Warnings {n}", {n: z.warn})], ["open", tr("Open {n}", {n: z.open})]].map(([id, t]) => `<button class="chip ${f === id ? "on" : ""}" data-a="list-filter" data-f="${id}">${t}</button>`).join("")}</div>` : "";
  const body = {
    tasks: tasks || none,
    people: grp(tr("People ({n} open)", {n: openOnes.length}), openOnes, line) + (openOnes.length ? "" : none) + grp(tr("Done ({n})", {n: finished.length}), finished, line),
    albums: (albumsAll.length ? "" : none) + grp(tr("Photo albums"), albumsOpen, albumRow) + grp(tr("Done ({n})", {n: albumsDone.length}), albumsDone, albumRow),
    series: (z.series ? task(z.series, tr("Series to review"), tr("Do the photos belong together?"), {action: "go-task", task: "series", view: "task"}) : "") + (seriesAll.length ? "" : none)
      + grp(tr("Series"), seriesOpen, seriesRow) + grp(tr("Done ({n})", {n: seriesDone.length}), seriesDone, seriesRow),
    events: eventList() || none,
    places: placeList(),
  }[m];
  return `<div class="list-head"><h2>${{tasks: tr("Tasks"), people: tr("People"), albums: tr("Albums"), series: tr("All series"), events: tr("Events"), places: tr("Places")}[m]}</h2></div>${chips}${body}
    ${m === "albums" ? `<div class="foot quiet">${tr("A photo only gets a source if it is in a photo album, not just in the working album.")}</div>` : ""}`;
}
