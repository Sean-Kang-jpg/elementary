#!/usr/bin/env python3
"""Diagnose coordinate-first VWorld building matches for representative P1 cases."""

import argparse
import csv
import json
import statistics
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from refine_building_assignments_vworld import (
    building_group_name,
    distance_from_apartment_m,
    extract_dong_name,
    fetch_buildings,
    KEY,
    normalize_name,
    parse_road,
    to_5186,
)
from shapely.geometry import Point
from shapely.geometry import shape
from verify_p1_schoolzone_browser import query_schoolzone

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = Path(__file__).parent
DEFAULT_INPUT = BASE / "local_outputs_20260320" / "p1_parser_v2_assignments.csv"
DEFAULT_OUT_DIR = BASE / "local_outputs_20260320"
SAMPLE_IDS = [
    "APT2826030000700448000001",  # 대림e-편한세상(검단2지구 66BL 1L)
    "APT1165031210170032000001",  # 반포주공1단지3주구
    "APT1129041213510052000001",  # 한신한진
    "APT2823731540310097000001",  # e편한세상부평그랑힐스
    "APT4111131760110211000001",  # 동신2단지
]


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path, rows, fields):
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def name_similarity(left, right):
    left_norm = normalize_name(left)
    right_norm = normalize_name(right)
    if not left_norm or not right_norm:
        return 0.0
    if left_norm == right_norm:
        return 1.0
    if min(len(left_norm), len(right_norm)) >= 4 and (
        left_norm in right_norm or right_norm in left_norm
    ):
        return 0.9
    return SequenceMatcher(None, left_norm, right_norm).ratio()


