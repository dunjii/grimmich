// Series: check photos that belong together (same occasion), merge, dissolve.
import {S, ui, draw, saveWork, saveCorr} from "../state.js";
import {esc, image} from "../util.js";
import {modal, closeIt} from "./dialog.js";
import {hintText, addTo, mergeUnits, removeIt, dissolve, newSeries, unitOf, yearText, yearShort, statusLabel, peopleText, hintKind, notInAlbum} from "../model.js";
import {tr} from "../language.js";

function yearSlider(e) {
  if (!e.year) return '<span class="tag">' + tr("no estimate") + '</span>';
  const sp = !e.date && !e.draftFlag && e.from !== e.to ? `${e.from}–${e.to}` : "";
  return `<span class="jr"><button class="small" data-a="year-minus" data-uid="${esc(e.uid)}" title="${tr("one year earlier")}">▼</button>
    <b class="${e.draftFlag ? "draft" : e.confirmedFlag ? "ok" : ""}" title="${esc(yearText(e))} · ${esc(statusLabel(e))}">${esc(yearShort(e))}</b>
    <button class="small" data-a="year-plus" data-uid="${esc(e.uid)}" title="${tr("one year later")}">▲</button></span>
    ${sp ? `<span class="quiet" title="${tr("Possible range of the estimate")}">${sp}</span>` : ""}${e.draftFlag ? `<button class="small" data-a="draft-remove" data-uid="${esc(e.uid)}">${tr("↺ discard")}</button>` : ""}`;
}
const mini = (k, buttonEl, extra) => `<div class="mini ${extra || ""} ${notInAlbum(k) ? "removed" : ""}"${notInAlbum(k) ? ` title="${tr("This photo is no longer in the working or anchor album. It will not be written. With Remove you take it out of the series.")}"` : ""}><div class="image" data-a="enlarge" data-key="${esc(k)}"><img loading="lazy" src="${image(k)}" alt="" onerror="this.style.display='none'"></div>
  <div class="info">${notInAlbum(k) ? '<span class="remove-tag">' + tr("no longer in the album") + '</span>' : ""}<div class="person">${esc(peopleText(k) || k)}</div>${buttonEl}</div></div>`;

function seriesBox(e) {
  const s = e.s, kindVal = hintKind(e.hint), vn = (s.suggested_new || []).filter((k) => S.photos[k]);
  const hintVal = e.hint ? `<span class="tag ${kindVal}">${esc(hintText(e.hint))}</span>` : "";
  return `<section data-gruppe class="series-box ${s.status === "ok" ? "ok" : ""} ${ui.focusKey === e.uid ? "focus" : ""} ${ui.sel.has(e.uid) ? "marked" : ""}" data-sid="${esc(s.id)}" data-uid="${esc(e.uid)}">
    <div class="series-head">
      <span class="shaken ${ui.sel.has(e.uid) ? "on" : ""}" data-a="select" data-uid="${esc(e.uid)}" title="${tr("Select for merging (with more series or photos)")}">${ui.sel.has(e.uid) ? "✓" : ""}</span>
      <b>${tr("Series {id}", {id: esc(s.id)})}</b><span class="quiet">${tr("{n} {n:photo|photos}", {n: s.photos.length})}${s.photos.some(notInAlbum) ? " " + tr("({n} no longer in the album)", {n: s.photos.filter(notInAlbum).length}) : ""}</span>
      ${s.source === "manual" ? '<span class="tag info">' + tr("by hand") + '</span>' : `<span class="quiet">${tr("Similarity {wert}", {wert: Number(s.cohesion).toFixed(2)})}</span>`}
      <span class="year-row">${yearSlider(e)}</span>${hintVal}
      ${s.description || (ui.note && ui.note[s.id]) ? `<input type="text" class="describe" data-a="describe" data-sid="${esc(s.id)}" placeholder="${tr("Description / note")}" value="${esc(s.description || "")}">` : `<button class="small" data-a="note-show" data-sid="${esc(s.id)}">${tr("+ Note")}</button>`}
      <span class="space"></span>
      <button class="small good ${s.status === "ok" ? "on" : ""}" data-a="ok-series" data-sid="${esc(s.id)}">${s.status === "ok" ? tr("✓ Series confirmed") : tr("✓ Series is correct")}</button>
      <button class="small" data-a="date" data-uid="${esc(e.uid)}">${e.year ? tr("✎ Date") : tr("Date …")}</button>
      <button class="small" data-a="s-plus" data-sid="${esc(s.id)}">${tr("+ Add photos")}</button>
      <button class="small danger" data-a="dissolve" data-sid="${esc(s.id)}">${tr("Dissolve")}</button></div>
    <div class="minis">${s.photos.map((k) => mini(k, `<button class="small danger" data-a="remove" data-sid="${esc(s.id)}" data-key="${esc(k)}">${tr("Remove")}</button>`)).join("")}</div>
    ${vn.length ? `<div class="suggestion"><h4>${tr("Suggestion: {n} {n:new photo probably belongs|new photos probably belong} here", {n: vn.length})}
        <button class="small good" data-a="vn-all-yes" data-sid="${esc(s.id)}">${tr("Accept all")}</button><button class="small danger" data-a="vn-all-no" data-sid="${esc(s.id)}">${tr("Reject all")}</button></h4>
      <div class="minis">${vn.map((k) => mini(k, `<button class="small good" data-a="vn-yes" data-sid="${esc(s.id)}" data-key="${esc(k)}">${tr("✓ Add")}</button>
        <button class="small danger" data-a="vn-no" data-sid="${esc(s.id)}" data-key="${esc(k)}">${tr("✗ No")}</button>`, "suggestion")).join("")}</div></div>` : ""}</section>`;
}

