#!/usr/bin/env python3
"""
Local apartment-to-hakgudo assignment ETL.

This does not use Geomarket school assignments as truth. It assigns apartments
directly from apartment coordinates to the official elementary hakgudo polygon
SHP, then marks likely cases for VWorld building-level refinement.
"""

import argparse
import csv
import json
import math
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = Path(__file__).parent
SHP = BASE / "data" / "hakgudo" / "elem_hakgudo_20250922.shp"
APT_MST = Path(r"F:/sm/vibe/elementary/archive/GAS/GAS/임시/apt_mst_info_202410.csv")
TARGET_SD = {"11", "41", "28"}  # Seoul, Gyeonggi, Incheon
TARGET_SD_NAMES = {"11": "seoul", "41": "gyeonggi", "28": "incheon"}
MAX_NEARBY_M = 250.0
RADIUS_FACTOR = 2.0
RADIUS_CAP_M = 180.0

to_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)


def as_float(value, default=0.0):
    try:
        return float(value or default)
    except (TypeError, ValueError):
        return default


def load_polygons(shp_path):
    sf = shapefile.Reader(str(shp_path), encoding="euc-kr")
    fields = [f[0] for f in sf.fields[1:]]
    idx = {n: i for i, n in enumerate(fields)}

    geoms, metas = [], []
    for sr in sf.iterShapeRecords():
        rec = sr.record
        sd_cd = rec[idx["SD_CD"]]
        if sd_cd not in TARGET_SD:
            continue
        geom = shape(sr.shape.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        geoms.append(geom)
        metas.append(
            {
                "hakgudo_id": rec[idx["HAKGUDO_ID"]],
                "hakgudo_nm": rec[idx["HAKGUDO_NM"]],
                "hakgudo_gb": rec[idx["HAKGUDO_GB"]],
                "sd_cd": sd_cd,
                "sgg_cd": rec[idx["SGG_CD"]],
                "edu_nm": rec[idx["EDU_NM"]],
            }
        )
    return STRtree(geoms), geoms, metas


def load_apartments():
    rows = []
    with open(APT_MST, encoding="cp949") as f:
        for row in csv.DictReader(f):
            legal = row.get("legaldong_cd") or ""
            if legal[:2] not in TARGET_SD:
                continue
            lon = as_float(row.get("lo"))
            lat = as_float(row.get("la"))
            if not lon or not lat:
                continue
            households = as_float(row.get("nmhsh"))
            rows.append(
                {
                    "apt_cd": row.get("apt_cd") or "",
                    "apt_nm": row.get("apt_nm") or "",
                    "road_address": row.get("rdnmadr") or "",
                    "legal_dong_cd": legal,
                    "region": TARGET_SD_NAMES.get(legal[:2], legal[:2]),
                    "longitude": lon,
                    "latitude": lat,
                    "households": int(households),
                    "use_approval_year": row.get("use_aprv_yr") or "",
                    "rental_yn": row.get("let_hus_yn") or "",
                    "building_count": row.get("dngct") or "",
                    "total_parking": row.get("totprk_ecct") or "",
                }
            )
    return rows


def estimate_radius_m(households):
    if households <= 0:
        return 0.0
    return min(RADIUS_FACTOR * math.sqrt(households), RADIUS_CAP_M)


def assign_one(apt, tree, geoms, metas):
    x, y = to_5186.transform(apt["longitude"], apt["latitude"])
    pt = Point(x, y)
    radius = estimate_radius_m(apt["households"])
    search_radius = max(MAX_NEARBY_M, radius)

    containing = []
    nearby = []
    for i in tree.query(pt.buffer(search_radius)):
        geom = geoms[i]
        meta = metas[i]
        dist = geom.distance(pt)
        if geom.contains(pt) or geom.touches(pt):
            containing.append((i, dist, meta))
        if dist <= search_radius:
            nearby.append((i, dist, meta))

    containing.sort(key=lambda v: v[1])
    nearby.sort(key=lambda v: (v[1], v[2]["hakgudo_id"]))

    primary = containing[0][2] if containing else None
    primary_geom = geoms[containing[0][0]] if containing else None
    boundary_distance = primary_geom.boundary.distance(pt) if primary_geom else None

    candidate_ids = []
    candidate_names = []
    for _, dist, meta in nearby:
        if dist <= radius or (primary and meta["hakgudo_id"] == primary["hakgudo_id"]):
            if meta["hakgudo_id"] not in candidate_ids:
                candidate_ids.append(meta["hakgudo_id"])
                candidate_names.append(meta["hakgudo_nm"])

    reasons = []
    if not primary:
        reasons.append("point_nohit")
    if len(candidate_ids) > 1:
        reasons.append("nearby_multiple_hakgudo")
    if boundary_distance is not None and radius > 0 and boundary_distance <= radius:
        reasons.append("within_estimated_radius_to_boundary")
    if apt["households"] >= 1500 and boundary_distance is not None and boundary_distance <= MAX_NEARBY_M:
        reasons.append("large_complex_near_boundary")

    return {
        **apt,
        "primary_hakgudo_id": primary["hakgudo_id"] if primary else "",
        "primary_hakgudo_nm": primary["hakgudo_nm"] if primary else "",
        "primary_hakgudo_gb": primary["hakgudo_gb"] if primary else "",
        "primary_edu_nm": primary["edu_nm"] if primary else "",
        "candidate_hakgudo_ids": "|".join(candidate_ids),
        "candidate_hakgudo_names": "|".join(candidate_names),
        "candidate_count": len(candidate_ids),
        "estimated_radius_m": round(radius, 1),
        "boundary_distance_m": round(boundary_distance, 1) if boundary_distance is not None else "",
        "needs_building_check": bool(reasons),
        "building_check_reasons": "|".join(reasons),
        "assignment_method": "point",
        "confidence": "high" if primary and not reasons else "needs_refinement",
    }


def write_csv(path, rows):
    if not rows:
        return
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Build local official-polygon assignment CSV/JSON outputs.")
    parser.add_argument("--out-dir", type=Path, default=BASE / "local_outputs")
    parser.add_argument("--shp", type=Path, default=SHP, help="Official elementary hakgudo SHP input.")
    args = parser.parse_args()

    tree, geoms, metas = load_polygons(args.shp)
    apartments = load_apartments()
    print(f"통학구역 폴리곤: {len(geoms):,}개")
    print(f"아파트 입력: {len(apartments):,}개")

    rows = [assign_one(apt, tree, geoms, metas) for apt in apartments]
    candidates = [r for r in rows if r["needs_building_check"]]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    assignments_csv = args.out_dir / "apartment_point_assignments.csv"
    candidates_csv = args.out_dir / "building_check_candidates.csv"
    assignments_json = args.out_dir / "apartment_point_assignments.json"
    candidates_json = args.out_dir / "building_check_candidates.json"
    summary_json = args.out_dir / "assignment_summary.json"

    write_csv(assignments_csv, rows)
    write_csv(candidates_csv, candidates)
    assignments_json.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    candidates_json.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")

    stats = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "polygon_source": str(args.shp),
        "apartment_source": str(APT_MST),
        "total_apartments": len(rows),
        "point_assigned": sum(1 for r in rows if r["primary_hakgudo_id"]),
        "point_nohit": sum(1 for r in rows if not r["primary_hakgudo_id"]),
        "needs_building_check": len(candidates),
        "high_confidence_point": sum(1 for r in rows if r["confidence"] == "high"),
        "by_region": Counter(r["region"] for r in rows),
        "candidate_reasons": Counter(
            reason
            for r in candidates
            for reason in str(r["building_check_reasons"]).split("|")
            if reason
        ),
    }
    stats["by_region"] = dict(stats["by_region"])
    stats["candidate_reasons"] = dict(stats["candidate_reasons"])
    summary_json.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    print(f"대표점 배정 CSV: {assignments_csv}")
    print(f"건물 보정 후보 CSV: {candidates_csv}")
    print(f"요약 JSON: {summary_json}")
    print()
    print(f"대표점 배정 성공: {stats['point_assigned']:,}/{len(rows):,}")
    print(f"건물 보정 후보: {len(candidates):,}")
    print(f"고신뢰 대표점 확정: {stats['high_confidence_point']:,}")


if __name__ == "__main__":
    main()
