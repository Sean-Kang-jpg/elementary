#!/usr/bin/env python3
"""Profile one region's elementary schools before expanding the pipeline into it.

This is the school half of the per-region EDA gate. It reads the nationwide
school standard-data snapshot and reports, for the requested scope, what the
pipeline must handle: how many schools exist, how the education offices divide
them, whether school names carry a region prefix, how branch schools are
written, what the address shape is, and the measured coordinate bounds that
replace the registry's approximate envelope.

The school-zone half of the EDA needs the 학구도 source and is profiled
separately; this script reports whether that source is present.

Usage:
    python etl/profile_region_schools.py 대전광역시
    python etl/profile_region_schools.py 전라남도 --cities 목포시
    python etl/profile_region_schools.py 대전광역시 --compare 서울특별시 인천광역시
    python etl/profile_region_schools.py --all-regions --json runtime/region_eda/all.json
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from etl.region_registry import RegionScope, load_registry

ETL_DIR = Path(__file__).resolve().parent
DEFAULT_SOURCE = ETL_DIR / "data" / "schoolzone" / "school_location_20260320.csv"
HAKGUDO_DIR = ETL_DIR / "data" / "hakgudo"
ELEMENTARY = "초등학교"


def load_schools(source: Path) -> list[dict[str, str]]:
    with source.open(encoding="utf-8-sig", newline="") as handle:
        return [row for row in csv.DictReader(handle) if row.get("학교급구분") == ELEMENTARY]


def school_address(row: dict[str, str]) -> str:
    return row.get("소재지도로명주소") or row.get("소재지지번주소") or ""


def scope_rows(rows: Iterable[dict[str, str]], scope: RegionScope) -> list[dict[str, str]]:
    return [row for row in rows if scope.includes_address(school_address(row))]


def address_levels(address: str, scope: RegionScope) -> list[str]:
    parts = address.split()
    return parts[1:3] if scope.region.has_city_level else parts[1:2]


def profile_scope(rows: list[dict[str, str]], scope: RegionScope) -> dict[str, Any]:
    region = scope.region
    selected = scope_rows(rows, scope)
    if not selected:
        return {"scope": scope.label, "school_count": 0, "warnings": ["no schools matched this scope"]}

    prefix = region.school_name_prefix or region.short_name
    prefixed = [row for row in selected if row["학교명"].startswith(prefix)]
    unprefixed = sorted(row["학교명"] for row in selected if not row["학교명"].startswith(prefix))
    branches = sorted(
        row["학교명"] for row in selected if row.get("본교분교구분") and row["본교분교구분"] != "본교"
    )

    latitudes = [float(row["위도"]) for row in selected if row.get("위도")]
    longitudes = [float(row["경도"]) for row in selected if row.get("경도")]
    missing_coordinates = sorted(
        row["학교명"] for row in selected if not row.get("위도") or not row.get("경도")
    )

    districts = Counter()
    for row in selected:
        levels = address_levels(school_address(row), scope)
        if levels:
            districts[" ".join(levels)] += 1

    profile: dict[str, Any] = {
        "scope": scope.label,
        "registry": {
            "canonical_name": region.canonical_name,
            "neis_office_code": region.neis_office_code,
            "legal_dong_code": region.legal_dong_code,
            "has_city_level": region.has_city_level,
            "bounds_source": region.bounds_source,
            "declared_school_name_prefix": region.school_name_prefix,
            "declared_prefix_coverage_pct": region.school_name_prefix_coverage_pct,
        },
        "school_count": len(selected),
        "operation_status": dict(Counter(row.get("운영상태", "") for row in selected)),
        "campus_type": dict(Counter(row.get("본교분교구분", "") for row in selected)),
        "establishment_type": dict(Counter(row.get("설립형태", "") for row in selected)),
        "education_offices": dict(Counter(row.get("시도교육청명", "") for row in selected)),
        "education_support_offices": dict(Counter(row.get("교육지원청명", "") for row in selected)),
        "administrative_levels": dict(districts.most_common()),
        "school_name_prefix": {
            "candidate": prefix,
            "matched": len(prefixed),
            "coverage_pct": round(100 * len(prefixed) / len(selected), 1),
            "unprefixed_examples": unprefixed[:20],
            "unprefixed_total": len(unprefixed),
        },
        "branch_schools": {"count": len(branches), "names": branches},
        "measured_bounds": {
            "min_lat": round(min(latitudes), 4) if latitudes else None,
            "max_lat": round(max(latitudes), 4) if latitudes else None,
            "min_lng": round(min(longitudes), 4) if longitudes else None,
            "max_lng": round(max(longitudes), 4) if longitudes else None,
        },
        "missing_coordinates": missing_coordinates,
        "warnings": [],
    }

    warnings = profile["warnings"]
    coverage = profile["school_name_prefix"]["coverage_pct"]
    if 0 < coverage < 100:
        warnings.append(
            f"school-name prefix {prefix!r} covers only {coverage}% of schools; "
            "matching must treat it as an optional variant, never as a guaranteed prefix"
        )
    if coverage == 0:
        warnings.append(f"no school name starts with {prefix!r}; the region has no name prefix")
    if missing_coordinates:
        warnings.append(f"{len(missing_coordinates)} schools have no coordinates")
    if latitudes and not region.bounds.contains(min(latitudes), min(longitudes)):
        warnings.append("measured bounds fall outside the registry envelope; update the registry")
    if latitudes and not region.bounds.contains(max(latitudes), max(longitudes)):
        warnings.append("measured bounds fall outside the registry envelope; update the registry")
    if len(profile["education_support_offices"]) > 1:
        warnings.append(
            f"{len(profile['education_support_offices'])} education support offices in this scope; "
            "school-zone records may be organized differently by office"
        )
    return profile


def hakgudo_status() -> dict[str, Any]:
    if not HAKGUDO_DIR.exists():
        return {"available": False, "detail": f"missing directory {HAKGUDO_DIR}"}
    shapefiles = sorted(str(path.relative_to(ETL_DIR)) for path in HAKGUDO_DIR.rglob("*.shp"))
    return {
        "available": bool(shapefiles),
        "shapefiles": shapefiles,
        "detail": "school-zone polygons are a local artifact and are not committed",
    }


def render(profile: dict[str, Any]) -> str:
    if not profile.get("school_count"):
        return f"[{profile['scope']}] no schools matched"
    lines = [
        f"[{profile['scope']}] elementary schools: {profile['school_count']}",
        f"  education offices        : {profile['education_offices']}",
        f"  education support offices: {profile['education_support_offices']}",
        f"  administrative levels    : {profile['administrative_levels']}",
        f"  campus type              : {profile['campus_type']}",
        "  name prefix {candidate!r}: {matched}/{total} ({coverage}%)".format(
            candidate=profile["school_name_prefix"]["candidate"],
            matched=profile["school_name_prefix"]["matched"],
            total=profile["school_count"],
            coverage=profile["school_name_prefix"]["coverage_pct"],
        ),
        f"  branch schools           : {profile['branch_schools']['count']}",
        f"  measured bounds          : {profile['measured_bounds']}",
    ]
    for warning in profile["warnings"]:
        lines.append(f"  WARNING: {warning}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("region", nargs="?", help="canonical name, short name, or alias")
    parser.add_argument("--cities", nargs="*", default=(), help="restrict to these cities inside the region")
    parser.add_argument("--compare", nargs="*", default=(), help="also profile these regions for contrast")
    parser.add_argument("--all-regions", action="store_true", help="profile every registry region")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--json", type=Path, help="write the full profile to this path")
    args = parser.parse_args(argv)

    if not args.region and not args.all_regions:
        parser.error("give a region or --all-regions")
    if not args.source.exists():
        parser.error(f"school source not found: {args.source}")

    registry = load_registry()
    rows = load_schools(args.source)

    scopes: list[RegionScope] = []
    if args.all_regions:
        scopes.extend(registry.scope(region.canonical_name) for region in registry)
    else:
        scopes.append(registry.scope(args.region, args.cities))
        scopes.extend(registry.scope(name) for name in args.compare)

    profiles = [profile_scope(rows, scope) for scope in scopes]
    payload = {
        "source": str(args.source.relative_to(ETL_DIR)) if args.source.is_relative_to(ETL_DIR) else str(args.source),
        "source_rows_elementary_nationwide": len(rows),
        "registry_version": registry.registry_version,
        "school_zone_source": hakgudo_status(),
        "profiles": profiles,
    }

    print(f"source: {payload['source']} ({len(rows)} nationwide elementary schools)")
    for profile in profiles:
        print(render(profile))
    zone = payload["school_zone_source"]
    print(f"school-zone polygons available: {zone['available']} ({zone['detail']})")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
