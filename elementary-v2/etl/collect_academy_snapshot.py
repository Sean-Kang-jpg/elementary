"""Collect NEIS academy rows one region at a time into a cumulative snapshot."""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from fetch_schoolinfo_2026 import load_env_value
from region_registry import load_registry


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
RUNTIME_DIR = BASE_DIR / "runtime" / "academy"
ENDPOINT = "https://open.neis.go.kr/hub/acaInsTiInfo"


def latest_snapshot() -> Path | None:
    files = sorted(RUNTIME_DIR.glob("acainsti_scope_*.json"))
    if not files:
        files = sorted(RUNTIME_DIR.glob("acainsti_capital_*.json"))
    return files[-1] if files else None


def fetch_office(key: str, office_code: str) -> list[dict]:
    rows: list[dict] = []
    for page in range(1, 200):
        query = urllib.parse.urlencode({
            "KEY": key,
            "Type": "json",
            "pIndex": page,
            "pSize": 1000,
            "ATPT_OFCDC_SC_CODE": office_code,
        })
        with urllib.request.urlopen(f"{ENDPOINT}?{query}", timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
        blocks = payload.get("acaInsTiInfo")
        if not blocks:
            break
        batch = blocks[1].get("row", [])
        rows.extend(batch)
        if len(batch) < 1000:
            break
        time.sleep(0.15)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--regions", nargs="+", help="Canonical region names to refresh")
    scope.add_argument("--all-production", action="store_true")
    args = parser.parse_args()

    registry = load_registry()
    selected = list(registry.production_regions) if args.all_production else [registry.get(name) for name in args.regions]
    key = load_env_value(PROJECT_DIR / ".env", "NEIS_CLASS_API_KEY")
    if not key:
        raise SystemExit("NEIS_CLASS_API_KEY is not configured")

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    previous = latest_snapshot()
    existing = json.loads(previous.read_text(encoding="utf-8")) if previous else []
    selected_names = {region.canonical_name for region in selected}
    merged = [row for row in existing if row.get("_region") not in selected_names]

    for region in selected:
        rows = fetch_office(key, region.neis_office_code)
        for row in rows:
            row["_region"] = region.canonical_name
        merged.extend(rows)
        print(f"{region.canonical_name} ({region.neis_office_code}): {len(rows):,}")

    output = RUNTIME_DIR / f"acainsti_scope_{date.today():%Y%m%d}.json"
    output.write_text(json.dumps(merged, ensure_ascii=False), encoding="utf-8")
    covered = sorted({row.get("_region", "") for row in merged if row.get("_region")})
    print(f"total {len(merged):,} rows, {len(covered)} regions -> {output}")
    print("covered regions: " + ", ".join(covered))


if __name__ == "__main__":
    main()
