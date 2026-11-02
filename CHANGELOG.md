# Grimmich – Changelog

Grimmich (Gramps + Immich) dates scanned old photos from AI age estimates and known birth dates
and puts the results back into Immich and Gramps. This log is reconstructed from the working history; the assignment of single points to days is partly approximate.

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
