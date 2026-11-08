# Grimmich – Changelog

Grimmich (Gramps + Immich) dates scanned old photos from AI age estimates and known birth dates
and puts the results back into Immich and Gramps. This log is reconstructed from the working history; the assignment of single points to days is partly approximate.

## Unreleased (branch `ui-menu`) – Menu bar instead of the start page
- New **menu bar** under the header: Tasks · People · Albums · Series · Events · Places. The left column lists only what the chosen entry stands for; finished people, albums and series are at the bottom of their list.
- **Refresh** moved into the header (progress shows on the button, a message appears when done). The big start page is no longer needed; the old Inbox is still under Tasks.
- New view **Places**: places assigned to photos, and the photos of one place.
- Test builds of this branch also get the image tag `dev`. New test `tests/ui_menu_test.py`.

## 0.10.3 – 2026-11-05 – Models fixed to tested versions, manual check for newer ones
- The three models (MiVOLO v2, YOLO face/person detector, DINOv2 small) are loaded with a fixed version (commit hash). Once downloaded, they load from the data folder without any request to Hugging Face, and estimates cannot change silently when a model is updated there.
- Settings → "AI models": shows the version in use per model and a button "Check for new versions". It only asks Hugging Face for the newest version and reports; it never changes or downloads anything. The result is remembered (`model_check.json`).
- New tests `tests/test_model_versions.py` (every model has a full version, every loading call passes it, check incl. errors, endpoints) and a check in the settings UI test.

## 0.10.2 – 2026-11-05 – README: licence of the MiVOLO model corrected
- The table of third-party components said "Apache-2.0" for the MiVOLO v2 model. Its Hugging Face page says **CC BY-NC 4.0** (non-commercial use only). Only the small MiVOLO package on GitHub (copied into the Docker image) is Apache-2.0. Grimmich does not ship the model; every installation downloads it. The other two models were not checked again (see below).

## 0.10.1 – 2026-11-05 – "Reload" of Gramps places and people works again
- The buttons that fetch the Gramps places (in the place search) and the people (when assigning) fresh from Gramps sent `?neu=1` while the server waited for `?new=1` (a leftover of the English renaming, 0.9.48). So they always showed the list saved earlier and never asked Gramps. Fixed.
- New test `tests/test_gramps_refresh.py` (it fails with the old address).

## 0.10.0 – 2026-11-05 – The game for several players, evaluation, working Docker image
The versions 0.9.49 to 0.9.68 below are the way here; this is the summary.
- **Game "Who is older?"** for phone and computer: older / younger, "Who is this?" (name choice), "Where was it taken?", before or after a dated photo, sorting 3–5 photos (ties by tapping again), decade. Whole-photo viewer with zoom and swipe, new bar with account and "Done ✓", own evaluation with badges.
- **Everything counts together:** AI estimate, series, anchors, your rows and the game answers refine the estimates step by step; photos without an AI estimate get one from their place in a row. Nothing is written to Immich or Gramps without the usual preview.
- **Several players, also from outside:** the game runs alone under `/play/` with sign-in (name and password you create yourself), rate limits, no search engines, optional list of people whose photos are not shown. Only `/play/` is to be shared on the internet (for example with Tailscale Funnel, which is not part of Grimmich).
- **Feedback and evaluation:** after an answer a line says what it changed; family progress under the question; the page "Game evaluation" shows per player what the answers did and where they contradict your rows; a player's answers can be hidden and shown again.
- **Daily backup** of the database next to it (last 14 copies).
- **Docker image:** the MiVOLO model can now be loaded (package `mivolo`, adapted to the current `timm`, `scipy`), and the build checks it. Fixed on the write page: the ticks "Source" and "Place".

## 0.9.68 – 2026-11-05 – Docker image: build check uses the right image size
- The new build check of 0.9.66 fed a 224 pixel image to the 384 pixel network and stopped the build. It now uses 384 x 384.

