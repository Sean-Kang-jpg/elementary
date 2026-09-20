"""Collect VWorld building polygons for large apartment complexes.

The private JSONL cache is resumable. Only complexes with at least the requested
household count and without a prior building-centroid result are requested.
"""

from __future__ import annotations

import argparse
import ast
import csv
import http.client
import json
import math
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import shape


BASE = Path(__file__).resolve().parent
PROJECT = BASE.parent
COMPLEXES = BASE / "local_outputs_20260320" / "apartment_complex_master_v1.csv"
PRIOR_DONGS = (
    BASE.parents[2]
    / "archive"
    / "elementary-v2-pre-operational-20260828"
    / "etl"
    / "local_outputs"
    / "building_refined_dongs.csv"
)
RUNTIME = BASE / "runtime" / "apartment_buildings"
RESULTS = RUNTIME / "vworld_large_complex_results.jsonl"
TRUSTED_POINTS = RUNTIME / "trusted_large_complex_buildings.csv"
PROFILE = BASE / "apartment_building_collection_profile.json"
DOMAIN = "https://github.com/sean-kang-jpg/elementary"


def env_value(name: str) -> str:
    if os.getenv(name):
        return os.environ[name]
    for path in (PROJECT / ".env", PROJECT.parent / ".env.local"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def number(value):
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def haversine_m(lat1, lon1, lat2, lon2):
    radius = 6_371_008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = p2 - p1, math.radians(lon2 - lon1)
    value = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(value))


def normalize(value: str) -> str:
    value = re.sub(r"\([^)]*\)", "", value or "").lower()
    value = re.sub(r"아파트|apt|주공|단지", "", value)
    return re.sub(r"[^0-9a-z가-힣]", "", value)


def road_parts(address: str):
    match = re.search(r"([^\s]+(?:로|길))\s+(\d+(?:-\d+)?)", address or "")
    return match.groups() if match else ("", "")


def dong_name(properties: dict) -> str:
    detail = (properties.get("buld_nm_dc") or "").strip()
    match = re.search(r"(\d{1,4}\s*동)", detail)
    if match:
        return match.group(1).replace(" ", "")
    match = re.search(r"(\d{1,4}\s*동)(?:\s|\)|$)", properties.get("buld_nm") or "")
    return match.group(1).replace(" ", "") if match else ""


def group_name(properties: dict) -> str:
    name = (properties.get("buld_nm") or "").strip()
    return re.sub(r"\s*\(?\d{1,4}\s*동\)?\s*$", "", name).strip()


def fetch(key: str, apartment: dict, half_width=0.006, retries=3):
    lon, lat = apartment["longitude"], apartment["latitude"]
    query = urllib.parse.urlencode({
        "service": "data", "request": "GetFeature", "data": "LT_C_SPBD",
        "key": key, "domain": DOMAIN, "format": "json", "size": "1000",
        "crs": "EPSG:4326",
        "geomFilter": f"BOX({lon-half_width},{lat-half_width},{lon+half_width},{lat+half_width})",
    })
    last_error = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(f"https://api.vworld.kr/req/data?{query}", timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
            api_response = payload.get("response", {})
            if api_response.get("status") != "OK":
                error = api_response.get("error", {})
                return [], "api_error", error.get("code") or api_response.get("status", "UNKNOWN")
            result = api_response.get("result") or {}
            collection = result.get("featureCollection") or {}
            return collection.get("features") or [], "ok", ""
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError,
                json.JSONDecodeError, http.client.RemoteDisconnected,
                ConnectionError, OSError) as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(1.5 * (2 ** attempt))
    return [], "transport_error", type(last_error).__name__ if last_error else "unknown"


