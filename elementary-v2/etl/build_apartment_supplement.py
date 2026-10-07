"""Find newly built complexes the 2024-10 apartment base cannot contain.

docs/operations/NEW_COMPLEX_INTAKE_PLAN.md. The master's list of complexes is the
frozen base file; K-apt only adds attributes to complexes already in it, so a complex
approved after 2024-10 never reaches the app. This builds a supplement the master
builders read after the base:

1. candidates  K-apt complexes whose code no published complex uses, approved on or
               after APPROVED_FROM (D1). Older unused codes are mostly base complexes
               the matcher missed, and adding them would show a complex twice.
2. duplicates  a candidate within DUPLICATE_RADIUS_M of a published complex whose
               name is nearly the same (DUPLICATE_NAME_RATIO, block and phase numbers
               kept) is that complex, and is dropped. The plan's first rule, households
               within ±10%, was wrong both ways on the 2026-10-07 rehearsal: it dropped
               unrelated neighbours that happened to be the same size, and it cannot see
               a redevelopment, which is a different size by design. Candidates on top of
               an older published complex (POSSIBLE_REPLACEMENT_M) are reported as
               possible redevelopments: the base still holds the demolished complex.
3. geocode     the road address through VWorld (this machine: VWorld refuses
               foreign IPs). The cache keeps every answer, so a month costs only the
               new complexes.
4. assign      point-in-polygon on the 학구도 shapefile, the same assign_one the
               base assignments come from. Near-boundary results stay in, flagged (D2).
               A point no polygon covers is looked up on the official 학구도 map.
               Checked 2026-10-07 against that map: 39 of 40 sampled complexes named
               the same zone, and the one that did not was a no-polygon case.

Outputs, in etl/runtime/apartment_supplement/:
  apartment_base_supplement.csv              base-file columns, apt_cd = KAPT<code>
  apartment_point_assignments_supplement.csv point-assignment columns
  supplement_report.json                     counts, dropped duplicates, the review band

Reads the published complexes with the service key and writes nothing to the
tables. --fetch-kapt collects this month's K-apt first; --upload puts the two
supplement files and the report in private Storage (etl-source-snapshots/
apartment-supplement/), where the monthly run restores them before the apartment
build. The upload refuses if the supplement lost more than SHRINK_LIMIT of the
complexes the last upload had: the list only grows, so a drop means a broken source.
"""

from __future__ import annotations

import argparse
import csv
import json
import difflib
import math
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_local_assignment_etl import SHP, apply_scope, assign_one, load_polygons  # noqa: E402
from etl.fetch_schoolinfo_2026 import build_scopes  # noqa: E402
from etl.region_registry import load_registry  # noqa: E402
from evaluate_academy_distance_origins import haversine_m  # noqa: E402
from geocode_academy_addresses import env_value, geocode  # noqa: E402
from run_academy_refresh import credentials, fetch_all  # noqa: E402
from verify_p1_schoolzone_browser import query_schoolzone  # noqa: E402
import gzip  # noqa: E402
import run_recurring_etl as recurring  # noqa: E402


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "runtime" / "apartment_supplement"
KAPT_DIR = BASE_DIR / "local_outputs_20260320"
GEOCODE_CACHE = OUTPUT_DIR / "geocode_cache.json"
BUCKET = "etl-source-snapshots"
STORAGE_PREFIX = "apartment-supplement"
STORAGE_FILES = ("apartment_base_supplement.csv", "apartment_point_assignments_supplement.csv", "supplement_report.json")
SHRINK_LIMIT = 0.10

APPROVED_FROM = "20240701"        # D1: three months before the base file's 2024-10
DUPLICATE_RADIUS_M = 100
DUPLICATE_NAME_RATIO = 0.8
POSSIBLE_REPLACEMENT_M = 60       # an older complex this close is probably the one demolished
REVIEW_RADIUS_M = 300
GRID = 0.01

BASE_FIELDS = (
    "uid", "apt_cd", "apt_nm", "rdnmadr", "legaldong_cd", "nmhsh", "use_aprv_yr", "let_hus_yn",
    "lo", "la", "lnno_adres", "dngct", "totprk_ecct", "kapt_code", "source",
)


