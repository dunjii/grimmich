// View “Calibration of the AI”: shows how far off the AI is for your people. Changes nothing.
import {esc} from "../util.js";
import {evaluate} from "../calibration.js";
import {modal, closeIt} from "./dialog.js";
import {tr} from "../language.js";

const z1 = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1).replace(".", ",");
const f1 = (x) => x.toFixed(1).replace(".", ",");

export function openCalibration() {
  const r = evaluate();
  if (!r.n) {
    modal(`<h3>${tr("Calibration of the AI")}</h3><div>${tr("There are no photos yet with a year that is independent of the AI. These include: years you enter with a fixed date via “Set date …” or “Enter year”, and dates you set in Immich yourself. Photos where you only clicked “correct” do not count.")}</div>
      <div class="actions" style="margin-top:14px"><button id="f-to">${tr("Close")}</button></div>`, 700);
    document.getElementById("f-to").onclick = closeIt; return;
  }
  const better = r.newError < r.rawError - 0.1;
  const verdict = r.photos < 8
    ? `${tr("That is still too few photos ({photos}) to be sure. The numbers are only a first impression.", {photos: r.photos})}`
    : better ? `${tr("With the calibration, the error in the test would drop from {rohFehler} to {neuFehler} years.", {rohFehler: f1(r.rawError), neuFehler: f1(r.newError)})}`
      : `${tr("In this test the calibration brings no improvement ({rohFehler} compared with {neuFehler} years). I would not use it.", {rohFehler: f1(r.rawError), neuFehler: f1(r.newError)})}`;
  const peopleList = r.perPerson.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.photos}</td><td>${z1(p.mean)} J</td>
    <td>${p.photos >= 5 ? z1(-p.corr) + " J" : '<span class="quiet">' + tr("too few photos") + '</span>'}</td></tr>`).join("");
  const levels = r.perLevel.filter((s) => s.n).map((s) => `<tr><td>${tr("AI age {von}–{bis}", {von: s.from, bis: s.to > 150 ? "…" : s.to})}</td><td>${s.n}</td><td>${z1(s.median)} J</td><td>${z1(-s.corr)} J</td></tr>`).join("");
  modal(`<h3>${tr("Calibration of the AI estimate")}</h3>
    <div class="quiet" style="margin-bottom:8px">${tr("Photos whose year you set yourself (not taken over from the AI) are compared. “+” means: the AI estimates the person older than they were. Nothing is changed here, it is only an evaluation.")}</div>
    <div class="box ${better && r.photos >= 8 ? "info" : "warn"}"><b>${tr("{n} {n:face|faces} on {photos} photos or series.", {n: r.n, photos: r.photos})}</b> ${verdict}</div>
    <h4>${tr("By AI age (for all people)")}</h4>
    <table><thead><tr><th>${tr("Bracket")}</th><th>${tr("Faces")}</th><th>${tr("AI is off on average by")}</th><th>${tr("Suggested correction")}</th></tr></thead><tbody>${levels}</tbody></table>
    <h4 style="margin-top:14px">${tr("By person")}</h4>
    <div class="table-frame"><table><thead><tr><th>${tr("Person")}</th><th>${tr("Photos/series")}</th><th>${tr("AI is off on average by")}</th><th>${tr("Additional correction")}</th></tr></thead><tbody>${peopleList}</tbody></table></div>
    <div class="quiet" style="margin-top:10px">${tr("{Jahre} The test leaves out each photo (or series) once and corrects it with the rest.", {Jahre: r.total ? `${tr("Effect on your other photos: for {verschoben} of {gesamt} faces the estimate would change by at least 1 year, on average by {mittlereVerschiebung} years.", {verschoben: r.shifted, gesamt: r.total, mittlereVerschiebung: f1(r.meanShift)})}` : ""})}</div>
    <div class="actions" style="margin-top:14px"><button id="f-to">${tr("Close")}</button></div>`, 900);
  document.getElementById("f-to").onclick = closeIt;
}
