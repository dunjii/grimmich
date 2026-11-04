// What the answers of the game changed: estimates with and without (the answers of) a player.
// Nothing here writes anything; the estimates are only calculated twice and compared.
import {S, mark} from "./state.js";
import {unitFromKey, unitList} from "./model.js";
import {info} from "./joint.js";

// The photos an answer is about
export function voteKeys(v) {
  const t = v.type || "older";
  if (t === "older") return [v.a, v.b].filter(Boolean);
  if (t === "sort") return Array.isArray(v.keys) ? v.keys : [];
  return v.key ? [v.key] : [];
}

// key -> {year, from, to, id}: the estimate of the unit each photo belongs to (id = first photo of the unit)
export function snapshot(keys) {
  const out = new Map();
  keys.forEach((k) => {
    const u = unitFromKey(k);
    if (u && u.year) out.set(k, {year: u.year, from: u.from, to: u.to, id: u.keys[0]});
    else out.set(k, {year: 0, from: 0, to: 0, id: u ? u.keys[0] : k});
  });
  return out;
}

// Runs fn with the answers of the given players (or all answers) taken out, then puts everything back.
export function withoutVotes(players, fn) {
  const keep = S.game;
  S.game = {...keep, votes: players ? keep.votes.filter((v) => !players.includes(v.player)) : []};
  mark();
  try { return fn(); } finally { S.game = keep; mark(); unitList(); }
}

export const spanOf = (s) => (s && s.year ? s.to - s.from : null);
const same = (a, b) => a.year === b.year && a.from === b.from && a.to === b.to;

// Per unit that changed: {key, before, after, gain}; gain = how many years narrower (or a first estimate: 99)
export function changes(before, after) {
  const seen = new Set(), out = [];
  after.forEach((a, k) => {
    const b = before.get(k);
    if (!b || seen.has(a.id) || !a.year || same(a, b)) return;
    seen.add(a.id);
    out.push({key: k, before: b, after: a, gain: b.year ? b.to - b.from - (a.to - a.from) : 99});
  });
  return out.sort((x, y) => y.gain - x.gain);
}

// Photos that became at least `years` narrower (or got an estimate at all) through the answers of these players
export function improvedBy(player, years = 2) {
  const keys = [...new Set(S.game.votes.filter((v) => v.player === player).flatMap(voteKeys))].filter((k) => S.photos[k]);
  if (!keys.length) return [];
  const now = snapshot(keys);
  const without = withoutVotes([player], () => snapshot(keys));
  return changes(without, now).filter((c) => c.gain >= years);
}

// Everything the answers (of all players) changed against the estimates without any answers
export function allChanges() {
  const keys = Object.keys(S.photos);
  const now = snapshot(keys);
  return changes(withoutVotes(null, () => snapshot(keys)), now);
}

export const conflicts = () => info.conflicts.slice();
