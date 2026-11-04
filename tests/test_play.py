"""Tests: play mode (the game for several players): what is accepted, what is shown, and that nothing else is reachable under /play/."""
import http.client
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
ORIGINAL = os.getcwd()
import grimmich  # noqa: E402  (changes into the Grimmich folder)
import play  # noqa: E402

os.chdir(ORIGINAL)

KEYS = {"F1_abc123", "F2_abc123", "F3_abc123", "F4_abc123"}


class TestVotes(unittest.TestCase):
    def ok(self, vote):
        return play.validate_vote(vote, KEYS)

    def test_valid_answers_of_all_types(self):
        self.assertEqual(self.ok({"a": "F1_abc123", "b": "F2_abc123", "pid": "p1", "older": "a"}), {"a": "F1_abc123", "b": "F2_abc123", "pid": "p1", "older": "a"})
        self.assertIsNotNone(self.ok({"type": "who", "key": "F1_abc123", "box": [1, 2, 3, 4, 100, 100], "name": "Anna"}))
        self.assertIsNotNone(self.ok({"type": "place", "key": "F1_abc123", "place": "Riverton", "h": None}))
        self.assertIsNotNone(self.ok({"type": "anchor", "key": "F1_abc123", "anchor": "F2_abc123", "ay": 1950, "rel": "before"}))
        self.assertEqual(self.ok({"type": "sort", "pid": "p1", "keys": ["F1_abc123", "F2_abc123", "F3_abc123"], "ranks": [1, 1, 3]})["ranks"], [1, 1, 3])
        self.assertEqual(self.ok({"type": "decade", "key": "F1_abc123", "from": 1950, "to": 1959})["to"], 1959)
        self.assertEqual(self.ok({"type": "decade", "key": "F1_abc123", "from": None, "to": None})["from"], None)

    def test_unknown_photos_and_wrong_shapes_are_refused(self):
        bad = [None, [], "x", {"type": "year", "key": "F1_abc123", "year": 1950}, {"type": "evil"},
               {"a": "nope", "b": "F2_abc123", "pid": "p1", "older": "a"}, {"a": "F1_abc123", "b": "F1_abc123", "pid": "p1", "older": "a"},
               {"a": "F1_abc123", "b": "F2_abc123", "pid": "p1", "older": "c"},
               {"type": "who", "key": "F1_abc123", "name": "x" * 500}, {"type": "who", "key": "F1_abc123", "name": 5},
               {"type": "anchor", "key": "F1_abc123", "anchor": "F2_abc123", "ay": 3000, "rel": "before"},
               {"type": "sort", "pid": "p", "keys": ["F1_abc123", "F2_abc123"]}, {"type": "sort", "pid": "p", "keys": ["F1_abc123"] * 3},
               {"type": "sort", "pid": "p", "keys": ["F1_abc123", "F2_abc123", "F3_abc123"], "ranks": [1, 2]},
               {"type": "decade", "key": "F1_abc123", "from": 1950, "to": 1960}, {"type": "decade", "key": "../x", "from": 1950, "to": 1959}]
        for v in bad:
            self.assertIsNone(self.ok(v), v)

    def test_only_known_fields_are_kept(self):
        v = self.ok({"type": "place", "key": "F1_abc123", "place": "Riverton\x00", "h": None, "admin": True, "player": "fake"})
        self.assertEqual(set(v), {"type", "key", "place", "h"})
        self.assertEqual(v["place"], "Riverton")

    def test_player_name(self):
        self.assertEqual(play.clean_player("  Anna \n"), "Anna")
        for bad in ("", "   ", "x" * 61, None, 5):
            self.assertIsNone(play.clean_player(bad))

    def test_add_and_undo_only_touch_own_answers(self):
        votes = play.add_vote([], {"type": "decade", "key": "a", "from": None, "to": None}, "Anna", "t1")
        votes = play.add_vote(votes, {"type": "decade", "key": "b", "from": None, "to": None}, "Ben", "t2")
        votes = play.add_vote(votes, {"type": "decade", "key": "c", "from": None, "to": None}, "Anna", "t3")
        after = play.undo_last(votes, "Anna")
        self.assertEqual([v["key"] for v in after], ["a", "b"])
        self.assertEqual(play.undo_last(after, "Carl"), after)
        self.assertEqual(len(votes), 3)   # the original list stays as it was

    def test_rate_limit(self):
        r = play.RateLimit(limit=3)
        self.assertEqual([r.allow(now=100.0 + i) for i in range(5)], [True, True, True, False, False])
        self.assertTrue(r.allow(now=200.0))


