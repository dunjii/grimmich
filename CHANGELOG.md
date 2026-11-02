# Grimmich – Änderungen

Grimmich (Gramps + Immich) datiert eingescannte Altfotos aus KI-Altersschätzung und bekannten Geburtsdaten
und bringt sie wieder in Immich und Gramps unter. Dieses Protokoll ist aus dem Arbeitsverlauf rekonstruiert,
die Zuordnung einzelner Punkte zu Tagen ist teils ungefähr.

## 0.9.41 – 2026-11-02 – One block in the description, kind tags per language
- **One block per photo** in the Immich description: `[GRM] ~1960 (1952–1968) · S038 [/GRM]`. `~` = estimated, no `~` = fixed date, `?` = open; then the series number (searchable in Immich) and, if switched on, the source. A fixed date alone gets no block. The marker is the same in every language and no longer contains words, so nothing in it has to be translated ("ca." is gone; the name of the person and their age are not written, Immich shows them anyway).
- Earlier blocks (`[Grimmich] ca. …`, `[Datierung automatisch] …`) and the separate source block (`[Quelle]` / `[Source]`) are recognised and replaced when a photo is written the next time; the preview shows how many photos that touches. A series of only one photo gets no number.
- **Kind tags per language** (`tag_postcard`, `tag_greeting_card`, `tag_document`, `tag_other` in `naming.py` and the `written` section of a language file). An installation that has already written keeps the German names (Ansichtskarte, Grußkarte, Dokument, Sonstiges (Grimmich)); a new installation takes its language (Postcard, Greeting card, Document, Other (Grimmich)). All spellings are recognised when reading.
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
- README in English and German (`README.de.md`). Entries below up to 0.9.33 are in German.

## 0.9.33 – 01.11.2026 – Englische Namen in den Daten (Etappe 2a der Umstellung auf Englisch)
- Alle gespeicherten Daten haben englische Namen: die 28 Dokumente (`korrekturen` → `corrections`, `fotos` → `photos`, `serien_arbeit` → `series_work` …), rund 200 Feldnamen (`jahr` → `year`, `von`/`bis` → `from`/`to`, `quelle` → `source`, `ort` → `place` …), interne Kennungen (`entwurf` → `draft`, `bestaetigt` → `confirmed`, `unveraendert` → `unchanged` …) und die Adressen der Programmschnittstelle (`/api/korrekturen` → `/api/corrections` …). Zwischenspeicher-Dateien heißen jetzt z. B. `estimate_cache.json`.
- **Einmalige automatische Umstellung beim ersten Start**: Grimmich legt zuerst eine vollständige Kopie an (`grimmich.db.vor-englisch`), stellt alles um, wandelt jedes Dokument zur Probe wieder zurück und vergleicht mit dem Original. Nur wenn alles identisch ist, gilt die Umstellung (ganz oder gar nicht). Bei einem Problem bleibt alles unverändert, Grimmich meldet es und startet nicht. `python3 migration.py report` zeigt danach pro Dokument die Zahlen vorher/nachher.
- Was in deinen Fotos steht, ändert sich nicht: Tags, `[Grimmich]`- und `[Quelle]`-Blöcke, Statuswörter im Text (manuell, bestätigt, Schätzung).
- Nach der Umstellung kann die alte Version die Datenbank nicht mehr lesen. Die Kopie `grimmich.db.vor-englisch` ist der Weg zurück.
- Die Zugangsdateien (`*.env`) und ihre Einträge sind noch unverändert (kommt in einer der nächsten Etappen).
- Neu: `tests/test_migration.py` (11 Prüfungen), `rename_map.py` (die Umbenennungstabellen), `migration.py`.

## 0.9.32 – 01.11.2026 – Englische Dateinamen (Etappe 1 der Umstellung auf Englisch) und Schreiben von Digitalfotos im Arbeitsalbum
- Alle Dateien und Ordner haben englische Namen. Programm: `addresses`, `anonymize`, `calculation`, `connections`, `credentials`, `estimate`, `gramps_write`, `immich_state`, `immich_write`, `messages`, `names`, `provenance`, `run_check`, `series`, `storage`. Oberfläche (`web/js`): `calibration`, `language`, `model`, `ordering`, `provenance`, `review`, in `ui/`: `actions`, `views`, `settings`, `event`, `hints`, `tile`, `header`, `list`, `places`, `write`, `series`, `sorting`, `search`. `starter/` heißt `launcher/` (`install.sh`, `grimmich-start.sh`, `grimmich-stop.sh`), `tests/daten` heißt `tests/data`.
- Deine Daten sind nicht betroffen (`grimmich.db`, `*.env` behalten ihre Namen). Der Menüeintrag „Grimmich“ muss einmal neu angelegt werden: `bash launcher/install.sh`.
- Geändert: Digitalfotos (mit Kamera-Daten), die im Arbeitsalbum liegen, werden beim Schreiben wie alle anderen behandelt. Der bisherige Schutz („nur überschrieben, wenn du es bestätigst“) entfällt, weil echte Digitalfotos ins Ankeralbum gehören und dort nie geschrieben wird. Das Original wird weiter vor jedem Schreiben gesichert.
- Die Testversion kann `grimmich.py` jetzt auch mit `GRIMMICH_NUR_LESEN=1` die Vorschau erstellen lassen (nur Schreibaufträge sind gesperrt).

