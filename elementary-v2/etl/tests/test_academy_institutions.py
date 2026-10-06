"""Per-institution keys and the monthly diff (etl/academy_institutions.py)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_academy_marker_snapshot  # noqa: E402
from academy_institutions import EXCLUDED_REALMS, build_entries, diff_entries  # noqa: E402


def academy(office, number, name="수학학원", address="서울특별시 강남구 테헤란로 1", realm="입시.검정 및 보습"):
    return {"ATPT_OFCDC_SC_CODE": office, "ACA_ASNUM": number, "ACA_NM": name, "FA_RDNMA": address,
            "ACA_INSTI_SC_NM": "학원", "REALM_SC_NM": realm, "REG_YMD": "20200101", "_region": "서울특별시"}


def dojo(local_gov, number, name="튼튼태권도", status="영업/정상"):
    return {"source_id": f"{local_gov}-{number}", "local_gov_code": local_gov, "management_number": number,
            "institution_name": name, "sport_type": "태권도", "business_status": status,
            "road_address": "서울특별시 강남구 테헤란로 2", "region": "서울특별시", "licensed_on": "2020-01-01"}


class BuildEntriesTest(unittest.TestCase):
    def test_same_number_in_two_offices_stays_two_institutions(self):
        entries = build_entries([academy("B10", "3000000001"), academy("J10", "3000000001")], [])
        self.assertEqual([row["institution_key"] for row in entries], ["neis:B10-3000000001", "neis:J10-3000000001"])

    def test_same_dojo_number_in_two_local_governments_stays_two(self):
        entries = build_entries([], [dojo("3220000", "CDFH3301022026000002"), dojo("5310000", "CDFH3301022026000002")])
        self.assertEqual(len(entries), 2)

    def test_excluded_realm_and_closed_dojos_are_left_out(self):
        entries = build_entries([academy("B10", "1", realm="직업기술")], [dojo("3220000", "X", status="폐업")])
        self.assertEqual(entries, [])

    def test_exclusion_matches_the_marker_builder(self):
        self.assertEqual(EXCLUDED_REALMS, build_academy_marker_snapshot.EXCLUDED_REALMS)

    def test_dojo_snapshot_without_local_government_code_is_refused(self):
        old = dojo("3220000", "X")
        del old["local_gov_code"]
        with self.assertRaises(ValueError):
            build_entries([], [old])

    def test_repeated_key_is_refused(self):
        with self.assertRaises(ValueError):
            build_entries([academy("B10", "1"), academy("B10", "1", name="다른학원")], [])


class DiffEntriesTest(unittest.TestCase):
    def test_counts_each_kind_of_change_by_source(self):
        previous = build_entries(
            [academy("B10", "1"), academy("B10", "2"), academy("B10", "3")],
            [dojo("3220000", "A")],
        )
        current = build_entries(
            [academy("B10", "1", name="새이름학원"), academy("B10", "2", address="서울특별시 강남구 역삼로 9"),
             academy("B10", "4")],
            [dojo("3220000", "A"), dojo("3220000", "B")],
        )
        diff = diff_entries(previous, current)
        self.assertEqual((diff["previous"], diff["current"], diff["kept"]), (4, 5, 3))
        self.assertEqual(diff["added"], {"dojo": 1, "neis": 1})
        self.assertEqual(diff["removed"], {"neis": 1})
        self.assertEqual(diff["renamed"], {"neis": 1})
        self.assertEqual(diff["moved"], {"neis": 1})
        self.assertEqual(diff["samples"]["renamed"], [{"key": "neis:B10-1", "from": "수학학원", "to": "새이름학원"}])

    def test_samples_carry_no_address(self):
        diff = diff_entries([], build_entries([academy("B10", "1")], []))
        self.assertNotIn("테헤란로", str(diff))


if __name__ == "__main__":
    unittest.main()
