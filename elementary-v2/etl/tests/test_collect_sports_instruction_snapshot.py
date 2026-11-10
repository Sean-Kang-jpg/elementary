import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from academy_institutions import build_entries  # noqa: E402
from etl.collect_sports_instruction_snapshot import base_road_address, normalize  # noqa: E402
from etl.merge_sports_dojo_markers import add_instruction  # noqa: E402


def row(name="점프스쿨", address="경기도 용인시 수지구 만현로 110", status="정상운영", source_id="A1"):
    return {"source_id": source_id, "region": "경기도", "institution_name": name, "sport_type": "줄넘기",
            "business_status": status, "road_address": address, "licensed_on": "20211027"}


MATCHED = {"경기도 용인시 수지구 만현로 110": {"status": "matched", "longitude": "127.07", "latitude": "37.30"}}


class BaseRoadAddressTest(unittest.TestCase):
    def test_keeps_road_and_building_number_only(self) -> None:
        cases = {
            "경기도 용인시 수지구 만현로 110 (상현동)": "경기도 용인시 수지구 만현로 110",
            "경기도 용인시 수지구 수풍로 99(동천동)": "경기도 용인시 수지구 수풍로 99",
            "경기도 용인시 기흥구 동백7로 83, 중앙프라자 204, 205호 (동백동)": "경기도 용인시 기흥구 동백7로 83",
            "경기도 김포시 김포한강8로 173-88, 226, 227호 (마산동)": "경기도 김포시 김포한강8로 173-88",
        }
        for source, expected in cases.items():
            self.assertEqual(base_road_address(source), expected)

    def test_numbered_side_road_is_not_cut_at_its_number(self) -> None:
        self.assertEqual(base_road_address("경기도 용인시 수지구 광교중앙로295번길 21, 207호"), "경기도 용인시 수지구 광교중앙로295번길 21")
        self.assertEqual(base_road_address("경기도 용인시 수지구 만현로67번길 11, 신화 가동"), "경기도 용인시 수지구 만현로67번길 11")

    def test_district_named_with_ro_is_not_a_road(self) -> None:
        self.assertEqual(base_road_address("서울특별시 종로구 종로 1"), "서울특별시 종로구 종로 1")

    def test_short_province_name_is_expanded(self) -> None:
        self.assertEqual(base_road_address("경기 광주시 경안로 1"), "경기도 광주시 경안로 1")

    def test_lot_address_and_placeholder_are_rejected(self) -> None:
        for value in ("경기 안양시 만안구 박달동 203-1", "세종특별자치시 금남면 호탄리 101", "-", "", None):
            self.assertEqual(base_road_address(value), "")

    def test_phone_numbers_are_not_kept(self) -> None:
        kept = normalize({"faci_cd": "A", "faci_tel_no": "031-000-0000", "faci_mng_user_telno": "010-0000-0000"}, "경기도", "x")
        self.assertFalse(any("-0000" in str(value) for value in kept.values()))


class AddInstructionTest(unittest.TestCase):
    def test_new_address_becomes_a_sports_marker(self) -> None:
        markers = {}
        counts = add_instruction(markers, [row()], MATCHED, "s.json")
        self.assertEqual(counts["new_address_markers"], 1)
        [marker] = markers.values()
        self.assertEqual(marker["district"], "용인시")
        self.assertEqual(marker["latitude"], 37.30)
        self.assertEqual(marker["institutions"][0], {
            "name": "점프스쿨", "type": "체육교습업", "realm": "줄넘기", "subjects": ["sports"], "key": "sports:A1",
        })

    def test_closed_and_ungeocoded_rows_stay_off_the_map(self) -> None:
        markers = {}
        counts = add_instruction(markers, [row(status="폐업"), row(address="없는주소 1", source_id="A2")], MATCHED, "s.json")
        self.assertEqual(markers, {})
        self.assertEqual(counts["active"], 1)
        self.assertEqual(counts["not_geocoded"], 1)

    def test_failed_geocode_is_not_a_point(self) -> None:
        markers = {}
        add_instruction(markers, [row()], {"경기도 용인시 수지구 만현로 110": {"status": "no_result"}}, "s.json")
        self.assertEqual(markers, {})

    def test_same_name_at_one_address_counts_once(self) -> None:
        markers = {}
        rows = [row(), row(name="점프 스쿨", source_id="A2"), row(name="다른줄넘기", source_id="A3")]
        counts = add_instruction(markers, rows, MATCHED, "s.json")
        [marker] = markers.values()
        self.assertEqual(counts["same_name_skipped"], 1)
        self.assertEqual(marker["academy_count"], 2)
        self.assertEqual(len(marker["institutions"]), 2)

    def test_institution_list_carries_active_classes_with_their_own_key(self) -> None:
        entries = build_entries([], [], [row(), row(status="폐업", source_id="A2")])
        self.assertEqual([entry["institution_key"] for entry in entries], ["sports:A1"])
        self.assertEqual(entries[0]["source"], "sports")


if __name__ == "__main__":
    unittest.main()
