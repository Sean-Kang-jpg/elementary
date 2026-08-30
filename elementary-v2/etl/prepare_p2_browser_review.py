#!/usr/bin/env python3
"""Prepare a consistent browser-review sheet for official-polygon conflicts."""

import argparse
import csv
from pathlib import Path


BASE = Path(__file__).parent
DEFAULT_INPUT = BASE / "local_outputs_20260320" / "high_confidence_geomarket_difference_analysis.csv"
DEFAULT_OUTPUT = BASE / "local_outputs_20260320" / "p2_hakgudo_browser_review.csv"
SCHOOLZONE_URL = "https://schoolzone.emac.kr/gis/gis.do"


def main():
    parser = argparse.ArgumentParser(description="Create a P2 official school-zone browser review sheet.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--accept-official",
        action="store_true",
        help="Record all P2 rows as accepted using the 2026-03-20 official polygon.",
    )
    args = parser.parse_args()

    with args.input.open(encoding="utf-8-sig", newline="") as handle:
        conflicts = [
            row
            for row in csv.DictReader(handle)
            if row.get("likely_reason") == "different_current_hakgudo_needs_sample_review"
        ]

    conflicts.sort(key=lambda row: (row.get("region", ""), -int(float(row.get("households") or 0))))
    fields = [
        "review_status",
        "review_priority",
        "apt_cd",
        "apt_nm",
        "region",
        "households",
        "road_address",
        "schoolzone_search_term",
        "schoolzone_url",
        "official_hakgudo_20260320",
        "geomarket_hakgudo_2024",
        "browser_hakgudo_result",
        "browser_school_result",
        "observed_base_date",
        "evidence_url_or_capture",
        "review_decision",
        "review_notes",
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in conflicts:
            review_status = "accepted_official_20260320" if args.accept_official else "pending"
            review_decision = "use_official_20260320" if args.accept_official else ""
            review_notes = (
                "Geomarket 2024는 참고값으로만 보존하고 최신 공식 학구도 값을 적용"
                if args.accept_official
                else ""
            )
            writer.writerow(
                {
                    "review_status": review_status,
                    "review_priority": "P2",
                    "apt_cd": row.get("apt_cd", ""),
                    "apt_nm": row.get("apt_nm", ""),
                    "region": row.get("region", ""),
                    "households": row.get("households", ""),
                    "road_address": row.get("road_address", ""),
                    "schoolzone_search_term": row.get("road_address", ""),
                    "schoolzone_url": SCHOOLZONE_URL,
                    "official_hakgudo_20260320": row.get("new_primary_hakgudo_nm", ""),
                    "geomarket_hakgudo_2024": row.get("geomarket_hakgudo_names", ""),
                    "browser_hakgudo_result": "",
                    "browser_school_result": "",
                    "observed_base_date": "2026-03-20" if args.accept_official else "",
                    "evidence_url_or_capture": "",
                    "review_decision": review_decision,
                    "review_notes": review_notes,
                }
            )

    label = "공식값 채택 로그" if args.accept_official else "브라우저 검수 대상"
    print(f"P2 {label}: {len(conflicts):,}")
    print(f"P2 산출물: {args.output}")


if __name__ == "__main__":
    main()
