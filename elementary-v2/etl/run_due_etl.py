"""Collect and run only recurring ETL source groups that are due."""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import run_recurring_etl as recurring
import upload_operational_masters as uploader


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
RUNTIME_DIR = BASE_DIR / "runtime"
LOCK_PATH = RUNTIME_DIR / "scheduled_etl.lock"
BASE_MANIFEST = BASE_DIR / "recurring_etl_manifest.json"
SOURCE_GROUPS = {
    "apartment": {"kapt-basic"},
    "school": {"schoolinfo-basic", "schoolinfo-grade-students"},
}


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def due_groups(url: str, key: str, forced: set[str]) -> list[str]:
    if forced:
        return sorted(SOURCE_GROUPS if "all" in forced else forced)
    schedules = recurring.request_json(
        url,
        key,
        "GET",
        "/rest/v1/etl_schedules?enabled=eq.true&select=source_name,next_due_at",
    )
    now = datetime.now(timezone.utc)
    due_sources = {
        row["source_name"]
        for row in schedules
        if parse_timestamp(row.get("next_due_at")) is None
        or parse_timestamp(row.get("next_due_at")) <= now
    }
    return [name for name, sources in SOURCE_GROUPS.items() if sources & due_sources]


def run_script(*parts: str) -> None:
    command = [sys.executable, *parts]
    print("running " + " ".join(command))
    subprocess.run(command, cwd=PROJECT_DIR, check=True)


def latest_dated_file(pattern: str, date_pattern: str) -> tuple[str, Path]:
    candidates: list[tuple[str, Path]] = []
    for path in OUTPUT_DIR.glob(pattern):
        stem = path.stem
        if not stem.startswith(date_pattern):
            continue
        value = stem.removeprefix(date_pattern)
        if len(value) == 8 and value.isdigit():
            candidates.append((value, path))
    if not candidates:
        raise FileNotFoundError(f"no source snapshot matches {pattern}")
    return max(candidates)


def csv_row_count(path: Path) -> int:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return max(sum(1 for _ in csv.reader(handle)) - 1, 0)


def json_row_count(path: Path) -> int:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise TypeError(f"{path.name} must contain a JSON array")
    return len(rows)


def collect_apartment() -> list[dict[str, Any]]:
    run_script(str(BASE_DIR / "fetch_kapt_board_snapshot.py"))
    snapshot_date, xlsx_path = latest_dated_file("kapt_basic_*.xlsx", "kapt_basic_")
    csv_path = xlsx_path.with_suffix(".csv")
    run_script(
        str(BASE_DIR / "convert_kapt_xlsx_to_csv.py"),
        str(xlsx_path),
        "--output",
        str(csv_path),
    )
    return [
        {
            "source_name": "kapt-basic",
            "source_as_of": datetime.strptime(snapshot_date, "%Y%m%d").date().isoformat(),
            "path": csv_path.relative_to(PROJECT_DIR).as_posix(),
            "row_count": csv_row_count(csv_path),
            "schema_version": "kapt-board-v1",
        }
    ]


def collect_school() -> list[dict[str, Any]]:
    year = date.today().year
    run_script(str(BASE_DIR / "fetch_schoolinfo_2026.py"), "--year", str(year))
    basic_path = OUTPUT_DIR / f"schoolinfo_{year}_basic_capital.json"
    grade_path = OUTPUT_DIR / f"schoolinfo_{year}_grade_students_capital.json"
    return [
        {
            "source_name": "schoolinfo-basic",
            "source_as_of": date.today().isoformat(),
            "path": basic_path.relative_to(PROJECT_DIR).as_posix(),
            "row_count": json_row_count(basic_path),
            "schema_version": f"schoolinfo-{year}-v1",
        },
        {
            "source_name": "schoolinfo-grade-students",
            "source_as_of": date.today().isoformat(),
            "path": grade_path.relative_to(PROJECT_DIR).as_posix(),
            "row_count": json_row_count(grade_path),
            "schema_version": f"schoolinfo-{year}-v1",
        },
    ]


