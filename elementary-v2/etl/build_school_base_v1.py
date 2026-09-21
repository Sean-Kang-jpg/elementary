#!/usr/bin/env python3
"""Build a scoped school base master from the nationwide school standard data.

The capital region has a reviewed base master, `school_master_v1_20260320.json`,
produced by `build_school_master_v1.py` from v1-era per-region snapshots that no
longer exist. A new expansion wave has no equivalent, so it starts from the
nationwide school standard data instead, which carries the same identifiers,
addresses, offices, and coordinates.

The output has the same shape as the reviewed baseline, with the Schoolinfo
enrichment fields left empty for `build_school_master_v2.py` to fill.

    python etl/build_school_base_v1.py 대전광역시
    python etl/build_school_base_v1.py 전라남도 --cities 목포시

The reviewed capital baseline is never overwritten: the output name carries the
scope slug, and the capital scope is refused.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/build_school_base_v1.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl.fetch_schoolinfo_2026 import build_scopes, scope_slug
from etl.region_registry import RegionScope, load_registry

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
STANDARD_DATA = BASE_DIR / "data" / "schoolzone" / "school_location_20260320.csv"
ELEMENTARY = "초등학교"

GRADE_FIELDS = tuple(
    f"grade{grade}_{metric}"
    for metric in ("students", "classes", "per_class")
    for grade in range(1, 7)
)
ENRICHMENT_FIELDS = (
    "neis_school_code",
    "neis_link_status",
    *GRADE_FIELDS,
    "total_students",
    "teachers",
    "student_data_status",
    "student_data_source",
    "grade1_6_students_sum",
    "other_students",
)


def text(value: Any) -> str:
    return str(value or "").strip()


def number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def school_address(row: dict[str, str]) -> str:
    return text(row.get("소재지도로명주소")) or text(row.get("소재지지번주소"))


def to_base_row(row: dict[str, str]) -> dict[str, Any]:
    """Map a standard-data row onto the reviewed baseline's shape."""
    base: dict[str, Any] = {
        "school_id": text(row.get("학교ID")),
        "school_name": text(row.get("학교명")),
        "school_type": text(row.get("학교급구분")),
        "establishment_date": text(row.get("설립일자")) or None,
        "establishment_type": text(row.get("설립형태")) or None,
        "campus_type": text(row.get("본교분교구분")) or None,
        "operation_status": text(row.get("운영상태")) or None,
        "address_old": text(row.get("소재지지번주소")) or None,
        "address": text(row.get("소재지도로명주소")) or None,
        "education_office_code": text(row.get("시도교육청코드")) or None,
        "education_office": text(row.get("시도교육청명")) or None,
        "education_support_office_code": text(row.get("교육지원청코드")) or None,
        "education_support_office": text(row.get("교육지원청명")) or None,
        "source_created_date": text(row.get("생성일자")) or None,
        "source_modified_date": text(row.get("변경일자")) or None,
        "latitude": number(row.get("위도")),
        "longitude": number(row.get("경도")),
        "reference_date": text(row.get("데이터기준일자")) or None,
        "school_base_source": "school_standard_data",
    }
    base.update({field: None for field in ENRICHMENT_FIELDS})
    return base


def select_rows(scopes: list[RegionScope], source: Path) -> list[dict[str, str]]:
    with source.open(encoding="utf-8-sig", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("학교급구분") == ELEMENTARY]
    return [row for row in rows if any(scope.includes_address(school_address(row)) for scope in scopes)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("regions", nargs="+", help="registry region names")
    parser.add_argument("--cities", nargs="*", default=(), help="restrict a single region to these cities")
    parser.add_argument("--source", type=Path, default=STANDARD_DATA)
    parser.add_argument("--out-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args(argv)

    registry = load_registry()
    scopes = list(build_scopes(registry, args.regions, args.cities))
    slug = scope_slug(scopes)
    if slug == "capital":
        parser.error(
            "the capital scope has a reviewed baseline in school_master_v1_20260320.json; "
            "this builder is for new expansion scopes"
        )
    if not args.source.exists():
        parser.error(f"school standard data not found: {args.source}")

    selected = select_rows(scopes, args.source)
    if not selected:
        parser.error(f"no elementary schools matched {', '.join(scope.label for scope in scopes)}")

    base_rows = [to_base_row(row) for row in selected]
    duplicates = len(base_rows) - len({row["school_id"] for row in base_rows})
    missing_coordinates = [row["school_name"] for row in base_rows if row["latitude"] is None]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    output_path = args.out_dir / f"school_master_v1_{slug}.json"
    output_path.write_text(
        json.dumps(base_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    report = {
        "scope": [scope.label for scope in scopes],
        "scope_slug": slug,
        "registry_version": registry.registry_version,
        "source": str(args.source.name),
        "schools": len(base_rows),
        "duplicate_school_ids": duplicates,
        "missing_coordinates": missing_coordinates,
        "campus_types": {
            value: sum(1 for row in base_rows if row["campus_type"] == value)
            for value in sorted({row["campus_type"] or "" for row in base_rows})
        },
        "education_support_offices": {
            value: sum(1 for row in base_rows if row["education_support_office"] == value)
            for value in sorted({row["education_support_office"] or "" for row in base_rows})
        },
        "output": output_path.name,
    }
    (args.out_dir / f"school_master_v1_{slug}_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if duplicates:
        print(f"WARNING: {duplicates} duplicate school_id values")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
