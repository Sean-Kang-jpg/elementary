"""Compare one school's reviewed serving rows with a local four-table snapshot."""

import argparse
import json
import re
import sys
from datetime import time
from pathlib import Path

SUMMARY, PROGRAMS, SLOTS, CHECKS = (
    "school_afterschool_" + suffix for suffix in ("summary", "programs", "slots", "checks")
)
KEYS = {
    SUMMARY: ("school_id",),
    PROGRAMS: ("school_id", "seq"),
    SLOTS: ("school_id", "kind", "weekday", "start_time", "end_time"),
    CHECKS: ("school_id", "seq"),
}
TIMES = ("start_time", "end_time", *("latest_end_" + day for day in ("mon", "tue", "wed", "thu", "fri")))
REVIEWED = {"complete_reviewed", "partial_reviewed"}


def dump(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)


def read_json(path):
    def unique_fields(pairs):
        result = {}
        for field, value in pairs:
            if field in result:
                raise ValueError(f"duplicate JSON field: {field}")
            result[field] = value
        return result

    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_fields)


def sql_time(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?", value):
        raise ValueError(f"invalid SQL TIME: {value!r}")
    if re.fullmatch(r"24:00(:00(\.0{1,6})?)?", value):
        return "24:00:00"
    return time.fromisoformat(value).isoformat()


def index(table, rows, target=None):
    if not isinstance(rows, list):
        raise ValueError(f"{table}: expected a row array")
    result = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("school_id"), str) or not row["school_id"].strip():
            raise ValueError(f"{table}: expected a row with school_id")
        if target is not None and row["school_id"] != target:
            raise ValueError(f"{table}: out-of-target candidate {row['school_id']}")
        values = dict(row)
        for field in TIMES:
            if values.get(field) is not None:
                values[field] = sql_time(values[field])
        if table in (PROGRAMS, CHECKS) and (type(row["seq"]) is not int or row["seq"] < 1):
            raise ValueError(f"{table}: invalid seq")
        if table == SLOTS or row.get("weekday") is not None:
            if type(row["weekday"]) is not int or not 1 <= row["weekday"] <= 5:
                raise ValueError(f"{table}: invalid weekday")
        if values.get("start_time") and values.get("end_time") and values["start_time"] >= values["end_time"]:
            raise ValueError(f"{table}: start_time must precede end_time")
        key = tuple(values[field] for field in KEYS[table])
        if table == SLOTS and (not isinstance(key[1], str) or not all(key[1:])):
            raise ValueError(f"{table}: missing slot key fields")
        if key in result:
            raise ValueError(f"{table}: duplicate primary key {key}")
        result[key] = row
    return result


def check_identity(row):
    # The loader matches resolution on school_id, reason, weekday and detail.
    return row["school_id"], row["reason"], row.get("weekday"), row.get("detail")


def preserve_resolutions(existing, reviewed):
    closed = {}
    for row in existing.values():
        if row.get("resolved_on") is not None:
            identity = check_identity(row)
            if identity in closed:
                raise ValueError(f"ambiguous resolved check: {identity}")
            closed[identity] = row
    result = {}
    matched = set()
    for key, row in reviewed.items():
        identity = check_identity(row)
        if identity in matched:
            raise ValueError(f"ambiguous candidate check: {identity}")
        matched.add(identity)
        prior = closed.get(identity)
        result[key] = {
            **row, "weekday": row.get("weekday"), "detail": row.get("detail"),
            "resolved_on": prior["resolved_on"] if prior else None,
        }
    for identity in closed.keys() - matched:
        prior = closed[identity]
        key = prior["school_id"], prior["seq"]
        if key in result:
            raise ValueError(f"candidate reuses the seq of an unmatched resolved check: {key}")
        result[key] = prior
    return result


