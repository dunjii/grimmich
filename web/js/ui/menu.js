// Menu bar under the header: Tasks · People · Albums · Series · Events · Places.
// The choice decides what the left column lists. It follows the open view, unless it was clicked (ui.menu).
import {ui, draw} from "../state.js";
import {tr} from "../language.js";
import {taskCounts} from "../model.js";

export function menuOf() {
  if (ui.menu) return ui.menu;
  const v = ui.view;
  if (v === "person") return "people";
  if (v === "album") return "albums";
  if (v === "event") return "events";
  if (v === "place") return "places";
  if (v === "task") return ui.task === "series" ? "series" : "tasks";
  return "tasks";
}
export function menuHtml() {
  const z = taskCounts(), m = menuOf();
  const items = [["tasks", tr("Tasks"), z.warn ? `<span class="tag warn">${z.warn}</span>` : ""], ["people", tr("People"), ""], ["albums", tr("Albums"), ""],
    ["series", tr("All series"), z.series ? `<span class="tag">${z.series}</span>` : ""], ["events", tr("Events"), ""], ["places", tr("Places"), ""]];
  return `<nav class="menu" aria-label="${tr("Menu")}">${items.map(([id, name, tag]) => `<button class="${m === id ? "on" : ""}" data-a="menu" data-m="${id}">${name}${tag}</button>`).join("")}</nav>`;
}
export const actions = {
  "menu": (el) => { ui.menu = el.dataset.m; draw(); },
};
