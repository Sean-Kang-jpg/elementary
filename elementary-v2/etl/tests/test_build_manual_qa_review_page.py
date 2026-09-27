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
                "q10-partial": 30,
            },
        )

    def test_template_defaults_to_daejeon_without_duplicating_all_types(self) -> None:
        self.assertIn("localStorage.getItem(SCOPE_STORE)||'g10'", review_page.TEMPLATE)
        self.assertEqual(review_page.TEMPLATE.count('<option value="">전체 유형</option>'), 1)


if __name__ == "__main__":
    unittest.main()