## 0.9.67 – 2026-11-05 – Write page: the ticks "Source" and "Place" work again
- In "What should be written?" the ticks "Date and tags", "Source" and "Place (GPS)" jumped back at once: since the English renaming (0.9.48) the page and the stored setting used different names, so a click was saved under a name nobody read. Fixed; settings you made earlier still count.
- Test in `tests/ui_test.py`: the three ticks end up in the state.

## 0.9.66 – 2026-11-05 – Docker image: the MiVOLO model can be loaded
- The first estimate run in the Docker container stopped with "No module named 'mivolo'": the model's own code needs the package `mivolo` (only on GitHub), which the image never contained (on a laptop it had been installed by hand). Then `scipy` and two changes of the current `timm` (a renamed function, a new parameter in the middle of VOLO's list that shifted the values) came up.
- New `docker/install_mivolo.py` copies the package (pinned to one commit) into the image and adapts those places; `scipy` is in the requirements.
- The build check is stricter: it builds the MiVOLO network once with random weights and runs one image through it, so such a mismatch stops the build instead of the first estimate run. It does not check whether the model gives sensible years.
- New test `tests/test_install_mivolo.py` (the adaptation and that a second run changes nothing).

## 0.9.65 – 2026-11-04 – Game: what the answers do, evaluation page, hiding players, daily backup
- After each answer a short line says what it changed ("Thanks to this, a photo is now narrowed down to 1950–1956 (before: 1944–1962)"); only when something really changed, otherwise "Thanks, noted.".
- Under the question a small bar shows the family progress: how many photos already have real answers from anybody.
- The "Done" page has a fourth number, "photos dated more precisely" (photos whose span became at least 2 years narrower, or got an estimate, because of your answers), and names the photo that changed most.
- New page "Game evaluation" under the tasks on the left (full interface only): per player answers, last answer, answers confirmed by others and, on a click on "Calculate effect", the photos each player dated more precisely; all photos the answers changed (before / after); contradictions between answers and your rows.
- Hide a player: all his answers are taken out of every estimate at once, nothing is deleted, they can be shown again. A signed-in player always still sees and counts his own answers.
- Daily backup: Grimmich copies grimmich.db once a day to the folder `backups` next to it and keeps the last 14 copies (3 if the database is larger than 2 GB). `GRIMMICH_BACKUPS=0` switches it off, `GRIMMICH_BACKUPS_KEEP` sets the number. The copy lies on the same disk: it protects against a wrong click, not against a broken disk.
- Tests: `tests/test_backup.py`, hidden answers in `tests/test_play.py`, evaluation page in `tests/ui_game_test.py`.

## 0.9.64 – 2026-11-04 – Game: new look (bar, account, search window, "Done")
- New bar in one row: logo and name, "Account", and "Done ✓" with a yellow number (your answers so far) at its corner. On narrow screens it shrinks step by step: first only the tick, then "Account" as an icon, last without the name.
- "Account" is there on your own computer too: change player, results, back to Grimmich. From outside it holds password and sign out. The name of the player is shown there, not in the bar.
- Searching a name or a place no longer opens a second page: a window in the middle of the screen with photo, field, list and "Cancel"; with the keyboard open it moves into the visible part of the screen. Tapping next to it closes it.
- "Done ✓" shows your own evaluation: thanks, three numbers (answers, names and places, answers confirmed by others) and badges (first steps, name giver, place finder, time traveller, sharp eyes, family chronicler). New badges sparkle once, with a little confetti (not when the device asks for less motion). The badges are counted from your own answers; nothing is compared with other players.
- The line at the bottom now reads: "Thank you for helping to date our old photos. Every answer counts."
- New local test `tests/ui_game_test.py`.

## 0.9.63 – 2026-11-04 – Game: ties in a sorted row by tapping the photo again
- Sorting 3–5 photos: tap the photos from youngest to oldest. Tap the last one again and it gets the same number as the one before; a third tap takes it out again. The button "Next one is the same age" is gone. The numbers now count without gaps (1, 2, 2, 3); this changes nothing in the estimates, only the order counts.

## 0.9.62 – 2026-11-04 – Game: swipe between the photos of a sorted row
- When you open a photo of a row of 3–5 ("Sort from young to old") in the whole-photo view, you can now swipe (or use the arrow keys / the arrows on the screen) to the other photos of the row, like with a pair. The zoom stays.

