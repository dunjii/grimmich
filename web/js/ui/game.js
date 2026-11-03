// Game "Who is older?": two photos of the same person, you pick the older one.
// The decisions stay in Grimmich (game_votes.json); nothing is written to Immich or Gramps.
import {S, ui, draw, saveGame} from "../state.js";
import {esc, image, recall, remember} from "../util.js";
import {tr} from "../language.js";

const narrow = () => window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
const pairId = (a, b) => [a, b].sort().join("|");
const ageOf = (key, name) => { const x = (S.age[key] || []).find((z) => z.name === name); return x && typeof x.alter === "number" ? x.alter : null; };

function people() { return (S.pf && S.pf.ok ? S.pf.people : []).filter((p) => p.photos.length >= 2); }

// The latest answer per pair. "unknown" pairs are not decided: they come back in later rounds.
function lastAnswers() {
  const m = new Map();
  S.game.votes.forEach((v) => m.set(pairId(v.a, v.b), v.older));
  return m;
}

// A new pair: same person, not decided yet; photos with similar estimated age are preferred (those are the interesting ones).
// Now and then (and when nothing new is left) a pair answered with "don't know" comes again.
function pickPair() {
  const ps = people();
  if (!ps.length) return null;
  const last = lastAnswers();
  const all = ps.flatMap((p) => p.photos.map((f) => ({p, f})));
  const again = (wish) => {
    for (let i = 0; i < 300; i++) {
      const {p, f} = all[Math.floor(Math.random() * all.length)];
      const g = p.photos[Math.floor(Math.random() * p.photos.length)];
      if (g.key === f.key) continue;
      const done = last.get(pairId(f.key, g.key));
      if (wish === "unknown" ? done !== "unknown" : done !== undefined) continue;
      const x = ageOf(f.key, p.name), y = ageOf(g.key, p.name);
      if (wish !== "unknown" && i < 200 && x !== null && y !== null && Math.abs(x - y) > 8) continue;
      return {pid: p.id, name: p.name, a: f, b: g};
    }
    return null;
  };
  return (Math.random() < 0.15 ? again("unknown") : null) || again("new") || again("unknown");
}

