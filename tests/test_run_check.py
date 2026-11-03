"""Tests: when may Grimmich skip the heavy evaluation (age estimate, series) during an update?

Safety first: when in doubt, everything must run. The steps are replaced here by small placeholder scripts.
Run in the Grimmich folder:   python3 -m unittest discover -s tests -v
"""
import os
import shutil
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
ALT = os.getcwd()
import grimmich  # noqa: E402  (wechselt in den Grimmich-Ordner)
import run_check  # noqa: E402
import storage  # noqa: E402

os.chdir(ALT)


def base_state():
    storage.save("immich_state.json", {"people": {"p1": {"name": "Anna", "birth": "1950-01-01"}}, "photos": {"F1": {"asset": "a1", "faces": []}}})
    storage.save("age_per_photo.json", {"F1": []})
    storage.save("series.json", {"series": []})
    storage.save("series_work.json", {"discarded": [], "counters": 2, "single_ok": False, "series": [{"id": "S001", "photos": ["F1", "F2"], "status": "ok"}, {"id": "S002", "photos": ["F3", "F4"], "status": "offen"}]})
    storage.save("kinds.json", {})
    with open("estimates_body.csv", "w", encoding="utf-8") as f:
        f.write("key;jahr\n")


class Base(unittest.TestCase):
    def setUp(self):
        self.old = os.getcwd()
        self.folder = tempfile.mkdtemp(prefix="lauf_test_")
        os.chdir(self.folder)
        storage._migrated.clear()
        base_state()

    def tearDown(self):
        os.chdir(self.old)
        storage._migrated.clear()
        shutil.rmtree(self.folder, ignore_errors=True)


class TestFingerprint(Base):
    def test_same_when_state_is_the_same(self):
        self.assertEqual(run_check.fingerprint(), run_check.fingerprint())
        self.assertIsNotNone(run_check.fingerprint())

    def test_changes_with_new_photo_or_face_or_names(self):
        fp = run_check.fingerprint()
        st = storage.load("immich_state.json", None)
        st["photos"]["F2"] = {"asset": "a2", "faces": []}
        storage.save("immich_state.json", st)
        self.assertNotEqual(fp, run_check.fingerprint())
        fp = run_check.fingerprint()
        st["people"]["p1"]["name"] = "Anna Maria"
        storage.save("immich_state.json", st)
        self.assertNotEqual(fp, run_check.fingerprint())
        fp = run_check.fingerprint()
        st["people"]["p1"]["birth"] = "1951-01-01"
        storage.save("immich_state.json", st)
        self.assertNotEqual(fp, run_check.fingerprint())

    def test_confirmed_series_counts_open_does_not(self):
        fp = run_check.fingerprint()
        a = storage.load("series_work.json", None)
        a["series"][1]["photos"].append("F5")   # offene Serie veraendert: egal
        storage.save("series_work.json", a)
        self.assertEqual(fp, run_check.fingerprint())
        a["series"][1]["status"] = "ok"        # jetzt bestaetigt: muss neu gerechnet werden
        storage.save("series_work.json", a)
        self.assertNotEqual(fp, run_check.fingerprint())

    def test_kind_change_counts(self):
        fp = run_check.fingerprint()
        storage.save("kinds.json", {"F1": "karte"})
        self.assertNotEqual(fp, run_check.fingerprint())

    def test_text_files_count(self):
        fp = run_check.fingerprint()
        with open("series_manual.txt", "w", encoding="utf-8") as f:
            f.write("F1 F2\n")
        self.assertNotEqual(fp, run_check.fingerprint())

    def test_photo_with_new_image_forces_calculation(self):
        storage.save("reload.json", {"assets": ["a1"]})
        self.assertIsNone(run_check.fingerprint())

    def test_missing_results_force_calculation(self):
        os.remove("estimates_body.csv")
        self.assertIsNone(run_check.fingerprint())

    def test_never_calculated(self):
        storage.remove("age_per_photo.json")
        self.assertIsNone(run_check.fingerprint())

    def test_remember_and_forget_marker(self):
        self.assertIsNone(run_check.old())
        run_check.remember("abc")
        self.assertEqual(run_check.old(), "abc")
        run_check.forget()
        self.assertIsNone(run_check.old())


class TestPipeline(Base):
    """Ganzer Aktualisieren-Ablauf mit Platzhalter-Skripten."""

    def setUp(self):
        super().setUp()
        self.scripts = {}
        for n in ("names", "state", "estimate", "series", "provenance"):
            p = os.path.join(self.folder, f"fake_{n}.py")
            with open(p, "w", encoding="utf-8") as f:
                f.write(f"import os, sys\nopen('lauflog.txt', 'a').write('{n}\\n')\nsys.exit(int(os.environ.get('FAKE_RC_{n.upper()}', '0')))\n")
            self.scripts[n] = p
        self.old_scripts = dict(grimmich.SCRIPTS)
        grimmich.SCRIPTS.update(self.scripts)
        # the placeholder scripts 'estimate' and 'series' do not replace the result files: they are already there

    def tearDown(self):
        grimmich.SCRIPTS.clear()
        grimmich.SCRIPTS.update(self.old_scripts)
        for k in list(os.environ):
            if k.startswith("FAKE_RC_"):
                del os.environ[k]
        super().tearDown()

    def run_(self, name="pipeline"):
        if os.path.exists("lauflog.txt"):
            os.remove("lauflog.txt")
        ok, text = grimmich.start_job(name, [])
        self.assertTrue(ok, text)
        for _ in range(100):
            time.sleep(0.1)
            if not grimmich.JOB.running:
                break
        self.assertFalse(grimmich.JOB.running)
        if not os.path.exists("lauflog.txt"):
            return []
        with open("lauflog.txt", encoding="utf-8") as f:
            return f.read().split()

    def test_first_run_does_everything_second_skips_the_heavy_steps(self):
        self.assertEqual(self.run_(), ["names", "state", "estimate", "series", "provenance"])
        self.assertEqual(self.run_(), ["names", "state", "provenance"])
        self.assertTrue(any("skipped" in z for z in grimmich.JOB.rows))
        self.assertEqual(self.run_(), ["names", "state", "provenance"])   # and it stays that way

    def test_change_in_immich_triggers_everything(self):
        self.run_()
        os.environ["FAKE_RC_STAND"] = "0"
        st = storage.load("immich_state.json", None)
        st["people"]["p1"]["name"] = "Anna Maria"   # in the real run the 'state' step writes this
        storage.save("immich_state.json", st)
        self.assertEqual(self.run_(), ["names", "state", "estimate", "series", "provenance"])
        self.assertEqual(self.run_(), ["names", "state", "provenance"])

    def test_newly_confirmed_series_triggers_everything(self):
        self.run_()
        a = storage.load("series_work.json", None)
        a["series"][1]["status"] = "ok"
        storage.save("series_work.json", a)
        self.assertEqual(self.run_(), ["names", "state", "estimate", "series", "provenance"])

    def test_failed_run_is_not_skipped(self):
        os.environ["FAKE_RC_SERIES"] = "1"
        self.run_()   # serien schlaegt fehl
        del os.environ["FAKE_RC_SERIES"]
        self.assertEqual(self.run_(), ["names", "state", "estimate", "series", "provenance"])

    def test_single_step_resets_the_fingerprint(self):
        self.run_()
        self.assertEqual(self.run_("estimate"), ["estimate"])
        self.assertEqual(self.run_(), ["names", "state", "estimate", "series", "provenance"])

    def test_provenance_always_runs(self):
        self.run_()
        self.assertIn("provenance", self.run_())


if __name__ == "__main__":
    unittest.main()