## 0.9.61 – 2026-11-04 – Play mode with sign-in; hidden people
- The game under `/play/` now needs a sign-in. Without it the server serves only the sign-in page, no photo, face or estimate. You create the players in the settings ("Game for several players"): a name, and Grimmich makes up a password that is shown once; give a new password, block or remove a player there. Players can change their own password and sign out.
- The name of an answer now comes from the sign-in, never from the request. The name picker is gone in the game from outside (it stays on your own computer).
- Passwords are stored only as salted scrypt hashes; the sign-in cookie is `HttpOnly`, `SameSite=Lax`, `Secure` behind HTTPS, and stops working when the password is changed or the player is blocked or removed.
- Slowed down: wrong passwords (8 per name, 20 per address, 100 in total per 15 minutes; the same wrong answer for unknown names and wrong passwords), and sources that ask for many addresses that do not exist. Requests to `/play/` are limited to 100 KB. `/play/robots.txt` and a `noindex` header keep search engines away.
- A request that comes in through Tailscale Funnel (header `Tailscale-Funnel-Request`) can only reach `/play/`; the rest of Grimmich is answered with "not found" there.
- New optional list of hidden people (settings): no photo with them is handed out to players from outside, not even by address; answers about such photos are refused. On your own computer nothing is hidden.
- Tests: new `tests/test_auth.py`, extended `tests/test_play.py` (sign-in needed everywhere, name from the sign-in, blocking/removing/password change, hidden people, Funnel, flood of unknown addresses), local `tests/ui_play_test.py`.

## 0.9.60 – 2026-11-04 – The game for several players (play mode)
- New: the game can be played by several people at `/play/`. Everything it may reach lies under that path, checked against a fixed list on the server: the game gets only the photos, faces and estimates it needs (no settings, keys, birth dates, events), and the only thing it may send is one checked answer at a time. Anything else under `/play/` is "not found". Tests make sure of that.
- Answers are now appended one by one (with the name of the player and the time) instead of the whole file being replaced, so two players cannot overwrite each other. "Undo" takes back the last answer of the same player. At most 240 answers per minute are accepted.
- Each player chooses a name (kept in the browser, "Change player" in the bar). A real answer of anybody settles a question; "Don't know" only counts for the player who said it.
- Play mode shows only the game: no results page, no way back to the full interface.
- README: section about the game for several players and how to forward only `/play/`.

## 0.9.59 – 2026-11-04 – Game: photos of the same age in a sorted row
- When sorting 3–5 photos you can say that the next photo is the same age as the one before ("Next one is the same age"): the ranks then read 1, 2, 2, 4, 5. Photos of the same rank are not put in an order to each other; they only count as younger or older than the others.

## 0.9.58 – 2026-11-03 – Estimates from the rows for photos without AI estimate; legend and FAQ
- A photo without an AI estimate gets an estimate when you sorted it into a row between two fixed anchors: the year comes from its place in the row, the span is the two anchors. The detail view says so. Photos in no row stay without an estimate.
- New page "Help" (settings window, button "Help"): legend of the states (anchor, draft, estimate, warning) and of the marks on the tiles, and questions with answers (how a year comes about, what is written to Immich and Gramps, playing on the phone, …).

## 0.9.57 – 2026-11-03 – Everything counts together: rows, series, anchors and game answers; name choice in the game
- The estimate of a photo or series is now refined step by step, and every step builds on the one before: AI estimate and series, then your game answers (before/after, decade), then the rows "Sort by appearance" of all people (your order, fixed anchors, anchors without photo), then the order answers of the game. It is recomputed after every change, nothing of it is stored, and it works before a photo becomes an anchor.
- A series has one year for all rows it appears in. Fixed years (confirmed, from Immich, drafts) never move; they act on the others through the rows. The year never lies after today.
- Where your own row decides the order of two photos, the row wins over a game answer; contradictions are counted, not applied.
- Game: "Who is this?" now offers name buttons (people on the other photos of the same series, names you gave before) and a search page with all names, also for a new name. The keyboard only opens when you tap the search.

