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

    def test_hidden_photos_and_people_are_left_out(self):
        pp = {"ok": True, "people": [{"id": "p1", "name": "Anna", "birth": None, "photos": [{"key": "F1_abc123", "box": [1, 2, 3, 4, 5, 6]}, {"key": "F2_abc123", "box": [1, 2, 3, 4, 5, 6]}]},
                                     {"id": "p2", "name": "Ben", "birth": None, "photos": [{"key": "F1_abc123", "box": [1, 2, 3, 4, 5, 6]}]}],
              "unnamed": [{"key": "F1_abc123", "box": [1, 2, 3, 4, 5, 6]}, {"key": "F3_abc123", "box": [1, 2, 3, 4, 5, 6]}]}
        votes = [{"type": "decade", "key": "F1_abc123", "from": 1950, "to": 1959, "player": "x"}, {"type": "decade", "key": "F2_abc123", "from": 1950, "to": 1959, "player": "x"},
                 {"type": "sort", "pid": "p", "keys": ["F2_abc123", "F1_abc123", "F3_abc123"], "player": "x"}]
        d = play.build_data({"photos": [{"key": k} for k in sorted(KEYS)]}, {"series": [{"id": "S1", "photos": ["F1_abc123", "F2_abc123"]}]}, [{"key": "F1_abc123", "year": 1950}, {"key": "F2_abc123", "year": 1951}],
                            {}, ["Anna", "Ben"], {"F1_abc123": [{"name": "Ben", "age": 3}]}, pp, {"F1_abc123": {"date": "1950-01-01"}}, {"F1_abc123": {}}, {}, votes, "1.0",
                            hidden_keys={"F1_abc123"}, hidden_people={"p2"})
        text = json.dumps(d)
        self.assertNotIn("F1_abc123", text)
        self.assertEqual([p["id"] for p in d["people_photos"]["people"]], ["p1"])
        self.assertEqual([f["key"] for f in d["people_photos"]["people"][0]["photos"]], ["F2_abc123"])
        self.assertEqual([u["key"] for u in d["people_photos"]["unnamed"]], ["F3_abc123"])
        self.assertEqual(d["work"]["series"][0]["photos"], ["F2_abc123"])
        self.assertEqual(len(d["game_votes"]["votes"]), 1)   # the answers that touch a hidden photo are not handed out either

    def test_allowed_addresses(self):
        for ok in ("/", "/style.css", "/js/main.js", "/js/ui/game.js", "/api/all", "/api/languages", "/api/language/de", "/photos/F1_abc123.jpg", "/crops/F1_1_1_1_1_1_1.jpg", "/api/me", "/robots.txt"):
            self.assertTrue(play.ALLOWED_GET.match(ok), ok)
        for no in ("/api/connection", "/api/work", "/api/job", "/api/corrections", "/api/order", "/api/gramps_events", "/api/write_preview", "/grimmich.py",
                   "/js/../index.html", "/js/%2e%2e/x.js", "/js/main.py", "/api/people", "/photos/../x.jpg", "/play/api/all", "/api/players", "/api/players.json"):
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
        os.makedirs(os.path.join("series_output", "photos"))
        for k in KEYS:
            with open(os.path.join("series_output", "photos", k + ".jpg"), "wb") as f:
                f.write(b"\xff\xd8jpeg")
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), grimmich.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.port = cls.server.server_address[1]
        cls.passwords = {}
        for name in ("Anna", "Ben"):
            cls.passwords[name] = grimmich.players_change({"op": "add", "name": name})[0]["password"]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        os.chdir(ORIGINAL)

    def setUp(self):
        for limit in (grimmich.UNKNOWN_PATHS, grimmich.LOGIN_BY_NAME, grimmich.LOGIN_BY_IP, grimmich.LOGIN_ALL):
            limit.fails.clear()
        grimmich.RATE.times.clear()

    def raw(self, method, path, body=None, cookie=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = dict(headers or {})
        if cookie:
            h["Cookie"] = cookie
        c.request(method, path, body=json.dumps(body) if body is not None else None, headers=h)
        r = c.getresponse()
        data = r.read()
        out = (r.status, data, r)
        c.close()
        return out

    def call(self, method, path, body=None, cookie=None, headers=None):
        status, data, _ = self.raw(method, path, body, cookie, headers)
        return status, data

    def login(self, name="Anna", password=None):
        status, data, r = self.raw("POST", "/play/api/login", {"name": name, "password": password or self.passwords[name]})
        self.assertEqual(status, 200, data)
        return r.getheader("Set-Cookie").split(";")[0]

    def test_the_game_page_is_free_but_its_data_needs_a_sign_in(self):
        status, data = self.call("GET", "/play/")
        self.assertEqual(status, 200)
        self.assertIn(b"<html", data.lower())
        self.assertEqual(self.call("GET", "/play")[0], 301)
        for path in ("/play/api/all", "/play/api/gramps_places", "/play/photos/F1_abc123.jpg", "/play/crops/F1_1_1_1_1_1_1.jpg", "/play/api/me"):
            self.assertEqual(self.call("GET", path)[0], 401, path)
        self.assertEqual(self.call("POST", "/play/api/vote", {"op": "add", "vote": {"type": "decade", "key": "F1_abc123", "from": 1950, "to": 1959}, "player": "Anna"})[0], 401)
        self.assertEqual(self.call("POST", "/play/api/password", {"old": "a", "new": "bbbbbbbbb"})[0], 401)

    def test_signed_in_player_gets_the_data(self):
        cookie = self.login()
        status, data = self.call("GET", "/play/api/all", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertNotIn(b"TOP-SECRET-KEY", data)
        self.assertNotIn(b"scrypt", data)
        self.assertEqual(json.loads(self.call("GET", "/play/api/me", cookie=cookie)[1])["name"], "Anna")
        self.assertEqual(self.call("GET", "/play/photos/F1_abc123.jpg", cookie=cookie)[0], 200)

    def test_cookie_is_safe_and_responses_say_no_indexing(self):
        status, data, r = self.raw("POST", "/play/api/login", {"name": "anna", "password": self.passwords["Anna"]}, headers={"X-Forwarded-Proto": "https"})
        cookie = r.getheader("Set-Cookie")
        for part in ("HttpOnly", "SameSite=Lax", "Secure", "Path=/play/"):
            self.assertIn(part, cookie)
        self.assertIn("noindex", r.getheader("X-Robots-Tag"))
        status, data, r = self.raw("GET", "/play/robots.txt")
        self.assertEqual((status, data), (200, b"User-agent: *\nDisallow: /\n"))

    def test_wrong_logins_are_refused_and_slowed_down(self):
        for name, pw in (("Anna", "wrong"), ("Nobody", "x"), ("", ""), (None, None)):
            self.assertEqual(self.call("POST", "/play/api/login", {"name": name, "password": pw})[0], 401)
        for _ in range(8):
            self.call("POST", "/play/api/login", {"name": "Ben", "password": "wrong"})
        status, data = self.call("POST", "/play/api/login", {"name": "Ben", "password": self.passwords["Ben"]})
        self.assertEqual(status, 429)   # even the right password waits
        self.assertEqual(self.call("POST", "/play/api/login", {"name": "Anna", "password": self.passwords["Anna"]})[0], 200)   # other players are not affected

    def test_a_flood_of_unknown_addresses_is_slowed_down(self):
        codes = [self.call("GET", f"/play/wp-admin/{i}.php")[0] for i in range(45)]
        self.assertEqual(codes[0], 404)
        self.assertEqual(codes[-1], 429)

    def test_nothing_else_is_reachable_under_play(self):
        cookie = self.login()
        for path in ("/play/api/connection", "/play/api/work", "/play/api/job", "/play/api/corrections", "/play/api/order", "/play/api/write_preview", "/play/api/players",
                     "/play/api/gramps_events?h=x", "/play/api/people", "/play/immich.env", "/play/grimmich.py", "/play/players.json", "/play/js/../index.html", "/play/js/%2e%2e/index.html"):
            self.assertEqual(self.call("GET", path, cookie=cookie)[0], 404, path)
        for path in ("/play/api/work", "/play/api/corrections", "/play/api/order", "/play/api/connection", "/play/api/job", "/play/api/game_votes", "/play/api/connection_test", "/play/api/players"):
            self.assertEqual(self.call("POST", path, {"series": []}, cookie=cookie)[0], 404, path)

    def test_old_whole_file_route_is_gone(self):
        self.assertEqual(self.call("POST", "/api/game_votes", {"votes": []})[0], 404)

    def test_the_management_pages_are_not_for_funnel(self):
        self.assertEqual(self.call("GET", "/api/players")[0], 200)   # on your own computer
        funnel = {"Tailscale-Funnel-Request": "?1"}
        for path in ("/api/players", "/", "/api/all", "/api/connection"):
            self.assertEqual(self.call("GET", path, headers=funnel)[0], 404, path)
        self.assertEqual(self.call("POST", "/api/players", {"op": "add", "name": "Eve"}, headers=funnel)[0], 404)
        self.assertEqual(self.call("GET", "/play/", headers=funnel)[0], 200)

    def test_the_settings_page_never_gets_hashes(self):
        status, data = self.call("GET", "/api/players")
        self.assertEqual(status, 200)
        self.assertNotIn(b"scrypt", data)
        self.assertNotIn(self.passwords["Anna"].encode(), data)
        self.assertEqual({p["name"] for p in json.loads(data)["players"]} >= {"Anna", "Ben"}, True)

    def test_answers_come_with_the_name_of_the_sign_in(self):
        anna, ben = self.login("Anna"), self.login("Ben")
        vote = {"type": "decade", "key": "F1_abc123", "from": 1950, "to": 1959}
        s, d = self.call("POST", "/play/api/vote", {"op": "add", "vote": vote, "player": "Mallory"}, cookie=anna)   # a name in the request is ignored
        self.assertEqual(s, 200)
        s, d = self.call("POST", "/play/api/vote", {"op": "add", "vote": vote}, cookie=ben)
        votes = json.loads(d)["votes"]
        self.assertEqual([v["player"] for v in votes if v.get("key") == "F1_abc123"][-2:], ["Anna", "Ben"])
        self.assertNotIn("Mallory", [v["player"] for v in votes])
        s, d = self.call("POST", "/play/api/vote", {"op": "undo"}, cookie=anna)   # takes back only the own answer
        votes = json.loads(d)["votes"]
        self.assertNotIn("Anna", [v["player"] for v in votes])
        self.assertIn("Ben", [v["player"] for v in votes])

    def test_bad_answers_are_refused(self):
        cookie = self.login()
        self.assertEqual(self.call("POST", "/play/api/vote", {"op": "add", "vote": {"type": "who", "key": "../../x", "name": "A"}}, cookie=cookie)[0], 400)
        self.assertEqual(self.call("POST", "/play/api/vote", {"op": "delete"}, cookie=cookie)[0], 400)
        self.assertEqual(self.call("POST", "/play/api/vote", [1, 2], cookie=cookie)[0], 400)

    def test_big_requests_from_outside_are_refused(self):
        self.assertEqual(self.call("POST", "/play/api/login", {"name": "x" * 200000, "password": "y"})[0], 400)

    def test_changing_blocking_and_removing(self):
        name = "Carla"
        password = grimmich.players_change({"op": "add", "name": name})[0]["password"]
        cookie = self.login(name, password)
        self.assertEqual(self.call("GET", "/play/api/me", cookie=cookie)[0], 200)
        # wrong old password / too short
        self.assertEqual(self.call("POST", "/play/api/password", {"old": "nope", "new": "long-enough-1"}, cookie=cookie)[0], 400)
        self.assertEqual(self.call("POST", "/play/api/password", {"old": password, "new": "short"}, cookie=cookie)[0], 400)
        s, d, r = self.raw("POST", "/play/api/password", {"old": password, "new": "long-enough-1"}, cookie=cookie)
        self.assertEqual(s, 200)
        fresh = r.getheader("Set-Cookie").split(";")[0]
        self.assertEqual(self.call("GET", "/play/api/me", cookie=cookie)[0], 401)   # the old cookie ends with the new password
        self.assertEqual(self.call("GET", "/play/api/me", cookie=fresh)[0], 200)
        self.assertEqual(self.call("POST", "/play/api/login", {"name": name, "password": password})[0], 401)
        # block, unblock, new password, remove (as you do in the settings)
        grimmich.players_change({"op": "block", "key": "carla", "blocked": True})
        self.assertEqual(self.call("GET", "/play/api/me", cookie=fresh)[0], 401)
        self.assertEqual(self.call("POST", "/play/api/login", {"name": name, "password": "long-enough-1"})[0], 401)
        grimmich.players_change({"op": "block", "key": "carla", "blocked": False})
        again = grimmich.players_change({"op": "reset", "key": "carla"})[0]["password"]
        self.assertEqual(self.call("POST", "/play/api/login", {"name": name, "password": again})[0], 200)
        grimmich.players_change({"op": "remove", "key": "carla"})
        self.assertEqual(self.call("POST", "/play/api/login", {"name": name, "password": again})[0], 401)

    def test_adding_players_checks_the_name(self):
        self.assertEqual(grimmich.players_change({"op": "add", "name": "anna"})[1], 400)   # exists (not case sensitive)
        self.assertEqual(grimmich.players_change({"op": "add", "name": "  "})[1], 400)
        self.assertEqual(grimmich.players_change({"op": "nonsense"})[1], 400)

    def test_signing_out_ends_the_cookie_in_the_browser(self):
        s, d, r = self.raw("POST", "/play/api/logout", {}, cookie=self.login())
        self.assertIn("Max-Age=0", r.getheader("Set-Cookie"))


class TestHiddenPeople(unittest.TestCase):
    """The list of people who are not shown from outside: no photo with them reaches a player, not even by address."""
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.mkdtemp()
        os.chdir(cls.folder)
        with open("photos.json", "w", encoding="utf-8") as f:
            json.dump({"photos": [{"key": k} for k in sorted(KEYS)]}, f)
        box = [10, 10, 50, 50, 100, 100]
        with open("immich_state.json", "w", encoding="utf-8") as f:
            json.dump({"people": {"p1": {"name": "Kid Test"}, "p2": {"name": "Anna Test"}},
                       "photos": {"F1_abc123": {"faces": [{"p": "p1", "b": box}, {"p": "p2", "b": box}]}, "F2_abc123": {"faces": [{"p": "p2", "b": box}]}, "F3_abc123": {"faces": [{"p": "p2", "b": box}]}}}, f)
        os.makedirs(os.path.join("series_output", "photos"))
        for k in KEYS:
            with open(os.path.join("series_output", "photos", k + ".jpg"), "wb") as f:
                f.write(b"\xff\xd8jpeg")
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), grimmich.Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.port = cls.server.server_address[1]
        cls.password = grimmich.players_change({"op": "add", "name": "Anna"})[0]["password"]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        os.chdir(ORIGINAL)

    def call(self, method, path, body=None, cookie=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request(method, path, body=json.dumps(body) if body is not None else None, headers={"Cookie": cookie} if cookie else {})
        r = c.getresponse()
        data = r.read()
        c.close()
        return r.status, data, r

    def cookie(self):
        return self.call("POST", "/play/api/login", {"name": "Anna", "password": self.password})[2].getheader("Set-Cookie").split(";")[0]

    def test_switch_and_list(self):
        cookie = self.cookie()
        vote = {"op": "add", "vote": {"type": "decade", "key": "F1_abc123", "from": 1950, "to": 1959}}
        # switched off: everything is there
        grimmich.players_change({"op": "exclude", "on": False, "people": ["p1"]})
        keys = {p["key"] for p in json.loads(self.call("GET", "/play/api/all", cookie=cookie)[1])["photos"]["photos"]}
        self.assertEqual(keys, KEYS)
        self.assertEqual(self.call("GET", "/play/photos/F1_abc123.jpg", cookie=cookie)[0], 200)
        # switched on with the child in the list: photos with the child are gone for players
        view = grimmich.players_change({"op": "exclude", "on": True, "people": ["p1"]})[0]
        self.assertEqual((view["exclude_on"], view["hidden_count"]), (True, 1))
        data = json.loads(self.call("GET", "/play/api/all", cookie=cookie)[1])
        self.assertEqual({p["key"] for p in data["photos"]["photos"]}, KEYS - {"F1_abc123"})
        self.assertNotIn("Kid Test", json.dumps(data))
        self.assertNotIn("F1_abc123", json.dumps(data))
        self.assertEqual(self.call("GET", "/play/photos/F1_abc123.jpg", cookie=cookie)[0], 404)
        self.assertEqual(self.call("GET", "/play/crops/F1_abc123_100_100_10_10_40.jpg", cookie=cookie)[0], 404)
        self.assertEqual(self.call("GET", "/play/photos/F2_abc123.jpg", cookie=cookie)[0], 200)
        self.assertEqual(self.call("POST", "/play/api/vote", vote, cookie=cookie)[0], 400)   # no answers about hidden photos either
        # on your own computer nothing is hidden
        self.assertEqual({p["key"] for p in json.loads(self.call("GET", "/api/all")[1])["photos"]["photos"]}, KEYS)
        # switched off again
        grimmich.players_change({"op": "exclude", "on": False, "people": ["p1"]})
        self.assertEqual(self.call("GET", "/play/photos/F1_abc123.jpg", cookie=cookie)[0], 200)


if __name__ == "__main__":
    unittest.main()
