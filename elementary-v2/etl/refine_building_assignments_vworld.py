#!/usr/bin/env python3
"""
Refine official hakgudo assignments with VWorld building polygons.

Input: local_outputs/building_check_candidates.csv from build_local_assignment_etl.py
Output: per-building assignments and per-apartment summary CSV/JSON.
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = Path(__file__).parent
SHP = BASE / "data" / "hakgudo" / "elem_hakgudo_20250922.shp"
DEFAULT_INPUT = BASE / "local_outputs" / "building_check_candidates.csv"
DEFAULT_OUT_DIR = BASE / "local_outputs"
KEY = os.getenv("VWORLD_API_KEY") or "B6A216F3-038A-366B-B85D-44324FF03BDB"
DOMAIN = "https://github.com/sean-kang-jpg/elementary"
DEG = 0.006

to_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)


def load_districts(shp_path=SHP):
    sf = shapefile.Reader(str(shp_path), encoding="euc-kr")
    fields = [f[0] for f in sf.fields[1:]]
    ix = {n: i for i, n in enumerate(fields)}
    geoms, metas = [], []
    for sr in sf.iterShapeRecords():
        if sr.record[ix["SD_CD"]] not in {"11", "41", "28"}:
            continue
        geom = shape(sr.shape.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        geoms.append(geom)
        metas.append(
            {
                "hakgudo_id": sr.record[ix["HAKGUDO_ID"]],
                "hakgudo_nm": sr.record[ix["HAKGUDO_NM"]],
                "hakgudo_gb": sr.record[ix["HAKGUDO_GB"]],
                "edu_nm": sr.record[ix["EDU_NM"]],
            }
        )
    return STRtree(geoms), geoms, metas


def fetch_buildings(lon, lat, deg=DEG):
    q = urllib.parse.urlencode(
        {
            "service": "data",
            "request": "GetFeature",
            "data": "LT_C_SPBD",
            "key": KEY,
            "domain": DOMAIN,
            "format": "json",
            "size": "1000",
            "crs": "EPSG:4326",
            "geomFilter": f"BOX({lon-deg},{lat-deg},{lon+deg},{lat+deg})",
        }
    )
    with urllib.request.urlopen(f"https://api.vworld.kr/req/data?{q}", timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    result = data.get("response", {}).get("result")
    if not result:
        return []
    return result["featureCollection"]["features"]


def parse_road(address):
    m = re.search(r"([가-힣A-Za-z0-9]+(?:로|길))\s+(\d+(?:-\d+)?)\s*$", address.strip())
    return (m.group(1), m.group(2)) if m else ("", "")


def normalize_name(value):
    value = value or ""
    value = re.sub(r"\([^)]*\)", "", value)
    value = value.replace("e-편한세상", "e편한세상")
    value = value.replace("이편한세상", "e편한세상")
    value = value.replace("에스케이", "sk")
    value = value.replace("스카이뷰", "skyview")
    value = value.replace("자이", "xi")
    value = re.sub(r"(아파트|APT|apt|단지|제\d+단지)", "", value)
    value = re.sub(r"[^0-9A-Za-z가-힣]", "", value)
    return value.lower()


def is_dong_name(value):
    return bool(re.search(r"(^|[^0-9])\d{1,4}동$", value or ""))


def extract_dong_name(props):
    detail = (props.get("buld_nm_dc") or "").strip()
    if is_dong_name(detail):
        return detail
    match = re.search(r"(?:\(|\s)?(\d{1,4}동)\)?$", (props.get("buld_nm") or "").strip())
    return match.group(1) if match else ""


def building_group_name(props):
    name = (props.get("buld_nm") or "").strip()
    if not (props.get("buld_nm_dc") or "").strip():
        name = re.sub(r"\s*\(?\d{1,4}동\)?$", "", name).strip()
    return name


def distance_from_apartment_m(feature, apt):
    centroid = shape(feature["geometry"]).centroid
    apt_x, apt_y = to_5186.transform(float(apt["longitude"]), float(apt["latitude"]))
    feature_x, feature_y = to_5186.transform(centroid.x, centroid.y)
    return Point(apt_x, apt_y).distance(Point(feature_x, feature_y))


def select_dongs(features, apt):
    """Return only a high-confidence building-name group and its match metadata."""
    rd, no = parse_road(apt["road_address"])
    apt_norm = normalize_name(apt["apt_nm"])
    grouped = defaultdict(list)

    for feature in features:
        props = feature.get("properties", {})
        dong = extract_dong_name(props)
        if not dong:
            continue

        road_name_match = rd and props.get("rd_nm") == rd
        road_match = road_name_match and props.get("buld_no") == no
        group_name = building_group_name(props)
        name_exact = group_name == apt["apt_nm"]
        building_norm = normalize_name(group_name)
        distance_m = distance_from_apartment_m(feature, apt)
        score, method = 0, ""
        if road_match:
            score, method = 100, "road_number_exact"
        elif name_exact:
            score, method = 95, "name_exact"
        elif apt_norm and building_norm and apt_norm == building_norm:
            score, method = 90, "name_normalized_exact"
        elif apt_norm and building_norm and min(len(apt_norm), len(building_norm)) >= 4 and (apt_norm in building_norm or building_norm in apt_norm):
            score, method = 80, "name_normalized_contained"
        elif road_name_match and distance_m <= 500:
            # A road-only match is retained for diagnostics, never auto-assigned.
            score, method = 60, "road_nearby_candidate"

        if score:
            feature["_dong_name"] = dong
            feature["_match_score"] = score
            feature["_match_method"] = method
            feature["_distance_m"] = round(distance_m, 1)
            grouped[group_name].append(feature)

    if not grouped:
        return [], "", 0, 0.0, "", 0

    ranked = []
    for building_name, group in grouped.items():
        score = max(f["_match_score"] for f in group)
        nearest = min(f["_distance_m"] for f in group)
        ranked.append((score, -len(group), nearest, building_name, group))
    ranked.sort(key=lambda item: (-item[0], item[1], item[2], item[3]))
    score, _, nearest, _, selected = ranked[0]
    method = next(f["_match_method"] for f in selected if f["_match_score"] == score)

    # Scores below 80 provide a useful manual clue but are not safe automatic matches.
    return (selected if score >= 80 else []), method, score, nearest, ranked[0][3], len(selected)


def assign_building(feature, tree, geoms, metas):
    centroid = shape(feature["geometry"]).centroid
    pt = Point(*to_5186.transform(centroid.x, centroid.y))
    hits = [
        metas[i]
        for i in tree.query(pt)
        if geoms[i].contains(pt) or geoms[i].touches(pt)
    ]
    return centroid, hits[0] if hits else None


def write_csv(path, rows):
    if not rows:
        return
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Run VWorld building-level assignment refinement.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--shp", type=Path, default=SHP, help="Official hakgudo shapefile to use.")
    parser.add_argument("--apt-id", help="Process only the specified apartment ID.")
    parser.add_argument("--limit", type=int, help="Process only the first N candidates.")
    parser.add_argument("--sleep", type=float, default=0.3)
    parser.add_argument("--deg", type=float, default=DEG, help="Half-width of the VWorld search box in degrees.")
    parser.add_argument("--out-prefix", default="building_refined", help="Output file prefix within --out-dir.")
    parser.add_argument("--only-status", help="Process only rows with this existing refined_status value.")
    parser.add_argument("--debug-candidates", action="store_true", help="Write raw nearby building candidates for diagnostics.")
    args = parser.parse_args()

    tree, geoms, metas = load_districts(args.shp)
    with open(args.input, encoding="utf-8-sig") as f:
        candidates = list(csv.DictReader(f))
    if args.apt_id:
        candidates = [row for row in candidates if row.get("apt_cd") == args.apt_id]
    if args.only_status:
        candidates = [row for row in candidates if row.get("refined_status") == args.only_status]
    candidates.sort(key=lambda r: int(float(r.get("households") or 0)), reverse=True)
    if args.limit:
        candidates = candidates[: args.limit]

    building_rows = []
    summary_rows = []
    candidate_rows = []
    print(f"VWorld 보정 대상: {len(candidates):,}개")

    for idx, apt in enumerate(candidates, start=1):
        lon, lat = float(apt["longitude"]), float(apt["latitude"])
        try:
            features = fetch_buildings(lon, lat, args.deg)
        except Exception as exc:
            print(f"{idx:>4}/{len(candidates)} {apt['apt_nm']} API 실패: {exc}")
            summary_rows.append({**apt, "building_count_matched": 0, "building_hakgudo_names": "", "refined_status": "api_failed"})
            continue
        time.sleep(args.sleep)

        if args.debug_candidates:
            for feature in features:
                props = feature.get("properties", {})
                centroid = shape(feature["geometry"]).centroid
                candidate_rows.append(
                    {
                        "apt_cd": apt["apt_cd"],
                        "apt_nm": apt["apt_nm"],
                        "distance_from_apt_m": round(distance_from_apartment_m(feature, apt), 1),
                        "building_name": props.get("buld_nm") or "",
                        "dong_name": props.get("buld_nm_dc") or "",
                        "road_name": props.get("rd_nm") or "",
                        "building_no": props.get("buld_no") or "",
                        "longitude": round(centroid.x, 8),
                        "latitude": round(centroid.y, 8),
                    }
                )

        dongs, candidate_method, candidate_score, candidate_distance_m, candidate_building_name, candidate_dong_count = select_dongs(features, apt)
        per = defaultdict(int)
        methods = set()
        for feature in dongs:
            props = feature.get("properties", {})
            centroid, hakgudo = assign_building(feature, tree, geoms, metas)
            methods.add(feature.get("_match_method", ""))
            if hakgudo:
                per[hakgudo["hakgudo_nm"]] += 1
            building_rows.append(
                {
                    "apt_cd": apt["apt_cd"],
                    "apt_nm": apt["apt_nm"],
                    "road_address": apt["road_address"],
                    "building_name": props.get("buld_nm") or "",
                    "dong_name": feature.get("_dong_name") or props.get("buld_nm_dc") or "",
                    "rd_nm": props.get("rd_nm") or "",
                    "buld_no": props.get("buld_no") or "",
                    "longitude": round(centroid.x, 8),
                    "latitude": round(centroid.y, 8),
                    "hakgudo_id": hakgudo["hakgudo_id"] if hakgudo else "",
                    "hakgudo_nm": hakgudo["hakgudo_nm"] if hakgudo else "",
                    "match_method": feature.get("_match_method", ""),
                    "match_score": feature.get("_match_score", ""),
                    "distance_from_apt_m": feature.get("_distance_m", ""),
                }
            )

        if not dongs:
            status = "building_match_candidate" if candidate_score else "building_match_failed"
        elif len(per) > 1:
            status = "split_by_building"
        else:
            status = "single_by_building"

        summary_rows.append(
            {
                **apt,
                "building_count_matched": len(dongs),
                "building_hakgudo_names": "|".join(f"{k}({v})" for k, v in per.items()),
                "building_match_methods": "|".join(sorted(m for m in methods if m)),
                "best_candidate_method": candidate_method,
                "best_candidate_score": candidate_score,
                "best_candidate_distance_m": candidate_distance_m,
                "best_candidate_building_name": candidate_building_name,
                "best_candidate_dong_count": candidate_dong_count,
                "refined_status": status,
            }
        )
        print(f"{idx:>4}/{len(candidates)} {apt['apt_nm']} · {len(dongs)}동 · {status}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    summary_csv = args.out_dir / f"{args.out_prefix}_assignments.csv"
    building_csv = args.out_dir / f"{args.out_prefix}_dongs.csv"
    summary_json = args.out_dir / f"{args.out_prefix}_assignments.json"
    building_json = args.out_dir / f"{args.out_prefix}_dongs.json"

    write_csv(summary_csv, summary_rows)
    write_csv(building_csv, building_rows)
    summary_json.write_text(json.dumps(summary_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    building_json.write_text(json.dumps(building_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.debug_candidates:
        candidate_rows.sort(key=lambda row: (row["apt_cd"], row["distance_from_apt_m"]))
        write_csv(args.out_dir / f"{args.out_prefix}_candidates.csv", candidate_rows)

    counts = defaultdict(int)
    for row in summary_rows:
        counts[row["refined_status"]] += 1

    print()
    print(f"요약 CSV: {summary_csv}")
    print(f"동별 CSV: {building_csv}")
    print(f"상태 집계: {dict(counts)}")


if __name__ == "__main__":
    main()
