#!/usr/bin/env python3
"""Collect every case a built scope leaves for human review, across regions.

A wave is not blocked by these one at a time: they are gathered here so the
review happens once, before any upload. Each row says which region it came
from, what kind of case it is, and the evidence needed to judge it.

    python etl/collect_review_cases.py 대전광역시 대구광역시 부산광역시 울산광역시

Case types:
  unassigned_apartment      the complex fell in no school zone
  named_zone_without_school the zone record names a school the master lacks
  unmatched_zone_label      the zone label did not segment into known schools
  school_without_zone       a public school no zone record covers
  school_without_grade_data no Schoolinfo grade statistics for this school
  review_required_unit      the pipeline itself flagged the assignment
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/collect_review_cases.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl.fetch_schoolinfo_2026 import build_scopes, scope_slug
from etl.region_registry import load_registry

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
ZONE_PROFILE = BASE_DIR / "runtime" / "region_eda" / "zones_n1_20260922.json"

GRADE_FIELDS = tuple(f"grade{grade}_students" for grade in range(1, 7))


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def load_csv(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def case(region: str, kind: str, subject: str, detail: str, evidence: str = "") -> dict[str, str]:
    return {
        "region": region,
        "case_type": kind,
        "subject": subject,
        "detail": detail,
        "evidence": evidence,
        "verdict": "",
        "note": "",
    }


def collect_region(
    region_name: str, zone_profiles: dict[str, Any], cities: tuple[str, ...] = ()
) -> list[dict[str, str]]:
    registry = load_registry()
    scopes = list(build_scopes(registry, [region_name], cities))
    slug = scope_slug(scopes)
    suffix = "" if slug == "capital" else f"_{slug}"
    rows: list[dict[str, str]] = []

    units = load_json(OUTPUT_DIR / f"apartment_assignment_units_v1{suffix}.json") or []
    links = load_json(OUTPUT_DIR / f"apartment_assignment_schools_v1{suffix}.json") or []
    schools = load_json(OUTPUT_DIR / f"school_master_operational_v1{suffix}.json") or []
    points = {row["apt_cd"]: row for row in load_csv(OUTPUT_DIR / f"apartment_point_assignments{suffix}.csv")}
    linked_apts = {link["apt_cd"] for link in links}

    for unit in units:
        point = points.get(unit["apt_cd"], {})
        if not unit.get("hakgudo_id") and not point.get("primary_hakgudo_id"):
            rows.append(case(
                region_name, "unassigned_apartment",
                unit.get("apt_name") or unit["apt_cd"],
                unit.get("road_address") or "",
                f"lat={unit.get('latitude')} lng={unit.get('longitude')}",
            ))
        elif unit["apt_cd"] not in linked_apts:
            rows.append(case(
                region_name, "named_zone_without_school",
                unit.get("apt_name") or unit["apt_cd"],
                unit.get("road_address") or "",
                f"zone={unit.get('hakgudo_name')}",
            ))
        if str(unit.get("review_required")).lower() in {"true", "1"}:
            rows.append(case(
                region_name, "review_required_unit",
                unit.get("apt_name") or unit["apt_cd"],
                unit.get("road_address") or "",
                f"reason={unit.get('review_reason') or ''} zone={unit.get('hakgudo_name') or ''}",
            ))

    for school in schools:
        if all(school.get(field) is None for field in GRADE_FIELDS):
            rows.append(case(
                region_name, "school_without_grade_data",
                school.get("school_name") or school.get("school_id"),
                school.get("road_address") or "",
                f"school_id={school.get('school_id')}",
            ))

    # Zone-level cases are province-wide, so a city scope reports only its own
    # build cases and leaves zone coverage to the full-region pass.
    profile = {} if cities else zone_profiles.get(region_name, {})
    for label in profile.get("failures", []):
        rows.append(case(region_name, "unmatched_zone_label", label, "zone label did not segment", ""))
    for name, establishment in profile.get("schools_without_zone", []):
        if establishment in {"사립", "국립"}:
            continue  # private and national-university schools have no 통학구역 by design
        rows.append(case(region_name, "school_without_zone", name, f"establishment={establishment}", ""))
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("regions", nargs="+")
    parser.add_argument("--cities", nargs="*", default=(), help="restrict a single region to these cities")
    parser.add_argument("--zone-profile", type=Path, default=ZONE_PROFILE)
    parser.add_argument("--out", type=Path, default=OUTPUT_DIR / "review_cases.csv")
    args = parser.parse_args(argv)

    zone_data = load_json(args.zone_profile) or {}
    zone_profiles = {profile["region"]: profile for profile in zone_data.get("profiles", [])}
    missing_profiles = [name for name in args.regions if name not in zone_profiles]

    if args.cities and len(args.regions) != 1:
        parser.error("--cities applies to a single region")
    rows: list[dict[str, str]] = []
    for region_name in args.regions:
        rows.extend(collect_region(region_name, zone_profiles, tuple(args.cities)))
    rows.sort(key=lambda row: (row["case_type"], row["region"], row["subject"]))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["region", "case_type", "subject", "detail", "evidence", "verdict", "note"])
        writer.writeheader()
        writer.writerows(rows)

    by_region: dict[str, dict[str, int]] = {}
    for row in rows:
        by_region.setdefault(row["region"], {}).setdefault(row["case_type"], 0)
        by_region[row["region"]][row["case_type"]] += 1
    for region_name in args.regions:
        counts = by_region.get(region_name, {})
        total = sum(counts.values())
        print(f"{region_name}: {total} cases {counts if counts else '(none)'}")
    if missing_profiles:
        print(f"\nWARNING: no zone profile for {missing_profiles}; "
              "run profile_region_school_zones.py so label and coverage cases are included")
    print(f"\ntotal {len(rows)} cases -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
