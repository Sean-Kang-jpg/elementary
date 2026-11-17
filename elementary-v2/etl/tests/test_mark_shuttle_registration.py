"""Only confirmed registration links mark an institution; stale flags are cleared."""
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mark_shuttle_registration import FLAG, mark_markers, registered_keys  # noqa: E402
from review_shuttle_name_only import accept, export, hint, registration_id  # noqa: E402
from unittest import mock  # noqa: E402
import review_shuttle_name_only  # noqa: E402


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


class ReviewTests(unittest.TestCase):
    def moved(self):
        return registration(address="서울 강남구 삼성로 20")

    def test_an_accepted_link_marks_while_the_row_is_unchanged(self):
        row = self.moved()
        self.assertEqual(registered_keys([row], [neis("1")])[0], set())
        reviewed = {registration_id(row): "neis:B10-1"}
        keys, statuses = registered_keys([row], [neis("1")], reviewed)
        self.assertEqual((keys, statuses["accepted_by_review"]), ({"neis:B10-1"}, 1))
        # The registration moved again: the old decision no longer applies.
        self.assertEqual(registered_keys([registration(address="서울 강남구 삼성로 30")], [neis("1")], reviewed)[0], set())
        # The candidate is gone from NEIS: nothing is marked.
        self.assertEqual(registered_keys([row], [neis("2")], {registration_id(row): "neis:B10-1"})[0], set())

    def test_export_then_accept_round_trip(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            academies = folder / "neis.json"
            academies.write_text(json.dumps([neis("1")], ensure_ascii=False), encoding="utf-8")
            reviewed = folder / "reviewed.json"
            with mock.patch.object(review_shuttle_name_only, "read_registration", return_value=[self.moved()]),                     mock.patch.object(review_shuttle_name_only, "REVIEWED", reviewed):
                sheet = folder / "sheet.csv"
                self.assertEqual(export(Path("x.xlsx"), academies, sheet), 1)
                with sheet.open(encoding="utf-8-sig", newline="") as handle:
                    rows = list(csv.DictReader(handle))
                self.assertEqual(rows[0]["hint"], "같은 도로, 번호 다름 — 이전·표기 차이 가능")
                rows[0]["review"] = "y"
                with sheet.open("w", encoding="utf-8-sig", newline="") as handle:
                    writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
                    writer.writeheader()
                    writer.writerows(rows)
                self.assertEqual(accept(sheet, reviewed)["links"], 1)
                saved = json.loads(reviewed.read_text(encoding="utf-8"))["links"][0]
                self.assertEqual(set(saved), {"registration_id", "institution_key", "decided_on"})
                rows[0]["review"] = "N"
                with sheet.open("w", encoding="utf-8-sig", newline="") as handle:
                    writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
                    writer.writeheader()
                    writer.writerows(rows)
                self.assertEqual(accept(sheet, reviewed)["links"], 0)

    def test_hints(self):
        self.assertIn("다른 시군구", hint("경기 수원시 팔달로 1", "경기도 안양시 팔달로 1"))
        self.assertIn("지번", hint("충북 청주시 상당구 용암동 3092", "충청북도 청주시 상당구 중고개로125번길 7"))


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
