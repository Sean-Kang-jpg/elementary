"""Validate or upsert operational ETL masters through Supabase REST."""

from __future__ import annotations

import argparse
import csv
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/upload_operational_masters.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl.fetch_schoolinfo_2026 import build_scopes, scope_slug
from etl.region_registry import load_registry


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
TABLES = (
    ("school_master", OUTPUT_DIR / "school_master_operational_v1.json", ("school_id",)),
    ("apartment_complex_master", OUTPUT_DIR / "apartment_complex_master_v1.json", ("canonical_complex_id",)),
    ("apartment_assignment_units", OUTPUT_DIR / "apartment_assignment_units_v1.json", ("apt_cd",)),
    ("apartment_assignment_schools", OUTPUT_DIR / "apartment_assignment_schools_v1.json", ("apt_cd", "school_id")),
    ("school_apartment_serving", OUTPUT_DIR / "school_apartment_serving_v1.json", ("school_id", "canonical_complex_id")),
    ("apartment_name_history", OUTPUT_DIR / "apartment_name_history_operational_v1.csv", ("apt_cd", "source", "observed_as_of", "name")),
    ("apartment_property_history", OUTPUT_DIR / "apartment_property_history_operational_v1.csv", ("apt_cd", "field_name", "latest_observed_as_of")),
)
AUDIT_REPORT = OUTPUT_DIR / "backend_audit_report.json"


def load_env(path: Path) -> None:
    # A remote runner has no .env; its variables come from the environment.
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value)


def credentials() -> tuple[str, str]:
    load_env(PROJECT_DIR / ".env")
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return url.rstrip("/"), key


def load_rows(path: Path) -> list[dict[str, Any]]:
    if path.suffix == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return [
            {key: value if value != "" else None for key, value in row.items()}
            for row in csv.DictReader(handle)
        ]


def validate_rows(table: str, rows: list[dict[str, Any]], keys: tuple[str, ...]) -> None:
    if not rows:
        raise ValueError(f"{table}: no rows")
    missing = [key for key in keys if key not in rows[0]]
    if missing:
        raise ValueError(f"{table}: missing key columns {missing}")
    identities = [tuple(row.get(key) for key in keys) for row in rows]
    if any(any(value in (None, "") for value in identity) for identity in identities):
        raise ValueError(f"{table}: null conflict key")
    if len(identities) != len(set(identities)):
        raise ValueError(f"{table}: duplicate conflict key")