## 0.9.31 – 01.11.2026 – Oberfläche auch auf Englisch (Stufe 1)
- Die ganze Oberfläche gibt es jetzt auf Deutsch und Englisch (ca. 780 Texte). Grimmich nimmt die Sprache des Browsers; umstellen unter dem Zahnrad, „Einzelschritte und Einstellungen“, „Sprache / Language“. Auf Deutsch sieht alles aus wie bisher.
- Auch die Meldungen des Servers (Verbindungstests, Fehlertexte, Vorschau-Hinweise beim Schreiben, Hinweise zu Schätzungen) folgen der Sprache. Neue Datei `texte.py`, Gegenstück zu `web/js/sprache.js`.
- Was Grimmich in Immich und Gramps hineinschreibt (Tags „Datierung geschätzt“ / „Datierung offen“, Blöcke `[Grimmich]` und `[Quelle]`), bleibt bewusst unübersetzt, damit sich Fotos über Sprachen hinweg wiederfinden.
- Zum Ausprobieren neben dem normalen Grimmich: `GRIMMICH_PORT` (anderer Port) und `GRIMMICH_NUR_LESEN=1` (keine Schreibaufträge nach Immich oder Gramps).
- Gespeicherte Texte (z. B. schon zugeordnete Gramps-Ereignisse) bleiben in der Sprache, in der sie gespeichert wurden.
- Noch nicht übersetzt (Stufe 2): Protokollzeilen der Skripte, Kommentare im Code.
- Tests: neuer `tests/test_sprache.py` (10 Prüfungen: jeder Text hat eine englische Fassung, Platzhalter stimmen); die Oberflächen-Tests laufen mit deutscher Browsersprache, der Rundgang zusätzlich auf Englisch und meldet deutsche Reste.

## 0.9.30 – 01.11.2026 – Fotos, die nicht mehr im Album liegen, in Serien markieren
- Gespeicherte Serien behalten ihre Fotos auch dann, wenn du sie aus Arbeits- und Ankeralbum genommen hast (eine Serie ist deine Entscheidung). Diese Fotos sind jetzt sichtbar markiert: blass und gestrichelt, mit dem Vermerk „nicht mehr im Album“, in der Serienansicht und in der Leiste des gewählten Fotos. In der Serienüberschrift steht, wie viele es sind.
- Die Fotos werden nie geschrieben. Du entfernst sie selbst mit „Entfernen“ in der Serienansicht. Es wird nichts automatisch gelöscht.
- Neuer UI-Test (5 Prüfungen).

## 0.9.29 – 01.11.2026 – Starter im Anwendungsmenü
- Neu: Ordner `starter` mit `installieren.sh`. Danach gibt es im Anwendungsmenü den Eintrag „Grimmich“ (mit Logo). Ein Klick startet Grimmich im Hintergrund und öffnet den Browser; läuft es schon, wird nur der Browser geöffnet. Kein Terminal nötig.
- Beenden: Rechtsklick auf den Menüeintrag, „Grimmich beenden“ (oder `starter/grimmich-beenden.sh`). Läuft gerade ein Auftrag, wird nicht beendet.
- Grimmich reagiert jetzt auch auf das Beenden-Signal (TERM) wie auf Strg+C. Der alte Start im Terminal funktioniert unverändert.
- Meldungen des Starters stehen in `grimmich-start.log` im Grimmich-Ordner.

## 0.9.28 – 01.11.2026 – Gramps-ID auf der Personenseite als Link
- In der Zeile der Personenseite („… · Gramps I0458 zugeordnet“) ist die Gramps-ID jetzt ein Link mit kleinem „im neuen Fenster öffnen“-Symbol. Er öffnet die Personenseite in Gramps in einem neuen Tab.
- Die Adresse folgt den Adress-Einstellungen: Grimmich nimmt die gerade gültige Gramps-Adresse (von Hand gewählt oder automatisch). Ohne gültige Adresse bleibt die ID einfacher Text.
- Grenze: Der Link wird in deinem Browser geöffnet. Die Adresse muss von dem Gerät aus erreichbar sein, an dem du sitzt.
- Tests: 2 neue Python-Tests, 7 neue UI-Prüfungen (Adresse, neuer Tab, Schrägstrich, fremdes Schema).

## 0.9.27 – 01.11.2026 – Adressauswahl (Heimnetz, Tailscale, online)
- Immich und Gramps können bis zu drei Adressen mit Namen haben (z. B. „Heimnetz“, „Tailscale“, „Online“). Eine einzige Adresse reicht, dann bleibt alles wie bisher. Alte Einstellungen (`IMMICH_URL`, `GRAMPS_URL`) gelten unverändert als erste Adresse.
- Wahl der Adresse: „Automatisch die erste erreichbare Adresse nehmen“ (bei Immich standardmäßig an) oder von Hand über „Verbinden über“ (bei Gramps standardmäßig). Grimmich springt nie von selbst zwischen Adressen, wenn du „von Hand“ gewählt hast. Bei Gramps ist automatisch bewusst aus, weil eine Testkopie und das echte Gramps zwei verschiedene Datenbestände sind.
- Der Verbindungstest nennt die benutzte Adresse. Im Einstellungsfenster steht „verbunden über: …“.
- Grenze: Bei einem eigenen Schreib-Benutzer für Gramps gilt weiter eine einzelne Adresse für das Schreiben.
- Neu: `adressen.py`, `tests/test_adressen.py` (14 Tests), UI-Tests für die Adressfelder.

