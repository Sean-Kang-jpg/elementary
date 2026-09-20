"""Build private apartment-academy links and privacy-minimized serving candidates."""

from __future__ import annotations

import argparse
import ast
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

from evaluate_academy_distance_origins import (
    addresses_within,
    grid_key,
    load_academies,
    load_additional_dongs,
    load_complexes,
    load_dongs,
    number,
    percentile,
)


BASE = Path(__file__).resolve().parent
RUNTIME = BASE / "runtime" / "academy"
COMPLEXES = BASE / "local_outputs_20260320" / "apartment_complex_master_v1.csv"
PRIOR_DONGS = (
    BASE.parents[2]
    / "archive"
    / "elementary-v2-pre-operational-20260828"
    / "etl"
    / "local_outputs"
    / "building_refined_dongs.csv"
)
NEW_DONGS = BASE / "runtime" / "apartment_buildings" / "trusted_large_complex_buildings.csv"
ACADEMIES = RUNTIME / "academy_address_markers_20260916.csv"
PROFILE = BASE / "academy_proximity_profile.json"
PIPELINE_VERSION = "academy-proximity-v1"


def parse_json_field(value: str):
    try:
        return json.loads(value) if value else {}
    except json.JSONDecodeError:
        return {}


def load_academy_rows(path: Path):
    rows = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get("geocode_status") != "matched":
                continue
            rows[row["address_id"]] = row
    return rows


def trusted_origins(complexes, apt_to_complex):
    origins = {}
    prior = load_dongs(PRIOR_DONGS, apt_to_complex)
    additional = load_additional_dongs(NEW_DONGS)
    for complex_id, complex_row in complexes.items():
        households = int(number(complex_row.get("households")) or 0)
        official = int(number(complex_row.get("building_count")) or 0)
        points = additional.get(complex_id) or prior.get(complex_id) or []
        ratio = len(points) / official if official else None
        if households >= 500 and ratio is not None and 0.75 <= ratio <= 1.25:
            origins[complex_id] = {
                "type": "nearest_building_centroid",
                "points": [(lat, lon) for lat, lon, _ in points],
                "building_names": [name for _, _, name in points],
            }
        else:
            origins[complex_id] = {
                "type": "complex_centroid",
                "points": [(complex_row["latitude"], complex_row["longitude"])],
                "building_names": [""],
            }
    return origins


