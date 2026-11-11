"""The pure checks in etl/run_academy_refresh.py: NEIS completeness and the
change plan with its per-region shrink limit."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import gzip  # noqa: E402
import json  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
from datetime import date, timedelta  # noqa: E402
from unittest import mock  # noqa: E402

import run_academy_refresh  # noqa: E402
from run_academy_refresh import check_completeness, collect_instruction, collect_shuttle, diff_plan, mark_shuttles  # noqa: E402


class CollectInstructionTest(unittest.TestCase):
    """체육교습업 is optional: a failed collection falls back or leaves it out, and never raises."""

    def run_failed_collection(self, stored_on):
        objects = {}
        if stored_on:
            objects = {
                run_academy_refresh.INSTRUCTION_OBJECT: gzip.compress(b"[]"),
                run_academy_refresh.INSTRUCTION_PROFILE_OBJECT: gzip.compress(json.dumps({"generated_at": stored_on}).encode()),
            }
        with tempfile.TemporaryDirectory() as folder, \
                mock.patch.object(run_academy_refresh, "INSTRUCTION_DIR", Path(folder)), \
                mock.patch.object(run_academy_refresh, "run_step", side_effect=subprocess.CalledProcessError(1, "x")), \
                mock.patch.object(run_academy_refresh, "storage_get", side_effect=lambda _u, _k, name: objects.get(name)):
            path, source = collect_instruction("u", "k", "20261106", False)
            return (path.exists() if path else None), source

    def test_no_stored_copy_leaves_it_out(self):
        self.assertEqual(self.run_failed_collection(None), (None, "collection failed; no stored copy"))

    def test_recent_copy_is_used(self):
        recent = date.today().isoformat()
        self.assertEqual(self.run_failed_collection(recent), (True, f"storage copy from {recent}"))

    def test_stale_copy_is_not_used(self):
        old = (date.today() - timedelta(days=30)).isoformat()
        path, source = self.run_failed_collection(old)
        self.assertIsNone(path)
        self.assertIn("stale", source)



class CollectShuttleTest(unittest.TestCase):
    """The shuttle badge is optional: a failed collection falls back to a copy up to 40 days old, or is left out."""

    def run_failed_collection(self, stored_on):
        objects = {}
        if stored_on:
            objects = {
                run_academy_refresh.SHUTTLE_OBJECT: gzip.compress(b"PK"),
                run_academy_refresh.SHUTTLE_METADATA_OBJECT: gzip.compress(json.dumps({"downloaded_at_utc": stored_on}).encode()),
            }
        with tempfile.TemporaryDirectory() as folder,                 mock.patch.object(run_academy_refresh, "SHUTTLE_DIR", Path(folder)),                 mock.patch.object(run_academy_refresh, "run_step", side_effect=subprocess.CalledProcessError(1, "x")),                 mock.patch.object(run_academy_refresh, "storage_get", side_effect=lambda _u, _k, name: objects.get(name)):
            path, source = collect_shuttle("u", "k", "20261201", False)
            return (path.exists() if path else None), source

    def test_no_stored_copy_leaves_it_out(self):
        self.assertEqual(self.run_failed_collection(None), (None, "collection failed; no stored copy"))

    def test_last_months_copy_is_used(self):
        last_month = (date.today() - timedelta(days=30)).isoformat()
        self.assertEqual(self.run_failed_collection(last_month), (True, f"storage copy from {last_month}"))

    def test_stale_copy_is_not_used(self):
        path, source = self.run_failed_collection((date.today() - timedelta(days=60)).isoformat())
        self.assertIsNone(path)
        self.assertIn("stale", source)

    def test_failed_marking_does_not_raise(self):
        with mock.patch.object(run_academy_refresh, "collect_shuttle", return_value=(Path("w.xlsx"), "collected")),                 mock.patch.object(run_academy_refresh, "run_step", side_effect=subprocess.CalledProcessError(2, "x")):
            result = mark_shuttles("u", "k", "20261201", Path("s.json"), False)
        self.assertEqual(result, {"source": "collected", "error": "marking failed (2)"})

def address(address_id, region, count):
    return {"address_id": address_id, "region": region, "institution_count": count}


def build_of(addresses, summaries=(), origins=()):
    return {
        "academy_address_serving": {(row["address_id"],): row for row in addresses},
        "apartment_academy_summary": {(complex_id,): {"canonical_complex_id": complex_id} for complex_id in summaries},
        "apartment_academy_origin_points": {key: {} for key in origins},
    }


class CompletenessTest(unittest.TestCase):
    def test_flags_only_regions_below_the_floor(self):
        short = check_completeness({"서울특별시": 89, "부산광역시": 95}, {"서울특별시": 100, "부산광역시": 100})
        self.assertEqual(short, ["서울특별시 89/100"])

    def test_a_missing_region_counts_as_zero(self):
        self.assertEqual(check_completeness({}, {"대구광역시": 10}), ["대구광역시 0/10"])

    def test_no_baseline_checks_nothing(self):
        self.assertEqual(check_completeness({"서울특별시": 1}, {}), [])


class DiffPlanTest(unittest.TestCase):
    def live(self, addresses, summaries=(), origins=()):
        return {
            "academy_address_serving": {(row["address_id"],) for row in addresses},
            "apartment_academy_summary": {(complex_id,) for complex_id in summaries},
            "apartment_academy_origin_points": set(origins),
        }

    def test_removed_rows_are_what_live_has_and_the_build_does_not(self):
        live_rows = [address("a", "서울특별시", 2), address("b", "서울특별시", 1)] + [
            address(f"k{i}", "서울특별시", 1) for i in range(20)]
        build_rows = [address("a", "서울특별시", 2), address("c", "서울특별시", 1)] + [
            address(f"k{i}", "서울특별시", 1) for i in range(20)]
        plan = diff_plan(self.live(live_rows, ["X", "orphan"], [("X", 1), ("X", 2)]), live_rows,
                         build_of(build_rows, ["X"], [("X", 1)]))
        self.assertEqual(plan["tables"]["academy_address_serving"]["removed_keys"], [("b",)])
        self.assertEqual(plan["tables"]["academy_address_serving"]["added"], 1)
        self.assertEqual(plan["tables"]["apartment_academy_summary"]["removed_keys"], [("orphan",)])
        self.assertEqual(plan["tables"]["apartment_academy_origin_points"]["removed_keys"], [("X", 2)])
        self.assertEqual(plan["blocked_regions"], [])

    def test_a_region_losing_more_than_the_limit_blocks_the_run(self):
        live_rows = [address(f"a{i}", "부산광역시", 1) for i in range(10)] + [address("s", "서울특별시", 1)]
        build_rows = [address(f"a{i}", "부산광역시", 1) for i in range(8)] + [address("s", "서울특별시", 1)]
        plan = diff_plan(self.live(live_rows), live_rows, build_of(build_rows))
        self.assertEqual(plan["blocked_regions"], ["부산광역시"])
        self.assertEqual(plan["regions"]["부산광역시"]["address_change"], -0.2)

    def test_institutions_shrinking_alone_also_blocks(self):
        live_rows = [address("a", "대구광역시", 10)]
        build_rows = [address("a", "대구광역시", 8)]
        plan = diff_plan(self.live(live_rows), live_rows, build_of(build_rows))
        self.assertEqual(plan["blocked_regions"], ["대구광역시"])


if __name__ == "__main__":
    unittest.main()
