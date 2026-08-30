"""Audit operational ETL outputs against the planned database contract."""

from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
REPORT_JSON = OUTPUT_DIR / "backend_audit_report.json"
REPORT_MD = OUTPUT_DIR / "backend_audit_report.md"
SUPABASE_REPORT = OUTPUT_DIR / "supabase_backend_check.json"
SQL_PATH = BASE_DIR.parent / "sql" / "06_create_operational_master_tables.sql"
SERVING_REFRESH_SQL_PATH = BASE_DIR.parent / "sql" / "09_create_serving_refresh_function.sql"
UPLOADER_PATH = BASE_DIR / "upload_operational_masters.py"
REGIONS = {"서울특별시", "경기도", "인천광역시"}


def load(path: Path) -> list[dict[str, Any]]:
    if path.suffix == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def identity(row: dict[str, Any], keys: tuple[str, ...]) -> tuple[Any, ...]:
    return tuple(row.get(key) for key in keys)


def valid_date(value: Any) -> bool:
    if value in (None, ""):
        return True
    try:
        date.fromisoformat(str(value))
        return True
    except ValueError:
        return False


def add_check(checks: list[dict[str, Any]], name: str, failures: list[Any], sample_size: int = 10) -> None:
    checks.append(
        {
            "name": name,
            "status": "pass" if not failures else "fail",
            "failure_count": len(failures),
            "samples": failures[:sample_size],
        }
    )


def sql_columns(sql: str, table: str) -> set[str]:
    marker = f"CREATE TABLE IF NOT EXISTS {table} ("
    start = sql.index(marker) + len(marker)
    depth = 1
    end = start
    while depth and end < len(sql):
        if sql[end] == "(":
            depth += 1
        elif sql[end] == ")":
            depth -= 1
        end += 1
    columns = set()
    for line in sql[start : end - 1].splitlines():
        stripped = line.strip().rstrip(",")
        if not stripped or stripped.startswith(("CONSTRAINT ", "PRIMARY KEY", "UNIQUE ", "CHECK ", "FOREIGN KEY")):
            continue
        columns.add(stripped.split()[0].strip('"'))
    return columns


