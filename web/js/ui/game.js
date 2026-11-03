// Game: short questions about the photos, mixed at random. Question types:
//   older (two photos of one person), who (a face without a name), place (where was it taken),
//   anchor (before or after a photo with a known year), sort (3–5 photos of one person from young to old), decade.
//   Old “year” answers are still kept and shown, the question itself is no longer asked.
// The answers stay in Grimmich (game_votes); nothing is written to Immich or Gramps.
import {S, ui, draw, saveGame, mark} from "../state.js";
import {esc, image, recall, remember} from "../util.js";
import {loadGrampsPlaces, loadEvents} from "../gramps.js";
import {unitFromKey, placeFrom, immichDate} from "../model.js";
import {suggestions, norm} from "./places.js";
import {peopleOn} from "./event.js";
import {tr} from "../language.js";

const narrow = () => window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
const pairId = (a, b) => [a, b].sort().join("|");
const ageOf = (key, name) => { const x = (S.age[key] || []).find((z) => z.name === name); return x && typeof x.age === "number" ? x.age : null; };
const rnd = (list) => list[Math.floor(Math.random() * list.length)];
const SOFT = 250;      // a face cut-out with fewer pixels than this in the stored photo is fetched sharper from Immich
const STORED = 1000;   // the stored photos have at most this many pixels on the long side

function people() { return (S.pf && S.pf.ok ? S.pf.people : []).filter((p) => p.photos.length >= 2); }
const unnamed = () => (S.pf && S.pf.ok ? S.pf.unnamed || [] : []);

// ---- what has been answered: the latest answer per question; "unknown" comes back now and then
const qid = (v) => (v.type === "anchor" ? `anchor|${v.key}|${v.anchor}` : v.type === "sort" ? `sort|${[...v.keys].sort().join("|")}` : v.type && v.type !== "older" ? `${v.type}|${v.key}` : `older|${pairId(v.a, v.b)}`);
const answerOf = (v) => (v.type === "who" ? (v.name ? "x" : "unknown") : v.type === "year" ? (v.year ? "x" : "unknown") : v.type === "place" ? (v.place ? "x" : "unknown") : v.type === "anchor" ? v.rel : v.type === "sort" ? (v.keys.length && !v.unknown ? "x" : "unknown") : v.type === "decade" ? (v.from ? "x" : "unknown") : v.older);
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
// Photos with a year that is certain: confirmed by you or dated in Immich (anchors)
function anchors() {
  const out = [];
  Object.keys(S.photos).forEach((k) => {
    const c = S.corr[k], h = immichDate(k);
    const y = c && c.source !== "ignoriert" && c.source !== "draft" && c.year ? c.year : !c && h ? +h.date.slice(0, 4) : null;
    if (y) out.push({key: k, year: y});
  });
  return out;
}
function pickAnchor(last, wish) {
  const u = uncertain(), a = anchors();
  if (!u.length || !a.length) return null;
  const rows = new Map(((S.res && S.res.rows) || []).map((r) => [r.key, r]));
  for (let i = 0; i < 300; i++) {
    const key = rnd(u), r = rows.get(key);
    const near = a.filter((x) => r && r.from !== null && x.year >= r.from && x.year <= r.to && x.key !== key);   // an anchor inside the span tells the most
    const c = rnd(near.length ? near : a);
    if (c.key !== key && wanted(last, `anchor|${key}|${c.key}`, wish)) return {type: "anchor", key, anchor: c.key, ay: c.year};
  }
  return null;
}
function pickSort(last, wish) {
  const ps = people().filter((p) => p.photos.length >= 3);
  for (let i = 0; ps.length && i < 200; i++) {
    const p = rnd(ps), n = Math.min(p.photos.length, 3 + Math.floor(Math.random() * 3));
    const items = p.photos.slice().sort(() => Math.random() - 0.5).slice(0, n);
    if (wanted(last, `sort|${items.map((f) => f.key).sort().join("|")}`, wish)) return {type: "sort", pid: p.id, name: p.name, items, order: []};
  }
  return null;
}
function pickDecade(last, wish) {
  const rows = ((S.res && S.res.rows) || []).filter((r) => S.photos[r.key] && r.year && !(S.corr[r.key] && S.corr[r.key].source === "confirmed") && !immichDate(r.key));
  const wide = rows.filter((r) => r.to - r.from >= 8);
  const u = (wide.length ? wide : rows).map((r) => r.key);
  for (let i = 0; u.length && i < 200; i++) {
    const key = rnd(u);
    if (wanted(last, `decade|${key}`, wish)) return {type: "decade", key};
  }
  return null;
}
function pickPlace(last, wish) {
  if (!S.grPlaces || !S.grPlaces.list || !S.grPlaces.list.length) return null;
  const u = Object.keys(S.photos).filter((k) => !S.places[k]);
  for (let i = 0; u.length && i < 200; i++) {
    const key = rnd(u);
    if (wanted(last, `place|${key}`, wish)) return {type: "place", key, choice: null};
  }
  return null;
}
const PICKERS = [pickOlder, pickWho, pickPlace, pickAnchor, pickSort, pickDecade];

