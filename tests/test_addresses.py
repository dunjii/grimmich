"""Tests for the address choice (addresses.py): order, automatic/by hand, saving. No network.
Run in the Grimmich folder:   python3 -m unittest discover -s tests -v"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import addresses  # noqa: E402
import connections  # noqa: E402

W3 = {"IMMICH_URL": "http://192.168.1.10:2283", "IMMICH_URL_NAME": "Heimnetz", "IMMICH_URL_2": "http://100.1.2.3:2283/",
      "IMMICH_URL_2_NAME": "Tailscale"}


class TestChoice(unittest.TestCase):
    def setUp(self):
        addresses.forget_it()

    def test_one_address_without_a_name(self):
        self.assertEqual(addresses.choose({"IMMICH_URL": "http://a/"}, "immich"), ("Adresse 1", "http://a"))

    def test_no_address(self):
        self.assertEqual(addresses.choose({}, "immich"), ("", ""))

    def test_automatic_takes_the_first_reachable(self):
        self.assertEqual(addresses.choose(W3, "immich", verify=lambda u: True), ("Heimnetz", "http://192.168.1.10:2283"))
        addresses.forget_it()
        self.assertEqual(addresses.choose(W3, "immich", verify=lambda u: "100." in u), ("Tailscale", "http://100.1.2.3:2283"))

    def test_automatic_none_reachable_takes_the_first(self):
        self.assertEqual(addresses.choose(W3, "immich", verify=lambda u: False)[0], "Heimnetz")

    def test_result_is_remembered_briefly(self):
        counters = []
        addresses.choose(W3, "immich", verify=lambda u: counters.append(u) or True)
        addresses.choose(W3, "immich", verify=lambda u: counters.append(u) or True)
        self.assertEqual(len(counters), 2)   # only one pass (2 addresses), the second call uses the remembered result

    def test_by_hand_without_checking(self):
        w = {**W3, "IMMICH_AUTO": "0", "IMMICH_ACTIVE": "2"}
        def never(u):
            raise AssertionError("darf nicht pruefen")
        self.assertEqual(addresses.choose(w, "immich", verify=never)[0], "Tailscale")

    def test_default_immich_automatic_gramps_by_hand(self):
        self.assertTrue(addresses.automatic({}, "immich"))
        self.assertFalse(addresses.automatic({}, "gramps"))

    def test_gramps_does_not_switch_without_explicit_permission(self):
        w = {"GRAMPS_URL": "http://kopie", "GRAMPS_URL_2": "http://hub"}
        self.assertEqual(addresses.choose(w, "gramps", verify=lambda u: u == "http://hub")[1], "http://kopie")


class TestSaving(unittest.TestCase):
    def setUp(self):
        self.old = os.getcwd()
        self.tmp = tempfile.TemporaryDirectory()
        os.chdir(self.tmp.name)
        addresses.forget_it()

    def tearDown(self):
        os.chdir(self.old)
        self.tmp.cleanup()

    def test_old_file_without_new_fields_works(self):
        with open("immich.env", "w") as f:
            f.write("IMMICH_URL=http://alt:2283\nIMMICH_API_KEY=x\n")
        s = connections.status()["immich"]
        self.assertEqual(s["addresses"][0]["url"], "http://alt:2283")
        self.assertTrue(s["auto"])

    def test_immich_save_and_remove_three_addresses(self):
        connections.store("immich", {"url": "http://a", "name": "Heimnetz", "url2": "http://b", "name2": "VPN", "url3": "http://c", "read": "k", "auto": "0", "active": "2"})
        s = connections.status()["immich"]
        self.assertEqual([a["url"] for a in s["addresses"]], ["http://a", "http://b", "http://c"])
        self.assertEqual((s["addresses"][1]["name"], s["auto"], s["active"]), ("VPN", False, 2))
        connections.store("immich", {"url": "http://a", "url2": "", "name2": "", "url3": ""})
        s = connections.status()["immich"]
        self.assertEqual([a["url"] for a in s["addresses"]], ["http://a", "", ""])

    def test_empty_first_address_keeps_the_old_one(self):
        connections.store("immich", {"url": "http://a", "read": "k"})
        connections.store("immich", {"url": "", "url2": "http://b"})
        self.assertEqual(connections.status()["immich"]["addresses"][0]["url"], "http://a")

    def test_invalid_address_is_rejected(self):
        r = connections.store("immich", {"url": "http://a", "url2": "nur-ein-name"})
        self.assertFalse(r["ok"])
        r = connections.store("gramps", {"url3": "ftp://x"})
        self.assertFalse(r["ok"])

    def test_gramps_addresses_separate_from_immich(self):
        connections.store("gramps", {"url": "http://hub", "name": "Online", "user": "u", "password": "p"})
        self.assertEqual(connections.status()["gramps"]["addresses"][0]["name"], "Online")
        self.assertEqual(connections.status()["immich"]["addresses"][0]["url"], "")

    def test_link_address_follows_the_valid_address(self):
        connections.store("gramps", {"url": "http://hub", "url2": "http://vpn", "user": "u", "password": "p", "auto": "0", "active": "1"})
        self.assertEqual(connections.status()["gramps"]["used_url"], "http://hub")
        connections.store("gramps", {"active": "2"})
        self.assertEqual(connections.status()["gramps"]["used_url"], "http://vpn")

    def test_link_address_empty_without_address(self):
        self.assertNotIn("benutzt_url", connections.status()["gramps"])

    def test_both_immich_files_get_the_addresses(self):
        connections.store("immich", {"url": "http://a", "url2": "http://b", "read": "L", "separate": "1", "write_access": "S"})
        self.assertEqual(connections.read_env("immich_write.env")["IMMICH_URL_2"], "http://b")


if __name__ == "__main__":
    unittest.main()
