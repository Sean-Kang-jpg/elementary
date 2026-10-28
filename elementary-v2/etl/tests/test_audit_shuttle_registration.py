"""Guard against wrong-branch matches and age/level confusion."""
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audit_shuttle_registration import Matcher, address_keys, audit, grade_evidence, read_registration


def master(key="neis:B10-1", name="가나다학원", address="서울특별시 강남구 삼성로 10, 2층", group="학원"):
    return {"institution_key": key, "name": name, "region": "서울특별시",
            "institution_type": group, "addresses": [address]}


def registration(name="가나다학원", address="서울 강남구 삼성로 10", group="학원"):
    return {"name": name, "region": "서울특별시", "address": address,
            "institution_type": group, "has_vehicle_information": True}


class MatchingTests(unittest.TestCase):
    def test_province_alias_and_omitted_floor(self):
        self.assertEqual(Matcher([master()]).match(registration())["status"], "matched")

    def test_building_numbers_do_not_prefix_match(self):
        matcher = Matcher([master()])
        for address in ("서울 강남구 삼성로 1", "서울 강남구 삼성로 10-1", "서울 강남구 삼성로 100"):
            self.assertNotEqual(matcher.match(registration(address=address))["status"], "matched")

    def test_same_name_elsewhere_is_not_confirmed(self):
        result = Matcher([master()]).match(registration(address="서울 강북구 삼성로 10"))
        self.assertEqual(result["status"], "name_only_address_unverified")

    def test_same_name_same_building_is_ambiguous(self):
        result = Matcher([master(), master(key="neis:B10-2", address="서울 강남구 삼성로 10, 3층")]).match(registration())
        self.assertEqual(result["status"], "ambiguous")

    def test_suffix_changes_require_address(self):
        matcher = Matcher([master()])
        self.assertEqual(matcher.match(registration(name="가나다"))["method"], "suffix_normalized_name_address")
        self.assertNotEqual(matcher.match(registration(name="가나다", address="서울 강남구 삼성로 11"))["status"], "matched")

    def test_types_and_missing_vehicle_evidence_are_not_bridged(self):
        matcher = Matcher([master()])
        self.assertNotEqual(matcher.match(registration(group="교습소"))["status"], "matched")
        row = registration()
        row["has_vehicle_information"] = False
        self.assertEqual(matcher.match(row)["status"], "missing_vehicle_evidence")

    def test_lot_and_road_are_separate(self):
        self.assertFalse(address_keys("경기 양주시 옥정동 1041-1") & address_keys("경기 양주시 옥정로 1041-1"))

    def test_fee_text_adds_grade_evidence_without_guessing_beginner_age(self):
        row = {"LE_CRSE_LIST_NM": "보습", "PSNBY_THCC_CNTNT": "논술초1~3:150000"}
        self.assertEqual(grade_evidence(row)["tier"], "grade1_explicit_candidate")
        for text in ("피아노초급1:100000", "중등1학년:100000", "최초1회:10000", "피아노기초1:100000", "영어기초1:100000"):
            self.assertEqual(grade_evidence({"PSNBY_THCC_CNTNT": text})["tier"], "unknown")
        self.assertEqual(grade_evidence({"LE_CRSE_LIST_NM": "초등고학년"})["tier"], "elementary_label")

    def test_sparse_xlsx_columns_do_not_shift_address(self):
        xml = '''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
        <row r="1"><c r="D1" t="inlineStr"><is><t>시설 종류</t></is></c><c r="E1" t="inlineStr"><is><t>시설명</t></is></c></row>
        <row r="2"><c r="A2"><v>1</v></c><c r="D2" t="inlineStr"><is><t>학원</t></is></c><c r="E2" t="inlineStr"><is><t>가나다학원</t></is></c><c r="G2" t="inlineStr"><is><t>서울 강남구 삼성로 10</t></is></c><c r="H2" t="inlineStr"><is><t>차량정보</t></is></c></row>
        </sheetData></worksheet>'''
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/"source.xlsx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("xl/worksheets/sheet1.xml", xml)
            result = read_registration(path)
        self.assertEqual(result[0]["address"], "서울 강남구 삼성로 10")
        self.assertTrue(result[0]["has_vehicle_information"])
        self.assertNotIn("vehicle_number", result[0])

    def test_test_regions_excluded_and_unavailable_master_is_not_zero_percent(self):
        item = master()
        item.update(source="neis", grade={"tier": "unknown", "flags": {}}, subjects=[])
        good = registration()
        fake = {**registration(), "region": "테스트시도"}
        hub = registration(group="거점형늘봄센터")
        summary, joined = audit([good, fake, hub], [item], {})
        self.assertEqual(summary["registration_rows"], 3)
        self.assertEqual(summary["excluded_nonproduction_region_rows"], 1)
        self.assertEqual(summary["by_type"]["학원"]["registration_rows"], 1)
        self.assertEqual(summary["by_type"]["학원"]["registration_to_master_match_pct"], 100)
        self.assertIsNone(summary["by_type"]["거점형늘봄센터"]["registration_to_master_match_pct"])
        self.assertEqual(len(joined), 2)


if __name__ == "__main__":
    unittest.main()
