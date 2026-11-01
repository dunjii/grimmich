"""Name tables for the one-time switch of all stored data names from German to English.

DOCUMENTS   old document name -> new document name (the 28 documents in the database, plus cache files)
FIELDS      old field name    -> new field name (applies to every dictionary key inside the documents and in the API)
VALUES      field (new name)  -> {old stored value: new stored value}   (only values that are internal codes)
VALUES_DOC  the same, but only inside one document
API         old API path      -> new API path

Used by migration.py (at start-up, once) and by the development tools that rename the program code.
"""

DOCUMENTS = {
    "aenderungen": "changes", "alter_pro_foto": "age_per_photo", "arten": "kinds", "datierung_geschrieben": "dating_written",
    "datierung_sicherung": "dating_backup", "eingang": "inbox", "ereigniszuordnung": "event_assignment", "fotos": "photos",
    "gramps_eingabe": "gramps_input", "gramps_ergebnis": "gramps_result", "gramps_geschrieben": "gramps_written",
    "gramps_vorschau": "gramps_preview", "herkunft": "provenance", "herkunft_alben": "provenance_albums", "immich_daten": "immich_data",
    "immich_stand": "immich_state", "korrekturen": "corrections", "lauf_marker": "run_marker", "neu_laden": "reload",
    "ortszuordnung": "place_assignment", "personen": "people", "reihenfolge": "order", "schreib_ergebnis": "write_result",
    "schreib_vorschau": "write_preview", "serien": "series", "serien_arbeit": "series_work", "uebernahme": "adoption",
    "zuordnung": "assignment",
}

# cache and helper files (plain files next to the database)
FILES = {
    "schaetzung_cache": "estimate_cache", "schaetzung_cache_koerper": "estimate_cache_body", "gramps_probe": "gramps_probe",
    "gramps_ereignis_probe": "gramps_event_probe", "gramps_schreibtest": "gramps_write_test", "anonym_schluessel": "anonymize_key",
    "serien_entscheidungen": "series_decisions",
}

FIELDS = {
    "a_bis": "a_to", "a_jahr": "a_year", "a_von": "a_from", "b_bis": "b_to", "b_jahr": "b_year", "b_von": "b_from",
    "abgelehnt": "rejected", "adressen": "addresses", "aeltere": "older", "aenderungen": "changes", "aktion": "action", "aktiv": "active",
    "aktuell": "current", "alben": "albums", "alle": "all", "alt": "old", "alt_datum": "old_date", "alter": "age", "alter_ort": "old_place",
    "alter_voll": "age_full", "alter_vorschau": "age_preview", "ansichtskarte": "postcard", "grusskarte": "greeting_card", "anker": "anchor", "anzahl": "count", "arbeit": "work", "art": "kind",
    "arten": "kinds", "ausreisser": "outliers", "baum": "tree", "benannt": "named", "benutzt": "used", "benutzt_url": "used_url",
    "berechnet": "computed", "beschr": "descr", "beschreibung": "description", "bestaetigen": "confirm", "bild": "image", "bildart": "image_kind",
    "bis": "to", "datei": "file", "datierbar": "datable", "datum": "date", "datum_aendern": "date_change", "datum_text": "date_text",
    "dokument": "document", "eigen": "own", "eingang": "inbox", "einzel": "single", "einzel_ok": "single_ok", "ereignis": "event",
    "ereignisse": "events", "ereignisse_normale_daten": "events_normal_dates", "ereignisse_ungewoehnliche_daten": "events_unusual_dates",
    "ereigniszuordnung": "event_assignment", "ergebnis": "result", "ergebnisse": "results", "erzwinge": "force", "evort": "event_place",
    "familien": "families", "fehler": "errors", "felder": "fields", "fotos": "photos", "geb": "born", "geburt": "birth",
    "geschaetzt": "estimated", "geschrieben": "written", "gesehen": "seen", "gesichert": "saved", "gesicht": "face", "gesichter": "faces",
    "gespeichert": "stored", "getrennt": "separate", "gramps_schreiben": "gramps_write", "grampsgeschrieben": "gramps_written",
    "grampsstatus": "gramps_status", "grampsvorschau": "gramps_preview", "grund": "reason", "handdatum": "manual_date", "herkunft": "provenance",
    "herkunftalben": "provenance_albums", "hinweis": "hint", "immichdaten": "immich_data", "jahr": "year", "kamera": "camera",
    "kamera_ohne_anker": "camera_without_anchor", "koerper": "body", "korrekturen": "corrections", "laeuft": "running", "lese": "read",
    "lokal": "local", "merge_abgelehnt": "merge_rejected", "merge_hinweise": "merge_hints", "mit_datum": "with_date", "mit_kamera": "with_camera",
    "mittel": "mean", "modus": "mode", "nach": "surnames", "nachgeladen": "reloaded", "nah": "near", "namen": "names", "neu": "new",
    "neu_beschreibung": "new_description", "neu_datum": "new_date", "neue_notiz": "new_note", "neue_quelle": "new_source",
    "neuer_ort": "new_place", "nummer": "number", "nurOrt": "onlyPlace", "nurQuelle": "onlySource", "nur_quelle": "only_source",
    "nur_quelle_ort": "only_source_place", "offen": "open", "ohne": "without", "ohne_daten": "without_data", "ort": "place",
    "ortErzwinge": "placeForce", "ort_bestaetigen": "place_confirm", "ort_grund": "place_reason", "ort_h": "place_h", "ort_name": "place_name",
    "orte": "places", "orte_bestaetigen": "places_confirm", "orte_liste": "places_list", "passwort": "password", "personen": "people",
    "personen_fehlt": "people_missing", "personen_ok": "people_ok", "personenfotos": "people_photos", "quelle": "source",
    "quelleUnberuehrt": "sourceUntouched", "quelle_neu": "source_new", "quelle_text": "source_text", "quelle_titel": "source_title",
    "quellen_neu": "sources_new", "raus": "out", "reihenfolge": "order", "ruf": "called", "rufname": "called_name", "schaetzung": "estimate",
    "schluessel": "key_set", "schreib": "write_access", "schreib_gespeichert": "write_stored", "schreiben": "write", "schreibstatus": "write_status",
    "schreibvorschau": "write_preview", "schritt": "step", "schrittname": "step_name", "seit": "since", "seiten": "pages", "serie": "series_id",
    "serien": "series", "serien_ok": "series_ok", "sicherheit": "confidence", "sonstiges": "other", "spiegeln": "mirror", "stand": "state",
    "streuung": "spread", "tags_dazu": "tags_add", "tags_weg": "tags_remove", "teil": "part", "texte": "texts", "titel": "title", "tod": "death",
    "treffer": "hits", "typ": "type", "uebernommen": "adopted", "uebersprungen": "skipped", "unbekannt": "unknown", "unfertig": "unfinished",
    "ungenau": "imprecise", "ungewoehnlich": "unusual", "unterschied": "difference", "unterschiedlich": "differs", "unveraendert": "unchanged",
    "verbindung": "connection", "verworfen": "discarded", "von": "from", "vor": "given", "vorhanden": "present", "vorher": "before",
    "vorschau_px": "preview_px", "vorschlag": "suggestion", "vorschlag_neu": "suggested_new", "voll_px": "full_px", "wer": "who", "wer_name": "who_name", "wert": "value", "werte": "values", "widerspricht": "contradicts", "zaehler": "counters",
    "zeile": "row", "zeilen": "rows", "zeit": "time", "zeitleiste": "timeline", "ziel": "target", "zitat": "citation",
    "zitat_bild": "citation_image", "zitate": "citations", "zuordnung": "assignment", "zusammenhalt": "cohesion",
    "_titel": "_title", "dj": "decimal_year",
}