// Face with more surroundings, scaled by CSS so it fills the space it gets (sharper than a close-up).
function faceStyle(key, b) {
  const W = b[4], H = b[5], bw = Math.max(1, b[2] - b[0]), bh = Math.max(1, b[3] - b[1]);
  const side = Math.min(Math.max(Math.max(bw, bh) * 2.6, 20), W, H);
  const x0 = Math.max(0, Math.min((b[0] + b[2]) / 2 - side / 2, W - side)), y0 = Math.max(0, Math.min((b[1] + b[3]) / 2 - side / 2, H - side));
  const px = W > side ? (x0 / (W - side)) * 100 : 0, py = H > side ? (y0 / (H - side)) * 100 : 0;
  return `background-image:url(${image(key)});background-size:${((W / side) * 100).toFixed(2)}% auto;background-position:${px.toFixed(2)}% ${py.toFixed(2)}%;`;
}
const ICON = {
  older: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  same: '<path d="M5 9h14M5 15h14"/>',
  unknown: '<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 17.5v.5"/><circle cx="12" cy="12" r="10"/>',
  different: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20c0-3 2-5 5-5M21 20c0-3-2-5-5-5M4 4l16 16"/>',
  undo: '<path d="M9 7H4v5M4 7c4-4 12-3 15 3 1 3 0 6-2 8"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 16l-5-4-9 7"/>',
};
const icon = (n) => `<svg class="game-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const btn = (action, w, name, text, extra = "") => `<button class="game-btn" data-a="${action}" ${w ? `data-w="${w}"` : ""} ${extra} title="${text}">${icon(name)}<span>${text}</span></button>`;

const face = (pair, side) => {
  const f = pair[side];
  return `<div class="game-cell"><div class="game-box">
    <button class="game-photo" data-a="game-pick" data-w="${side}" title="${tr("This one is older")}"
      style="${f.box ? faceStyle(f.key, f.box) : `background-image:url(${image(f.key)});background-size:cover;`}"></button>
    <span class="game-badge">${icon("older")}${tr("Older")}</span>
    <button class="game-thumb" data-a="game-view" data-key="${esc(f.key)}" title="${tr("Show whole photo")}"><img src="${image(f.key)}" alt="${tr("Show whole photo")}"></button>
  </div></div>`;
};

// The game takes the whole browser window (see .game-full in style.css).
export function gameHtml() {
  if (ui.game === undefined || ui.game === null) ui.game = pickPair();
  const pair = ui.game, n = S.game.votes.length;
  const note = narrow() && !recall("fullView", false) ? `<span class="quiet game-hint">${tr("The full interface is made for large screens.")}</span>` : "";
  const body = pair
    ? `<div class="game-q">${tr("Which photo shows {name} older?", {name: esc(pair.name)})}</div>
       <div class="game-pair">${face(pair, "a")}${face(pair, "b")}</div>
       <div class="game-buttons">${btn("game-pick", "same", "same", tr("Same age"))}${btn("game-pick", "unknown", "unknown", tr("Don't know"))}
         ${btn("game-pick", "different", "different", tr("Not the same person"))}
         ${btn("game-undo", "", "undo", tr("Undo last decision"), n ? "" : "disabled")}</div>`
    : `<div class="empty game-empty">${people().length ? tr("All pairs decided. Nice!") : tr("Not enough photos of named people yet. Please click “Refresh” first.")}</div>`;
  return `<div class="game-full"><div class="game-bar"><b>${tr("Who is older?")}</b><span class="quiet">${tr("{n} {n:decision|decisions} so far", {n})}</span>${note}<span class="space"></span>
      <button data-a="game-leave">${tr("Back to Grimmich")}</button></div>${body}
    <div class="quiet game-foot">${tr("Nothing is written to Immich or Gramps. Your decisions stay in Grimmich.")}</div></div>`;
}

// Whole photo in a viewer: pinch / mouse wheel to zoom, drag to move, double tap resets.
function viewer(key) {
  const el = document.createElement("div"); el.className = "game-viewer";
  el.innerHTML = `<img src="${image(key)}" alt="" draggable="false"><button class="game-viewer-back">${tr("Back to decision")}</button>`;
  const img = el.querySelector("img");
  let sc = 1, tx = 0, ty = 0;
  const pts = new Map();
  let start = null;
  const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`; };
  const zoomAt = (f, cx, cy) => {   // keeps the point under the fingers where it is
    const n = Math.max(1, Math.min(8, sc * f)), k = n / sc;
    const r = el.getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2;
    tx = ox - (ox - tx) * k; ty = oy - (oy - ty) * k; sc = n;
    if (sc === 1) { tx = 0; ty = 0; }
    apply();
  };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = [...pts.values()]; return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; };
  el.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; el.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x: e.clientX, y: e.clientY}); start = pts.size === 2 ? dist() : null; });
  el.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2 && start) { const d = dist(); zoomAt(d / start, mid().x, mid().y); start = d; }
    else if (pts.size === 1 && sc > 1) { tx += dx; ty += dy; apply(); }
  });
  const up = (e) => { pts.delete(e.pointerId); start = pts.size === 2 ? dist() : null; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, {passive: false});
  el.addEventListener("dblclick", (e) => { if (sc > 1) { sc = 1; tx = 0; ty = 0; apply(); } else zoomAt(3, e.clientX, e.clientY); });
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.querySelector("button").addEventListener("click", close);
  document.body.appendChild(el);
}

export const actions = {
  "game-view": (el) => viewer(el.dataset.key),
  "game-open": () => { ui.view = "game"; ui.game = null; window.scrollTo(0, 0); draw(); },
  "game-leave": () => { remember("fullView", true); ui.view = "start"; ui.game = null; draw(); },
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
  if (ui.view !== "game" || !ui.game || document.querySelector(".game-viewer") || ev.target.closest("input, textarea, select")) return;
  const w = {ArrowLeft: "a", ArrowRight: "b"}[ev.key];
  if (w) actions["game-pick"]({dataset: {w}});
});
export const startOnPhone = () => narrow() && !recall("fullView", false) && people().length > 0;
