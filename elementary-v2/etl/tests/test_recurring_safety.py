from __future__ import annotations

import sys
import unittest
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
        ):
            with self.assertRaisesRegex(RuntimeError, "controlled failure"):
                recurring.apply_run(manifest, loaded, 100, False, "scheduled", 1)

        refresh_serving.assert_not_called()
        finish_run.assert_called_once_with(
            "https://example.test", "key", "run-1", "failed", "controlled failure"
        )

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
