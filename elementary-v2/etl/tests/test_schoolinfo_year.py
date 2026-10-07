"""Choosing a Schoolinfo year that is actually published (etl/run_due_etl.py)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from run_due_etl import schoolinfo_complete  # noqa: E402


class SchoolinfoYearTest(unittest.TestCase):
    def test_a_published_year_is_complete(self):
        # The lowest 2026 ratio, 전라남도: 442 grade rows for 548 schools.
        self.assertTrue(schoolinfo_complete(548, 442))

    def test_before_the_may_disclosure_the_year_is_incomplete(self):
        self.assertFalse(schoolinfo_complete(2313, 0))
        self.assertFalse(schoolinfo_complete(2313, 900))

    def test_an_empty_year_is_incomplete(self):
        self.assertFalse(schoolinfo_complete(0, 0))


if __name__ == "__main__":
    unittest.main()