def select(features: list[dict], apartment: dict):
    road, building_no = road_parts(apartment["road_address"])
    apartment_name = normalize(apartment["complex_name"])
    groups = defaultdict(list)
    for feature in features:
        properties = feature.get("properties") or {}
        dong = dong_name(properties)
        if not dong:
            continue
        geometry = feature.get("geometry")
        if not geometry:
            continue
        centroid = shape(geometry).centroid
        distance = haversine_m(apartment["latitude"], apartment["longitude"], centroid.y, centroid.x)
        name = group_name(properties)
        candidate_name = normalize(name)
        exact_road = road and properties.get("rd_nm") == road and str(properties.get("buld_no") or "") == building_no
        if exact_road:
            score, method = 100, "road_number_exact"
        elif apartment_name and candidate_name == apartment_name:
            score, method = 90, "name_normalized_exact"
        elif (apartment_name and candidate_name and min(len(apartment_name), len(candidate_name)) >= 4
              and (apartment_name in candidate_name or candidate_name in apartment_name)):
            score, method = 80, "name_normalized_contained"
        else:
            continue
        groups[name].append((feature, dong, centroid, distance, score, method))
    if not groups:
        return [], "no_match", ""
    official = apartment["building_count"]
    ranked = []
    for name, rows in groups.items():
        score = max(row[4] for row in rows)
        count_gap = abs(len(rows) - official) / official if official else 999
        nearest = min(row[3] for row in rows)
        ranked.append((-score, count_gap, nearest, name, rows))
    ranked.sort(key=lambda item: item[:4])
    _, _, _, selected_name, selected = ranked[0]
    return selected, "matched", selected_name


def load_candidates(min_households: int):
    prior = set()
    if PRIOR_DONGS.exists():
        with PRIOR_DONGS.open(encoding="utf-8-sig", newline="") as handle:
            prior = {row["apt_cd"] for row in csv.DictReader(handle)}
    candidates = []
    with COMPLEXES.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            households = int(number(row.get("households")) or 0)
            lat, lon = number(row.get("latitude")), number(row.get("longitude"))
            components = ast.literal_eval(row.get("component_apt_ids") or "[]")
            if households < min_households or lat is None or lon is None or any(str(value) in prior for value in components):
                continue
            candidates.append({
                "canonical_complex_id": row["canonical_complex_id"],
                "complex_name": row["complex_name"], "road_address": row.get("road_address") or "",
                "region": row["region"], "district": row.get("district") or "",
                "households": households, "building_count": int(number(row.get("building_count")) or 0),
                "latitude": lat, "longitude": lon,
            })
    return candidates


def read_result_stream(path: Path):
    if not path.exists():
        return []
    decoder = json.JSONDecoder()
    rows = []
    discarded = 0
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            content = line.strip()
            position = 0
            while position < len(content):
                try:
                    row, position = decoder.raw_decode(content, position)
                except json.JSONDecodeError:
                    discarded += 1
                    break
                if isinstance(row, dict) and row.get("canonical_complex_id"):
                    rows.append(row)
                else:
                    discarded += 1
                while position < len(content) and content[position].isspace():
                    position += 1
    if discarded:
        print(f"discarded_corrupt_cache_lines={discarded}")
    return rows


def processed_ids(path: Path):
    return {row["canonical_complex_id"] for row in read_result_stream(path)}


