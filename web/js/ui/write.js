// Review changes and write to Immich: guided in three steps (preview, test with 3 photos, write all).
import {S, ui, draw, saveCorr, savePlaces, mark, writtenNames} from "../state.js";
import {esc, image} from "../util.js";
import {unitList, warnCount, unitFromKey} from "../model.js";
import {saveAdoption, loadCsv, onlyConfirmedFlag, setOnlyConfirmed, adoptionRows, writeRows, writeWhat, setWhat, writeAlbum, setWriteAlbum, writeSig, withWarning, setWithWarning} from "../review.js";
import {startJob} from "../job.js";
import {ask} from "./dialog.js";
import {tr} from "../language.js";

export function writeHtml() {
  const sv = S.sv, ss = S.ss, z = sv && sv.counters, j = S.job, writeRunning = j.running && j.name === "write";
  const nWarn = warnCount(unitList().list), f = ui.writeFilter, testDone = ss.written > 0;
  const steps = [
    {nr: 1, title: tr("Preview"), kind: sv ? "done" : "now", text: sv ? tr("Done. Grimmich checked in Immich what would change. Nothing has been written yet.") : tr("Grimmich checks in Immich what would change. This changes nothing.")},
    {nr: 2, title: tr("Test with 3 photos"), kind: !sv ? "waiting" : testDone ? "done" : "now", text: testDone ? `${tr("Done. {geschrieben} photos have been written. You can see them in Immich and undo everything.", {geschrieben: ss.written})}` : tr("Next. Afterwards you can see the three photos in Immich and undo them.")},
    {nr: 3, title: tr("Write all"), kind: testDone && sv ? "now" : "waiting", text: tr("Becomes available once the test is through. Before that, each original is saved in a backup file.")},
  ];
  const ACTION_TEXT = {write: tr("is being written"), skip: tr("skipped"), unchanged: tr("already up to date")};
  let tilesHtml = "";
  if (sv) {
    const visible = sv.rows.filter((r) => f === "all" || r.action === f), n = 24 * (1 + (ui.more || 0));
    tilesHtml = `<div class="chips">${[["skip", tr("Needs a look"), z.skipped, true], ["write", tr("Would be written"), z.write], ["unchanged", tr("Already up to date"), z.unchanged], ["all", tr("All"), sv.rows.length]]
      .map(([id, t, c, warn]) => `<button class="chip ${f === id ? "on" : ""} ${warn && c ? "warn" : ""}" data-a="write-filter" data-f="${id}">${t} (${c})</button>`).join("")}
      <span class="space"></span><span class="quiet">${tr("Clicking a picture opens the full view")}</span></div>
      <div class="grid write">${visible.slice(0, n).map((r) => `<div class="tile ${r.action === "skip" ? "warn" : ""}"><div class="image" data-a="enlarge" data-key="${esc(r.key)}"><img loading="lazy" src="${image(r.key)}" alt="" onerror="this.style.display='none'"></div>
        <div class="info"><div class="person">${r.new_date ? esc(r.new_date) : `${tr("Date stays {alt_datum}", {alt_datum: esc(r.old_date || "")})}`}</div>
        ${r.new_date && r.old_date && r.new_date !== r.old_date ? `<div class="quiet">${tr("before {alt_datum}", {alt_datum: esc(r.old_date)})}</div>` : ""}
        <div class="${r.action === "skip" ? "warn-text" : "quiet"}">${esc(r.reason || ACTION_TEXT[r.action] || r.action)}</div>
        ${r.confirm ? `<div><button class="small danger" data-a="sv-overwrite" data-key="${esc(r.key)}">${tr("Overwrite my Immich date")}</button></div>` : ""}
        ${r.new_note ? `<div class="quiet" style="word-break:break-word">${tr("Description: {neue_notiz}", {neue_notiz: esc(r.new_note)})}</div>` : ""}
        ${r.new_place ? `<div class="quiet">${tr("Place: {ort_name} ({toFixed}, {toFixed2})", {ort_name: esc(r.place_name || ""), toFixed: r.new_place[0].toFixed(4), toFixed2: r.new_place[1].toFixed(4)})}</div>` : ""}
        ${r.place_confirm ? `<div class="warn-text">${esc(r.place_reason)}</div><div><button class="small danger" data-a="sv-place-overwrite" data-key="${esc(r.key)}">${tr("Overwrite place in Immich")}</button></div>` : ""}
        ${r.tags_add.length ? `<div class="quiet">${esc(r.tags_add.map((t) => tr("Tag: ") + t).join(", "))}</div>` : ""}</div></div>`).join("") || '<div class="empty">' + tr("Nothing in this group.") + '</div>'}</div>
      ${visible.length > n ? `<div><button class="small" data-a="write-more">${tr("Show more ({n} more)", {n: visible.length - n})}</button></div>` : ""}`;
  }
  return `<div class="page-head"><b style="font-family:var(--serif,Georgia,serif);font-size:20px">${tr("Changes to Immich")}</b><span class="space"></span><button data-a="back">${tr("Back to work")}</button></div>
    <div class="write-page">
    <div class="steps slim">${steps.map((s) => `<span class="step ${s.kind}" title="${esc(s.text)}"><span class="nr">${s.kind === "done" ? "✓" : s.nr}</span><b>${s.title}</b></span>`).join('<span class="stroke"></span>')}</div>
    ${nWarn ? `<div class="box warn"><b>${tr("{nWarn} photo(s) with warning.", {nWarn: nWarn})}</b> ${tr("The date is before the birth or after the death of a person in the photo. Check them before writing.")} <button class="small" data-a="go-task" data-task="warnings">${tr("Show")}</button></div>` : ""}
    <div class="card"><div style="flex:1 1 380px"><div class="large2">${sv ? `${tr("Preview ready: {schreiben} photos would be affected", {schreiben: z.write})}` : tr("No preview yet")}</div>
      <div class="quiet">${sv ? `${tr("{mit_datum} get a date and the tag “{tag_estimated}”, {offen} the tag “{tag_open}”{bleiben}. Each original is backed up beforehand. {uebersprungen} photo(s) are skipped, {unveraendert} are already up to date{GPS}{ersetzt}{werden}. As of {zeit}.", {mit_datum: z.with_date, offen: z.open, ...writtenNames(), bleiben: z.only_source_place ? `${tr(", for {nur_quelle_ort} only the source or place is written (date and tags stay)", {nur_quelle_ort: z.only_source_place})}` : "", uebersprungen: z.skipped, unveraendert: z.unchanged, GPS: z.places ? tr(". {orte} get a place (GPS)", {orte: z.places}) : "", ersetzt: z.places_confirm ? `${tr(", for {orte_bestaetigen} Immich already has a different place (replaced only with your confirmation)", {orte_bestaetigen: z.places_confirm})}` : "", werden: z.errors ? `${tr(", {fehler} could not be read", {fehler: z.errors})}` : "", zeit: esc(sv.time)})}` : tr("The preview only reads from Immich and shows what would happen.")}</div>
      ${writeRunning ? `<div class="quiet" id="jobstatus">${tr("Running … {slice}", {slice: esc((j.rows || []).slice(-1)[0] || "")})}</div>` : ""}
      ${optionsBlock(sv)}</div>
      <div class="actions"><button class="${sv ? "" : "primary"}" data-a="sv-create" ${j.running ? "disabled" : ""}>${sv ? tr("Recreate preview") : tr("Create preview")}</button>
        ${sv ? `<button class="${testDone ? "" : "primary"}" data-a="sv-test" ${j.running || !z.write || !ss.key_set ? "disabled" : ""}>${tr("Write test with 3 photos")}</button>
        <button class="${testDone ? "primary" : ""}" data-a="sv-all" ${j.running || !z.write || !ss.key_set || !testDone ? "disabled" : ""} title="${testDone ? "" : tr("Do the test with 3 photos first")}">${tr("Write all {schreiben}", {schreiben: z.write})}</button>` : ""}</div></div>
    ${!ss.key_set && sv ? `<div class="box warn"><b>${tr("A write access is missing.")}</b> <button class="small" data-a="settings">${tr("Open settings")}</button></div>` : ""}
    ${!writeRunning && j.name === "write" && j.rc !== null && j.rc !== 0 ? `<div class="box warn">${tr("The script ended with an error.")}<pre class="log">${esc((j.rows || []).slice(-12).join("\n"))}</pre></div>` : ""}
    ${tilesHtml}
    <div class="foot"><span class="quiet">${ss.result ? `${tr("Last write: {zeit}, {geschrieben} photos{b}", {zeit: esc(ss.result.time), geschrieben: ss.result.written, b: ss.result.errors && ss.result.errors.length ? `, <b>${tr("{n} {n:error|errors}", {n: ss.result.errors.length})}</b>` : ""})}` : tr("Nothing written yet.")}</span>
      <span class="space"></span>
      ${ss.written ? `<button class="danger" data-a="sv-back" ${j.running ? "disabled" : ""}>${tr("Undo everything")}</button>` : ""}
      <button data-a="csv">${tr("Download as table (CSV)")}</button></div></div>`;
}