def build_manifest(group: str) -> Path:
    base = json.loads(BASE_MANIFEST.read_text(encoding="utf-8"))
    collectors = {"apartment": collect_apartment, "school": collect_school}
    snapshots = collectors[group]()
    manifest = {
        "pipeline_name": base["pipeline_name"],
        "pipeline_version": base["pipeline_version"],
        "retention_days": base["retention_days"],
        "scope": {
            "regions": base.get("scope", {}).get("regions", []),
            "domains": [group],
        },
        "snapshots": snapshots,
    }
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    path = RUNTIME_DIR / f"recurring_{group}_{date.today().isoformat()}.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def notify_failure(group: str, attempt: int, error: Exception) -> None:
    webhook = os.getenv("ETL_ALERT_WEBHOOK_URL")
    if not webhook:
        return
    message = {
        "event": "etl_failure",
        "pipeline": "elementary-recurring-etl",
        "source_group": group,
        "attempt": attempt,
        "failed_at": datetime.now(timezone.utc).isoformat(),
        "error": str(error)[:1000],
        "text": f"[elementary ETL] {group} failed on attempt {attempt}: {error}",
    }
    request = urllib.request.Request(
        webhook,
        data=json.dumps(message, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15):
            pass
    except Exception as alert_error:
        print(f"failure notification could not be sent: {alert_error}", file=sys.stderr)


def delete_storage_objects(url: str, key: str, bucket: str, paths: list[str]) -> None:
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{bucket}",
        data=json.dumps({"prefixes": paths}).encode("utf-8"),
        method="DELETE",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=60):
        pass


def run_maintenance(url: str, key: str) -> None:
    cleanup_result = recurring.request_json(
        url,
        key,
        "POST",
        "/rest/v1/rpc/cleanup_recurring_etl",
        {},
    )
    expired = recurring.request_json(
        url,
        key,
        "GET",
        "/rest/v1/etl_source_snapshots?status=eq.expired&select=snapshot_id,bucket_id,object_path,metadata&limit=500",
    )
    pending = [row for row in expired if not row.get("metadata", {}).get("storage_deleted_at")]
    by_bucket: dict[str, list[dict[str, Any]]] = {}
    for row in pending:
        by_bucket.setdefault(row["bucket_id"], []).append(row)
    deleted_at = datetime.now(timezone.utc).isoformat()
    for bucket, rows in by_bucket.items():
        for start in range(0, len(rows), 100):
            batch = rows[start : start + 100]
            delete_storage_objects(url, key, bucket, [row["object_path"] for row in batch])
            for row in batch:
                metadata = dict(row.get("metadata") or {})
                metadata["storage_deleted_at"] = deleted_at
                recurring.request_json(
                    url,
                    key,
                    "PATCH",
                    f"/rest/v1/etl_source_snapshots?snapshot_id=eq.{row['snapshot_id']}",
                    {"metadata": metadata},
                    "return=minimal",
                )
    print(
        f"maintenance complete: cleanup={cleanup_result or []} "
        f"storage_objects_deleted={len(pending)}"
    )


def execute_group(group: str, apply: bool, max_attempts: int, retry_delay: int) -> None:
    for attempt in range(1, max_attempts + 1):
        trigger = "scheduled" if attempt == 1 else "retry"
        try:
            manifest_path = build_manifest(group)
            command = [
                str(BASE_DIR / "run_recurring_etl.py"),
                "--manifest",
                str(manifest_path),
                "--build",
                "--trigger-type",
                trigger,
                "--attempt-number",
                str(attempt),
            ]
            if apply:
                command.append("--apply")
            run_script(*command)
            return
        except Exception as error:
            notify_failure(group, attempt, error)
            if attempt == max_attempts:
                raise
            print(f"retrying {group} in {retry_delay} seconds", file=sys.stderr)
            time.sleep(retry_delay)


class RunLock:
    def __enter__(self) -> "RunLock":
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        if LOCK_PATH.exists():
            age = time.time() - LOCK_PATH.stat().st_mtime
            if age < 24 * 60 * 60:
                raise RuntimeError(f"another scheduled ETL holds {LOCK_PATH}")
            LOCK_PATH.unlink()
        descriptor = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(descriptor, "w", encoding="ascii") as handle:
            handle.write(str(os.getpid()))
        return self

    def __exit__(self, *_: object) -> None:
        LOCK_PATH.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write validated data to Supabase")
    parser.add_argument("--force", action="append", choices=("apartment", "school", "all"), default=[])
    parser.add_argument("--max-attempts", type=int, default=3)
    parser.add_argument("--retry-delay-seconds", type=int, default=300)
    args = parser.parse_args()
    if not 1 <= args.max_attempts <= 5:
        raise ValueError("max-attempts must be between 1 and 5")
    if not 0 <= args.retry_delay_seconds <= 3600:
        raise ValueError("retry-delay-seconds must be between 0 and 3600")

    url, key = uploader.credentials()
    groups = due_groups(url, key, set(args.force))
    if not groups:
        print("no ETL source groups are due")
        if args.apply:
            with RunLock():
                run_maintenance(url, key)
        return
    print("due source groups: " + ", ".join(groups))
    if not args.apply:
        print("read-only due check complete; pass --apply to collect and update")
        return
    with RunLock():
        for group in groups:
            execute_group(group, True, args.max_attempts, args.retry_delay_seconds)
        run_maintenance(url, key)


if __name__ == "__main__":
    main()
