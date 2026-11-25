import json
import subprocess
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

from scripts.school_afterschool_dry_run import CHECKS, KEYS, PROGRAMS, SLOTS, SUMMARY, compare, dump

TARGET = "B000000001"
OTHER = "B000000002"
SCRIPT = Path(__file__).with_name("school_afterschool_dry_run.py")


def scope(*rows, state="complete_reviewed"):
    return {"state": state, "rows": list(rows), "evidence": "Reviewed fixture, table 1"}


def snapshot(school_id):
    return {
        SUMMARY: [{"school_id": school_id, "review_state": "reviewed", "tier": "A"}],
        PROGRAMS: [{"school_id": school_id, "seq": 1, "name": "과학"},
                   {"school_id": school_id, "seq": 2, "name": "미술"}],
        SLOTS: [{"school_id": school_id, "kind": "맞춤형", "weekday": 1,
                 "start_time": "13:00:00", "end_time": "14:00:00", "courses": ["과학"]}],
        CHECKS: [{"school_id": school_id, "seq": 1, "reason": "PDF원문",
                  "weekday": None, "detail": "p. 2", "resolved_on": "2026-11-20"}],
    }


class DryRunTests(unittest.TestCase):
    def setUp(self):
        self.before = snapshot(TARGET)
        self.other = snapshot(OTHER)
        for table in KEYS:
            self.before[table].extend(self.other[table])
        self.candidate = {
            "school_id": TARGET,
            "tables": {
                SUMMARY: scope({"school_id": TARGET, "tier": "B", "review_state": "auto"}),
                PROGRAMS: scope({"school_id": TARGET, "seq": 3, "name": "체육"},
                                {"school_id": TARGET, "seq": 1, "name": "생활과학"}),
                SLOTS: scope({**self.before[SLOTS][0], "start_time": "13:00", "end_time": "14:00"}),
                CHECKS: scope({"school_id": TARGET, "seq": 2, "reason": "PDF원문", "detail": "p. 2",
                               "resolved_on": "2026-11-26"}),
            },
        }

    def test_complete_diff_preserves_review_and_is_repeatable(self):
        original = deepcopy(self.before)
        first = compare(TARGET, self.before, self.candidate)
        self.assertEqual(first["counts"][PROGRAMS], {"added": 1, "modified": 1, "deleted": 1})
        self.assertEqual(first["changes"][SUMMARY]["modified"][0]["after"]["review_state"], "reviewed")
        self.assertEqual(first["changes"][CHECKS]["added"][0]["resolved_on"], "2026-11-20")
        self.assertFalse(any(first["counts"][SLOTS].values()))
        self.assertEqual(self.before, original)
        proposed = first["proposed_baseline"]
        for table in KEYS:
            self.assertEqual([row for row in proposed[table] if row["school_id"] == OTHER], self.other[table])
        second = compare(TARGET, proposed, self.candidate)
        self.assertFalse(any(count for table in second["counts"].values() for count in table.values()))
        self.assertEqual(second["proposed_baseline"], proposed)
        self.candidate["tables"][PROGRAMS]["rows"].reverse()
        self.assertEqual(dump(first), dump(compare(TARGET, self.before, self.candidate)))

    def test_missing_failed_and_partial_hold_existing_rows(self):
        self.candidate["tables"] = {
            SUMMARY: scope(state="no_data"),
            PROGRAMS: scope({"school_id": TARGET, "seq": 1, "name": "다른 과목"},
                            {"school_id": TARGET, "seq": 3, "name": "새 과목"}, state="partial_reviewed"),
            SLOTS: scope(state="failed"),
        }
        output = compare(TARGET, self.before, self.candidate)
        self.assertFalse(any(count for table in output["counts"].values() for count in table.values()))
        self.assertEqual(len(output["coverage"][PROGRAMS]["held_candidates"]), 2)
        for table in KEYS:
            self.assertCountEqual(output["proposed_baseline"][table], self.before[table])

    def test_empty_complete_table_can_delete_but_keeps_resolved_check(self):
        self.candidate["tables"] = {PROGRAMS: scope(), CHECKS: scope()}
        output = compare(TARGET, self.before, self.candidate)
        self.assertEqual(output["counts"][PROGRAMS]["deleted"], 2)
        self.assertEqual(output["counts"][CHECKS]["deleted"], 0)

    def test_summary_deletion_needs_all_tables_and_no_remaining_checks(self):
        self.candidate["tables"] = {table: scope() for table in KEYS}
        with self.assertRaisesRegex(ValueError, "require a summary"):
            compare(TARGET, self.before, self.candidate)
        self.before[CHECKS][0]["resolved_on"] = None
        result = compare(TARGET, self.before, self.candidate)
        self.assertEqual(result["proposed_baseline"], self.other)
        self.assertFalse(any(
            count for table in compare(TARGET, self.other, self.candidate)["counts"].values()
            for count in table.values()
        ))

    def test_destructive_or_ambiguous_candidate_is_rejected(self):
        slot = self.before[SLOTS][0]
        for table, rows, evidence in (
            (SUMMARY, [], "reviewed"),
            (PROGRAMS, [], ""),
            (SLOTS, [slot, {**slot, "start_time": "13:00"}], "reviewed"),
            (CHECKS, [{"school_id": TARGET, "seq": 1, "reason": "원문불일치"}], "reviewed"),
        ):
            with self.subTest(table=table):
                self.candidate["tables"] = {table: {**scope(*rows), "evidence": evidence}}
                with self.assertRaises(ValueError):
                    compare(TARGET, self.before, self.candidate)

    def test_out_of_target_rejects_whole_cli_with_empty_stdout(self):
        with tempfile.TemporaryDirectory() as directory:
            baseline = Path(directory) / "baseline.json"
            candidate = Path(directory) / "candidate.json"
            baseline.write_text(dump(self.before), encoding="utf-8")
            good = deepcopy(self.candidate)
            good["tables"][CHECKS]["rows"].append(self.other[CHECKS][0])
            candidate.write_text(dump(good), encoding="utf-8")
            args = [sys.executable, str(SCRIPT), "--school-id", TARGET, "--baseline", str(baseline),
                    "--candidate", str(candidate)]
            rejected = subprocess.run(args, capture_output=True, text=True)
            self.assertEqual(rejected.returncode, 2)
            self.assertEqual(rejected.stdout, "")
            self.assertIn("out-of-target", rejected.stderr)
            candidate.write_text(dump(self.candidate), encoding="utf-8")
            accepted = subprocess.run(args, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(accepted.stdout), compare(TARGET, self.before, self.candidate))
            self.assertEqual(accepted.stdout, subprocess.check_output(args, text=True))
            self.assertEqual(baseline.read_text(encoding="utf-8"), dump(self.before))


if __name__ == "__main__":
    unittest.main()
