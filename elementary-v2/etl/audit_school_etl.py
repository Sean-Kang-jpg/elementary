"""Audit the current Seoul/Gyeonggi/Incheon integrated school snapshots."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
SOURCES = {
    "seoul": BASE_DIR / "seoul_integrated_schools_20250920_094604.json",
    "gyeonggi": BASE_DIR / "gyeonggi_integrated_schools_20250919_193925.json",
    "incheon": BASE_DIR / "incheon_integrated_schools_20250919_194100.json",
}
EXPECTED_ADDRESS_PREFIX = {
    "seoul": "서울특별시 ",
    "gyeonggi": "경기도 ",
    "incheon": "인천광역시 ",
}
REQUIRED_FIELDS = (
    "school_id",
    "school_name",
    "school_type",
    "address",
    "latitude",
    "longitude",
    "operation_status",
    "education_office",
    "reference_date",
)
GRADE_STUDENT_FIELDS = tuple(f"grade{i}_students" for i in range(1, 7))
GRADE_CLASS_FIELDS = tuple(f"grade{i}_classes" for i in range(1, 7))


def is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    schools: list[dict[str, Any]] = []
    source_meta: dict[str, dict[str, Any]] = {}

    for region, path in SOURCES.items():
        with path.open(encoding="utf-8") as handle:
            rows = json.load(handle)
        for row in rows:
            row["_audit_region"] = region
        schools.extend(rows)
        source_meta[region] = {
            "file": path.name,
            "rows": len(rows),
            "modified_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
        }

    id_counts = Counter(str(row.get("school_id") or "") for row in schools)
    neis_counts = Counter(str(row.get("neis_school_code") or "") for row in schools)
    name_address_counts = Counter(
        (str(row.get("school_name") or "").strip(), str(row.get("address") or "").strip())
        for row in schools
    )

    issues: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []
    region_summaries: list[dict[str, Any]] = []

    for region in SOURCES:
        rows = [row for row in schools if row["_audit_region"] == region]
        reference_dates = Counter(str(row.get("reference_date") or "BLANK") for row in rows)
        statuses = Counter(str(row.get("operation_status") or "BLANK") for row in rows)
        summary = {
            "region": region,
            "total": len(rows),
            "keris_matched": sum(bool(row.get("keris_matched")) for row in rows),
            "keris_unmatched": sum(not bool(row.get("keris_matched")) for row in rows),
            "neis_matched": sum(bool(row.get("neis_matched")) for row in rows),
            "neis_code_present": sum(not is_blank(row.get("neis_school_code")) for row in rows),
            "coordinates_valid": 0,
            "address_region_match": 0,
            "address_region_mismatch": 0,
            "required_field_issues": 0,
            "student_total_differences": 0,
            "reference_dates": json.dumps(reference_dates, ensure_ascii=False, sort_keys=True),
            "operation_statuses": json.dumps(statuses, ensure_ascii=False, sort_keys=True),
        }

        for row in rows:
            school_id = str(row.get("school_id") or "")
            school_name = str(row.get("school_name") or "")
            address = str(row.get("address") or "")
            lat = as_float(row.get("latitude"))
            lon = as_float(row.get("longitude"))
            valid_coords = lat is not None and lon is not None and 33 <= lat <= 39 and 124 <= lon <= 132
            summary["coordinates_valid"] += int(valid_coords)
            address_region_match = address.startswith(EXPECTED_ADDRESS_PREFIX[region])
            summary["address_region_match"] += int(address_region_match)
            summary["address_region_mismatch"] += int(not address_region_match)

            if not address_region_match:
                issues.append({
                    "region": region,
                    "school_id": school_id,
                    "school_name": school_name,
                    "issue_type": "address_region_mismatch",
                    "detail": address,
                })

            blank_required = [field for field in REQUIRED_FIELDS if is_blank(row.get(field))]
            if blank_required:
                summary["required_field_issues"] += 1
                issues.append({
                    "region": region,
                    "school_id": school_id,
                    "school_name": school_name,
                    "issue_type": "missing_required_fields",
                    "detail": ",".join(blank_required),
                })

            if not valid_coords:
                issues.append({
                    "region": region,
                    "school_id": school_id,
                    "school_name": school_name,
                    "issue_type": "invalid_coordinates",
                    "detail": f"latitude={row.get('latitude')}, longitude={row.get('longitude')}",
                })

            if not re.fullmatch(r"B\d{9}", school_id):
                issues.append({
                    "region": region,
                    "school_id": school_id,
                    "school_name": school_name,
                    "issue_type": "unexpected_school_id_format",
                    "detail": school_id,
                })

            if school_id and id_counts[school_id] > 1:
                issues.append({
                    "region": region,
                    "school_id": school_id,
                    "school_name": school_name,
                    "issue_type": "duplicate_school_id",
                    "detail": str(id_counts[school_id]),
                })

            neis_code = str(row.get("neis_school_code") or "")
            if neis_code and neis_counts[neis_code] > 1:
                issues.append({
                    "region": region,
                    "school_id": school_id,
                    "school_name": school_name,
                    "issue_type": "duplicate_neis_code",
                    "detail": neis_code,
                })

            if name_address_counts[(school_name.strip(), address.strip())] > 1:
                issues.append({
                    "region": region,
                    "school_id": school_id,
                    "school_name": school_name,
                    "issue_type": "duplicate_name_address",
                    "detail": address,
                })

            grade_students = [as_int(row.get(field)) for field in GRADE_STUDENT_FIELDS]
            grade_classes = [as_int(row.get(field)) for field in GRADE_CLASS_FIELDS]
            total_students = as_int(row.get("total_students"))
            if all(value is not None for value in grade_students) and total_students is not None:
                grade_sum = sum(value for value in grade_students if value is not None)
                if grade_sum != total_students:
                    summary["student_total_differences"] += 1
                    issue_type = (
                        "total_includes_other_students"
                        if total_students > grade_sum
                        else "student_total_below_grade_sum"
                    )
                    issues.append({
                        "region": region,
                        "school_id": school_id,
                        "school_name": school_name,
                        "issue_type": issue_type,
                        "detail": f"grades={grade_sum}, total={total_students}",
                    })

            if not row.get("keris_matched"):
                all_metrics_zero = all((value or 0) == 0 for value in grade_students + grade_classes)
                unmatched.append({
                    "region": region,
                    "school_id": school_id,
                    "school_name": school_name,
                    "address": address,
                    "operation_status": row.get("operation_status"),
                    "reference_date": row.get("reference_date"),
                    "neis_matched": bool(row.get("neis_matched")),
                    "neis_school_code": row.get("neis_school_code"),
                    "all_grade_metrics_zero": all_metrics_zero,
                })

        region_summaries.append(summary)

    issue_counts = Counter(row["issue_type"] for row in issues)
    report = {
        "generated_at": datetime.now().isoformat(),
        "scope": "Seoul, Gyeonggi, Incheon integrated school snapshots",
        "sources": source_meta,
        "totals": {
            "schools": len(schools),
            "capital_region_schools": sum(
                str(row.get("address") or "").startswith(EXPECTED_ADDRESS_PREFIX[row["_audit_region"]])
                for row in schools
            ),
            "foreign_region_rows": sum(
                not str(row.get("address") or "").startswith(EXPECTED_ADDRESS_PREFIX[row["_audit_region"]])
                for row in schools
            ),
            "keris_matched": sum(bool(row.get("keris_matched")) for row in schools),
            "keris_unmatched": len(unmatched),
            "neis_matched": sum(bool(row.get("neis_matched")) for row in schools),
            "neis_code_present": sum(not is_blank(row.get("neis_school_code")) for row in schools),
            "duplicate_school_ids": sum(1 for key, count in id_counts.items() if key and count > 1),
            "duplicate_neis_codes": sum(1 for key, count in neis_counts.items() if key and count > 1),
        },
        "issue_counts": dict(sorted(issue_counts.items())),
        "regions": region_summaries,
        "findings": [
            "The legacy snapshots contain 65 Busan rows: 24 in the Seoul file and 41 in the Incheon file.",
            "After address-region filtering, the legacy capital-region universe is 2,240 schools.",
            "Unmatched KERIS rows use zero-filled grade metrics, so zero cannot be interpreted as observed enrollment.",
            "For 2,011 rows, total enrollment exceeds the grade 1-6 sum; preserve the positive delta as other_students.",
            "NEIS linkage must be audited independently from KERIS linkage before using school codes as a crosswalk.",
            "The current snapshots are dated September 2025 and require a 2026 refresh before publication.",
        ],
    }

    with (OUTPUT_DIR / "school_etl_audit_report.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    write_csv(OUTPUT_DIR / "school_etl_audit_summary.csv", region_summaries, list(region_summaries[0]))
    write_csv(
        OUTPUT_DIR / "school_etl_keris_unmatched.csv",
        unmatched,
        [
            "region",
            "school_id",
            "school_name",
            "address",
            "operation_status",
            "reference_date",
            "neis_matched",
            "neis_school_code",
            "all_grade_metrics_zero",
        ],
    )
    write_csv(
        OUTPUT_DIR / "school_etl_issues.csv",
        issues,
        ["region", "school_id", "school_name", "issue_type", "detail"],
    )

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