## 0.9.26 – 01.11.2026 – Logo und Favicon
- Neues Logo (Foto mit Eckenhaltern und einer Person darauf, Petrolblau, Creme, Ocker). Es steht in der Kopfzeile und als Favicon im Browser-Tab (`web/favicon.svg`, `web/favicon.png`).
- Für das Repository: `assets/logo.svg`, `assets/logo-512.png` und `assets/social-preview.png` (1280×640, als „Social preview“ bei GitHub einstellbar). Das Logo steht oben im README.
- Das Logo ist eigens für Grimmich gezeichnet und steht wie der Rest unter AGPL-3.0.

## 0.9.25 – 01.11.2026 – Lizenz geklärt
- Grimmich steht unter AGPL-3.0 (Copyright dunjii). Grund: Die Gesichts- und Personenerkennung (Ultralytics YOLO samt Gewichten) steht unter AGPL-3.0, MiVOLO (Code und Modell) und DINOv2 unter Apache-2.0. Geprüft am 01.11.2026 anhand der Modellseiten.
- README: neuer Abschnitt „Lizenz“ mit Tabelle der verwendeten Modelle (deutsch und englisch). Der Lizenztext (`LICENSE`) kommt beim Anlegen des GitHub-Repositorys dazu (siehe unten).
- Keine Änderung am Programm.

## 0.9.24 – 01.11.2026 – Ankeralbum, ein Zugang pro Dienst, aufgeräumte Oberfläche
- **Ankeralbum statt Abfotografier-Zeiträume.** In den Einstellungen gibt es ein Feld „Ankeralbum“. Digitalfotos darin gelten als sicheres Datum (Anker). Grimmich liest dieses Album nur und schreibt dort nie etwas (weder Datum noch Quelle noch Ort).
- Kamera-Daten im Arbeitsalbum zählen nicht mehr als Datum. Grimmich meldet beim Lauf, wie viele Digitalfotos im Arbeitsalbum statt im Ankeralbum liegen. Beim Schreiben werden solche Fotos nicht überschrieben, außer du bestätigst es ausdrücklich.
- Die Einstellungen für die Zeiträume sind weg. Vorhandene Einträge in `immich.env` (ABFOTO_…) werden nicht mehr gelesen und stören nicht.
- Die Quelle in die Immich-Beschreibung zu schreiben ist jetzt standardmäßig aus (Quelle bleibt in Grimmich und Gramps).
- **Ein Zugang pro Dienst.** Immich und Gramps brauchen nur noch einen Schlüssel bzw. Benutzer. Wer Lesen und Schreiben trennen will, setzt den Haken „Zum Schreiben einen anderen Schlüssel/Benutzer verwenden“. Bestehende Schreib-Zugänge bleiben erhalten und gelten weiter (bei vorhandener Datei ist der Haken gesetzt); Haken weg heißt nicht, dass sie gelöscht werden.
- **Oberfläche aufgeräumt:** Kopfzeile ohne doppelte Zahlen (nur Immich/Gramps-Punkte), Aufgaben in der linken Liste einzeilig mit Zahl (Erklärung beim Darüberfahren), „Gewähltes Foto“ schmal, solange nichts gewählt ist, Lebenslinie ohne Gramps nur ein ruhiger Satz, „Änderungen prüfen“ mit schlanker Fortschrittsleiste statt drei Karten, kurzer Hinweis „Zum Schreiben fehlt ein Zugang“ mit Knopf zu den Einstellungen.
- Neu: `zugangsdatei.py`, `tests/test_anker.py` (18 Tests), UI-Tests für Anker, Quelle-Standard und Schalter.

## 0.9.23 – 31.10.2026 – Aktualisieren überspringt, was sich nicht geändert hat
- „Aktualisieren“ prüft nach „Namen laden“ und „Änderungen in Immich prüfen“, ob sich etwas geändert hat. Wenn nicht (gleicher Stand in Immich, gleiche bestätigte Serien, gleiche Arten, gleiche Textdateien, gleiche Version), werden Altersschätzung und Serien-Abgleich übersprungen. Das Protokoll sagt es ausdrücklich. Im Zweifel läuft alles.
- Der erste Lauf nach jedem Update rechnet immer vollständig. Wer neu rechnen will, startet die Einzelschritte im Zahnrad.
- Ein unerwarteter Fehler in einem Auftrag lässt die Anzeige „läuft“ nicht mehr hängen.
- Neu: `lauf.py`, `tests/test_lauf.py` (15 Tests, mit Platzhalter-Skripten für den ganzen Ablauf).

## 0.9.22 – 31.10.2026 – Protokoll lesbar
- Das „Protokoll des letzten Laufs“ war hell auf hell geschrieben und nur beim Markieren sichtbar. Jetzt dunkle Schrift auf hellem Grund. Test dafür ergänzt.

