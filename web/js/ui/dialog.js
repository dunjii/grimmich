// Windows above the interface: confirmation, date, year/anchor, marker, faces, large view.
import {S, ui, draw, saveCorr, saveOrd} from "../state.js";
import {$, esc, image, parseDate, dateValues, dateShort, cropStyle} from "../util.js";
import {setCorr, unitOf, unitFromKey, yearText, warnings, personTiles, personOf, ageList, lifeDates, shortName} from "../model.js";
import {sortLane, yearsMap, mirrorChanges, newAnchor, insertAnchor} from "../ordering.js";
import {tr} from "../language.js";

export function modal(html, widthPx) {
  $("layer").innerHTML = `<div class="cover"><div class="window" ${widthPx ? `style="width:min(${widthPx}px,100%)"` : ""}>${html}</div></div>`;
}
export const closeIt = () => { $("layer").innerHTML = ""; };

export function ask(heading, text, buttonEl, act, danger) {
  modal(`<h3>${esc(heading)}</h3><div>${text}</div>
    <div class="actions" style="margin-top:16px"><button class="${danger ? "danger" : "primary"}" id="f-yes">${esc(buttonEl)}</button><button id="f-no">${tr("Cancel")}</button></div>`);
  $("f-no").onclick = closeIt;
  $("f-yes").onclick = async () => { closeIt(); await act(); };
}

// ------------------------------------------------------------------ Date (day, month, year, range)
export function dateDialog(uids) {
  const units = uids.map(unitOf).filter(Boolean);
  if (!units.length) return;
  const e0 = units[0], keys = units.flatMap((u) => u.keys), dt = (e0.date || "").split("-");
  modal(`<h3>${tr("Date for {was} ({n} {n:photo|photos})", {was: units.length === 1 ? (units[0].type === "series" ? tr("Series {id}", {id: esc(units[0].s.id)}) : tr("Photo")) : tr("{n} units", {n: units.length}), n: keys.length})}</h3>
    <div class="quiet">${e0.estimate ? tr("Estimated: {text}", {text: esc(yearText({year: e0.estimate.year, from: e0.estimate.from, to: e0.estimate.to}))}) : tr("No estimate available.")}</div>
    <div class="field"><label>${tr("Type a date quickly")} <input type="text" id="d-text" placeholder="${tr("DDMMYYYY, e.g. 24121935")}" style="width:15em"></label></div>
    <div class="field"><label>${tr("Day")} <input type="number" id="d-day" min="1" max="31" value="${dt[2] ? parseInt(dt[2]) : ""}" placeholder="${tr("optional")}"></label>
      <label>${tr("Month")} <input type="number" id="d-month" min="1" max="12" value="${dt[1] ? parseInt(dt[1]) : ""}" placeholder="${tr("optional")}"></label>
      <label>${tr("Year")} <input type="number" id="d-year" value="${e0.year || ""}"></label></div>
    <div class="field quiet">${tr("Only the year is required. If day and month are known, enter them.")}</div>
    <div class="field"><label>${tr("Range from")} <input type="number" id="d-from" value="${e0.year && !e0.date && e0.from !== e0.year ? e0.from : ""}" placeholder="${tr("optional")}"></label>
      <label>${tr("to")} <input type="number" id="db" value="${e0.year && !e0.date && e0.to !== e0.year ? e0.to : ""}" placeholder="${tr("optional")}"></label></div>
    <div id="d-error" class="error-text"></div>
    <div class="actions"><button class="primary" id="doc">${tr("Save")}</button>
      ${units.some((u) => u.confirmedFlag || u.draftFlag) ? '<button id="d-reset">' + tr("Reset to estimate") + '</button>' : ""}<button id="d-to">${tr("Cancel")}</button></div>`);
  $("d-to").onclick = closeIt;
  $("d-text").oninput = () => { const d = parseDate($("d-text").value); if (d) { $("d-day").value = d.tag || ""; $("d-month").value = d.mon || ""; $("d-year").value = d.j; } };
  const problem = (t) => { $("d-error").textContent = t; };
  $("doc").onclick = async () => {
    const j = parseInt($("d-year").value), tag = parseInt($("d-day").value) || 0, mon = parseInt($("d-month").value) || 0;
    const w = dateValues({tag, mon, j});
    if (!j) return problem(tr("Please enter a year (for example 1963)."));
    if (tag && !mon) return problem(tr("For a day I also need the month."));
    if (w.errors) return problem(w.errors);
    let v = parseInt($("d-from").value) || j, b = parseInt($("db").value) || j;
    if (mon) v = b = j;
    if (v > b) [v, b] = [b, v];
    setCorr(keys, {year: j, decimal_year: w.decimal_year, from: v, to: b, source: "manual", own: true, ...(w.date ? {date: w.date} : {})});
    await saveCorr(); closeIt(); draw();
  };
  const r = $("d-reset");
  if (r) r.onclick = async () => { setCorr(keys, null); await saveCorr(); closeIt(); draw(); };
}