// A new question of a random type that has material; every now and then (and at the end) one answered with “don't know” again.
function pickQuestion() {
  const last = lastAnswers();
  const tryAll = (wish) => { for (const f of PICKERS.slice().sort(() => Math.random() - 0.5)) { const q = f(last, wish); if (q) return q; } return null; };
  return (Math.random() < 0.15 ? tryAll("unknown") : null) || tryAll("new") || tryAll("unknown");
}

// ---- pictures. A face with surroundings, filled by CSS; small faces are fetched sharper from Immich (/crops/...),
//      the stored photo stays underneath until that picture is there (or when Immich cannot deliver it).
function faceGeom(b) {
  const W = b[4], H = b[5], bw = Math.max(1, b[2] - b[0]), bh = Math.max(1, b[3] - b[1]);
  const side = Math.min(Math.max(Math.max(bw, bh) * 2.6, 20), W, H);
  const x0 = Math.max(0, Math.min((b[0] + b[2]) / 2 - side / 2, W - side)), y0 = Math.max(0, Math.min((b[1] + b[3]) / 2 - side / 2, H - side));
  return {W, H, bw, bh, side, x0, y0};
}
function faceStyle(key, b, plain = false) {
  const {W, H, side, x0, y0} = faceGeom(b);
  const px = W > side ? (x0 / (W - side)) * 100 : 0, py = H > side ? (y0 / (H - side)) * 100 : 0;
  const stored = `background-image:url(${image(key)});background-size:${((W / side) * 100).toFixed(2)}% auto;background-position:${px.toFixed(2)}% ${py.toFixed(2)}%;`;
  if (plain || side * Math.min(1, STORED / Math.max(W, H)) >= SOFT) return stored;
  const sharp = `/crops/${encodeURIComponent(key)}_${W}_${H}_${Math.round(x0)}_${Math.round(y0)}_${Math.round(side)}.jpg`;
  return `background-image:url(${sharp}),url(${image(key)});background-size:cover,${((W / side) * 100).toFixed(2)}% auto;background-position:center,${px.toFixed(2)}% ${py.toFixed(2)}%;`;
}
// A frame around the face that is meant: inside the cut-out (square) or in the whole photo (box = null: the cut-out).
const boxPct = (v, total) => `${((v / total) * 100).toFixed(2)}%`;
function frameInCutout(b) {
  const g = faceGeom(b);
  return `<span class="game-kasten" style="left:${boxPct(b[0] - g.x0, g.side)};top:${boxPct(b[1] - g.y0, g.side)};width:${boxPct(g.bw, g.side)};height:${boxPct(g.bh, g.side)}"></span>`;
}
const frameInPhoto = (b) => `<span class="game-kasten" style="left:${boxPct(b[0], b[4])};top:${boxPct(b[1], b[5])};width:${boxPct(b[2] - b[0], b[4])};height:${boxPct(b[3] - b[1], b[5])}"></span>`;

