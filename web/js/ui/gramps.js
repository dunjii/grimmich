// Write photos to Gramps: selection with title, preview, write, undo. Runs through gramps_write.py.
import {S, ui, draw} from "../state.js";
import {$, esc, image, send, toast} from "../util.js";
import {unitFromKey} from "../model.js";
import {provenanceOf, albumKeys} from "../provenance.js";
import {modal, closeIt, ask} from "./dialog.js";
import {startJob, afterJobHooks} from "../job.js";
import {tr} from "../language.js";

ui.gramps = {open: false, keys: [], tickSet: new Set(), title: {}, album: {}, phase: "pick", errorText: ""};
const G = () => ui.gramps;

// ---- data per photo
const peopleOn = (key) => (S.pf && S.pf.ok ? S.pf.people.filter((p) => p.photos.some((f) => f.key === key)) : []);
function grampsPerson(p) {
  const h = S.assignMap[p.id], g = h && S.grP ? S.grP.people.find((x) => x.h === h) : null;
  return g ? {gid: g.id, name: `${g.surnames.join(" ")}, ${g.given}`.replace(/^, |, $/g, "").trim(), pid: p.id} : null;
}
export function dateFor(e) {
  if (e.date && /^\d{4}-\d\d-\d\d$/.test(e.date)) return {kind: "genau", date: e.date, year: e.year};
  if (e.from && e.to && e.from !== e.to) return {kind: "bereich", year: e.year, from: e.from, to: e.to};
  return {kind: "jahr", year: e.year};
}
const fileName = (key) => String((S.photos[key] || {}).file || key).replace(/\.[^.]+$/, "");
// If a photo lies in several albums, the choice in the window decides which one counts as the source (default: the first).
const provenanceChoice = (key) => { const l = provenanceOf(key); return l.find((h) => h.albumId === G().album[key]) || l[0]; };
const defaultTitle = (key) => { const h = provenanceChoice(key); return h ? `${tr("{album}, page {seite}, photo {nr}", {album: h.album, seite: h.page, nr: h.nr})}` : fileName(key); };
function peopleTitle(key) {
  const n = peopleOn(key).map(grampsPerson).filter(Boolean).map((p) => p.name);
  if (!n.length) return "";
  return n.length > 3 ? n.slice(0, 3).join("; ") + " u. a." : n.join("; ");
}
function titleFor(key) {
  const t = G().title[key] || {kind: "quelle", text: ""};
  if (t.kind === "person") return peopleTitle(key) || defaultTitle(key);
  return (t.text || "").trim() || defaultTitle(key);
}
function ready(key) {
  const e = unitFromKey(key);
  return !!(e && e.year && (e.confirmedFlag || e.date) && S.photos[key] && S.photos[key].id);
}
function itemFor(key) {
  const e = unitFromKey(key), h = provenanceChoice(key);
  return {key, asset: S.photos[key].id, title: titleFor(key), date: dateFor(e),
          source: h ? {album: h.album, page: h.page, nr: h.nr} : null,
          people: peopleOn(key).map(grampsPerson).filter(Boolean),
          events: G().events === false ? [] : (S.ez[key] || []).map((z) => ({id: z.id, text: z.text}))};
}
const dateText = (e) => { const d = dateFor(e); return d.kind === "genau" ? d.date.split("-").reverse().join(".") : d.kind === "bereich" ? `${tr("estimated {von}–{bis}", {von: d.from, bis: d.to})}` : String(d.year); };

