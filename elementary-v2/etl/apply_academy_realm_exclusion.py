"""Remove excluded academy realms from the live academy serving tables.

The marker builder drops these realms at the source (build_academy_marker_snapshot.py),
but the serving tables were assembled from regional uploads, a sports-dojo merge and
name/subject backfills, so a full rebuild would not reproduce them. This edits them in
place instead:

- academy_address_serving: the excluded institutions leave `institutions`,
  `realm_counts`, `institution_type_counts` and `institution_count`; an address left
  with none is deleted (institution_count must stay >= 1).
- apartment_academy_summary: every complex whose origin points lie within the
  maximum radius of a changed address loses those institutions (and the address, if
  it was deleted) from the band it was counted in. Distances use the builder's
  haversine and rounding, so the bands match how the summary was built.

Idempotent: once applied, no address carries an excluded realm and a rerun changes
nothing. That is what lets the monthly ETL run it as a guard after every refresh.
Dry-run by default; --apply writes.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_academy_marker_snapshot import EXCLUDED_REALMS
from evaluate_academy_distance_origins import grid_key, haversine_m, nearby_candidates
from upload_academy_proximity import PROJECT_DIR, load_env, request_json, table_count, upsert


CORE_RADIUS_M = 600
MAXIMUM_RADIUS_M = 800
PAGE = 1000


def credentials() -> tuple[str, str]:
    # Service role only: the monthly Actions run has no anon key, and nothing here reads anonymously.
    load_env(PROJECT_DIR / ".env")
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return url.rstrip("/"), key


def fetch_all(url: str, key: str, table: str, select: str, order: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    while True:
        query = urllib.parse.urlencode({"select": select, "order": order})
        batch, _ = request_json(url, key, f"{table}?{query}", headers={"Range": f"{len(rows)}-{len(rows) + PAGE - 1}"})
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows


def excluded_count(row: dict[str, Any]) -> int:
    return sum(int(count or 0) for realm, count in (row.get("realm_counts") or {}).items() if realm in EXCLUDED_REALMS)


def cleaned(row: dict[str, Any], removed: int) -> dict[str, Any]:
    institutions = [item for item in row.get("institutions") or [] if item.get("realm") not in EXCLUDED_REALMS]
    if row.get("institutions"):
        type_counts = dict(Counter(item.get("type") or "미상" for item in institutions))
    else:
        # Rows without names cannot say which type the excluded ones were; NEIS files
        # every 직업기술 institution as a 학원.
        type_counts = dict(row.get("institution_type_counts") or {})
        if "학원" in type_counts:
            type_counts["학원"] = max(0, type_counts["학원"] - removed)
            if not type_counts["학원"]:
                del type_counts["학원"]
    return {
        **row,
        "institution_count": int(row["institution_count"]) - removed,
        "institutions": institutions,
        "realm_counts": {realm: count for realm, count in row["realm_counts"].items() if realm not in EXCLUDED_REALMS},
        "institution_type_counts": type_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", type=Path, help="Write the summary as JSON here")
    args = parser.parse_args()

    url, service_key = credentials()
    addresses = fetch_all(
        url, service_key, "academy_address_serving",
        "address_id,region,district,latitude,longitude,institution_count,institution_type_counts,"
        "realm_counts,institutions,top_subjects,source_as_of,pipeline_version",
        "address_id",
    )
    affected = [(row, excluded_count(row)) for row in addresses if excluded_count(row)]
    updates = [cleaned(row, removed) for row, removed in affected if int(row["institution_count"]) > removed]
    deletes = [row for row, removed in affected if int(row["institution_count"]) <= removed]
    print(f"addresses {len(addresses):,}; with {sorted(EXCLUDED_REALMS)}: {len(affected):,} "
          f"(update {len(updates):,}, delete {len(deletes):,}); institutions removed {sum(r for _, r in affected):,}")

    deltas: dict[str, Counter] = defaultdict(Counter)
    if affected:
        origins = fetch_all(url, service_key, "apartment_academy_origin_points",
                            "canonical_complex_id,origin_sequence,latitude,longitude", "canonical_complex_id,origin_sequence")
        index: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
        for origin in origins:
            index[grid_key(origin["latitude"], origin["longitude"])].append(origin)
        for row, removed in affected:
            nearest: dict[str, float] = {}
            for origin in nearby_candidates(index, row["latitude"], row["longitude"], MAXIMUM_RADIUS_M):
                distance = haversine_m(origin["latitude"], origin["longitude"], row["latitude"], row["longitude"])
                if distance <= MAXIMUM_RADIUS_M and distance < nearest.get(origin["canonical_complex_id"], math.inf):
                    nearest[origin["canonical_complex_id"]] = distance
            gone = int(row["institution_count"]) <= removed
            for complex_id, distance in nearest.items():
                band = "core" if int(round(distance)) <= CORE_RADIUS_M else "extended"
                deltas[complex_id][f"{band}_institution_count"] += removed
                if gone:
                    deltas[complex_id][f"{band}_address_count"] += 1

    summaries = {row["canonical_complex_id"]: row for row in fetch_all(
        url, service_key, "apartment_academy_summary",
        "canonical_complex_id,core_address_count,extended_address_count,core_institution_count,"
        "extended_institution_count,distance_origin_type,pipeline_version",
        "canonical_complex_id",
    )} if deltas else {}
    summary_updates, negative = [], []
    now = datetime.now(timezone.utc).isoformat()
    for complex_id, delta in sorted(deltas.items()):
        current = summaries.get(complex_id)
        if current is None:
            continue
        updated = {**current, **{field: current[field] - amount for field, amount in delta.items()}, "updated_at": now}
        if any(updated[field] < 0 for field in delta):
            negative.append(complex_id)
        summary_updates.append(updated)
    removed_from_summaries = sum(
        summaries[c]["core_institution_count"] + summaries[c]["extended_institution_count"]
        - u["core_institution_count"] - u["extended_institution_count"]
        for c, u in ((u["canonical_complex_id"], u) for u in summary_updates)
    )
    print(f"apartment summaries changed: {len(summary_updates):,}; institution links removed {removed_from_summaries:,}")
    if negative:
        raise SystemExit(f"{len(negative)} summaries would go negative (e.g. {negative[:3]}); the summary "
                         "was not built from these addresses - stop and rebuild instead")

    report = {
        "excluded_realms": sorted(EXCLUDED_REALMS),
        "addresses": len(addresses),
        "affected_addresses": len(affected),
        "updated_addresses": len(updates),
        "deleted_addresses": len(deletes),
        "removed_institutions": sum(r for _, r in affected),
        "changed_summaries": len(summary_updates),
        "applied": bool(args.apply and affected),
    }
    if not args.apply:
        print("dry-run; rerun with --apply to write")
    elif affected:
        before = table_count(url, service_key, "academy_address_serving")
        for start in range(0, len(updates), 500):
            upsert(url, service_key, "academy_address_serving", ("address_id",),
                   [{**row, "updated_at": now} for row in updates[start:start + 500]])
        for start in range(0, len(deletes), 100):
            ids = ",".join(f'"{row["address_id"]}"' for row in deletes[start:start + 100])
            request_json(url, service_key, f"academy_address_serving?address_id=in.({ids})", method="DELETE",
                         headers={"Prefer": "return=minimal"})
        for start in range(0, len(summary_updates), 500):
            upsert(url, service_key, "apartment_academy_summary", ("canonical_complex_id",),
                   summary_updates[start:start + 500])
        after = table_count(url, service_key, "academy_address_serving")
        if after != before - len(deletes):
            raise RuntimeError(f"academy_address_serving: {before:,} -> {after:,}, expected -{len(deletes):,}")
        remaining = [row for row in fetch_all(url, service_key, "academy_address_serving", "address_id,realm_counts", "address_id")
                     if excluded_count(row)]
        if remaining:
            raise RuntimeError(f"{len(remaining)} addresses still carry an excluded realm")
        print(f"applied: academy_address_serving {before:,} -> {after:,}, no excluded realm remains")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
