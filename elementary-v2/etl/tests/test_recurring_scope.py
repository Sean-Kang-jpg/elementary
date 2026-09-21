from __future__ import annotations

import sys
import unittest
from pathlib import Path

ETL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_DIR))

from etl.region_registry import RegionScopeError  # noqa: E402
from run_recurring_etl import (  # noqa: E402
    out_of_scope_regions,
    region_row_counts,
    resolve_scope,
    scope_checks,
)

CAPITAL = {"regions": ["서울특별시", "경기도", "인천광역시"], "domains": ["school", "apartment"]}


def loaded(*rows_by_table):
    return [(table, ("id",), rows) for table, rows in rows_by_table]


class ResolveScopeTest(unittest.TestCase):
    def test_resolves_the_capital_manifest_scope(self) -> None:
        scope = resolve_scope({"scope": CAPITAL})
        self.assertEqual(scope["regions"], ["서울특별시", "경기도", "인천광역시"])
        self.assertEqual(scope["labels"], ["서울특별시", "경기도", "인천광역시"])
        self.assertEqual(scope["cities"], {})
        self.assertEqual(scope["domains"], ["school", "apartment"])
        self.assertTrue(scope["registry_version"])

    def test_resolves_a_city_filtered_scope(self) -> None:
        scope = resolve_scope({"scope": {"regions": [{"region": "전라남도", "cities": ["목포시"]}]}})
        self.assertEqual(scope["regions"], ["전라남도"])
        self.assertEqual(scope["cities"], {"전라남도": ["목포시"]})
        self.assertEqual(scope["labels"], ["전라남도 / 목포시"])

    def test_unknown_region_fails_instead_of_loading_partially(self) -> None:
        with self.assertRaises(RegionScopeError):
            resolve_scope({"scope": {"regions": ["없는도"]}})

    def test_empty_scope_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            resolve_scope({"scope": {"regions": []}})
        with self.assertRaises(ValueError):
            resolve_scope({})


class RegionRowCountsTest(unittest.TestCase):
    def test_counts_rows_per_region_and_skips_tables_without_one(self) -> None:
        counts = region_row_counts(
            loaded(
                ("school_master", [{"region": "서울특별시"}, {"region": "서울특별시"}, {"region": "경기도"}]),
                ("apartment_name_history", [{"apt_cd": "A1"}]),
            )
        )
        self.assertEqual(counts, {"school_master": {"경기도": 1, "서울특별시": 2}})

    def test_reports_regions_that_are_not_in_the_declared_scope(self) -> None:
        rows = loaded(("school_master", [{"region": "서울특별시"}, {"region": "대전광역시"}, {"region": ""}]))
        self.assertEqual(
            out_of_scope_regions(rows, resolve_scope({"scope": CAPITAL})),
            {"대전광역시": 1, "(missing)": 1},
        )

    def test_nothing_is_flagged_when_every_row_is_in_scope(self) -> None:
        rows = loaded(("school_master", [{"region": "서울특별시"}, {"region": "인천광역시"}]))
        self.assertEqual(out_of_scope_regions(rows, resolve_scope({"scope": CAPITAL})), {})


class ScopeChecksTest(unittest.TestCase):
    def test_in_scope_regions_pass_and_others_warn(self) -> None:
        rows = loaded(("school_master", [{"region": "서울특별시"}, {"region": "대전광역시"}]))
        checks = scope_checks("run-1", rows, resolve_scope({"scope": CAPITAL}))
        by_scope = {check["scope_name"]: check for check in checks}
        self.assertEqual(by_scope["서울특별시"]["status"], "pass")
        self.assertEqual(by_scope["대전광역시"]["status"], "warn")
        self.assertEqual(by_scope["서울특별시"]["check_name"], "row_count:school_master")

    def test_out_of_scope_total_is_recorded_as_its_own_check(self) -> None:
        rows = loaded(("school_master", [{"region": "대전광역시"}, {"region": "대전광역시"}]))
        checks = scope_checks("run-1", rows, resolve_scope({"scope": CAPITAL}))
        guard = next(c for c in checks if c["check_name"] == "rows_outside_declared_scope")
        self.assertEqual(guard["status"], "warn")
        self.assertEqual(guard["metric_value"], 2)

    def test_a_clean_run_records_a_passing_guard(self) -> None:
        rows = loaded(("school_master", [{"region": "경기도"}]))
        checks = scope_checks("run-1", rows, resolve_scope({"scope": CAPITAL}))
        guard = next(c for c in checks if c["check_name"] == "rows_outside_declared_scope")
        self.assertEqual(guard["status"], "pass")
        self.assertEqual(guard["metric_value"], 0)


if __name__ == "__main__":
    unittest.main()
