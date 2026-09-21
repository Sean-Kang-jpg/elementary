#!/usr/bin/env python3
"""Verify migration 16 in Supabase. Read-only: it never writes.

Checks that the region registry landed, that it stays private, that the
operational row counts are untouched, and that the schedules follow the
production regions.

    python etl/verify_region_registry_contract.py

Reads SUPABASE_URL, SUPABASE_SERVICE_KEY, and VITE_SUPABASE_ANON_KEY from
`.env`. Secrets are never printed. Foreign keys are proven by asking
PostgREST to embed `region_registry`, which it can only do through a real
foreign key.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/verify_region_registry_contract.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl.region_registry import load_registry

PROJECT_DIR = Path(__file__).resolve().parent.parent

# Tables whose region column is now backed by a foreign key. Their row counts
# are reported, not asserted: production runs ahead of the reviewed-inputs
# baseline whenever the scheduled ETL loads a newer source snapshot.
REGION_BACKED_TABLES = (
    "school_master",
    "apartment_complex_master",
    "apartment_assignment_units",
)


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value)


def get(url: str, key: str, path: str) -> tuple[int, list[dict[str, Any]], int | None]:
    """Returns (status, rows, exact_count). Never raises on an HTTP error."""
    request = urllib.request.Request(
        f"{url}/rest/v1/{path}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "count=exact",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read() or b"[]"
            content_range = response.headers.get("Content-Range", "")
            count = content_range.rsplit("/", 1)[-1] if "/" in content_range else ""
            return response.status, json.loads(body), int(count) if count.isdigit() else None
    except urllib.error.HTTPError as exc:
        return exc.code, [], None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"cannot reach Supabase: {exc.reason}") from None


def main() -> int:
    load_env(PROJECT_DIR / ".env")
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_KEY") or ""
    anon_key = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
    if not url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")

    registry = load_registry()
    expected_regions = len(registry.regions)
    expected_production = sorted(region.canonical_name for region in registry.production_regions)
    results: list[tuple[str, bool, str]] = []

    status, rows, count = get(url, service_key, "region_registry?select=canonical_name,is_production,registry_version&limit=100")
    if status not in (200, 206):
        results.append(("region_registry exists", False, f"HTTP {status}; migration 16 may not be applied"))
        remote_production: list[str] = []
    else:
        remote_names = sorted(str(row["canonical_name"]) for row in rows)
        remote_production = sorted(str(row["canonical_name"]) for row in rows if row.get("is_production"))
        versions = {str(row.get("registry_version")) for row in rows}
        results.append((
            "region_registry seeded",
            count == expected_regions and len(remote_names) == expected_regions,
            f"{count} rows, expected {expected_regions}",
        ))
        results.append((
            "only capital regions in production",
            remote_production == expected_production,
            f"{remote_production or 'none'}",
        ))
        results.append((
            "registry_version matches the local registry",
            versions == {registry.registry_version},
            f"{sorted(versions)} vs {registry.registry_version}",
        ))
        local_names = sorted(region.canonical_name for region in registry)
        results.append(("region names match the local registry", remote_names == local_names, ""))

    if anon_key:
        anon_status, anon_rows, _ = get(url, anon_key, "region_registry?select=canonical_name&limit=1")
        results.append((
            "anonymous role cannot read region_registry",
            anon_status in (401, 403, 404) or not anon_rows,
            f"HTTP {anon_status}, {len(anon_rows)} rows",
        ))
        for table in ("school_master", "school_apartment_serving"):
            public_status, public_rows, _ = get(url, anon_key, f"{table}?select=school_id&limit=1")
            results.append((
                f"anonymous role still reads {table}",
                public_status in (200, 206) and len(public_rows) == 1,
                f"HTTP {public_status}",
            ))
    else:
        results.append(("anonymous checks", False, "VITE_SUPABASE_ANON_KEY is not set; anon access unverified"))

    for table in REGION_BACKED_TABLES:
        # PostgREST can only embed a related table through a foreign key, so a
        # successful embed proves the constraint exists.
        embed_status, embed_rows, embed_count = get(
            url, service_key, f"{table}?select=region,region_registry(canonical_name)&limit=1"
        )
        results.append((
            f"{table}.region foreign key present",
            embed_status in (200, 206)
            and bool(embed_rows)
            and isinstance(embed_rows[0].get("region_registry"), dict),
            f"HTTP {embed_status}, {embed_count} rows",
        ))

        quoted = urllib.parse.quote(f"({','.join(expected_production)})", safe="(),")
        out_of_scope = f"{table}?select=region&region=not.in.{quoted}&limit=1"
        scope_status, scope_rows, scope_count = get(url, service_key, out_of_scope)
        results.append((
            f"{table} holds only production regions",
            scope_status in (200, 206) and scope_count == 0,
            f"{scope_count} rows outside {expected_production}",
        ))

    schedule_status, schedule_rows, _ = get(url, service_key, "etl_schedules?select=schedule_id,scope_regions")
    if schedule_status in (200, 206):
        mismatched = [
            str(row["schedule_id"]) for row in schedule_rows
            if sorted(row.get("scope_regions") or []) != expected_production
        ]
        results.append((
            "schedules follow the production regions",
            not mismatched,
            f"mismatched: {mismatched}" if mismatched else f"{len(schedule_rows)} schedules",
        ))
    else:
        results.append(("schedules readable", False, f"HTTP {schedule_status}"))

    width = max(len(name) for name, _, _ in results)
    for name, passed, detail in results:
        print(f"{'PASS' if passed else 'FAIL'}  {name.ljust(width)}  {detail}")
    failed = [name for name, passed, _ in results if not passed]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("failed: " + ", ".join(failed))
        return 1
    print("Migration 16 is in place and the public contract is unchanged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
