"""Build a 2026 capital-region elementary school master with legacy KERIS enrichment."""

from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
OFFICIAL_SOURCE = BASE_DIR / "data" / "schoolzone" / "school_location_20260320.csv"
LEGACY_SOURCES = {
    "서울특별시 ": BASE_DIR / "seoul_integrated_schools_20250920_094604.json",
    "경기도 ": BASE_DIR / "gyeonggi_integrated_schools_20250919_193925.json",
    "인천광역시 ": BASE_DIR / "incheon_integrated_schools_20250919_194100.json",
}
CAPITAL_EDUCATION_OFFICES = {
    "서울특별시교육청",
    "경기도교육청",
    "인천광역시교육청",
}
GRADE_STUDENT_FIELDS = tuple(f"grade{i}_students" for i in range(1, 7))
GRADE_CLASS_FIELDS = tuple(f"grade{i}_classes" for i in range(1, 7))
GRADE_PER_CLASS_FIELDS = tuple(f"grade{i}_per_class" for i in range(1, 7))


def int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_legacy() -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    clean: dict[str, dict[str, Any]] = {}
    stats: dict[str, Any] = {"raw_rows": 0, "accepted_rows": 0, "foreign_rows": 0, "duplicate_ids": []}

    for expected_prefix, path in LEGACY_SOURCES.items():
        with path.open(encoding="utf-8") as handle:
            rows = json.load(handle)
        stats["raw_rows"] += len(rows)
        for row in rows:
            if not str(row.get("address") or "").startswith(expected_prefix):
                stats["foreign_rows"] += 1
                continue
            school_id = str(row.get("school_id") or "")
            if school_id in clean:
                stats["duplicate_ids"].append(school_id)
                continue
            clean[school_id] = row
            stats["accepted_rows"] += 1
    return clean, stats


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    legacy, legacy_stats = load_legacy()

    with OFFICIAL_SOURCE.open(encoding="utf-8-sig", newline="") as handle:
        official_candidates = [
            row
            for row in csv.DictReader(handle)
            if row["시도교육청명"] in CAPITAL_EDUCATION_OFFICES and row["학교급구분"] == "초등학교"
        ]
    school_type_conflicts = [row for row in official_candidates if "초등학교" not in row["학교명"]]
    official_rows = [row for row in official_candidates if "초등학교" in row["학교명"]]
    official_ids = {row["학교ID"] for row in official_rows}
    legacy_only = [
        {
            "school_id": school_id,
            "school_name": str(row.get("school_name") or ""),
            "address": str(row.get("address") or ""),
            "operation_status": str(row.get("operation_status") or ""),
        }
        for school_id, row in legacy.items()
        if school_id not in official_ids
    ]

    master: list[dict[str, Any]] = []
    exact_enriched = 0
    keris_observed = 0
    legacy_unmatched = 0
    new_or_missing_stats = 0
    name_changes: list[dict[str, str]] = []

    for official in official_rows:
        school_id = official["학교ID"]
        old = legacy.get(school_id)
        row: dict[str, Any] = {
            "school_id": school_id,
            "school_name": official["학교명"],
            "school_type": official["학교급구분"],
            "establishment_date": official["설립일자"],
            "establishment_type": official["설립형태"],
            "campus_type": official["본교분교구분"],
            "operation_status": official["운영상태"],
            "address_old": official["소재지지번주소"],
            "address": official["소재지도로명주소"],
            "education_office_code": official["시도교육청코드"],
            "education_office": official["시도교육청명"],
            "education_support_office_code": official["교육지원청코드"],
            "education_support_office": official["교육지원청명"],
            "source_created_date": official["생성일자"],
            "source_modified_date": official["변경일자"],
            "latitude": float_or_none(official["위도"]),
            "longitude": float_or_none(official["경도"]),
            "reference_date": official["데이터기준일자"],
            "school_base_source": OFFICIAL_SOURCE.name,
            "neis_school_code": None,
            "neis_link_status": "missing_source",
        }

        if old:
            exact_enriched += 1
            if old.get("school_name") != official["학교명"]:
                name_changes.append({
                    "school_id": school_id,
                    "legacy_name": str(old.get("school_name") or ""),
                    "official_name": official["학교명"],
                })
            for field in GRADE_STUDENT_FIELDS + GRADE_CLASS_FIELDS:
                row[field] = int_or_none(old.get(field)) if old.get("keris_matched") else None
            for field in GRADE_PER_CLASS_FIELDS:
                row[field] = float_or_none(old.get(field)) if old.get("keris_matched") else None
            if old.get("keris_matched"):
                keris_observed += 1
                row["total_students"] = int_or_none(old.get("total_students"))
                row["teachers"] = int_or_none(old.get("teachers"))
                row["student_data_status"] = "observed_legacy_keris"
            else:
                legacy_unmatched += 1
                row["total_students"] = None
                row["teachers"] = None
                row["student_data_status"] = "legacy_keris_unmatched"
        else:
            new_or_missing_stats += 1
            for field in GRADE_STUDENT_FIELDS + GRADE_CLASS_FIELDS + GRADE_PER_CLASS_FIELDS:
                row[field] = None
            row["total_students"] = None
            row["teachers"] = None
            row["student_data_status"] = "no_legacy_school_row"

        row["student_data_source"] = "KERIS 2025-09 ETL snapshot" if old else None
        grade_values = [row[field] for field in GRADE_STUDENT_FIELDS]
        if all(value is not None for value in grade_values):
            grade_sum = sum(grade_values)
            row["grade1_6_students_sum"] = grade_sum
            row["other_students"] = (
                row["total_students"] - grade_sum if row["total_students"] is not None else None
            )
        else:
            row["grade1_6_students_sum"] = None
            row["other_students"] = None
        master.append(row)

    fieldnames = list(master[0])
    csv_path = OUTPUT_DIR / "school_master_v1_20260320.csv"
    json_path = OUTPUT_DIR / "school_master_v1_20260320.json"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(master)
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(master, handle, ensure_ascii=False, indent=2)

    exceptions_path = OUTPUT_DIR / "school_master_v1_exceptions.csv"
    with exceptions_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["exception_type", "school_id", "school_name", "detail"],
        )
        writer.writeheader()
        for row in school_type_conflicts:
            writer.writerow({
                "exception_type": "official_school_type_name_conflict",
                "school_id": row["학교ID"],
                "school_name": row["학교명"],
                "detail": f"학교급구분={row['학교급구분']}; address={row['소재지도로명주소']}",
            })
        for row in legacy_only:
            writer.writerow({
                "exception_type": "legacy_school_missing_from_official_20260320",
                "school_id": row["school_id"],
                "school_name": row["school_name"],
                "detail": row["address"],
            })

    office_counts = Counter(row["education_office"] for row in master)
    campus_counts = Counter(row["campus_type"] for row in master)
    status_counts = Counter(row["student_data_status"] for row in master)
    missing_coordinates = sum(row["latitude"] is None or row["longitude"] is None for row in master)
    missing_addresses = sum(not row["address"] for row in master)
    report = {
        "generated_at": datetime.now().isoformat(),
        "official_source": OFFICIAL_SOURCE.name,
        "official_elementary_candidates": len(official_candidates),
        "official_school_type_name_conflicts": len(school_type_conflicts),
        "school_type_conflict_rows": [
            {"school_id": row["학교ID"], "school_name": row["학교명"]}
            for row in school_type_conflicts
        ],
        "official_elementary_schools": len(master),
        "education_office_counts": dict(sorted(office_counts.items())),
        "campus_type_counts": dict(sorted(campus_counts.items())),
        "legacy_input": legacy_stats,
        "exact_school_id_enriched": exact_enriched,
        "keris_observed": keris_observed,
        "legacy_keris_unmatched": legacy_unmatched,
        "no_legacy_school_row": new_or_missing_stats,
        "student_data_status_counts": dict(sorted(status_counts.items())),
        "missing_coordinates": missing_coordinates,
        "missing_addresses": missing_addresses,
        "neis_codes_present": 0,
        "name_change_count": len(name_changes),
        "name_changes": name_changes,
        "legacy_only_count": len(legacy_only),
        "legacy_only": legacy_only,
        "outputs": [csv_path.name, json_path.name, exceptions_path.name],
    }
    with (OUTPUT_DIR / "school_master_v1_report.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