## 0.9.21 – 31.10.2026 – Schlankere Einstellungen
- Zahnrad-Fenster aufgeräumt: Der Schlüssel zum Schreiben, die Abfotografier-Zeiträume und die Gramps-Zugangsdaten zum Schreiben stehen in einklappbaren Bereichen (aufgeklappt, wenn noch nichts eingetragen ist bzw. ein Zeitraum gilt).
- Immich: ein Knopf „Testen“ prüft Lese- und (falls vorhanden) Schreib-Schlüssel nacheinander.
- Gramps: Lesen und Schreiben stehen in einer Spalte. „Eichung“ und „Gramps-Probe holen“ wanderten zu den Einzelschritten.
- Neu: `tests/ui_einstellungen_test.py`.

## 0.9.20 – 31.10.2026 – Ein gemeinsamer Immich-Zugriff, Aufräumen
- Der Zugriff auf Immich steht jetzt nur noch an EINER Stelle (`immich.py`). Vorher gab es sechs eigene Kopien in Schätzen, Stand, Schreiben, Herkunft, Gramps und der Oberfläche. Fehlermeldungen sind überall gleich, ein Verbindungsfehler wird in allen Teilen gleich erkannt.
- Überflüssige Importe entfernt, alte „mivolo-test“-Hinweise in Texten korrigiert.
- Neu: `requirements.txt`, `README.md` (Deutsch und Englisch).
- Neu: `tests/test_immich.py` (12 Tests mit einem nachgebauten Immich-Server).

## 0.9.19 – 31.10.2026 – Tests für Gramps und Ereignis-Marker
- Nur Tests, am Programm ändert sich nichts.
- `tests/test_gramps.py` (15 Tests): Datumsumwandlung nach Gramps und die Gramps-Vorschau (neu, schon vorhanden, neue Quelle nur einmal, Person nicht gefunden).
- `tests/ui_gramps_test.py` (43 Prüfungen): Namensabgleich Immich–Gramps (sicher/Vorschlag/unklar, Geburtsname, Umlaute, Rufname, Jahrestoleranz), Ereignis-Texte und das Übernehmen von Ereignissen als Marker (Position, Ungenauigkeit, Speichern).

## 0.9.18 – 31.10.2026 – Datenbank statt vieler Dateien
- Alle Arbeitsdaten (Fotos, Serien, Korrekturen, Zuordnungen, Schreibstand …, 27 Dokumente) liegen jetzt in EINER Datenbankdatei `grimmich.db` (SQLite). Die Form der Daten ist unverändert, nur der Speicherort wechselt.
- Beim ersten Start werden die vorhandenen `.json`-Dateien automatisch übernommen und danach in den Ordner `json_alt` verschoben (Sicherung, wird nie überschrieben).
- Neu: `speicher.py export` schreibt alle Dokumente als lesbare `.json`-Dateien in den Ordner `export` (zum Weitergeben).
- `anonymisieren.py` liest direkt aus der Datenbank.
- Zwischenspeicher (`schaetzung_cache*.json`, `gramps_cache.json`, Proben) bleiben Dateien.
- Neu: `tests/test_speicher.py` (15 Tests: Übernahme ohne Datenverlust, Sicherung, Export, parallele Zugriffe).

## 0.9.17 – 31.10.2026 – Suche öffnet das Foto
- Suche: Klick auf einen Foto-Treffer zeigt das Foto jetzt immer unter „Gewähltes Foto“. Bisher klappte das nur bei Fotos mit benannter Person; sonst öffnete sich „Alle Fotos“ ohne Auswahl.
- Neuer Test `tests/ui_suche_test.py`.

## 0.9.16 – 31.10.2026 – Rundgang und Rechen-Tests
- `tests/test_rechnen.py`: 11 Tests für die Datierungsrechnung (Geburtsgrenze, nie nach heute, Personen ohne Geburtsdatum, Widersprüche, Serien).
- `tests/ui_rundgang.py`: besucht 79 Ansichten und meldet JavaScript-Fehler, leere Ansichten und Platzhalter wie „undefined“ oder „NaN“.

## 0.9.15 – 31.10.2026 – Tests für Großansicht, Sammelfoto, Zeitschiene und Sortierung
- `tests/ui_lightbox_test.py`: 17 Prüfungen (Reihen der Großansicht in Zeitschiene und Sortierung, Blättern von Sammelfoto zu Sammelfoto, Sammelfoto wechseln und behalten, angeklicktes Foto öffnet genau dieses Foto, auch als Einzelfoto in Vorschlagslisten). Wie `ui_test.py` nur für die Entwicklung (braucht Playwright).

## 0.9.14 – 31.10.2026 – Tests für die Regeln der Oberfläche
- `tests/ui_test.py`: 27 Prüfungen für `schreibZeilen` (Warnungen, „nur bestätigte“, Inhalt Datum/Quelle/Ort, Album-Auswahl, Fotos mit eigenem Immich-Datum, Digitalfotos ohne Quelle). Braucht Playwright, ist nur für die Entwicklung gedacht und startet Grimmich selbst mit den anonymisierten Daten aus `tests/daten`.
- Die Daten in `tests/daten` sind jetzt vollständig (22 Dateien).

