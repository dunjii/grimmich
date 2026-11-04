// Gear wheel: connections (Immich, Gramps), assign people, single steps and log.
import {S, ui, draw, saveAssign, mark} from "../state.js";
import {$, esc, fetchIt, send, toast} from "../util.js";
import {loadGrampsPeople, grCandidates, grStatus, GR_STATUS, grName, yearFromText} from "../gramps.js";
import {startJob} from "../job.js";
import {modal, closeIt} from "./dialog.js";
import {openCalibration} from "./calibration.js";
import {tr, language, languages} from "../language.js";

const connResult = {};
const point = (ok) => `<span class="dot ${ok === true ? "ok" : ok === false ? "no" : ""}"></span>`;
export function connectionOk() {
  const v = S.conn;
  return v ? {immich: !!(v.immich.url && v.immich.read), write: !!v.immich.write_access, gramps: !!(v.gramps.url && v.gramps.user && v.gramps.password)} : {immich: false, write: false, gramps: false};
}
function testRows(kindVal) {
  const z = connResult[kindVal];
  if (!z) return "";
  if (z === "laeuft") return '<div class="quiet">' + tr("Checking …") + '</div>';
  return `<div class="test-rows">${z.map((r) => `<div>${r.ok === true ? "✓" : r.ok === false ? "✗" : "•"} ${esc(r.text)}</div>`).join("")}</div>`;
}
const fieldName = (id, heading, val, opt) => `<label class="vf"><span>${heading}</span><input id="${id}" ${opt || ""} value="${esc(val || "")}"></label>`;
const keyVal = (id, heading, da) => fieldName(id, heading, "", `type="password" autocomplete="off" placeholder="${da ? tr("✓ saved (leave empty = keep)") : tr("paste here")}"`);

// Addresses of a service: the first row always, further ones collapsed, plus the choice “automatic” or by hand
function addressBlock(p, d, space, hintAuto) {
  const slots = d.addresses || [{name: "", url: d.url || ""}, {name: "", url: ""}, {name: "", url: ""}];
  const line = (n, nr, pf) => `<div class="adr"><input id="vb-${p}name${pf}" value="${esc(n.name || "")}" placeholder="${nr === 1 ? tr("Home network") : nr === 2 ? "Tailscale" : tr("Online")}" aria-label="${tr("Name of address {nr}", {nr: nr})}"><input id="vb-${p}url${pf}" value="${esc(n.url || "")}" placeholder="${nr === 1 ? space : "optional"}" aria-label="${tr("Address {nr}", {nr: nr})}"></div>`;
  const several = slots.filter((x) => x.url).length > 1, kindVal = p === "i" ? "immich" : "gramps";
  return `<div class="vf"><span>${tr("Address")}${several && d.used ? ` <span class="quiet">${tr("(connected via: {benutzt})", {benutzt: esc(d.used)})}</span>` : ""}</span>${line(slots[0], 1, "")}</div>
    <details class="expand" ${slots[1].url || slots[2].url ? "open" : ""}><summary>${tr("More addresses")} <span class="quiet">${tr("(e.g. Tailscale or online)")}</span></summary>
      ${line(slots[1], 2, "2")}${line(slots[2], 3, "3")}
      <label class="tick-box"><input type="checkbox" id="vb-${p}auto" data-a="vb-auto" data-kind="${kindVal}" ${d.auto ? "checked" : ""}><span>${tr("Automatically use the first reachable address")}</span></label>
      ${d.auto ? "" : `<label class="vf"><span>${tr("Connect via")}</span><select id="vb-${p}aktiv">${slots.map((x, k) => (x.url ? `<option value="${k + 1}" ${d.active === k + 1 ? "selected" : ""}>${esc(x.name || tr("Address {nr}", {nr: k + 1}))}</option>` : "")).join("")}</select></label>`}
      ${hintAuto ? `<div class="quiet" style="margin-top:4px">${hintAuto}</div>` : ""}
    </details>`;
}

