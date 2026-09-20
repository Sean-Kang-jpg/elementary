"""Validate and upload the approved academy proximity serving snapshot."""

from __future__ import annotations

import argparse
import csv
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
RUNTIME_DIR = BASE_DIR / "runtime" / "academy"
PROFILE_PATH = BASE_DIR / "academy_proximity_profile.json"
TABLES = (
    (
        "academy_address_serving",
        RUNTIME_DIR / "academy_address_serving_20260920.csv",
        ("address_id",),
        ("institution_type_counts", "realm_counts"),
        ("longitude", "latitude", "institution_count"),
    ),
    (
        "apartment_academy_origin_points",
        RUNTIME_DIR / "apartment_academy_origins_20260920.csv",
        ("canonical_complex_id", "origin_sequence"),
        (),
        ("origin_sequence", "latitude", "longitude"),
    ),
    (
        "apartment_academy_summary",
        RUNTIME_DIR / "apartment_academy_summary_20260920.csv",
        ("canonical_complex_id",),
        (),
        (
            "core_address_count",
            "extended_address_count",
            "core_institution_count",
            "extended_institution_count",
        ),
    ),
)


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def credentials() -> tuple[str, str, str]:
    load_env(PROJECT_DIR / ".env")
    url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_KEY")
    anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    if not url or not service_key or not anon_key:
        raise RuntimeError("SUPABASE_URL, SUPABASE_SERVICE_KEY, and SUPABASE_ANON_KEY are required")
    return url.rstrip("/"), service_key, anon_key


def load_rows(path: Path, json_fields: tuple[str, ...], numeric_fields: tuple[str, ...]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for source in csv.DictReader(handle):
            row: dict[str, Any] = {key: value if value != "" else None for key, value in source.items()}
            for field in json_fields:
                row[field] = json.loads(row[field]) if row[field] else {}
            for field in numeric_fields:
                if row[field] is None:
                    continue
                row[field] = float(row[field]) if field in {"latitude", "longitude"} else int(row[field])
            rows.append(row)
    return rows


def validate_rows(table: str, rows: list[dict[str, Any]], keys: tuple[str, ...]) -> None:
    if not rows:
        raise ValueError(f"{table}: no rows")
    identities = [tuple(row.get(key) for key in keys) for row in rows]
    if any(any(value in (None, "") for value in identity) for identity in identities):
        raise ValueError(f"{table}: null conflict key")
    if len(identities) != len(set(identities)):
        raise ValueError(f"{table}: duplicate conflict key")


def request_json(url: str, key: str, path: str, *, data: bytes | None = None, method: str = "GET", headers: dict[str, str] | None = None) -> tuple[Any, dict[str, str]]:
    request_headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    request_headers.update(headers or {})
    request = urllib.request.Request(f"{url}/rest/v1/{path}", data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read()
            return (json.loads(payload) if payload else None), dict(response.headers)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"{path}: HTTP {exc.code}: {detail}") from exc


def table_count(url: str, key: str, table: str) -> int:
    _, headers = request_json(
        url,
        key,
        f"{table}?select=*&limit=1",
        headers={"Prefer": "count=exact", "Range": "0-0"},
    )
    content_range = headers.get("Content-Range", "")
    value = content_range.rsplit("/", 1)[-1]
    if not value.isdigit():
        raise RuntimeError(f"{table}: count unavailable ({content_range})")
    return int(value)


def upsert(url: str, key: str, table: str, keys: tuple[str, ...], rows: list[dict[str, Any]]) -> None:
    query = urllib.parse.urlencode({"on_conflict": ",".join(keys)})
    request_json(
        url,
        key,
        f"{table}?{query}",
        data=json.dumps(rows, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"},
    )


def verify_rpc(url: str, anon_key: str, complex_id: str) -> int:
    payload, _ = request_json(
        url,
        anon_key,
        "rpc/nearby_academy_addresses",
        data=json.dumps({"p_canonical_complex_id": complex_id, "p_max_distance_m": 800}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    if not isinstance(payload, list):
        raise RuntimeError("nearby_academy_addresses: unexpected response")
    if payload and any(row["straight_distance_m"] > 800 for row in payload):
        raise RuntimeError("nearby_academy_addresses: returned a distance above 800 m")
    return len(payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Upload after SQL 14 has been applied")
    parser.add_argument("--remote-check", action="store_true", help="Read remote table counts without writing")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 1000:
        raise ValueError("--batch-size must be between 1 and 1000")

    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    expected = {
        "academy_address_serving": profile["outputs"]["linked_academy_addresses"],
        "apartment_academy_origin_points": profile["outputs"]["origin_points"],
        "apartment_academy_summary": profile["outputs"]["apartment_summaries"],
    }
    loaded: list[tuple[str, tuple[str, ...], list[dict[str, Any]]]] = []
    for table, path, keys, json_fields, numeric_fields in TABLES:
        rows = load_rows(path, json_fields, numeric_fields)
        validate_rows(table, rows, keys)
        if len(rows) != expected[table]:
            raise RuntimeError(f"{table}: {len(rows):,} rows != profile {expected[table]:,}")
        loaded.append((table, keys, rows))
        print(f"validated {table}: {len(rows):,} rows")

    if not args.apply and not args.remote_check:
        print("dry-run complete; apply sql/14, then rerun with --apply")
        return

    url, service_key, anon_key = credentials()
    for table, _, rows in loaded:
        remote_count = table_count(url, service_key, table)
        if remote_count not in {0, len(rows)}:
            raise RuntimeError(f"{table}: remote count {remote_count:,} is neither empty nor snapshot-complete")
        print(f"preflight {table}: {remote_count:,} rows")

    if not args.apply:
        for table, _, rows in loaded:
            public_count = table_count(url, anon_key, table)
            if public_count != len(rows):
                raise RuntimeError(f"{table}: anonymous count {public_count:,} != local {len(rows):,}")
            print(f"anonymous read verified {table}: {public_count:,} rows")
        sample_complex_id = loaded[2][2][0]["canonical_complex_id"]
        rpc_rows = verify_rpc(url, anon_key, sample_complex_id)
        print(f"anonymous RPC verified for {sample_complex_id}: {rpc_rows:,} rows")
        print("remote preflight complete; no rows were written")
        return

    for table, keys, rows in loaded:
        for start in range(0, len(rows), args.batch_size):
            upsert(url, service_key, table, keys, rows[start : start + args.batch_size])
        remote_count = table_count(url, service_key, table)
        if remote_count != len(rows):
            raise RuntimeError(f"{table}: remote count {remote_count:,} != local {len(rows):,}")
        print(f"uploaded and verified {table}: {remote_count:,} rows")

    for table, _, rows in loaded:
        public_count = table_count(url, anon_key, table)
        if public_count != len(rows):
            raise RuntimeError(f"{table}: anonymous count {public_count:,} != local {len(rows):,}")
        print(f"anonymous read verified {table}: {public_count:,} rows")

    sample_complex_id = loaded[2][2][0]["canonical_complex_id"]
    rpc_rows = verify_rpc(url, anon_key, sample_complex_id)
    print(f"anonymous RPC verified for {sample_complex_id}: {rpc_rows:,} rows")


if __name__ == "__main__":
    main()