// ---- Fenster
export function grampsOeffnen(keys) {
  const list = [...new Set(keys)].filter((k) => S.photos[k]);
  if (!list.length) return;
  Object.assign(G(), {open: true, keys: list, phase: "pick", errorText: ""});
  G().tickSet = new Set(list.filter((k) => ready(k) && !S.gw[k]));
  drawWindow();
}
const cancelButton = () => '<button data-a="gr-to">' + tr("Close") + '</button>';
function line(key) {
  const e = unitFromKey(key), ok = ready(key), inside = S.gw[key], t = G().title[key] || {kind: "quelle", text: ""};
  const h = provenanceChoice(key), several = provenanceOf(key), pers = peopleOn(key), gp = pers.map(grampsPerson).filter(Boolean), withoutVal = pers.filter((p) => !grampsPerson(p));
  let rightSide = "";
  if (inside) rightSide = `<div class="quiet">${tr("Already in Gramps:")} <b>${esc(inside.gid)}</b></div>`;
  else if (!ok) rightSide = `<div class="warn-text">${e && e.year ? tr("Not confirmed yet: will not be transferred.") : tr("No date yet: will not be transferred.")}</div>`;
  else rightSide = `<div class="gr-title"><select data-grt="${esc(key)}"><option value="quelle" ${t.kind === "quelle" ? "selected" : ""}>${tr("Source, citation")}</option>
      <option value="person" ${t.kind === "person" ? "selected" : ""} ${gp.length ? "" : "disabled"}>${tr("Last name, first name")}</option><option value="eigen" ${t.kind === "eigen" ? "selected" : ""}>${tr("Own title")}</option></select>
      <input type="text" data-grx="${esc(key)}" value="${esc(t.kind === "person" ? peopleTitle(key) : t.text)}" placeholder="${esc(defaultTitle(key))}" ${t.kind === "person" ? "disabled" : ""}></div>`;
  return `<div class="gr-row ${ok && !inside ? "" : "off"}"><input type="checkbox" data-grh="${esc(key)}" ${G().tickSet.has(key) ? "checked" : ""} ${ok && !inside ? "" : "disabled"}>
    <img src="${image(key)}" alt="">
    <div class="gr-info"><div>${esc(h ? `${tr("{album}, page {seite}, photo {nr}", {album: h.album, seite: h.page, nr: h.nr})}` : fileName(key))}${gp.length ? " · " + esc(gp.map((p) => p.name).join("; ")) : ""}</div>
      ${several.length > 1 && ok && !inside ? `<div class="quiet">${tr("Source:")} <select data-gra="${esc(key)}">${several.map((x) => `<option value="${esc(x.albumId)}" ${h && x.albumId === h.albumId ? "selected" : ""}>${tr("{album} (page {seite}, photo {nr})", {album: esc(x.album), seite: x.page, nr: x.nr})}</option>`).join("")}</select></div>` : ""}
      <div class="quiet">${e && e.year ? esc(dateText(e)) : tr("without date")}${withoutVal.length ? ` ${tr("· not linked to Gramps: {join}", {join: esc(withoutVal.map((p) => p.name).join(", "))})}` : ""}</div></div>${rightSide}</div>`;
}
function dialogWin() {
  const g = G(), j = S.job, isRunning = j.running && j.name === "gramps";
  if (!S.gs.key_set) return `<h3>${tr("To Gramps")}</h3><div class="box warn"><b>${tr("Access for writing is missing.")}</b> ${tr("Under the gear icon, enter address, user (Editor role) and password under “Gramps Web for writing”.")}</div><div class="actions">${cancelButton()}</div>`;
  if (isRunning) return `<h3>${tr("To Gramps")}</h3><div class="box info" id="jobstatus">${tr("Running …")}</div><pre class="log" id="joblog">${esc((j.rows || []).join("\n"))}</pre>`;
  if (g.phase === "error") return `<h3>${tr("To Gramps")}</h3><div class="box warn"><b>${tr("That did not work out.")}</b><pre class="log">${esc((j.rows || []).slice(-14).join("\n"))}</pre></div>
    <div class="actions"><button data-a="gr-back">${tr("Back to selection")}</button>${cancelButton()}</div>`;
  if (g.phase === "preview" && S.gv) {
    const lines = S.gv.rows.filter((z) => g.tickSet.has(z.key)), z = S.gv.counters, fresh = lines.filter((x) => x.action === "new");
    return `<h3>${tr("Preview: this would be created in Gramps")}</h3>
      <div class="box info">${tr("Target:")} <b>${esc(S.gv.target)}</b>${tr("{b}. Nothing has been written yet.", {b: S.gv.tree ? `${tr(", tree")} <b>${esc(S.gv.tree)}</b>` : ""})}</div>
      <div><b>${fresh.length}</b> ${tr("new photos ·")} <b>${fresh.filter((x) => x.new_source).length}</b> ${tr("new sources ·")} <b>${fresh.filter((x) => x.source_text).length}</b> ${tr("citations ·")} <b>${fresh.reduce((a, x) => a + x.people_ok.length, 0)}</b> ${tr("person links with face frames ·")} <b>${fresh.reduce((a, x) => a + (x.events || []).length, 0)}</b> ${tr("event links")}</div>
      <div class="gr-list">${lines.map((x) => `<div class="gr-row ${x.action === "new" ? "" : "off"}"><img src="${image(x.key)}" alt="">
        <div class="gr-info"><div><b>${esc(x.title)}</b></div><div class="quiet">${esc(x.date_text)}${x.source_text ? tr(" · source ") + esc(x.source_text) : ""}${x.new_source ? tr(" (new source)") : ""}</div>
        ${(x.events || []).length ? `<div class="quiet">${tr("Events: {join}", {join: esc(x.events.join("; "))})}</div>` : ""}${x.people_ok.length ? `<div class="quiet">${tr("People: {join}", {join: esc(x.people_ok.join("; "))})}</div>` : ""}${x.reason ? `<div class="${x.action === "new" ? "warn-text" : "quiet"}">${esc(x.reason)}</div>` : ""}</div>
        <div class="quiet">${x.action === "new" ? tr("will be created") : tr("skipped")}</div></div>`).join("")}</div>
      <div class="quiet">${tr("The photos are uploaded as JPEG (at most 2000 pixels). In Immich each photo then gets the tag “Gramps/number”.")}</div>
      <div class="actions"><button class="primary" data-a="gr-write" ${fresh.length ? "" : "disabled"}>${tr("Write {n} {n:photo|photos} to Gramps", {n: fresh.length})}</button>
        <button data-a="gr-back">${tr("Back to selection")}</button>${cancelButton()}</div>`;
  }
  if (g.phase === "done") {
    const res = S.gs.result, photoList = g.keys.filter((k) => S.gw[k]);
    return `<h3>${tr("Done")}</h3><div class="box ${res && res.errors && res.errors.length ? "warn" : "ok"}">${res ? `${tr("{geschrieben} photos written to Gramps{b}.", {geschrieben: res.written, b: res.errors && res.errors.length ? `, <b>${tr("{n} {n:error|errors}", {n: res.errors.length})}</b>` : ""})}` : tr("Done.")}</div>
      ${photoList.map((k) => `<div class="row">${esc(S.gw[k].title || k)} → <b>${esc(S.gw[k].gid)}</b></div>`).join("")}
      <div class="quiet">${tr("Check in Gramps Web. With “Remove from Gramps” in the photo detail, each photo can be undone again.")}</div>
      <div class="actions">${cancelButton()}</div>`;
  }
  const selectable = g.keys.filter((k) => ready(k) && !S.gw[k]), notVal = g.keys.filter((k) => !ready(k) && !S.gw[k]).length;
  return `<h3>${tr("To Gramps ({n} {n:photo|photos})", {n: g.keys.length})}</h3>
    ${notVal ? `<div class="quiet">${tr("{nicht} {nicht:photo is|photos are} not confirmed yet or have no date and will not be transferred.", {nicht: notVal})}</div>` : ""}
    <div class="actions"><button class="small" data-a="gr-pick-all" ${selectable.length ? "" : "disabled"}>${tr("Select all")}</button><button class="small" data-a="gr-none">${tr("None")}</button>
      <span class="space"></span><span class="quiet">${tr("{size} selected", {size: g.tickSet.size})}</span></div>
    <div class="gr-list">${g.keys.map(line).join("")}</div>
    ${g.keys.some((k) => (S.ez[k] || []).length) ? `<label class="quiet"><input type="checkbox" data-gre ${g.events === false ? "" : "checked"}> ${tr("Also add the photos to the assigned events")}</label>` : ""}
    <div class="actions"><button class="primary" data-a="gr-preview" ${g.tickSet.size ? "" : "disabled"}>${tr("View preview ({size})", {size: g.tickSet.size})}</button>${cancelButton()}</div>`;
}
function drawWindow() {
  modal(dialogWin(), 920);
  const w = $("layer");
  w.onchange = (ev) => {
    const t = ev.target;
    if (t.dataset.grh) { t.checked ? G().tickSet.add(t.dataset.grh) : G().tickSet.delete(t.dataset.grh); drawWindow(); }
    else if (t.hasAttribute("data-gre")) { G().events = t.checked; drawWindow(); }
    else if (t.dataset.gra) { G().album[t.dataset.gra] = t.value; G().keys.forEach((k) => { if (provenanceOf(k).some((x) => x.albumId === t.value)) G().album[k] = t.value; }); drawWindow(); }
    else if (t.dataset.grt) { const k = t.dataset.grt, alt = G().title[k] || {text: ""}; G().title[k] = {kind: t.value, text: t.value === "eigen" ? alt.text : ""}; drawWindow(); }
  };
  w.oninput = (ev) => { const t = ev.target; if (t.dataset.grx) G().title[t.dataset.grx] = {kind: "eigen", text: t.value}; };
}
afterJobHooks.push((j) => {
  if (!G().open || j.name !== "gramps") return;
  const modeName = (j.args || [])[0];
  if (modeName === "undo") { closeIt(); G().open = false; toast(j.rc === 0 ? tr("Removed from Gramps.") : tr("Undo did not fully work. See the log under the gear icon.")); return; }
  G().phase = j.rc !== 0 ? "error" : modeName === "preview" ? "preview" : "done";
  drawWindow();
});

