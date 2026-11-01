// Background jobs (update, write): start, query progress, then reload everything.
import {S, loading, draw, loadNewInfo} from "./state.js";
import {$, esc, fetchIt, send, toast} from "./util.js";
import {saveAdoption} from "./review.js";
import {tr} from "./language.js";

let timer = null;
export const afterJobHooks = [];   // Windows that have to follow up after a job (e.g. To Gramps)
export async function startJob(name, args = []) {
  const r = await send("/api/job", {name, args});
  if (!r.ok) { toast(r.text || tr("The job could not be started.")); return; }
  await checkJob();
}
export async function checkJob() {
  const previous = S.job.running;
  try { S.job = await fetchIt("/api/job"); } catch (e) { return; }
  if (S.job.running) { clearTimeout(timer); timer = setTimeout(checkJob, 1500); }
  if (previous && !S.job.running) { await afterJob(); draw(); return; }
  if (!previous && S.job.running) { draw(); return; }
  updateDisplay();
}
async function afterJob() {
  const j = S.job;
  if (j.rc === 0) { await loading(); S.job = j; }
  afterJobHooks.forEach((h) => h(j));
  if (j.rc !== 0) return;
  if (j.name === "write" && j.args && j.args[0] !== "preview") { await saveAdoption(); await startJob("write", ["preview"]); return; }
  await loadNewInfo();
}
const STEP_LABELS = {names: tr("Load names"), state: tr("Check changes in Immich"), estimate: tr("Estimate ages"), series: tr("Compare series"), provenance: tr("Read albums"), gramps: tr("To Gramps")};
export function statusHtml(j, last, labels = STEP_LABELS) {   // "Step 3 of 5: <name>", the last line and a progress bar
  const pct = Math.round((j.progress || 0) * 100);
  return `${tr("Step {no} of {total}:", {no: j.step_no || 0, total: j.step_total || 0})} <b>${esc(labels[j.step_name] || j.name || "")}</b><br>${esc(last)}
    <div class="bar" id="jobbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;
}
export function updateDisplay() {   // only progress texts, so that input in the window is not lost
  const j = S.job, st = $("jobstatus"), log = $("joblog");
  const last = (j.rows || []).filter((l) => l && !l.startsWith("  ") && !/^\[ ?(WARN|INFO|ERROR)/.test(l)).slice(-1)[0] || "";
  if (st) st.innerHTML = j.running ? statusHtml(j, last) : "";
  if (log) { const below = log.scrollHeight - log.scrollTop - log.clientHeight < 40; log.textContent = (j.rows || []).join("\n"); if (below) log.scrollTop = log.scrollHeight; }
}
export const jobSchritt = STEP_LABELS;
