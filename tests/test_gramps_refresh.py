"""The buttons that fetch people and places fresh from Gramps must reach the server as "fresh" (a leftover of the English renaming once sent ?neu=1 while the server read ?new=1)."""
import http.client
import os
import re
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest import mock

import connections
import grimmich

HERE = os.path.dirname(os.path.abspath(__file__))
ORIGINAL = os.getcwd()


class TestFreshFromGramps(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.chdir(tempfile.mkdtemp())
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), grimmich.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        os.chdir(ORIGINAL)

    def get(self, path):
        c = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=10)
        c.request("GET", path)
        c.getresponse().read()
        c.close()

    def test_the_address_the_page_uses_makes_the_server_fetch_fresh(self):
        with open(os.path.join(HERE, "..", "web", "js", "gramps.js"), encoding="utf-8") as f:
            source = f.read()
        used = re.findall(r'"/api/(gramps_places|gramps_people)" \+ \(fresh \? "(\?[^"]+)"', source)
        self.assertEqual(sorted(u[0] for u in used), ["gramps_people", "gramps_places"])
        for name, query in used:
            func = "gramps_orte" if name == "gramps_places" else "gramps_personen"
            with mock.patch.object(connections, func, return_value={"ok": True, "places": [], "people": []}) as m:
                self.get("/api/" + name + query)
                self.assertTrue(m.call_args.kwargs["new_"], name + query)
                self.get("/api/" + name)
                self.assertFalse(m.call_args.kwargs["new_"], name)


if __name__ == "__main__":
    unittest.main()
