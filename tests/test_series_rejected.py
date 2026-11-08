"""Rejected series suggestions do not come back: dissolved with discard, photo removed from a series, changed suggestion group."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import grimmich  # noqa: E402


def work(series=(), discarded=()):
    return {"series": [dict(id=i, photos=list(p), status="open", cohesion=1, source="manual", suggested_new=[], rejected=[]) for i, p in series],
            "discarded": [list(d) for d in discarded], "counters": 9, "single_ok": False, "merge_hints": [], "merge_rejected": []}


def run(w, groups):
    old = grimmich.read_json
    grimmich.read_json = lambda name, default=None: {"series": [{"cohesion": 0.9, "photos": [{"key": k} for k in g]} for g in groups]}
    try:
        return grimmich.apply_suggestions(w)
    finally:
        grimmich.read_json = old


class RejectedTest(unittest.TestCase):
    def test_same_group_stays_away(self):
        w = work(discarded=[["A", "B", "C"]])
        run(w, [["A", "B", "C"]])
        self.assertEqual(w["series"], [])

    def test_changed_group_does_not_bring_pair_back(self):
        w = work(discarded=[["A", "B", "C"]])
        run(w, [["A", "B", "C", "D"]])   # now with D: A,B,C must not form up again (at most one of them with D)
        self.assertEqual([s["photos"] for s in w["series"]], [["A", "D"]])

    def test_group_keeps_the_rest(self):
        w = work(discarded=[["A", "B"]])
        run(w, [["A", "B", "C", "D"]])   # A and B stay apart; A with C and D is fine
        self.assertEqual([s["photos"] for s in w["series"]], [["A", "C", "D"]])

    def test_extension_skips_rejected_pair(self):
        w = work(series=[("S001", ["A", "B"])], discarded=[["C", "B"]])
        run(w, [["A", "B", "C"]])
        self.assertEqual(w["series"][0]["suggested_new"], [])

    def test_merge_hint_skips_rejected_pair(self):
        w = work(series=[("S001", ["A", "B"]), ("S002", ["C", "D"])], discarded=[["B", "C"]])
        run(w, [["A", "B", "C", "D"]])
        self.assertEqual(w["merge_hints"], [])

    def test_unrelated_suggestion_still_comes(self):
        w = work(discarded=[["A", "B"]])
        n = run(w, [["X", "Y"]])
        self.assertEqual(n, 1)


if __name__ == "__main__":
    unittest.main()
