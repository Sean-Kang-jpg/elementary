#!/usr/bin/env python3
"""Fetch the nationwide school standard data, which supplies `school_id`.

This is the identity source for every school in the pipeline: the B000… ids,
addresses, offices and coordinates all come from it. The local snapshot is
`etl/data/schoolzone/school_location_<referenceDate>.csv`, and this refetches it
from the official API so a refresh is one command rather than a manual download.

    python etl/fetch_school_standard_data.py            # report what the API holds
    python etl/fetch_school_standard_data.py --write    # write a dated CSV

The output keeps the Korean column names the existing builders read, so a newer
snapshot is a drop-in replacement.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/fetch_school_standard_data.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
TARGET_DIR = BASE_DIR / "data" / "schoolzone"
PAGE_SIZE = 1000

# API field to the column name the builders already read.
COLUMNS = {
    "schoolId": "학교ID",
    "schoolNm": "학교명",
    "schoolSe": "학교급구분",
    "fondDate": "설립일자",
    "fondType": "설립형태",
    "bnhhSe": "본교분교구분",
    "operSttus": "운영상태",
    "lnmadr": "소재지지번주소",
    "rdnmadr": "소재지도로명주소",
    "cddcCode": "시도교육청코드",
    "cddcNm": "시도교육청명",
    "edcSport": "교육지원청코드",
    "edcSportNm": "교육지원청명",
    "creatDate": "생성일자",
    "changeDate": "변경일자",
    "latitude": "위도",
    "longitude": "경도",
    "referenceDate": "데이터기준일자",
}


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value)


def fetch_page(url: str, key: str, page: int, size: int) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {"serviceKey": key, "pageNo": str(page), "numOfRows": str(size), "type": "json"}
    )
    try:
        with urllib.request.urlopen(f"{url}?{query}", timeout=120) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"page {page}: HTTP {exc.code}") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"page {page}: {exc.reason}") from None
    header = payload.get("header") or {}
    if header.get("resultCode") not in {"00", None}:
        raise RuntimeError(f"page {page}: {header.get('resultCode')} {header.get('resultMsg')}")
    return payload.get("body") or {}


def fetch_all(url: str, key: str) -> tuple[list[dict[str, Any]], int]:
    rows: list[dict[str, Any]] = []
    total = 0
    page = 1
    while True:
        body = fetch_page(url, key, page, PAGE_SIZE)
        total = int(body.get("totalCount") or 0)
        items = (body.get("items") or {}).get("item") or []
        if isinstance(items, dict):
            items = [items]
        rows.extend(items)
        print(f"  page {page}: {len(items)} rows ({len(rows):,}/{total:,})")
        if not items or len(rows) >= total:
            break
        page += 1
    return rows, total


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write", action="store_true", help="write the CSV; default only reports")
    parser.add_argument("--out-dir", type=Path, default=TARGET_DIR)
    args = parser.parse_args(argv)

    load_env(PROJECT_DIR / ".env")
    url = os.getenv("DATA_GO_KR_URL")
    key = os.getenv("DATA_GO_KR_DECODED_KEY") or os.getenv("MOLIT_API_KEY")
    if not url or not key:
        raise RuntimeError("DATA_GO_KR_URL and DATA_GO_KR_DECODED_KEY must be set in .env")

    print(f"fetching {urllib.parse.urlsplit(url).path}")
    rows, total = fetch_all(url, key)
    elementary = [row for row in rows if row.get("schoolSe") == "초등학교"]
    reference_dates = sorted({str(row.get("referenceDate") or "") for row in rows})
    print(f"\ntotal rows {len(rows):,} of {total:,}; elementary {len(elementary):,}")
    print(f"reference dates: {reference_dates}")

    local = sorted(args.out_dir.glob("school_location_*.csv"))
    if local:
        with local[-1].open(encoding="utf-8-sig", newline="") as handle:
            existing = sum(1 for _ in csv.DictReader(handle))
        print(f"local snapshot {local[-1].name}: {existing:,} rows")
        if existing == len(rows) and reference_dates and reference_dates[-1].replace("-", "") in local[-1].name:
            print("The API holds the same snapshot; nothing to refresh.")

    if not args.write:
        print("\nreport only; pass --write to save a CSV")
        return 0

    stamp = (reference_dates[-1] if reference_dates else "unknown").replace("-", "")
    out_path = args.out_dir / f"school_location_{stamp}.csv"
    args.out_dir.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(COLUMNS.values()))
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(field, "") for field, column in COLUMNS.items()})
    print(f"wrote {out_path} ({len(rows):,} rows)")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
