import {tr, language, dateInput} from "./language.js";
// Small helpers without dependencies: text, server calls, date.
export const $ = (id) => document.getElementById(id);
export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
export const image = (key) => "/photos/" + encodeURIComponent(key) + ".jpg";
export const fetchIt = async (path) => (await fetch(path, {headers: {"X-Language": language}})).json();
export const send = async (path, data) => (await fetch(path, {method: "POST", headers: {"X-Language": language}, body: JSON.stringify(data)})).json();
export const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
export const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) + Math.floor(Math.random() * 1296).toString(36);
export const p2 = (x) => String(x).padStart(2, "0");

export function remember(keyVal, val) { try { localStorage.setItem("grimmich." + keyVal, JSON.stringify(val)); } catch (e) { /* ohne Speicher weiter */ } }
export function recall(keyVal, defaultVal) {
  try { const v = localStorage.getItem("grimmich." + keyVal); return v === null ? defaultVal : JSON.parse(v); } catch (e) { return defaultVal; }
}

export function toast(text) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// ---- type a date: 24121935, 24.12.1935, 12.1935, 121935 or 1935
export function parseDate(t) {
  t = String(t || "").trim();
  let m;
  if ((m = t.match(/^(\d{1,2})[.\-\/ ](\d{1,2})[.\-\/ ](\d{4})$/)) || (m = t.match(/^(\d{2})(\d{2})(\d{4})$/))) return {tag: +m[1], mon: +m[2], j: +m[3]};
  if ((m = t.match(/^(\d{1,2})[.\-\/ ](\d{4})$/)) || (m = t.match(/^(\d{2})(\d{4})$/))) return {tag: 0, mon: +m[1], j: +m[2]};
  if ((m = t.match(/^(\d{4})$/))) return {tag: 0, mon: 0, j: +m[1]};
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return {tag: +m[3], mon: +m[2], j: +m[1]};   // 1935-12-24
  if ((m = t.match(/^(\d{4})-(\d{1,2})$/))) return {tag: 0, mon: +m[2], j: +m[1]};
  return null;
}
// -> {j, date, dj} or {error}
export function dateValues(d) {
  if (!d) return {errors: tr("Date not recognised. Examples: 1935-12-24, 24121935, 12.1935 or 1935.")};
  const {tag, mon, j} = d;
  if (j < 1800 || j > 2100) return {errors: tr("Please enter a year between 1800 and 2100.")};
  if (mon && (mon < 1 || mon > 12)) return {errors: tr("The month must be between 1 and 12.")};
  if (tag) {
    const dt = new Date(Date.UTC(j, mon - 1, tag));
    if (dt.getUTCMonth() !== mon - 1 || dt.getUTCDate() !== tag) return {errors: tr("This date does not exist.")};
    return {j, date: `${j}-${p2(mon)}-${p2(tag)}`, decimal_year: j + ((dt - Date.UTC(j, 0, 1)) / 86400000) / 365.25};
  }
  if (mon) return {j, date: `${j}-${p2(mon)}`, decimal_year: j + (mon - 0.5) / 12};
  return {j, date: "", decimal_year: j};
}
export function dateShort(d) {
  const t = String(d || "").split("-");
  if (dateInput === "iso") return t.join("-");   // 1935-12-24 (unambiguous)
  if (t.length === 3) return `${t[2]}.${t[1]}.${t[0]}`;
  if (t.length === 2) return `${t[1]}.${t[0]}`;
  return t[0] || "";
}
const MONTHS = [tr("January"), tr("February"), tr("March"), tr("April"), tr("May"), tr("June"), tr("July"), tr("August"), tr("September"), tr("October"), tr("November"), tr("December")];
export function dateLong(d) {   // "1955-03-04" -> "4. März 1955"
  const t = String(d || "").split("-");
  if (t.length === 3) return tr("{tag} {monat} {jahr}", {tag: +t[2], monat: MONTHS[+t[1] - 1], jahr: t[0]});
  if (t.length === 2) return `${MONTHS[+t[1] - 1]} ${t[0]}`;
  return t[0] || "";
}

// Face crop as a CSS background (box = [x1, y1, x2, y2, width, height] of the image)
export function cropStyle(key, b, sizePx) {
  const W = b[4], H = b[5], bw = Math.max(1, b[2] - b[0]), bh = Math.max(1, b[3] - b[1]);
  const side = Math.min(Math.max(Math.max(bw, bh) * 1.8, 20), W, H);
  const x0 = Math.max(0, Math.min((b[0] + b[2]) / 2 - side / 2, W - side)), y0 = Math.max(0, Math.min((b[1] + b[3]) / 2 - side / 2, H - side));
  const f = sizePx / side;
  return `background-image:url(${image(key)});background-size:${(W * f).toFixed(1)}px ${(H * f).toFixed(1)}px;background-position:${(-x0 * f).toFixed(1)}px ${(-y0 * f).toFixed(1)}px;`;
}
