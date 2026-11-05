import http.client
import json
import os
import re
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest import mock

import grimmich
import model_versions as mv

HERE = os.path.dirname(os.path.abspath(__file__))
ORIGINAL = os.getcwd()


class TestVersions(unittest.TestCase):
    def test_every_model_is_fixed_to_a_full_version(self):
        self.assertEqual([m["key"] for m in mv.MODELS], ["mivolo", "detector", "dinov2"])
        for m in mv.MODELS:
            self.assertRegex(m["revision"], r"^[0-9a-f]{40}$", m["key"])
            self.assertEqual(mv.revision(m["key"]), m["revision"])

    def test_all_loading_code_asks_for_the_fixed_version(self):
        """Without revision=... the library would ask the internet again (and could take a newer version)."""
        for name, expected in (("estimate.py", {"mivolo": 2, "detector": 1}), ("series.py", {"dinov2": 2})):
            with open(os.path.join(HERE, "..", name), encoding="utf-8") as f:
                source = f.read()
            for key, n in expected.items():
                self.assertEqual(len(re.findall(r'revision=model_revision\("%s"\)' % key, source)), n, name + " " + key)
            calls = len(re.findall(r"from_pretrained\(|hf_hub_download\(", source))
            self.assertEqual(calls, sum(expected.values()), name + ": a loading call without a fixed version")

    def test_check_finds_newer_versions_and_survives_errors(self):
        def find(repo):
            if repo == "facebook/dinov2-small":
                raise OSError("no connection")
            return "f" * 40 if repo == "iitolstykh/mivolo_v2" else mv.revision("detector")
        r = mv.check(find)
        self.assertTrue(r["models"]["mivolo"]["new"])
        self.assertFalse(r["models"]["detector"]["new"])
        self.assertEqual(r["models"]["dinov2"]["error"], "no connection")
        self.assertFalse(r["models"]["dinov2"]["new"])
        view = mv.view(r)
        self.assertEqual([m["new"] for m in view["models"]], [True, False, False])
        self.assertEqual(mv.view({})["models"][0]["latest"], "")   # never checked


class TestServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.chdir(tempfile.mkdtemp())
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), grimmich.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        os.chdir(ORIGINAL)

    def call(self, method, path):
        c = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=10)
        c.request(method, path, body=b"{}" if method == "POST" else None)
        r = c.getresponse()
        body = r.read()
        out = (r.status, json.loads(body) if r.status == 200 else None)
        c.close()
        return out

    def test_list_check_and_remember(self):
        status, first = self.call("GET", "/api/models")
        self.assertEqual((status, first["checked"], len(first["models"])), (200, "", 3))
        with mock.patch.object(mv, "newest", return_value="a" * 40):
            status, checked = self.call("POST", "/api/models_check")
        self.assertEqual(status, 200)
        self.assertTrue(all(m["new"] for m in checked["models"]))
        self.assertTrue(self.call("GET", "/api/models")[1]["models"][0]["new"])   # remembered

    def test_not_reachable_from_outside(self):
        for path in ("/play/api/models", "/play/api/models_check"):
            self.assertEqual(self.call("GET", path)[0], 404)


if __name__ == "__main__":
    unittest.main()
