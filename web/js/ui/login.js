// Sign-in page of the game from outside (/play/). Without a valid sign-in the server gives out nothing but this page.
import {$, esc, BASE} from "../util.js";
import {tr, language} from "../language.js";

async function post(path, data) {
  const r = await fetch(BASE + path, {method: "POST", headers: {"X-Language": language}, body: JSON.stringify(data)});
  let body = {};
  try { body = await r.json(); } catch (e) { /* no answer body */ }
  return {status: r.status, body};
}

// -> the name of the signed-in player, or null (then the sign-in page is shown and nothing else loads)
export async function checkSignIn() {
  try {
    const r = await fetch(BASE + "/api/me");
    if (r.ok) return (await r.json()).name || null;
  } catch (e) { /* server not reachable: the page below says so on sign-in */ }
  $("frame").hidden = true; $("page").hidden = false;
  $("page").innerHTML = `<div class="game-full login"><div class="game-bar"><b>Grimmich</b></div>
    <div class="game-q">${tr("Sign in")}</div>
    <form id="login-form" class="login-form">
      <input class="game-input" id="login-name" name="username" placeholder="${esc(tr("Name"))}" maxlength="40" autocomplete="username" autocapitalize="none" spellcheck="false" required>
      <input class="game-input" id="login-password" name="password" type="password" placeholder="${esc(tr("Password"))}" maxlength="200" autocomplete="current-password" required>
      <button class="game-btn primary" type="submit">${tr("Sign in")}</button>
      <div class="quiet login-note" id="login-note" role="alert"></div>
    </form>
    <div class="quiet game-foot">${tr("You got your name and password from the person who invited you.")}</div></div>`;
  $("login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const note = $("login-note");
    note.textContent = "";
    try {
      const {status, body} = await post("/api/login", {name: $("login-name").value, password: $("login-password").value});
      if (body.ok) { location.reload(); return; }
      note.textContent = status === 429 ? tr("Too many attempts. Please wait a few minutes.") : tr("Name or password is wrong.");
    } catch (e) { note.textContent = tr("The server did not respond."); }
  });
  return null;
}

export async function signOut() { try { await post("/api/logout", {}); } catch (e) { /* the cookie is only removed when the server answers */ } location.reload(); }
export async function changePassword(old, fresh) { return post("/api/password", {old, new: fresh}); }
