// Game "Who is older?": two photos of the same person, you pick the older one.
// The decisions stay in Grimmich (game_votes.json); nothing is written to Immich or Gramps.
import {S, ui, draw, saveGame} from "../state.js";
import {esc, cropStyle, image, recall, remember} from "../util.js";
import {tr} from "../language.js";

const FACE = 220;   // the 150 px version on small screens is only scaled by CSS
const narrow = () => window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
const pairId = (a, b) => [a, b].sort().join("|");
const ageOf = (key, name) => { const x = (S.age[key] || []).find((z) => z.name === name); return x && typeof x.alter === "number" ? x.alter : null; };

function people() { return (S.pf && S.pf.ok ? S.pf.people : []).filter((p) => p.photos.length >= 2); }

// A new pair: same person, not decided yet; photos with similar estimated age are preferred (those are the interesting ones).
function pickPair() {
  const ps = people();
  if (!ps.length) return null;
  const done = new Set(S.game.votes.map((v) => pairId(v.a, v.b)));
  const all = ps.flatMap((p) => p.photos.map((f) => ({p, f})));
  for (let i = 0; i < 300; i++) {
    const {p, f} = all[Math.floor(Math.random() * all.length)];
    const g = p.photos[Math.floor(Math.random() * p.photos.length)];
    if (g.key === f.key || done.has(pairId(f.key, g.key))) continue;
    const x = ageOf(f.key, p.name), y = ageOf(g.key, p.name);
    if (i < 200 && x !== null && y !== null && Math.abs(x - y) > 8) continue;
    return {pid: p.id, name: p.name, a: f, b: g};
  }
  return null;
}

const face = (pair, side) => {
  const f = pair[side];
  return `<button class="game-photo" data-a="game-pick" data-w="${side}" title="${tr("This one is older")}">
    <span class="game-face" style="${f.box ? cropStyle(f.key, f.box, FACE) : `background-image:url(${image(f.key)});background-size:cover;`}"></span></button>`;
};

export function gameHtml() {
  if (ui.game === undefined || ui.game === null) ui.game = pickPair();
  const pair = ui.game, n = S.game.votes.length;
  const notice = narrow() && !recall("fullView", false)
    ? `<div class="box info game-note">${tr("The full Grimmich interface is made for large screens. Here is a small game instead: it helps to sort the photos by age.")}
        <div><button data-a="game-leave">${tr("Open the full interface anyway")}</button></div></div>` : "";
  const body = pair
    ? `<h2 class="game-q">${tr("Which photo shows {name} older?", {name: esc(pair.name)})}</h2>
       <div class="game-pair">${face(pair, "a")}${face(pair, "b")}</div>
       <div class="game-buttons"><button data-a="game-pick" data-w="same">${tr("Same age / cannot tell")}</button><button data-a="game-skip">${tr("Skip")}</button>
         <button data-a="game-undo" ${n ? "" : "disabled"}>${tr("Undo last decision")}</button></div>`
    : `<div class="empty">${people().length ? tr("All pairs decided. Nice!") : tr("Not enough photos of named people yet. Please click “Refresh” first.")}</div>`;
  return `<div class="page-head"><h2>${tr("Who is older?")}</h2><span class="quiet">${tr("{n} {n:decision|decisions} so far", {n})}</span><span class="space"></span>
      <button data-a="game-leave">${tr("Back to Grimmich")}</button></div>
    <div class="write-page game">${notice}${body}<div class="quiet game-foot">${tr("Nothing is written to Immich or Gramps. Your decisions stay in Grimmich.")}</div></div>`;
}

export const actions = {
  "game-open": () => { ui.view = "game"; ui.game = null; window.scrollTo(0, 0); draw(); },
  "game-leave": () => { remember("fullView", true); ui.view = "start"; ui.game = null; draw(); },
  "game-skip": () => { ui.game = null; draw(); },
  "game-pick": async (el) => {
    const pair = ui.game;
    if (!pair) return;
    const w = el.dataset.w;
    S.game.votes.push({a: pair.a.key, b: pair.b.key, pid: pair.pid, older: w, t: new Date().toISOString().slice(0, 19)});
    ui.game = null; draw();
    await saveGame();
  },
  "game-undo": async () => {
    const v = S.game.votes.pop();
    if (!v) return;
    const p = people().find((x) => x.id === v.pid);
    const a = p && p.photos.find((f) => f.key === v.a), b = p && p.photos.find((f) => f.key === v.b);
    ui.game = a && b ? {pid: p.id, name: p.name, a, b} : null;
    draw(); await saveGame();
  },
};

document.addEventListener("keydown", (ev) => {
  if (ui.view !== "game" || !ui.game || ev.target.closest("input, textarea, select")) return;
  const w = {ArrowLeft: "a", ArrowRight: "b"}[ev.key];
  if (w) actions["game-pick"]({dataset: {w}});
});
export const startOnPhone = () => narrow() && !recall("fullView", false) && people().length > 0;
