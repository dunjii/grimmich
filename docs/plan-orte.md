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