def latest_kapt() -> Path:
    files = sorted(KAPT_DIR.glob("kapt_basic_*.csv"))
    if not files:
        raise SystemExit("no K-apt snapshot in etl/local_outputs_20260320 (fetch_kapt_board_snapshot.py)")
    return files[-1]


def number(value) -> float | None:
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def candidates(kapt_rows: list[dict], used_codes: set[str]) -> list[dict]:
    """K-apt lists some complexes on several rows under one code (양정자이더샵SKVIEW: 3);
    one row per code, the one with the most households."""
    by_code: dict[str, dict] = {}
    for row in kapt_rows:
        code = (row.get("단지코드") or "").strip()
        if code and (number(row.get("세대수")) or 0) >= (number((by_code.get(code) or {}).get("세대수")) or -1):
            by_code[code] = row
    out = []
    for row in by_code.values():
        code = (row.get("단지코드") or "").strip()
        approved = (row.get("사용승인일") or "").replace("-", "").strip()
        if code and code not in used_codes and approved >= APPROVED_FROM and (row.get("도로명주소") or "").strip():
            out.append(row)
    return out


def published_index(complexes: list[dict]) -> dict[tuple[int, int], list[dict]]:
    index: dict[tuple[int, int], list[dict]] = {}
    for row in complexes:
        if row.get("latitude") is None or row.get("longitude") is None:
            continue
        key = (math.floor(row["latitude"] / GRID), math.floor(row["longitude"] / GRID))
        index.setdefault(key, []).append(row)
    return index


def nearest_published(index, lat: float, lon: float) -> list[tuple[float, dict]]:
    row, col = math.floor(lat / GRID), math.floor(lon / GRID)
    found = []
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            for other in index.get((row + dr, col + dc), ()):
                distance = haversine_m(lat, lon, other["latitude"], other["longitude"])
                if distance <= REVIEW_RADIUS_M:
                    found.append((distance, other))
    return sorted(found, key=lambda item: item[0])


def name_key(value: str) -> str:
    """Brackets, the word 아파트 and punctuation go; block and phase numbers stay,
    because 1단지 and 2단지 are different complexes."""
    value = re.sub(r"\(.*?\)", "", value or "").replace("아파트", "")
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).lower()


def is_duplicate(name: str, near: list[tuple[float, dict]]) -> dict | None:
    mine = name_key(name)
    for distance, other in near:
        if distance > DUPLICATE_RADIUS_M:
            break
        theirs = name_key(other.get("complex_name") or "")
        # 마곡엠밸리 17단지 and 10단지, 함덕해밀타운 2차 and the first: numbers that differ
        # mean different complexes however alike the rest of the name is.
        if re.findall(r"\d+", mine) != re.findall(r"\d+", theirs):
            continue
        if mine and theirs and (mine == theirs or difflib.SequenceMatcher(None, mine, theirs).ratio() >= DUPLICATE_NAME_RATIO):
            return other
    return None


def possible_replacement(near: list[tuple[float, dict]], approved_year: str) -> list[dict]:
    return [
        {"canonical_complex_id": other["canonical_complex_id"], "name": other.get("complex_name"),
         "distance_m": round(distance), "households": other.get("households"),
         "use_approval_year": other.get("use_approval_year")}
        for distance, other in near
        if distance <= POSSIBLE_REPLACEMENT_M and (other.get("use_approval_year") or 9999) < int(approved_year or 0) - 5
    ]