def upsert_batch(url: str, key: str, table: str, keys: tuple[str, ...], rows: list[dict[str, Any]]) -> None:
    query = urllib.parse.urlencode({"on_conflict": ",".join(keys)})
    request = urllib.request.Request(
        f"{url}/rest/v1/{table}?{query}",
        data=json.dumps(rows, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status not in {200, 201, 204}:
                raise RuntimeError(f"{table}: HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"{table}: HTTP {exc.code}: {detail}") from exc


def table_count(url: str, key: str, table: str, filters: str = "") -> int:
    """Exact row count, optionally narrowed by a PostgREST filter fragment."""
    query = f"select=*&limit=1&{filters}" if filters else "select=*&limit=1"
    request = urllib.request.Request(
        f"{url}/rest/v1/{table}?{query}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "count=exact",
            "Range": "0-0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content_range = response.headers.get("Content-Range", "")
            count_text = content_range.rsplit("/", 1)[-1] if "/" in content_range else ""
            if not count_text.isdigit():
                raise RuntimeError(f"{table}: count unavailable ({content_range})")
            return int(count_text)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"{table}: preflight HTTP {exc.code}: {detail}") from exc


def refresh_serving(url: str, key: str) -> int:
    request = urllib.request.Request(
        f"{url}/rest/v1/rpc/refresh_school_apartment_serving",
        data=b"{}",
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return int(json.loads(response.read()))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"serving refresh: HTTP {exc.code}: {detail}") from exc


def create_etl_run(url: str, key: str, row_counts: dict[str, int]) -> str:
    payload = {
        "pipeline_name": "elementary-operational-master",
        "pipeline_version": "operational-v1",
        "status": "started",
        "source_as_of": {"hakgudo": "2026-03-20", "kapt": "2026-08-21"},
        "row_counts": row_counts,
    }
    request = urllib.request.Request(
        f"{url}/rest/v1/etl_runs",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())[0]["run_id"]


def finish_etl_run(url: str, key: str, run_id: str, status: str, error: str | None = None) -> None:
    payload = {
        "status": status,
        "completed_at": datetime.now().astimezone().isoformat(),
        "error_summary": {"message": error[:2000]} if error else None,
    }
    request = urllib.request.Request(
        f"{url}/rest/v1/etl_runs?run_id=eq.{urllib.parse.quote(run_id)}",
        data=json.dumps(payload).encode("utf-8"),
        method="PATCH",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(request, timeout=30):
        pass


REGION_COLUMN_TABLES = {
    "school_master",
    "apartment_complex_master",
    "apartment_assignment_units",
    "school_apartment_serving",
}


def scoped_tables(suffix: str) -> tuple[tuple[str, Path, tuple[str, ...]], ...]:
    """The same table list, reading a wave's own output files."""
    if not suffix:
        return TABLES
    scoped = []
    for table, path, keys in TABLES:
        scoped.append((table, path.with_name(f"{path.stem}{suffix}{path.suffix}"), keys))
    return tuple(scoped)


def region_count(url: str, key: str, table: str, region: str) -> int:
    return table_count(url, key, table, f"region=eq.{urllib.parse.quote(region)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Perform remote upserts; default is validation only")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument(
        "--table",
        action="append",
        choices=[table for table, _, _ in TABLES],
        help="Limit validation/upload to one or more tables; may be repeated",
    )
    parser.add_argument(
        "--regions", nargs="*", default=(),
        help="registry region names; default is the current production scope",
    )
    parser.add_argument(
        "--cities", nargs="*", default=(),
        help="restrict a single region to these cities",
    )
    parser.add_argument(
        "--refresh-serving",
        action="store_true",
        help="Rebuild school_apartment_serving in Supabase after loading normalized masters",
    )
    args = parser.parse_args()
    if args.batch_size < 1 or args.batch_size > 1000:
        raise ValueError("--batch-size must be between 1 and 1000")
    if args.refresh_serving and (args.regions or args.cities):
        # refresh_school_apartment_serving() rebuilds the whole table from the
        # masters in the database, so its expected count is every region's, not
        # this scope's. A wave uploads its own serving rows instead.
        raise ValueError("--refresh-serving rebuilds every region; do not combine it with --regions")

    scopes = build_scopes(load_registry(), args.regions, args.cities)
    slug = scope_slug(list(scopes))
    suffix = "" if slug == "capital" else f"_{slug}"
    scope_regions = sorted({scope.region.canonical_name for scope in scopes})
    print(f"scope: {', '.join(scope.label for scope in scopes)} (slug {slug})")

    audit_path = AUDIT_REPORT if not suffix else AUDIT_REPORT.with_name(f"{AUDIT_REPORT.stem}{suffix}{AUDIT_REPORT.suffix}")
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    if audit.get("status") != "pass":
        raise RuntimeError(f"backend audit must pass before upload: {audit_path.name}")

    tables = scoped_tables(suffix)
    selected_tables = set(args.table or (table for table, _, _ in tables))
    loaded = []
    for table, path, keys in tables:
        if table not in selected_tables:
            continue
        rows = load_rows(path)
        validate_rows(table, rows, keys)
        loaded.append((table, keys, rows))
        print(f"validated {table}: {len(rows):,} rows")

    if not args.apply:
        print("dry-run complete; pass --apply after applying the required SQL migrations")
        return

    url, key = credentials()
    # Pre-upload counts are the rollback evidence the release gate asks for.
    snapshot = {"scope": scope_regions, "tables": {}}
    for table, _, _ in loaded:
        existing = table_count(url, key, table)
        entry = {"total": existing}
        if table in REGION_COLUMN_TABLES:
            entry["by_region"] = {region: region_count(url, key, table, region) for region in scope_regions}
        snapshot["tables"][table] = entry
        print(f"preflight {table}: {existing:,} rows" + (
            f", scope {sum(entry['by_region'].values()):,}" if "by_region" in entry else ""))
    snapshot_path = OUTPUT_DIR / f"upload_preflight_snapshot{suffix or '_capital'}.json"
    snapshot_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8")
    print(f"wrote {snapshot_path.name}")
    table_count(url, key, "etl_runs")

    expected_counts = {table: len(rows) for table, _, rows in loaded}
    run_id = create_etl_run(url, key, expected_counts)
    try:
        for table, keys, rows in loaded:
            for start in range(0, len(rows), args.batch_size):
                upsert_batch(url, key, table, keys, rows[start : start + args.batch_size])
            if table in REGION_COLUMN_TABLES:
                # A wave adds regions beside the existing ones, so verify the
                # scope rather than the whole table.
                remote_scope = sum(region_count(url, key, table, region) for region in scope_regions)
                if remote_scope != len(rows):
                    raise RuntimeError(
                        f"{table}: remote rows for {scope_regions} {remote_scope:,} != local snapshot "
                        f"{len(rows):,}; stale rows require explicit reconciliation"
                    )
                print(f"upserted and verified {table}: {len(rows):,} rows in scope")
            else:
                before = snapshot["tables"][table]["total"]
                remote_count = table_count(url, key, table)
                expected_total = before + len(rows) if suffix else len(rows)
                if remote_count != expected_total:
                    raise RuntimeError(
                        f"{table}: remote row count {remote_count:,} != expected {expected_total:,}"
                    )
                print(f"upserted and verified {table}: {len(rows):,} rows")
        if args.refresh_serving:
            inserted = refresh_serving(url, key)
            expected = len(load_rows(OUTPUT_DIR / "school_apartment_serving_v1.json"))
            remote_count = table_count(url, key, "school_apartment_serving")
            if inserted != expected or remote_count != expected:
                raise RuntimeError(
                    "school_apartment_serving: refreshed/remote row counts "
                    f"{inserted:,}/{remote_count:,} != expected {expected:,}"
                )
            print(f"refreshed and verified school_apartment_serving: {remote_count:,} rows")
        finish_etl_run(url, key, run_id, "completed")
    except Exception as exc:
        finish_etl_run(url, key, run_id, "failed", str(exc))
        raise


if __name__ == "__main__":
    main()