// units: the units from which the series are shown
export function seriesView(unitsList) {
  const seriesList = unitsList.filter((e) => e.type === "series").sort((a, b) => (a.s.status === "ok") - (b.s.status === "ok") || a.s.id.localeCompare(b.s.id));
  const ids = new Set(seriesList.map((e) => e.s.id));
  const hints = S.work.merge_hints.map((h, i) => ({h, i})).filter(({h}) => h.series.some((id) => ids.has(id)));
  const laneVal = (heading, keys, extra) => `<div class="mh-row ${extra || ""}"><div class="mh-title">${heading}</div><div class="mh-photos">${keys.map((k) => `<img loading="lazy" src="${image(k)}" alt="" title="${esc(peopleText(k) || k)}" data-a="enlarge" data-key="${esc(k)}" data-keys="${esc(keys.join("|"))}" onerror="this.style.display='none'">`).join("")}</div></div>`;
  const merge = hints.map(({h, i}) => {
    const sl = h.series.map((id) => S.work.series.find((s) => s.id === id)).filter(Boolean), fresh = (h.new || []).filter((k) => S.photos[k]);
    const per = (s) => { const e = unitOf("s:" + s.id); return `${tr("Series {id} · {n} {n:photo|photos}{e}", {id: esc(s.id), n: s.photos.length, e: e && e.year ? " · " + esc(yearShort(e)) : ""})}`; };
    return `<div class="box info mh">${tr("Suggestion:")} <b>${h.series.map(esc).join(tr(" and "))}</b> ${tr("could belong to a series")}${fresh.length ? " " + tr("(with {n} more new {n:photo|photos})", {n: fresh.length}) : ""}.\n      ${sl.map((s) => laneVal(per(s), s.photos.filter((k) => S.photos[k]))).join("")}${fresh.length ? laneVal(tr("More new photos"), fresh, "new") : ""}
      <div class="actions"><button class="small good" data-a="mh-yes" data-i="${i}">${tr("Merge")}</button><button class="small danger" data-a="mh-no" data-i="${i}">${tr("No")}</button></div></div>`;
  }).join("");
  const head = `<div class="quiet" style="margin:4px 0 12px">${tr("A series is photos from the same occasion that are dated together. Check whether all photos belong, and confirm the series. You add more photos in the series via “+ Add photos”, or via the tick on the tile and “Merge into one series”. You can also combine several series: tick the series on the left, do the same for the second series, then “Merge into one series” below.")}</div>`;
  return head + merge + (seriesList.map(seriesBox).join("") || '<div class="empty">' + tr("No series in this view.") + '</div>');
}

const go = async (fn) => { fn(); await saveCorr(); saveWork(); draw(); };
export const actions = {
  "ok-series": (el) => { const s = S.work.series.find((x) => x.id === el.dataset.sid); if (s) { s.status = s.status === "ok" ? "open" : "ok"; saveWork(); draw(); } },
  "dissolve": (el) => { const s = S.work.series.find((x) => x.id === el.dataset.sid); if (s) return go(() => dissolve(s, true)); },
  "remove": (el) => { const s = S.work.series.find((x) => x.id === el.dataset.sid); if (s) return go(() => removeIt(s, el.dataset.key)); },
  "vn-yes": (el) => { const s = S.work.series.find((x) => x.id === el.dataset.sid); if (s) return go(() => addTo(s, [el.dataset.key])); },
  "vn-all-yes": (el) => { const s = S.work.series.find((x) => x.id === el.dataset.sid); if (s) return go(() => addTo(s, [...s.suggested_new])); },
  "vn-no": (el) => { const s = S.work.series.find((x) => x.id === el.dataset.sid); if (s) { s.rejected = [...(s.rejected || []), el.dataset.key]; s.suggested_new = s.suggested_new.filter((k) => k !== el.dataset.key); saveWork(); draw(); } },
  "vn-all-no": (el) => { const s = S.work.series.find((x) => x.id === el.dataset.sid); if (s) { s.rejected = [...(s.rejected || []), ...s.suggested_new]; s.suggested_new = []; saveWork(); draw(); } },
  "mh-no": (el) => {
    const i = +el.dataset.i, h = S.work.merge_hints[i];
    if (!h) return;
    S.work.merge_rejected = [...(S.work.merge_rejected || []), h.series]; S.work.merge_hints.splice(i, 1); saveWork(); draw();
  },
  "mh-yes": async (el) => {
    const i = +el.dataset.i, h = S.work.merge_hints[i];
    if (!h) return;
    const sl = S.work.series.filter((s) => h.series.includes(s.id));
    if (sl.length >= 2) mergeUnits(sl, (h.new || []).filter((k) => S.photos[k]));
    S.work.merge_hints.splice(i, 1);
    await saveCorr(); saveWork(); draw();
  },
  "note-show": (el) => { (ui.note = ui.note || {})[el.dataset.sid] = true; draw(); setTimeout(() => { const i = document.querySelector(`[data-sid="${el.dataset.sid}"] .describe`); if (i) i.focus(); }, 30); },
  "merge": async () => {
    const unitsList = [...ui.sel].map(unitOf).filter(Boolean);
    const seriesList = unitsList.filter((e) => e.type === "series").map((e) => e.s), single = unitsList.filter((e) => e.type === "photo").map((e) => e.keys[0]);
    const goal = seriesList.length ? mergeUnits(seriesList, single) : newSeries(single);
    ui.sel.clear(); ui.focusKey = "s:" + goal.id;
    await saveCorr(); saveWork(); draw();
  },
};
export function descriptionChanged(el) {
  const s = S.work.series.find((x) => x.id === el.dataset.sid);
  if (s) { s.description = el.value.trim(); saveWork(); }
}

