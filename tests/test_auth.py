"""Tests: accounts for the game from outside (auth.py): passwords, cookies, slowing down guessing. No server needed."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import auth  # noqa: E402


def doc_with(*names):
    doc, passwords = auth.empty(), {}
    for n in names:
        doc, passwords[n], err = auth.add_player(doc, n, "2026-11-04T10:00:00")
        assert err is None
    return doc, passwords


class TestPasswords(unittest.TestCase):
    def test_hash_is_salted_and_checks(self):
        a, b = auth.hash_password("secret-pass"), auth.hash_password("secret-pass")
        self.assertNotEqual(a, b)
        self.assertNotIn("secret-pass", a)
        self.assertTrue(auth.check_password("secret-pass", a))
        self.assertFalse(auth.check_password("secret-pasx", a))
        for broken in ("", "x", "scrypt$zz$zz", None):
            self.assertFalse(auth.check_password("secret-pass", broken))

    def test_new_passwords_are_readable_and_different(self):
        seen = {auth.new_password() for _ in range(50)}
        self.assertEqual(len(seen), 50)
        for p in seen:
            self.assertRegex(p, r"^[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$")


class TestPlayers(unittest.TestCase):
    def test_add_and_sign_in_not_case_sensitive(self):
        doc, pw = doc_with("Anna Test")
        self.assertEqual(auth.sign_in(doc, "anna  test", pw["Anna Test"]), "anna test")
        self.assertIsNone(auth.sign_in(doc, "Anna Test", "wrong"))
        self.assertIsNone(auth.sign_in(doc, "Nobody", pw["Anna Test"]))
        self.assertIsNone(auth.sign_in(doc, None, None))
        self.assertIsNone(auth.sign_in(doc, "Anna Test", "x" * 1000))

    def test_names_are_checked(self):
        doc, _ = doc_with("Anna")
        for bad in ("", "   ", None, 5, "x" * 41):
            self.assertEqual(auth.add_player(doc, bad, "t")[2], "name")
        self.assertEqual(auth.add_player(doc, "ANNA", "t")[2], "exists")

    def test_hashes_never_in_public_list(self):
        doc, pw = doc_with("Anna")
        text = str(auth.public_list(doc))
        self.assertNotIn("scrypt", text)
        self.assertNotIn(pw["Anna"], text)

    def test_blocked_player_cannot_sign_in(self):
        doc, pw = doc_with("Anna")
        doc = auth.set_blocked(doc, "anna", True)
        self.assertIsNone(auth.sign_in(doc, "Anna", pw["Anna"]))
        doc = auth.set_blocked(doc, "anna", False)
        self.assertEqual(auth.sign_in(doc, "Anna", pw["Anna"]), "anna")

    def test_own_password_change(self):
        doc, pw = doc_with("Anna")
        doc2, err = auth.change_own_password(doc, "anna", "wrong", "new-password")
        self.assertEqual(err, "wrong")
        doc2, err = auth.change_own_password(doc, "anna", pw["Anna"], "short")
        self.assertEqual(err, "short")
        doc2, err = auth.change_own_password(doc, "anna", pw["Anna"], "new-password")
        self.assertIsNone(err)
        self.assertEqual(auth.sign_in(doc2, "Anna", "new-password"), "anna")
        self.assertIsNone(auth.sign_in(doc2, "Anna", pw["Anna"]))


class TestCookie(unittest.TestCase):
    def setUp(self):
        self.doc, self.pw = doc_with("Anna", "Ben")

    def test_token_works_and_names_the_player(self):
        token = auth.make_token(self.doc, "anna", now=1000)
        key, entry = auth.read_token(self.doc, token, now=1001)
        self.assertEqual((key, entry["name"]), ("anna", "Anna"))

    def test_wrong_expired_and_tampered_tokens(self):
        token = auth.make_token(self.doc, "anna", now=1000)
        self.assertIsNone(auth.read_token(self.doc, token, now=1000 + auth.SESSION_DAYS * 86400 + 1))
        body, sig = token.rsplit(".", 1)
        for bad in (body + "." + "0" * 40, body.replace("YW5uYQ", "YmVu") + "." + sig, "", "a.b.c.d", "x", None, 5):
            self.assertIsNone(auth.read_token(self.doc, bad, now=1001), bad)
        other = auth.prepared(auth.empty())   # another installation has another secret
        other["players"] = self.doc["players"]
        self.assertIsNone(auth.read_token(other, token, now=1001))

    def test_token_ends_with_password_change_block_and_removal(self):
        token = auth.make_token(self.doc, "anna", now=1000)
        doc, _ = auth.reset_password(self.doc, "anna")
        self.assertIsNone(auth.read_token(doc, token, now=1001))
        self.assertIsNone(auth.read_token(auth.set_blocked(self.doc, "anna", True), token, now=1001))
        self.assertIsNone(auth.read_token(auth.remove_player(self.doc, "anna"), token, now=1001))
        self.assertIsNotNone(auth.read_token(auth.remove_player(self.doc, "ben"), token, now=1001))

    def test_cookie_header(self):
        self.assertEqual(auth.cookie_value("a=1; grimmich_play=abc.def; b=2"), "abc.def")
        self.assertIsNone(auth.cookie_value("a=1"))
        self.assertIsNone(auth.cookie_value(None))
        h = auth.cookie_header("tok", secure=True)
        for part in ("HttpOnly", "SameSite=Lax", "Secure", "Path=/play/"):
            self.assertIn(part, h)
        self.assertNotIn("Secure", auth.cookie_header("tok", secure=False))
        self.assertIn("Max-Age=0", auth.cookie_header("", secure=False, clear=True))


class TestFailLimit(unittest.TestCase):
    def test_blocks_after_limit_and_frees_after_window(self):
        f = auth.FailLimit(3, 60)
        for i in range(3):
            self.assertFalse(f.blocked("a", now=100 + i))
            f.fail("a", now=100 + i)
        self.assertTrue(f.blocked("a", now=110))
        self.assertFalse(f.blocked("b", now=110))
        self.assertFalse(f.blocked("a", now=200))
        f.fail("a", now=200)
        f.clear("a")
        self.assertFalse(f.blocked("a", now=201))


if __name__ == "__main__":
    unittest.main()
