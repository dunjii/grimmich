// Game "Who is older?": two photos of the same person, you pick the older one.
// The decisions stay in Grimmich (game_votes.json); nothing is written to Immich or Gramps.
import {S, ui, draw, saveGame} from "../state.js";
import {esc, image, recall, remember} from "../util.js";
import {tr} from "../language.js";

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

// Face with more surroundings, scaled by CSS so it fills the space it gets (sharper than a close-up).
function faceStyle(key, b) {
  const W = b[4], H = b[5], bw = Math.max(1, b[2] - b[0]), bh = Math.max(1, b[3] - b[1]);
  const side = Math.min(Math.max(Math.max(bw, bh) * 2.6, 20), W, H);
  const x0 = Math.max(0, Math.min((b[0] + b[2]) / 2 - side / 2, W - side)), y0 = Math.max(0, Math.min((b[1] + b[3]) / 2 - side / 2, H - side));
  const px = W > side ? (x0 / (W - side)) * 100 : 0, py = H > side ? (y0 / (H - side)) * 100 : 0;
  return `background-image:url(${image(key)});background-size:${((W / side) * 100).toFixed(2)}% auto;background-position:${px.toFixed(2)}% ${py.toFixed(2)}%;`;
}
const face = (pair, side) => {
  const f = pair[side];
  return `<div class="game-cell"><button class="game-photo" data-a="game-pick" data-w="${side}" title="${tr("This one is older")}"
    style="${f.box ? faceStyle(f.key, f.box) : `background-image:url(${image(f.key)});background-size:cover;`}"></button></div>`;
};

// The game takes the whole browser window (see .game-full in style.css).
export function gameHtml() {
  if (ui.game === undefined || ui.game === null) ui.game = pickPair();
  const pair = ui.game, n = S.game.votes.length;
  const note = narrow() && !recall("fullView", false) ? `<span class="quiet game-hint">${tr("The full interface is made for large screens.")}</span>` : "";
  const body = pair
    ? `<div class="game-q">${tr("Which photo shows {name} older?", {name: esc(pair.name)})}</div>
       <div class="game-pair">${face(pair, "a")}${face(pair, "b")}</div>
       <div class="game-buttons"><button data-a="game-pick" data-w="same">${tr("Same age / cannot tell")}</button><button data-a="game-skip">${tr("Skip")}</button>
         <button data-a="game-undo" ${n ? "" : "disabled"}>${tr("Undo last decision")}</button></div>`
    : `<div class="empty game-empty">${people().length ? tr("All pairs decided. Nice!") : tr("Not enough photos of named people yet. Please click “Refresh” first.")}</div>`;
  return `<div class="game-full"><div class="game-bar"><b>${tr("Who is older?")}</b><span class="quiet">${tr("{n} {n:decision|decisions} so far", {n})}</span>${note}<span class="space"></span>
      <button data-a="game-leave">${tr("Back to Grimmich")}</button></div>${body}
    <div class="quiet game-foot">${tr("Nothing is written to Immich or Gramps. Your decisions stay in Grimmich.")}</div></div>`;
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
