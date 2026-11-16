# Orte und Parkplatz: Gedanken und offene Punkte

Stand: 13.11.2026, nach Version 0.10.15. Nichts davon ist gebaut, solange nicht „los“ gesagt wurde.

## 1. Orte-Modell (vereinbart)

Drei Quellen für Orte: Immich (Sammelpunkte mit Koordinaten), Gramps (Orte mit Hierarchie) und eigene Grimmich-Orte. Nicht jedes Foto braucht einen Gramps-Ort.

- **Schritt 1 (fertig, 0.10.14/0.10.15):** Ortsfenster mit Karte, Suche (lokal + Internet per Enter), Pin setzen, eigener Ort anlegen.
- **Schritt 2 (offen):**
  - Eigene Orte bekommen „Gehört zu“ (Oberort).
  - Eigene Orte mit Gramps-Orten verknüpfen: wenn es den Ort in Gramps schon gibt, oder wenn ein Foto nach Gramps geht (dann dort anlegen, mit Vorschau vor dem Schreiben).
  - Orte, die in Gramps schon einem Foto zugeordnet sind, werden automatisch verknüpfte Grimmich-Orte (vom Nutzer genehmigt).
  - Abgleich Immich ↔ Gramps vereinfachen: Liste nach Gramps-Orten sortiert, nächster Treffer als Vorschlag, Knopf „Alle Vorschläge unter 100 m übernehmen“.
  - Technisch: `connections.gramps_orte` muss den Eltern-Handle speichern; danach einmal „Orte neu laden“.
- **Schritt 3 (offen):** Karte als Hauptansicht unter „Orte“.

## 2. Orte-Seite: Zeichnung vom 13.11. (`orteseite.png`)

Rückmeldung des Nutzers:
- Karte in der Mitte und Fotos darunter: **passt so**.
- **Rechts muss weiterhin Platz für das angeklickte Foto (Seitenleiste) bleiben.** Die Ortsliste darf diesen Platz nicht belegen.
- Die rechte Liste (Sammelpunkte, Ohne Koordinaten, Hierarchie) war **zu unübersichtlich**. Neu überlegen, noch nicht entschieden.

Ideen für die Liste, noch zu sortieren:
- Aufgaben (abgleichen, ohne Koordinaten) und Hierarchie trennen, nicht alles in einen Block.
- Aufgaben evtl. hinter einem Knopf/Zähler („3 Orte abgleichen“) in einem eigenen Fenster statt dauerhaft sichtbar.
- Hierarchie evtl. nur als Baum zum Aufklappen, links neben oder statt der Liste.
- Pro Schritt nur eine Sache auf dem Bildschirm.

## 3. Geparkte Themen

- **Notizen → Immich:** zweiseitige Synchronisation über den GRM-Block mit Zeitstempeln. Standardmäßig nur eigene Notizen, Spielernotizen nur einzeln und ohne Namen. Blockformat-Idee: `Notizen: 2026-11-13 Text; …`. Konfliktfrage mit Zeitstempel noch offen. Der Nutzer wollte das Thema zurückhalten.
- **Domus:** erst in der Dokumentation prüfen, ob/wie Bilder oder Daten beigetragen werden können. Wikidata-SPARQL nach Bounding-Box als Ortsquelle. Eher Daten beitragen als Fotos.
- **„Auflösen ohne Verwerfen“:** wird noch nicht gemerkt (Zustand geht verloren).
- **Eigene Aufgaben des Nutzers:** scanalbum, Albumbereinigung.
- **`dev`-Zweig:** 0.11 mit personenzentrierter Oberfläche, pausiert (`docs/plan-0.11.md`).
- **Strukturfrage:** Wie gehen wir mit tausenden Fotos um (Übersicht, Stapel)? Nutzer fragte, ob Stapel auch für Orte nutzbar sind.

## 4. Arbeitsregeln

- Der Nutzer hat keine Programmiererfahrung: Schritte einzeln, nichts voraussetzen, nicht viele Fragen auf einmal.
- Gebaut wird erst nach seinem „los“. Vor Design-Änderungen gern eine Zeichnung.
- Deploy immer in dieser Reihenfolge nennen: GitHub Actions „Docker image“ → Run workflow (Branch `main`); ZimaOS „Aktualisieren“ (nicht während ein Job läuft); Strg+Shift+R; in Grimmich „Aktualisieren“.