// ---- add photos to a series (selection window with filter)
function plusDialog(sid) {
  const s = S.work.series.find((x) => x.id === sid);
  if (!s) return;
  const albumOf = {};
  S.albums.forEach((a) => (a.keys || []).forEach((k) => { albumOf[k] = a.name; }));
  const seriesOf = {};
  S.work.series.forEach((x) => x.photos.forEach((k) => { seriesOf[k] = x.id; }));
  const everyone = Object.keys(S.photos).filter((k) => !s.photos.includes(k)).sort();
  const chosen = new Set();
  const albumList = [...new Set(everyone.map((k) => albumOf[k]).filter(Boolean))].sort();
  modal(`<h3>${tr("Add photos to series {id}", {id: esc(s.id)})}</h3>
    <div class="quiet" style="margin-bottom:8px">${tr("Click photos. A photo from another series is moved here from there.")}</div>
    <div class="actions" style="margin-bottom:8px"><input type="text" id="sp-search" placeholder="${tr("Search: file name, person …")}" style="flex:1">
      <select id="sp-album"><option value="">${tr("all albums")}</option>${albumList.map((a) => `<option>${esc(a)}</option>`).join("")}</select></div>
    <div id="sp-grid" class="minis" style="max-height:52vh;overflow:auto"></div>
    <div class="actions" style="margin-top:12px"><button class="primary" id="sp-yes" disabled>${tr("Add")}</button><button id="sp-no">${tr("Cancel")}</button><span class="quiet" id="sp-count"></span></div>`, 760);
  const drawGrid = () => {
    const q = document.getElementById("sp-search").value.trim().toLowerCase(), al = document.getElementById("sp-album").value;
    const hitList = everyone.filter((k) => (!al || albumOf[k] === al) && (!q || (k + " " + (peopleText(k) || "")).toLowerCase().includes(q)));
    document.getElementById("sp-grid").innerHTML = hitList.slice(0, 150).map((k) => `<div class="mini ${chosen.has(k) ? "suggestion" : ""}" data-spk="${esc(k)}" style="cursor:pointer"><div class="image"><img loading="lazy" src="${image(k)}" alt=""></div>
      <div class="info"><div class="person">${chosen.has(k) ? "✓ " : ""}${esc(peopleText(k) || k)}</div><div class="quiet">${seriesOf[k] ? tr("in series {id}", {id: esc(seriesOf[k])}) : tr("single")}</div></div></div>`).join("")
      + (hitList.length > 150 ? `<div class="quiet">${tr("… {treffer_n} more, narrow down the search.", {treffer_n: hitList.length - 150})}</div>` : "") + (hitList.length ? "" : '<div class="empty">' + tr("Nothing found.") + '</div>');
    document.getElementById("sp-yes").disabled = !chosen.size;
    document.getElementById("sp-count").textContent = chosen.size ? tr("{n} selected", {n: chosen.size}) : "";
  };
  document.getElementById("sp-search").oninput = drawGrid;
  document.getElementById("sp-album").onchange = drawGrid;
  document.getElementById("sp-grid").onclick = (ev) => {
    const m = ev.target.closest("[data-spk]"); if (!m) return;
    const k = m.dataset.spk; chosen.has(k) ? chosen.delete(k) : chosen.add(k); drawGrid();
  };
  document.getElementById("sp-no").onclick = closeIt;
  document.getElementById("sp-yes").onclick = async () => {
    const keys = [...chosen]; closeIt();
    addTo(s, keys); await saveCorr(); saveWork(); draw();
  };
  drawGrid();
}
actions["s-plus"] = (el) => plusDialog(el.dataset.sid);
