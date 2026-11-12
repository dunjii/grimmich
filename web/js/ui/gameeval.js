// Evaluation of the game for you (only on the full interface, never from outside): who answered how much,
// what the answers changed in the estimates, where answers contradict each other. Players can be hidden: their answers then count nowhere.
import {S, ui, draw, mark} from "../state.js";
import {esc, image, send, toast} from "../util.js";
import {unitOf, unitFromKey, yearText} from "../model.js";
import {tr} from "../language.js";
import {statsOf} from "./game.js";
import {noteWho} from "./detail.js";
import {improvedBy, allChanges, conflicts} from "../impact.js";

const range = (s) => (!s.year ? tr("no estimate") : s.from === s.to ? `${s.year}` : `${s.from}–${s.to}`);
// A photo in the evaluation: a click opens it in the side panel (where you can edit it)
const pic = (key) => { const e = unitFromKey(key); return `<img src="${image(key)}" alt="" loading="lazy" ${e ? `data-a="choose" data-uid="${esc(e.uid)}" data-key="${esc(key)}" style="cursor:pointer"` : ""}>`; };
const when = (t) => (t ? t.replace("T", " ").slice(0, 16) : "–");
let result = null, shown = 20;   // {at, per: {player: n}, changes}, how many changes are listed

function playerRows() {
  const by = new Map();
  S.game.votes.forEach((v) => { const n = v.player || tr("(no name)"); const p = by.get(n) || {name: n, n: 0, last: ""}; p.n++; if ((v.t || "") > p.last) p.last = v.t || ""; by.set(n, p); });
  (S.game.muted || []).forEach((n) => { if (!by.has(n)) by.set(n, {name: n, n: 0, last: ""}); });
  return [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "de"));
}
function changeRow(c) {
  return `<div class="ge-change">${pic(c.key)}<div><b>${esc(range(c.after))}</b> <span class="quiet">${tr("before")}: ${esc(range(c.before))}</span></div></div>`;
}
function conflictRow(c) {
  const y = unitOf(c.young), o = unitOf(c.old);
  if (!y || !o) return "";
  const one = (u, label) => `<div class="ge-conflict-side">${pic(u.keys[0])}<span class="quiet">${label}<br>${esc(yearText(u))}</span></div>`;
  return `<div class="ge-conflict">${one(y, tr("answers say: younger"))}<span class="quiet">↔</span>${one(o, tr("answers say: older"))}</div>`;
}
function notesHtml() {
  const by = new Map();
  S.notes.forEach((n) => { (by.get(n.key) || by.set(n.key, []).get(n.key)).push(n); });
  if (!by.size) return `<div class="quiet">${tr("No notes yet.")}</div>`;
  return `<div class="ge-notes">${[...by.entries()].map(([key, list]) => `<div class="ge-note">${pic(key)}<div>${list.map((n) => `<div><b>${esc(noteWho(n))}</b> <span class="quiet">${esc(when(n.t))}</span><br>${esc(n.text)}</div>`).join("")}</div></div>`).join("")}</div>`;
}
export function gameEvalHtml() {
  const rows = playerRows(), muted = S.game.muted || [];
  const table = rows.map((p) => {
    const st = statsOf(p.name), off = muted.includes(p.name);
    return `<tr class="${off ? "ge-muted" : ""}"><td>${esc(p.name)}${off ? ` <span class="tag warn">${tr("hidden")}</span>` : ""}</td><td>${p.n}</td><td>${esc(when(p.last))}</td><td>${st.confirmed}</td>
      <td>${result && result.per[p.name] !== undefined ? result.per[p.name] : "–"}</td>
      <td><button class="small" data-a="ge-mute" data-name="${esc(p.name)}" data-muted="${off ? "0" : "1"}">${off ? tr("Show answers again") : tr("Hide answers")}</button></td></tr>`;
  }).join("");
  const conf = conflicts().map(conflictRow).filter(Boolean);
  return `<div class="person-head"><div><h1>${tr("Game evaluation")}</h1><div class="quiet">${tr("{n} answers from {m} players", {n: S.game.votes.length, m: rows.length})}</div></div>
      <button class="primary" data-a="ge-calc" ${ui.evalBusy ? "disabled" : ""}>${ui.evalBusy ? tr("Calculating …") : tr("Calculate effect")}</button></div>
    <div class="box info">${tr("Hiding answers takes all answers of a player out of every estimate at once. Nothing is deleted; you can show them again at any time.")}</div>
    ${rows.length ? `<div class="table-frame"><table class="to-tab"><thead><tr><th>${tr("Player")}</th><th>${tr("Answers")}</th><th>${tr("Last answer")}</th><th>${tr("confirmed by others")}</th><th>${tr("Photos dated more precisely")}</th><th></th></tr></thead><tbody>${table}</tbody></table></div>` : `<div class="empty">${tr("No answers yet.")}</div>`}
    <h2>${tr("What the answers changed")}</h2>
    ${result ? (result.changes.length ? `<div class="quiet">${tr("{n} photos have another estimate because of the answers (calculated {t}).", {n: result.changes.length, t: when(result.at)})}</div>
      <div class="ge-changes">${result.changes.slice(0, shown).map(changeRow).join("")}</div>
      ${result.changes.length > shown ? `<button class="small" data-a="ge-more">${tr("Show more")}</button>` : ""}` : `<div class="quiet">${tr("The answers have not changed any estimate so far.")}</div>`)
      : `<div class="quiet">${tr("Click “Calculate effect” to see it.")}</div>`}
    <h2>${tr("Notes from the game")}</h2>
    ${notesHtml()}
    <h2>${tr("Contradictions")}</h2>
    ${conf.length ? `<div class="quiet">${tr("The answers and your rows contradict each other for these photos. Check them in the rows.")}</div><div class="ge-conflicts">${conf.join("")}</div>` : `<div class="quiet">${tr("No contradictions.")}</div>`}`;
}

export const actions = {
  "go-gameeval": () => { Object.assign(ui, {view: "gameeval", focusKey: null, photoKey: null}); draw(); },
  "ge-more": () => { shown += 20; draw(); },
  "ge-calc": () => {
    ui.evalBusy = true; draw();
    setTimeout(() => {   // the calculation blocks for a moment: first let the button change
      try {
        const per = {};
        rows_names().forEach((n) => { per[n] = improvedBy(n).length; });
        result = {at: new Date().toISOString(), per, changes: allChanges()};
        shown = 20;
      } catch (e) { toast(tr("That did not work.")); }
      ui.evalBusy = false; draw();
    }, 30);
  },
  "ge-mute": async (el) => {
    try {
      const r = await send("/api/players", {op: "mute", name: el.dataset.name, muted: el.dataset.muted === "1"});
      if (!r.ok) throw new Error("no");
      S.game = {...S.game, muted: r.muted || []}; result = null; mark(); draw();
    } catch (e) { toast(tr("That did not work.")); }
  },
};
const rows_names = () => playerRows().map((p) => p.name);
