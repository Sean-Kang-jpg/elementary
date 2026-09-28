import csv
import json
import unittest

from etl.audit_operational_backend import (
    BASE_DIR,
    UPSTREAM_GAPS_PATH,
    review_trace_ids,
    upstream_school_gaps,
)
from etl.build_operational_masters import school_zone_label


class ReviewTraceIdsTest(unittest.TestCase):
    def test_combines_scoped_queue_rows_and_polygon_no_hits(self) -> None:
        traced = review_trace_ids(
            [{"apt_cd": "queued"}, {"apt_cd": "outside-scope"}],
            [
                {"apt_cd": "no-hit", "assignment_method": "unassigned_point_nohit"},
                {"apt_cd": "ordinary", "assignment_method": "official_polygon_point"},
            ],
            {"queued", "no-hit", "ordinary"},
        )

        self.assertEqual(traced, {"queued", "no-hit"})


if __name__ == "__main__":
    unittest.main()


class UpstreamSchoolGapTest(unittest.TestCase):
    """The allowlist must excuse a reviewed source defect without hiding a bug."""

    def test_every_listed_gap_is_a_single_school_zone_with_evidence(self) -> None:
        payload = json.loads(UPSTREAM_GAPS_PATH.read_text(encoding="utf-8"))
        self.assertTrue(payload["gaps"])
        for gap in payload["gaps"]:
            label = school_zone_label(gap["zone_label"])
            # A joint zone would excuse schools nobody reviewed.
            self.assertEqual(label.count("초"), 1, gap["zone_label"])
            self.assertTrue(gap["evidence"].strip(), gap["zone_label"])
            self.assertTrue(gap["school_name"].startswith(gap["zone_label"]), gap["zone_label"])

    def test_the_index_is_keyed_by_the_normalized_zone_label(self) -> None:
        gaps = upstream_school_gaps()
        self.assertIn("천안중앙초", gaps)
        self.assertEqual(gaps["천안중앙초"]["school_name"], "천안중앙초등학교")
        self.assertEqual(school_zone_label("천안중앙초통학구역"), "천안중앙초")

    def test_no_listed_school_is_present_in_the_standard_data(self) -> None:
        """An entry that the source has since republished must be removed, not kept."""
        source = BASE_DIR / "data" / "schoolzone" / "school_location_20260320.csv"
        if not source.is_file():
            self.skipTest("school standard data snapshot is not available")
        with source.open(encoding="utf-8-sig", newline="") as handle:
            names = {row["학교명"] for row in csv.DictReader(handle)}
        for gap in json.loads(UPSTREAM_GAPS_PATH.read_text(encoding="utf-8"))["gaps"]:
            self.assertNotIn(gap["school_name"], names, gap["school_name"])
