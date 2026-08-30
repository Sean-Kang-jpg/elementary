#!/usr/bin/env python3
"""
Classify differences between high-confidence official-polygon assignments and
Geomarket 2024 assignments.
"""

import csv
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import shapefile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = Path(__file__).parent
SHP = BASE / "data" / "hakgudo" / "elem_hakgudo_20250922.shp"
DIFFS = BASE / "local_outputs" / "high_confidence_geomarket_differences.csv"
GEOMARKET = Path(r"F:/sm/vibe/elementary/archive/legacy-v1/etl/data/geomarket/apt_hkd_info_2024.csv")
OUT = BASE / "local_outputs" / "high_confidence_geomarket_difference_analysis.csv"
SUMMARY = BASE / "local_outputs" / "high_confidence_geomarket_difference_analysis_summary.json"


def load_current_hakgudo_names(shp_path):
    sf = shapefile.Reader(str(shp_path), encoding="euc-kr")
    fields = [f[0] for f in sf.fields[1:]]
    idx = {n: i for i, n in enumerate(fields)}
    names = set()
    by_region = defaultdict(set)
    for sr in sf.iterShapeRecords():
        name = sr.record[idx["HAKGUDO_NM"]]
        sd_cd = sr.record[idx["SD_CD"]]
        names.add(name)
        by_region[sd_cd].add(name)
    return names, by_region


def geomarket_key_stats():
    total_by_apt_cd = Counter()
    rows_by_apt_cd = defaultdict(list)
    with open(GEOMARKET, encoding="cp949") as f:
        for row in csv.DictReader(f):
            apt_cd = row.get("apt_cd") or ""
            total_by_apt_cd[apt_cd] += 1
            if total_by_apt_cd[apt_cd] <= 3:
                rows_by_apt_cd[apt_cd].append(
                    {
                        "apt_nm": row.get("apt_nm") or "",
                        "rdnmadr": row.get("rdnmadr") or "",
                        "std_yr": row.get("std_yr") or "",
                    }
                )
    return total_by_apt_cd, rows_by_apt_cd


def split_names(value):
    return [v for v in (value or "").split("|") if v]


def school_tokens(value):
    return set(re.findall(r"[0-9A-Za-z가-힣]+?초", value or ""))


def classify(row, current_names):
    primary = row["new_primary_hakgudo_nm"]
    names = split_names(row["geomarket_hakgudo_names"])
    in_current = [n for n in names if n in current_names]
    missing_current = [n for n in names if n not in current_names]
    primary_in_gm = primary in names

    if row["compare_status"] == "geomarket_missing":
        reason = "geomarket_row_missing_or_no_elementary_assignment"
    elif missing_current and not in_current:
        reason = "geomarket_hakgudo_all_obsolete_or_renamed"
    elif missing_current:
        reason = "geomarket_hakgudo_partly_obsolete_or_renamed"
    elif primary_in_gm and len(names) > 1:
        reason = "geomarket_multiple_but_new_single_primary_included"
    elif (
        any("공동" in n and "통학구역" in n for n in names + [primary])
        and school_tokens(primary).intersection(
            set().union(*(school_tokens(n) for n in names))
        )
    ):
        reason = "joint_hakgudo_expression_changed"
    else:
        reason = "different_current_hakgudo_needs_sample_review"

    return {
        **row,
        "primary_in_geomarket": primary_in_gm,
        "geomarket_names_in_current_polygons": "|".join(in_current),
        "geomarket_names_missing_current_polygons": "|".join(missing_current),
        "geomarket_current_name_count": len(in_current),
        "likely_reason": reason,
    }


def write_csv(path, rows):
    if not rows:
        return
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Classify Geomarket differences against an official hakgudo SHP.")
    parser.add_argument("--shp", type=Path, default=SHP)
    parser.add_argument("--diffs", type=Path, default=DIFFS)
    parser.add_argument("--out-dir", type=Path, default=BASE / "local_outputs")
    args = parser.parse_args()

    out = args.out_dir / OUT.name
    summary = args.out_dir / SUMMARY.name
    current_names, _ = load_current_hakgudo_names(args.shp)
    total_by_apt_cd, _ = geomarket_key_stats()
    duplicate_apt_cd_count = sum(1 for _, count in total_by_apt_cd.items() if count > 1)

    rows = []
    with open(args.diffs, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            enriched = classify(row, current_names)
            apt_cd = row.get("apt_cd") or ""
            enriched["geomarket_apt_cd_row_count"] = total_by_apt_cd.get(apt_cd, 0)
            rows.append(enriched)

    reason_counts = Counter(r["likely_reason"] for r in rows)
    status_reason_counts = Counter((r["compare_status"], r["likely_reason"]) for r in rows)
    by_region_reason = Counter((r["region"], r["likely_reason"]) for r in rows)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    write_csv(out, rows)
    summary.write_text(
        json.dumps(
            {
                "total_differences": len(rows),
                "geomarket_duplicate_apt_cd_count": duplicate_apt_cd_count,
                "reason_counts": dict(reason_counts),
                "status_reason_counts": {
                    f"{status} / {reason}": count
                    for (status, reason), count in status_reason_counts.items()
                },
                "by_region_reason": {
                    f"{region} / {reason}": count
                    for (region, reason), count in by_region_reason.items()
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"차이 대상: {len(rows):,}")
    print(f"Geomarket 중복 apt_cd 수: {duplicate_apt_cd_count:,}")
    print()
    for reason, count in reason_counts.most_common():
        print(f"{reason}: {count:,}")
    print()
    print(f"상세 CSV: {out}")
    print(f"요약 JSON: {summary}")


if __name__ == "__main__":
    main()
