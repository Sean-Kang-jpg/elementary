#!/usr/bin/env python3
"""Build a prioritized local review queue from completed assignment checks."""

import csv
import json
import argparse
from collections import Counter
from pathlib import Path


BASE = Path(__file__).parent
OUT_DIR = BASE / "local_outputs"
BUILDING = OUT_DIR / "building_refined_assignments.csv"
GEOMARKET = OUT_DIR / "high_confidence_geomarket_difference_analysis.csv"
OUT = OUT_DIR / "assignment_review_queue.csv"
SUMMARY = OUT_DIR / "assignment_review_queue_summary.json"
RESOLUTIONS = OUT_DIR / "p1_resolved_cases.csv"


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path, rows):
    fields = [
        "review_priority",
        "review_reasons",
        "apt_cd",
        "apt_nm",
        "region",
        "road_address",
        "households",
        "primary_hakgudo_nm",
        "geomarket_hakgudo_names",
        "building_check_reasons",
        "building_match_methods",
        "recommended_action",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Build a prioritized local assignment review queue.")
    parser.add_argument("--building", type=Path, default=BUILDING)
    parser.add_argument("--geomarket", type=Path, default=GEOMARKET)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--summary", type=Path, default=SUMMARY)
    parser.add_argument("--resolutions", type=Path, default=RESOLUTIONS)
    parser.add_argument("--auto-resolved", type=Path, help="Refinement output containing newly resolved P1 rows.")
    parser.add_argument(
        "--accept-official-conflicts",
        action="store_true",
        help="Accept official-polygon P2 conflicts and exclude P2-only rows from the active review queue.",
    )
    args = parser.parse_args()

    resolved_ids = set()
    if args.resolutions.exists():
        resolved_ids = {
            row["apt_cd"]
            for row in read_csv(args.resolutions)
            if row.get("status") == "resolved"
        }
    auto_resolved_ids = set()
    if args.auto_resolved and args.auto_resolved.exists():
        auto_resolved_ids = {
            row["apt_cd"]
            for row in read_csv(args.auto_resolved)
            if row.get("refined_status") in {"single_by_building", "split_by_building"}
        }
        resolved_ids.update(auto_resolved_ids)

    building_failures = {
        row["apt_cd"]: row
        for row in read_csv(args.building)
        if (
            row.get("refined_status") in {"building_match_failed", "api_failed"}
            or (
                row.get("refined_status") in {"single_by_building", "split_by_building"}
                and not row.get("building_hakgudo_names")
            )
        )
        and row["apt_cd"] not in resolved_ids
    }
    hard_conflicts = {
        row["apt_cd"]: row
        for row in read_csv(args.geomarket)
        if row.get("likely_reason") == "different_current_hakgudo_needs_sample_review"
    }

    rows = []
    for apt_cd in sorted(set(building_failures) | set(hard_conflicts)):
        building = building_failures.get(apt_cd, {})
        conflict = hard_conflicts.get(apt_cd, {})
        if args.accept_official_conflicts and conflict and not building:
            continue
        base = building or conflict
        reasons = []
        if building:
            reasons.append("building_match_failed")
        if conflict:
            reasons.append("geomarket_hard_conflict")

        if len(reasons) == 2 and not args.accept_official_conflicts:
            priority = "P0"
            action = "주소·단지명 매칭을 재검증한 뒤 최신 폴리곤과 Geomarket 차이를 함께 표본 검수"
        elif building:
            priority = "P1"
            action = "도로명·건물번호, 단지명 정규화, 검색 범위 확장 순으로 건물 폴리곤 재매칭"
        else:
            priority = "P2"
            action = "최신 공식 폴리곤을 우선 적용하고 경계 조정·학교 개편 여부를 표본 확인"

        rows.append(
            {
                "review_priority": priority,
                "review_reasons": "|".join(reasons),
                "apt_cd": apt_cd,
                "apt_nm": base.get("apt_nm", ""),
                "region": base.get("region", ""),
                "road_address": base.get("road_address", ""),
                "households": base.get("households", ""),
                "primary_hakgudo_nm": base.get("primary_hakgudo_nm")
                or base.get("new_primary_hakgudo_nm", ""),
                "geomarket_hakgudo_names": conflict.get("geomarket_hakgudo_names", ""),
                "building_check_reasons": building.get("building_check_reasons", ""),
                "building_match_methods": building.get("building_match_methods", ""),
                "recommended_action": action,
            }
        )

    order = {"P0": 0, "P1": 1, "P2": 2}
    rows.sort(key=lambda row: (order[row["review_priority"]], -int(float(row["households"] or 0))))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    write_csv(args.out, rows)

    summary = {
        "total_review_queue": len(rows),
        "building_match_failed": len(building_failures),
        "geomarket_hard_conflict": len(hard_conflicts),
        "official_conflicts_auto_accepted": len(hard_conflicts) if args.accept_official_conflicts else 0,
        "p1_resolved_excluded": len(resolved_ids),
        "p1_auto_resolved": len(auto_resolved_ids),
        "overlap_p0": len(set(building_failures) & set(hard_conflicts)),
        "priority_counts": dict(Counter(row["review_priority"] for row in rows)),
        "region_counts": dict(Counter(row["region"] for row in rows)),
    }
    args.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"검수 큐: {args.out}")


if __name__ == "__main__":
    main()