def legal_dong_code(region, geocoded: dict) -> str:
    """The builders read only the first two digits (the region). VWorld's road lookup
    returns the administrative dong code; its tail is kept, the region prefix is the
    registry's own so legacy codes (강원 42, 전북 45) resolve the same way."""
    tail = str(geocoded.get("admin_dong_code") or "")[2:]
    return f"{region.legal_dong_code[:2]}{tail}".ljust(10, "0")[:10]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--kapt", type=Path, default=None, help="K-apt CSV; the newest local snapshot by default")
    parser.add_argument("--shp", type=Path, default=SHP)
    parser.add_argument("--fetch-kapt", action="store_true", help="collect this month's K-apt first")
    parser.add_argument("--upload", action="store_true", help="write the supplement to private Storage")
    args = parser.parse_args()

    if args.fetch_kapt:
        from run_due_etl import collect_apartment
        collect_apartment()
    kapt_path = args.kapt or latest_kapt()
    with kapt_path.open(encoding="utf-8-sig", newline="") as handle:
        kapt_rows = list(csv.DictReader(handle))
    url, key = credentials()
    published = fetch_all(url, key, "apartment_complex_master",
                          "canonical_complex_id,kapt_code,complex_name,latitude,longitude,households,use_approval_year",
                          "canonical_complex_id")
    used = {row["kapt_code"] for row in published if row.get("kapt_code")}
    found = candidates(kapt_rows, used)
    print(f"K-apt {kapt_path.name}: {len(kapt_rows):,} rows; unused codes approved from {APPROVED_FROM}: {len(found):,}")

    registry = load_registry()
    production = [region.canonical_name for region in registry.production_regions]
    apply_scope(build_scopes(registry, production, ()))
    tree, geoms, metas = load_polygons(args.shp)

    vworld_key = env_value("VWORLD_API_KEY")
    if not vworld_key:
        raise SystemExit("VWORLD_API_KEY is not configured")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cache = json.loads(GEOCODE_CACHE.read_text(encoding="utf-8")) if GEOCODE_CACHE.exists() else {}
    index = published_index(published)

    base_rows, assignments, dropped, review, failed, replacements = [], [], [], [], [], []
    for row in found:
        code = row["단지코드"].strip()
        address = " ".join(row["도로명주소"].split())
        region = registry.region_for_address(address)
        if region is None or region.canonical_name not in production:
            failed.append({"kapt_code": code, "address": address, "reason": "region"})
            continue
        if cache.get(address, {}).get("status") != "matched":
            result = geocode(vworld_key, address)
            cache[address] = result
        geocoded = cache[address]
        if geocoded.get("status") != "matched":
            failed.append({"kapt_code": code, "address": address, "reason": geocoded.get("status")})
            continue
        lat, lon = geocoded["latitude"], geocoded["longitude"]
        households = number(row.get("세대수"))
        near = nearest_published(index, lat, lon)
        duplicate = is_duplicate(row.get("단지명") or "", near)
        if duplicate:
            dropped.append({"kapt_code": code, "name": row.get("단지명"), "same_as": duplicate["canonical_complex_id"],
                            "same_as_name": duplicate.get("complex_name"),
                            "distance_m": round(near[0][0]), "households": households})
            continue
        replaced = possible_replacement(near, (row.get("사용승인일") or "")[:4])
        if replaced:
            replacements.append({"kapt_code": code, "name": row.get("단지명"), "households": households, "replaces": replaced})
        if near:
            review.append({"kapt_code": code, "name": row.get("단지명"), "nearest": near[0][1]["canonical_complex_id"],
                           "nearest_name": near[0][1].get("complex_name"), "distance_m": round(near[0][0]),
                           "households": households, "nearest_households": near[0][1].get("households")})
        apt_cd = f"KAPT{code}"
        base = {
            "uid": apt_cd, "apt_cd": apt_cd, "apt_nm": (row.get("단지명") or "").strip(), "rdnmadr": address,
            "legaldong_cd": legal_dong_code(region, geocoded), "nmhsh": int(households or 0),
            "use_aprv_yr": (row.get("사용승인일") or "")[:4],
            "let_hus_yn": "1" if (number(row.get("임대세대수")) or 0) > 0 else "0",
            "lo": lon, "la": lat, "lnno_adres": (row.get("법정동주소") or "").strip(),
            "dngct": row.get("동수") or "", "totprk_ecct": "", "kapt_code": code, "source": f"kapt_supplement:{kapt_path.name}",
        }
        base_rows.append(base)
        assigned = assign_one({
            "apt_cd": apt_cd, "apt_nm": base["apt_nm"], "road_address": address,
            "legal_dong_cd": base["legaldong_cd"], "region": region.canonical_name,
            "longitude": lon, "latitude": lat, "households": base["nmhsh"],
            "use_approval_year": base["use_aprv_yr"], "rental_yn": base["let_hus_yn"],
            "building_count": base["dngct"], "total_parking": "",
        }, tree, geoms, metas)
        if not assigned["primary_hakgudo_id"]:
            # A redevelopment site the published polygons do not cover yet (반포래미안트리니원
            # on the 2026-03-20 release). The official 학구도 map answers by coordinate.
            official = query_schoolzone(lon, lat)
            if official["browser_hakgudo_nm"]:
                assigned.update({
                    "primary_hakgudo_id": official["browser_hakgudo_id"],
                    "primary_hakgudo_nm": official["browser_hakgudo_nm"],
                    "assignment_method": "official_map_lookup",
                })
        assignments.append(assigned)
    GEOCODE_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    with (OUTPUT_DIR / "apartment_base_supplement.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=BASE_FIELDS)
        writer.writeheader()
        writer.writerows(base_rows)
    if assignments:
        with (OUTPUT_DIR / "apartment_point_assignments_supplement.csv").open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(assignments[0]))
            writer.writeheader()
            writer.writerows(assignments)

    report = {
        "generated_at": date.today().isoformat(), "kapt": kapt_path.name, "shp": str(args.shp),
        "rules": {"approved_from": APPROVED_FROM, "duplicate_radius_m": DUPLICATE_RADIUS_M,
                  "duplicate_name_ratio": DUPLICATE_NAME_RATIO, "possible_replacement_m": POSSIBLE_REPLACEMENT_M,
                  "review_radius_m": REVIEW_RADIUS_M},
        "published_complexes": len(published), "candidates": len(found),
        "added": len(base_rows), "dropped_as_duplicate": len(dropped), "failed": len(failed),
        "added_by_region": dict(Counter(a["region"] for a in assignments)),
        "added_by_year": dict(Counter(b["use_aprv_yr"] for b in base_rows)),
        "added_households": sum(b["nmhsh"] for b in base_rows),
        "confidence": dict(Counter(a["confidence"] for a in assignments)),
        "no_zone": sum(1 for a in assignments if not a["primary_hakgudo_id"]),
        "possible_replacements": len(replacements),
        "replacements": replacements, "review_band": review, "dropped": dropped, "failures": failed,
    }
    (OUTPUT_DIR / "supplement_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ("review_band", "dropped", "failures", "replacements")},
                     ensure_ascii=False, indent=2))
    print(f"review band {len(review):,}, dropped {len(dropped):,}, failed {len(failed):,} -> {OUTPUT_DIR / 'supplement_report.json'}")
    if args.upload:
        upload(url, key, len(base_rows))


