"""Geocode active 체육교습업 addresses into the academy geocode cache (VWorld, a machine in Korea).

The cache is keyed by address and the marker builder only looks up the addresses it has,
so these rows sit beside the NEIS ones without changing what the academy layer reads.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from geocode_academy_addresses import RUNTIME_DIR, env_value, geocode, load_cache, write_cache  # noqa: E402


BASE_DIR = Path(__file__).resolve().parent
INSTRUCTION_DIR = BASE_DIR / "runtime" / "sports_instruction"
ACTIVE_STATUS = "정상운영"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, help="default: the newest sports_instruction_nationwide_*.json")
    parser.add_argument("--cache", type=Path, default=RUNTIME_DIR / "academy_geocodes_all.csv")
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--delay", type=float, default=0.2)
    args = parser.parse_args()
    key = env_value("VWORLD_API_KEY")
    if not key:
        raise SystemExit("VWORLD_API_KEY is not configured")
    snapshot = args.snapshot or sorted(
        path for path in INSTRUCTION_DIR.glob("sports_instruction_nationwide_*.json") if "_profile_" not in path.name
    )[-1]

    addresses: Counter[tuple[str, str]] = Counter(
        (row["region"], row["road_address"])
        for row in json.loads(snapshot.read_text(encoding="utf-8"))
        if row["business_status"] == ACTIVE_STATUS
    )
    cache = load_cache(args.cache)
    pending = [item for item in addresses if cache.get(item[1], {}).get("status") != "matched"]

    def request(item: tuple[str, str]) -> tuple[tuple[str, str], dict]:
        result = geocode(key, item[1])
        time.sleep(max(args.delay, 0))
        return item, result

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {executor.submit(request, item): item for item in pending}
        for future in as_completed(futures):
            try:
                item, result = future.result()
            except Exception as error:  # One bad response must not lose the batch.
                item, result = futures[future], {"status": "transport_error", "error_code": type(error).__name__}
            region, address = item
            cache[address] = {"region": region, "address": address, "academy_count": addresses[item],
                              **result, "checked_at": f"{date.today():%Y-%m-%d}"}
    write_cache(args.cache, cache)

    statuses = Counter(cache[address]["status"] for _, address in addresses)
    print(json.dumps({
        "snapshot": snapshot.name, "addresses": len(addresses), "already_cached": len(addresses) - len(pending),
        "geocoded_now": len(pending), "statuses": dict(statuses),
        "match_rate": round(statuses["matched"] / len(addresses), 4) if addresses else None,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
