// Game: short questions about the photos, mixed at random. Question types:
//   older (two photos of one person), who (a face without a name), year (when was it taken), place (where was it taken).
// The answers stay in Grimmich (game_votes); nothing is written to Immich or Gramps.
import {S, ui, draw, saveGame} from "../state.js";
import {esc, image, recall, remember} from "../util.js";
import {loadGrampsPlaces} from "../gramps.js";
import {tr} from "../language.js";

const narrow = () => window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
const pairId = (a, b) => [a, b].sort().join("|");
const ageOf = (key, name) => { const x = (S.age[key] || []).find((z) => z.name === name); return x && typeof x.alter === "number" ? x.alter : null; };
const rnd = (list) => list[Math.floor(Math.random() * list.length)];
const SOFT = 250;      // a face cut-out with fewer pixels than this in the stored photo is fetched sharper from Immich
const STORED = 1000;   // the stored photos have at most this many pixels on the long side

function people() { return (S.pf && S.pf.ok ? S.pf.people : []).filter((p) => p.photos.length >= 2); }
const unnamed = () => (S.pf && S.pf.ok ? S.pf.unnamed || [] : []);

// ---- what has been answered: the latest answer per question; "unknown" comes back now and then
const qid = (v) => (v.type && v.type !== "older" ? `${v.type}|${v.key}` : `older|${pairId(v.a, v.b)}`);
const answerOf = (v) => (v.type === "who" ? (v.name ? "x" : "unknown") : v.type === "year" ? (v.year ? "x" : "unknown") : v.type === "place" ? (v.place ? "x" : "unknown") : v.older);
function lastAnswers() {
  const m = new Map();
  S.game.votes.forEach((v) => m.set(qid(v), answerOf(v)));
  return m;
}

// ---- candidates for each question type; wish: "new" (not answered) or "unknown" (answered with “don't know”)
const wanted = (last, id, wish) => (wish === "unknown" ? last.get(id) === "unknown" : !last.has(id));

function pickOlder(last, wish) {
  const ps = people();
  if (!ps.length) return null;
  const all = ps.flatMap((p) => p.photos.map((f) => ({p, f})));
  for (let i = 0; i < 300; i++) {
    const {p, f} = rnd(all), g = rnd(p.photos);
    if (g.key === f.key || !wanted(last, `older|${pairId(f.key, g.key)}`, wish)) continue;
    const x = ageOf(f.key, p.name), y = ageOf(g.key, p.name);
    if (wish === "new" && i < 200 && x !== null && y !== null && Math.abs(x - y) > 8) continue;   // similar estimates are the interesting ones
    return {type: "older", pid: p.id, name: p.name, a: f, b: g};
  }
  return null;
}
function pickWho(last, wish) {
  const u = unnamed();
  for (let i = 0; u.length && i < 200; i++) {
    const f = rnd(u);
    if (wanted(last, `who|${f.key}`, wish)) return {type: "who", f};
  }
  return null;
}
// Photos whose estimate is uncertain: a wide span or a hint; confirmed ones are left out.
function uncertain() {
  const rows = (S.res && S.res.rows) || [];
  return rows.filter((r) => S.photos[r.key] && !(S.corr[r.key] && S.corr[r.key].source === "confirmed") && ((r.to !== null && r.from !== null && r.to - r.from >= 15) || r.hint)).map((r) => r.key);
}
function pickYear(last, wish) {
  const u = uncertain();
  for (let i = 0; u.length && i < 200; i++) {
    const key = rnd(u);
    if (wanted(last, `year|${key}`, wish)) return {type: "year", key};
  }
  return null;
}
function pickPlace(last, wish) {
  if (!S.grPlaces || !S.grPlaces.list || !S.grPlaces.list.length) return null;
  const u = Object.keys(S.photos).filter((k) => !S.places[k]);
  for (let i = 0; u.length && i < 200; i++) {
    const key = rnd(u);
    if (wanted(last, `place|${key}`, wish)) return {type: "place", key};
  }
  return null;
}
const PICKERS = [pickOlder, pickWho, pickYear, pickPlace];

// A new question of a random type that has material; every now and then (and at the end) one answered with “don't know” again.
function pickQuestion() {
  const last = lastAnswers();
  const tryAll = (wish) => { for (const f of PICKERS.slice().sort(() => Math.random() - 0.5)) { const q = f(last, wish); if (q) return q; } return null; };
  return (Math.random() < 0.15 ? tryAll("unknown") : null) || tryAll("new") || tryAll("unknown");
}

