"""Tag every published academy with name-derived subjects, in place.

academy_address_serving already publishes each address's institutions (name,
type, realm) as JSONB, so the subjects go inside those objects - no schema
change, no rebuild of the proximity data, and the public RPCs return them as
they are. Rules are etl/academy_subjects.py, shared with the marker builder.

    python etl/backfill_academy_subjects.py            # dry run: counts only
    python etl/backfill_academy_subjects.py --apply    # write changed rows

Only rows whose institutions actually change are written, and the row count
must be unchanged afterwards. Writing needs SUPABASE_SERVICE_KEY; checking the
public side uses the anon key, the way a browser would.
"""

from __future__ import annotations

import argparse
import json
import urllib.parse
from collections import Counter

from academy_subjects import classify
from backfill_academy_names import remote_address_rows
from upload_academy_proximity import credentials, request_json, table_count, upsert


def tagged(institutions: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        {**item, "subjects": classify(str(item.get("name") or ""), str(item.get("realm") or ""), str(item.get("type") or ""))}
        for item in institutions
    ]


def verify_public(url: str, anon_key: str) -> tuple[int, int]:
    """Through the anon key and the public RPC, as the map reads it."""
    query = urllib.parse.urlencode({
        "select": "canonical_complex_id",
        "order": "core_institution_count.desc",
        "limit": 1,
    })
    summary, _ = request_json(url, anon_key, f"apartment_academy_summary?{query}")
    if not summary:
        raise RuntimeError("apartment_academy_summary: no rows for the public check")
    payload, _ = request_json(
        url,
        anon_key,
        "rpc/nearby_academy_addresses",
        data=json.dumps({"p_canonical_complex_id": summary[0]["canonical_complex_id"], "p_max_distance_m": 800}).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    institutions = [item for row in payload or [] for item in (row.get("institutions") or [])]
    with_subjects = sum(bool(item.get("subjects")) for item in institutions)
    return with_subjects, len(institutions)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 1000:
        raise ValueError("--batch-size must be between 1 and 1000")

    url, service_key, anon_key = credentials()
    remote_rows = remote_address_rows(url, service_key)
    remote_count = table_count(url, service_key, "academy_address_serving")
    if len(remote_rows) != remote_count or len({row["address_id"] for row in remote_rows}) != remote_count:
        raise RuntimeError("remote address pagination was incomplete or duplicated")

    changed = []
    subjects = Counter()
    institutions_total = 0
    study_only = 0
    study_realm = 0
    for row in remote_rows:
        current = row.get("institutions") or []
        if not isinstance(current, list):
            raise RuntimeError(f"{row['address_id']}: institutions is not an array")
        updated = tagged(current)
        for item in updated:
            institutions_total += 1
            subjects.update(item["subjects"])
            if item.get("realm") == "입시.검정 및 보습":
                study_realm += 1
                study_only += item["subjects"] == ["study"]
        if updated != current:
            row["institutions"] = updated
            changed.append(row)

    print(f"remote addresses {remote_count:,}, institutions {institutions_total:,}")
    print("subjects (an academy can have several): " + ", ".join(f"{key} {count:,}" for key, count in subjects.most_common()))
    if study_realm:
        print(f"'입시.검정 및 보습' academies left as study only: {study_only:,}/{study_realm:,} ({study_only / study_realm:.1%})")
    print(f"addresses to update: {len(changed):,}")
    if not args.apply:
        print("dry-run complete; rerun with --apply to write the subjects")
        return

    for start in range(0, len(changed), args.batch_size):
        upsert(url, service_key, "academy_address_serving", ("address_id",), changed[start : start + args.batch_size])
        print(f"  wrote {min(start + args.batch_size, len(changed)):,}/{len(changed):,}")
    if table_count(url, service_key, "academy_address_serving") != remote_count:
        raise RuntimeError("academy address count changed during the subjects backfill")

    after = remote_address_rows(url, service_key)
    missing = sum(1 for row in after for item in (row.get("institutions") or []) if not item.get("subjects"))
    if missing:
        raise RuntimeError(f"{missing:,} institutions still have no subjects")
    with_subjects, checked = verify_public(url, anon_key)
    if with_subjects != checked:
        raise RuntimeError(f"public RPC: only {with_subjects:,}/{checked:,} institutions carry subjects")
    print(f"verified: every institution has subjects; public RPC returned {checked:,} tagged institutions")


if __name__ == "__main__":
    main()
