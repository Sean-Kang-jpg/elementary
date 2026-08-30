"""Link the official school master to the latest paired Schoolinfo datasets."""

from __future__ import annotations

import csv
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
MASTER_V1 = OUTPUT_DIR / "school_master_v1_20260320.json"
GRADE_STUDENT_FIELDS = tuple(f"grade{i}_students" for i in range(1, 7))
GRADE_CLASS_FIELDS = tuple(f"grade{i}_classes" for i in range(1, 7))
GRADE_PER_CLASS_FIELDS = tuple(f"grade{i}_per_class" for i in range(1, 7))


def latest_schoolinfo_sources() -> tuple[int, Path, Path]:
    candidates: list[tuple[int, Path, Path]] = []
    for basic_path in OUTPUT_DIR.glob("schoolinfo_*_basic_capital.json"):
        match = re.fullmatch(r"schoolinfo_(\d{4})_basic_capital\.json", basic_path.name)
        if not match:
            continue
        year = int(match.group(1))
        grade_path = OUTPUT_DIR / f"schoolinfo_{year}_grade_students_capital.json"
        if grade_path.is_file():
            candidates.append((year, basic_path, grade_path))
    if not candidates:
        raise FileNotFoundError("no paired Schoolinfo basic and grade-student snapshots")
    return max(candidates, key=lambda item: item[0])


def text(value: Any) -> str:
    return str(value or "").strip()


def normalize(value: Any) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", text(value)).lower()


def normalize_name(value: Any) -> str:
    return normalize(re.sub(r"\(폐교\)$", "", text(value)))


def number(value: Any, kind: type[int] | type[float]) -> int | float | None:
    if value is None or value == "":
        return None
    try:
        return kind(value)
    except (TypeError, ValueError):
        return None


def region_from_address(value: Any) -> str:
    address = text(value)
    for region in ("서울특별시", "경기도", "인천광역시"):
        if address.startswith(region):
            return region
    return ""


