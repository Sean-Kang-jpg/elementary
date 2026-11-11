"""Only confirmed registration links mark an institution; stale flags are cleared."""
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mark_shuttle_registration import FLAG, mark_markers, registered_keys  # noqa: E402


def neis(number, name="가나다학원", address="서울특별시 강남구 삼성로 10", kind="학원"):
    return {"ATPT_OFCDC_SC_CODE": "B10", "ACA_ASNUM": number, "ACA_NM": name, "ACA_INSTI_SC_NM": kind,
            "REALM_SC_NM": "입시.검정 및 보습", "_region": "서울특별시", "FA_RDNMA": address}


def registration(name="가나다학원", address="서울 강남구 삼성로 10", kind="학원", region="서울특별시"):
    return {"name": name, "region": region, "address": address, "institution_type": kind,
            "has_vehicle_information": True}


class RegisteredKeysTests(unittest.TestCase):
    def test_name_and_building_match_is_marked(self):
        keys, statuses = registered_keys([registration()], [neis("1")])
        self.assertEqual(keys, {"neis:B10-1"})
        self.assertEqual(statuses["matched"], 1)

    def test_name_only_and_test_regions_are_not_marked(self):
        keys, statuses = registered_keys(
            [registration(address="서울 강북구 삼성로 10"), registration(region="테스트시도")], [neis("1")])
        self.assertEqual(keys, set())
        self.assertEqual(sum(statuses.values()), 1)

    def test_other_facility_types_are_ignored(self):
        keys, statuses = registered_keys([registration(kind="유치원")], [neis("1")])
        self.assertEqual((keys, sum(statuses.values())), (set(), 0))


class MarkMarkersTests(unittest.TestCase):
    def test_marks_matching_keys_and_clears_old_flags(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "markers.csv"
            institutions = [{"name": "가", "key": "neis:B10-1"}, {"name": "나", "key": "neis:B10-2", FLAG: True},
                            {"name": "다"}]
            with path.open("w", encoding="utf-8-sig", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=("address_id", "institutions"))
                writer.writeheader()
                writer.writerow({"address_id": "a", "institutions": json.dumps(institutions, ensure_ascii=False)})
            self.assertEqual(mark_markers(path, {"neis:B10-1"}), 1)
            with path.open(encoding="utf-8-sig", newline="") as handle:
                result = json.loads(next(csv.DictReader(handle))["institutions"])
            self.assertEqual([item.get(FLAG) for item in result], [True, None, None])


if __name__ == "__main__":
    unittest.main()