## 5. Decisions of 16.11.2026 (place structure; nothing built yet)

- **GOV and GEDCOM are out** (no GOV lookups, no GEDCOM export considered).
- **Model like Gramps:** an own place stores only its name plus a link to a parent place (a Gramps place or another own place). The long name ("Marienkirche, Zwickau, Sachsen") is assembled by Grimmich. "Gehört zu" in the place window becomes a selection from existing places (with "create new"), no free text.
- **Parent is optional.** Places without a parent show up under "To do".
- **Every photo can have a place**, not every photo will get one. **Every place entry must be visible to Immich.** Only few photos go to Gramps; but any photo in Grimmich could become one.
- **Gramps side:** read parent handle, type and dates of each place (small change, then reload places once). Link own places to Gramps places by handle. Create a place in Gramps (with parent link) only after a preview, when a photo goes to Gramps.
- **Later:** use the photo year for dated names/parents (Posen/Poznań). Link to open a place in Gramps Web (check URL pattern first).
- **Parent suggestions (idea):** many Gramps places have no parent. Grimmich could suggest parents in "To do → places without parent": (1) larger Gramps places close by / the parent that neighbours use, (2) OSM reverse lookup (today's borders only, 1 request/s, cache), (3) Wikidata maybe later. Always with source, never automatic.
- **Open:** how exactly does a place name reach Immich? Immich has no free place-name field per photo (only city/state/country from coordinates, plus the description). Candidates: coordinates + name in the GRM block.

## 6. Parked: README screenshots (16.11.2026)

The five screenshots in `docs/screenshots/` are from 2 Nov (state 0.9.44) and outdated: menu bar, header (Refresh, Game), sort tile and button "Sort in automatically", settings (AI models, game for several players, version). Missing: places map, game on the phone.
Plan when the places page is finished: re-take all with the invented demo data (English UI), add places map (needs invented demo places with coordinates) and the game (narrow), update captions in `README.md` and `README.de.md`, add `tools/screenshots.py` to re-create them with one command. The Gramps life line needs the Gramps imitation from the tests.

## 7. Principles agreed on 16.11.2026 (talk, nothing built for them yet)

**What a place is**
- The place of a photo is **where you would look for it on a map**. Street scene or square: the square. View over a village or aerial photo: the middle of the place. Single building: the building. Only if the photographer's position matters (view from a tower): that position, the motif goes into a note. Photographer position vs. motif is not modelled.
- Accuracy varies (market ~30 m, village middle ~300 m). Immich stores only a point. An "exact / approximate / village middle" flag in Grimmich is a thought only, not planned.
- The **name** is free and follows "how I would search for the photo" (e.g. "Markt, Ilmenau" or "Rathaus, Ilmenau"). Pin and name may differ by some tens of metres.
- In theory **every photo can get a place** (assigned by hand, no automation). A place in Grimmich = **name + coordinate**. Immich gets only the coordinate (city/state/country it derives itself). Gramps is not needed for any of this.
- All photos of one place share the place's coordinate (10 photos of a church from different spots: same point). The only exception: a photo that already has its own coordinate in Immich (digital photo with GPS); an existing coordinate is changed only after confirmation.

**Gramps**
- What goes to Gramps is **decided by hand in Grimmich, never automatically**.
- A place in Gramps exists on its own, an event is not required. A place without any family event is possible but optional, and it makes the Gramps place list longer. A photo (Gramps media) can belong to a place, an event and a person at once; the file exists **once**.
- Intended flow: on the places page, select some photos of a place, "To Gramps …". At that moment Grimmich asks: does the place exist in Gramps? (suggest, link) or create it (preview, optional parent). If the photo is already in Gramps (earlier sent for an event), the existing media is attached to the place instead of uploaded again. To check: does Grimmich remember the Gramps media handle per photo?
- **Linking an own place with a Gramps place belongs to this moment**, not to the normal places page. The hint "Own place, only in Grimmich" with the link box (0.10.21–0.10.23) is to be removed from the places page; "Same name / within 150 m" suggestions only when sending to Gramps. A place only in Grimmich is a normal state.
- Not yet decided: whether the place for Gramps is always the photo's place, or can differ from it when a photo is attached to an event.