const ICON = {
  older: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  same: '<path d="M5 9h14M5 15h14"/>',
  unknown: '<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 17.5v.5"/><circle cx="12" cy="12" r="10"/>',
  different: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20c0-3 2-5 5-5M21 20c0-3-2-5-5-5M4 4l16 16"/>',
  before: '<path d="M15 5l-7 7 7 7"/>',
  after: '<path d="M9 5l7 7-7 7"/>',
  undo: '<path d="M9 7H4v5M4 7c4-4 12-3 15 3 1 3 0 6-2 8"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 16l-5-4-9 7"/>',
};
const icon = (n) => `<svg class="game-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const btn = (action, w, name, text, extra = "") => `<button class="game-btn" data-a="${action}" ${w ? `data-w="${w}"` : ""} ${extra} title="${text}">${icon(name)}<span>${text}</span></button>`;

const thumb = (key, extra = "") => `<button class="game-thumb" data-a="game-view" data-key="${esc(key)}" ${extra} title="${tr("Show whole photo")}"><img src="${image(key)}" alt="${tr("Show whole photo")}"></button>`;
const faceBg = (f) => (f.box ? faceStyle(f.key, f.box) : `background-image:url(${image(f.key)});background-size:cover;`);
const face = (pair, side) => {
  const f = pair[side];
  return `<div class="game-cell"><div class="game-box">
    <button class="game-photo" data-a="game-pick" data-w="${side}" title="${tr("This one is older")}" style="${faceBg(f)}"></button>
    <span class="game-badge">${icon("older")}${tr("Older")}</span>${thumb(f.key, `data-pair="${esc(pair.a.key)}|${esc(pair.b.key)}" data-i="${side === "a" ? 0 : 1}"`)}
  </div></div>`;
};
const wholePhoto = (key, badge = "") => `<div class="game-cell"><button class="game-whole" data-a="game-view" data-key="${esc(key)}" title="${tr("Show whole photo")}"><img src="${image(key)}" alt=""></button>${badge ? `<span class="game-badge">${badge}</span>` : ""}</div>`;
const answerBar = (kind, listId, items, placeholder, input) => `<div class="game-answer">
  <input class="game-input" id="game-input" ${input} list="${listId}" placeholder="${esc(placeholder)}" autocomplete="off">
  <datalist id="${listId}">${items}</datalist>
  <button class="game-btn primary" data-a="game-save">${tr("Save")}</button></div>`;

// Suggestions for the place: what the place list already knows (event, residence, neighbour in the album), then places of the
// other photos of the series, then the most used places.
function placeChips(q) {
  if (!S.grPlaces || !S.grPlaces.byHandle) return [];
  const e = unitFromKey(q.key);
  const out = [], seen = new Set();
  const add = (o, reason) => { if (o && o.h && !seen.has(o.h) && out.length < 4) { seen.add(o.h); out.push({o, reason}); } };
  if (e) suggestions(e, q.key).forEach((x) => add(x.o, x.reason));
  if (e) e.keys.filter((k) => k !== q.key).forEach((k) => { const p = placeFrom(k); if (p && p.h) add(S.grPlaces.byHandle[p.h], tr("other photos of the series")); });
  const count = {};
  Object.values(S.places || {}).forEach((p) => { if (p && p.h) count[p.h] = (count[p.h] || 0) + 1; });
  Object.keys(count).sort((x, y) => count[y] - count[x]).forEach((h) => add(S.grPlaces.byHandle[h], tr("often used")));
  return out;
}

// Search for a place on its own page: the list stands right under the field, so the keyboard only covers the empty part.
function placeSheet(q) {
  const el = document.createElement("div"); el.className = "game-sheet";
  el.innerHTML = `<div class="game-sheet-bar"><b>${tr("Search place")}</b><span class="space"></span><button class="game-sheet-close">${tr("Close")}</button></div>
    <button class="game-sheet-thumb" data-a="game-view" data-key="${esc(q.key)}"><img src="${image(q.key)}" alt=""></button>
    <input class="game-input" id="game-sheet-input" placeholder="${esc(tr("Search place: type name or Gramps number"))}" autocomplete="off">
    <div class="game-sheet-list" id="game-sheet-list"></div>`;
  const list = el.querySelector("#game-sheet-list"), input = el.querySelector("input");
  const close = () => el.remove();
  const choose = (o) => { q.choice = o; close(); draw(); };
  const fill = () => {
    const text = input.value.trim(), w = norm(text).split(/\s+/).filter(Boolean);
    const hits = w.length ? S.grPlaces.list.filter((o) => { const s = norm(o.t + " " + o.id); return w.every((x) => s.includes(x)); })
      .sort((a, b) => (norm(a.n).startsWith(w[0]) ? 0 : 1) - (norm(b.n).startsWith(w[0]) ? 0 : 1) || a.t.length - b.t.length).slice(0, 30) : [];
    list.innerHTML = hits.map((o, i) => `<button class="game-sheet-item" data-i="${i}"><b>${esc(o.n)}</b><small>${esc(o.t)}</small></button>`).join("")
      + (text ? `<button class="game-sheet-item new"><b>${esc(tr("Remember “{name}” as a new place", {name: text}))}</b></button>` : "");
    list.querySelectorAll(".game-sheet-item").forEach((b) => b.addEventListener("click", () => {
      if (b.classList.contains("new")) choose({h: null, t: text, n: text});
      else choose(hits[+b.dataset.i]);
    }));
  };
  input.addEventListener("input", fill);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const f = list.querySelector(".game-sheet-item"); if (f) f.click(); } });
  el.querySelector(".game-sheet-close").addEventListener("click", close);
  document.body.appendChild(el); input.focus();
}

function questionHtml(q) {
  const n = S.game.votes.length;
  const undo = btn("game-undo", "", "undo", tr("Undo last decision"), n ? "" : "disabled");
  const unknown = btn("game-pick", "unknown", "unknown", tr("Don't know"));
  if (q.type === "who") {
    return `<div class="game-q">${tr("Who is this?")}</div>
      <div class="game-pair"><div class="game-cell"><div class="game-box"><span class="game-photo static" style="${faceBg(q.f)}"></span>${q.f.box ? frameInCutout(q.f.box) : ""}${thumb(q.f.key, q.f.box ? `data-box="${q.f.box.join(",")}"` : "")}</div></div></div>
      ${answerBar("who", "game-names", (S.allNames || []).map((x) => `<option value="${esc(x)}">`).join(""), tr("Name"), "")}
      <div class="game-buttons">${unknown}${undo}</div>`;
  }
  if (q.type === "anchor") {
    return `<div class="game-q">${tr("Was this photo taken before or after the one from {year}?", {year: q.ay})}</div>
      <div class="game-pair">${wholePhoto(q.key)}${wholePhoto(q.anchor, q.ay)}</div>
      <div class="game-buttons">${btn("game-pick", "before", "before", tr("Earlier"))}${btn("game-pick", "same", "same", tr("About the same time"))}${btn("game-pick", "after", "after", tr("Later"))}${unknown}${undo}</div>`;
  }
  if (q.type === "sort") {
    const done = q.order.length === q.items.length;
    return `<div class="game-q">${tr("Put the photos of {name} in order, youngest first.", {name: esc(q.name)})}</div>
      <div class="game-sort">${q.items.map((f, i) => { const at = q.order.indexOf(i); return `<div class="game-box"><button class="game-photo ${at >= 0 ? "chosen" : ""}" data-a="game-sort" data-i="${i}" style="${faceBg(f)}"></button>${at >= 0 ? `<span class="game-badge game-num">${at + 1}</span>` : ""}${thumb(f.key)}</div>`; }).join("")}</div>
      <div class="game-buttons">${btn("game-sort-reset", "", "undo", tr("Start again"), q.order.length ? "" : "disabled")}${unknown}${undo}</div>
      <div class="game-answer"><button class="game-btn primary" data-a="game-save" ${done ? "" : "disabled"}>${tr("Save")}</button></div>`;
  }
  if (q.type === "decade") {
    const r = ((S.res && S.res.rows) || []).find((x) => x.key === q.key) || {};
    const lo = Math.floor(((r.from || r.year || 1950) - 5) / 10), hi = Math.floor(((r.to || r.year || 1950) + 5) / 10);
    const first = Math.max(lo, hi - 5);
    const decades = []; for (let d = first; d <= hi; d++) decades.push(d * 10);
    return `<div class="game-q">${tr("In which decade was this photo taken?")}</div>
      <div class="game-pair">${wholePhoto(q.key)}</div>
      <div class="game-chips">${decades.map((d) => `<button class="game-chip" data-a="game-decade" data-d="${d}"><b>${d}s</b></button>`).join("")}</div>
      <div class="game-buttons">${unknown}${undo}</div>`;
  }
  if (q.type === "year") {
    return `<div class="game-q">${tr("In which year was this photo taken?")}</div>
      <div class="game-pair">${wholePhoto(q.key)}</div>
      ${answerBar("year", "game-years", "", tr("Year, e.g. 1952"), 'type="number" inputmode="numeric" min="1800" max="2100"')}
      <div class="game-buttons">${unknown}${undo}</div>`;
  }
  if (q.type === "place") {
    if (!q.asked) { q.asked = true; peopleOn(q.key).forEach((p) => loadEvents(p.id)); }   // residences of the people on the photo help with suggestions
    const chips = placeChips(q);
    const c = q.choice;
    const shown = c && !chips.some((x) => x.o.h === c.h && c.h) ? [{o: c, reason: tr("chosen")}, ...chips] : chips;
    return `<div class="game-q">${tr("Where was this photo taken?")}</div>
      <div class="game-pair">${wholePhoto(q.key)}</div>
      <div class="game-chips">${shown.map((x, i) => `<button class="game-chip ${c && (c.h ? c.h === x.o.h : c.t === x.o.t) ? "on" : ""}" data-a="game-place-choose" data-i="${i}"><b>${esc(x.o.n || x.o.t)}</b><small>${esc(x.reason)}</small></button>`).join("")}
        <button class="game-chip" data-a="game-place-search"><b>${tr("Another place …")}</b></button></div>
      <div class="game-buttons">${unknown}${undo}</div>
      <div class="game-answer"><button class="game-btn primary" data-a="game-save" ${c ? "" : "disabled"}>${tr("Save")}</button></div>`;
  }
  return `<div class="game-q">${tr("Which photo shows {name} older?", {name: esc(q.name)})}</div>
    <div class="game-pair">${face(q, "a")}${face(q, "b")}</div>
    <div class="game-buttons">${btn("game-pick", "same", "same", tr("Same age"))}${unknown}
      ${btn("game-pick", "different", "different", tr("Not the same person"))}${undo}</div>`;
}

// ---- results: what has been answered so far (only looking, nothing is changed)
const LIMIT = 40;
const faceOf = (pid, key) => { const p = people().find((x) => x.id === pid); const f = p && p.photos.find((z) => z.key === key); return f ? f.box : null; };
const mini = (key, box) => (box ? `<span class="game-mini" style="${faceStyle(key, box, true)}"></span>` : `<img class="game-mini" src="${image(key)}" alt="">`);
const miniPhoto = (key) => `<button class="game-mini-btn" data-a="game-view" data-key="${esc(key)}" title="${tr("Show whole photo")}"><img class="game-mini" src="${image(key)}" alt=""></button>`;
const more = (n) => (n > LIMIT ? `<div class="quiet">${tr("Only the first {n} are shown.", {n: LIMIT})}</div>` : "");
const section = (title, body) => `<section class="game-res"><h3>${title}</h3>${body}</section>`;

function resultsHtml() {
  const votes = S.game.votes, type = (v) => v.type || "older";
  const by = (t) => votes.filter((v) => type(v) === t);
  const known = new Set((S.allNames || []).map((x) => String(x).toLowerCase()));
  const older = by("older"), who = by("who"), year = by("year"), place = by("place"), anchor = by("anchor"), sort = by("sort"), decade = by("decade");
  const unknown = (arr, f) => arr.filter(f).length;
  const summary = [[tr("Which photo shows … older?"), older, (v) => v.older === "unknown"], [tr("Who is this?"), who, (v) => !v.name],
    [tr("In which year was this photo taken?"), year, (v) => !v.year], [tr("Where was this photo taken?"), place, (v) => !v.place],
    [tr("Before or after a dated photo?"), anchor, (v) => v.rel === "unknown"], [tr("Sort photos by age"), sort, (v) => v.unknown], [tr("In which decade was this photo taken?"), decade, (v) => !v.from]]
    .map(([label, arr, u]) => `<tr><td>${label}</td><td>${arr.length}</td><td>${unknown(arr, u)}</td></tr>`).join("");
  // older: your answers against the AI estimate (ages of the person at the time of the photo)
  let agree = 0, total = 0;
  const contra = [];
  older.filter((v) => v.older === "a" || v.older === "b").forEach((v) => {
    const p = people().find((x) => x.id === v.pid);
    if (!p) return;
    const x = ageOf(v.a, p.name), y = ageOf(v.b, p.name);
    if (x === null || y === null || x === y) return;
    total++;
    const youSaidA = v.older === "a";
    if ((x > y) === youSaidA) agree++;
    else if (Math.abs(x - y) >= 2) contra.push({v, p, x, y});
  });
  const ageText = (n) => tr("{n} {n:year|years}", {n: Math.round(n)});
  const contraHtml = contra.slice(0, LIMIT).map(({v, p, x, y}) => `<div class="game-res-row">${[["a", v.a, x], ["b", v.b, y]].map(([side, key, age]) =>
    `<div class="game-res-item">${mini(key, faceOf(v.pid, key))}<small>${ageText(age)}${v.older === side ? ` · <b>${tr("Your choice")}</b>` : ""}</small></div>`).join("")}<span>${esc(p.name)}</span></div>`).join("");
  const diff = by("older").filter((v) => v.older === "different");
  const diffHtml = diff.slice(0, LIMIT).map((v) => { const p = people().find((x) => x.id === v.pid);
    return `<div class="game-res-row">${mini(v.a, faceOf(v.pid, v.a))}${mini(v.b, faceOf(v.pid, v.b))}<span>${tr("Person in Immich: {name}", {name: esc(p ? p.name : "?")})}</span></div>`; }).join("");
  const whoHtml = who.filter((v) => v.name).slice(0, LIMIT).map((v) => `<div class="game-res-row">${mini(v.key, v.box)}<span><b>${esc(v.name)}</b> <small>${known.has(v.name.toLowerCase()) ? tr("known name") : tr("new name")}</small></span></div>`).join("");
  const est = new Map(((S.res && S.res.rows) || []).map((r) => [r.key, r.year]));
  const yearHtml = year.filter((v) => v.year).slice(0, LIMIT).map((v) => `<div class="game-res-row">${miniPhoto(v.key)}<span>${tr("Your year {y}, AI estimate {e}", {y: v.year, e: est.get(v.key) ?? "–"})}</span></div>`).join("");
  const placeHtml = place.filter((v) => v.place).slice(0, LIMIT).map((v) => `<div class="game-res-row">${miniPhoto(v.key)}<span>${esc(v.place)}${v.h ? "" : ` <small>${tr("new name")}</small>`}</span></div>`).join("");
  const none = `<div class="quiet">${tr("Nothing here yet.")}</div>`;
  return `<div class="write-page game-results">
    <div class="quiet">${tr("Your answers narrow the estimates (shown as “refined”). Nothing is written to Immich or Gramps.")}</div>
    ${section(tr("Answers"), `<table><tr><th></th><th>${tr("Answers")}</th><th>${tr("Don't know")}</th></tr>${summary}</table>`)}
    ${section(tr("Your answers against the AI estimate"), total ? `<div>${tr("{agree} of {n} answers agree with the AI estimate.", {agree, n: total})}</div>
      ${contra.length ? `<div class="quiet">${tr("Contradictions (the AI sees it the other way round by at least 2 years):")}</div>${contraHtml}${more(contra.length)}` : ""}` : none)}
    ${section(tr("Marked as not the same person"), diffHtml ? diffHtml + more(diff.length) : none)}
    ${section(tr("Names you gave"), whoHtml ? whoHtml + more(who.filter((v) => v.name).length) : none)}
    ${section(tr("Years you gave"), yearHtml ? yearHtml + more(year.filter((v) => v.year).length) : none)}
    ${section(tr("Places you gave"), placeHtml ? placeHtml + more(place.filter((v) => v.place).length) : none)}
  </div>`;
}

// The game takes the whole browser window (see .game-full in style.css).
export function gameHtml() {
  if (!S.grPlaces) loadGrampsPlaces(false);
  if (ui.game === undefined || ui.game === null) ui.game = pickQuestion();
  const q = ui.game, n = S.game.votes.length;
  const note = narrow() && !recall("fullView", false) ? `<span class="quiet game-hint">${tr("The full interface is made for large screens.")}</span>` : "";
  const body = ui.gameResults ? resultsHtml() : q ? questionHtml(q)
    : `<div class="empty game-empty">${people().length || unnamed().length ? tr("All questions answered. Nice!") : tr("Not enough photos of named people yet. Please click “Refresh” first.")}</div>`;
  return `<div class="game-full ${ui.gameResults ? "results" : ""}"><div class="game-bar"><b>${tr("Game")}</b><span class="quiet">${tr("{n} {n:answer|answers} so far", {n})}</span>${note}<span class="space"></span>
      <button data-a="game-results">${ui.gameResults ? tr("Back to game") : tr("Results")}</button><button data-a="game-leave">${tr("Back to Grimmich")}</button></div>${body}
    <div class="quiet game-foot">${tr("Nothing is written to Immich or Gramps. Your answers stay in Grimmich.")}</div></div>`;
}

// Whole photo in a viewer: pinch / mouse wheel to zoom, drag to move, double tap resets.
// With two photos (a pair) you swipe or use the arrow keys to go from one to the other; the zoom stays.
function viewer(items, start = 0) {
  const el = document.createElement("div"); el.className = "game-viewer";
  const many = items.length > 1;
  el.innerHTML = `<div class="game-stage"><img alt="" draggable="false"><span class="game-frame"></span></div>
    <button class="game-viewer-back">${tr("Back to decision")}</button>
    ${many ? `<button class="game-viewer-prev" aria-label="${tr("Previous photo")}">‹</button><button class="game-viewer-next" aria-label="${tr("Next photo")}">›</button><span class="game-viewer-count"></span>` : ""}`;
  const stage = el.querySelector(".game-stage"), img = el.querySelector("img"), frame = el.querySelector(".game-frame");
  let idx = start, sc = 1, tx = 0, ty = 0, start1 = null;
  const pts = new Map();
  let start2 = null;
  const apply = () => { stage.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`; };
  const show = () => {
    const it = items[idx];
    img.src = image(it.key);
    frame.innerHTML = it.box ? frameInPhoto(it.box) : "";
    const c = el.querySelector(".game-viewer-count"); if (c) c.textContent = `${idx + 1} / ${items.length}`;
  };
  const go = (d) => { if (many) { idx = (idx + d + items.length) % items.length; show(); } };
  const zoomAt = (f, cx, cy) => {   // keeps the point under the fingers where it is
    const n = Math.max(1, Math.min(8, sc * f)), k = n / sc;
    const r = el.getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2;
    tx = ox - (ox - tx) * k; ty = oy - (oy - ty) * k; sc = n;
    if (sc === 1) { tx = 0; ty = 0; }
    apply();
  };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = [...pts.values()]; return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; };
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    el.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    start2 = pts.size === 2 ? dist() : null; start1 = pts.size === 1 ? {x: e.clientX, y: e.clientY} : null;
  });
  el.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2 && start2) { const d = dist(); zoomAt(d / start2, mid().x, mid().y); start2 = d; start1 = null; }
    else if (pts.size === 1 && sc > 1) { tx += dx; ty += dy; apply(); }
  });
  const up = (e) => {
    const p = pts.get(e.pointerId);
    if (p && pts.size === 1 && start1 && sc === 1) {   // a swipe to the side with the photo not zoomed: the other photo
      const dx = p.x - start1.x, dy = p.y - start1.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
    }
    pts.delete(e.pointerId); start2 = pts.size === 2 ? dist() : null; start1 = null;
  };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); start1 = null; start2 = null; });
  el.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, {passive: false});
  el.addEventListener("dblclick", (e) => { if (sc > 1) { sc = 1; tx = 0; ty = 0; apply(); } else zoomAt(3, e.clientX, e.clientY); });
  const close = () => { el.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (many && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); e.stopPropagation(); go(e.key === "ArrowRight" ? 1 : -1); }
  };
  document.addEventListener("keydown", onKey, true);
  el.querySelector(".game-viewer-back").addEventListener("click", close);
  if (many) { el.querySelector(".game-viewer-prev").addEventListener("click", () => go(-1)); el.querySelector(".game-viewer-next").addEventListener("click", () => go(1)); }
  show(); document.body.appendChild(el);
}

