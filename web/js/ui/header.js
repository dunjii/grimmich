// Header: name, connection status, numbers, gear wheel and the way to “Review changes”.
import {S} from "../state.js";
import {unitList} from "../model.js";
import {connectionOk} from "./settings.js";
import {searchHtml} from "./search.js";
import {tr} from "../language.js";

export function headHtml() {
  const ok = connectionOk(), j = S.job;
  const confirmedFlag = unitList().list.filter((e) => e.confirmedFlag).reduce((n, e) => n + e.keys.length, 0);
  const changeSet = S.sv ? S.sv.counters.write : confirmedFlag;
  const point = (b) => `<span class="dot ${b ? "ok" : "no"}"></span>`;
  return `<div class="head"><div class="title" data-a="go-inbox" title="${tr("Go to start page")}" role="link" tabindex="0"><img class="logo" src="/favicon.svg" alt="" width="34" height="34"><span class="mark">Grimmich</span><span class="subtitle">${tr("Dating and sorting old family photos")}</span></div><span class="space"></span>
    ${searchHtml()}
    <div class="status">
      <span title="${ok.immich ? tr("Immich is connected") : tr("Immich is not set up yet")}">${point(ok.immich)}Immich</span>
      <span title="${ok.gramps ? tr("Gramps is connected") : tr("Gramps is not set up yet")}">${point(ok.gramps)}Gramps</span>
      ${j.running ? '<span class="run" data-a="go-inbox" title="' + tr("A job is running") + '">' + tr("● running …") + '</span>' : ""}</div>
    <button class="icon" data-a="settings" aria-label="${tr("Connections and settings")}" title="${tr("Connections and settings")}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg></button>
    <button class="primary" data-a="go-write">${tr("Review changes ({aenderungen})", {aenderungen: changeSet})}</button></div>`;
}
