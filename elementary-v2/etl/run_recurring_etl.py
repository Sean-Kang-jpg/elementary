"""Archive source snapshots, stage audited rows, and refresh operational data."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import upload_operational_masters as uploader


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DEFAULT_MANIFEST = BASE_DIR / "recurring_etl_manifest.json"
AUDIT_REPORT = BASE_DIR / "local_outputs_20260320" / "backend_audit_report.json"
SERVING_OUTPUT = BASE_DIR / "local_outputs_20260320" / "school_apartment_serving_v1.json"
STAGED_TABLES = tuple(item for item in uploader.TABLES if item[0] != "school_apartment_serving")
BUILD_COMMANDS = (
    (BASE_DIR / "build_apartment_master_v1.py",),
    (BASE_DIR / "build_school_master_v2.py",),
    (BASE_DIR / "build_operational_masters.py",),
    (BASE_DIR / "audit_operational_backend.py",),
)


def request_json(
    url: str,
    key: str,
    method: str,
    path: str,
    payload: Any | None = None,
    prefer: str | None = None,
    timeout: int = 60,
) -> Any:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(f"{url}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(f"{method} {path}: HTTP {exc.code}: {detail}") from exc


def load_manifest(path: Path) -> dict[str, Any]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    required = {"pipeline_name", "pipeline_version", "retention_days", "snapshots"}
    missing = sorted(required - manifest.keys())
    if missing:
        raise ValueError(f"manifest missing fields: {missing}")
    if not 1 <= int(manifest["retention_days"]) <= 365:
        raise ValueError("retention_days must be between 1 and 365")
    source_names: set[str] = set()
    for snapshot in manifest["snapshots"]:
        fields = {"source_name", "source_as_of", "path", "schema_version"}
        missing_snapshot = sorted(fields - snapshot.keys())
        if missing_snapshot:
            raise ValueError(f"snapshot missing fields: {missing_snapshot}")
        date.fromisoformat(snapshot["source_as_of"])
        if snapshot["source_name"] in source_names:
            raise ValueError(f"duplicate source_name: {snapshot['source_name']}")
        source_names.add(snapshot["source_name"])
        file_path = Path(snapshot["path"])
        if not file_path.is_absolute():
            file_path = PROJECT_DIR / file_path
        if not file_path.is_file():
            raise FileNotFoundError(file_path)
        snapshot["resolved_path"] = file_path
    return manifest


def build_outputs() -> None:
    for (script,) in BUILD_COMMANDS:
        print(f"running {script.name}")
        subprocess.run([sys.executable, str(script)], cwd=PROJECT_DIR, check=True)


def validate_outputs() -> list[tuple[str, tuple[str, ...], list[dict[str, Any]]]]:
    audit = json.loads(AUDIT_REPORT.read_text(encoding="utf-8"))
    if audit.get("status") != "pass":
        raise RuntimeError("backend audit must pass before recurring ETL")
    loaded = []
    for table, path, keys in STAGED_TABLES:
        rows = uploader.load_rows(path)
        uploader.validate_rows(table, rows, keys)
        loaded.append((table, keys, rows))
        print(f"validated {table}: {len(rows):,} rows")
    return loaded


def snapshot_bytes(path: Path) -> tuple[bytes, str | None, str]:
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if path.suffix.lower() in {".gz", ".zip", ".xlsx"}:
        return raw, None, digest
    return gzip.compress(raw, compresslevel=6), "gzip", digest


def upload_storage_object(url: str, key: str, bucket: str, object_path: str, body: bytes) -> None:
    quoted = urllib.parse.quote(object_path, safe="/")
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{bucket}/{quoted}",
        data=body,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/octet-stream",
            "x-upsert": "true",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=180):
            pass
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(f"storage upload {object_path}: HTTP {exc.code}: {detail}") from exc


def create_run(
    url: str,
    key: str,
    manifest: dict[str, Any],
    row_counts: dict[str, int],
    trigger_type: str,
    attempt_number: int,
) -> str:
    source_dates = {
        snapshot["source_name"]: snapshot["source_as_of"]
        for snapshot in manifest["snapshots"]
    }
    rows = request_json(
        url,
        key,
        "POST",
        "/rest/v1/etl_runs",
        {
            "pipeline_name": manifest["pipeline_name"],
            "pipeline_version": manifest["pipeline_version"],
            "status": "started",
            "source_as_of": source_dates,
            "row_counts": row_counts,
            "scope": manifest.get("scope", {}),
            "trigger_type": trigger_type,
            "attempt_number": attempt_number,
        },
        "return=representation",
    )
    return rows[0]["run_id"]


def archive_snapshots(url: str, key: str, run_id: str, manifest: dict[str, Any]) -> None:
    retain_until = date.today() + timedelta(days=int(manifest["retention_days"]))
    for snapshot in manifest["snapshots"]:
        path: Path = snapshot["resolved_path"]
        body, compression, digest = snapshot_bytes(path)
        suffix = f"{path.name}.gz" if compression == "gzip" else path.name
        object_path = f"{snapshot['source_name']}/{snapshot['source_as_of']}/{digest[:12]}-{suffix}"
        upload_storage_object(url, key, "etl-source-snapshots", object_path, body)
        payload = {
            "run_id": run_id,
            "source_name": snapshot["source_name"],
            "source_as_of": snapshot["source_as_of"],
            "object_path": object_path,
            "original_filename": path.name,
            "content_sha256": digest,
            "byte_size": len(body),
            "row_count": snapshot.get("row_count"),
            "schema_version": snapshot["schema_version"],
            "compression": compression,
            "status": "archived",
            "retain_until": retain_until.isoformat(),
            "metadata": {"original_byte_size": path.stat().st_size},
        }
        request_json(
            url,
            key,
            "POST",
            "/rest/v1/etl_source_snapshots?on_conflict=run_id,source_name",
            payload,
            "resolution=merge-duplicates,return=minimal",
        )
        print(f"archived {snapshot['source_name']}: {len(body):,} bytes")


def row_key(row: dict[str, Any], keys: tuple[str, ...]) -> str:
    return json.dumps([row[key] for key in keys], ensure_ascii=False, separators=(",", ":"))


def stage_rows(
    url: str,
    key: str,
    run_id: str,
    table: str,
    keys: tuple[str, ...],
    rows: list[dict[str, Any]],
    batch_size: int,
) -> None:
    for start in range(0, len(rows), batch_size):
        payload = []
        for row in rows[start : start + batch_size]:
            encoded = json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            payload.append(
                {
                    "run_id": run_id,
                    "target_table": table,
                    "row_key": row_key(row, keys),
                    "payload": row,
                    "payload_sha256": hashlib.sha256(encoded.encode("utf-8")).hexdigest(),
                }
            )
        request_json(
            url,
            key,
            "POST",
            "/rest/v1/etl_staging_rows?on_conflict=run_id,target_table,row_key",
            payload,
            "resolution=merge-duplicates,return=minimal",
            timeout=120,
        )
    print(f"staged {table}: {len(rows):,} rows")


def mark_snapshots(url: str, key: str, run_id: str, status: str) -> None:
    query = urllib.parse.quote(run_id)
    request_json(
        url,
        key,
        "PATCH",
        f"/rest/v1/etl_source_snapshots?run_id=eq.{query}",
        {"status": status},
        "return=minimal",
    )


def purge_staging(url: str, key: str, run_id: str) -> None:
    query = urllib.parse.quote(run_id)
    request_json(
        url,
        key,
        "DELETE",
        f"/rest/v1/etl_staging_rows?run_id=eq.{query}",
        prefer="return=minimal",
    )


def update_schedules(url: str, key: str, run_id: str, manifest: dict[str, Any]) -> None:
    completed_at = datetime.now().astimezone()
    for snapshot in manifest["snapshots"]:
        source_name = urllib.parse.quote(snapshot["source_name"], safe="")
        schedules = request_json(
            url,
            key,
            "GET",
            f"/rest/v1/etl_schedules?source_name=eq.{source_name}&select=cadence_unit,cadence_value",
        )
        if not schedules:
            continue
        cadence_unit = schedules[0]["cadence_unit"]
        cadence_value = int(schedules[0]["cadence_value"])
        cadence_days = {
            "daily": 1,
            "weekly": 7,
            "monthly": 30,
            "annual": 365,
        }.get(cadence_unit)
        next_due = completed_at + timedelta(days=cadence_days * cadence_value) if cadence_days else None
        request_json(
            url,
            key,
            "PATCH",
            f"/rest/v1/etl_schedules?source_name=eq.{source_name}",
            {
                "last_run_id": run_id,
                "last_success_at": completed_at.isoformat(),
                "next_due_at": next_due.isoformat() if next_due else None,
                "updated_at": completed_at.isoformat(),
            },
            "return=minimal",
        )


def record_checks(
    url: str,
    key: str,
    run_id: str,
    row_counts: dict[str, int],
    serving_rows: int,
    staging_rows: int,
) -> None:
    checks = [
        {
            "run_id": run_id,
            "check_name": f"row_count:{table}",
            "scope_name": "global",
            "status": "pass",
            "metric_value": count,
            "metric_unit": "rows",
        }
        for table, count in row_counts.items()
    ]
    checks.extend(
        [
            {
                "run_id": run_id,
                "check_name": "serving_row_count",
                "scope_name": "global",
                "status": "pass",
                "metric_value": serving_rows,
                "metric_unit": "rows",
            },
            {
                "run_id": run_id,
                "check_name": "staging_rows_after_cleanup",
                "scope_name": "global",
                "status": "pass" if staging_rows == 0 else "warn",
                "metric_value": staging_rows,
                "metric_unit": "rows",
            },
        ]
    )
    request_json(
        url,
        key,
        "POST",
        "/rest/v1/etl_run_checks?on_conflict=run_id,check_name,scope_name",
        checks,
        "resolution=merge-duplicates,return=minimal",
    )


def apply_run(
    manifest: dict[str, Any],
    loaded: list[tuple[str, tuple[str, ...], list[dict[str, Any]]]],
    batch_size: int,
    keep_staging: bool,
    trigger_type: str,
    attempt_number: int,
) -> None:
    url, key = uploader.credentials()
    row_counts = {table: len(rows) for table, _, rows in loaded}
    run_id = create_run(url, key, manifest, row_counts, trigger_type, attempt_number)
    print(f"created ETL run: {run_id}")
    try:
        archive_snapshots(url, key, run_id, manifest)
        for table, keys, rows in loaded:
            stage_rows(url, key, run_id, table, keys, rows, batch_size)
        for table, keys, rows in loaded:
            for start in range(0, len(rows), batch_size):
                uploader.upsert_batch(url, key, table, keys, rows[start : start + batch_size])
            remote_count = uploader.table_count(url, key, table)
            if remote_count != len(rows):
                raise RuntimeError(
                    f"{table}: remote {remote_count:,} != staged {len(rows):,}; reconcile stale rows"
                )
            print(f"upserted {table}: {remote_count:,} rows")
        expected_serving = len(uploader.load_rows(SERVING_OUTPUT))
        inserted = uploader.refresh_serving(url, key)
        remote_serving = uploader.table_count(url, key, "school_apartment_serving")
        if inserted != expected_serving or remote_serving != expected_serving:
            raise RuntimeError(
                f"serving rows {inserted:,}/{remote_serving:,} != expected {expected_serving:,}"
            )
        mark_snapshots(url, key, run_id, "validated")
        if not keep_staging:
            purge_staging(url, key, run_id)
        staging_rows = uploader.table_count(url, key, "etl_staging_rows")
        update_schedules(url, key, run_id, manifest)
        record_checks(url, key, run_id, row_counts, remote_serving, staging_rows)
        uploader.finish_etl_run(url, key, run_id, "completed")
        print(f"completed ETL run; serving rows: {remote_serving:,}")
    except Exception as exc:
        mark_snapshots(url, key, run_id, "rejected")
        uploader.finish_etl_run(url, key, run_id, "failed", str(exc))
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--build", action="store_true", help="Rebuild outputs before validation")
    parser.add_argument("--apply", action="store_true", help="Archive, stage, and update Supabase")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--keep-staging", action="store_true", help="Retain staged rows for debugging")
    parser.add_argument("--trigger-type", choices=("manual", "scheduled", "retry"), default="manual")
    parser.add_argument("--attempt-number", type=int, default=1)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 1000:
        raise ValueError("batch-size must be between 1 and 1000")
    if args.attempt_number < 1:
        raise ValueError("attempt-number must be at least 1")
    manifest_path = args.manifest if args.manifest.is_absolute() else PROJECT_DIR / args.manifest
    manifest = load_manifest(manifest_path)
    if args.build:
        build_outputs()
    loaded = validate_outputs()
    for snapshot in manifest["snapshots"]:
        body, compression, digest = snapshot_bytes(snapshot["resolved_path"])
        print(
            f"snapshot {snapshot['source_name']}: sha256={digest[:12]} "
            f"stored={len(body):,} compression={compression or 'source'}"
        )
    if not args.apply:
        print("dry-run complete; apply SQL 11, then pass --apply")
        return
    apply_run(
        manifest,
        loaded,
        args.batch_size,
        args.keep_staging,
        args.trigger_type,
        args.attempt_number,
    )


if __name__ == "__main__":
    main()
