#!/usr/bin/env python3
"""Build the stratified manual-QA sample a wave needs before upload.

The release gate asks for at least 50 apartments per metropolitan region and 30
per city or county scope, covering urban core, suburban edge, new town, shared
zone, and no-hit cases, with zero wrong-school assignments.

This draws that sample deterministically from a scope's built outputs and writes
a review sheet with the evidence a human needs: the assigned school or schools,
the school-zone record the match came from, how far the complex sits from the
zone boundary, and a map link.

    python etl/build_review_sample.py 대전광역시
    python etl/build_review_sample.py 전라남도 --cities 목포시 --size 30
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/build_review_sample.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl.fetch_schoolinfo_2026 import build_scopes, scope_slug
from etl.region_registry import load_registry

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
# Any complex within this distance of its zone boundary is worth a manual look.
BOUNDARY_NEAR_M = 150.0


def load_json(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def district_of(address: str) -> str:
    parts = str(address or "").split()
    return parts[1] if len(parts) > 1 else ""


def stratify(unit: dict[str, Any], point: dict[str, str], link_count: int, new_town: set[str]) -> str:
    """One label per complex, most review-worthy first."""
    if link_count > 1:
        return "shared_zone"
    if not unit.get("school_id") and link_count == 0:
        return "no_hit"
    if str(point.get("needs_building_check", "")).lower() in {"true", "1", "yes"}:
        return "building_check"
    distance = number(point.get("boundary_distance_m"))
    if distance is not None and distance <= BOUNDARY_NEAR_M:
        return "boundary_near"
    district = district_of(unit.get("road_address"))
    if district in new_town:
        return "new_town"
    return "urban_core" if district in {"중구", "동구"} else "suburban_edge"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("regions", nargs="+", help="registry region names")
    parser.add_argument("--cities", nargs="*", default=())
    parser.add_argument("--size", type=int, default=50, help="sample size; 50 for a metropolitan region")
    parser.add_argument("--new-town-districts", nargs="*", default=("유성구",))
    parser.add_argument("--seed", type=int, default=20260922, help="fixed so the sample is reproducible")
    parser.add_argument("--out-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args(argv)

    registry = load_registry()
    scopes = list(build_scopes(registry, args.regions, args.cities))
    slug = scope_slug(scopes)
    suffix = "" if slug == "capital" else f"_{slug}"

    units = load_json(args.out_dir / f"apartment_assignment_units_v1{suffix}.json")
    links = load_json(args.out_dir / f"apartment_assignment_schools_v1{suffix}.json")
    schools = {row["school_id"]: row for row in load_json(args.out_dir / f"school_master_operational_v1{suffix}.json")}
    complexes = {row["canonical_complex_id"]: row for row in load_json(args.out_dir / f"apartment_complex_master_v1{suffix}.json")}
    points = {row["apt_cd"]: row for row in load_csv(args.out_dir / f"apartment_point_assignments{suffix}.csv")}

    links_by_apt: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for link in links:
        links_by_apt[link["apt_cd"]].append(link)

    new_town = set(args.new_town_districts)
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for unit in units:
        point = points.get(unit["apt_cd"], {})
        unit_links = sorted(links_by_apt.get(unit["apt_cd"], []), key=lambda row: row.get("assignment_rank") or 0)
        buckets[stratify(unit, point, len(unit_links), new_town)].append((unit, point, unit_links))

    rng = random.Random(args.seed)
    order = ["shared_zone", "boundary_near", "building_check", "no_hit", "new_town", "urban_core", "suburban_edge"]
    present = [name for name in order if buckets.get(name)]
    per_bucket = max(1, args.size // max(len(present), 1))
    selected: list[tuple[dict[str, Any], dict[str, str], list[dict[str, Any]]]] = []
    for name in present:
        rows = sorted(buckets[name], key=lambda item: item[0]["apt_cd"])
        selected.extend(rng.sample(rows, min(per_bucket, len(rows))))
    # Top up from the largest remaining pools so the sample reaches its size.
    remaining = [item for name in present for item in buckets[name] if item not in selected]
    rng.shuffle(remaining)
    selected.extend(remaining[: max(0, args.size - len(selected))])

    sheet: list[dict[str, Any]] = []
    for unit, point, unit_links in selected:
        complex_row = complexes.get(unit.get("canonical_complex_id"), {})
        school_names = [schools.get(link["school_id"], {}).get("school_name", link["school_id"]) for link in unit_links]
        latitude, longitude = unit.get("latitude"), unit.get("longitude")
        sheet.append({
            "stratum": stratify(unit, point, len(unit_links), new_town),
            "apt_cd": unit["apt_cd"],
            "complex_name": complex_row.get("complex_name") or unit.get("apt_name"),
            "road_address": unit.get("road_address"),
            "households": complex_row.get("households"),
            "assigned_schools": " | ".join(school_names),
            "school_count": len(unit_links),
            "school_zone_record": unit.get("hakgudo_name"),
            "boundary_distance_m": point.get("boundary_distance_m"),
            "needs_building_check": point.get("needs_building_check"),
            "confidence": unit.get("confidence"),
            "map": f"https://map.naver.com/p/search/{unit.get('road_address') or ''}" if unit.get("road_address") else "",
            "latitude": latitude,
            "longitude": longitude,
            "verdict": "",
            "note": "",
        })
    sheet.sort(key=lambda row: (row["stratum"], row["complex_name"] or ""))

    out_path = args.out_dir / f"manual_qa_sample{suffix}.csv"
    with out_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(sheet[0]))
        writer.writeheader()
        writer.writerows(sheet)

    counts: dict[str, int] = defaultdict(int)
    for row in sheet:
        counts[row["stratum"]] += 1
    print(f"scope: {', '.join(scope.label for scope in scopes)} (slug {slug})")
    print(f"complexes in scope: {len(units):,}; sample: {len(sheet)} (seed {args.seed})")
    for name in order:
        available = len(buckets.get(name, []))
        print(f"  {name:<16} sampled {counts.get(name, 0):>3}  of {available:>5} in scope")
    print(f"\nwrote {out_path}")
    print("Fill the verdict column with ok or wrong. The gate requires zero wrong.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