## 0.9.13 – 31.10.2026 – Automatische Tests für die Schreiblogik
- Neuer Ordner `tests` mit 19 Tests für `schreiben.py` (Datum, Tags, „nur Quelle“, Ort, Schutz von Hand gesetzter Daten, Wiederholbarkeit: ein zweiter Lauf darf nichts Neues ergeben). Aufruf: `./.venv/bin/python -m unittest discover -s tests -v`.
- Teil der Tests nutzt anonymisierte Daten aus `tests/daten`.

## 0.9.12 – 31.10.2026 – Zweiter Abfotografier-Zeitraum
- Einstellungen → Immich: Neben dem Zeitraum für abfotografierte Papierfotos gibt es jetzt einen zweiten (optional). Kamera-Daten aus diesen Tagen gelten nicht als sicheres Datum. Gedacht für Scanner, die Kamera-Daten (EXIF) schreiben, und für mehrere Scan-Tage.

## 0.9.11 – 31.10.2026 – KI-Alter auch für Personen ohne Geburtsdatum
- Die Altersschätzung (schaetzen.py) übersprang bisher alle Personen ohne Geburtsdatum, deshalb stand bei ihnen überall „KI –“. Jetzt wird ihr Alter auch geschätzt und angezeigt. Zum Datieren werden sie weiterhin nicht benutzt, solange das Geburtsdatum fehlt.
- Damit die Werte erscheinen, muss einmal „Aktualisieren“ laufen (die neuen Gesichter werden dabei zum ersten Mal ausgewertet).

## 0.9.10 – 31.10.2026 – KI-Alter immer sichtbar
- Zeitschiene: Jede Kachel zeigt das KI-Alter der Person („KI-Alter ca. 45 J“), auch wenn kein Geburtsdatum bekannt ist. Fotos „Noch ohne Jahr“ sind nach KI-Alter geordnet (jung zuerst).
- Gewähltes Foto: Ohne Geburtsdatum steht „KI-Alter ca. 45 J“ bei der Person (vorher nur „KI 45“ hinter einem Gedankenstrich).

## 0.9.9 – 31.10.2026 – Sammelfoto auch ohne erkanntes Gesicht
- Das Sammelfoto einer Serie lässt sich jetzt auf jedes Foto der Serie setzen, auch wenn die Person darauf nicht erkannt wurde (vorher passierte dann nichts). Beim Sortieren erscheint dann das ganze Bild statt des Gesichtsausschnitts.

## 0.9.8 – 31.10.2026 – Sammelfoto ohne extra Klick
- Ein kleines Bild einer Serie in „Gewähltes Foto“ anzuklicken macht es in der Personenansicht gleich zum Sammelfoto in Zeitschiene und Sortierung. Der Knopf „Als Sammelfoto verwenden“ entfällt, die Wahl bleibt gespeichert.

## 0.9.7 – 31.10.2026 – Zeitschiene und Sortierung in der Großansicht, Sammelfoto wählbar
- **Zeitschiene:** Die Großansicht blättert jetzt durch die Sammelfotos der Zeitschiene (eine Kachel je Serie), auch wenn man ein anderes Foto der Serie geöffnet hat. „Serie“ und „Album“ bleiben als weitere Reihen wählbar.
- **Nach Aussehen sortieren:** Die Großansicht hat nur noch die Reihe der Sortierung (von jung nach alt), ohne Serie und Album.
- **Sammelfoto ändern:** Bei einer Serie in der Personenansicht gibt es in „Gewähltes Foto“ den Knopf „Als Sammelfoto verwenden“. Das gewählte Foto steht dann für die Serie in Zeitschiene und Sortierung.

## 0.9.6 – 31.10.2026
- Großansicht: Der Name der Reihe heißt „Zeitschiene Oma“ statt „Zeitschiene Oma ?“ (das „?“ kam von Vornamen ohne Nachnamen).

## 0.9.5 – 31.10.2026 – Großansicht: Reihe der Zeitschiene
- In der Großansicht gibt es jetzt auch die Reihe der aktuellen Ansicht (bei einer Person: „Zeitschiene <Name>“), in der Reihenfolge der Kacheln. Eine Serie zählt dabei mit allen ihren Fotos. Bisher fehlte diese Reihe, wenn man ein Foto einer Serie öffnete.

## 0.9.4 – 31.10.2026 – Fotos mit Warnung werden nicht geschrieben
- Fotos mit Warnung (Datum vor der Geburt oder nach dem Tod einer Person auf dem Foto) kommen nicht mehr in die Vorschau und werden nicht nach Immich geschrieben.
- Im Block „Was soll geschrieben werden?“ gibt es dafür den Haken „Auch Fotos mit Warnung schreiben“ (standardmäßig aus; erscheint nur, wenn es Warnungen gibt).

## 0.9.3 – 31.10.2026 – Großansicht öffnete das falsche Foto
- Klick auf ein einzelnes Foto, zum Beispiel unter „Weitere neue Fotos“ bei den Serienvorschlägen, öffnete ein ganz anderes Foto (das erste einer anderen Fotoreihe, etwa eines Albums). Die angeklickte Reihe bleibt jetzt immer erhalten.

