"""Audit the capital-region apartment master and local K-apt snapshot."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parents[2]
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
APT_SOURCE = ROOT_DIR / "archive" / "GAS" / "GAS" / "임시" / "apt_mst_info_202410.csv"
KAPT_SOURCE = ROOT_DIR / "archive" / "legacy-v1" / "etl" / "data" / "kapt" / "20250801_apt_data.csv"
ASSIGNMENT_SOURCE = OUTPUT_DIR / "apartment_point_assignments.json"
TARGET_CODES = {"11": "서울특별시", "41": "경기도", "28": "인천광역시"}
TARGET_REGIONS = set(TARGET_CODES.values())


def text(value: Any) -> str:
    return str(value or "").strip()


def normalize(value: Any) -> str:
    normalized = text(value).replace("서울시", "서울특별시").replace("인천시", "인천광역시")
    normalized = re.sub(r"\([^)]*\)", "", normalized)
    return re.sub(r"[^0-9A-Za-z가-힣]", "", normalized).lower()


def normalize_name(value: Any) -> str:
    normalized = re.sub(r"(?:아파트|apt)$", "", text(value), flags=re.IGNORECASE)
    return normalize(normalized)


def numeric(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def address_candidates(value: Any) -> set[str]:
    candidates = {normalize(part) for part in text(value).split(",") if normalize(part)}
    normalized = normalize(value)
    if normalized:
        candidates.add(normalized)
    return candidates


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    apartments: list[dict[str, str]] = []
    with APT_SOURCE.open(encoding="cp949", newline="") as handle:
        for row in csv.DictReader(handle):
            legal_code = text(row.get("legaldong_cd"))
            if legal_code[:2] in TARGET_CODES:
                apartments.append(row)

    kapt_rows: list[dict[str, str]] = []
    with KAPT_SOURCE.open(encoding="cp949", newline="") as handle:
        for row in csv.DictReader(handle):
            if text(row.get("시도")) in TARGET_REGIONS:
                kapt_rows.append(row)

    with ASSIGNMENT_SOURCE.open(encoding="utf-8") as handle:
        assignments = json.load(handle)
    assignment_ids = {text(row.get("apt_cd")) for row in assignments}

    apt_id_counts = Counter(text(row.get("apt_cd")) for row in apartments)
    uid_counts = Counter(text(row.get("uid")) for row in apartments)
    name_address_counts = Counter(
        (normalize_name(row.get("apt_nm")), normalize(row.get("rdnmadr"))) for row in apartments
    )
    kapt_code_counts = Counter(text(row.get("단지코드")) for row in kapt_rows)

    kapt_road_index: dict[str, set[str]] = defaultdict(set)
    kapt_legal_index: dict[str, set[str]] = defaultdict(set)
    kapt_name_district_index: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for row in kapt_rows:
        code = text(row.get("단지코드"))
        for candidate in address_candidates(row.get("도로명주소")):
            kapt_road_index[candidate].add(code)
        for candidate in address_candidates(row.get("법정동주소")):
            kapt_legal_index[candidate].add(code)
        kapt_name_district_index[
            (text(row.get("시도")), text(row.get("시군구")), normalize_name(row.get("단지명")))
        ].add(code)

    issues: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    exact_road = 0
    exact_legal = 0
    exact_name_district = 0
    any_exact = 0
    ambiguous_exact = 0
    valid_coordinates = 0

    for row in apartments:
        apt_id = text(row.get("apt_cd"))
        lat = numeric(row.get("la"))
        lon = numeric(row.get("lo"))
        valid_coords = lat is not None and lon is not None and 33 <= lat <= 39 and 124 <= lon <= 132
        valid_coordinates += int(valid_coords)
        if apt_id not in assignment_ids:
            excluded.append({
                "apt_cd": apt_id,
                "apt_nm": row.get("apt_nm"),
                "road_address": row.get("rdnmadr"),
                "legal_address": row.get("lnno_adres"),
                "legal_dong_code": row.get("legaldong_cd"),
                "households": row.get("nmhsh"),
                "longitude": row.get("lo"),
                "latitude": row.get("la"),
                "reason": "invalid_or_missing_coordinates" if not valid_coords else "not_in_assignment_output",
            })

        if not apt_id or apt_id_counts[apt_id] > 1:
            issues.append({"apt_cd": apt_id, "apt_nm": row.get("apt_nm"), "issue_type": "duplicate_or_blank_apt_cd", "detail": apt_id_counts[apt_id]})
        if not text(row.get("uid")) or uid_counts[text(row.get("uid"))] > 1:
            issues.append({"apt_cd": apt_id, "apt_nm": row.get("apt_nm"), "issue_type": "duplicate_or_blank_uid", "detail": uid_counts[text(row.get("uid"))]})
        if not text(row.get("apt_nm")):
            issues.append({"apt_cd": apt_id, "apt_nm": "", "issue_type": "blank_name", "detail": ""})
        if not text(row.get("rdnmadr")):
            issues.append({"apt_cd": apt_id, "apt_nm": row.get("apt_nm"), "issue_type": "blank_road_address", "detail": ""})
        if not valid_coords:
            issues.append({"apt_cd": apt_id, "apt_nm": row.get("apt_nm"), "issue_type": "invalid_coordinates", "detail": f"lo={row.get('lo')}, la={row.get('la')}"})
        if name_address_counts[(normalize_name(row.get("apt_nm")), normalize(row.get("rdnmadr")))] > 1:
            issues.append({"apt_cd": apt_id, "apt_nm": row.get("apt_nm"), "issue_type": "duplicate_normalized_name_address", "detail": row.get("rdnmadr")})

        road_codes: set[str] = set()
        for candidate in address_candidates(row.get("rdnmadr")):
            road_codes.update(kapt_road_index.get(candidate, set()))
        legal_codes: set[str] = set()
        for candidate in address_candidates(row.get("lnno_adres")):
            legal_codes.update(kapt_legal_index.get(candidate, set()))
        region = TARGET_CODES.get(text(row.get("legaldong_cd"))[:2], "")
        road_parts = text(row.get("rdnmadr")).split()
        district = road_parts[1] if len(road_parts) > 1 else ""
        name_codes = kapt_name_district_index.get((region, district, normalize_name(row.get("apt_nm"))), set())

        exact_road += int(len(road_codes) == 1)
        exact_legal += int(len(legal_codes) == 1)
        exact_name_district += int(len(name_codes) == 1)
        combined = road_codes | legal_codes | name_codes
        any_exact += int(len(combined) == 1)
        ambiguous_exact += int(len(combined) > 1)

    report = {
        "generated_at": datetime.now().isoformat(),
        "sources": {
            "apartment_master": str(APT_SOURCE),
            "kapt": str(KAPT_SOURCE),
            "assignments": str(ASSIGNMENT_SOURCE),
        },
        "apartment_master": {
            "capital_rows": len(apartments),
            "assignment_rows": len(assignments),
            "excluded_from_assignment": len(excluded),
            "valid_coordinates": valid_coordinates,
            "unique_apt_ids": len({key for key in apt_id_counts if key}),
            "duplicate_apt_ids": sum(1 for key, count in apt_id_counts.items() if key and count > 1),
            "duplicate_uids": sum(1 for key, count in uid_counts.items() if key and count > 1),
            "by_region": dict(sorted(Counter(TARGET_CODES[text(row.get("legaldong_cd"))[:2]] for row in apartments).items())),
        },
        "kapt": {
            "capital_rows": len(kapt_rows),
            "unique_codes": len({key for key in kapt_code_counts if key}),
            "duplicate_codes": sum(1 for key, count in kapt_code_counts.items() if key and count > 1),
            "by_region": dict(sorted(Counter(text(row.get("시도")) for row in kapt_rows).items())),
        },
        "exact_link_probe": {
            "unique_road_address": exact_road,
            "unique_legal_address": exact_legal,
            "unique_name_district": exact_name_district,
            "unique_combined_candidate": any_exact,
            "ambiguous_combined_candidate": ambiguous_exact,
        },
        "issue_counts": dict(sorted(Counter(row["issue_type"] for row in issues).items())),
    }

    with (OUTPUT_DIR / "apartment_etl_audit_report.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    write_csv(
        OUTPUT_DIR / "apartment_assignment_excluded.csv",
        excluded,
        ["apt_cd", "apt_nm", "road_address", "legal_address", "legal_dong_code", "households", "longitude", "latitude", "reason"],
    )
    write_csv(
        OUTPUT_DIR / "apartment_etl_issues.csv",
        issues,
        ["apt_cd", "apt_nm", "issue_type", "detail"],
    )
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