def upload(url: str, key: str, added: int) -> None:
    previous = storage_get_object(url, key, "supplement_report.json")
    if previous is not None:
        before = json.loads(previous)["added"]
        if before and added < before * (1 - SHRINK_LIMIT):
            raise SystemExit(f"supplement shrank {before:,} -> {added:,}; not uploading")
    for name in STORAGE_FILES:
        body = gzip.compress((OUTPUT_DIR / name).read_bytes(), compresslevel=6)
        recurring.upload_storage_object(url, key, BUCKET, f"{STORAGE_PREFIX}/{name}.gz", body)
    print(f"uploaded {len(STORAGE_FILES)} files to {BUCKET}/{STORAGE_PREFIX}/")


def storage_get_object(url: str, key: str, name: str) -> bytes | None:
    import urllib.error
    import urllib.request
    request = urllib.request.Request(f"{url}/storage/v1/object/{BUCKET}/{STORAGE_PREFIX}/{name}.gz",
                                     headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return gzip.decompress(response.read())
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 404):
            return None
        raise


def restore(url: str, key: str) -> bool:
    """For the monthly run: put the stored supplement where the builders read it."""
    bodies = {name: storage_get_object(url, key, name) for name in STORAGE_FILES}
    if any(body is None for body in bodies.values()):
        return False
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, body in bodies.items():
        (OUTPUT_DIR / name).write_bytes(body)
    return True


if __name__ == "__main__":
    main()
