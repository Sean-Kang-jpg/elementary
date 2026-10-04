"""Scope rules the recurring ETL broke on between 2026-09-27 and 2026-10-04."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ETL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_DIR))

import build_apartment_master_v1 as apartments  # noqa: E402
from etl.build_school_master_v2 import current_district  # noqa: E402
import run_due_etl as due  # noqa: E402
import run_recurring_etl as recurring  # noqa: E402


class ProductionScopesTest(unittest.TestCase):
    def test_every_production_region_is_covered_exactly_once(self) -> None:
        covered = [name for regions, _ in due.production_scopes() for name in regions]
        production = [region.canonical_name for region in due.load_registry().production_regions]
        self.assertCountEqual(covered, production)

    def test_sejong_runs_with_the_neighbours_its_zones_cross(self) -> None:
        # 미르초공주봉황초공동통학구역 names a 충남 school; built alone, 세종's
        # joint zones match nothing and the audit fails.
        scopes = {tuple(regions): slug for regions, slug in due.production_scopes()}
        self.assertIn(("세종특별자치시", "충청북도", "충청남도"), scopes)
        self.assertNotIn(("세종특별자치시",), scopes)

    def test_capital_comes_first_under_its_historical_slug(self) -> None:
        regions, slug = due.production_scopes()[0]
        self.assertEqual(slug, "capital")
        self.assertEqual(set(regions), {"서울특별시", "경기도", "인천광역시"})


class BuildScopeTest(unittest.TestCase):
    def test_builders_always_receive_the_scope(self) -> None:
        # With no --regions every builder defaults to all production regions,
        # for which no base master exists.
        with patch.object(recurring.subprocess, "run") as run:
            recurring.build_outputs(["대전광역시"], [])
        for call in run.call_args_list:
            command = call.args[0]
            self.assertIn("--regions", command)
            self.assertEqual(command[command.index("--regions") + 1], "대전광역시")
        self.assertEqual(run.call_count, len(recurring.BUILD_COMMANDS))


class MergedRegionMatchingTest(unittest.TestCase):
    def test_merged_kapt_address_meets_the_apartment_base(self) -> None:
        # K-apt reads 전남광주통합특별시 from 2026-09-22; the base still reads 전라남도.
        merged = apartments.address_candidates("전남광주통합특별시 목포시 백년대로 100")
        base = apartments.address_candidates("전라남도 목포시 백년대로 100")
        self.assertTrue(merged & base)

    def test_unmerged_addresses_are_unchanged(self) -> None:
        self.assertEqual(
            apartments.address_candidates("서울특별시 강남구 테헤란로 1"),
            {apartments.normalize("서울특별시 강남구 테헤란로 1")},
        )


class DistrictReformTest(unittest.TestCase):
    """인천's 2026-07-01 reform reaches school addresses through Schoolinfo."""

    def school(self, address: str, address_old: str = "") -> dict:
        return {"address": address, "address_old": address_old}

    def test_adopts_the_new_district_for_the_same_street(self) -> None:
        row = self.school("인천광역시 서구 승학로599번길 45")
        basic = {"SCHUL_RDNMA": "인천광역시 서해구 승학로 599번길 45"}
        self.assertEqual(current_district(row, basic), "서해구")

    def test_ignores_a_trailing_note_after_a_comma(self) -> None:
        row = self.school("인천광역시 중구 두미포로 100")
        basic = {"SCHUL_RDNMA": "인천광역시 영종구 두미포로 100, 인천중산초"}
        self.assertEqual(current_district(row, basic), "영종구")

    def test_never_borrows_a_district_for_a_different_street(self) -> None:
        row = self.school("인천광역시 서구 승학로599번길 45")
        basic = {"SCHUL_RDNMA": "인천광역시 서해구 다른로 1"}
        self.assertIsNone(current_district(row, basic))

    def test_leaves_province_city_positions_alone(self) -> None:
        row = self.school("경기도 화성시 동탄대로 1")
        basic = {"SCHUL_RDNMA": "경기도 오산시 동탄대로 1"}
        self.assertIsNone(current_district(row, basic))

    def test_uses_the_lot_address_when_there_is_no_road_address(self) -> None:
        row = self.school("", "인천광역시 서구 마전동 1")
        basic = {"SCHUL_RDNMA": "인천광역시 검단구 검단로 1"}
        self.assertEqual(current_district(row, basic), "검단구")


if __name__ == "__main__":
    unittest.main()