## 0.9.56 – 2026-11-03 – Game answers now refine the estimates; new question types
- Your answers in the game now flow into the estimates (as suggestions only, nothing is written to Immich or Gramps without the usual preview): "before / after the photo from 1950" and "in the 1940s" narrow the span of a photo or series; "this one is older" and sorted rows put estimates that contradict your order closer together. Photos that are already confirmed or have a draft are never moved. Contradicting bounds are ignored. This works before a photo becomes an anchor. In the detail view a note shows what the AI alone said.
- New questions: before or after a dated photo (anchor), sort 3–5 photos of one person from young to old, and the decade of a photo. The free "In which year?" question is no longer asked (old answers stay in the results).
- On phones and tablets the keyboard no longer opens by itself at questions with an input.

## 0.9.55 – 2026-11-03 – Game: swipe between the photos, frame for the face, results page
- In the whole-photo view of a pair you can swipe left/right (or use the arrow keys or the arrows on the screen) to go from one photo to the other; the zoom stays. (Before, the arrow keys did nothing there.)
- "Who is this?": a frame marks the face that is meant, in the cut-out and in the whole-photo view.
- New page "Results" in the game: counts per question, your "Who is older?" answers against the AI estimate (how many agree, the contradictions of at least 2 years), the pairs marked "Not the same person", the names, years and places you gave. Only looking; nothing is changed.
- **Fix:** the pairs of "Who is older?" were meant to prefer photos with similar estimated ages, but the age was read from the wrong field, so they were picked at random. Now the preference works.

## 0.9.54 – 2026-11-03 – Game: place question without keyboard hassle
- "Where was this photo taken?" now offers up to four suggestions as buttons (event or residence from Gramps, other photos of the series, often used places) and "Another place …", which opens its own search page: the hits stand right under the field, the photo is only a small preview, so the keyboard no longer squeezes the view. A place that is not in Gramps can be remembered as text. Fixes the missing suggestions of the previous version.
- "Save" confirms the chosen place.

## 0.9.53 – 2026-11-03 – Game: more questions, sharper faces
- The game (button "Game", before "Who is older?") now mixes questions at random: **Who is this?** (a face without a name; name field with the names from Immich/Gramps, any new name can be typed), **In which year was this photo taken?** (only photos whose estimate is uncertain), **Where was this photo taken?** (places from Gramps, photos without a place) and the pair question "Who is older?". "Don't know" is possible everywhere; such questions come back later. All answers are only saved in Grimmich; nothing is written to Immich or Gramps and nothing changes in the dating.
- Sharper faces: for faces that are small in the stored photo (less than 250 pixels) Grimmich fetches the big picture from Immich once (read only), cuts the face out and keeps only the small cut-out in the folder `face_cutouts/`. If Immich cannot be reached, or the picture does not fit the face box, the stored photo is shown as before. The AI age estimate is not changed.

## 0.9.52 – 2026-11-03 – Game: simpler buttons
- "Who is older?": the button "Skip" is gone ("Don't know" does the same and remembers the answer).

## 0.9.51 – 2026-11-03 – Game: more answers, icons, whole-photo viewer
- "Who is older?": new answers "Don't know" and "Not the same person" (to check later whether Immich assigned a face correctly) next to "Same age"; all buttons have small icons. Tapping a photo still means "this one is older".
- Every photo has a small preview of the whole photo; a tap opens it large (pinch or mouse wheel to zoom, drag to move, double tap to reset, button back to the decision).
- Pairs answered with "Don't know" are not decided: they come back now and then and when nothing new is left. "Not the same person" is saved with the pair and has no influence on dating.

## 0.9.50 – 2026-11-03 – Game fills the whole window
- "Who is older?" now takes the whole browser window (no header, two large photos, buttons at the bottom; side by side on wide screens, stacked on phones). The faces are shown with more of their surroundings, so they are sharper than before. The notice for small screens became a short line.

