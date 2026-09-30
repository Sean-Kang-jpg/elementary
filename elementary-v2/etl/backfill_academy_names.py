"""Backfill public academy names without rebuilding proximity data."""

from __future__ import annotations

import argparse
import csv
import json
import urllib.parse
from pathlib import Path

from upload_academy_proximity import credentials, request_json, table_count, upsert


BASE = Path(__file__).resolve().parent
DEFAULT_MARKERS = BASE / "runtime" / "academy" / "academy_address_markers_20260929.csv"


def load_institutions(path: Path) -> dict[str, list[dict[str, str]]]:
    by_address: dict[str, list[dict[str, str]]] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get("geocode_status") != "matched":
                continue
            institutions = json.loads(row["institutions"])
            if not isinstance(institutions, list) or not institutions:
                raise ValueError(f"{row['address_id']}: institutions must be a non-empty array")
            by_address[row["address_id"]] = institutions
    return by_address


def remote_address_rows(url: str, key: str, page_size: int = 1000) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({
            "select": (
                "address_id,region,district,latitude,longitude,institution_count,"
                "institution_type_counts,realm_counts,institutions,top_subjects,"
                "source_as_of,pipeline_version"
            ),
            "order": "address_id.asc",
            "limit": page_size,
            "offset": offset,
        })
        payload, _ = request_json(url, key, f"academy_address_serving?{query}")
        if not isinstance(payload, list):
            raise RuntimeError("academy_address_serving: unexpected response")
        rows.extend(payload)
        if len(payload) < page_size:
            return rows
        offset += page_size


def verify_names_rpc(url: str, anon_key: str, complex_id: str) -> int:
    payload, _ = request_json(
        url,
        anon_key,
        "rpc/nearby_academy_addresses",
        data=json.dumps({
            "p_canonical_complex_id": complex_id,
            "p_max_distance_m": 800,
        }).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    if not isinstance(payload, list) or not payload:
        raise RuntimeError("nearby_academy_addresses: no rows returned")
    named = sum(bool(row.get("institutions")) for row in payload)
    if named != len(payload):
        raise RuntimeError(
            f"nearby_academy_addresses: only {named:,}/{len(payload):,} rows contain names"
        )
    return named


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--markers", type=Path, default=DEFAULT_MARKERS)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 1000:
        raise ValueError("--batch-size must be between 1 and 1000")

    institutions = load_institutions(args.markers)
    url, service_key, anon_key = credentials()
    remote_rows = remote_address_rows(url, service_key)
    address_ids = [str(row["address_id"]) for row in remote_rows]
    remote_count = table_count(url, service_key, "academy_address_serving")
    if len(address_ids) != remote_count or len(set(address_ids)) != remote_count:
        raise RuntimeError("remote address pagination was incomplete or duplicated")
    empty_remote = [row for row in remote_rows if not row.get("institutions")]
    if empty_remote:
        raise RuntimeError(
            f"{len(empty_remote):,} remote serving addresses still have no institutions; "
            f"first={empty_remote[0]['address_id']}"
        )
    print(f"verified {remote_count:,} remote serving addresses: 0 empty institutions arrays")

    outside_snapshot = [
        row for row in remote_rows
        if str(row["address_id"]) not in institutions
    ]
    if outside_snapshot:
        named_outside = sum(bool(row.get("institutions")) for row in outside_snapshot)
        print(
            f"preserving {len(outside_snapshot):,} serving addresses outside the marker snapshot "
            f"({named_outside:,} already named, "
            f"{len(outside_snapshot) - named_outside:,} empty); "
            f"first={outside_snapshot[0]['address_id']} "
            f"pipeline={outside_snapshot[0]['pipeline_version']}"
        )

    rows = []
    for row in remote_rows:
        address_id = str(row["address_id"])
        if address_id not in institutions:
            continue
        row["institutions"] = institutions[address_id]
        rows.append(row)
    print(
        f"validated {len(rows):,} serving addresses against "
        f"{len(institutions):,} named markers"
    )
    if not args.apply:
        print("dry-run complete; rerun with --apply to backfill academy names")
        return

    for start in range(0, len(rows), args.batch_size):
        upsert(
            url,
            service_key,
            "academy_address_serving",
            ("address_id",),
            rows[start : start + args.batch_size],
        )
    if table_count(url, service_key, "academy_address_serving") != remote_count:
        raise RuntimeError("academy address count changed during names-only backfill")

    summary_query = urllib.parse.urlencode({
        "select": "canonical_complex_id",
        "core_institution_count": "gt.0",
        "order": "core_institution_count.desc",
        "limit": 1,
    })
    samples, _ = request_json(
        url,
        service_key,
        f"apartment_academy_summary?{summary_query}",
    )
    if not isinstance(samples, list) or not samples:
        raise RuntimeError("no apartment sample available for RPC verification")
    sample_id = samples[0]["canonical_complex_id"]
    named = verify_names_rpc(url, anon_key, sample_id)
    print(f"backfilled {len(rows):,} rows; anonymous RPC returned {named:,} named markers")


if __name__ == "__main__":
    main()
