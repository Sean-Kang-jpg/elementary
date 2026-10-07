"""Rebuild every scope's point assignments from a new 학구도 release and compare.

학구도 is published every March and September (schoolzone.emac.kr, 공공데이터 목록,
"초등학교 통학구역 및 공동통학구역(YYYY.MM.DD.)"). The site refuses scripted
downloads, so the file is fetched by hand into etl/data/hakgudo/<YYYYMMDD>/.

This writes nothing the ETL reads. For each production scope it runs
build_local_assignment_etl.py against the new shapefile into
etl/runtime/school_zone_<release>/, then compares the primary zone of every
apartment with the assignments the monthly run uses now
(etl/local_outputs_20260320/apartment_point_assignments*.csv). Promotion - copying
the new files over, rebuilding the review queue where zones moved, and publishing a
new inputs bundle - is the procedure in docs/operations/ETL_SCHEDULING.md.

    python etl/compare_school_zone_release.py --shp etl/data/hakgudo/20260920/extracted/<file>.shp --release 20260920
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_due_etl import production_scopes  # noqa: E402


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
CURRENT_DIR = BASE_DIR / "local_outputs_20260320"


def read(path: Path) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return {row["apt_cd"]: row for row in csv.DictReader(handle)}


def compare(current: dict[str, dict[str, str]], new: dict[str, dict[str, str]]) -> dict:
    moved = [
        {"apt_cd": apt, "apt_nm": new[apt]["apt_nm"], "region": new[apt]["region"],
         "from": current[apt]["primary_hakgudo_nm"], "to": new[apt]["primary_hakgudo_nm"],
         "confidence": new[apt]["confidence"]}
        for apt in sorted(set(current) & set(new))
        if current[apt]["primary_hakgudo_id"] != new[apt]["primary_hakgudo_id"]
    ]
    renamed_only = sum(
        1 for apt in set(current) & set(new)
        if current[apt]["primary_hakgudo_id"] == new[apt]["primary_hakgudo_id"]
        and current[apt]["primary_hakgudo_nm"] != new[apt]["primary_hakgudo_nm"]
    )
    return {
        "apartments": [len(current), len(new)],
        "only_current": len(set(current) - set(new)),
        "only_new": len(set(new) - set(current)),
        "zone_changed": len(moved),
        "zone_renamed_only": renamed_only,
        "confidence_new": dict(Counter(row["confidence"] for row in new.values())),
        "moved": moved,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--shp", type=Path, required=True)
    parser.add_argument("--release", required=True, help="the release date, YYYYMMDD")
    args = parser.parse_args()
    if not args.shp.is_file():
        raise SystemExit(f"shapefile not found: {args.shp}")

    out_dir = BASE_DIR / "runtime" / f"school_zone_{args.release}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = {"release": args.release, "shp": str(args.shp), "scopes": {}}
    for regions, slug in production_scopes():
        suffix = "" if slug == "capital" else f"_{slug}"
        print(f"=== {slug}: {', '.join(regions)}", flush=True)
        subprocess.run(
            [sys.executable, str(BASE_DIR / "build_local_assignment_etl.py"),
             "--out-dir", str(out_dir), "--shp", str(args.shp),
             # Always name the regions: without them the builder takes every production region.
             "--regions", *regions],
            cwd=PROJECT_DIR, check=True,
        )
        current_path = CURRENT_DIR / f"apartment_point_assignments{suffix}.csv"
        new_path = out_dir / f"apartment_point_assignments{suffix}.csv"
        result = compare(read(current_path), read(new_path))
        report["scopes"][slug] = result
        print(f"{slug}: {result['zone_changed']:,} apartments change zone, "
              f"{result['zone_renamed_only']:,} only renamed, "
              f"{result['only_new']:,} new / {result['only_current']:,} dropped", flush=True)

    totals = Counter()
    for result in report["scopes"].values():
        totals.update({key: result[key] for key in ("zone_changed", "zone_renamed_only", "only_new", "only_current")})
    report["totals"] = dict(totals)
    path = out_dir / "comparison.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["totals"], ensure_ascii=False))
    print(f"report: {path}")


if __name__ == "__main__":
    main()