## 0.9.2 – 31.10.2026 – Was soll geschrieben werden?
- Neuer Block **„Was soll geschrieben werden?“** bei „Änderungen an Immich“: **Umfang** (alle Fotos oder ein Album), **nur bestätigte Fotos** (auch nur die eines Albums) und **Inhalt** (Datum und Tags, Quelle, Ort einzeln ein- und ausschaltbar).
- Ändert sich eine Einstellung, weist die Vorschau darauf hin, dass sie neu erstellt werden muss.
- **Digitalfotos (Kameradatum) bekommen keine Quelle** mehr, weil sie keine Albumscans sind.
- Zähler der Vorschau korrigiert: Fotos, bei denen nur Quelle oder Ort geschrieben wird, zählen nicht mehr als „Datierung offen“.

## 0.9.1 – 31.10.2026 – Vorschau zeigt, was geschrieben wird
- Fotos mit festem Datum (zum Beispiel Digitalfotos mit Kameradatum), bei denen nur die Quelle oder der Ort geschrieben wird, zeigen das jetzt in der Vorschau: „Nur die Quelle (Album, Seite, Foto) in die Beschreibung, das Datum bleibt“, dazu den Text der Beschreibung.

## 0.9.0 – 31.10.2026 – Orte
- Neuer Bereich **Ort** bei „Gewähltes Foto“. Die Orte kommen aus Gramps (Name mit übergeordneten Orten, Koordinaten, auch im Format N51.29.0 oder 51° 29' 0" N) und werden einmal geladen und zwischengespeichert („Neu laden“ holt sie frisch).
- **Suche mit Vorschlagsliste:** beim Tippen erscheinen passende Orte (Name oder Gramps-Nummer, ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute).
- **Vorschläge** in dieser Reihenfolge: Ort eines dem Foto zugeordneten Ereignisses, Wohnort einer Person auf dem Foto, wenn das Jahr zum Zeitraum des Wohnort-Ereignisses passt, und der Ort des nächsten Nachbarfotos im Album, das schon einen hat.
- **Serien:** Ein gesetzter Ort gilt standardmäßig für alle Fotos der Serie. Mit „nur für dieses Foto“ bekommt ein einzelnes Foto einen anderen Ort. Weichen Fotos voneinander ab, steht ein Hinweis da, mit „Auf alle Fotos der Serie anwenden“.
- **Orte ohne Koordinaten** lassen sich wählen, werden aber nicht nach Immich geschrieben (Hinweis im Detail).
- **Schreiben nach Immich:** Latitude und Longitude werden gesetzt. Hat das Foto in Immich schon einen anderen Ort, wird er nie ohne deine Bestätigung ersetzt („Ort in Immich überschreiben“ in der Vorschau). Ein Foto mit Ort wird auch bei „Nur bestätigte Fotos schreiben“ und bei Fotos mit deinem Immich-Datum geschrieben, dann geht nur der Ort. „Alles rückgängig machen“ stellt einen früheren Ort wieder her. Wo vorher kein Ort stand, bleibt er stehen (Immich lässt sich nicht leeren).
- Gespeichert wird in `ortszuordnung.json`.

## 0.8.2 – 31.10.2026 – Grobe Zeit einer einzelnen Karte ist ihre Schätzung
- Bei einer einzelnen Karte (oder einer Serie nur aus Karten) wird die **grobe Zeit** als Schätzung angezeigt („ca. 1910, Spanne 1905 bis 1915“). „Als Anker setzen“ macht daraus das Datum, „Jahr eintragen“ erlaubt ein genaues Jahr. Vorher blieb die Datierung leer.
- Eine Karte mit Spanne wird nach Immich weiter als Schätzung („ca. 1910 (1905-1915)“, Tag „Datierung geschätzt“) geschrieben, auch wenn du sie bestätigt hast.
- Eingabefelder für die grobe Zeit breiter, Texte klarer.

## 0.8.1 – 31.10.2026 – Karten in Serien, grobe Zeit der Karte
- Karten und Dokumente dürfen **von Hand** in Serien (auch gemischt mit Fotos). Beim Umstellen der Art bleibt ein Foto in seiner Serie. Automatische Serienvorschläge schließen Karten weiter aus. Eine Serie, die nur aus Karten besteht, steht unter „Karten und Dokumente“, eine gemischte Serie bleibt in der Sortierung.
- Bei Fotos mit Art gibt es ein Feld **Grobe Zeit der Karte (von … bis)**. Sie ist nur ein Hinweis und wird nicht als Datum geschrieben. Bei einer Serie mit Karte erscheint der Bereich **Karten in dieser Serie**: Die Karte setzt eine feste Untergrenze (vor ihrem Druck kann das Foto kaum entstanden sein) und eine weiche Obergrenze (grobe Zeit plus 10 Jahre). Er zeigt, was zusammen mit der Schätzung der Serie übrig bleibt, und warnt bei Widerspruch. Wird die Serie bestätigt, bekommt die Karte deren Datum.
- Die Art wird jetzt als Eintrag mit grober Zeit gespeichert. Alte Einträge aus 0.8.0 werden weiter gelesen.

## 0.8.0 – 31.10.2026 – Art: Ansichtskarten, Grußkarten, Dokumente
- Jedes Foto hat jetzt eine **Art**: Foto (Standard), Ansichtskarte, Grußkarte, Dokument oder Sonstiges. Setzen in der rechten Spalte („Art“) oder für mehrere Einheiten über die Auswahlleiste („Art: Karte, Dokument …“). Gespeichert in `arten.json`.
- Karten und Dokumente erscheinen **nicht** in der Sortierung, den Personenseiten, „Unbearbeitet“, „Ohne Schätzung“ und den Serienvorschlägen (auch serien.py lässt sie beim Aktualisieren aus). Ein Foto in einer Serie wird beim Umstellen aus der Serie genommen. Sie bleiben im Album, mit Quelle.
- Neue Aufgabe **Karten und Dokumente** in der Arbeitsliste, mit der Zahl der Karten ohne Datum. Das Datum trägst du mit „Jahr eintragen“ ein, auch als Spanne („von … bis“). Eine Spanne wird nach Immich als Mitte mit „ca.“-Notiz geschrieben.
- Bei Karten zeigen die Hinweise zum Jahr nur Albumnachbarn, mit dem Zusatz, dass das Einkleben nur eine Obergrenze ist. Bildähnlichkeit wird bei Karten nicht benutzt.
- Beim Schreiben nach Immich bekommen Karten einen Tag (Ansichtskarte, Grußkarte, Dokument, Sonstiges (Grimmich)). Wird die Art zurückgenommen, wird der Tag beim nächsten Schreiben entfernt. „Nur bestätigte Fotos schreiben“ gilt auch hier.
- Neues Messscript `merkmale_test.py`: prüft an deinen datierten Fotos, ob Farbe, Sepia, weißer Rand, Körnung und Druckraster das Jahr verraten (nur lesen, nur Zahlen).

## 0.7.1 – 29.10.2026 – Nur bestätigte Fotos schreiben
- Im Fenster „Änderungen an Immich“ gibt es die Option **Nur bestätigte Fotos schreiben**. Ist sie an, werden Entwürfe, Schätzungen und offene Fotos in Immich nicht angefasst (kein Datum, kein Tag, keine Quellennotiz). Die Einstellung wird im Browser gemerkt. Nach einer Änderung muss die Vorschau neu erstellt werden.

## 0.7.0 – 29.10.2026 – Hinweise zum Jahr
- **Hinweise zum Jahr** (rechte Spalte bei Fotos ohne festes Jahr) ersetzt „Ähnliche datierte Fotos“: zeigt Albumnachbarn mit festem Jahr (bis 10 Plätze, ohne das Sammelalbum = größtes Album) und ähnliche Fotos mit festem Jahr (ab 0,75), mit einer Zusammenfassung („sprechen für etwa 1958“ oder „widersprechen sich“). „Als Entwurf übernehmen“ setzt ein Entwurf, kein bestätigtes Jahr.
- **Serien-Vorschläge:** Schwelle für das Ganzbild von 0,90 auf 0,80 gesenkt (Messung an deinen Daten: ab 0,80 gehören etwa 92 % der Paare in dieselbe Serie; bei 0,90 hatten nur 4 Einzelfotos einen Nachbarn, bei 0,80 sind es 74). Neue Vorschläge erscheinen nach dem nächsten „Aktualisieren“, Bestehendes bleibt unangetastet.
- Messscripte statistik.py, aehnlich_test.py, aehnlich_schwelle.py, serien_album_test.py (nur lesend, anonymisiert).

## 0.6.0 – 29.10.2026 – Unbearbeitet und ähnliche datierte Fotos
- **Eingang/„Neu“:** zeigt jetzt „Noch unbearbeitete Fotos“. Ein Foto gilt als bearbeitet, sobald es in einer Serie liegt oder ein bestätigtes Jahr hat (auch ein festes Datum aus Immich). Abhaken entfällt. Die Fotos sind nach Album gruppiert (kleinstes Album gewinnt, das Sammelalbum bleibt außen vor), in Albumreihenfolge, die Gruppen lassen sich auf- und zuklappen.
- **Ähnliche datierte Fotos:** bei Fotos ohne festes Jahr zeigt die Detailspalte die ähnlichsten schon datierten Fotos mit Jahr und Ähnlichkeitswert. „Jahr übernehmen“ oder „Zur Serie hinzufügen“, nichts geschieht automatisch. Grundlage ist der Zwischenspeicher serien_cache.npz (neuer Server-Aufruf /api/aehnlich).

## 0.5.5 – 29.10.2026 – Großansicht mit Reihen
- Die Großansicht zeigt oben die Reihen, durch die man blättern kann (Serie, Album, sichtbare Fotos), und unten „3 von 5 in Serie S011“.
- ←/→ blättern in der aktiven Reihe, ↑/↓ wechseln die Reihe, Klick auf eine Reihe ebenso. Das aktuelle Foto bleibt dabei erhalten.

## 0.5.4 – 29.10.2026 – Serienvorschläge mit Fotos
- Die Vorschläge „könnten zu einer Serie gehören“ zeigen jetzt die Fotos der beteiligten Serien und der neuen Fotos (klickbar für die Großansicht), nicht mehr nur Nummern.

## 0.5.3 – 29.10.2026 – Serien zusammenfassen
- In der Serienansicht hat jede Serie ein Häkchen. Mehrere Serien (auch mit einzelnen Fotos) lassen sich wie bei den Kacheln über „Zu einer Serie zusammenführen“ vereinen.

## 0.5.2 – 29.10.2026 – Foto in der Detailspalte
- Behoben: Bei langer Detailspalte (vor allem bei Serien) wurde das Foto auf wenige Pixel zusammengedrückt. Die Spalte scrollt jetzt stattdessen.

## 0.5.1 – 28.10.2026 – Obergrenze heute
- Kein errechnetes Jahr und keine Spanne liegt mehr nach heute; Hinweis „Schätzung liegt in der Zukunft (auf heute begrenzt)“.
- Die Version steht unten im Einstellungsfenster.

## 0.5.0 – 28.10.2026 – Nach Gramps, Ereignisse
- **Nach Gramps:** Fotos als Medienobjekte nach Gramps schreiben (JPEG, höchstens 2000 Pixel), mit Datum
  (genau oder „geschätzt zwischen …“), Titel nach Wahl (Quelle/Fundstelle, Nachname/Vorname, eigener Titel),
  Quelle (Fotoalbum) und Zitat „Seite N, Foto M“, Personen mit Gesichtsrahmen. Vorschau vor dem Schreiben,
  Rückgängig für alles, was Grimmich angelegt hat. Nur bestätigte Fotos.
- Immich-Tag mit Objektnummer (zum Beispiel `Gramps/O0458`) nach dem Schreiben; Foto-Marke „Gramps“ in den Kacheln.
- Album-Auswahl, wenn ein Foto in mehreren Alben liegt; Foto optional auch am Zitat (Fundstelle) als Bild.
- Einstellungen: eigener Zugang „Gramps Web zum Schreiben“ (Rolle Editor) mit Test.
- **Lebenslinie:** genealogische Zeichen (∗ † ⚭ …), Beschriftungen am Ende laufen nicht mehr über den Rand,
  Heirat wird anhand der Familie richtig zugeordnet (Partner statt Kind), Geschwister und weitere Verwandte nur auf
  Wunsch, Ort in Klammern („Wohnort (Halle)“).
- **Ereignisse:** Fotos Gramps-Ereignissen zuordnen (mehrere möglich, Vorschläge nach Zeitraum und Personen),
  Datum eines Ereignisses als Anker übernehmen, Seitenleiste „Ereignisse“, Verknüpfung Foto–Ereignis nach Gramps.
- Fehler behoben: Verbindungstest meldete „429“ (zu viele Anmeldungen), Fortschrittsanzeige zeigte OpenCV-Warnungen,
  „Alle wählen“ im Gramps-Fenster schaltete stattdessen die Lebenslinie um.

## 0.4.0 – 27.10.2026 – Quelle, Alben, Anker
- Fotoalben mit Seiten und Foto-Nummern („Quelle“), Eingang für neue Scans, Warnungen (Foto vor Geburt/nach Tod).
- Von Hand in Immich gesetzte Daten gelten als Anker; „Marker“ heißt überall „Anker“.
- Beschreibungsblock in Immich: `[Grimmich] ca. 1984 (1974-1993) [/Grimmich]` (nur bei Schätzungen).
- Personen mit Nachnamen „Unbekannt“ werden so angezeigt.
- Schnittstellentests gegen Gramps (Docker-Kopie und grampshub).

## 0.3.0 – 26.10.2026 – Name „Grimmich“, Gramps-Brücke, neue Oberfläche
- Das Werkzeug heißt jetzt **Grimmich**.
- Neue Oberfläche: ein Hauptbildschirm mit Arbeitsliste, Lebenslinie aus Gramps und Foto-Detail; Schreiben als
  geführter Ablauf mit Kacheln statt Tabelle.
- Gramps-Brücke (nur lesend): Personen zuordnen, Ereignisse laden, Ereignisse als Anker in die Sortier-Reihe übernehmen.
- Immich-Adresse und Schlüssel im Zahnrad einstellbar.

## 0.2.0 – 25.10.2026 – Oberfläche v2, Schreiben nach Immich
- Oberfläche mit Vorbereiten / Zeitleiste / Übernehmen; neue Scans werden automatisch mit vorhandenen Serien abgeglichen
  (nur als Vorschlag).
- Erkennung von Änderungen in Immich (neue Namen, Zuordnungen, gedrehte Bilder), Alter der Personen hinter dem Namen.
- Schreiben nach Immich mit Vorschau, Sicherung und zweitem Schlüssel; Regel: Datum für geschätzte Fotos mit Tag
  „Datierung geschätzt“ und Spanne in der Beschreibung.

## 0.1.0 – bis 24.10.2026 – Anfang
- Altersschätzung mit MiVOLO, Serien-Erkennung mit DINOv2, Rechnung von Alter und Geburtsdatum zum Jahr.
- Erste Browser-Oberfläche; Immich nur lesend.
