"""Tests: progress of a background job (step counter and the bar of the update)."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
ORIGINAL = os.getcwd()
import grimmich  # noqa: E402  (changes into the Grimmich folder)

os.chdir(ORIGINAL)


class TestProgress(unittest.TestCase):
    def setUp(self):
        self.job = grimmich.Job()

    def test_before_the_start_nothing(self):
        self.assertEqual(self.job.status()["progress"], 0)

    def test_progress_from_step_and_counter(self):
        j = self.job
        j.running, j.step_no, j.step_total, j.sub = True, 2, 4, 0.5
        s = j.status()
        self.assertEqual((s["step_no"], s["step_total"]), (2, 4))
        self.assertAlmostEqual(s["progress"], 0.375)

    def test_finished_job_is_full(self):
        j = self.job
        j.running, j.step_no, j.step_total = False, 4, 4
        self.assertEqual(j.status()["progress"], 1)

    def test_counter_lines_are_recognised(self):
        m = grimmich.PROGRESS_LINE.match("  120 / 340\n")
        self.assertEqual((m.group(1), m.group(2)), ("120", "340"))
        self.assertIsNone(grimmich.PROGRESS_LINE.match("[257] IMAG.JPG: 1 face(s)"))
        self.assertIsNone(grimmich.PROGRESS_LINE.match("120 / 340"))   # only the indented counter lines

    def test_counter_lines_overwrite_each_other_but_the_log_stays_complete(self):
        j = self.job
        for line in ("start", "  1 / 3", "  2 / 3", "  3 / 3", "end"):
            j.add(line)
        self.assertEqual(list(j.rows), ["start", "  3 / 3", "end"])
        for i in range(500):
            j.add("line %d" % i)
        self.assertEqual(len(j.status()["rows"]), 60)
        self.assertEqual(len(j.status(all_rows=True)["rows"]), 503)


if __name__ == "__main__":
    unittest.main()