def write_csv(path: Path, fieldnames, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", default=date.today().isoformat())
    parser.add_argument("--core-radius-m", type=float, default=600)
    parser.add_argument("--maximum-radius-m", type=float, default=800)
    args = parser.parse_args()
    if args.core_radius_m <= 0 or args.maximum_radius_m <= args.core_radius_m:
        raise SystemExit("radius contract must satisfy 0 < core < maximum")

    complexes, apt_to_complex = load_complexes(COMPLEXES)
    origins = trusted_origins(complexes, apt_to_complex)
    academy_index, academy_count = load_academies(ACADEMIES)
    academy_rows = load_academy_rows(ACADEMIES)
    links = []
    linked_address_ids = set()

    for complex_id, complex_row in complexes.items():
        origin = origins[complex_id]
        hits = addresses_within(academy_index, origin["points"], args.maximum_radius_m)
        for address_id, (distance, institution_count) in hits.items():
            rounded_distance = int(round(distance))
            links.append({
                "canonical_complex_id": complex_id,
                "address_id": address_id,
                "straight_distance_m": rounded_distance,
                "distance_band": "core" if rounded_distance <= args.core_radius_m else "extended",
                "distance_origin_type": origin["type"],
                "institution_count": institution_count,
                "pipeline_version": PIPELINE_VERSION,
            })
            linked_address_ids.add(address_id)

    links.sort(key=lambda row: (row["canonical_complex_id"], row["straight_distance_m"], row["address_id"]))
    links_by_complex = defaultdict(list)
    for row in links:
        links_by_complex[row["canonical_complex_id"]].append(row)
    serving = []
    for address_id in sorted(linked_address_ids):
        row = academy_rows[address_id]
        serving.append({
            "address_id": address_id,
            "region": row["region"], "district": row["district"],
            "longitude": row["longitude"], "latitude": row["latitude"],
            "institution_count": row["academy_count"],
            "institution_type_counts": json.dumps(parse_json_field(row["institution_type_counts"]), ensure_ascii=False, sort_keys=True),
            "realm_counts": json.dumps(parse_json_field(row["realm_counts"]), ensure_ascii=False, sort_keys=True),
            "top_subjects": row["top_subjects"],
            "source_as_of": "2026-09-16",
            "pipeline_version": PIPELINE_VERSION,
        })

    link_path = RUNTIME / f"apartment_academy_proximity_{args.as_of.replace('-', '')}.csv"
    serving_path = RUNTIME / f"academy_address_serving_{args.as_of.replace('-', '')}.csv"
    origin_path = RUNTIME / f"apartment_academy_origins_{args.as_of.replace('-', '')}.csv"
    summary_path = RUNTIME / f"apartment_academy_summary_{args.as_of.replace('-', '')}.csv"
    write_csv(link_path, (
        "canonical_complex_id", "address_id", "straight_distance_m", "distance_band",
        "distance_origin_type", "institution_count", "pipeline_version",
    ), links)
    write_csv(serving_path, (
        "address_id", "region", "district", "longitude", "latitude", "institution_count",
        "institution_type_counts", "realm_counts", "top_subjects", "source_as_of", "pipeline_version",
    ), serving)
    origin_rows = []
    summary_rows = []
    for complex_id, complex_row in complexes.items():
        origin = origins[complex_id]
        for sequence, (lat, lon) in enumerate(origin["points"], start=1):
            origin_rows.append({
                "canonical_complex_id": complex_id, "origin_sequence": sequence,
                "latitude": lat, "longitude": lon, "distance_origin_type": origin["type"],
                "pipeline_version": PIPELINE_VERSION,
            })
        complex_links = links_by_complex.get(complex_id, [])
        summary_rows.append({
            "canonical_complex_id": complex_id,
            "core_address_count": sum(row["distance_band"] == "core" for row in complex_links),
            "extended_address_count": sum(row["distance_band"] == "extended" for row in complex_links),
            "core_institution_count": sum(row["institution_count"] for row in complex_links if row["distance_band"] == "core"),
            "extended_institution_count": sum(row["institution_count"] for row in complex_links if row["distance_band"] == "extended"),
            "distance_origin_type": origin["type"],
            "pipeline_version": PIPELINE_VERSION,
        })
    write_csv(origin_path, (
        "canonical_complex_id", "origin_sequence", "latitude", "longitude",
        "distance_origin_type", "pipeline_version",
    ), origin_rows)
    write_csv(summary_path, (
        "canonical_complex_id", "core_address_count", "extended_address_count",
        "core_institution_count", "extended_institution_count", "distance_origin_type",
        "pipeline_version",
    ), summary_rows)

    pairs = {(row["canonical_complex_id"], row["address_id"]) for row in links}
    if len(pairs) != len(links):
        raise RuntimeError("duplicate apartment-address pairs")
    if any(row["straight_distance_m"] > args.maximum_radius_m for row in links):
        raise RuntimeError("distance exceeds maximum radius")
    if any((row["straight_distance_m"] <= args.core_radius_m) != (row["distance_band"] == "core") for row in links):
        raise RuntimeError("distance band invariant failed")

    large = [row for row in complexes.values() if int(number(row.get("households")) or 0) >= 500]
    trusted_large = sum(origins[row["canonical_complex_id"]]["type"] == "nearest_building_centroid" for row in large)
    profile = {
        "contract": {
            "core_radius_m": args.core_radius_m,
            "extended_maximum_m": args.maximum_radius_m,
            "large_complex_households": 500,
            "distance_metric": "straight-line haversine",
        },
        "inputs": {
            "complexes": len(complexes), "large_complexes": len(large),
            "trusted_large_complexes": trusted_large,
            "matched_academy_addresses": academy_count,
        },
        "outputs": {
            "linked_academy_addresses": len(serving),
            "apartment_address_links": len(links),
            "core_links": sum(row["distance_band"] == "core" for row in links),
            "extended_links": sum(row["distance_band"] == "extended" for row in links),
            "building_origin_links": sum(row["distance_origin_type"] == "nearest_building_centroid" for row in links),
            "centroid_origin_links": sum(row["distance_origin_type"] == "complex_centroid" for row in links),
            "origin_points": len(origin_rows),
            "apartment_summaries": len(summary_rows),
            "links_per_complex_p50": percentile([len(value) for value in links_by_complex.values()], 0.5),
            "links_per_complex_p90": percentile([len(value) for value in links_by_complex.values()], 0.9),
            "links_per_complex_p95": percentile([len(value) for value in links_by_complex.values()], 0.95),
            "links_per_complex_max": max((len(value) for value in links_by_complex.values()), default=0),
        },
        "privacy": {
            "public_candidate_excludes_road_address": True,
            "public_candidate_excludes_institution_names": True,
            "raw_source_remains_private": True,
        },
        "serving_strategy": {
            "materialize_all_links_in_postgres": False,
            "reason": "The full candidate has over one million links; use indexed origin points plus an on-demand RPC.",
        },
        "private_outputs": [
            str(link_path.relative_to(BASE)), str(serving_path.relative_to(BASE)),
            str(origin_path.relative_to(BASE)), str(summary_path.relative_to(BASE)),
        ],
        "pipeline_version": PIPELINE_VERSION,
    }
    PROFILE.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(profile, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
