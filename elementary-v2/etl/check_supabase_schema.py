"""Inspect operational Supabase tables and anonymous read policies."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = Path(__file__).resolve().parent / "local_outputs_20260320"
PUBLIC_TABLES = (
    "school_master",
    "school_apartment_serving",
)
PRIVATE_TABLES = (
    "apartment_complex_master",
    "apartment_assignment_units",
    "apartment_assignment_schools",
    "apartment_name_history",
    "apartment_property_history",
    "etl_runs",
)
RECURRING_ETL_TABLES = (
    "etl_source_snapshots",
    "etl_staging_rows",
)
MONITORING_TABLES = (
    "etl_admin_users",
    "etl_schedules",
    "etl_run_checks",
)
REQUIRED_SCHOOL_STAT_COLUMNS = {
    *(f"grade{grade}_{metric}" for grade in range(1, 7) for metric in ("students", "classes", "per_class")),
    "student_statistics_year",
}


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value)


def request_table(url: str, key: str, table: str) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{url}/rest/v1/{table}?select=*&limit=1",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "count=exact",
            "Range": "0-0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            rows = json.loads(response.read() or b"[]")
            content_range = response.headers.get("Content-Range", "")
            count_text = content_range.rsplit("/", 1)[-1] if "/" in content_range else "0"
            return {
                "available": True,
                "status": response.status,
                "row_count": int(count_text) if count_text.isdigit() else None,
                "columns": sorted(rows[0]) if rows else [],
            }
    except urllib.error.HTTPError as exc:
        return {
            "available": False,
            "status": exc.code,
            "error": exc.read().decode("utf-8", errors="replace")[:500],
        }
    except urllib.error.URLError as exc:
        return {"available": False, "status": None, "error": str(exc)}


def request_rpc_names(url: str, key: str) -> list[str]:
    request = urllib.request.Request(
        f"{url}/rest/v1/",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/openapi+json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            document = json.loads(response.read())
            return sorted(path.removeprefix("/rpc/") for path in document.get("paths", {}) if path.startswith("/rpc/"))
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError):
        return []


def request_frontend_smoke(url: str, key: str) -> dict[str, Any]:
    school_path = "/rest/v1/school_master?select=school_id,school_name,grade1_students,grade1_classes&limit=20"
    started = time.perf_counter()
    with urllib.request.urlopen(
        urllib.request.Request(
            f"{url}{school_path}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        ),
        timeout=30,
    ) as response:
        schools = json.loads(response.read())
    school_ms = round((time.perf_counter() - started) * 1000, 1)
    if not schools:
        return {"ready": False, "error": "school query returned no rows"}

    school_id = urllib.parse.quote(str(schools[0]["school_id"]), safe="")
    apartment_path = (
        "/rest/v1/school_apartment_serving"
        "?select=canonical_complex_id,complex_name,households,parking_per_household,use_approval_year,public_rental_ratio"
        f"&school_id=eq.{school_id}&limit=100"
    )
    started = time.perf_counter()
    with urllib.request.urlopen(
        urllib.request.Request(
            f"{url}{apartment_path}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        ),
        timeout=30,
    ) as response:
        apartments = json.loads(response.read())
    apartment_ms = round((time.perf_counter() - started) * 1000, 1)
    return {
        "ready": True,
        "school_rows": len(schools),
        "apartment_rows": len(apartments),
        "school_query_ms": school_ms,
        "apartment_query_ms": apartment_ms,
    }


def main() -> None:
    load_env(PROJECT_DIR / ".env")
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_KEY") or ""
    anon_key = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
    if not url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")

    checked_tables = (*PUBLIC_TABLES, *PRIVATE_TABLES, *RECURRING_ETL_TABLES, *MONITORING_TABLES)
    service = {table: request_table(url, service_key, table) for table in checked_tables}
    anonymous = {table: request_table(url, anon_key, table) for table in checked_tables} if anon_key else {}
    operational_tables_ready = all(
        service[table]["available"] for table in (*PUBLIC_TABLES, *PRIVATE_TABLES)
    )
    school_statistics_ready = REQUIRED_SCHOOL_STAT_COLUMNS.issubset(
        set(service.get("school_master", {}).get("columns", []))
    )
    serving_table_populated = (service.get("school_apartment_serving", {}).get("row_count") or 0) > 0
    private_tables_protected = operational_tables_ready and bool(anonymous) and all(
        (
            anonymous[table]["available"]
            and anonymous[table].get("row_count") == 0
            and (service[table].get("row_count") or 0) > 0
        )
        or anonymous[table].get("status") in {401, 403}
        for table in PRIVATE_TABLES
    )
    rpc_functions = request_rpc_names(url, service_key)
    recurring_tables_ready = all(service[table]["available"] for table in RECURRING_ETL_TABLES)
    recurring_tables_protected = recurring_tables_ready and bool(anonymous) and all(
        (
            anonymous[table]["available"]
            and anonymous[table].get("row_count") == 0
        )
        or anonymous[table].get("status") in {401, 403}
        for table in RECURRING_ETL_TABLES
    )
    monitoring_tables_ready = all(service[table]["available"] for table in MONITORING_TABLES)
    monitoring_tables_protected = monitoring_tables_ready and bool(anonymous) and all(
        (
            anonymous[table]["available"]
            and anonymous[table].get("row_count") == 0
        )
        or anonymous[table].get("status") in {401, 403}
        for table in MONITORING_TABLES
    )
    try:
        frontend_query_smoke = request_frontend_smoke(url, anon_key) if anon_key else {"ready": False}
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as exc:
        frontend_query_smoke = {"ready": False, "error": str(exc)}
    report = {
        "checked_at": datetime.now().isoformat(),
        "service_role": service,
        "anonymous": anonymous,
        "service_rpc_functions": rpc_functions,
        "operational_tables_ready": operational_tables_ready,
        "school_statistics_ready": school_statistics_ready,
        "serving_table_populated": serving_table_populated,
        "public_read_ready": bool(anonymous) and all(anonymous[table]["available"] for table in PUBLIC_TABLES),
        "private_tables_protected": private_tables_protected,
        "frontend_transition_ready": operational_tables_ready and school_statistics_ready and serving_table_populated and bool(anonymous)
        and all(anonymous[table]["available"] for table in PUBLIC_TABLES),
        "recurring_etl_ready": recurring_tables_protected
        and {"refresh_school_apartment_serving", "cleanup_recurring_etl"}.issubset(rpc_functions),
        "monitoring_contract_ready": monitoring_tables_protected
        and "is_etl_admin" in rpc_functions
        and (service["etl_admin_users"].get("row_count") or 0) > 0
        and (service["etl_schedules"].get("row_count") or 0) > 0,
        "frontend_query_smoke": frontend_query_smoke,
        "connection_error": next(
            (result.get("error") for result in service.values() if result.get("status") is None and result.get("error")),
            None,
        ),
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / "supabase_backend_check.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