def geocode_road_address(address):
    query = urllib.parse.urlencode(
        {
            "service": "address",
            "request": "getcoord",
            "version": "2.0",
            "crs": "EPSG:4326",
            "address": address,
            "refine": "true",
            "simple": "false",
            "format": "json",
            "type": "road",
            "key": KEY,
        }
    )
    with urllib.request.urlopen(f"https://api.vworld.kr/req/address?{query}", timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    point = payload.get("response", {}).get("result", {}).get("point")
    if not point:
        return None
    return float(point["x"]), float(point["y"])


def point_distance_m(left_lon, left_lat, right_lon, right_lat):
    left = Point(*to_5186.transform(left_lon, left_lat))
    right = Point(*to_5186.transform(right_lon, right_lat))
    return round(left.distance(right), 1)


def recommendation(group):
    coverage = group["coverage_ratio"]
    if group["road_number_exact_count"] and (coverage >= 0.8 or not group["expected_count"]):
        return "strong_road_candidate"
    if (
        group["candidate_type"] == "road_cluster"
        and group["road_name_match_count"] == group["unique_dong_count"]
        and coverage >= 0.9
        and group["name_similarity"] >= 0.65
        and group["min_distance_m"] <= group["adaptive_radius_m"]
    ):
        return "strong_road_cluster_candidate"
    if (
        group["name_similarity"] >= 0.75
        and group["min_distance_m"] <= group["adaptive_radius_m"]
        and (coverage >= 0.8 or not group["expected_count"])
    ):
        return "strong_spatial_name_candidate"
    if group["min_distance_m"] <= group["adaptive_radius_m"]:
        return "nearby_review_candidate"
    return "reject_far_candidate"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--deg", type=float, default=0.006)
    parser.add_argument("--sleep", type=float, default=0.3)
    parser.add_argument("--sample-ids", default=",".join(SAMPLE_IDS))
    parser.add_argument("--query-official", action="store_true")
    args = parser.parse_args()

    selected_ids = {value.strip() for value in args.sample_ids.split(",") if value.strip()}
    apartments = [row for row in read_csv(args.input) if row.get("apt_cd") in selected_ids]
    apartments.sort(key=lambda row: SAMPLE_IDS.index(row["apt_cd"]) if row["apt_cd"] in SAMPLE_IDS else 999)
    missing = selected_ids - {row["apt_cd"] for row in apartments}
    if missing:
        raise SystemExit(f"Input rows not found: {', '.join(sorted(missing))}")

    summary_rows = []
    group_rows = []
    dong_rows = []
    official_rows = []

    for index, apt in enumerate(apartments, start=1):
        original_lon = number(apt["longitude"])
        original_lat = number(apt["latitude"])
        try:
            geocoded = geocode_road_address(apt.get("road_address", ""))
        except Exception as exc:
            print(f"주소 지오코딩 실패: {apt['apt_nm']} · {exc}")
            geocoded = None
        geocode_drift_m = (
            point_distance_m(original_lon, original_lat, geocoded[0], geocoded[1])
            if geocoded
            else 0.0
        )
        if geocoded and geocode_drift_m <= 1000:
            query_lon, query_lat = geocoded
            coordinate_source = "road_geocode"
        else:
            query_lon, query_lat = original_lon, original_lat
            coordinate_source = "original_point_rejected_geocode" if geocoded else "original_point"
        coordinate_drift_m = geocode_drift_m
        query_apt = {**apt, "longitude": query_lon, "latitude": query_lat}
        features = fetch_buildings(query_lon, query_lat, args.deg)
        time.sleep(args.sleep)
        road_name, building_no = parse_road(apt.get("road_address", ""))
        expected_count = int(number(apt.get("building_count")))
        estimated_radius = number(apt.get("estimated_radius_m"))
        adaptive_radius = max(180.0, estimated_radius * 2.5)
        groups = defaultdict(list)
        road_groups = defaultdict(list)

        for feature in features:
            props = feature.get("properties", {})
            dong_name = extract_dong_name(props)
            if not dong_name:
                continue
            group_name = building_group_name(props) or "(건물명 없음)"
            distance_m = round(distance_from_apartment_m(feature, query_apt), 1)
            centroid = shape(feature["geometry"]).centroid
            record = {
                "apt_cd": apt["apt_cd"],
                "apt_nm": apt["apt_nm"],
                "expected_count": expected_count,
                "adaptive_radius_m": round(adaptive_radius, 1),
                "building_group_name": group_name,
                "dong_name": dong_name,
                "road_name": props.get("rd_nm") or "",
                "building_no": props.get("buld_no") or "",
                "distance_m": distance_m,
                "longitude": round(centroid.x, 8),
                "latitude": round(centroid.y, 8),
            }
            groups[group_name].append(record)
            if record["road_name"] and record["building_no"]:
                road_groups[(record["road_name"], record["building_no"])].append(record)
            dong_rows.append(record)

        ranked = []
        candidate_sets = [("building_name", name, records) for name, records in groups.items()]
        candidate_sets.extend(
            ("road_cluster", f"[도로] {road} {building}", records)
            for (road, building), records in road_groups.items()
            if len({row["dong_name"] for row in records}) >= 2
        )
        for candidate_type, group_name, records in candidate_sets:
            unique_dongs = sorted({row["dong_name"] for row in records})
            distances = [row["distance_m"] for row in records]
            road_name_matches = sum(row["road_name"] == road_name for row in records)
            road_number_matches = sum(
                row["road_name"] == road_name and row["building_no"] == building_no
                for row in records
            )
            coverage = len(unique_dongs) / expected_count if expected_count else 0.0
            similarities = [name_similarity(apt["apt_nm"], row["building_group_name"]) for row in records]
            group = {
                "apt_cd": apt["apt_cd"],
                "apt_nm": apt["apt_nm"],
                "road_address": apt.get("road_address", ""),
                "coordinate_source": coordinate_source,
                "coordinate_drift_m": coordinate_drift_m,
                "expected_count": expected_count,
                "adaptive_radius_m": round(adaptive_radius, 1),
                "bbox_feature_count": len(features),
                "bbox_dong_feature_count": sum(len(value) for value in groups.values()),
                "candidate_type": candidate_type,
                "building_group_name": group_name,
                "unique_dong_count": len(unique_dongs),
                "dong_names": "|".join(unique_dongs),
                "coverage_ratio": round(coverage, 3),
                "name_similarity": round(max(similarities, default=0.0), 3),
                "road_name_match_count": road_name_matches,
                "road_number_exact_count": road_number_matches,
                "min_distance_m": min(distances),
                "median_distance_m": round(statistics.median(distances), 1),
                "max_distance_m": max(distances),
            }
            group["recommendation"] = recommendation(group)
            ranked.append(group)

        ranked.sort(
            key=lambda row: (
                row["recommendation"] not in {
                    "strong_road_candidate",
                    "strong_road_cluster_candidate",
                    "strong_spatial_name_candidate",
                },
                -row["road_number_exact_count"],
                -row["road_name_match_count"],
                row["candidate_type"] != "road_cluster",
                -row["name_similarity"],
                row["min_distance_m"],
                -row["unique_dong_count"],
            )
        )
        for rank, group in enumerate(ranked, start=1):
            group_rows.append({**group, "candidate_rank": rank})

        top = ranked[0] if ranked else None
        official_names = set()
        official_status = "not_requested"
        official_dong_count = 0
        if args.query_official and top and top["recommendation"].startswith("strong_"):
            if top["candidate_type"] == "road_cluster":
                road_value, building_value = top["building_group_name"].removeprefix("[도로] ").rsplit(" ", 1)
                top_records = road_groups[(road_value, building_value)]
            else:
                top_records = groups[top["building_group_name"]]
            closest_by_dong = {}
            for record in top_records:
                current = closest_by_dong.get(record["dong_name"])
                if current is None or record["distance_m"] < current["distance_m"]:
                    closest_by_dong[record["dong_name"]] = record
            failures = 0
            for dong_name, record in sorted(closest_by_dong.items()):
                try:
                    browser = query_schoolzone(record["longitude"], record["latitude"])
                    hakgudo_nm = browser["browser_hakgudo_nm"]
                    if hakgudo_nm:
                        official_names.add(hakgudo_nm)
                    else:
                        failures += 1
                except Exception as exc:
                    browser = {"browser_hakgudo_id": "", "browser_hakgudo_nm": "", "browser_school_names": ""}
                    failures += 1
                    print(f"공식 학구 조회 실패: {apt['apt_nm']} {dong_name} · {exc}")
                official_rows.append(
                    {
                        "apt_cd": apt["apt_cd"],
                        "apt_nm": apt["apt_nm"],
                        "dong_name": dong_name,
                        "longitude": record["longitude"],
                        "latitude": record["latitude"],
                        "browser_hakgudo_id": browser["browser_hakgudo_id"],
                        "browser_hakgudo_nm": browser["browser_hakgudo_nm"],
                        "browser_school_names": browser["browser_school_names"],
                        "query_status": "zone_found" if browser["browser_hakgudo_nm"] else "no_zone_found",
                    }
                )
                time.sleep(0.15)
            official_dong_count = len(closest_by_dong)
            official_status = "complete" if failures == 0 else f"partial:{failures}_failed"
        summary_rows.append(
            {
                "apt_cd": apt["apt_cd"],
                "apt_nm": apt["apt_nm"],
                "road_address": apt.get("road_address", ""),
                "coordinate_source": coordinate_source,
                "coordinate_drift_m": coordinate_drift_m,
                "expected_count": expected_count,
                "adaptive_radius_m": round(adaptive_radius, 1),
                "bbox_feature_count": len(features),
                "candidate_group_count": len(ranked),
                "top_group_name": top["building_group_name"] if top else "",
                "top_dong_count": top["unique_dong_count"] if top else 0,
                "top_coverage_ratio": top["coverage_ratio"] if top else 0,
                "top_name_similarity": top["name_similarity"] if top else 0,
                "top_road_number_exact_count": top["road_number_exact_count"] if top else 0,
                "top_min_distance_m": top["min_distance_m"] if top else "",
                "recommendation": top["recommendation"] if top else "no_dong_features",
                "official_dong_count": official_dong_count,
                "official_hakgudo_names": "|".join(sorted(official_names)),
                "official_query_status": official_status,
                "review_status": "sample_only_not_applied",
            }
        )
        top_label = top["building_group_name"] if top else "후보 없음"
        top_status = top["recommendation"] if top else "no_dong_features"
        print(f"{index}/{len(apartments)} {apt['apt_nm']} -> {top_label} ({top_status})")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    prefix = args.out_dir / "bbox_sample_rematch"
    summary_fields = list(summary_rows[0].keys())
    group_fields = list(group_rows[0].keys()) if group_rows else []
    dong_fields = list(dong_rows[0].keys()) if dong_rows else []
    write_csv(prefix.with_name(prefix.name + "_summary.csv"), summary_rows, summary_fields)
    if group_rows:
        write_csv(prefix.with_name(prefix.name + "_candidate_groups.csv"), group_rows, group_fields)
    if dong_rows:
        write_csv(prefix.with_name(prefix.name + "_dongs.csv"), dong_rows, dong_fields)
    if official_rows:
        write_csv(
            prefix.with_name(prefix.name + "_official_dongs.csv"),
            official_rows,
            list(official_rows[0].keys()),
        )
    prefix.with_name(prefix.name + "_report.json").write_text(
        json.dumps({"summary": summary_rows, "candidate_groups": group_rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Summary: {prefix.with_name(prefix.name + '_summary.csv')}")


if __name__ == "__main__":
    main()
