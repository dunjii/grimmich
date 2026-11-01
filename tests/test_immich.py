"""Tests for the shared Immich access (immich.py) with a simulated Immich server.

A real Immich is never touched. Run in the Grimmich folder:
    python3 -m unittest discover -s tests -v
"""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import immich  # noqa: E402
import immich_write  # noqa: E402

LOG_TEXT = []


class Wrong(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _response(self, code, body_part, type_="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", type_)
        self.send_header("Content-Length", str(len(body_part)))
        self.end_headers()
        self.wfile.write(body_part)

    def _process(self):
        length = int(self.headers.get("Content-Length") or 0)
        body_part = self.rfile.read(length).decode("utf-8") if length else ""
        LOG_TEXT.append({"methode": self.command, "pfad": self.path, "key": self.headers.get("x-api-key"),
                          "type": self.headers.get("Content-Type"), "accept": self.headers.get("Accept"), "body": body_part})
        if self.headers.get("x-api-key") != "geheim":
            return self._response(401, b'{"message":"Unauthorized"}')
        if self.path.startswith("/api/faces"):
            return self._response(200, json.dumps([{"person": {"id": "p1"}}]).encode())
        if self.path.startswith("/api/assets/bild/thumbnail"):
            return self._response(200, b"\xff\xd8JPEGDATA", "image/jpeg")
        if self.path == "/api/leer":
            return self._response(204, b"")
        if self.path == "/api/search/metadata":
            return self._response(200, json.dumps({"assets": {"items": [], "nextPage": None}}).encode())
        if self.path.startswith("/api/assets/") and self.command == "PUT":
            return self._response(200, json.dumps({"ok": True}).encode())
        if self.path.startswith("/api/kaputt"):
            return self._response(500, "Fehler: Ärger".encode("utf-8"))
        return self._response(404, b'{"message":"nicht da"}')

    do_GET = do_POST = do_PUT = do_DELETE = _process


class TestImmich(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Wrong)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        LOG_TEXT.clear()
        self.im = immich.Immich(self.url, "geheim")

    def test_get_mit_parametern(self):
        r = self.im.request_("GET", "/faces", params={"id": "abc 1"})
        self.assertEqual(r, [{"person": {"id": "p1"}}])
        p = LOG_TEXT[0]
        self.assertEqual((p["methode"], p["pfad"], p["key"]), ("GET", "/api/faces?id=abc+1", "geheim"))
        self.assertEqual(p["accept"], "application/json")

    def test_ohne_methode_ohne_daten_ist_get_mit_daten_post(self):
        self.im.request_(None, "/faces")
        self.im.request_(None, "/search/metadata", data_={"page": 1})
        self.assertEqual([x["methode"] for x in LOG_TEXT], ["GET", "POST"])
        self.assertEqual(json.loads(LOG_TEXT[1]["body"]), {"page": 1})
        self.assertEqual(LOG_TEXT[1]["type"], "application/json")

    def test_put_mit_umlauten_im_koerper(self):
        self.im.request_("PUT", "/assets/x", {"description": "Müller ä ö ü ß"})
        self.assertEqual(json.loads(LOG_TEXT[0]["body"]), {"description": "Müller ä ö ü ß"})
        self.assertEqual(LOG_TEXT[0]["methode"], "PUT")

    def test_bild_als_bytes(self):
        r = self.im.request_("GET", "/assets/bild/thumbnail", params={"size": "preview"}, raw=True)
        self.assertEqual(r, b"\xff\xd8JPEGDATA")
        self.assertEqual(LOG_TEXT[0]["accept"], "*/*")

    def test_leere_antwort_ist_none(self):
        self.assertIsNone(self.im.request_("GET", "/leer"))

    def test_falscher_schluessel(self):
        with self.assertRaises(immich.ApiError) as e:
            immich.Immich(self.url, "falsch").request_("GET", "/faces")
        self.assertIn("401", str(e.exception))

    def test_serverfehler_mit_text(self):
        with self.assertRaises(immich.ApiError) as e:
            self.im.request_("GET", "/kaputt")
        self.assertIn("500", str(e.exception))
        self.assertIn("Ärger", str(e.exception))

    def test_nicht_erreichbar(self):
        with self.assertRaises(immich.ApiError) as e:
            immich.Immich("http://127.0.0.1:9", "geheim", timeout=3).request_("GET", "/faces")
        self.assertIn("127.0.0.1:9", str(e.exception))

    def test_url_mit_schraegstrich_am_ende(self):
        immich.Immich(self.url + "/", "geheim").request_("GET", "/faces")
        self.assertEqual(LOG_TEXT[0]["pfad"], "/api/faces")

    def test_alle_programmteile_fangen_denselben_fehler(self):
        # immich_write.py und gramps_write.py benutzen dieselbe Klasse; ein Fehler wird ueberall erkannt
        self.assertIs(immich_write.ApiError, immich.ApiError)
        self.assertIs(immich_write.Immich, immich.Immich)
        with self.assertRaises(immich_write.ApiError):
            immich_write.Immich(self.url, "falsch").request_("GET", "/faces")

    def test_gramps_schreiben_holt_bilder_roh(self):
        import gramps_write as gs
        self.assertEqual(gs.immich_raw((self.url, "geheim"), "/assets/bild/thumbnail", {"size": "preview"}), b"\xff\xd8JPEGDATA")
        with self.assertRaises(gs.ApiError):
            gs.immich_raw((self.url, "falsch"), "/faces")

    def test_schaetzen_anfrage(self):
        # estimate.py braucht die KI-Pakete; wo sie fehlen (Testumgebung), werden sie nur zum Importieren vorgetaeuscht
        from unittest import mock
        for name in ("torch", "cv2", "transformers"):
            try:
                __import__(name)
            except ImportError:
                sys.modules[name] = mock.MagicMock()
        import estimate as S
        S.URL, S.API_KEY = self.url, "geheim"
        self.assertEqual(S.request_("/faces", {"id": "a"}), [{"person": {"id": "p1"}}])
        self.assertIs(S.ApiError, immich.ApiError)
        self.assertEqual(S.request_("/assets/bild/thumbnail", raw=True), b"\xff\xd8JPEGDATA")


if __name__ == "__main__":
    unittest.main()
