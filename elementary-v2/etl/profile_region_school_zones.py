#!/usr/bin/env python3
"""Profile a region's school-zone records before building it.

This is the school-zone half of the per-region EDA gate. It answers the
question that decides whether a region can be built at all: do its zone labels
segment into known schools with the existing matcher, or does the region need a
different method?

School-zone records are written per education office, and offices inside one
region can differ, so the result is reported per office as well as in total.

    python etl/profile_region_school_zones.py 대구광역시
    python etl/profile_region_school_zones.py 부산광역시 울산광역시 --shp <path>
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/profile_region_school_zones.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import shapefile

from etl.build_operational_masters import match_school_zone_scoped, school_zone_label
from etl.region_registry import load_registry

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SHP = BASE_DIR / "data" / "hakgudo" / "20260320" / "extracted" / "초등학교통학구역.shp"
SCHOOL_SOURCE = BASE_DIR / "data" / "schoolzone" / "school_location_20260320.csv"
ELEMENTARY = "초등학교"


def candidate_labels(rows: list[dict[str, str]], region: Any) -> list[tuple[str, str]]:
    return sorted(
        {
            (school_zone_label(variant), row["학교ID"])
            for row in rows
            for variant in region.name_variants(row["학교명"])
        },
        key=lambda item: (-len(item[0]), item[0], item[1]),
    )


def load_all_schools() -> list[dict[str, str]]:
    with SCHOOL_SOURCE.open(encoding="utf-8-sig", newline="") as handle:
        return [row for row in csv.DictReader(handle) if row.get("학교급구분") == ELEMENTARY]


def load_schools(region_name: str) -> list[dict[str, str]]:
    registry = load_registry()
    with SCHOOL_SOURCE.open(encoding="utf-8-sig", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("학교급구분") == ELEMENTARY]
    selected = []
    for row in rows:
        address = row.get("소재지도로명주소") or row.get("소재지지번주소") or ""
        region = registry.region_for_address(address)
        if region and region.canonical_name == region_name:
            selected.append(row)
    return selected


def load_zones(shp_path: Path, legal_dong_code: str) -> list[dict[str, Any]]:
    reader = shapefile.Reader(str(shp_path), encoding="euc-kr")
    fields = [field[0] for field in reader.fields[1:]]
    return [
        record
        for record in (dict(zip(fields, row)) for row in reader.records())
        if record.get("SD_CD") == legal_dong_code
    ]


def profile_region(region_name: str, shp_path: Path) -> dict[str, Any]:
    registry = load_registry()
    region = registry.get(region_name)
    schools = load_schools(region.canonical_name)
    zones = load_zones(shp_path, region.legal_dong_code)
    if not schools or not zones:
        return {"region": region.canonical_name, "schools": len(schools), "zones": len(zones),
                "error": "no schools or no zones for this region"}

    candidates = candidate_labels(schools, region)
    nationwide = candidate_labels(load_all_schools(), region)

    matched_schools: set[str] = set()
    failures: list[str] = []
    cross_region: list[str] = []
    per_office: dict[str, Counter] = defaultdict(Counter)
    for zone in zones:
        office = str(zone.get("EDU_NM") or "")
        school_ids, used_fallback = match_school_zone_scoped(
            zone.get("HAKGUDO_NM"), region.canonical_name, candidates, nationwide
        )
        per_office[office]["zones"] += 1
        if school_ids:
            per_office[office]["segmented"] += 1
            if used_fallback:
                per_office[office]["cross_region"] += 1
                cross_region.append(str(zone.get("HAKGUDO_NM")))
            matched_schools.update(school_ids)
        else:
            failures.append(str(zone.get("HAKGUDO_NM")))

    by_id = {row["학교ID"]: row for row in schools}
    uncovered = [
        (by_id[school_id]["학교명"], by_id[school_id].get("설립형태", ""))
        for school_id in by_id
        if school_id not in matched_schools
    ]
    segmented = sum(counter["segmented"] for counter in per_office.values())
    return {
        "region": region.canonical_name,
        "schools": len(schools),
        "zones": len(zones),
        "zone_types": dict(Counter(str(zone.get("HAKGUDO_GB")) for zone in zones)),
        "segmented": segmented,
        "segmented_pct": round(100 * segmented / len(zones), 1),
        "failures": failures,
        "cross_region_zones": cross_region,
        "schools_without_zone": uncovered,
        "private_schools_without_zone": sum(1 for _, kind in uncovered if kind == "사립"),
        "by_office": {
            office: {
                "zones": counter["zones"],
                "segmented": counter["segmented"],
                "segmented_pct": round(100 * counter["segmented"] / counter["zones"], 1),
            }
            for office, counter in sorted(per_office.items())
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("regions", nargs="+", help="registry region names")
    parser.add_argument("--shp", type=Path, default=DEFAULT_SHP)
    parser.add_argument("--json", type=Path, help="write the full profile here")
    args = parser.parse_args(argv)

    if not args.shp.exists():
        parser.error(f"school-zone shapefile not found: {args.shp}")

    profiles = [profile_region(name, args.shp) for name in args.regions]
    for profile in profiles:
        if profile.get("error"):
            print(f"[{profile['region']}] {profile['error']}")
            continue
        print(f"[{profile['region']}] schools {profile['schools']}, zones {profile['zones']} "
              f"{profile['zone_types']}")
        print(f"  segmented {profile['segmented']}/{profile['zones']} ({profile['segmented_pct']}%)")
        for office, stats in profile["by_office"].items():
            print(f"    {office:<28} {stats['segmented']:>4}/{stats['zones']:<4} ({stats['segmented_pct']}%)")
        if profile["cross_region_zones"]:
            print(f"  matched only with schools from another region: {len(profile['cross_region_zones'])} "
                  f"{profile['cross_region_zones'][:4]}")
        if profile["failures"]:
            print(f"  FAILED labels ({len(profile['failures'])}): {profile['failures'][:8]}")
        uncovered = profile["schools_without_zone"]
        print(f"  schools with no zone: {len(uncovered)} "
              f"({profile['private_schools_without_zone']} 사립)")
        if uncovered:
            print(f"    {[name for name, _ in uncovered][:8]}")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps({"shapefile": str(args.shp), "profiles": profiles},
                                        ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nwrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