## 0.9.49 – 2026-11-03 – Game "Who is older?", phone notice
- New page "Who is older?" (button in the header): Grimmich shows two photos of the same named person, you tap the older one (or "same age / cannot tell", "skip", "undo"; on the desktop also the arrow keys). Pairs with similar estimated ages come first. The decisions are only saved in Grimmich (`game_votes`); nothing is written to Immich or Gramps.
- On a small screen (phone) Grimmich now shows a notice that the full interface is made for large screens and starts with the game; a button opens the full interface anyway.

## 0.9.48 – 2026-11-03 – English file names
- The last German file and folder names are now English: `estimates_body.csv`, `series.csv`, `series_suggestions.csv`, `series_manual.txt`, `series_separate.txt`, `series_cache.npz`, `known_years.csv`, `series_output/` (with `photos/` and `series_001.jpg …`), `control_images/`, `control_images_body/`, `json_old/`. The same goes for the column headers of the CSV files and the web address of the photos (`/photos/`).
- Existing data folders are converted automatically at the first start: old files and folders are renamed (a file that already has the new name is never overwritten) and the headers of the CSV files are translated. Nothing has to be done by hand.
- After the update "Refresh" calculates once again, because the program code changed (the results stay the same).

## 0.9.47 – 2026-11-02 – Progress row, log without colour codes, ZimaOS guide
- The progress of "Refresh" now sits in its own row over the whole width of the card, so the bar keeps its length when the text changes; the text line is shortened with "…" instead of pushing the bar around.
- Colour codes of libraries (`[31m[1m …`) are removed from the log.
- README: guide for ZimaOS / CasaOS (custom install with a ready-made text, moving your data, updating).
- GitHub build: newer versions of the actions (the old ones ran on the retired Node 20).
- Code comment about the face-box margin no longer refers to another project.

## 0.9.46 – 2026-11-02 – Docker: missing package
- **Fix:** the person detector needs `omegaconf`; the Docker image did not contain it, so Ultralytics installed it on the fly at the first run. It is now part of `requirements.txt` and the image build checks it.

## 0.9.45 – 2026-11-02 – Docker: fix for the AI libraries
- **Fix:** in the Docker image `torchvision` did not match `torch`, so the age estimate stopped with "operator torchvision::nms does not exist". Both are now installed together from the CPU index, `torchvision` is listed in `requirements.txt`, and the image build checks that the AI libraries load.

## 0.9.44 – 2026-11-02 – Tidying before going public
- All test names, test comments and the remaining German messages in the code are English now (the German texts live in `languages/de.json`).
- README: a clear note at the top that Grimmich has no login yet and must not be reachable from the internet.
- Screenshots: new ones for sorting by appearance and the life line from Gramps (invented data), shown side by side. The demo photos are drawn as small figures that look older with age.
- Docker: GitHub builds the image (`.github/workflows/docker.yml`, on every `v*` release or by hand) and publishes it as `ghcr.io/dunjii/grimmich`; `docker-compose.yml` uses it.
- No change in behaviour.

