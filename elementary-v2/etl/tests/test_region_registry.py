import json
import unittest
from pathlib import Path

from etl.region_registry import CAPITAL_REGIONS, RegionScopeError, load_registry


class RegionRegistryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.registry = load_registry()

    def test_defines_all_seventeen_first_level_regions(self) -> None:
        self.assertEqual(len(self.registry), 17)
        names = {region.canonical_name for region in self.registry}
        self.assertEqual(len(names), 17)

    def test_capital_regions_are_the_only_production_scopes(self) -> None:
        production = {region.canonical_name for region in self.registry.production_regions}
        self.assertEqual(production, set(CAPITAL_REGIONS))

    def test_identifiers_are_unique(self) -> None:
        for attribute in ("neis_office_code", "legal_dong_code", "education_office"):
            values = [getattr(region, attribute) for region in self.registry]
            self.assertEqual(len(values), len(set(values)), attribute)

    def test_resolves_canonical_names_short_names_and_aliases(self) -> None:
        self.assertEqual(self.registry.get("서울").canonical_name, "서울특별시")
        self.assertEqual(self.registry.get("전라북도").canonical_name, "전북특별자치도")
        self.assertEqual(self.registry.get("강원도").canonical_name, "강원특별자치도")
        with self.assertRaises(RegionScopeError):
            self.registry.get("존재하지않는도")

    def test_renamed_regions_keep_their_legacy_legal_dong_code(self) -> None:
        gangwon = self.registry.get("강원특별자치도")
        self.assertEqual(gangwon.legal_dong_code, "51")
        self.assertIn("42", gangwon.legacy_legal_dong_codes)
        self.assertEqual(self.registry.by_legal_dong_code("4211025300").canonical_name, "강원특별자치도")
        self.assertEqual(self.registry.by_legal_dong_code("5111025300").canonical_name, "강원특별자치도")
        jeonbuk = self.registry.get("전북특별자치도")
        self.assertEqual(jeonbuk.legal_dong_code, "52")
        self.assertIn("45", jeonbuk.legacy_legal_dong_codes)
        self.assertEqual(self.registry.by_legal_dong_code("4511025300").canonical_name, "전북특별자치도")
        self.assertEqual(self.registry.by_legal_dong_code("5211025300").canonical_name, "전북특별자치도")

    def test_gyeonggi_gwangju_is_not_read_as_gwangju_metropolitan_city(self) -> None:
        region = self.registry.region_for_address("경기도 광주시 경안로 7")
        self.assertEqual(region.canonical_name, "경기도")
        metropolitan = self.registry.region_for_address("광주광역시 서구 상무중앙로 27")
        self.assertEqual(metropolitan.canonical_name, "광주광역시")

    def test_region_for_address_accepts_renamed_region_prefixes(self) -> None:
        for address, expected in (
            ("강원도 춘천시 중앙로 1", "강원특별자치도"),
            ("강원특별자치도 춘천시 중앙로 1", "강원특별자치도"),
            ("전라북도 전주시 완산구 효자로 225", "전북특별자치도"),
            ("전북특별자치도 전주시 완산구 효자로 225", "전북특별자치도"),
        ):
            self.assertEqual(self.registry.region_for_address(address).canonical_name, expected, address)

    def test_region_for_address_rejects_unknown_and_empty_values(self) -> None:
        self.assertIsNone(self.registry.region_for_address(""))
        self.assertIsNone(self.registry.region_for_address("서울 강남구 테헤란로 1"))

    def test_education_office_lookup_accepts_pre_rename_names(self) -> None:
        self.assertEqual(self.registry.by_education_office("전라북도교육청").canonical_name, "전북특별자치도")
        self.assertEqual(self.registry.by_education_office("서울특별시교육청").canonical_name, "서울특별시")
        self.assertIsNone(self.registry.by_education_office("없는교육청"))

    def test_school_name_prefix_is_a_measured_variant_not_a_rule(self) -> None:
        """No region reaches 100%, so matching may never require the prefix."""
        for region in self.registry:
            self.assertLess(region.school_name_prefix_coverage_pct, 100.0, region.canonical_name)
            if region.school_name_prefix is None:
                self.assertEqual(region.school_name_prefix_coverage_pct, 0.0, region.canonical_name)
        busan = self.registry.get("부산광역시")
        self.assertTrue(busan.has_school_name_prefix)
        self.assertLess(busan.school_name_prefix_coverage_pct, 5.0)
        self.assertFalse(self.registry.get("경기도").has_school_name_prefix)

    def test_name_variants_cover_prefixed_and_unprefixed_forms(self) -> None:
        daejeon = self.registry.get("대전광역시")
        self.assertEqual(daejeon.name_variants("대전대화초"), ("대전대화초", "대화초"))
        self.assertEqual(daejeon.name_variants("가수원초"), ("가수원초", "대전가수원초"))
        self.assertEqual(self.registry.get("경기도").name_variants("분당초"), ("분당초",))
        self.assertEqual(daejeon.name_variants(""), ())

    def test_measured_counts_account_for_every_nationwide_school(self) -> None:
        counts = [region.elementary_school_count for region in self.registry]
        self.assertNotIn(None, counts)
        self.assertEqual(sum(counts), 6303)

    def test_city_scope_filters_addresses_inside_its_province(self) -> None:
        scope = self.registry.scope("전라남도", ["목포시"])
        self.assertEqual(scope.label, "전라남도 / 목포시")
        self.assertTrue(scope.includes_address("전라남도 목포시 영산로 334"))
        self.assertFalse(scope.includes_address("전라남도 여수시 시청로 1"))
        self.assertFalse(scope.includes_address("서울특별시 강남구 테헤란로 1"))

    def test_whole_region_scope_accepts_every_address_in_the_region(self) -> None:
        scope = self.registry.scope("부산광역시")
        self.assertEqual(scope.label, "부산광역시")
        self.assertTrue(scope.includes_address("부산광역시 해운대구 센텀중앙로 55"))
        self.assertFalse(scope.includes_address("울산광역시 남구 중앙로 201"))

    def test_scopes_from_manifest_supports_current_and_city_filtered_shapes(self) -> None:
        scopes = self.registry.scopes_from_manifest({"regions": list(CAPITAL_REGIONS)})
        self.assertEqual([scope.label for scope in scopes], list(CAPITAL_REGIONS))
        mixed = self.registry.scopes_from_manifest(
            {"regions": ["부산광역시", {"region": "전라남도", "cities": ["목포시"]}]}
        )
        self.assertEqual([scope.label for scope in mixed], ["부산광역시", "전라남도 / 목포시"])

    def test_bounds_contain_every_school_in_the_operational_master(self) -> None:
        master = Path(__file__).resolve().parents[1] / "local_outputs_20260320" / "school_master_operational_v1.json"
        if not master.exists():
            self.skipTest("operational school master is a local artifact")
        rows = json.loads(master.read_text(encoding="utf-8"))
        outside = []
        for row in rows:
            latitude, longitude = row.get("latitude"), row.get("longitude")
            if latitude is None or longitude is None:
                continue
            region = self.registry.get(row["region"])
            if not region.bounds.contains(float(latitude), float(longitude)):
                outside.append((row["school_id"], row["region"], latitude, longitude))
        self.assertEqual(outside, [])

    def test_merged_source_value_is_not_a_plain_alias(self) -> None:
        """전남광주통합특별시 covers two regions, so get() must refuse it."""
        with self.assertRaises(RegionScopeError):
            self.registry.get("전남광주통합특별시")
        self.assertIsNotNone(self.registry.merged_source_region("전남광주통합특별시"))

    def test_merged_source_value_splits_by_district(self) -> None:
        for sigungu, expected in (
            ("동구", "광주광역시"),
            ("서구", "광주광역시"),
            ("광산구", "광주광역시"),
            ("목포시", "전라남도"),
            ("여수시", "전라남도"),
            ("무안군", "전라남도"),
        ):
            region = self.registry.resolve_source_region("전남광주통합특별시", sigungu)
            self.assertEqual(region.canonical_name, expected, sigungu)

    def test_merged_source_value_prefers_the_rows_own_road_address(self) -> None:
        region = self.registry.resolve_source_region(
            "전남광주통합특별시", "목포시", "전라남도 목포시 소영길 43"
        )
        self.assertEqual(region.canonical_name, "전라남도")
        region = self.registry.resolve_source_region(
            "전남광주통합특별시", "동구", "광주광역시 동구 금남로 185"
        )
        self.assertEqual(region.canonical_name, "광주광역시")

    def test_resolve_source_region_passes_through_normal_values(self) -> None:
        self.assertEqual(self.registry.resolve_source_region("대전광역시").canonical_name, "대전광역시")
        self.assertEqual(self.registry.resolve_source_region("경기").canonical_name, "경기도")

    def test_registry_file_is_canonical_json(self) -> None:
        path = Path(__file__).resolve().parents[1] / "region_registry.json"
        raw = path.read_text(encoding="utf-8")
        payload = json.loads(raw)
        self.assertEqual(raw, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    unittest.main()
