// Interface language. English is the base language: the English text itself is the key.
// Every other language is one file in the folder languages/ (see languages/de.json); the server lists them under /api/languages.
// If a text is missing in the chosen language, the English one appears (nothing stays empty).
const STORAGE = "grimmich.language";
const OLD_STORAGE = "grimmich.sprache";

async function getJson(path) {
  try { const r = await fetch(path); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
export const languages = (await getJson("/api/languages")) || [{code: "en", name: "English", date_input: "iso"}];

function determine() {
  const known = (c) => languages.some((l) => l.code === c);
  try { const g = localStorage.getItem(STORAGE) || localStorage.getItem(OLD_STORAGE); if (g && known(g)) return g; } catch (e) { /* no storage */ }
  const nav = String((navigator && navigator.language) || "en").toLowerCase();
  return [nav, nav.split("-")[0]].find(known) || "en";
}
export const language = determine();
const DOC = language === "en" ? null : await getJson("/api/language/" + language);
const TEXTS = (DOC && DOC.texts) || {};
// "dmy": 24.12.1935 is typed day first; "iso": 1935-12-24
export const dateInput = ((DOC && DOC.language && DOC.language.date_input) || (languages.find((l) => l.code === language) || {}).date_input || "iso");

// tr("Text {name}", {name: value}) -> text in the chosen language; {name} is replaced
export function tr(text, values) {
  let s = Object.prototype.hasOwnProperty.call(TEXTS, text) ? TEXTS[text] : text;
  if (values) {
    // {name} = insert the value; {name:singular|plural} = form by value (1 = singular)
    s = s.replace(/\{(\w+)(?::([^{}|]*)\|([^{}]*))?\}/g, (m, k, one, many) => {
      if (!Object.prototype.hasOwnProperty.call(values, k)) return m;
      return one === undefined ? values[k] : (Number(values[k]) === 1 ? one : many);
    });
  }
  return s;
}
// Plural in the text: tr("{n} {n:photo|photos}", {n: 3}) -> "3 photos", with n = 1 -> "1 photo"

export function setLanguage(code) {
  try { localStorage.setItem(STORAGE, languages.some((l) => l.code === code) ? code : "en"); } catch (e) { /* no storage */ }
  location.reload();
}
// Fixed texts in index.html: <x data-t="Text"> and <x data-t-attr="aria-label|Text">
export function translatePage() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = tr(el.getAttribute("data-t")); });
  document.querySelectorAll("[data-t-attr]").forEach((el) => {
    const [attr, ...remaining] = el.getAttribute("data-t-attr").split("|");
    el.setAttribute(attr, tr(remaining.join("|")));
  });
}
