"""Build regional education-facility proximity outputs from nationwide dojo data."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


BASE = Path(__file__).resolve().parent
PROJECT = BASE.parent
REGISTRY = BASE / "region_registry.json"
MASTERS = BASE / "local_outputs_20260320"
RUNTIME = BASE / "runtime" / "academy"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", required=True, help="Snapshot date in YYYY-MM-DD")
    parser.add_argument("--markers", type=Path, required=True)
    parser.add_argument("--regions", nargs="*", default=())
    args = parser.parse_args()

    payload = json.loads(REGISTRY.read_text(encoding="utf-8"))
    selected = set(args.regions)
    regions = [
        row for row in payload["regions"]
        if row.get("status") == "production"
        and (not selected or row["canonical_name"] in selected)
    ]
    if selected != {row["canonical_name"] for row in regions} and selected:
        missing = sorted(selected - {row["canonical_name"] for row in regions})
        raise SystemExit(f"unknown or non-production regions: {missing}")

    stamp = args.as_of.replace("-", "")
    for region in regions:
        code = region["neis_office_code"].lower()
        regional_master = MASTERS / f"apartment_complex_master_v1_{code}.csv"
        master = regional_master if regional_master.exists() else MASTERS / "apartment_complex_master_v1.csv"
        suffix = f"{code}-sports-national"
        profile = RUNTIME / f"education_facility_proximity_profile_{stamp}_{code}.json"
        command = [
            sys.executable,
            str(BASE / "build_academy_proximity_snapshot.py"),
            "--as-of", args.as_of,
            "--complexes", str(master),
            "--academies", str(args.markers),
            "--regions", region["canonical_name"],
            "--output-suffix", suffix,
            "--profile", str(profile),
        ]
        print(f"building {region['canonical_name']} ({code})", flush=True)
        subprocess.run(command, cwd=PROJECT, check=True)


if __name__ == "__main__":
    main()
