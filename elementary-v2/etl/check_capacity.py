#!/usr/bin/env python3
"""Report database size against the plan budget. Read-only.

The capacity gate needs a measured number before every expansion wave, and
until migration 17 that number could only be read by hand in the SQL editor.

    python etl/check_capacity.py
    python etl/check_capacity.py --limit-mb 500 --budget-pct 70

Requires migration 17, which adds `public_table_sizes()` and
`etl_staging_depth()`. Reads credentials from `.env`; secrets are never
printed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/check_capacity.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

PROJECT_DIR = Path(__file__).resolve().parent.parent
FREE_TIER_LIMIT_MB = 500.0
BUDGET_PCT = 70.0


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value)


def rpc(url: str, key: str, name: str) -> Any:
    request = urllib.request.Request(
        f"{url}/rest/v1/rpc/{name}",
        data=b"{}",
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"{name}: HTTP {exc.code}: {detail}") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit-mb", type=float, default=FREE_TIER_LIMIT_MB)
    parser.add_argument("--budget-pct", type=float, default=BUDGET_PCT)
    parser.add_argument("--top", type=int, default=12)
    args = parser.parse_args(argv)

    load_env(PROJECT_DIR / ".env")
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY") or ""
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")

    tables = rpc(url, key, "public_table_sizes") or []
    total_bytes = sum(int(row["total_bytes"]) for row in tables)
    total_mb = total_bytes / 1024 / 1024
    budget_mb = args.limit_mb * args.budget_pct / 100

    print(f"{'table':<34}{'total':>12}{'heap':>12}{'index':>12}{'share':>8}")
    for row in tables[: args.top]:
        size = int(row["total_bytes"])
        print(
            f"{row['table_name']:<34}"
            f"{size / 1024 / 1024:>10.1f}MB"
            f"{int(row['heap_bytes']) / 1024 / 1024:>10.1f}MB"
            f"{int(row['index_bytes']) / 1024 / 1024:>10.1f}MB"
            f"{100 * size / total_bytes if total_bytes else 0:>7.1f}%"
        )

    print(f"\ntotal {total_mb:,.1f} MB of a {args.limit_mb:,.0f} MB limit "
          f"({100 * total_mb / args.limit_mb:.1f}%); budget is {budget_mb:,.0f} MB")

    staging = rpc(url, key, "etl_staging_depth") or []
    if staging:
        row = staging[0]
        staging_mb = int(row["total_bytes"]) / 1024 / 1024
        print(
            f"staging: ~{int(row['estimated_rows']):,} rows across "
            f"{int(row['runs_with_rows']):,} runs, {staging_mb:,.1f} MB"
        )
        if staging_mb > total_mb * 0.1:
            print("  WARNING: staging is transient and should be a rounding error; "
                  "run the cleanup until it reports zero")

    if total_mb > budget_mb:
        print(f"\nFAIL: over the {args.budget_pct:.0f}% budget")
        return 1
    print(f"\nPASS: within the {args.budget_pct:.0f}% budget")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