# stored internal codes (values), keyed by NEW field name; keys not listed here keep their value
VALUES = {
    "source": {"entwurf": "draft", "bestaetigt": "confirmed", "vorschlag": "suggestion", "manuell": "manual"},
    "kind": {"grusskarte": "greeting_card", "ansichtskarte": "postcard", "sonstiges": "other", "dokument": "document"},
    "action": {"unveraendert": "unchanged", "gleich": "same", "ueberspringen": "skip", "schreiben": "write", "neu": "new", "vorhanden": "present"},
    "part": {"beginn": "begin", "ende": "end"},
}

# the same, but only inside one document (new document name -> field -> values)
VALUES_DOC = {
    "series_work": {"status": {"offen": "open"}},
}

API = {
    "/api/aenderungen": "/api/changes", "/api/alter": "/api/age", "/api/arbeit": "/api/work", "/api/arten": "/api/kinds",
    "/api/eingang": "/api/inbox", "/api/ereigniszuordnung": "/api/event_assignment", "/api/fotos": "/api/photos",
    "/api/grampseingabe": "/api/gramps_input", "/api/grampsvorschau": "/api/gramps_preview", "/api/herkunft": "/api/provenance",
    "/api/herkunftalben": "/api/provenance_albums", "/api/immichdaten": "/api/immich_data", "/api/korrekturen": "/api/corrections",
    "/api/orte": "/api/places", "/api/personen": "/api/people", "/api/reihenfolge": "/api/order", "/api/schreibvorschau": "/api/write_preview",
    "/api/uebernahme": "/api/adoption", "/api/zuordnung": "/api/assignment",
    "/api/alles": "/api/all",
    "/api/aehnlich": "/api/similar",
    "/api/personenfotos": "/api/people_photos",
    "/api/schreibstatus": "/api/write_status",
    "/api/verbindungtest": "/api/connection_test",
    "/api/verbindung": "/api/connection",
    "/api/grampspersonen": "/api/gramps_people",
    "/api/grampsorte": "/api/gramps_places",
    "/api/grampsereignisse": "/api/gramps_events",
    "/api/grampsprobe": "/api/gramps_probe",
    "/api/ergebnisse": "/api/results",
    "/api/neu": "/api/new",
    "/api/serienrechnen": "/api/series_calc",
}