// ------------------------------------------------------------------ Enter a year as an anchor (in the row of the sort view)
export function anchorDialog(uid, suggestionVal, pid) {
  const p = personOf(pid || ui.personId);
  if (!p) return;
  const {laneVal} = sortLane(p, personTiles(p));
  const i = laneVal.findIndex((k) => k.uid === uid);
  if (i < 0) return;
  const k = laneVal[i];
  const priorVal = laneVal.slice(0, i).reverse().find((x) => x.e.year), afterVal = laneVal.slice(i + 1).find((x) => x.e.year), min = Math.ceil(p.birth);
  modal(`<h3>${tr("Enter year")}</h3>
    <div>${k.n > 1 ? tr("This photo (series of {n} {n:photo|photos}, the year applies to all) will be set to this year and counts as an anchor (confirmed).", {n: k.n}) : tr("This photo will be set to this year and counts as an anchor (confirmed).")}
      <div style="margin:12px 0"><input type="text" id="anchor-year" value="${suggestionVal}" placeholder="${tr("1975 or 24121975")}" style="width:10em;font-size:18px"> <span class="quiet" id="anchor-age"></span></div>
      <div class="quiet">${tr("Year or full date (DDMMYYYY). With a full date, exactly this date is written to Immich later.")}</div>
      <div id="anchor-warn" class="warn-text"></div></div>
    <div class="actions" style="margin-top:14px"><button class="primary" id="f-yes">${tr("Set")}</button><button id="f-no">${tr("Cancel")}</button></div>`);
  const inp = $("anchor-year");
  const checkIt = () => {
    const dw = dateValues(parseDate(inp.value)), j = dw.errors ? 0 : dw.decimal_year, w = [];
    $("anchor-age").textContent = j ? `${tr("({geburt} years old)", {geburt: Math.round(j - p.birth)})}` : "";
    if (j && priorVal && j < priorVal.e.year) w.push(`${tr("The photo before it in the row is from {jahr}.", {jahr: priorVal.e.year})}`);
    if (j && afterVal && j > afterVal.e.year) w.push(`${tr("The photo after it in the row is from {jahr}.", {jahr: afterVal.e.year})}`);
    $("anchor-warn").textContent = w.length ? w.join(" ") + tr(" The order then does not match the year. You can still set it.") : "";
  };
  inp.oninput = checkIt; checkIt(); inp.focus(); inp.select();
  const ok = async () => {
    const dw = dateValues(parseDate(inp.value));
    if (dw.errors) { $("anchor-warn").textContent = dw.errors; return; }
    if (dw.j < min) { $("anchor-warn").textContent = `${tr("The person was only born in {min}.", {min: min})}`; return; }
    closeIt();
    setCorr(k.e.keys, {year: dw.j, decimal_year: dw.decimal_year, from: dw.j, to: dw.j, source: "manual", own: true, ...(dw.date ? {date: dw.date} : {})});
    await saveCorr(); draw();
  };
  $("f-no").onclick = closeIt; $("f-yes").onclick = ok;
  inp.onkeydown = (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") closeIt(); };
}

// ------------------------------------------------------------------ Markers (anchor without photo, e.g. wedding 1975)
export function anchorDialog2(pid, pos, id) {
  const p = personOf(pid);
  if (!p) return;
  const tileList = personTiles(p), parts = sortLane(p, tileList).parts, alt = id ? S.ord._anchor[id] : null;
  if (id && !alt) return;
  const ti = alt ? parts.findIndex((t) => t.m && t.m.id === id) : pos;
  const yearFrom = (t) => (t.m ? t.m.year : (t.k.e.confirmedFlag ? t.k.e.year : null));
  let priorVal = null, afterVal = null;
  for (let n = ti - 1; n >= 0 && priorVal === null; n--) priorVal = yearFrom(parts[n]);
  for (let n = alt ? ti + 1 : ti; n < parts.length && afterVal === null; n++) afterVal = yearFrom(parts[n]);
  const min = Math.ceil(p.birth);
  const start = alt ? (alt.date ? dateShort(alt.date) : alt.year) : (priorVal && afterVal ? Math.round((priorVal + afterVal) / 2) : (priorVal || afterVal || ""));
  modal(`<h3>${alt ? tr("Change anchor") : tr("Insert anchor")}</h3>
    <div>${tr("An anchor without a photo is a fixed point in time (e.g. wedding, first day of school). The photos before and after are aligned to it. It is never written to Immich.")}
      <div style="margin:12px 0"><input type="text" id="mk-year" value="${start}" placeholder="${tr("1975 or 24121975")}" style="width:10em;font-size:18px"> <span class="quiet" id="mk-age"></span></div>
      <div style="margin:8px 0"><input type="text" id="mk-text" value="${esc(alt ? alt.text : "")}" placeholder="${tr("Keyword (optional), e.g. wedding")}" style="width:100%"></div>
      <div id="mk-warn" class="warn-text"></div></div>
    <div class="actions" style="margin-top:14px"><button class="primary" id="f-yes">${alt ? tr("Save") : tr("Insert anchor")}</button><button id="f-no">${tr("Cancel")}</button>${alt ? '<button class="danger" id="f-del">' + tr("Delete anchor") + '</button>' : ""}</div>`);
  const inp = $("mk-year");
  const checkIt = () => {
    const dw = dateValues(parseDate(inp.value)), j = dw.errors ? 0 : dw.decimal_year, w = [];
    $("mk-age").textContent = j ? `${tr("({geburt} years old)", {geburt: Math.round(j - p.birth)})}` : "";
    if (j && priorVal && j < priorVal) w.push(`${tr("Before it in the row there is a fixed year {vor}.", {vor: priorVal})}`);
    if (j && afterVal && j > afterVal) w.push(`${tr("After it in the row there is a fixed year {nach}.", {nach: afterVal})}`);
    $("mk-warn").textContent = w.length ? w.join(" ") + tr(" The order then does not match the year. You can still save.") : "";
  };
  inp.oninput = checkIt; checkIt(); inp.focus(); inp.select();
  const ok = async () => {
    const dw = dateValues(parseDate(inp.value));
    if (dw.errors) { $("mk-warn").textContent = dw.errors; return; }
    if (dw.j < min) { $("mk-warn").textContent = `${tr("The person was only born in {min}.", {min: min})}`; return; }
    const text = $("mk-text").value.trim(), previous = yearsMap(p, tileList);
    closeIt();
    if (alt) { if (alt.decimal_year !== dw.decimal_year) alt.imprecise = false; Object.assign(alt, {year: dw.j, decimal_year: dw.decimal_year, date: dw.date, text}); }
    else insertAnchor(p, newAnchor({year: dw.j, decimal_year: dw.decimal_year, date: dw.date, text}), ti);
    mirrorChanges(p, previous);
    await saveOrd(); draw();
  };
  $("f-no").onclick = closeIt; $("f-yes").onclick = ok;
  if (alt) $("f-del").onclick = () => deleteAnchor(pid, id);
  const keyPress = (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") closeIt(); };
  inp.onkeydown = keyPress; $("mk-text").onkeydown = keyPress;
}
export function deleteAnchor(pid, id) {
  const p = personOf(pid), m = S.ord._anchor[id];
  if (!p || !m) return;
  ask(tr("Delete anchor"), `${tr("Delete anchor <b>{was}</b> of {name}? The photos stay, only this fixed point in time is dropped.", {was: (m.date ? dateShort(m.date) : m.year) + (m.text ? " · " + esc(m.text) : ""), name: esc(p.name)})}`, tr("Delete"), async () => {
    const previous = yearsMap(p, personTiles(p));
    delete S.ord._anchor[id];
    S.ord[p.id] = (S.ord[p.id] || []).filter((t) => t !== "@m:" + id);
    mirrorChanges(p, previous);
    await saveOrd(); draw();
  }, true);
}

// ------------------------------------------------------------------ Check faces: who is on the photo according to Immich, and does the age fit?
export function facesDialog(uid, key) {
  const e = unitOf(uid);
  if (!e) return;
  const k = key || e.keys[0], w = warnings(e);
  const faces = ((S.pf && S.pf.ok) ? S.pf.people : []).map((p) => ({p, f: p.photos.find((x) => x.key === k)})).filter((x) => x.f);
  const ageValue = ageList(k, e.decimal_year || e.year);
  modal(`<h3>${tr("Check faces")}</h3>
    <div class="quiet">${tr("Photo {k}{e}. If the face does not match the name, correct the assignment in Immich and then click “Refresh” in Grimmich.", {k: esc(k), e: e.year ? ` ${tr("· dating {e}", {e: esc(yearText(e))})}` : ""})}</div>
    <div class="faces">${faces.map(({p, f}) => {
      const a = ageValue.find((x) => x.name === p.name) || {}, L = lifeDates(p.name);
      const wp = w.filter((x) => x.name === p.name);
      return `<div class="face ${wp.length ? "warn" : ""}"><div class="g-image" style="${cropStyle(k, f.box, 110)}"></div>
        <div><b>${esc(shortName(p.name))}</b><div class="quiet">${L.born ? tr("born {datum}", {datum: esc(L.born.text)}) : tr("no date of birth")}${L.death ? tr(", died {datum}", {datum: esc(L.death.text)}) : ""}</div>
        <div>${a.ki !== null && a.ki !== undefined ? `${tr("AI estimates {ki} y", {ki: a.ki})}` : tr("no AI estimate")}${a.currentVal !== null && a.currentVal !== undefined ? ` ${tr("· according to dating {J}", {J: a.currentVal < 0 ? tr("not born yet") : tr("{n} y", {n: a.currentVal})})}` : ""}</div>
        ${wp.length ? `<div class="warn-text">${esc(wp[0].type)}</div>` : ""}
        <button class="small" data-a="person-open" data-pid="${esc(p.id)}">${tr("Open timeline")}</button></div></div>`;
    }).join("") || '<div class="quiet" style="margin:12px 0">' + tr("No named faces were recognized in this photo.") + '</div>'}</div>
    <div class="image-full"><img src="${image(k)}" alt=""></div>
    <div class="actions"><button id="f-to">${tr("Close")}</button></div>`, 760);
  $("f-to").onclick = closeIt;
}

// ------------------------------------------------------------------ Large view
// Large view. rows = [{name, keys}]: the sequences that can be paged through (series, album, view …); active is rows[r].
// ←/→ page in the active row, ↑/↓ switch the row.
export function lightbox(keys, start, laneList, r0) {
  let R = laneList && laneList.length ? laneList : [{name: "", keys}], r = r0 || 0, ks = R[r].keys, i = Math.max(0, start);
  const el = document.createElement("div"); el.className = "lightbox";
  const switchTo = (n) => {
    if (n < 0 || n >= R.length || n === r) return;
    const k = ks[i], eu = unitFromKey(k); r = n; ks = R[r].keys;
    let j = ks.indexOf(k);
    if (j < 0 && eu) j = ks.findIndex((x) => (unitFromKey(x) || {}).uid === eu.uid);   // photo missing in the row: take the photo of the same series
    i = Math.max(0, j); show();
  };
  const show = () => {
    const chips = R.length > 1 ? `<div class="l-lanes">${R.map((x, n) => `<button class="l-chip ${n === r ? "on" : ""}" data-r="${n}">${esc(x.name)} <span>${x.keys.length}</span></button>`).join("")}</div>` : (R[0].name ? `<div class="l-lanes"><span class="l-chip on">${esc(R[0].name)} <span>${ks.length}</span></span></div>` : "");
    el.innerHTML = `<button class="closed small">${tr("Close (Esc)")}</button>${chips}
      ${ks.length > 1 ? '<button class="arrow" style="left:16px">‹</button><button class="arrow" style="right:16px">›</button>' : ""}
      <img src="${image(ks[i])}" alt=""><div class="bottom">${esc(ks[i])}${(S.people[ks[i]] || []).length ? " · " + esc(S.people[ks[i]].join(", ")) : ""} · <b>${tr("{i} of {n}", {i: i + 1, n: ks.length})}</b>${R[r].name ? " " + tr("in {name}", {name: esc(R[r].name)}) : ""}</div>
      <div class="l-help">${R.length > 1 ? tr("← → browse · ↑ ↓ other row · Esc close") : tr("← → browse · Esc close")}</div>`;
    el.querySelector(".closed").onclick = end;
    el.querySelectorAll(".l-chip[data-r]").forEach((c) => { c.onclick = () => switchTo(+c.dataset.r); });
    const p = el.querySelectorAll(".arrow");
    if (p.length) { p[0].onclick = () => { i = (i - 1 + ks.length) % ks.length; show(); }; p[1].onclick = () => { i = (i + 1) % ks.length; show(); }; }
  };
  const keyPress = (e) => {
    if (e.key === "Escape") end();
    if (ks.length > 1 && e.key === "ArrowLeft") { i = (i - 1 + ks.length) % ks.length; show(); }
    if (ks.length > 1 && e.key === "ArrowRight") { i = (i + 1) % ks.length; show(); }
    if (e.key === "ArrowUp") { e.preventDefault(); switchTo(r - 1); }
    if (e.key === "ArrowDown") { e.preventDefault(); switchTo(r + 1); }
  };
  const end = () => { document.removeEventListener("keydown", keyPress); el.remove(); };
  el.addEventListener("click", (e) => { if (e.target === el) end(); });
  let lock = 0;
  el.addEventListener("wheel", (e) => {
    if (ks.length < 2) return;
    e.preventDefault();
    if (Date.now() - lock < 180) return;
    lock = Date.now();
    i = (i + (e.deltaY > 0 ? 1 : -1) + ks.length) % ks.length; show();
  }, {passive: false});
  document.addEventListener("keydown", keyPress);
  show(); document.body.appendChild(el);
}