// ---- pictures. A face with surroundings, filled by CSS; small faces are fetched sharper from Immich (/crops/...),
//      the stored photo stays underneath until that picture is there (or when Immich cannot deliver it).
function faceStyle(key, b) {
  const W = b[4], H = b[5], bw = Math.max(1, b[2] - b[0]), bh = Math.max(1, b[3] - b[1]);
  const side = Math.min(Math.max(Math.max(bw, bh) * 2.6, 20), W, H);
  const x0 = Math.max(0, Math.min((b[0] + b[2]) / 2 - side / 2, W - side)), y0 = Math.max(0, Math.min((b[1] + b[3]) / 2 - side / 2, H - side));
  const px = W > side ? (x0 / (W - side)) * 100 : 0, py = H > side ? (y0 / (H - side)) * 100 : 0;
  const stored = `background-image:url(${image(key)});background-size:${((W / side) * 100).toFixed(2)}% auto;background-position:${px.toFixed(2)}% ${py.toFixed(2)}%;`;
  if (side * Math.min(1, STORED / Math.max(W, H)) >= SOFT) return stored;
  const sharp = `/crops/${encodeURIComponent(key)}_${W}_${H}_${Math.round(x0)}_${Math.round(y0)}_${Math.round(side)}.jpg`;
  return `background-image:url(${sharp}),url(${image(key)});background-size:cover,${((W / side) * 100).toFixed(2)}% auto;background-position:center,${px.toFixed(2)}% ${py.toFixed(2)}%;`;
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

const thumb = (key) => `<button class="game-thumb" data-a="game-view" data-key="${esc(key)}" title="${tr("Show whole photo")}"><img src="${image(key)}" alt="${tr("Show whole photo")}"></button>`;
const faceBg = (f) => (f.box ? faceStyle(f.key, f.box) : `background-image:url(${image(f.key)});background-size:cover;`);
const face = (pair, side) => {
  const f = pair[side];
  return `<div class="game-cell"><div class="game-box">
    <button class="game-photo" data-a="game-pick" data-w="${side}" title="${tr("This one is older")}" style="${faceBg(f)}"></button>
    <span class="game-badge">${icon("older")}${tr("Older")}</span>${thumb(f.key)}
  </div></div>`;
};
const wholePhoto = (key) => `<div class="game-cell"><button class="game-whole" data-a="game-view" data-key="${esc(key)}" title="${tr("Show whole photo")}"><img src="${image(key)}" alt=""></button></div>`;
const answerBar = (kind, listId, items, placeholder, input) => `<div class="game-answer">
  <input class="game-input" id="game-input" ${input} list="${listId}" placeholder="${esc(placeholder)}" autocomplete="off">
  <datalist id="${listId}">${items}</datalist>
  <button class="game-btn primary" data-a="game-save">${tr("Save")}</button></div>`;

function questionHtml(q) {
  const n = S.game.votes.length;
  const undo = btn("game-undo", "", "undo", tr("Undo last decision"), n ? "" : "disabled");
  const unknown = btn("game-pick", "unknown", "unknown", tr("Don't know"));
  if (q.type === "who") {
    return `<div class="game-q">${tr("Who is this?")}</div>
      <div class="game-pair"><div class="game-cell"><div class="game-box"><span class="game-photo static" style="${faceBg(q.f)}"></span>${thumb(q.f.key)}</div></div></div>
      ${answerBar("who", "game-names", (S.allNames || []).map((x) => `<option value="${esc(x)}">`).join(""), tr("Name"), "")}
      <div class="game-buttons">${unknown}${undo}</div>`;
  }
  if (q.type === "year") {
    return `<div class="game-q">${tr("In which year was this photo taken?")}</div>
      <div class="game-pair">${wholePhoto(q.key)}</div>
      ${answerBar("year", "game-years", "", tr("Year, e.g. 1952"), 'type="number" inputmode="numeric" min="1800" max="2100"')}
      <div class="game-buttons">${unknown}${undo}</div>`;
  }
  if (q.type === "place") {
    return `<div class="game-q">${tr("Where was this photo taken?")}</div>
      <div class="game-pair">${wholePhoto(q.key)}</div>
      ${answerBar("place", "game-places", S.grPlaces.list.map((o) => `<option value="${esc(o.name)}">`).join(""), tr("Place"), "")}
      <div class="game-buttons">${unknown}${undo}</div>`;
  }
  return `<div class="game-q">${tr("Which photo shows {name} older?", {name: esc(q.name)})}</div>
    <div class="game-pair">${face(q, "a")}${face(q, "b")}</div>
    <div class="game-buttons">${btn("game-pick", "same", "same", tr("Same age"))}${unknown}
      ${btn("game-pick", "different", "different", tr("Not the same person"))}${undo}</div>`;
}

// The game takes the whole browser window (see .game-full in style.css).
export function gameHtml() {
  if (!S.grPlaces) loadGrampsPlaces(false);
  if (ui.game === undefined || ui.game === null) ui.game = pickQuestion();
  const q = ui.game, n = S.game.votes.length;
  const note = narrow() && !recall("fullView", false) ? `<span class="quiet game-hint">${tr("The full interface is made for large screens.")}</span>` : "";
  const body = q ? questionHtml(q)
    : `<div class="empty game-empty">${people().length || unnamed().length ? tr("All questions answered. Nice!") : tr("Not enough photos of named people yet. Please click “Refresh” first.")}</div>`;
  return `<div class="game-full"><div class="game-bar"><b>${tr("Game")}</b><span class="quiet">${tr("{n} {n:answer|answers} so far", {n})}</span>${note}<span class="space"></span>
      <button data-a="game-leave">${tr("Back to Grimmich")}</button></div>${body}
    <div class="quiet game-foot">${tr("Nothing is written to Immich or Gramps. Your answers stay in Grimmich.")}</div></div>`;
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

const stamp = () => new Date().toISOString().slice(0, 19);
const focusInput = () => setTimeout(() => { const i = document.getElementById("game-input"); if (i) i.focus(); }, 50);
async function answer(v) {
  S.game.votes.push({...v, t: stamp()});
  ui.game = null; draw(); focusInput();
  await saveGame();
}

export const actions = {
  "game-view": (el) => viewer(el.dataset.key),
  "game-open": () => { ui.view = "game"; ui.game = null; window.scrollTo(0, 0); loadGrampsPlaces(false); draw(); focusInput(); },
  "game-leave": () => { remember("fullView", true); ui.view = "start"; ui.game = null; draw(); },
  "game-pick": async (el) => {   // older / same / different / unknown
    const q = ui.game;
    if (!q) return;
    const w = el.dataset.w;
    if (q.type === "who") return answer({type: "who", key: q.f.key, box: q.f.box, name: ""});
    if (q.type === "year") return answer({type: "year", key: q.key, year: null});
    if (q.type === "place") return answer({type: "place", key: q.key, place: "", h: null});
    return answer({a: q.a.key, b: q.b.key, pid: q.pid, older: w});
  },
  "game-save": async () => {
    const q = ui.game, text = (document.getElementById("game-input") || {}).value;
    if (!q || !String(text || "").trim()) return;
    const t = String(text).trim();
    if (q.type === "who") return answer({type: "who", key: q.f.key, box: q.f.box, name: t});
    if (q.type === "year") {
      const y = parseInt(t, 10);
      if (!(y >= 1800 && y <= 2100)) { document.getElementById("game-input").select(); return; }
      return answer({type: "year", key: q.key, year: y});
    }
    if (q.type === "place") {
      const o = S.grPlaces.list.find((x) => x.name === t);
      return answer({type: "place", key: q.key, place: t, h: o ? o.h : null});
    }
  },
  "game-undo": async () => {
    const v = S.game.votes.pop();
    if (!v) return;
    if (v.type === "who") ui.game = {type: "who", f: {key: v.key, box: v.box}};
    else if (v.type === "year" || v.type === "place") ui.game = {type: v.type, key: v.key};
    else {
      const p = people().find((x) => x.id === v.pid);
      const a = p && p.photos.find((f) => f.key === v.a), b = p && p.photos.find((f) => f.key === v.b);
      ui.game = a && b ? {type: "older", pid: p.id, name: p.name, a, b} : null;
    }
    draw(); focusInput(); await saveGame();
  },
};

document.addEventListener("keydown", (ev) => {
  if (ui.view !== "game" || !ui.game || document.querySelector(".game-viewer")) return;
  if (ev.key === "Enter" && ev.target.id === "game-input") { ev.preventDefault(); actions["game-save"](); return; }
  if (ev.target.closest("input, textarea, select") || ui.game.type !== "older") return;
  const w = {ArrowLeft: "a", ArrowRight: "b"}[ev.key];
  if (w) actions["game-pick"]({dataset: {w}});
});
export const startOnPhone = () => narrow() && !recall("fullView", false) && (people().length > 0 || unnamed().length > 0);