class TestData(unittest.TestCase):
    def test_nothing_private_is_handed_out(self):
        d = play.build_data(
            {"photos": [{"key": "F1_abc123", "id": "SECRET-ID", "album": "Privat"}]},
            {"series": [{"id": "S001", "photos": ["F1_abc123", "other"], "description": "secret"}]},
            [{"key": "F1_abc123", "year": 1950, "from": 1945, "to": 1955, "hint": "secret hint"}],
            {"F1_abc123": {"year": 1950, "source": "confirmed", "note": "secret"}, "other": {"year": 1}},
            ["Anna Test"], {"F1_abc123": [{"name": "Anna Test", "age": 30, "birth": 1920.5}]},
            {"ok": True, "people": [{"id": "p1", "name": "Anna Test", "birth": 1920.5, "photos": [{"key": "F1_abc123", "box": [1, 2, 3, 4, 5, 6]}]}], "unnamed": []},
            {"F1_abc123": {"date": "1950-01-01", "camera": False, "token": "secret"}}, {"F1_abc123": {"t": "secret place"}}, {}, [], "1.0")
        text = json.dumps(d)
        for word in ("secret", "SECRET-ID", "Privat", "1920"):
            self.assertNotIn(word, text)
        self.assertIsNone(d["people_photos"]["people"][0]["birth"])
        self.assertEqual(d["connection"], {"immich": {}, "gramps": {}, "gramps_write": {}, "written": {}})
        self.assertEqual(d["work"]["series"][0]["photos"], ["F1_abc123"])

    def test_allowed_addresses(self):
        for ok in ("/", "/style.css", "/js/main.js", "/js/ui/game.js", "/api/all", "/api/languages", "/api/language/de", "/photos/F1_abc123.jpg", "/crops/F1_1_1_1_1_1_1.jpg"):
            self.assertTrue(play.ALLOWED_GET.match(ok), ok)
        for no in ("/api/connection", "/api/work", "/api/job", "/api/corrections", "/api/order", "/api/gramps_events", "/api/write_preview", "/grimmich.py",
                   "/js/../index.html", "/js/%2e%2e/x.js", "/js/main.py", "/api/people", "/photos/../x.jpg", "/play/api/all"):
            self.assertFalse(play.ALLOWED_GET.match(no), no)


class TestServer(unittest.TestCase):
    """The real handler with its own data folder: what a player from outside can reach."""
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.mkdtemp()
        os.chdir(cls.folder)
        with open("photos.json", "w", encoding="utf-8") as f:
            json.dump({"photos": [{"key": k} for k in sorted(KEYS)]}, f)
        with open("immich.env", "w", encoding="utf-8") as f:
            f.write("IMMICH_API_KEY=TOP-SECRET-KEY\n")
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), grimmich.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        os.chdir(ORIGINAL)

    def call(self, method, path, body=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request(method, path, body=json.dumps(body) if body is not None else None)
        r = c.getresponse()
        data = r.read()
        c.close()
        return r.status, data

    def test_the_game_page_and_its_data(self):
        status, data = self.call("GET", "/play/")
        self.assertEqual(status, 200)
        self.assertIn(b"<html", data.lower())
        status, data = self.call("GET", "/play/api/all")
        self.assertEqual(status, 200)
        self.assertNotIn(b"TOP-SECRET-KEY", data)
        self.assertEqual(self.call("GET", "/play")[0], 301)

    def test_nothing_else_is_reachable_under_play(self):
        for path in ("/play/api/connection", "/play/api/work", "/play/api/job", "/play/api/corrections", "/play/api/order", "/play/api/write_preview",
                     "/play/api/gramps_events?h=x", "/play/api/people", "/play/immich.env", "/play/grimmich.py", "/play/js/../index.html", "/play/js/%2e%2e/index.html"):
            self.assertEqual(self.call("GET", path)[0], 404, path)
        for path in ("/play/api/work", "/play/api/corrections", "/play/api/order", "/play/api/connection", "/play/api/job", "/play/api/game_votes", "/play/api/connection_test"):
            self.assertEqual(self.call("POST", path, {"series": []})[0], 404, path)

    def test_old_whole_file_route_is_gone(self):
        self.assertEqual(self.call("POST", "/api/game_votes", {"votes": []})[0], 404)

    def test_answers_are_appended_and_can_be_taken_back(self):
        vote = {"type": "decade", "key": "F1_abc123", "from": 1950, "to": 1959}
        s, d = self.call("POST", "/play/api/vote", {"op": "add", "vote": vote, "player": "Anna"})
        self.assertEqual(s, 200)
        s, d = self.call("POST", "/play/api/vote", {"op": "add", "vote": vote, "player": "Ben"})
        votes = json.loads(d)["votes"]
        self.assertEqual([v["player"] for v in votes if v.get("key") == "F1_abc123"][-2:], ["Anna", "Ben"])
        s, d = self.call("POST", "/play/api/vote", {"op": "undo", "player": "Anna"})
        votes = json.loads(d)["votes"]
        self.assertNotIn("Anna", [v["player"] for v in votes])
        self.assertIn("Ben", [v["player"] for v in votes])

    def test_bad_answers_are_refused(self):
        good = {"type": "decade", "key": "F1_abc123", "from": 1950, "to": 1959}
        self.assertEqual(self.call("POST", "/play/api/vote", {"op": "add", "vote": good})[0], 400)   # no player
        self.assertEqual(self.call("POST", "/play/api/vote", {"op": "add", "vote": {"type": "who", "key": "../../x", "name": "A"}, "player": "A"})[0], 400)
        self.assertEqual(self.call("POST", "/play/api/vote", {"op": "delete", "player": "A"})[0], 400)
        self.assertEqual(self.call("POST", "/play/api/vote", [1, 2])[0], 400)


if __name__ == "__main__":
    unittest.main()