export function openSettings() {
  const v = S.conn, i = v.immich, g = v.gramps, gs = v.gramps_write || {}, j = S.job, ok = connectionOk();
  modal(`<h3>${tr("Connections and settings")}</h3>
    <div class="v-columns">
      <div class="v-column"><h4>${point(ok.immich)} Immich</h4>
        ${addressBlock("i", i, "http://192.168.1.10:2283", tr("All addresses must lead to the same Immich."))}
        ${fieldName("vb-ialbum", tr("Working album (the scans are here)"), i.album, 'placeholder="Scan-Datierung"')}
        ${keyVal("vb-ilese", tr("Key for reading"), i.read)}
        ${fieldName("vb-ianker", tr("Anchor album (real digital photos, Grimmich only reads)"), i.anchor, `placeholder="${tr("optional, e.g. Anchor photos")}"`)}
        <label class="tick-box"><input type="checkbox" id="vb-iseparate" data-a="vb-separate" data-kind="immich" ${i.separate ? "checked" : ""}><span>${tr("Use a different key for writing")}</span></label>
        ${i.separate ? keyVal("vb-ischreib", tr("Key for writing"), i.write_stored) : ""}
        <div class="actions"><button class="primary small" data-a="vb-save" data-kind="immich">${tr("Save")}</button>
          <button class="small" data-a="vb-test" data-kind="immich" title="${tr("Checks the reading key and, if entered, the writing key")}">${tr("Test")}</button></div>
        <div id="vt-immich_lesen">${testRows("immich_lesen")}</div><div id="vt-immich_schreiben">${testRows("immich_schreiben")}</div></div>
      <div class="v-column"><h4>${tr("{gramps} Gramps Web", {gramps: point(ok.gramps)})}</h4>
        ${addressBlock("g", g, "http://192.168.1.10:8081", tr("Only turn on automatic if all addresses reach the same Gramps. A test copy and the real Gramps are not the same."))}
        ${fieldName("vb-guser", tr("User for reading (preferably a separate one with read permissions)"), g.user)}
        ${keyVal("vb-gpw", tr("Password"), g.password)}
        <div class="actions"><button class="primary small" data-a="vb-save" data-kind="gramps">${tr("Save")}</button><button class="small" data-a="vb-test" data-kind="gramps">${tr("Test")}</button>
          <button class="small" data-a="go-dialog">${tr("Assign people …")}</button></div>
        <div id="vt-gramps">${testRows("gramps")}</div>
        <label class="tick-box"><input type="checkbox" id="vb-gseparate" data-a="vb-separate" data-kind="gramps" ${gs.separate ? "checked" : ""}><span>${tr("Use a different user for writing")} <span class="quiet">${tr("(Editor role, for “To Gramps”)")}</span></span></label>
        <details class="expand" ${gs.separate && !gs.stored ? "open" : ""}><summary>${tr("{passwort} Write to Gramps", {passwort: point(!!(gs.password))})}</summary>
          ${gs.separate ? `${fieldName("vb-gsurl", tr("Address"), gs.url, 'placeholder="http://192.168.1.10:8081"')}
          ${fieldName("vb-gsuser", tr("User (e.g. grimmich-write)"), gs.user)}
          ${keyVal("vb-gspw", tr("Password"), gs.stored)}` : '<div class="quiet" style="margin:6px 0">' + tr("The same user as for reading is used. It needs the Editor role for this.") + '</div>'}
          <label class="tick-box"><input type="checkbox" id="vb-gcitation" ${gs.citation_image === false ? "" : "checked"}><span>${tr("Also add the photo as an image at the citation (“page, photo”). The source itself gets no image.")}</span></label>
          <div class="actions"><button class="primary small" data-a="vb-save" data-kind="gramps_schreiben">${tr("Save")}</button><button class="small" data-a="vb-test" data-kind="gramps_schreiben">${tr("Test")}</button></div>
          <div id="vt-gramps_schreiben">${testRows("gramps_schreiben")}</div></details>
        <div id="vt-probe">${testRows("probe")}</div></div></div>
    <div class="quiet">${tr("Keys and passwords are only stored on this computer and are never shown again.")}</div>
    <details class="expand"><summary data-a="pl-open">${tr("Game for several players")}</summary><div id="players-box">${pl ? playersHtml() : ""}</div></details>
    <details class="expand" ${j.rc !== null && j.rc !== 0 ? "open" : ""}><summary>${tr("Single steps and settings")}</summary>
      <div class="bar-strip"><span class="quiet">${tr("Language")}</span><select id="language-pick">${languages.map((l) => `<option value="${l.code}" ${language === l.code ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></div>
      <div class="bar-strip"><span class="quiet">${tr("Threshold for series matching – person")}</span><input type="number" id="sp" step="0.01" min="0.5" max="0.99" value="${ui.thresholdPerson}">
        <span class="quiet">${tr("Whole image")}</span><input type="number" id="sg" step="0.01" min="0.5" max="0.99" value="${ui.thresholdAll}"><span class="quiet">${tr("(lower = more, but less certain suggestions)")}</span></div>
      <div class="actions"><button class="small" data-a="only" data-s="names" ${j.running ? "disabled" : ""}>${tr("load names only")}</button><button class="small" data-a="only" data-s="state" ${j.running ? "disabled" : ""}>${tr("check changes in Immich only")}</button>
        <button class="small" data-a="only" data-s="estimate" ${j.running ? "disabled" : ""}>${tr("age estimate only")}</button><button class="small" data-a="only" data-s="series" ${j.running ? "disabled" : ""}>${tr("series matching only")}</button>
        <button class="small" data-a="only" data-s="provenance" ${j.running ? "disabled" : ""}>${tr("read albums only")}</button></div>
      <div class="actions"><button class="small" data-a="calibration" title="${tr("Shows how far off the AI is for your people. Changes nothing.")}">${tr("View AI calibration …")}</button>
        <button class="small" data-a="vb-probe" title="${tr("Fetches a sample person with events from Gramps and saves them in gramps_probe.json")}">${tr("Fetch Gramps sample")}</button></div></details>
    <details class="expand" ${j.rc !== null && j.rc !== 0 ? "open" : ""}><summary data-a="load-log">${tr("Log of the last run")}</summary><pre class="log" id="joblog">${esc((j.rows || []).join("\n"))}</pre></details>
    <div class="actions" style="margin-top:14px"><button id="f-to">${tr("Close")}</button><button data-a="help">${tr("Help")}</button><span class="space"></span><span class="quiet">Grimmich ${esc(S.version || "")}</span></div>`, 900);
  $("f-to").onclick = () => { ui.settings = false; closeIt(); };
  ui.settings = true;
}
const val = (id) => ($(id) ? $(id).value : "");
const addressFields = (p) => ({url: val(`vb-${p}url`), name: val(`vb-${p}name`), url2: val(`vb-${p}url2`), name2: val(`vb-${p}name2`), url3: val(`vb-${p}url3`), name3: val(`vb-${p}name3`),
  auto: $(`vb-${p}auto`) ? ($(`vb-${p}auto`).checked ? "1" : "0") : "", active: val(`vb-${p}aktiv`)});
const fieldsOf = (kindVal) => (kindVal === "gramps_schreiben" ? {url: val("vb-gsurl"), user: val("vb-gsuser"), password: val("vb-gspw"), citation_image: $("vb-gcitation") && !$("vb-gcitation").checked ? "0" : "1"} : kindVal === "gramps" ? {...addressFields("g"), user: val("vb-guser"), password: val("vb-gpw"), separate: $("vb-gseparate") && $("vb-gseparate").checked ? "1" : "0"} : {...addressFields("i"), album: val("vb-ialbum"), anchor: val("vb-ianker"), separate: $("vb-iseparate") && $("vb-iseparate").checked ? "1" : "0", read: val("vb-ilese"), write_access: val("vb-ischreib")});
async function saveConnection(kindVal) {
  const r = await send("/api/connection", {kind: kindVal, fields: fieldsOf(kindVal)});
  S.conn = await fetchIt("/api/connection");
  mark();
  return r;
}
const showTest = (kindVal, z) => { connResult[kindVal] = z; const el = $("vt-" + kindVal); if (el) el.innerHTML = testRows(kindVal); };


// ------------------------------------------------------------------ Game for several players: accounts and hidden people
let pl = null, plNote = null, plAsk = null;   // answer of /api/players, a new password to show once, an account waiting for "really remove?"
function playersHtml() {
  if (!pl) return `<div class="quiet">${tr("Checking …")}</div>`;
  const people = (S.pf && S.pf.ok ? S.pf.people : []).filter((p) => p.photos.length >= 1).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const rows = pl.players.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.blocked ? `<span class="tag warn">${tr("blocked")}</span>` : ""}</td><td class="pl-buttons">
      <button class="small" data-a="pl-reset" data-key="${esc(p.key)}">${tr("New password")}</button>
      <button class="small" data-a="pl-block" data-key="${esc(p.key)}" data-blocked="${p.blocked ? "0" : "1"}">${p.blocked ? tr("Unblock") : tr("Block")}</button>
      ${plAsk === p.key ? `<button class="small warn" data-a="pl-remove" data-key="${esc(p.key)}">${tr("Really remove")}</button><button class="small" data-a="pl-ask" data-key="">${tr("Cancel")}</button>` : `<button class="small" data-a="pl-ask" data-key="${esc(p.key)}">${tr("Remove")}</button>`}</td></tr>`).join("");
  return `<div class="quiet">${tr("Players sign in at the address /play/ with a name and a password. Only /play/ may be shared on the internet, never the whole address.")}</div>
    ${plNote ? `<div class="box pl-password"><b>${esc(plNote.name)}</b>: <code>${esc(plNote.password)}</code><div class="quiet">${tr("This password is shown only now. Pass it on in person.")}</div></div>` : ""}
    ${pl.players.length ? `<div class="table-frame"><table class="to-tab"><tbody>${rows}</tbody></table></div>` : `<div class="quiet">${tr("No players yet.")}</div>`}
    <div class="bar-strip"><input id="pl-name" maxlength="40" placeholder="${esc(tr("Name of the new player"))}" autocomplete="off"><button class="small primary" data-a="pl-add">${tr("Add player")}</button></div>
    <label class="tick-box"><input type="checkbox" data-a="pl-exclude" ${pl.exclude_on ? "checked" : ""}><span>${tr("Do not show photos of the chosen people in the game from outside")}${pl.exclude_on ? ` <span class="quiet">${tr("({n} {n:photo|photos} hidden)", {n: pl.hidden_count})}</span>` : ""}</span></label>
    ${pl.exclude_on ? `<div class="table-frame pl-people">${people.map((p) => `<label class="tick-box"><input type="checkbox" class="pl-person" data-a="pl-person" data-id="${esc(p.id)}" ${pl.excluded.includes(p.id) ? "checked" : ""}><span>${esc(p.name)}</span></label>`).join("") || `<div class="quiet">${tr("No people loaded yet.")}</div>`}</div>
      <div class="quiet">${tr("Faces that Immich does not recognise cannot be hidden this way.")}</div>` : ""}`;
}
const playersDraw = () => { const el = $("players-box"); if (el) el.innerHTML = playersHtml(); };
async function playersDo(data) {
  try {
    const r = await send("/api/players", data);
    if (!r.ok) { toast(r.error === "exists" ? tr("There is already a player with this name.") : r.error === "name" ? tr("Please enter a name.") : tr("That did not work.")); return; }
    pl = r; plNote = r.password ? {name: r.password_for, password: r.password} : null; plAsk = null;
  } catch (e) { toast(tr("The server did not respond.")); }
  playersDraw();
}
const playersLoad = async () => { try { pl = await fetchIt("/api/players"); playersDraw(); } catch (e) { toast(tr("The server did not respond.")); } };

// ------------------------------------------------------------------ Connect Immich people with Gramps
let toWork = {};
export async function openAssignment() {
  if (!S.grP) { const r = await loadGrampsPeople(false); if (!r.ok) { modal(`<h3>${tr("Gramps not reachable")}</h3><div class="error-text">${esc(r.text)}</div><div class="actions"><button id="f-to">${tr("Close")}</button></div>`); $("f-to").onclick = closeIt; return; } }
  toWork = {...S.assignMap};
  drawAssignment();
}
function drawAssignment() {
  const list = (S.pf && S.pf.ok ? S.pf.people : []).filter((p) => p.photos.length >= 1).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const lines = list.map((p) => {
    const k = grCandidates(p), st = grStatus(k), nowVal = toWork[p.id] || "";
    const opts = k.map((x) => `<option value="${esc(x.g.h)}" ${nowVal === x.g.h ? "selected" : ""}>${esc(grName(x.g))}${(x.g.born || []).length ? tr(" (also: {namen})", {namen: esc(x.g.born.join(", "))}) : ""} · *${x.gj || "?"} · ${esc(x.g.id)}</option>`).join("");
    const foreign = nowVal && !k.find((x) => x.g.h === nowVal) ? (() => { const g = S.grP.people.find((q) => q.h === nowVal); return g ? `<option value="${esc(g.h)}" selected>${esc(grName(g))} · ${esc(g.id)}</option>` : ""; })() : "";
    const gsel = nowVal ? S.grP.people.find((q) => q.h === nowVal) : null, gj = gsel ? yearFromText(gsel.birth) : null;
    const dev = gsel && p.birth !== null && gj !== null && Math.floor(p.birth) !== gj ? ` <span class="tag warn" title="${tr("Date of birth differs between Immich and Gramps. Gramps is used for the warnings.")}">Gramps *${gj}</span>` : "";
    return `<tr><td>${esc(p.name)} <span class="quiet">*${p.birth !== null ? Math.floor(p.birth) : "?"}</span>${dev}</td><td><span class="gst ${st}">${GR_STATUS[st]}</span></td>
      <td><select data-a="go-pick" data-pid="${esc(p.id)}"><option value="">${tr("– none –")}</option>${foreign}${opts}</select></td></tr>`;
  }).join("");
  modal(`<h3>${tr("Connect people with Gramps")}</h3>
    <div class="quiet" style="margin-bottom:8px">${tr("Left the people from Immich, right the matching person in Gramps. “certain” means: name and year of birth match. Gramps list as of: {stand}", {stand: esc(S.grP.state || "")})}</div>
    <div class="table-frame"><table class="to-tab"><thead><tr><th>Immich</th><th>${tr("Matches")}</th><th>Gramps</th></tr></thead><tbody>${lines}</tbody></table></div>
    <div class="actions" style="margin-top:14px"><button class="primary" data-a="go-save">${tr("Save")}</button><button data-a="go-certain">${tr("Enter certain matches")}</button>
      <button data-a="go-new">${tr("Reload Gramps list")}</button><button data-a="go-to">${tr("Close")}</button></div>`, 940);
}

export const actions = {
  "settings": () => openSettings(),
  "calibration": () => openCalibration(),
  "load-log": async () => { try { const j = await fetchIt("/api/job?all=1"), log = $("joblog"); if (log && j.rows) { log.textContent = j.rows.join("\n"); log.scrollTop = log.scrollHeight; } } catch (e) { /* the short log stays */ } },
  "go-dialog": () => openAssignment(),
  "go-pick": () => {},   // is handled via the change event
  "go-to": () => { closeIt(); draw(); },
  "go-certain": () => { (S.pf.people || []).forEach((p) => { if (!toWork[p.id]) { const k = grCandidates(p); if (grStatus(k) === "certain") toWork[p.id] = k[0].g.h; } }); drawAssignment(); },
  "go-new": async () => { const r = await loadGrampsPeople(true); if (r.ok) drawAssignment(); },
  "go-save": async () => {
    Object.keys(toWork).forEach((k) => { if (!toWork[k]) delete toWork[k]; });
    S.assignMap = {...toWork}; S.grEv = {}; await saveAssign(); closeIt(); draw();
  },
  "vb-save": async (el) => { const r = await saveConnection(el.dataset.kind); if (!r.ok) showTest(el.dataset.kind, [{ok: false, text: r.text || tr("That did not work.")}]); else openSettings(); },
  "vb-auto": async (el) => { await saveConnection(el.dataset.kind); openSettings(); },   // Schalter „automatisch“ bei den Adressen
  "vb-separate": async (el) => { await saveConnection(el.dataset.kind); openSettings(); },   // Schalter „anderen Zugang zum Schreiben“
  "vb-test": async (el) => {
    const kindVal = el.dataset.kind, basis = kindVal === "gramps" ? "gramps" : kindVal === "gramps_schreiben" ? "gramps_schreiben" : "immich";
    await saveConnection(basis);   // first save what is currently in the fields (empty key fields keep the old value)
    const iv = S.conn.immich, kindMap = kindVal === "immich" ? (iv.separate ? ["immich_lesen", ...(iv.write_access ? ["immich_schreiben"] : [])] : ["immich_schreiben"]) : [kindVal];
    for (const a of kindMap) {
      showTest(a, "laeuft");
      try { showTest(a, (await send("/api/connection_test", {kind: a})).rows); } catch (e) { showTest(a, [{ok: false, text: tr("The server did not respond.")}]); }
    }
  },
  "vb-probe": async () => {
    await saveConnection("gramps"); showTest("probe", "laeuft");
    try { const r = await send("/api/gramps_probe", {}); showTest("probe", [{ok: r.ok, text: r.text}]); } catch (e) { showTest("probe", [{ok: false, text: tr("The server did not respond.")}]); }
  },
  "pl-open": () => { plNote = null; plAsk = null; playersLoad(); },
  "pl-add": () => playersDo({op: "add", name: val("pl-name")}),
  "pl-reset": (el) => playersDo({op: "reset", key: el.dataset.key}),
  "pl-block": (el) => playersDo({op: "block", key: el.dataset.key, blocked: el.dataset.blocked === "1"}),
  "pl-ask": (el) => { plAsk = el.dataset.key || null; playersDraw(); },
  "pl-remove": (el) => playersDo({op: "remove", key: el.dataset.key}),
  "pl-exclude": (el) => playersDo({op: "exclude", on: el.checked, people: pl.excluded}),
  "pl-person": () => playersDo({op: "exclude", on: true, people: [...document.querySelectorAll(".pl-person:checked")].map((x) => x.dataset.id)}),
  "only": async (el) => {
    ui.thresholdPerson = parseFloat(val("sp")) || 0.72; ui.thresholdAll = parseFloat(val("sg")) || 0.80;
    closeIt(); ui.settings = false;
    await startJob(el.dataset.s, el.dataset.s === "series" ? [ui.thresholdPerson, ui.thresholdAll] : []);
  },
};
export function assignmentChosen(pid, val2) { toWork[pid] = val2; }
