#!/usr/bin/env python3
"""
Compare high-confidence official-polygon assignments with Geomarket 2024.

Geomarket is not treated as truth here. This report shows where the new
official-polygon assignment differs from the old Geomarket assignment, so those
cases can be sampled before DB loading.
"""

import csv
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = Path(__file__).parent
ASSIGNMENTS = BASE / "local_outputs" / "apartment_point_assignments.csv"
GEOMARKET = Path(r"F:/sm/vibe/elementary/archive/legacy-v1/etl/data/geomarket/apt_hkd_info_2024.csv")
OUT_DIR = BASE / "local_outputs"


def load_geomarket():
    rows = {}
    with open(GEOMARKET, encoding="cp949") as f:
        for row in csv.DictReader(f):
            try:
                info = json.loads(row.get("hakgudo_info") or "{}")
            except json.JSONDecodeError:
                info = {}
            elem = info.get("초등학교") or []
            names = sorted({e.get("hakgudo_nm") for e in elem if e.get("hakgudo_nm")})
            rows[row.get("apt_cd") or ""] = {
                "geomarket_hakgudo_names": "|".join(names),
                "geomarket_count": len(names),
                "geomarket_std_yr": row.get("std_yr") or "",
            }
    return rows


def classify(primary, geomarket_names):
    if not geomarket_names:
        return "geomarket_missing"
    gset = set(geomarket_names)
    if gset == {primary}:
        return "same_single"
    if primary in gset and len(gset) > 1:
        return "new_single_geomarket_multiple"
    return "different"


def write_csv(path, rows):
    if not rows:
        return
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Compare high-confidence assignments with Geomarket.")
    parser.add_argument("--assignments", type=Path, default=ASSIGNMENTS)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    geomarket = load_geomarket()
    rows = []
    with open(args.assignments, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("confidence") != "high":
                continue
            gm = geomarket.get(row.get("apt_cd") or "", {})
            gm_names = [v for v in (gm.get("geomarket_hakgudo_names") or "").split("|") if v]
            status = classify(row.get("primary_hakgudo_nm") or "", gm_names)
            rows.append(
                {
                    "apt_cd": row.get("apt_cd") or "",
                    "apt_nm": row.get("apt_nm") or "",
                    "road_address": row.get("road_address") or "",
                    "region": row.get("region") or "",
                    "households": row.get("households") or "",
                    "new_primary_hakgudo_id": row.get("primary_hakgudo_id") or "",
                    "new_primary_hakgudo_nm": row.get("primary_hakgudo_nm") or "",
                    "geomarket_hakgudo_names": gm.get("geomarket_hakgudo_names") or "",
                    "geomarket_count": gm.get("geomarket_count", 0),
                    "compare_status": status,
                }
            )

    diffs = [r for r in rows if r["compare_status"] != "same_single"]
    summary = Counter(r["compare_status"] for r in rows)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    all_csv = args.out_dir / "high_confidence_geomarket_compare.csv"
    diff_csv = args.out_dir / "high_confidence_geomarket_differences.csv"
    summary_json = args.out_dir / "high_confidence_geomarket_compare_summary.json"
    write_csv(all_csv, rows)
    write_csv(diff_csv, diffs)
    summary_json.write_text(
        json.dumps(
            {
                "total_high_confidence": len(rows),
                "differences_or_missing": len(diffs),
                "status_counts": dict(summary),
                "inputs": {
                    "assignments": str(args.assignments),
                    "geomarket": str(GEOMARKET),
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"고신뢰 대표점 대상: {len(rows):,}")
    for key, count in summary.most_common():
        print(f"{key}: {count:,}")
    print(f"차이/누락: {len(diffs):,}")
    print(f"전체 비교 CSV: {all_csv}")
    print(f"차이 CSV: {diff_csv}")
    print(f"요약 JSON: {summary_json}")


if __name__ == "__main__":
    main()
