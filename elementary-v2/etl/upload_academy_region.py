"""Validate and add one regional academy serving snapshot without replacing others."""

from __future__ import annotations

import argparse
import json
import urllib.parse
from pathlib import Path

from upload_academy_proximity import (
    RUNTIME_DIR,
    credentials,
    load_rows,
    request_json,
    table_count,
    upsert,
    validate_rows,
    verify_rpc,
)


TABLE_DEFINITIONS = (
    (
        "academy_address_serving",
        "academy_address_serving",
        ("address_id",),
        ("institution_type_counts", "realm_counts", "institutions"),
        ("longitude", "latitude", "institution_count"),
    ),
    (
        "apartment_academy_origin_points",
        "apartment_academy_origins",
        ("canonical_complex_id", "origin_sequence"),
        (),
        ("origin_sequence", "latitude", "longitude"),
    ),
    (
        "apartment_academy_summary",
        "apartment_academy_summary",
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stamp", required=True, help="Snapshot date as YYYYMMDD")
    parser.add_argument("--suffix", required=True, help="Regional output suffix, e.g. c10")
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--verify-remote", action="store_true")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 1000:
        raise ValueError("--batch-size must be between 1 and 1000")

    profile = json.loads(args.profile.read_text(encoding="utf-8"))
    expected = {
        "academy_address_serving": profile["outputs"]["linked_academy_addresses"],
        "apartment_academy_origin_points": profile["outputs"]["origin_points"],
        "apartment_academy_summary": profile["outputs"]["apartment_summaries"],
    }
    loaded = []
    for table, file_prefix, keys, json_fields, numeric_fields in TABLE_DEFINITIONS:
        path = RUNTIME_DIR / f"{file_prefix}_{args.stamp}_{args.suffix}.csv"
        rows = load_rows(path, json_fields, numeric_fields)
        validate_rows(table, rows, keys)
        if len(rows) != expected[table]:
            raise RuntimeError(f"{table}: {len(rows):,} rows != profile {expected[table]:,}")
        loaded.append((table, keys, rows))
        print(f"validated {table}: {len(rows):,} rows")

    if not args.apply and not args.verify_remote:
        print("regional dry-run complete; rerun with --apply to perform additive upserts")
        return

    url, service_key, anon_key = credentials()
    if args.apply:
        for table, keys, rows in loaded:
            before = table_count(url, service_key, table)
            for start in range(0, len(rows), args.batch_size):
                upsert(url, service_key, table, keys, rows[start : start + args.batch_size])
            after = table_count(url, service_key, table)
            if after < before or after > before + len(rows):
                raise RuntimeError(f"{table}: unsafe count transition {before:,} -> {after:,}")
            print(f"upserted {table}: {before:,} -> {after:,}")

    sample = next(
        row for row in loaded[2][2]
        if row["core_institution_count"] + row["extended_institution_count"] > 0
    )
    rpc_rows = verify_rpc(url, anon_key, sample["canonical_complex_id"])
    if rpc_rows <= 0:
        raise RuntimeError("regional academy RPC returned no rows for a non-empty sample")
    print(f"anonymous RPC verified for {sample['canonical_complex_id']}: {rpc_rows:,} rows")

    query = urllib.parse.urlencode({
        "canonical_complex_id": f"eq.{sample['canonical_complex_id']}",
        "select": "school_id",
        "limit": 1,
    })
    school_rows, _ = request_json(url, anon_key, f"school_apartment_serving?{query}")
    if not school_rows:
        raise RuntimeError("no assigned school found for regional academy sample")
    school_id = school_rows[0]["school_id"]
    school_payload, _ = request_json(
        url,
        anon_key,
        "rpc/nearby_academy_addresses_for_school",
        data=json.dumps({"p_school_id": school_id, "p_max_distance_m": 800}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    if not isinstance(school_payload, list) or not school_payload:
        raise RuntimeError("regional school academy RPC returned no rows")
    print(f"anonymous school RPC verified for {school_id}: {len(school_payload):,} rows")


if __name__ == "__main__":
    main()
