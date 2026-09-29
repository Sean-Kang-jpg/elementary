#!/usr/bin/env python3
"""Explain why a complex fell outside every school-zone polygon. Read-only.

`unassigned_point_nohit` says only that the representative point matched no
polygon. That is three different problems wearing one label: a point a few
metres past a boundary, a point in a gap between zones that surround it, and a
point genuinely outside the zone coverage. Only the third needs a person, so
measuring the distance to the nearest polygon is what turns a long review list
into a short one.

    python etl/measure_unassigned_points.py 경상남도 부산광역시
    python etl/measure_unassigned_points.py --all --out report.json

Distances are metres in EPSG:5186, the CRS the source polygons are published in.
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/measure_unassigned_points.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import shapefile
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
SHP = BASE_DIR / "data" / "hakgudo" / "20260320" / "extracted" / "초등학교통학구역.shp"
TO_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)

# A point this close to a boundary is nearer than a building is wide, so the
# coordinate is the likelier culprit than the polygon.
COORDINATE_ERROR_M = 30.0
# Zones this near mean the point sits among them rather than beyond them.
SURROUND_RADIUS_M = 300.0


def load_zones() -> tuple[STRtree, list[Any], list[str]]:
    reader = shapefile.Reader(str(SHP), encoding="euc_kr")
    fields = [field[0] for field in reader.fields[1:]]
    name_index = fields.index("HAKGUDO_NM")
    geometries, names = [], []
    for record in reader.iterShapeRecords():
        geometry = shape(record.shape.__geo_interface__)
        if not geometry.is_valid:
            geometry = geometry.buffer(0)
        geometries.append(geometry)
        names.append(record.record[name_index])
    return STRtree(geometries), geometries, names


def unassigned_units(regions: set[str] | None) -> list[dict[str, Any]]:
    seen, units = set(), []
    for path in sorted(glob.glob(str(OUTPUT_DIR / "apartment_assignment_units_v1_*.json"))):
        for unit in json.loads(Path(path).read_text(encoding="utf-8")):
            key = (unit.get("region"), unit.get("apt_cd"))
            if key in seen or unit.get("assignment_method") != "unassigned_point_nohit":
                continue
            if regions and unit.get("region") not in regions:
                continue
            if unit.get("latitude") is None or unit.get("longitude") is None:
                continue
            seen.add(key)
            units.append(unit)
    return units


def classify(distance_m: float, surrounding: int) -> str:
    if distance_m <= COORDINATE_ERROR_M:
        return "coordinate error"
    if surrounding >= 2:
        return "gap between zones"
    return "outside zone coverage"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("regions", nargs="*", help="registry region names; default is every built region")
    parser.add_argument("--all", action="store_true", help="explicitly measure every region")
    parser.add_argument("--out", type=Path, help="write the measurements as JSON")
    args = parser.parse_args(argv)

    regions = None if args.all or not args.regions else set(args.regions)
    units = unassigned_units(regions)
    if not units:
        print("no unassigned points in scope")
        return 0

    tree, geometries, names = load_zones()
    print(f"{len(geometries):,} zone polygons; {len(units)} unassigned points\n")

    rows = []
    for unit in sorted(units, key=lambda item: (item["region"], item["apt_name"] or "")):
        x, y = TO_5186.transform(float(unit["longitude"]), float(unit["latitude"]))
        point = Point(x, y)
        nearest = tree.query_nearest(point, all_matches=False)
        index = int(nearest if not hasattr(nearest, "__len__") else nearest[0])
        distance = point.distance(geometries[index])
        surrounding = sum(
            1 for j in tree.query(point.buffer(SURROUND_RADIUS_M))
            if geometries[j].distance(point) <= SURROUND_RADIUS_M
        )
        verdict = classify(distance, surrounding)
        rows.append({
            "region": unit["region"],
            "apt_name": unit["apt_name"],
            "apt_cd": unit["apt_cd"],
            "road_address": unit.get("road_address"),
            "latitude": unit["latitude"],
            "longitude": unit["longitude"],
            "boundary_m": round(distance, 1),
            "zones_within_300m": surrounding,
            "nearest_zone": names[index],
            "verdict": verdict,
        })
        print(f"{unit['region']:<10} {(unit['apt_name'] or '')[:26]:<26} "
              f"{distance:6.0f}m  zones {surrounding}  {verdict}  <- {names[index]}")

    counts: dict[str, int] = {}
    for row in rows:
        counts[row["verdict"]] = counts.get(row["verdict"], 0) + 1
    print("\n" + ", ".join(f"{name}: {count}" for name, count in sorted(counts.items())))
    inside = [row for row in rows if row["boundary_m"] == 0]
    print(f"points inside a polygon yet unassigned: {len(inside)}")

    if args.out:
        args.out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