const stamp = () => new Date().toISOString().slice(0, 19);
// No automatic focus on phones and tablets: the keyboard would open at every question with an input.
const touch = () => window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
const focusInput = () => { if (!touch()) setTimeout(() => { const i = document.getElementById("game-input"); if (i) i.focus(); }, 50); };
async function answer(v) {
  S.game.votes.push({...v, t: stamp()});
  mark();   // the estimates are recomputed with the new answer
  ui.game = null; draw(); focusInput();
  await saveGame();
}

export const actions = {
  "game-view": (el) => {
    const d = el.dataset;
    if (d.pair) viewer(d.pair.split("|").map((key) => ({key})), +d.i || 0);
    else viewer([{key: d.key, box: d.box ? d.box.split(",").map(Number) : null}]);
  },
  "game-results": () => { ui.gameResults = !ui.gameResults; draw(); },
  "game-open": () => { ui.view = "game"; ui.game = null; ui.gameResults = false; window.scrollTo(0, 0); loadGrampsPlaces(false); draw(); focusInput(); },
  "game-leave": () => { remember("fullView", true); ui.view = "start"; ui.game = null; draw(); },
  "game-pick": async (el) => {   // older / same / different / unknown
    const q = ui.game;
    if (!q) return;
    const w = el.dataset.w;
    if (q.type === "who") return answer({type: "who", key: q.f.key, box: q.f.box, name: ""});
    if (q.type === "year") return answer({type: "year", key: q.key, year: null});
    if (q.type === "place") return answer({type: "place", key: q.key, place: "", h: null});
    if (q.type === "anchor") return answer({type: "anchor", key: q.key, anchor: q.anchor, ay: q.ay, rel: w});
    if (q.type === "sort") return answer({type: "sort", pid: q.pid, keys: q.items.map((f) => f.key), unknown: true});
    if (q.type === "decade") return answer({type: "decade", key: q.key, from: null, to: null});
    return answer({a: q.a.key, b: q.b.key, pid: q.pid, older: w});
  },
  "game-sort": (el) => {
    const q = ui.game;
    if (!q || q.type !== "sort") return;
    const i = +el.dataset.i, at = q.order.indexOf(i);
    if (at >= 0) q.order.splice(at, 1); else q.order.push(i);
    draw();
  },
  "game-sort-reset": () => { if (ui.game && ui.game.type === "sort") { ui.game.order = []; draw(); } },
  "game-decade": (el) => {
    const q = ui.game, d = +el.dataset.d;
    if (q && q.type === "decade" && d) return answer({type: "decade", key: q.key, from: d, to: d + 9});
  },
  "game-place-choose": (el) => {
    const q = ui.game;
    if (!q || q.type !== "place") return;
    const chips = placeChips(q);
    const shown = q.choice && !chips.some((x) => x.o.h === q.choice.h && q.choice.h) ? [{o: q.choice}, ...chips] : chips;
    const x = shown[+el.dataset.i];
    if (x) { q.choice = x.o; draw(); }
  },
  "game-place-search": () => { if (ui.game && ui.game.type === "place" && S.grPlaces && S.grPlaces.list) placeSheet(ui.game); },
  "game-save": async () => {
    if (ui.game && ui.game.type === "sort") {
      const q = ui.game;
      return q.order.length === q.items.length ? answer({type: "sort", pid: q.pid, keys: q.order.map((i) => q.items[i].key)}) : undefined;
    }
    if (ui.game && ui.game.type === "place") {
      const c = ui.game.choice;
      return c ? answer({type: "place", key: ui.game.key, place: c.t, h: c.h || null}) : undefined;
    }
    const q = ui.game, text = (document.getElementById("game-input") || {}).value;
    if (!q || !String(text || "").trim()) return;
    const t = String(text).trim();
    if (q.type === "who") return answer({type: "who", key: q.f.key, box: q.f.box, name: t});
    if (q.type === "year") {
      const y = parseInt(t, 10);
      if (!(y >= 1800 && y <= 2100)) { document.getElementById("game-input").select(); return; }
      return answer({type: "year", key: q.key, year: y});
    }
  },
  "game-undo": async () => {
    const v = S.game.votes.pop();
    if (!v) return;
    if (v.type === "who") ui.game = {type: "who", f: {key: v.key, box: v.box}};
    else if (v.type === "year") ui.game = {type: "year", key: v.key};
    else if (v.type === "anchor") ui.game = {type: "anchor", key: v.key, anchor: v.anchor, ay: v.ay};
    else if (v.type === "decade") ui.game = {type: "decade", key: v.key};
    else if (v.type === "sort") {
      const p = people().find((x) => x.id === v.pid);
      const items = p ? v.keys.map((k) => p.photos.find((f) => f.key === k)).filter(Boolean) : [];
      ui.game = items.length === v.keys.length ? {type: "sort", pid: p.id, name: p.name, items: items.slice().sort(() => Math.random() - 0.5), order: []} : null;
    }
    else if (v.type === "place") ui.game = {type: "place", key: v.key, choice: null};
    else {
      const p = people().find((x) => x.id === v.pid);
      const a = p && p.photos.find((f) => f.key === v.a), b = p && p.photos.find((f) => f.key === v.b);
      ui.game = a && b ? {type: "older", pid: p.id, name: p.name, a, b} : null;
    }
    mark(); draw(); focusInput(); await saveGame();
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