def materialize_outputs():
    latest = {}
    for row in read_result_stream(RESULTS):
        latest[row["canonical_complex_id"]] = row
    repaired = RESULTS.with_suffix(".jsonl.tmp")
    with repaired.open("w", encoding="utf-8") as handle:
        for row in latest.values():
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    repaired.replace(RESULTS)
    point_fields = (
        "canonical_complex_id", "complex_name", "region", "district", "households",
        "official_building_count", "dong_name", "building_name", "longitude", "latitude",
        "distance_from_complex_m", "match_score", "match_method",
    )
    point_rows = []
    for row in latest.values():
        if not row.get("trusted_building_match"):
            continue
        for building in row.get("buildings", []):
            point_rows.append({
                "canonical_complex_id": row["canonical_complex_id"],
                "complex_name": row["complex_name"], "region": row["region"],
                "district": row["district"], "households": row["households"],
                "official_building_count": row["building_count"],
                **{field: building.get(field, "") for field in point_fields if field in building},
            })
    with TRUSTED_POINTS.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=point_fields)
        writer.writeheader()
        writer.writerows(point_rows)
    by_region = {}
    for region in sorted({row["region"] for row in latest.values()}):
        regional = [row for row in latest.values() if row["region"] == region]
        by_region[region] = {
            "requested_complexes": len(regional),
            "trusted_complexes": sum(bool(row.get("trusted_building_match")) for row in regional),
        }
    profile = {
        "criteria": {
            "minimum_households": 500,
            "excluded_when_prior_building_points_exist": True,
            "trusted_building_count_ratio": [0.75, 1.25],
        },
        "results": {
            "requested_complexes": len(latest),
            "successful_requests": sum(row.get("request_status") == "ok" for row in latest.values()),
            "complexes_with_matches": sum(row.get("matched_building_count", 0) > 0 for row in latest.values()),
            "trusted_complexes": sum(bool(row.get("trusted_building_match")) for row in latest.values()),
            "fallback_complexes": sum(not row.get("trusted_building_match") for row in latest.values()),
            "trusted_building_points": len(point_rows),
            "by_region": by_region,
        },
        "private_outputs": [str(RESULTS.relative_to(BASE)), str(TRUSTED_POINTS.relative_to(BASE))],
    }
    PROFILE.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return profile


def collect_one(key: str, apartment: dict, delay: float):
    features, request_status, error_code = fetch(key, apartment)
    selected, match_status, selected_name = select(features, apartment) if request_status == "ok" else ([], "not_attempted", "")
    official = apartment["building_count"]
    ratio = len(selected) / official if official else None
    trusted = ratio is not None and 0.75 <= ratio <= 1.25
    buildings = []
    for feature, dong, centroid, distance, score, method in selected:
        properties = feature.get("properties") or {}
        buildings.append({
            "dong_name": dong, "building_name": properties.get("buld_nm") or "",
            "longitude": round(centroid.x, 8), "latitude": round(centroid.y, 8),
            "distance_from_complex_m": round(distance, 1), "match_score": score,
            "match_method": method, "geometry": feature["geometry"],
        })
    time.sleep(max(delay, 0))
    return {
        **apartment, "request_status": request_status, "error_code": error_code,
        "match_status": match_status, "selected_building_name": selected_name,
        "matched_building_count": len(buildings),
        "building_count_ratio": round(ratio, 3) if ratio is not None else None,
        "trusted_building_match": trusted, "buildings": buildings,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-households", type=int, default=500)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--delay", type=float, default=0.25)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--retry-failures", action="store_true")
    args = parser.parse_args()
    key = env_value("VWORLD_API_KEY")
    if not key:
        raise SystemExit("VWORLD_API_KEY is not configured")
    RUNTIME.mkdir(parents=True, exist_ok=True)
    candidates = load_candidates(args.min_households)
    done = processed_ids(RESULTS)
    if args.retry_failures and RESULTS.exists():
        done = {
            row["canonical_complex_id"]
            for row in read_result_stream(RESULTS)
            if row.get("request_status") == "ok"
        }
    pending = [row for row in candidates if row["canonical_complex_id"] not in done]
    if args.limit:
        pending = pending[:args.limit]
    print(f"eligible={len(candidates):,} completed={len(done):,} pending={len(pending):,}")
    with RESULTS.open("a", encoding="utf-8") as output:
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
            futures = {executor.submit(collect_one, key, row, args.delay): row for row in pending}
            for index, future in enumerate(as_completed(futures), start=1):
                result = future.result()
                output.write(json.dumps(result, ensure_ascii=False) + "\n")
                output.flush()
                print(f"{index:>4}/{len(pending)} {result['complex_name']} {result['request_status']} matched={result['matched_building_count']} trusted={result['trusted_building_match']}")
    print(json.dumps(materialize_outputs(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