export const actions = {
  "gramps-open": (el) => grampsOeffnen((el.dataset.keys || "").split("|").filter(Boolean)),
  "gramps-album": (el) => { const a = S.albums.find((x) => x.id === el.dataset.id); if (a) grampsOeffnen(albumKeys(a)); },
  "gramps-remove": (el) => {
    const k = el.dataset.key, rec = S.gw[k];
    if (!rec) return;
    ask(tr("Remove from Gramps"), `${tr("The photo")} <b>${esc(rec.gid)}</b> ${tr("will be deleted in Gramps, as will its citation and the links to the people in this photo. A source that Grimmich created and that nobody else uses is also removed. The tag in Immich disappears. In Immich the photo stays unchanged.")}`,
      tr("Remove from Gramps"), async () => { Object.assign(G(), {open: true, keys: [k], phase: "pick"}); await startJob("gramps", ["undo", k]); drawWindow(); }, true);
  },
  "gr-to": () => { G().open = false; closeIt(); },
  "gr-back": () => { G().phase = "pick"; drawWindow(); },
  "gr-pick-all": () => { G().tickSet = new Set(G().keys.filter((k) => ready(k) && !S.gw[k])); drawWindow(); },
  "gr-none": () => { G().tickSet = new Set(); drawWindow(); },
  "gr-preview": async () => {
    const items = G().keys.filter((k) => G().tickSet.has(k)).map(itemFor);
    await send("/api/gramps_input", {items});
    G().phase = "check"; await startJob("gramps", ["preview"]); drawWindow();
  },
  "gr-write": async () => { G().phase = "writing"; await startJob("gramps", ["write"]); drawWindow(); },
};
// Small mark for tiles and detail
export const grampsMarke = (key) => (S.gw[key] ? `<span class="gr-mark" title="${tr("Already in Gramps")}">Gramps ${esc(S.gw[key].gid)}</span>` : "");
void draw;

// Section in the photo detail (right column)
export function grampsBereich(e, key) {
  const inside = S.gw[key];
  const keys = e.keys.map((k) => esc(k)).join("|");
  if (inside) return `<div><div class="field-name">Gramps</div><div class="row">${tr("In Gramps as")} <b>${esc(inside.gid)}</b> <button class="small" data-a="gramps-remove" data-key="${esc(key)}">${tr("Remove from Gramps")}</button></div></div>`;
  return `<div><div class="field-name">Gramps</div><div class="row">${e.type === "series" ? `${tr("Series of {n} {n:photo|photos}.", {n: e.keys.length})} ` : ""}<button class="small" data-a="gramps-open" data-keys="${keys}">${tr("To Gramps …")}</button></div></div>`;
}
