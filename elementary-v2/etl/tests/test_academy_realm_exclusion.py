"""Removing excluded realms from a live academy_address_serving row
(etl/apply_academy_realm_exclusion.py)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apply_academy_realm_exclusion import cleaned, excluded_count  # noqa: E402

STUDY = "입시.검정 및 보습"


def row(**overrides):
    base = {
        "address_id": "a1",
        "institution_count": 3,
        "realm_counts": {STUDY: 2, "직업기술": 1},
        "institution_type_counts": {"학원": 2, "교습소": 1},
        "institutions": [
            {"name": "수학학원", "type": "학원", "realm": STUDY},
            {"name": "영어교습소", "type": "교습소", "realm": STUDY},
            {"name": "간호학원", "type": "학원", "realm": "직업기술"},
        ],
    }
    return {**base, **overrides}


class AcademyRealmExclusionTest(unittest.TestCase):
    def test_counts_only_excluded_realms(self):
        self.assertEqual(excluded_count(row()), 1)
        self.assertEqual(excluded_count(row(realm_counts={STUDY: 3})), 0)

    def test_named_row_recounts_types_from_what_remains(self):
        result = cleaned(row(), 1)
        self.assertEqual(result["institution_count"], 2)
        self.assertEqual(result["realm_counts"], {STUDY: 2})
        self.assertEqual(result["institution_type_counts"], {"학원": 1, "교습소": 1})
        self.assertNotIn("간호학원", [item["name"] for item in result["institutions"]])

    def test_unnamed_row_takes_the_excluded_ones_from_academies(self):
        result = cleaned(row(institutions=[]), 1)
        self.assertEqual(result["institution_type_counts"], {"학원": 1, "교습소": 1})
        self.assertEqual(cleaned(row(institutions=[], institution_type_counts={"학원": 1}), 1)["institution_type_counts"], {})

    def test_cleaned_row_is_stable(self):
        result = cleaned(row(), 1)
        self.assertEqual(excluded_count(result), 0)


if __name__ == "__main__":
    unittest.main()
