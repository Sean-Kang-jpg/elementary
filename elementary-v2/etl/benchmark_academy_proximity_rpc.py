"""Benchmark the public academy proximity RPC across density tiers."""

from __future__ import annotations

import argparse
import csv
import json
import os
import statistics
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
SUMMARY_PATH = BASE_DIR / "runtime" / "academy" / "apartment_academy_summary_20260920.csv"
OUTPUT_PATH = BASE_DIR / "academy_proximity_rpc_benchmark.json"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def credentials() -> tuple[str, str]:
    load_env(PROJECT_DIR / ".env")
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY are required")
    return url.rstrip("/"), key


def select_samples(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        row["total"] = int(row["core_address_count"]) + int(row["extended_address_count"])
    populated = sorted((row for row in rows if row["total"] > 0), key=lambda row: row["total"])
    return [
        {"tier": "sparse", **populated[max(0, len(populated) // 10)]},
        {"tier": "median", **populated[len(populated) // 2]},
        {"tier": "dense", **populated[min(len(populated) - 1, len(populated) * 9 // 10)]},
        {"tier": "maximum", **populated[-1]},
    ]


def call_rpc(url: str, key: str, complex_id: str) -> tuple[int, float]:
    request = urllib.request.Request(
        f"{url}/rest/v1/rpc/nearby_academy_addresses",
        data=json.dumps({"p_canonical_complex_id": complex_id, "p_max_distance_m": 800}).encode("utf-8"),
        method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            rows = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"RPC HTTP {exc.code}: {detail}") from exc
    return len(rows), (time.perf_counter() - started) * 1000


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=5)
    args = parser.parse_args()
    if args.runs < 2:
        raise ValueError("--runs must be at least 2")

    url, key = credentials()
    results = []
    for sample in select_samples(SUMMARY_PATH):
        timings = []
        returned = 0
        for _ in range(args.runs):
            returned, elapsed = call_rpc(url, key, sample["canonical_complex_id"])
            timings.append(elapsed)
        results.append(
            {
                "tier": sample["tier"],
                "canonical_complex_id": sample["canonical_complex_id"],
                "expected_addresses": sample["total"],
                "returned_addresses": returned,
                "runs": args.runs,
                "latency_ms": {
                    "min": round(min(timings), 1),
                    "median": round(statistics.median(timings), 1),
                    "max": round(max(timings), 1),
                },
            }
        )

    output = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "endpoint": "nearby_academy_addresses",
        "radius_m": 800,
        "results": results,
        "acceptance": {"median_ms_max": 1000, "status": "pass" if all(row["latency_ms"]["median"] <= 1000 for row in results) else "fail"},
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