def merge_row(table, before, candidate):
    if table == CHECKS and before is not None and check_identity(before) != check_identity(candidate):
        before = None
    after = {**(before or {}), **candidate}
    if table == SUMMARY and before is not None:
        after["review_state"] = before["review_state"]
    for field in TIMES:
        previous = (before or {}).get(field)
        if previous is not None and after.get(field) is not None and sql_time(previous) == sql_time(after[field]):
            after[field] = previous
    return after


def compare(school_id, baseline, candidate):
    if not school_id.strip() or not isinstance(baseline, dict) or set(baseline) != set(KEYS):
        raise ValueError("provide one school ID and all four baseline tables")
    if (not isinstance(candidate, dict) or set(candidate) != {"school_id", "tables"}
            or candidate["school_id"] != school_id):
        raise ValueError("candidate must identify exactly the target school and contain tables")
    scopes = candidate["tables"]
    if not isinstance(scopes, dict) or set(scopes) - set(KEYS):
        raise ValueError("unknown candidate table")

    original = {table: index(table, baseline[table]) for table in KEYS}
    existing_school = any(key[0] == school_id for rows in original.values() for key in rows)
    proposed = {}
    changes = {}
    coverage = {}
    for table in KEYS:
        scope = scopes.get(table, {"state": "no_data", "rows": []})
        if not isinstance(scope, dict) or set(scope) - {"state", "rows", "evidence"}:
            raise ValueError(f"{table}: invalid coverage object")
        state = scope["state"]
        reviewed = index(table, scope["rows"], school_id)
        evidence = scope.get("evidence")
        if state not in REVIEWED | {"no_data", "failed"}:
            raise ValueError(f"{table}: invalid coverage state")
        if state in REVIEWED:
            if not isinstance(evidence, str) or not evidence.strip():
                raise ValueError(f"{table}: reviewed coverage requires an evidence reference")
        elif reviewed:
            raise ValueError(f"{table}: {state} cannot supply rows")

        existing = {key: row for key, row in original[table].items() if key[0] == school_id}
        target = dict(existing)
        held = []
        if state == "complete_reviewed" or (state == "partial_reviewed" and not existing_school):
            if table == CHECKS:
                reviewed = preserve_resolutions(existing, reviewed)
            target = {key: merge_row(table, existing.get(key), row) for key, row in reviewed.items()}
            index(table, list(target.values()), school_id)
        elif state == "partial_reviewed":
            held = [
                {"key": list(key), "candidate": row}
                for key, row in sorted(reviewed.items())
                if key not in existing or dump(merge_row(table, existing[key], row)) != dump(existing[key])
            ]
        coverage[table] = {"state": state, "evidence": evidence, "held_candidates": held}

        changes[table] = {
            "added": [target[key] for key in sorted(target.keys() - existing.keys())],
            "modified": [
                {"before": existing[key], "after": target[key]}
                for key in sorted(existing.keys() & target.keys())
                if dump(existing[key]) != dump(target[key])
            ],
            "deleted": [existing[key] for key in sorted(existing.keys() - target.keys())],
        }
        proposed[table] = [row for key, row in original[table].items() if key[0] != school_id]
        proposed[table].extend(row for _, row in sorted(target.items()))

    if not any(row["school_id"] == school_id for row in proposed[SUMMARY]):
        for table in (PROGRAMS, SLOTS, CHECKS):
            if changes[SUMMARY]["deleted"] and coverage[table]["state"] != "complete_reviewed":
                raise ValueError(f"{table}: deleting the summary requires complete review of all child tables")
            if any(row["school_id"] == school_id for row in proposed[table]):
                raise ValueError(f"{table}: proposed target rows require a summary")
    return {
        "school_id": school_id,
        "coverage": coverage,
        "changes": changes,
        "counts": {table: {kind: len(rows) for kind, rows in diff.items()} for table, diff in changes.items()},
        "proposed_baseline": proposed,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--school-id", required=True)
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    args = parser.parse_args()
    try:
        output = dump(compare(args.school_id, read_json(args.baseline), read_json(args.candidate)))
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(2, f"dry-run rejected: {error}\n")
    sys.stdout.write(output + "\n")


if __name__ == "__main__":
    main()
