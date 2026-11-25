import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from scripts import school_demand_dry_run as runner
from scripts.verify_school_afterschool_dry_run_pilots import DONGPA, YUNJUNG, local_baseline, pilot_candidate


class SchoolDemandTest(unittest.TestCase):
    def test_online_contract(self):
        metadata = {"dimensions": [{"apiName": dim} for dim in (runner.SCHOOL, runner.METHOD)]}
        headers = {"dimensionHeaders": [{"name": runner.SCHOOL}], "metricHeaders": [{"name": "totalUsers"}]}

        def row(school, users):
            return {"dimensionValues": [{"value": school}], "metricValues": [{"value": str(users)}]}

        pages = [dict(headers, rowCount=2, rows=[row(DONGPA, 9)]),
                 dict(headers, rowCount=2, rows=[row(YUNJUNG, 7)])]
        with patch.dict(runner.os.environ, {"GA4_ACCESS_TOKEN": "fixture"}):
            with patch.object(runner, "request_json", side_effect=[metadata, *pages]) as request:
                self.assertEqual(runner.ga_demand("2026-11-12", "2026-11-25"), [(DONGPA, 9), (YUNJUNG, 7)])
                calls = request.call_args_list
                self.assertTrue(calls[0].args[0].endswith("/metadata"))
                first, second = (call.args[2] for call in calls[1:])
                self.assertEqual(first["dateRanges"], [{"startDate": "2026-11-12", "endDate": "2026-11-25"}])
                self.assertEqual(first["dimensionFilter"]["andGroup"]["expressions"], [
                    runner.exact("eventName", "timetable_school_pick"), runner.exact(runner.METHOD, "user"),
                ])
                self.assertEqual([first["offset"], second["offset"]], ["0", "1"])
            with patch.object(runner, "request_json", return_value={"dimensions": []}):
                with self.assertRaisesRegex(runner.LookupFailure, "missing event dimensions"):
                    runner.ga_demand("2026-11-12", "2026-11-25")
        with patch.dict(runner.os.environ, {"SUPABASE_READ_KEY": "sb_publishable_fixture"}):
            with patch.object(runner, "request_json", side_effect=[[{"school_id": DONGPA}], []]) as request:
                self.assertEqual(runner.coverage_missing(DONGPA), [runner.SLOTS])
                self.assertTrue(all(len(call.args) == 2 for call in request.call_args_list))

    def test_candidate_selection_and_lookup_failures(self):
        as_of = date(2026, 11, 26)
        rows = [(f"B{i}", 10) for i in reversed(range(8))] + [("(not set)", 100)]
        checked = []

        def coverage(school):
            checked.append(school)
            return [] if school == "B0" else [runner.SLOTS]

        with tempfile.TemporaryDirectory() as directory:
            inputs = Path(directory)
            result, code = runner.batch(as_of, lambda *_: rows, coverage, inputs, "offline")
            self.assertEqual(code, 0)
            self.assertEqual([row["school_id"] for row in result["candidates"]], [f"B{i}" for i in range(1, 6)])
            self.assertEqual(checked, [f"B{i}" for i in range(6)])
            self.assertTrue(all(row["status"] == "source_review_required" for row in result["candidates"]))
            self.assertEqual((result["start_date"], result["end_date"]), ("2026-11-12", "2026-11-25"))
            (inputs / "B1").mkdir()
            (inputs / "B1" / "baseline.json").write_text("{}", encoding="utf-8")
            result, _ = runner.batch(as_of, lambda *_: rows, coverage, inputs, "offline")
            self.assertEqual(result["candidates"][0]["missing_inputs"], ["candidate.json"])
            for source, lookup, status, stage, expected in (
                ([], coverage, "no_demand", None, 0),
                (rows, lambda _: [], "no_missing_coverage", None, 0),
                (rows + [("B0", 9)], coverage, "lookup_failed", "ga4", 2),
                (rows, {}.__getitem__, "lookup_failed", "supabase", 2),
            ):
                result, code = runner.batch(as_of, lambda *_: source, lookup, inputs, "offline")
                self.assertEqual((result["status"], result.get("stage"), code), (status, stage, expected))
                self.assertEqual(result["candidates"], [])

    def test_fixed_pilots_repeat_and_recover(self):
        baseline = local_baseline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for school in (DONGPA, YUNJUNG):
                folder = root / school
                folder.mkdir()
                (folder / "baseline.json").write_text(runner.dump(baseline), encoding="utf-8")
                (folder / "candidate.json").write_text(runner.dump(pilot_candidate(school)), encoding="utf-8")
            fixture = root / "lookup.json"
            # Synthetic lookup selects both schools. The local pilot coverage is independent.
            fixture.write_text(json.dumps({
                "demand": [[DONGPA, 9], [YUNJUNG, 7]],
                "missing_tables": {DONGPA: [runner.SUMMARY, runner.SLOTS], YUNJUNG: [runner.SLOTS]},
            }), encoding="utf-8")
            output = root / "report.json"
            command = [sys.executable, "-m", "scripts.school_demand_dry_run", "--as-of", "2026-11-26",
                       "--inputs", str(root), "--offline", str(fixture), "--output", str(output)]
            subprocess.run(command, check=True)
            original = output.read_bytes()
            subprocess.run(command, check=True)
            self.assertEqual(output.read_bytes(), original)
            first, second = json.loads(original)["candidates"]
            self.assertEqual([first["counts"][table]["added"] for table in runner.KEYS], [1, 28, 7, 0])
            self.assertFalse(any(count for counts in second["counts"].values() for count in counts.values()))
            self.assertEqual([first["off_target_changes"], second["off_target_changes"]], [0, 0])

            with patch.object(Path, "replace", side_effect=InterruptedError):
                with self.assertRaises(InterruptedError):
                    runner.publish({"status": "interrupted"}, output)
            self.assertEqual(output.read_bytes(), original)
            self.assertEqual(len(list(root.iterdir())), 4)

            candidate = root / DONGPA / "candidate.json"
            reviewed = pilot_candidate(DONGPA)
            reviewed["tables"][runner.SLOTS] = {"state": "failed", "rows": []}
            candidate.write_text(runner.dump(reviewed), encoding="utf-8")
            failed = subprocess.run(command)
            self.assertEqual(failed.returncode, 3)
            report = json.loads(output.read_bytes())
            self.assertEqual(report["status"], "dry_run_failed")
            self.assertEqual(report["candidates"][0]["failed_tables"], [runner.SLOTS])
            self.assertEqual(report["candidates"][1]["status"], "dry_run_completed")
            candidate.write_text(runner.dump(pilot_candidate(DONGPA)), encoding="utf-8")
            subprocess.run(command, check=True)
            self.assertEqual(output.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
