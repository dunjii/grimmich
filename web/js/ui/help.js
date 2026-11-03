// Help: legend and questions with answers (opened from the settings window).
import {modal, closeIt} from "./dialog.js";
import {esc} from "../util.js";
import {tr} from "../language.js";

const legendItems = () => [
  ["ok", tr("Anchor (confirmed)"), tr("A year you confirmed, or a date you set in Immich. It is fixed and acts on all other photos through the rows.")],
  ["draft", tr("Draft (year with ?)"), tr("A year you took over or set but did not confirm yet. It is held and no longer moves, but it does not act as an anchor yet.")],
  ["estimate", tr("Estimate (c. 1952)"), tr("The year Grimmich calculates. It is recomputed after every change and has a span, for example c. 1952 (1946–1958).")],
  ["warn", tr("Warning"), tr("Something contradicts the dating, for example a photo from before a person was born.")],
  ["", tr("AI 34 → 36"), tr("The AI age estimate of the person, and the age after smoothing along your row.")],
  ["", tr("⇄"), tr("The photo is also in the row of another person.")],
  ["", tr("S038 · 3"), tr("Number of the series and number of photos in it. A series has one year for all its photos and all rows.")],
  ["", tr("Faded photo"), tr("The photo is no longer in the working or anchor album.")]
];
const faqItems = () => [
  [tr("How does a year come about?"), tr("Step by step, and each step builds on the one before: AI estimate and series, your game answers (before/after, decade), the rows “Sort by appearance” of all people (your order, fixed anchors, anchors without photo), then the order answers of the game. Everything is recomputed after every change.")],
  [tr("Why does a year change by itself?"), tr("Because it is an estimate. When you sort a photo, answer a question or confirm an anchor, Grimmich recomputes all estimates. Anchors and drafts never change by themselves.")],
  [tr("What happens when I confirm a year?"), tr("It becomes an anchor. It stays fixed and pulls the photos around it in the rows into line.")],
  [tr("Does a photo without an AI estimate get a year?"), tr("Yes, if you sorted it into a row between two fixed anchors. Its year then comes only from its place in the row, and the detail view says so.")],
  [tr("What does Grimmich write to Immich and Gramps?"), tr("Only what you see in the preview and confirm. With the switch “read only” (GRIMMICH_READ_ONLY=1) nothing is written at all.")],
  [tr("What if my row and a game answer contradict each other?"), tr("Your own row wins. The answer is only counted and not applied.")],
  [tr("How do I play on the phone?"), tr("Open Grimmich on the phone and the game starts. Tap the photo that shows the person older, or answer the other questions. “Don't know” is always fine, those questions come back later.")],
  [tr("Where are my answers kept?"), tr("Only in Grimmich (the database in the data folder). Nothing goes to Immich or Gramps.")]
];
export function openHelp() {
  const leg = legendItems().map(([c, head, text]) => `<div class="help-row"><span class="help-key">${c ? `<span class="legend"><i class="${c}"></i></span>` : ""}<b>${esc(head)}</b></span><span>${esc(text)}</span></div>`).join("");
  const faq = faqItems().map(([q, a]) => `<details class="help-faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");
  modal(`<h3>${tr("Help")}</h3><h4>${tr("Legend")}</h4>${leg}<h4 style="margin-top:16px">${tr("Questions and answers")}</h4>${faq}
    <div class="actions" style="margin-top:14px"><button data-a="help-close">${tr("Close")}</button></div>`, 760);
}
export const actions = { "help": () => openHelp(), "help-close": () => closeIt() };
