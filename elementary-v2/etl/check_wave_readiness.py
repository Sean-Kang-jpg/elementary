#!/usr/bin/env python3
"""Report whether a built scope is ready to upload. Read-only.

Checks the release gates that can be measured from the built outputs and the
live database, and says plainly which ones still need a person. It never
writes and never uploads.

    python etl/check_wave_readiness.py 대전광역시
    python etl/check_wave_readiness.py 전라남도 --cities 목포시
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/check_wave_readiness.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl.fetch_schoolinfo_2026 import build_scopes, scope_slug
from etl.region_registry import load_registry

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
REVIEW_CASES = OUTPUT_DIR / "review_cases.csv"

# Release-gate thresholds from OPERATION_PLAN.md.
MAX_REVIEW_REQUIRED_PCT = 3.0
MIN_ASSIGNMENT_COVERAGE_PCT = 98.0


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("regions", nargs="+")
    parser.add_argument("--cities", nargs="*", default=())
    args = parser.parse_args(argv)

    registry = load_registry()
    scopes = list(build_scopes(registry, args.regions, args.cities))
    slug = scope_slug(scopes)
    suffix = "" if slug == "capital" else f"_{slug}"
    label = ", ".join(scope.label for scope in scopes)

    operational = load_json(OUTPUT_DIR / f"operational_masters_report{suffix}.json")
    audit = load_json(OUTPUT_DIR / f"backend_audit_report{suffix}.json")
    if operational is None or audit is None:
        print(f"{label}: not built; run the build and audit for this scope first")
        return 1

    units = operational["apartment_assignment_units"]
    links = load_json(OUTPUT_DIR / f"apartment_assignment_schools_v1{suffix}.json") or []
    linked = len({link["apt_cd"] for link in links})
    coverage = 100 * linked / units if units else 0.0
    review_pct = 100 * operational["assignment_review_required"] / units if units else 0.0
    failed_checks = [check["name"] for check in audit["checks"] if check.get("status") != "pass"]

    cases = 0
    if REVIEW_CASES.is_file():
        with REVIEW_CASES.open(encoding="utf-8-sig", newline="") as handle:
            scope_names = {scope.region.canonical_name for scope in scopes}
            cases = sum(1 for row in csv.DictReader(handle) if row["region"] in scope_names)

    results = [
        ("backend audit passes", not failed_checks, f"{audit['check_count'] - len(failed_checks)}/{audit['check_count']}"),
        ("every assignment reaches a school", coverage >= MIN_ASSIGNMENT_COVERAGE_PCT,
         f"{linked:,}/{units:,} ({coverage:.1f}%)"),
        ("review_required within budget", review_pct <= MAX_REVIEW_REQUIRED_PCT,
         f"{operational['assignment_review_required']:,} ({review_pct:.1f}%)"),
        ("serving rows built", operational["school_apartment_serving"] > 0,
         f"{operational['school_apartment_serving']:,}"),
    ]
    width = max(len(name) for name, _, _ in results)
    print(f"scope: {label} (slug {slug})")
    for name, passed, detail in results:
        print(f"  {'PASS' if passed else 'FAIL'}  {name.ljust(width)}  {detail}")
    if failed_checks:
        print(f"        failed checks: {failed_checks}")

    print("\nStill needs a person, and cannot be measured here:")
    print(f"  - manual QA sample: build_review_sample.py {args.regions[0]}, then 0 wrong assignments")
    print(f"  - pooled review cases for this scope: {cases}")
    print("  - promote the region in region_registry before upload")
    print("  - capacity: python etl/check_capacity.py")

    return 0 if all(passed for _, passed, _ in results) else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