// “What should be written?”: scope (all photos or one album), confirmed only, and the content (date and tags, source, place)
function optionsBlock(sv) {
  const onValue = onlyConfirmedFlag(), zl = adoptionRows().filter((r) => r.asset), fixed = zl.filter((r) => r.fixed).length, what = writeWhat(), alb = writeAlbum();
  const alt = sv && ui.svSig !== undefined && ui.svSig !== writeSig();
  const n = writeRows().length, nw = zl.filter((r) => r.warn).length;
  const box = (fieldName, text, heading) => `<label title="${esc(heading)}" style="margin-right:14px;white-space:nowrap"><input type="checkbox" data-a="sv-what" data-field="${fieldName}" ${what[fieldName] ? "checked" : ""}> ${text}</label>`;
  return `<div class="options" style="margin-top:12px;border-top:1px solid var(--rand);padding-top:10px">
    <div><b>${tr("What should be written?")}</b></div>
    <div class="quiet" style="margin-top:6px">${tr("Scope:")}
      <select data-a="sv-album"><option value="">${tr("All photos")}</option>${S.albums.map((a) => `<option value="${esc(a.id)}" ${a.id === alb ? "selected" : ""}>${esc(a.name)} (${a.keys.length})</option>`).join("")}</select></div>
    <label class="quiet" style="display:block;margin-top:6px"><input type="checkbox" data-a="sv-only-confirmed" ${onValue ? "checked" : ""}> <b>${tr("Confirmed photos only.")}</b> ${tr("Drafts, estimates and open photos stay untouched in Immich ({fest} of {n} {n:photo is|photos are} confirmed or set in Immich).", {fest: fixed, n: zl.length})}</label>
    <div class="quiet" style="margin-top:6px">${tr("Content:")} ${box("date", tr("Date and tags"), tr("Capture date, “{tag_estimated}” / “{tag_open}” and the description block", writtenNames()))}${box("quelle", tr("Source (album, page, photo)"), tr("Never written for digital photos"))}${box("ort", tr("Place (GPS)"), tr("Coordinates of the chosen Gramps place"))}</div>
    ${nw ? `<label class="quiet" style="display:block;margin-top:6px"><input type="checkbox" data-a="sv-warn" ${withWarning() ? "checked" : ""}> ${tr("Also write photos with a warning ({nw} {nw:photo|photos}: date does not match birth or death). Without the tick they stay untouched.", {nw: nw})}</label>` : ""}
    <div class="quiet" style="margin-top:6px"><b>${n}</b> ${tr("{n:photo goes|photos go} into the preview with these settings.", {n: n})}</div>
    ${alt ? '<div class="quiet" style="color:var(--warn)">' + tr("The setting has changed. Please recreate the preview.") + '</div>' : ""}</div>`;
}
export const actions = {
  "sv-only-confirmed": (el) => { setOnlyConfirmed(el.checked); draw(); },
  "sv-what": (el) => { setWhat(el.dataset.field, el.checked); draw(); },
  "sv-warn": (el) => { setWithWarning(el.checked); draw(); },
  "sv-album": (el) => { setWriteAlbum(el.value); draw(); },
  "sv-create": async () => { ui.svSig = writeSig(); await saveAdoption(); await startJob("write", ["preview"]); },
  "sv-test": () => writeAsk("test"),
  "sv-all": () => writeAsk("all"),
  "sv-back": () => ask(tr("Undo everything"), tr("All photos that Grimmich changed ({n}) get their original date and original description back. The tags “{tag_estimated}” and “{tag_open}” are removed.", {n: `<b>${S.ss.written}</b>`, ...writtenNames()}),
    tr("Undo"), () => startJob("write", ["undo"]), true),
  "sv-overwrite": (el) => {
    const e = unitFromKey(el.dataset.key);
    if (!e) return;
    ask(tr("Overwrite date in Immich"), `${tr("In Immich you set the date {alt}. It is to be replaced by {neu}.", {alt: `<b>${esc(e.immichDate)}</b>`, neu: `<b>${esc(e.date || String(e.year))}</b>`})}<br>${tr("The original is backed up beforehand, and “Undo everything” restores it.")}`, tr("Allow overwriting"), async () => {
      e.keys.forEach((k) => { S.corr[k] = {...(S.corr[k] || {}), overwrite: true}; });
      mark(); await saveCorr(); await saveAdoption(); await startJob("write", ["preview"]);
    }, true);
  },
  "sv-place-overwrite": (el) => {
    const o = S.places[el.dataset.key];
    if (!o) return;
    ask(tr("Overwrite place in Immich"), `${tr("Immich already has a place for this photo. It is to be replaced by {ort}.", {ort: `<b>${esc(o.name)}</b>`})}<br>${tr("The original is backed up beforehand, and “Undo everything” restores the old place.")}`, tr("Allow overwriting"), async () => {
      S.places[el.dataset.key] = {...o, force: true};
      await savePlaces(); await saveAdoption(); await startJob("write", ["preview"]);
    }, true);
  },
  "write-filter": (el) => { ui.writeFilter = el.dataset.f; ui.more = 0; draw(); },
  "write-more": () => { ui.more = (ui.more || 0) + 1; draw(); },
  "csv": () => loadCsv(),
};
function writeAsk(modeName) {
  const z = S.sv.counters.write, test = modeName === "test", n = test ? Math.min(3, z) : z;
  ask(test ? tr("Test with 3 photos") : tr("Write all photos"),
    `${tr("{n:The photo is|The photos are} now being changed in Immich ({b}; date, description, tags).", {n: n, b: `<b>${tr("{n} {n:photo|photos}", {n: n})}</b>`})}<br>${tr("The original values are backed up beforehand, and you can undo everything.")}`,
    tr("Write {n} {n:photo|photos}", {n: n}),
    async () => { await saveAdoption(); await startJob("write", test ? ["write", "3"] : ["write"]); });
}
