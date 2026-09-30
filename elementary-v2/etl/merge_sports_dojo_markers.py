"""Merge active sports-dojo permits into address-level education markers."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
ACADEMY_DIR = BASE_DIR / "runtime" / "academy"
DOJO_DIR = BASE_DIR / "runtime" / "sports_dojo"


def normalize_address(value: str) -> str:
    return " ".join(str(value or "").split())


def parse_object(value: str) -> dict[str, int]:
    parsed = json.loads(value or "{}")
    return {str(key): int(count) for key, count in parsed.items()}


def parse_array(value: str) -> list[dict[str, str]]:
    parsed = json.loads(value or "[]")
    return [
        {
            "name": str(item.get("name") or ""),
            "type": str(item.get("type") or ""),
            "realm": str(item.get("realm") or ""),
        }
        for item in parsed
        if isinstance(item, dict)
    ]


def district_from_address(address: str) -> str:
    parts = normalize_address(address).split()
    return parts[1] if len(parts) > 1 else ""


def dojo_marker(row: dict[str, Any], source_name: str) -> dict[str, Any]:
    address = normalize_address(row.get("road_address") or row.get("lot_address") or "")
    return {
        "address_id": hashlib.sha256(address.encode("utf-8")).hexdigest()[:24],
        "region": row["region"],
        "district": row.get("district") or district_from_address(address),
        "road_address": address,
        "longitude": row["longitude"],
        "latitude": row["latitude"],
        "geocode_status": "matched",
        "academy_count": 1,
        "institution_type_counts": {"체육도장업": 1},
        "realm_counts": {row["sport_type"]: 1},
        "institutions": [{
            "name": row["institution_name"],
            "type": "체육도장업",
            "realm": row["sport_type"],
        }],
        "top_subjects": row["sport_type"],
        "source_snapshot": source_name,
    }


def academy_marker(row: dict[str, str]) -> dict[str, Any]:
    return {
        **row,
        "academy_count": int(row["academy_count"]),
        "institution_type_counts": parse_object(row["institution_type_counts"]),
        "realm_counts": parse_object(row["realm_counts"]),
        "institutions": parse_array(row.get("institutions", "[]")),
    }


def merge_marker(target: dict[str, Any], addition: dict[str, Any]) -> None:
    target["academy_count"] += addition["academy_count"]
    for field in ("institution_type_counts", "realm_counts"):
        counts = Counter(target[field])
        counts.update(addition[field])
        target[field] = dict(counts)
    known = {(item["name"], item["type"], item["realm"]) for item in target["institutions"]}
    target["institutions"].extend(
        item for item in addition["institutions"]
        if (item["name"], item["type"], item["realm"]) not in known
    )
    subjects = [item.strip() for item in str(target.get("top_subjects") or "").split("|") if item.strip()]
    if addition["top_subjects"] not in subjects:
        subjects.append(addition["top_subjects"])
    target["top_subjects"] = " | ".join(subjects[:5])
    target["source_snapshot"] = f"{target['source_snapshot']}+{addition['source_snapshot']}"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--academy-markers", type=Path, required=True)
    parser.add_argument("--sports-dojos", type=Path, required=True)
    parser.add_argument("--as-of", default=date.today().strftime("%Y%m%d"))
    args = parser.parse_args(argv)

    with args.academy_markers.open(encoding="utf-8-sig", newline="") as handle:
        markers = {row["address_id"]: academy_marker(row) for row in csv.DictReader(handle)}
    dojo_rows = json.loads(args.sports_dojos.read_text(encoding="utf-8"))
    eligible = [
        row for row in dojo_rows
        if row.get("business_status") == "영업/정상"
        and row.get("latitude") is not None
        and normalize_address(row.get("road_address") or row.get("lot_address") or "")
    ]

    added = 0
    merged = 0
    for row in eligible:
        marker = dojo_marker(row, args.sports_dojos.name)
        existing = markers.get(marker["address_id"])
        if existing:
            merge_marker(existing, marker)
            merged += 1
        else:
            markers[marker["address_id"]] = marker
            added += 1

    output = ACADEMY_DIR / f"education_facility_markers_{args.as_of}.csv"
    fields = (
        "address_id", "region", "district", "road_address", "longitude", "latitude",
        "geocode_status", "academy_count", "institution_type_counts", "realm_counts",
        "institutions", "top_subjects", "source_snapshot",
    )
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for marker in sorted(markers.values(), key=lambda item: (item["region"], item["district"], item["road_address"])):
            serialized = dict(marker)
            for field in ("institution_type_counts", "realm_counts", "institutions"):
                serialized[field] = json.dumps(serialized[field], ensure_ascii=False, sort_keys=True)
            writer.writerow(serialized)

    profile = {
        "academy_markers": len(markers) - added,
        "sports_dojo_rows": len(dojo_rows),
        "eligible_active_geocoded_dojos": len(eligible),
        "new_address_markers": added,
        "merged_into_existing_addresses": merged,
        "combined_markers": len(markers),
        "output": output.name,
    }
    profile_path = ACADEMY_DIR / f"education_facility_marker_profile_{args.as_of}.json"
    profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(profile, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
