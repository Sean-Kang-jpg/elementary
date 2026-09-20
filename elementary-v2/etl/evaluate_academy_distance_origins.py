"""Compare apartment centroid and building-centroid academy proximity results."""

from __future__ import annotations

import argparse
import ast
import csv
import json
import math
from collections import defaultdict
from pathlib import Path


BASE = Path(__file__).resolve().parent
DEFAULT_COMPLEXES = BASE / "local_outputs_20260320" / "apartment_complex_master_v1.csv"
DEFAULT_DONGS = (
    BASE.parents[2]
    / "archive"
    / "elementary-v2-pre-operational-20260828"
    / "etl"
    / "local_outputs"
    / "building_refined_dongs.csv"
)
DEFAULT_ACADEMIES = BASE / "runtime" / "academy" / "academy_address_markers_20260916.csv"
DEFAULT_ADDITIONAL_DONGS = BASE / "runtime" / "apartment_buildings" / "trusted_large_complex_buildings.csv"
DEFAULT_REPORT = BASE / "academy_distance_origin_evaluation.json"
DEFAULT_SAMPLES = BASE / "academy_distance_origin_samples.csv"

EARTH_RADIUS_M = 6_371_008.8
GRID_DEGREES = 0.01


def number(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = p2 - p1
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def grid_key(lat: float, lon: float) -> tuple[int, int]:
    return int(math.floor(lat / GRID_DEGREES)), int(math.floor(lon / GRID_DEGREES))


def nearby_candidates(index, lat: float, lon: float, radius_m: float):
    lat_cells = math.ceil((radius_m / 110_574) / GRID_DEGREES)
    lon_scale = max(111_320 * math.cos(math.radians(lat)), 1)
    lon_cells = math.ceil((radius_m / lon_scale) / GRID_DEGREES)
    row, col = grid_key(lat, lon)
    for dr in range(-lat_cells, lat_cells + 1):
        for dc in range(-lon_cells, lon_cells + 1):
            yield from index.get((row + dr, col + dc), ())


def addresses_within(index, points, radius_m: float) -> dict[str, tuple[float, int]]:
    matches: dict[str, tuple[float, int]] = {}
    for lat, lon in points:
        for academy in nearby_candidates(index, lat, lon, radius_m):
            distance = haversine_m(lat, lon, academy["latitude"], academy["longitude"])
            if distance > radius_m:
                continue
            previous = matches.get(academy["address_id"])
            if previous is None or distance < previous[0]:
                matches[academy["address_id"]] = (distance, academy["academy_count"])
    return matches


def load_complexes(path: Path):
    complexes = {}
    apt_to_complex = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            lat, lon = number(row.get("latitude")), number(row.get("longitude"))
            if lat is None or lon is None:
                continue
            complex_id = row["canonical_complex_id"]
            complexes[complex_id] = {**row, "latitude": lat, "longitude": lon}
            raw_components = row.get("component_apt_ids") or "[]"
            try:
                components = ast.literal_eval(raw_components)
            except (SyntaxError, ValueError):
                components = []
            for apt_cd in components:
                apt_to_complex[str(apt_cd)] = complex_id
    return complexes, apt_to_complex


def load_dongs(path: Path, apt_to_complex):
    by_complex = defaultdict(list)
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            complex_id = apt_to_complex.get(row.get("apt_cd", ""))
            lat, lon = number(row.get("latitude")), number(row.get("longitude"))
            if complex_id and lat is not None and lon is not None:
                by_complex[complex_id].append((lat, lon, row.get("dong_name", "")))
    return by_complex


def load_additional_dongs(path: Path):
    by_complex = defaultdict(list)
    if not path.exists():
        return by_complex
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            lat, lon = number(row.get("latitude")), number(row.get("longitude"))
            if lat is not None and lon is not None:
                by_complex[row["canonical_complex_id"]].append((lat, lon, row.get("dong_name", "")))
    return by_complex


def load_academies(path: Path):
    index = defaultdict(list)
    count = 0
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            lat, lon = number(row.get("latitude")), number(row.get("longitude"))
            if row.get("geocode_status") != "matched" or lat is None or lon is None:
                continue
            academy = {
                "address_id": row["address_id"],
                "latitude": lat,
                "longitude": lon,
                "academy_count": int(row.get("academy_count") or 0),
            }
            index[grid_key(lat, lon)].append(academy)
            count += 1
    return index, count


def percentile(values, fraction: float):
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    low = math.floor(position)
    high = math.ceil(position)
    if low == high:
        return round(ordered[low], 1)
    return round(ordered[low] + (ordered[high] - ordered[low]) * (position - low), 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--complexes", type=Path, default=DEFAULT_COMPLEXES)
    parser.add_argument("--dongs", type=Path, default=DEFAULT_DONGS)
    parser.add_argument("--academies", type=Path, default=DEFAULT_ACADEMIES)
    parser.add_argument("--additional-dongs", type=Path, default=DEFAULT_ADDITIONAL_DONGS)
    parser.add_argument("--min-households", type=int, default=0)
    parser.add_argument("--radius-m", type=float, default=600)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES)
    args = parser.parse_args()

    complexes, apt_to_complex = load_complexes(args.complexes)
    dongs_by_complex = load_dongs(args.dongs, apt_to_complex)
    for complex_id, points in load_additional_dongs(args.additional_dongs).items():
        dongs_by_complex[complex_id].extend(points)
    academy_index, academy_address_count = load_academies(args.academies)

    rows = []
    for complex_id, dongs in dongs_by_complex.items():
        complex_row = complexes.get(complex_id)
        if not complex_row:
            continue
        if int(number(complex_row.get("households")) or 0) < args.min_households:
            continue
        centroid = [(complex_row["latitude"], complex_row["longitude"])]
        dong_points = [(lat, lon) for lat, lon, _ in dongs]
        centroid_hits = addresses_within(academy_index, centroid, args.radius_m)
        dong_hits = addresses_within(academy_index, dong_points, args.radius_m)
        added = set(dong_hits) - set(centroid_hits)
        removed = set(centroid_hits) - set(dong_hits)
        official_building_count = int(number(complex_row.get("building_count")) or 0)
        building_count_ratio = len(dongs) / official_building_count if official_building_count else None
        trusted_building_match = (
            building_count_ratio is not None and 0.75 <= building_count_ratio <= 1.25
        )
        rows.append(
            {
                "canonical_complex_id": complex_id,
                "complex_name": complex_row["complex_name"],
                "region": complex_row["region"],
                "district": complex_row.get("district", ""),
                "households": complex_row.get("households", ""),
                "official_building_count": official_building_count,
                "dong_count": len(dongs),
                "building_count_ratio": round(building_count_ratio, 3) if building_count_ratio else "",
                "trusted_building_match": trusted_building_match,
                "centroid_address_count": len(centroid_hits),
                "dong_address_count": len(dong_hits),
                "added_address_count": len(added),
                "removed_address_count": len(removed),
                "net_address_change": len(dong_hits) - len(centroid_hits),
                "centroid_academy_count": sum(value[1] for value in centroid_hits.values()),
                "dong_academy_count": sum(value[1] for value in dong_hits.values()),
                "added_academy_count": sum(dong_hits[key][1] for key in added),
            }
        )

    changed = [row for row in rows if row["added_address_count"] or row["removed_address_count"]]
    trusted = [row for row in rows if row["trusted_building_match"]]
    trusted_changed = [
        row for row in trusted if row["added_address_count"] or row["removed_address_count"]
    ]
    net_changes = [row["net_address_change"] for row in rows]
    report = {
        "parameters": {
            "radius_m": args.radius_m,
            "centroid_method": "canonical complex representative point",
            "comparison_method": "union of academy addresses within radius of any matched building centroid",
            "distance_metric": "haversine straight-line distance",
        },
        "inputs": {
            "complexes_with_building_points": len(rows),
            "building_points": sum(row["dong_count"] for row in rows),
            "matched_academy_addresses": academy_address_count,
        },
        "results": {
            "complexes_with_changed_address_set": len(changed),
            "changed_complex_share_pct": round(len(changed) / len(rows) * 100, 2) if rows else 0,
            "complexes_with_net_increase": sum(row["net_address_change"] > 0 for row in rows),
            "complexes_with_net_decrease": sum(row["net_address_change"] < 0 for row in rows),
            "complexes_with_same_count_but_changed_set": sum(
                row["net_address_change"] == 0 and (row["added_address_count"] or row["removed_address_count"])
                for row in rows
            ),
            "centroid_address_links": sum(row["centroid_address_count"] for row in rows),
            "building_address_links": sum(row["dong_address_count"] for row in rows),
            "added_address_links": sum(row["added_address_count"] for row in rows),
            "removed_address_links": sum(row["removed_address_count"] for row in rows),
            "net_address_links": sum(net_changes),
            "net_change_per_complex_p50": percentile(net_changes, 0.5),
            "net_change_per_complex_p90": percentile(net_changes, 0.9),
            "net_change_per_complex_p95": percentile(net_changes, 0.95),
            "additional_academy_records": sum(row["added_academy_count"] for row in rows),
            "trusted_building_match_complexes": len(trusted),
            "trusted_changed_complexes": len(trusted_changed),
            "trusted_changed_complex_share_pct": round(
                len(trusted_changed) / len(trusted) * 100, 2
            ) if trusted else 0,
            "trusted_centroid_address_links": sum(row["centroid_address_count"] for row in trusted),
            "trusted_building_address_links": sum(row["dong_address_count"] for row in trusted),
            "trusted_net_address_links": sum(row["net_address_change"] for row in trusted),
            "trusted_additional_academy_records": sum(row["added_academy_count"] for row in trusted),
        },
        "limitations": [
            "Building points exist only for the previous large-complex and school-zone-boundary candidate cohort.",
            "Building centroids are not apartment entrances or pedestrian-network distances.",
            "The comparison uses address-level academy markers and deduplicates each address per complex.",
            "Trusted building matches require the matched-point count to be 75%-125% of the official building count.",
        ],
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    rows.sort(key=lambda row: (row["added_address_count"], row["added_academy_count"]), reverse=True)
    with args.samples.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows[:100])

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