## 0.9.43 – 2026-11-02 – Docker (first version, untested on a server)
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`. The program is in the image, the data in a volume (`/data`).
- New settings: `GRIMMICH_DATA` (folder for database, access files, caches; default the program folder, as before) and `GRIMMICH_HOST` (default `127.0.0.1`; `0.0.0.0` in the container). The AI models are cached in the data folder. README: section "Docker".
- Nothing changes when started the usual way.

## 0.9.42 – 2026-11-02 – Screenshots, a fix for two texts, more realistic demo data
- **Fix:** two texts with an umlaut in the name of a placeholder showed `{prüfen}` / `{verfügbar}` literally in the interface (the browser only knows plain letters in placeholder names). Renamed (`{state}`, `{text}`); a test now checks that no placeholder name has a special character.
- Screenshots in the README (`docs/screenshots/`), taken on the invented demo data.
- Demo data: photos are only dated in years in which the people on them were alive and born, and now and then a face is named wrongly (a few warnings, not hundreds).

## 0.9.41 – 2026-11-02 – One block in the description, kind tags per language
- **One block per photo** in the Immich description: `[GRM] ~1960 (1952–1968) · S038 [/GRM]`. `~` = estimated, no `~` = fixed date, `?` = open; then the series number (searchable in Immich) and, if switched on, the source. A fixed date alone gets no block. The marker is the same in every language and no longer contains words, so nothing in it has to be translated ("ca." is gone; the name of the person and their age are not written, Immich shows them anyway).
- Earlier blocks (`[Grimmich] ca. …`, `[Datierung automatisch] …`) and the separate source block (`[Quelle]` / `[Source]`) are recognised and replaced when a photo is written the next time; the preview shows how many photos that touches. A series of only one photo gets no number.
- **Kind tags per language** (`tag_postcard`, `tag_greeting_card`, `tag_document`, `tag_other` in `naming.py` and the `written` section of a language file). An installation that has already written keeps the German names (Ansichtskarte, Grußkarte, Dokument, Sonstiges (Grimmich)); a new installation takes its language (Postcard, Greeting card, Document, Other (Grimmich)). All spellings are recognised when reading.
- README: new section "Credits" (written with Claude).
- Tests: `UnifiedBlock` (format, old blocks, source moves into the block, series disappears, rerun is unchanged), kind tags in `test_naming.py`.

## 0.9.40 – 2026-11-01 – Invented demo data
- New `demo_data.py`: makes up a complete small data set (26 people, 140 drawn photos, 24 series, estimates, albums, postcards), so Grimmich can be tried without your own photos, Immich or Gramps. Always the same data (fixed random seed). See README, "Try it with invented data".
- The interface walkthrough (`tests/ui_walkthrough.py`, development only) can run on it: `GRIMMICH_TEST_DATA=<folder> python3 tests/ui_walkthrough.py` (59 views, no findings).
- `tests/test_demo_data.py` (6 checks: same every time, every key known everywhere, faces, plausible estimates).

## 0.9.39 – 2026-11-01 – README: life dates and updating
- The README says "life dates from Gramps Web" and has a section on updating (`git pull`).

## 0.9.38 – 2026-11-01 – Preparation for GitHub
- Privacy check of the whole project: no passwords, keys, real addresses or names in the code (only example addresses such as `192.168.1.10`). One example name in a comment was replaced.
- `.gitignore` rewritten in English and brought up to date with the new file names (database, credentials, caches, output folders, your own series files, anonymised copies and their key). Tested with the real file names of an installation.
- The last German comments in the code are English.
- Step pills in the Write view get a little more room on the right.

## 0.9.37 – 2026-11-01 – Progress bar, full log, words written into Immich per language, polish
- **Progress bar** for "Refresh": "Step 3 of 5", the name of the step and a bar that fills as the scripts report their counters ("120 / 340"). The step text no longer contains a hard-coded German "von".
- **Complete log**: the log under the gear icon ("Log of the last run") now shows the whole run, not only the last 60 lines. Counter lines overwrite each other, so the log stays short.
- **Words written into Immich per language** (`naming.py`): the two tags, the "dating open" note and the source marker are chosen once and then stay. An installation that has already written to Immich keeps the German words ("Datierung geschätzt", "Datierung offen", `[Quelle]`), so nothing changes there. A new installation takes the words of the language it is first used in (English: "Dating estimated", "Dating open", `[Source]`). A language file may define its own words in a section `written`. Reading recognises the words of every language and replaces an old spelling when a photo is written again. The kind tags (postcard, greeting card …) and the "ca." in the note are not translated yet.
- German translations now use real umlauts (ä, ö, ü, ß) instead of ae, oe, ue.
- Cosmetics in the Write view: the three step pills no longer wrap and are evenly spaced; the heading no longer uses optical sizing of the serif font.
- Remaining German comments in the code and the module descriptions of the tests are English.
- Tests: `tests/test_job.py`, `tests/test_naming.py`, two more in `tests/test_immich_write.py`.

## 0.9.36 – 2026-11-01 – Hints in the age-estimate log follow the language
- The hint at the end of a log line of the age estimate ("!! only older people: rough estimate") is shown in the language of the interface. The stored hint stays English, as before.

## 0.9.35 – 2026-11-01 – Missed log lines translated
- About 30 log lines of the scripts (e.g. "Skipped …", "=== SUMMARY ===", "Done.") were still hard-coded German and showed up mixed into the translated process steps. They now follow the interface language.

## 0.9.34 – 2026-11-01 – Everything in English, languages as files (steps 2b to 5 of the switch to English)
- The whole project is English now: code, identifiers, comments, log lines, launcher scripts and documentation. German remains as a language of the interface.
- **Languages are files.** The English text in the code is the key; each language is one file in `languages/` (`en.json`, `de.json`). A new language is a new file, nothing else (see README, "Adding a language"). Interface and server messages use the same files. Without a choice Grimmich follows the browser language; unknown languages fall back to English.
- Names in the interface code are English too (actions, element ids, CSS classes, values such as `draft`, `confirmed`, `open`), as are job names, command line arguments (`preview | write | undo`) and the launcher option `--force`.
- **Credentials files** are renamed once at start, with copies kept as `*.vor-englisch`: `immich_schreiben.env` → `immich_write.env`, `gramps_schreiben.env` → `gramps_write.env`. Variables inside: `GRAMPS_PASSWORT` → `GRAMPS_PASSWORD`, `IMMICH_ANKERALBUM` → `IMMICH_ANCHOR_ALBUM`, `SCHREIB_GETRENNT` → `SEPARATE_WRITE`, `GRAMPS_ZITAT_BILD` → `GRAMPS_CITATION_IMAGE`, `IMMICH_AKTIV` → `IMMICH_ACTIVE`, `GRAMPS_AKTIV` → `GRAMPS_ACTIVE`.
- `GRIMMICH_READ_ONLY` and `GRIMMICH_LANGUAGE` are the new environment variables; the old `GRIMMICH_NUR_LESEN` and `GRIMMICH_SPRACHE` still work.
- Not translated on purpose: what is written into Immich and Gramps (tags "Datierung geschätzt" / "Datierung offen", `[Grimmich]` and `[Quelle]` blocks, status words in the adoption document). Per-language default names for these are an open item.
- Old stored hint texts may stay German until the next "Update" recomputes them.
- Tests: new `tests/test_language.py` (per language: valid file, every used text translated, nothing unused, placeholders agree) and `TestEnv` in `tests/test_migration.py`.
- README in English and German (`README.de.md`). Entries before 0.9.34 are condensed below.

## 0.9.33 and 0.9.32 – 2026-11-01 – English names everywhere in the code and the data
- All files, folders, stored documents, field names, internal status words and API addresses have English names. The stored data is converted once, automatically, at the first start: Grimmich first makes a full copy (`grimmich.db.vor-englisch`), converts everything, converts each document back as a test and compares it with the original. Only if everything is identical, the switch counts (all or nothing). `python3 migration.py report` shows the numbers per document.
- What is written into your photos does not change (tags, blocks, status words in the text).
- The launcher folder is now `launcher/` (run `bash launcher/install.sh` once to recreate the menu entry), `tests/daten` is `tests/data`.
- Changed: digital photos (with camera data) in the working album are written like all others; the original is still backed up before every write.
- `GRIMMICH_READ_ONLY=1` lets you try Grimmich with all write jobs blocked.

## 0.9.31 – 2026-11-01 – Interface in English too
- The whole interface exists in German and English (about 780 texts). Grimmich takes the browser language; change it under the gear, "Language". Server messages follow the language too.
- What Grimmich writes into Immich and Gramps stays untranslated on purpose, so photos can be found again across languages.
- `GRIMMICH_PORT` (another port) for trying things next to the normal Grimmich.
- Tests check that every text has an English version and that placeholders match.

## 0.9.30 – 0.9.24 – 2026-11-01
- Photos that are no longer in the album stay in saved series and are marked "no longer in album"; they are never written.
- Launcher in the application menu (start with one click, stop via right click); Grimmich reacts to the TERM signal like Ctrl+C.
- Gramps ID on the person page is a link to the person in Gramps.
- Up to three named addresses (for example home network, Tailscale, online) for Immich and Gramps, with automatic or manual choice.
- New logo and favicon; `assets/` for the repository.
- Licence clarified: AGPL-3.0 (the face detection uses Ultralytics YOLO, AGPL-3.0; MiVOLO and DINOv2 are Apache-2.0).
- **Anchor album** instead of re-photographing periods: digital photos in it count as a safe date and are never written. Camera data in the working album no longer counts as a date. Writing the source into the Immich description is off by default.
- One access per service (Immich key, Gramps user); a separate write access is optional.
- Tidier interface: simpler header, one-line tasks, slim progress bar.

## 0.9.23 – 0.9.18 – 2026-10-31
- "Update" skips age estimation and series matching when nothing has changed (the first run after every update always calculates everything).
- Readable log, slimmer settings, one shared Immich access module (`immich.py`), `requirements.txt` and README.
- All working data lives in ONE SQLite file, `grimmich.db`; existing `.json` files are taken over automatically and moved to `json_alt` as a backup. `storage.py export` writes readable `.json` files.
- Search opens the chosen photo.

## 0.9.17 – 0.9.13 – 2026-10-31 – Tests
- Automatic tests for the write logic, the calculation, the Gramps date conversion, the rules of the interface, the large view, cover photo, timeline and sorting, and a walkthrough that visits 79 views and reports JavaScript errors and placeholders like "undefined".

## 0.9.12 – 0.9.0 – 2026-10-31
- AI age is shown for every person, also without a birth date (such people are still not used for dating).
- Cover photo of a series can be chosen with one click, also without a recognised face.
- Large view: rows for the timeline, series, album and sorting; arrows to browse; the clicked photo opens exactly this photo.
- Photos with a warning (date before birth or after death) are not written unless you tick "Also write photos with a warning".
- "What should be written?": scope (all photos or one album), only confirmed photos, content (date and tags, source, place). Digital photos get no source.
- **Places:** places come from Gramps (with parent places and coordinates), searchable, with suggestions (place of an assigned event, residence of a person on the photo, place of the neighbouring photo). A place applies to a whole series by default. Latitude and longitude are written to Immich; an existing different place in Immich is never replaced without confirmation.

## 0.8.x – 2026-10-31 – Kind: postcards, greeting cards, documents
- Every photo has a **kind**: photo (default), postcard, greeting card, document or other. Cards and documents are left out of sorting, person pages and automatic series suggestions; they may be put into series by hand. Their rough time (from … to) is only a hint; a range is written as an estimate. A tag with the kind is written to Immich and removed again when the kind is taken back.
- New measuring script `merkmale_test.py` (read-only, numbers only) checks whether colour, sepia, white border, grain and print raster reveal the year.

## 0.7.x – 0.6.0 – 2026-10-29
- **Only write confirmed photos** option.
- **Hints on the year:** neighbours in the album with a fixed year and similar already dated photos; "Unprocessed" inbox (a photo counts as processed once it is in a series or has a confirmed year). Series suggestion threshold for the whole image lowered from 0.90 to 0.80 (measured on real data).

## 0.5.x – 2026-10-28/29
- **To Gramps:** write photos as media objects (JPEG, at most 2000 pixels) with date, title, source (photo album), citation ("page N, photo M") and persons with face frames; preview before writing; undo for everything Grimmich created; Immich tag with the Gramps object number.
- **Life line** with genealogical symbols and marriages; **events:** assign photos to Gramps events, take an event date as an anchor.
- Series can be merged; suggestions show photos; large view with rows (series, album, visible photos); no calculated year after today.

## 0.4.0 – 0.1.0 – 2026-10-24 to 27
- 0.4.0: photo albums with pages and photo numbers ("source"), inbox for new scans, warnings, dates set by hand in Immich count as anchors, description block in Immich for estimates, interface tests against Gramps.
- 0.3.0: the tool is named **Grimmich**; new main screen with work list, life line from Gramps and photo detail; read-only Gramps bridge.
- 0.2.0: new scans are matched with existing series (suggestions only); detection of changes in Immich; writing to Immich with preview, backup and a second key.
- 0.1.0: age estimation with MiVOLO, series detection with DINOv2, calculation of the year from age and birth date; first browser interface; Immich read-only.