def main() -> None:
    datasets = {
        "school_master": load(OUTPUT_DIR / "school_master_operational_v1.json"),
        "apartment_complex_master": load(OUTPUT_DIR / "apartment_complex_master_v1.json"),
        "apartment_assignment_units": load(OUTPUT_DIR / "apartment_assignment_units_v1.json"),
        "apartment_assignment_schools": load(OUTPUT_DIR / "apartment_assignment_schools_v1.json"),
        "school_apartment_serving": load(OUTPUT_DIR / "school_apartment_serving_v1.json"),
        "apartment_name_history": load(OUTPUT_DIR / "apartment_name_history_operational_v1.csv"),
        "apartment_property_history": load(OUTPUT_DIR / "apartment_property_history_operational_v1.csv"),
    }
    keys = {
        "school_master": ("school_id",),
        "apartment_complex_master": ("canonical_complex_id",),
        "apartment_assignment_units": ("apt_cd",),
        "apartment_assignment_schools": ("apt_cd", "school_id"),
        "school_apartment_serving": ("school_id", "canonical_complex_id"),
        "apartment_name_history": ("apt_cd", "source", "observed_as_of", "name"),
        "apartment_property_history": ("apt_cd", "field_name", "latest_observed_as_of"),
    }
    checks: list[dict[str, Any]] = []

    for table, rows in datasets.items():
        ids = [identity(row, keys[table]) for row in rows]
        add_check(checks, f"{table}: non-null primary key", [key for key in ids if any(value in (None, "") for value in key)])
        duplicates = [key for key, count in Counter(ids).items() if count > 1]
        add_check(checks, f"{table}: unique primary key", duplicates)

    schools = {row["school_id"] for row in datasets["school_master"]}
    complexes = {row["canonical_complex_id"] for row in datasets["apartment_complex_master"]}
    units = {row["apt_cd"] for row in datasets["apartment_assignment_units"]}

    add_check(
        checks,
        "assignment units: complex foreign key",
        [row["apt_cd"] for row in datasets["apartment_assignment_units"] if row.get("canonical_complex_id") not in complexes],
    )
    add_check(
        checks,
        "assignment units: school foreign key",
        [row["apt_cd"] for row in datasets["apartment_assignment_units"] if row.get("school_id") and row["school_id"] not in schools],
    )
    add_check(
        checks,
        "assignment school links: foreign keys",
        [
            identity(row, ("apt_cd", "school_id"))
            for row in datasets["apartment_assignment_schools"]
            if row.get("apt_cd") not in units or row.get("school_id") not in schools
        ],
    )
    add_check(
        checks,
        "school apartment serving: foreign keys",
        [
            identity(row, keys["school_apartment_serving"])
            for row in datasets["school_apartment_serving"]
            if row.get("school_id") not in schools or row.get("canonical_complex_id") not in complexes
        ],
    )
    complex_rows = {
        row["canonical_complex_id"]: row for row in datasets["apartment_complex_master"]
    }
    apartment_contract_fields = (
        "households",
        "use_approval_year",
        "parking_total",
        "parking_ground",
        "parking_underground",
        "sale_households",
        "rental_units_total",
        "public_rental_units",
        "private_rental_units",
        "public_rental_ratio",
    )
    add_check(
        checks,
        "apartment complex master: public rental ratio arithmetic",
        [
            row["canonical_complex_id"]
            for row in datasets["apartment_complex_master"]
            if row.get("public_rental_units") is not None
            and row.get("households") not in (None, 0)
            and abs(
                float(row["public_rental_ratio"])
                - round(float(row["public_rental_units"]) / float(row["households"]) * 100, 3)
            ) > 0.001
        ],
    )
    add_check(
        checks,
        "apartment complex master: public rental ratio range",
        [
            row["canonical_complex_id"]
            for row in datasets["apartment_complex_master"]
            if row.get("public_rental_ratio") is not None
            and not 0 <= float(row["public_rental_ratio"]) <= 100
        ],
    )
    add_check(
        checks,
        "school apartment serving: apartment filter fields match complex master",
        [
            {
                "school_id": row["school_id"],
                "canonical_complex_id": row["canonical_complex_id"],
                "field": field,
            }
            for row in datasets["school_apartment_serving"]
            for field in apartment_contract_fields
            if row.get(field) != complex_rows[row["canonical_complex_id"]].get(field)
        ],
    )
    for history_table in ("apartment_name_history", "apartment_property_history"):
        add_check(
            checks,
            f"{history_table}: unit and complex foreign keys",
            [
                identity(row, keys[history_table])
                for row in datasets[history_table]
                if row.get("apt_cd") not in units or row.get("canonical_complex_id") not in complexes
            ],
        )

    for table in ("school_master", "apartment_complex_master", "apartment_assignment_units"):
        failures = []
        for row in datasets[table]:
            latitude = row.get("latitude")
            longitude = row.get("longitude")
            if latitude is None or longitude is None:
                failures.append(identity(row, keys[table]))
                continue
            if not (36.7 <= float(latitude) <= 38.7 and 124.0 <= float(longitude) <= 128.3):
                failures.append(identity(row, keys[table]))
        add_check(checks, f"{table}: capital-region coordinate bounds", failures)

    for table in ("school_master", "apartment_complex_master", "apartment_assignment_units"):
        add_check(
            checks,
            f"{table}: allowed region",
            [identity(row, keys[table]) for row in datasets[table] if row.get("region") not in REGIONS],
        )

    school_rows = datasets["school_master"]
    grade_fields = tuple(
        f"grade{grade}_{metric}"
        for grade in range(1, 7)
        for metric in ("students", "classes", "per_class")
    )
    add_check(
        checks,
        "school master: complete grade statistics",
        [row["school_id"] for row in school_rows if any(row.get(field) is None for field in grade_fields)],
    )
    add_check(
        checks,
        "school master: non-negative grade statistics",
        [
            {"school_id": row["school_id"], "field": field, "value": row.get(field)}
            for row in school_rows
            for field in grade_fields
            if row.get(field) is not None and float(row[field]) < 0
        ],
    )
    add_check(
        checks,
        "school master: grade per-class arithmetic",
        [
            {"school_id": row["school_id"], "grade": grade}
            for row in school_rows
            for grade in range(1, 7)
            if row.get(f"grade{grade}_classes")
            and abs(
                float(row[f"grade{grade}_per_class"])
                - round(float(row[f"grade{grade}_students"]) / float(row[f"grade{grade}_classes"]), 1)
            ) > 0.11
        ],
    )

    date_fields = {
        "school_master": ("reference_date",),
        "apartment_complex_master": ("source_as_of",),
        "apartment_assignment_units": ("hakgudo_reference_date",),
        "apartment_name_history": ("observed_as_of",),
        "apartment_property_history": ("base_as_of", "latest_observed_as_of"),
    }
    for table, fields in date_fields.items():
        add_check(
            checks,
            f"{table}: ISO dates",
            [
                {"key": identity(row, keys[table]), "field": field, "value": row.get(field)}
                for row in datasets[table]
                for field in fields
                if not valid_date(row.get(field))
            ],
        )

    link_units = {row["apt_cd"] for row in datasets["apartment_assignment_schools"]}
    named_without_link = [
        row["apt_cd"]
        for row in datasets["apartment_assignment_units"]
        if row.get("hakgudo_name") and row["apt_cd"] not in link_units
    ]
    review_units = [row for row in datasets["apartment_assignment_units"] if row.get("review_required") is True]
    review_source_ids = {
        row["apt_cd"] for row in load(OUTPUT_DIR / "assignment_review_queue.csv") if row.get("apt_cd") in units
    }
    add_check(checks, "named assignments without school link", named_without_link)
    add_check(
        checks,
        "review queue matches active operational units",
        [] if {row["apt_cd"] for row in review_units} == review_source_ids else [{"actual": len(review_units), "expected": len(review_source_ids)}],
    )

    sql = SQL_PATH.read_text(encoding="utf-8")
    expected_tables = (
        "school_master",
        "apartment_complex_master",
        "apartment_assignment_units",
        "apartment_assignment_schools",
        "school_apartment_serving",
        "apartment_name_history",
        "apartment_property_history",
        "etl_runs",
    )
    add_check(
        checks,
        "SQL contract: all operational tables",
        [table for table in expected_tables if f"CREATE TABLE IF NOT EXISTS {table}" not in sql],
    )
    add_check(
        checks,
        "SQL contract: RLS on every table",
        [table for table in expected_tables if f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY" not in sql],
    )
    add_check(
        checks,
        "SQL contract: history foreign keys",
        [
            token
            for token in (
                "apartment_name_history_apt_cd_fkey",
                "apartment_name_history_canonical_complex_id_fkey",
                "apartment_property_history_apt_cd_fkey",
                "apartment_property_history_canonical_complex_id_fkey",
            )
            if token not in sql
        ],
    )
    add_check(
        checks,
        "SQL contract: private tables have no public policy",
        [
            table
            for table in (
                "apartment_complex_master",
                "apartment_assignment_units",
                "apartment_assignment_schools",
                "apartment_name_history",
                "apartment_property_history",
                "etl_runs",
            )
            if f'CREATE POLICY "public read {table.replace("_", " ")}"' in sql
        ],
    )
    server_generated = {"location", "updated_at"}
    for table, rows in datasets.items():
        payload_columns = set(rows[0]) if rows else set()
        ddl_columns = sql_columns(sql, table)
        add_check(
            checks,
            f"SQL contract: {table} payload columns",
            [
                {"unexpected_payload_columns": sorted(payload_columns - ddl_columns)},
                {"missing_required_columns": sorted((ddl_columns - server_generated) - payload_columns)},
            ]
            if payload_columns - ddl_columns or (ddl_columns - server_generated) - payload_columns
            else [],
        )
    uploader = UPLOADER_PATH.read_text(encoding="utf-8")
    add_check(
        checks,
        "loader contract: audit, preflight, run log, and post-count",
        [token for token in ("AUDIT_REPORT", "table_count", "create_etl_run", "finish_etl_run", "remote row count") if token not in uploader],
    )
    serving_refresh_sql = SERVING_REFRESH_SQL_PATH.read_text(encoding="utf-8")
    add_check(
        checks,
        "serving refresh contract: atomic rebuild and private execution",
        [
            token
            for token in (
                "refresh_school_apartment_serving",
                "pg_advisory_xact_lock",
                "DELETE FROM school_apartment_serving",
                "INSERT INTO school_apartment_serving",
                "REVOKE ALL",
                "GRANT EXECUTE",
            )
            if token not in serving_refresh_sql
        ],
    )

    failed = [check for check in checks if check["status"] == "fail"]
    remote = json.loads(SUPABASE_REPORT.read_text(encoding="utf-8")) if SUPABASE_REPORT.exists() else {}
    remote_ready = bool(remote.get("operational_tables_ready"))
    remote_blocker = remote.get("connection_error")
    if remote and not remote_ready and not remote_blocker:
        remote_blocker = "operational migration not applied (7 tables unavailable)"
    report = {
        "generated_at": datetime.now().isoformat(),
        "status": "pass" if not failed else "fail",
        "remote_status": "ready" if remote_ready else "blocked",
        "remote_checked_at": remote.get("checked_at"),
        "remote_blocker": remote_blocker,
        "row_counts": {table: len(rows) for table, rows in datasets.items()},
        "total_rows": sum(len(rows) for rows in datasets.values()),
        "check_count": len(checks),
        "failed_check_count": len(failed),
        "review_required_units": len(review_units),
        "units_with_school_links": len(link_units),
        "checks": checks,
    }
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# Backend Operational Data Audit",
        "",
        f"- Generated: `{report['generated_at']}`",
        f"- Status: **{report['status'].upper()}**",
        f"- Remote status: **{report['remote_status'].upper()}**",
        f"- Rows: **{report['total_rows']:,}** across 6 load tables",
        f"- Checks: **{report['check_count']}**, failed: **{report['failed_check_count']}**",
        f"- Assignment review queue: **{report['review_required_units']:,}**",
        f"- Units with school links: **{report['units_with_school_links']:,}**",
        "",
        "## Remote Readiness",
        "",
        f"- Last checked: `{report['remote_checked_at'] or 'not checked'}`",
        f"- Operational tables ready: **{'YES' if report['remote_status'] == 'ready' else 'NO'}**",
        f"- Blocker: `{report['remote_blocker'] or 'none'}`",
        "",
        "## Checks",
        "",
    ]
    for check in checks:
        marker = "PASS" if check["status"] == "pass" else "FAIL"
        lines.append(f"- **{marker}** `{check['name']}`: {check['failure_count']:,} failures")
    if failed:
        lines.extend(["", "## Failure Samples", ""])
        for check in failed:
            lines.append(f"### {check['name']}")
            lines.append("```json")
            lines.append(json.dumps(check["samples"], ensure_ascii=False, indent=2))
            lines.append("```")
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("status", "total_rows", "check_count", "failed_check_count")}, indent=2))
    if failed:
        for check in failed:
            print(f"FAIL {check['name']}: {check['failure_count']:,}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
