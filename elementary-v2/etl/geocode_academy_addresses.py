"""Geocode unique academy addresses with VWorld using a resumable private cache."""

from __future__ import annotations

import argparse
import csv
import hashlib
import http.client
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
RUNTIME_DIR = BASE_DIR / "runtime" / "academy"
PROFILE_FILE = BASE_DIR / "academy_geocode_profile.json"
REGIONS = ("서울특별시", "경기도", "인천광역시")


def env_value(name: str) -> str:
    if os.getenv(name):
        return os.environ[name]
    for env_file in (PROJECT_DIR / ".env", PROJECT_DIR.parent / ".env.local"):
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def latest_snapshot() -> Path:
    files = sorted(RUNTIME_DIR.glob("acainsti_capital_*.json"))
    if not files:
        raise SystemExit("academy snapshot missing")
    return files[-1]


def select_addresses(rows: list[dict], sample_per_region: int | None) -> list[dict]:
    grouped = defaultdict(lambda: defaultdict(int))
    for row in rows:
        address = " ".join((row.get("FA_RDNMA") or "").split())
        if address:
            grouped[row["_region"]][address] += 1
    selected = []
    for region in REGIONS:
        items = sorted(grouped[region].items(), key=lambda item: hashlib.sha256(item[0].encode()).hexdigest())
        for address, count in items[:sample_per_region] if sample_per_region else items:
            selected.append({"region": region, "address": address, "academy_count": count})
    return selected


def geocode(key: str, address: str, retries: int = 3) -> dict:
    query = urllib.parse.urlencode({
        "service": "address", "request": "getcoord", "version": "2.0",
        "crs": "EPSG:4326", "address": address, "refine": "true",
        "simple": "false", "format": "json", "type": "road", "key": key,
    })
    payload = None
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(f"https://api.vworld.kr/req/address?{query}", timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as error:
            last_error = error
            if attempt + 1 < retries:
                retry_after = error.headers.get("Retry-After") if error.headers else None
                time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else 2.0 * (2 ** attempt))
        except (
            urllib.error.URLError,
            TimeoutError,
            json.JSONDecodeError,
            http.client.RemoteDisconnected,
            ConnectionError,
            OSError,
        ) as error:
            last_error = error
            if attempt + 1 < retries:
                time.sleep(1.5 * (2 ** attempt))
    if payload is None:
        return {"status": "transport_error", "error_code": type(last_error).__name__}
    response = payload.get("response", {})
    if response.get("status") != "OK":
        error = response.get("error", {})
        return {"status": "api_error", "error_code": error.get("code") or response.get("status", "UNKNOWN"), "error_text": error.get("text", "")}
    result = response.get("result") or {}
    point = result.get("point") or {}
    if not point.get("x") or not point.get("y"):
        return {"status": "no_result", "error_code": "EMPTY_POINT"}
    return {"status": "matched", "longitude": float(point["x"]), "latitude": float(point["y"]), "refined_address": (result.get("refined") or {}).get("text", "")}


FIELDS = ("region", "address", "academy_count", "status", "longitude", "latitude", "refined_address", "error_code", "error_text", "checked_at")


def load_cache(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return {row["address"]: row for row in csv.DictReader(handle)}


def write_cache(path: Path, cache: dict[str, dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(sorted(cache.values(), key=lambda row: (row["region"], row["address"])))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--sample-per-region", type=int, default=100)
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--retry-failures", action="store_true")
    parser.add_argument("--retry-transport-errors", action="store_true")
    parser.add_argument("--delay", type=float, default=0.2)
    args = parser.parse_args()
    key = env_value("VWORLD_API_KEY")
    if not key:
        raise SystemExit("VWORLD_API_KEY is not configured")
    snapshot = latest_snapshot()
    selected = select_addresses(json.loads(snapshot.read_text(encoding="utf-8")), None if args.all else args.sample_per_region)
    mode = "all" if args.all else f"pilot_{args.sample_per_region}_per_region"
    cache_path = RUNTIME_DIR / f"academy_geocodes_{mode}.csv"
    cache = load_cache(cache_path)
    pending = []
    for item in selected:
        previous = cache.get(item["address"])
        if previous is None:
            pending.append(item)
        elif args.retry_failures and previous["status"] != "matched":
            pending.append(item)
        elif args.retry_transport_errors and previous["status"] == "transport_error":
            pending.append(item)

    def request(item: dict) -> tuple[dict, dict]:
        result = geocode(key, item["address"])
        time.sleep(max(args.delay, 0))
        return item, result

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {executor.submit(request, item): item for item in pending}
        for index, future in enumerate(as_completed(futures), 1):
            try:
                item, result = future.result()
            except Exception as error:  # Keep one unexpected response from aborting the batch.
                item = futures[future]
                result = {"status": "transport_error", "error_code": type(error).__name__}
            cache[item["address"]] = item | result | {"checked_at": f"{date.today():%Y-%m-%d}"}
            if index % 100 == 0:
                print(f"{index:,}/{len(pending):,} pending addresses checked", flush=True)
            if index % 250 == 0:
                write_cache(cache_path, cache)
    write_cache(cache_path, cache)

    statuses = Counter(cache[item["address"]]["status"] for item in selected if item["address"] in cache)
    by_region = {}
    for region in REGIONS:
        items = [item for item in selected if item["region"] == region]
        counts = Counter(cache[item["address"]]["status"] for item in items if item["address"] in cache)
        by_region[region] = {"addresses": len(items), "matched": counts["matched"], "match_rate": round(counts["matched"] / len(items), 4)}
    profile = {
        "generated_at": f"{date.today():%Y-%m-%d}", "snapshot": snapshot.name, "mode": mode,
        "selected_unique_addresses": len(selected), "matched": statuses["matched"],
        "match_rate": round(statuses["matched"] / len(selected), 4), "statuses": dict(statuses), "regions": by_region,
    }
    PROFILE_FILE.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(profile, ensure_ascii=False, indent=2))
    print(f"private cache: {cache_path}")


if __name__ == "__main__":
    main()
