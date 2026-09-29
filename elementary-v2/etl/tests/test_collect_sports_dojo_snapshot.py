import unittest

from etl.collect_sports_dojo_snapshot import classify_sport, coordinates, row_in_scope
from etl.region_registry import load_registry


class CollectSportsDojoSnapshotTest(unittest.TestCase):
    def test_taekwondo_is_classified_from_business_name(self) -> None:
        self.assertEqual(classify_sport({"BPLC_NM": "튼튼 태권도장"}), "태권도")

    def test_registered_business_type_has_priority_over_fallback(self) -> None:
        row = {"BZSTAT_SE_NM": "합기도", "BPLC_NM": "튼튼 체육관"}
        self.assertEqual(classify_sport(row), "합기도")

    def test_invalid_coordinates_are_rejected(self) -> None:
        self.assertEqual(coordinates({"CRD_INFO_X": "", "CRD_INFO_Y": ""}), (None, None))
        self.assertEqual(coordinates({"CRD_INFO_X": "1", "CRD_INFO_Y": "1"}), (None, None))

    def test_pilot_scope_uses_address_registry(self) -> None:
        registry = load_registry()
        scopes = tuple(registry.scope(name) for name in ("서울특별시", "대전광역시", "부산광역시"))
        self.assertTrue(row_in_scope({"ROAD_NM_ADDR": "대전광역시 유성구 대학로 1"}, scopes))
        self.assertFalse(row_in_scope({"ROAD_NM_ADDR": "제주특별자치도 제주시 중앙로 1"}, scopes))


if __name__ == "__main__":
    unittest.main()
