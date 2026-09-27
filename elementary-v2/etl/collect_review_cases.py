#!/usr/bin/env python3
"""Collect every case a built scope leaves for human review, across regions.

A wave is not blocked by these one at a time: they are gathered here so the
review happens once, before any upload. Each row says which region it came
from, what kind of case it is, and the evidence needed to judge it.

    python etl/collect_review_cases.py 대전광역시 대구광역시 부산광역시 울산광역시

Case types:
  unassigned_apartment      the complex fell in no school zone
  named_zone_without_school the zone record names a school the master lacks
  upstream_school_gap       the named school is confirmed missing from the source
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

from etl.audit_operational_backend import upstream_school_gaps
from etl.build_operational_masters import school_zone_label
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


# Most urgent first: a wrong or missing assignment misleads a parent, while a
# school with no zone record usually just has no apartments to assign.
PRIORITY = {
    "unassigned_apartment": 1,
    "named_zone_without_school": 2,
    "upstream_school_gap": 2,
    "review_required_unit": 3,
    "unmatched_zone_label": 4,
    "school_without_grade_data": 5,
    "school_without_zone": 6,
}

WHAT_TO_CHECK = {
    "unassigned_apartment": "Does this complex really sit outside every school zone, or is its coordinate wrong?",
    "named_zone_without_school": "Does the named school exist under another name, or is it new since the school snapshot?",
    "upstream_school_gap": "Nothing to judge yet: the school is confirmed absent from the school standard data, so it has no school_id and neither it nor its complexes can be published. Re-run once that source republishes and remove the entry from etl/upstream_school_gaps.json.",
    "review_required_unit": "Is the assignment the pipeline flagged correct?",
    "unmatched_zone_label": "Which schools does this label mean?",
    "school_without_grade_data": "Publish the school with empty grade figures, or hold it back?",
    "school_without_zone": "Expected for a school with no apartments nearby; confirm none are missing.",
}


def case(
    region: str,
    kind: str,
    subject: str,
    detail: str,
    evidence: str = "",
    address: str = "",
) -> dict[str, str]:
    return {
        "priority": PRIORITY.get(kind, 9),
        "region": region,
        "case_type": kind,
        "subject": subject,
        "detail": detail,
        "evidence": evidence,
        "what_to_check": WHAT_TO_CHECK.get(kind, ""),
        "map": f"https://map.naver.com/p/search/{address}" if address else "",
        "verdict": "",
        "note": "",
    }


def collect_region(
    region_name: str,
    zone_profiles: dict[str, Any],
    cities: tuple[str, ...] = (),
    group: tuple[str, ...] = (),
) -> list[dict[str, str]]:
    """Cases for one region, read from the scope it was actually built in.

    A wave can span several regions, because a joint zone across a border only
    resolves when its neighbours are in the same build. `group` names that scope
    so the sheet reads the same outputs the upload will, rather than a stale
    single-region build; rows are still attributed to their own region.
    """
    registry = load_registry()
    known_gaps = upstream_school_gaps()
    scopes = list(build_scopes(registry, list(group) or [region_name], cities))
    slug = scope_slug(scopes)
    suffix = "" if slug == "capital" else f"_{slug}"
    rows: list[dict[str, str]] = []

    units = load_json(OUTPUT_DIR / f"apartment_assignment_units_v1{suffix}.json") or []
    links = load_json(OUTPUT_DIR / f"apartment_assignment_schools_v1{suffix}.json") or []
    schools = load_json(OUTPUT_DIR / f"school_master_operational_v1{suffix}.json") or []
    if group:
        units = [row for row in units if row.get("region") == region_name]
        schools = [row for row in schools if row.get("region") == region_name]
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
                unit.get("road_address") or "",
            ))
        elif unit["apt_cd"] not in linked_apts:
            # A confirmed source gap is a different case from an unmatched label:
            # the label parsed and the school is simply not in the identity source,
            # so it stays on the sheet as work waiting on that source, not on us.
            gap = known_gaps.get(school_zone_label(unit.get("hakgudo_name")))
            rows.append(case(
                region_name,
                "upstream_school_gap" if gap else "named_zone_without_school",
                unit.get("apt_name") or unit["apt_cd"],
                unit.get("road_address") or "",
                f"zone={unit.get('hakgudo_name')}"
                + (f" missing={gap['school_name']} {gap['evidence']}" if gap else ""),
                unit.get("road_address") or "",
            ))
        if str(unit.get("review_required")).lower() in {"true", "1"}:
            rows.append(case(
                region_name, "review_required_unit",
                unit.get("apt_name") or unit["apt_cd"],
                unit.get("road_address") or "",
                f"reason={unit.get('review_reason') or ''} zone={unit.get('hakgudo_name') or ''}",
                unit.get("road_address") or "",
            ))

    for school in schools:
        if all(school.get(field) is None for field in GRADE_FIELDS):
            rows.append(case(
                region_name, "school_without_grade_data",
                school.get("school_name") or school.get("school_id"),
                school.get("road_address") or "",
                f"school_id={school.get('school_id')}",
                school.get("road_address") or "",
            ))

    # Zone-level cases are province-wide, so a city scope reports only its own
    # build cases and leaves zone coverage to the full-region pass.
    profile = {} if cities else zone_profiles.get(region_name, {})
    for label in profile.get("failures", []):
        rows.append(case(region_name, "unmatched_zone_label", label, "zone label did not segment", ""))
    for entry in profile.get("schools_without_zone", []):
        name, establishment = entry[0], entry[1]
        address = entry[2] if len(entry) > 2 else ""
        if establishment in {"사립", "국립"}:
            continue  # private and national-university schools have no 통학구역 by design
        rows.append(case(
            region_name, "school_without_zone", name, address,
            f"establishment={establishment}", address,
        ))
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("regions", nargs="+")
    parser.add_argument("--cities", nargs="*", default=(), help="restrict a single region to these cities")
    parser.add_argument(
        "--group",
        action="store_true",
        help="the regions were built as one scope; read that scope's outputs",
    )
    parser.add_argument("--zone-profile", type=Path, default=ZONE_PROFILE)
    parser.add_argument("--out", type=Path, default=OUTPUT_DIR / "review_cases.csv")
    args = parser.parse_args(argv)

    zone_data = load_json(args.zone_profile) or {}
    zone_profiles = {profile["region"]: profile for profile in zone_data.get("profiles", [])}
    missing_profiles = [name for name in args.regions if name not in zone_profiles]

    if args.cities and len(args.regions) != 1:
        parser.error("--cities applies to a single region")
    rows: list[dict[str, str]] = []
    group = tuple(args.regions) if args.group else ()
    for region_name in args.regions:
        rows.extend(collect_region(region_name, zone_profiles, tuple(args.cities), group))
    rows.sort(key=lambda row: (row["priority"], row["region"], row["subject"]))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "priority", "region", "case_type", "subject", "detail",
            "evidence", "what_to_check", "map", "verdict", "note",
        ])
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
