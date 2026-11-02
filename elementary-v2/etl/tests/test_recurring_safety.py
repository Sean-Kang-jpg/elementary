from __future__ import annotations

import contextlib
import sys
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import ANY, call, patch


ETL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_DIR))

import run_due_etl as due  # noqa: E402
import run_recurring_etl as recurring  # noqa: E402


class RecurringSafetyTests(unittest.TestCase):
    def test_pre_refresh_failure_does_not_replace_serving(self) -> None:
        manifest = {
            "pipeline_name": "test",
            "pipeline_version": "test-v1",
            "retention_days": 1,
            # A run always declares its scope; verification is per region.
            "scope": {"regions": ["서울특별시"], "domains": ["school"]},
            "snapshots": [],
        }
        loaded = [("school_master", ("school_id",), [{"school_id": "S1"}])]

        with (
            patch.object(recurring.uploader, "credentials", return_value=("https://example.test", "key")),
            patch.object(recurring, "create_run", return_value="run-1"),
            patch.object(recurring, "archive_snapshots"),
            patch.object(recurring, "stage_rows", side_effect=RuntimeError("controlled failure")),
            patch.object(recurring, "mark_snapshots"),
            patch.object(recurring.uploader, "finish_etl_run") as finish_run,
            patch.object(recurring.uploader, "refresh_serving") as refresh_serving,
            patch.object(recurring, "purge_staging") as purge,
        ):
            with self.assertRaisesRegex(RuntimeError, "controlled failure"):
                recurring.apply_run(manifest, loaded, 100, False, "scheduled", 1)

        refresh_serving.assert_not_called()
        finish_run.assert_called_once_with(
            "https://example.test", "key", "run-1", "failed", "controlled failure"
        )
        # A failed run must not leave its staged rows behind.
        purge.assert_called_once_with("https://example.test", "key", "run-1")

    def apartment_run(self, remote: dict[str, set[tuple[str, ...]]], events: list[str]):
        manifest = {
            "pipeline_name": "test",
            "pipeline_version": "test-v1",
            "retention_days": 1,
            "scope": {"regions": ["서울특별시"], "domains": ["apartment"]},
            "resolved_scope": {"regions": ["서울특별시"], "labels": ["서울특별시"]},
            "snapshots": [],
        }
        masters = [{"canonical_complex_id": f"KAPT:{n}", "region": "서울특별시"} for n in range(20)]
        loaded = [
            ("apartment_complex_master", ("canonical_complex_id",), masters),
            ("apartment_assignment_units", ("apt_cd",), [{"apt_cd": "A1", "region": "서울특별시"}]),
            (
                "apartment_assignment_schools",
                ("apt_cd", "school_id"),
                [{"apt_cd": "A1", "school_id": f"S{n}"} for n in range(20)],
            ),
        ]
        counts = {"apartment_complex_master": 20, "apartment_assignment_units": 1}

        def deleted(url, key, table, keys, identities):
            events.append(f"delete {table} {len(identities)}")
            return len(identities)

        patches = (
            patch.object(recurring.uploader, "credentials", return_value=("https://example.test", "key")),
            patch.object(recurring, "create_run", return_value="run-1"),
            patch.object(recurring, "archive_snapshots"),
            patch.object(recurring, "stage_rows"),
            patch.object(recurring, "mark_snapshots"),
            patch.object(recurring, "purge_staging"),
            patch.object(recurring, "staging_depth", return_value=0),
            patch.object(recurring, "update_schedules"),
            patch.object(recurring, "record_checks"),
            patch.object(recurring.uploader, "finish_etl_run"),
            patch.object(recurring.uploader, "load_rows", return_value=[{}] * 3),
            patch.object(recurring.uploader, "table_count", return_value=20),
            patch.object(
                recurring.uploader, "upsert_batch",
                side_effect=lambda url, key, table, keys, rows: events.append(f"upsert {table}"),
            ),
            patch.object(
                recurring.uploader, "region_count",
                side_effect=lambda url, key, table, region: 3 if table == "school_apartment_serving" else counts[table],
            ),
            patch.object(
                recurring.uploader, "refresh_serving", side_effect=lambda url, key: events.append("refresh")
            ),
            patch.object(
                recurring, "remote_scope_keys",
                side_effect=lambda url, key, table, keys, regions: remote.get(table, set()),
            ),
            patch.object(recurring, "delete_keys", side_effect=deleted),
        )
        return manifest, loaded, patches

    def test_regrouped_masters_are_deleted_after_serving_refresh(self) -> None:
        events: list[str] = []
        remote = {
            "apartment_complex_master": {(f"KAPT:{n}",) for n in range(20)} | {("APT:OLD",)},
            "apartment_assignment_units": {("A1",)},
            "apartment_assignment_schools": {("A1", f"S{n}") for n in range(20)} | {("A1", "S_OLD")},
        }
        manifest, loaded, patches = self.apartment_run(remote, events)
        with contextlib.ExitStack() as stack:
            for item in patches:
                stack.enter_context(item)
            recurring.apply_run(manifest, loaded, 100, False, "scheduled", 1)

        self.assertEqual(
            events,
            [
                "upsert apartment_complex_master",
                "upsert apartment_assignment_units",
                "upsert apartment_assignment_schools",
                "delete apartment_assignment_schools 1",
                "refresh",
                "delete apartment_complex_master 1",
            ],
        )

    def test_large_stale_share_stops_before_any_write(self) -> None:
        events: list[str] = []
        remote = {"apartment_complex_master": {(f"APT:{n}",) for n in range(5)}}
        manifest, loaded, patches = self.apartment_run(remote, events)
        with contextlib.ExitStack() as stack:
            for item in patches:
                stack.enter_context(item)
            with self.assertRaisesRegex(RuntimeError, "nothing was deleted"):
                recurring.apply_run(manifest, loaded, 100, False, "scheduled", 1)

        self.assertEqual(events, [])

    def test_delete_keys_filters(self) -> None:
        paths: list[str] = []

        def capture(url, key, method, path, payload=None, prefer=None, timeout=60):
            paths.append(urllib.parse.unquote(path))
            return [{}]

        with patch.object(recurring, "request_json", side_effect=capture):
            recurring.delete_keys("u", "k", "apartment_complex_master", ("canonical_complex_id",), [("APT:X1",)])
            recurring.delete_keys(
                "u", "k", "apartment_assignment_schools", ("apt_cd", "school_id"), [("A1", "S1")]
            )

        self.assertIn('canonical_complex_id=in.("APT:X1")', paths[0])
        self.assertIn('or=(and(apt_cd.eq."A1",school_id.eq."S1"))', paths[1])

    def test_delete_keys_rejects_partial_batch(self) -> None:
        with patch.object(recurring, "request_json", return_value=[]):
            with self.assertRaisesRegex(RuntimeError, "deleted 0 of 1"):
                recurring.delete_keys("u", "k", "apartment_complex_master", ("canonical_complex_id",), [("APT:X1",)])

    def test_retry_marks_second_attempt(self) -> None:
        invocations: list[list[str]] = []

        def run_once(*parts: str) -> None:
            invocations.append(list(parts))
            if len(invocations) == 1:
                raise RuntimeError("temporary failure")

        with (
            patch.object(due, "build_manifest", return_value=Path("runtime.json")),
            patch.object(due, "run_script", side_effect=run_once),
            patch.object(due, "notify_failure") as notify,
        ):
            due.execute_group("apartment", True, max_attempts=2, retry_delay=0)

        self.assertIn("scheduled", invocations[0])
        self.assertIn("retry", invocations[1])
        self.assertEqual(invocations[1][invocations[1].index("--attempt-number") + 1], "2")
        notify.assert_has_calls([call("apartment", 1, ANY)])

    def test_collection_failure_is_retried(self) -> None:
        with (
            patch.object(
                due,
                "build_manifest",
                side_effect=[RuntimeError("source unavailable"), Path("runtime.json")],
            ) as build_manifest,
            patch.object(due, "run_script") as run_script,
            patch.object(due, "notify_failure") as notify,
        ):
            due.execute_group("school", True, max_attempts=2, retry_delay=0)

        self.assertEqual(build_manifest.call_count, 2)
        self.assertIn("retry", run_script.call_args.args)
        notify.assert_called_once_with("school", 1, ANY)


if __name__ == "__main__":
    unittest.main()
