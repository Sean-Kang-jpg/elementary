import csv
import sys
import unittest
from pathlib import Path


ETL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_DIR))

import build_manual_qa_review_page as review_page


class ManualQaReviewPageTest(unittest.TestCase):
    def test_expected_scopes_and_sample_sizes_are_loaded(self) -> None:
        rows = review_page.load_rows()
        counts: dict[str, int] = {}
        for row in rows:
            if row["row_type"] != "sample":
                continue
            counts[row["scope_slug"]] = counts.get(row["scope_slug"], 0) + 1

        self.assertEqual(
            counts,
            {
                "g10": 50,
                "d10": 50,
                "c10": 50,
                "f10": 50,
                "h10": 50,
                "i10": 50,
                "t10": 50,
                "k10": 50,
                "m10": 50,
                "n10": 50,
                "p10": 50,
                "q10": 50,
                "r10": 50,
                "s10": 50,
                "q10-partial": 30,
            },
        )

    def test_exception_pool_carries_every_pooled_review_case(self) -> None:
        """The count moves whenever a region is rebuilt, so assert the contract.

        What must hold is that the page drops none of the pooled cases and labels
        each one by its case type, not that the pool is any particular size.
        """
        with review_page.REVIEW_CASES.open(encoding="utf-8-sig", newline="") as handle:
            pooled = list(csv.DictReader(handle))
        rows = review_page.load_rows()
        exception_rows = [row for row in rows if row["row_type"] == "exception"]

        self.assertTrue(pooled)
        self.assertEqual(len(exception_rows), len(pooled))
        self.assertTrue(all(row["stratum"].startswith("exception:") for row in exception_rows))
        self.assertEqual(
            {row["stratum"].removeprefix("exception:") for row in exception_rows},
            {row["case_type"] for row in pooled},
        )

    def test_template_defaults_to_daejeon_without_duplicating_all_types(self) -> None:
        self.assertIn("localStorage.getItem(SCOPE_STORE)||'g10'", review_page.TEMPLATE)
        self.assertEqual(review_page.TEMPLATE.count('<option value="">전체 유형</option>'), 1)


if __name__ == "__main__":
    unittest.main()
