"""Collect nationwide 체육교습업 (children's jump-rope, football, ... classes) from data.go.kr.

The 지방행정인허가 series behind collect_sports_dojo_snapshot.py has no such business type;
the 국민체육진흥공단 facility API does (fcob_nm=체육교습업). Its coordinates are not usable:
19% of active rows were 0 or empty on 2026-11-05 and others point at the wrong province, so
rows keep only the base road address and geocode_sports_instruction.py places them.
Phone numbers are left out on purpose: 73% are empty and the map does not show them.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl.fetch_schoolinfo_2026 import load_env_value
from etl.region_registry import load_registry


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
RUNTIME_DIR = BASE_DIR / "runtime" / "sports_instruction"
ENDPOINT = "https://apis.data.go.kr/B551014/SRVC_API_SFMS_FACI/TODZ_API_SFMS_FACI"
BUSINESS_TYPE = "체육교습업"
ACTIVE_STATUS = "정상운영"
PAGE_SIZE = 500

PROVINCES = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
    "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시",
    "경기": "경기도", "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도", "경남": "경상남도",
    "제주": "제주특별자치도",
}
# The road name and building number, with the optional 번길 ("광교중앙로295번길 21"). What
# follows is a floor or unit, which NEIS keeps in another column: cutting it here lets a
# class share a marker with the academies in its building.
BASE_ROAD_ADDRESS = re.compile(r"^(.+?(?:로|길)(?:\s*\d+번?길)?\s*\d+(?:-\d+)?)(?=$|[\s,(])")


def base_road_address(value: Any) -> str:
    """The geocodable part of a road address, or "" for a lot address or a placeholder."""
    match = BASE_ROAD_ADDRESS.match(" ".join(str(value or "").split()))
    if not match:
        return ""
    province, _, rest = match.group(1).partition(" ")
    return f"{PROVINCES.get(province, province)} {rest}"


def normalize(row: dict[str, Any], region: str, road_address: str) -> dict[str, Any]:
    return {
        "source_id": str(row.get("faci_cd") or "").strip(),
        "source_type": "sports_instruction",
        "region": region,
        "institution_name": str(row.get("faci_nm") or "").strip(),
        "sport_type": str(row.get("ftype_nm") or "").strip(),
        "business_status": str(row.get("faci_stat_nm") or "").strip(),
        "road_address": road_address,
        "licensed_on": str(row.get("base_ymd") or "").strip(),
        "closed_on": str(row.get("sdwn_ymd") or "").strip(),
        "updated_at_source": str(row.get("updt_dt") or "").strip(),
    }


def fetch_page(api_key: str, page: int) -> tuple[list[dict[str, Any]], int]:
    query = urlencode({"serviceKey": api_key, "pageNo": page, "numOfRows": PAGE_SIZE,
                       "resultType": "json", "fcob_nm": BUSINESS_TYPE})
    attempts = 8
    for attempt in range(attempts):
        last = attempt == attempts - 1
        try:
            with urlopen(f"{ENDPOINT}?{query}", timeout=90) as response:
                payload = json.loads(response.read().decode("utf-8"))
            break
        except HTTPError as exc:
            if exc.code not in {429, 500, 502, 503, 504} or last:
                raise RuntimeError(f"sports-instruction API HTTP {exc.code}") from None
        except (URLError, TimeoutError, ConnectionError) as exc:
            if last:
                raise RuntimeError(f"sports-instruction API network error: {getattr(exc, 'reason', exc)}") from None
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"sports-instruction API returned invalid JSON: {exc}") from None
        time.sleep(min(60, 2 ** (attempt + 1)))
    response_body = payload.get("response", {})
    code = str(response_body.get("header", {}).get("resultCode", ""))
    if code not in {"0", "00"}:
        raise RuntimeError(f"sports-instruction API failed: {response_body.get('header')}")
    body = response_body.get("body", {})
    items = (body.get("items") or {}).get("item") or []
    return ([items] if isinstance(items, dict) else items), int(body.get("totalCount") or 0)


def fetch_all(api_key: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page, total = 1, 0
    while True:
        batch, total = fetch_page(api_key, page)
        rows.extend(batch)
        if not batch or len(rows) >= total:
            break
        page += 1
        time.sleep(0.1)
    # A short result must not read as closures.
    if len(rows) != total:
        raise RuntimeError(f"sports-instruction API returned {len(rows):,} of {total:,} rows")
    return rows


def main() -> None:
    api_key = os.getenv("DATA_GO_KR_DECODED_KEY") or load_env_value(PROJECT_DIR / ".env", "DATA_GO_KR_DECODED_KEY")
    if not api_key or api_key.startswith("your_"):
        raise RuntimeError("DATA_GO_KR_DECODED_KEY is not configured")
    registry = load_registry()
    all_rows = fetch_all(api_key)
    by_id: dict[str, dict[str, Any]] = {}
    unplaced = 0
    for row in all_rows:
        road_address = base_road_address(row.get("faci_road_addr"))
        region = registry.region_for_address(road_address) if road_address else None
        if not region or not row.get("faci_cd"):
            unplaced += 1
            continue
        by_id[row["faci_cd"]] = normalize(row, region.canonical_name, road_address)
    rows = sorted(by_id.values(), key=lambda row: row["source_id"])

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    stamp = f"{date.today():%Y%m%d}"
    output = RUNTIME_DIR / f"sports_instruction_nationwide_{stamp}.json"
    output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    active = [row for row in rows if row["business_status"] == ACTIVE_STATUS]
    report = {
        "generated_at": datetime.now().isoformat(),
        "source": ENDPOINT,
        "all_rows": len(all_rows),
        "normalized_rows": len(rows),
        "no_road_address_or_region": unplaced,
        "active_rows": len(active),
        "sport_counts": dict(Counter(row["sport_type"] for row in active).most_common()),
        "region_counts": dict(Counter(row["region"] for row in active).most_common()),
        "status_counts": dict(Counter(row["business_status"] for row in rows).most_common()),
        "output": output.name,
    }
    report_path = RUNTIME_DIR / f"sports_instruction_nationwide_profile_{stamp}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