def distance_m(lat1: Any, lon1: Any, lat2: Any, lon2: Any) -> float | None:
    values = [number(value, float) for value in (lat1, lon1, lat2, lon2)]
    if any(value is None for value in values):
        return None
    first_lat, first_lon, second_lat, second_lon = values
    radius = 6_371_000
    phi1, phi2 = math.radians(first_lat), math.radians(second_lat)
    dphi = math.radians(second_lat - first_lat)
    dlambda = math.radians(second_lon - first_lon)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def candidate_score(school: dict[str, Any], basic: dict[str, Any]) -> tuple[int, str, float | None]:
    school_address = normalize(school.get("address"))
    basic_address = normalize(basic.get("SCHUL_RDNMA"))
    address_exact = bool(school_address and school_address == basic_address)
    name_exact = normalize_name(school.get("school_name")) == normalize_name(basic.get("SCHUL_NM"))
    same_region = region_from_address(school.get("address_old") or school.get("address")) == region_from_address(
        basic.get("SCHUL_RDNMA") or basic.get("ADRES_BRKDN")
    )
    distance = distance_m(
        school.get("latitude"),
        school.get("longitude"),
        basic.get("LTTUD"),
        basic.get("LGTUD"),
    )

    if address_exact:
        return 130 + int(name_exact) * 20, "exact_address", distance
    if name_exact and same_region and distance is not None and distance <= 3000:
        distance_score = 30 if distance <= 100 else 20 if distance <= 500 else 10
        return 90 + distance_score, "name_region_distance", distance
    if name_exact and same_region:
        return 80, "name_region", distance
    if same_region and distance is not None and distance <= 50:
        return 70, "coordinate_50m", distance
    return 0, "no_match", distance


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    schoolinfo_year, basic_source, grade_source = latest_schoolinfo_sources()
    with MASTER_V1.open(encoding="utf-8") as handle:
        master = json.load(handle)
    with basic_source.open(encoding="utf-8") as handle:
        basic_rows = json.load(handle)
    with grade_source.open(encoding="utf-8") as handle:
        grade_rows = json.load(handle)

    basic_by_address: dict[str, list[dict[str, Any]]] = defaultdict(list)
    basic_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in basic_rows:
        basic_by_address[normalize(row.get("SCHUL_RDNMA"))].append(row)
        basic_by_name[normalize_name(row.get("SCHUL_NM"))].append(row)
    grade_by_code = {text(row.get("SCHUL_CODE")): row for row in grade_rows if text(row.get("SCHUL_CODE"))}
    grade_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in grade_rows:
        grade_by_name[normalize_name(row.get("SCHUL_NM"))].append(row)

    crosswalk: list[dict[str, Any]] = []
    used_codes: set[str] = set()
    for school in master:
        candidates: dict[str, dict[str, Any]] = {}
        address_key = normalize(school.get("address"))
        name_key = normalize_name(school.get("school_name"))
        for row in basic_by_address.get(address_key, []) + basic_by_name.get(name_key, []):
            code = text(row.get("SCHUL_CODE"))
            if code:
                candidates[code] = row

        ranked = []
        for code, row in candidates.items():
            score, method, distance = candidate_score(school, row)
            if score:
                ranked.append((score, code, method, distance, row))
        ranked.sort(key=lambda item: (-item[0], item[3] if item[3] is not None else float("inf"), item[1]))

        status = "unmatched"
        selected: tuple[int, str, str, float | None, dict[str, Any]] | None = None
        grade_selected: dict[str, Any] | None = None
        if ranked:
            if len(ranked) == 1 or ranked[0][0] > ranked[1][0]:
                selected = ranked[0]
                status = "matched"
            elif ranked[0][3] is not None and ranked[1][3] is not None and ranked[0][3] + 100 < ranked[1][3]:
                selected = ranked[0]
                status = "matched"
            else:
                status = "ambiguous"

        if not selected and status == "unmatched":
            official_support = normalize(school.get("education_support_office"))
            grade_candidates = grade_by_name.get(name_key, [])
            support_matches = [
                row for row in grade_candidates if normalize(row.get("JU_ORG_NM")) == official_support
            ]
            if len(support_matches) == 1:
                grade_selected = support_matches[0]
                status = "matched"

        selected_code = selected[1] if selected else text(grade_selected.get("SCHUL_CODE")) if grade_selected else ""
        if selected_code and selected_code in used_codes:
            selected = None
            grade_selected = None
            selected_code = ""
            status = "duplicate_code_rejected"
        if selected_code:
            used_codes.add(selected_code)

        crosswalk.append({
            "school_id": school["school_id"],
            "school_name": school["school_name"],
            "address": school["address"],
            "schoolinfo_code": selected_code or None,
            "schoolinfo_name": selected[4].get("SCHUL_NM") if selected else grade_selected.get("SCHUL_NM") if grade_selected else None,
            "schoolinfo_address": selected[4].get("SCHUL_RDNMA") if selected else None,
            "match_status": status,
            "match_method": selected[2] if selected else "exact_name_support_office" if grade_selected else None,
            "match_score": selected[0] if selected else 85 if grade_selected else None,
            "distance_m": round(selected[3], 1) if selected and selected[3] is not None else None,
            "candidate_count": len(ranked) if ranked else len(support_matches) if grade_selected else 0,
        })

    crosswalk_by_id = {row["school_id"]: row for row in crosswalk}
    basic_by_code = {text(row.get("SCHUL_CODE")): row for row in basic_rows if text(row.get("SCHUL_CODE"))}
    enriched: list[dict[str, Any]] = []
    for original in master:
        row = dict(original)
        link = crosswalk_by_id[row["school_id"]]
        code = text(link.get("schoolinfo_code"))
        basic = basic_by_code.get(code)
        grade = grade_by_code.get(code)
        row.update({
            "schoolinfo_code": code or None,
            "schoolinfo_match_status": link["match_status"],
            "schoolinfo_match_method": link["match_method"],
            "schoolinfo_match_distance_m": link["distance_m"],
            "homepage": basic.get("HMPG_ADRES") if basic else None,
            "phone": basic.get("USER_TELNO") if basic else None,
            "schoolinfo_closed": basic.get("CLOSE_YN") if basic else None,
        })
        if grade:
            for index in range(1, 7):
                row[f"grade{index}_students"] = number(grade.get(f"COL_S{index}"), int)
                row[f"grade{index}_classes"] = number(grade.get(f"COL_C{index}"), int)
                row[f"grade{index}_per_class"] = number(grade.get(f"COL_{index}"), float)
            row["total_students"] = number(grade.get("COL_S_SUM"), int)
            row["teachers"] = number(grade.get("TEACH_CNT"), int)
            row["student_data_status"] = f"observed_schoolinfo_{schoolinfo_year}"
            row["student_data_source"] = f"Schoolinfo apiType=09 pbanYr={schoolinfo_year}"
        elif row.get("student_data_status") == "observed_legacy_keris":
            row["student_data_status"] = "fallback_legacy_keris_2025"

        grade_values = [row.get(field) for field in GRADE_STUDENT_FIELDS]
        if all(value is not None for value in grade_values):
            row["grade1_6_students_sum"] = sum(grade_values)
            row["other_students"] = (
                row["total_students"] - row["grade1_6_students_sum"]
                if row.get("total_students") is not None
                else None
            )
        else:
            row["grade1_6_students_sum"] = None
            row["other_students"] = None
        enriched.append(row)

    csv_path = OUTPUT_DIR / "school_master_v2_20260320.csv"
    json_path = OUTPUT_DIR / "school_master_v2_20260320.json"
    crosswalk_path = OUTPUT_DIR / f"school_id_schoolinfo_crosswalk_{schoolinfo_year}.csv"
    write_csv(csv_path, enriched, list(enriched[0]))
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(enriched, handle, ensure_ascii=False, indent=2)
    write_csv(crosswalk_path, crosswalk, list(crosswalk[0]))

    match_counts = Counter(row["match_status"] for row in crosswalk)
    method_counts = Counter(row["match_method"] or "none" for row in crosswalk)
    student_counts = Counter(row["student_data_status"] for row in enriched)
    report = {
        "generated_at": datetime.now().isoformat(),
        "schoolinfo_year": schoolinfo_year,
        "schoolinfo_basic_source": basic_source.name,
        "schoolinfo_grade_source": grade_source.name,
        "schools": len(enriched),
        "schoolinfo_basic_rows": len(basic_rows),
        "schoolinfo_grade_rows": len(grade_rows),
        "crosswalk_status_counts": dict(sorted(match_counts.items())),
        "crosswalk_method_counts": dict(sorted(method_counts.items())),
        "student_data_status_counts": dict(sorted(student_counts.items())),
        "schoolinfo_codes_unique": len({row["schoolinfo_code"] for row in crosswalk if row["schoolinfo_code"]}),
        "unmatched_or_ambiguous": [
            row for row in crosswalk if row["match_status"] != "matched"
        ],
        "outputs": [csv_path.name, json_path.name, crosswalk_path.name],
    }
    with (OUTPUT_DIR / "school_master_v2_report.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
