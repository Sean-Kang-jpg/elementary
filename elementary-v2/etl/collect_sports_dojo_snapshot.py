"""Collect and profile nationwide sports-dojo permit data from data.go.kr."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from pyproj import Transformer

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl.fetch_schoolinfo_2026 import load_env_value
from etl.region_registry import RegionScope, load_registry


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
RUNTIME_DIR = BASE_DIR / "runtime" / "sports_dojo"
ENDPOINT = "https://apis.data.go.kr/1741000/martial_arts_dojo/info"
TO_WGS84 = Transformer.from_crs("EPSG:5174", "EPSG:4326", always_xy=True)

SPORT_KEYWORDS = {
    "태권도": ("태권도", "태권", "TAEKWONDO"),
    "검도": ("검도", "KENDO"),
    "유도": ("유도", "JUDO"),
    "합기도": ("합기도",),
    "복싱": ("복싱", "권투", "BOXING"),
    "우슈": ("우슈", "WUSHU"),
    "레슬링": ("레슬링", "WRESTLING"),
}


def classify_sport(row: dict[str, Any]) -> str:
    text = " ".join(
        str(row.get(key) or "")
        for key in ("BZSTAT_SE_NM", "CULTR_SPTS_TPBIZ_NM", "BPLC_NM")
    ).upper()
    for sport, keywords in SPORT_KEYWORDS.items():
        if any(keyword.upper() in text for keyword in keywords):
            return sport
    return "기타 체육도장"


def coordinates(row: dict[str, Any]) -> tuple[float | None, float | None]:
    try:
        x = float(str(row.get("CRD_INFO_X") or "").replace(",", ""))
        y = float(str(row.get("CRD_INFO_Y") or "").replace(",", ""))
        # LOCALDATA uses an uncorrected Bessel central-belt TM grid. Tiny
        # placeholder values can still transform into plausible WGS84 points,
        # so reject them in the source CRS before transforming.
        if not (50_000 <= x <= 550_000 and 50_000 <= y <= 650_000):
            return None, None
        longitude, latitude = TO_WGS84.transform(x, y)
    except (TypeError, ValueError):
        return None, None
    if not (33.0 <= latitude <= 39.5 and 124.0 <= longitude <= 132.0):
        return None, None
    return round(latitude, 7), round(longitude, 7)


def row_in_scope(row: dict[str, Any], scopes: Sequence[RegionScope]) -> bool:
    address = str(row.get("ROAD_NM_ADDR") or row.get("LOTNO_ADDR") or "").strip()
    registry = load_registry()
    return any(registry.scope_includes_address(scope, address) for scope in scopes)


def fetch_page(
    api_key: str,
    page: int,
    page_size: int = 100,
    address_like: str | None = None,
) -> dict[str, Any]:
    params = {
            "serviceKey": api_key,
            "pageNo": page,
            "numOfRows": page_size,
            # The gateway's JSON representation currently replaces Korean
            # characters with U+FFFD. XML carries the same rows as valid UTF-8.
            "returnType": "xml",
    }
    if address_like:
        params["cond[ROAD_NM_ADDR::LIKE]"] = address_like
    query = urlencode(params)
    root = None
    # The gateway stalls now and then from GitHub runners (2026-10-06: one page timed
    # out five times in a row), so keep trying for a few minutes before giving up.
    attempts = 8
    for attempt in range(attempts):
        last = attempt == attempts - 1
        try:
            with urlopen(f"{ENDPOINT}?{query}", timeout=90) as response:
                root = ET.fromstring(response.read().decode("utf-8"))
            break
        except HTTPError as exc:
            if exc.code not in {429, 500, 502, 503, 504} or last:
                raise RuntimeError(f"sports-dojo API HTTP {exc.code}") from None
            time.sleep(min(60, 2 ** (attempt + 1)))
        except (URLError, TimeoutError, ConnectionError) as exc:
            if last:
                raise RuntimeError(f"sports-dojo API network error: {getattr(exc, 'reason', exc)}") from None
            time.sleep(min(60, 2 ** (attempt + 1)))
        except (UnicodeDecodeError, ET.ParseError) as exc:
            raise RuntimeError(f"sports-dojo API returned invalid XML: {exc}") from None
    if root is None:
        raise RuntimeError("sports-dojo API exhausted retries")
    header_node = root.find("header")
    header = {child.tag: child.text or "" for child in header_node or []}
    if str(header.get("resultCode", "00")) not in {"0", "00"}:
        raise RuntimeError(f"sports-dojo API failed: {header}")
    body_node = root.find("body")
    if body_node is None:
        raise RuntimeError("sports-dojo API response has no body")
    items = [
        {child.tag: child.text or "" for child in item}
        for item in body_node.findall("./items/item")
    ]
    body = {
        "pageNo": body_node.findtext("pageNo", "0"),
        "numOfRows": body_node.findtext("numOfRows", "0"),
        "totalCount": body_node.findtext("totalCount", "0"),
        "items": {"item": items},
    }
    return {"response": {"header": header, "body": body}}


def fetch_all(api_key: str, address_like: str | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page = 1
    while True:
        payload = fetch_page(api_key, page, address_like=address_like)
        body = payload.get("response", {}).get("body", {})
        batch = body.get("items", {}).get("item", []) or []
        if isinstance(batch, dict):
            batch = [batch]
        rows.extend(batch)
        total = int(body.get("totalCount") or 0)
        if not batch or len(rows) >= total:
            break
        page += 1
        time.sleep(0.1)
    return rows


def normalize(row: dict[str, Any], region: str) -> dict[str, Any]:
    latitude, longitude = coordinates(row)
    return {
        "source_id": str(row.get("MNG_NO") or "").strip(),
        "source_type": "sports_dojo",
        "region": region,
        "district": "",
        "institution_name": str(row.get("BPLC_NM") or "").strip(),
        "sport_type": classify_sport(row),
        "business_status": str(row.get("SALS_STTS_NM") or "").strip(),
        "detail_status": str(row.get("DTL_SALS_STTS_NM") or "").strip(),
        "road_address": str(row.get("ROAD_NM_ADDR") or "").strip(),
        "lot_address": str(row.get("LOTNO_ADDR") or "").strip(),
        "latitude": latitude,
        "longitude": longitude,
        "licensed_on": str(row.get("LCPMT_YMD") or "").strip(),
        "closed_on": str(row.get("CLSBIZ_YMD") or "").strip(),
        "updated_at_source": str(row.get("DAT_UPDT_PNT") or "").strip(),
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--regions", nargs="+", default=["서울특별시", "대전광역시", "부산광역시"])
    scope.add_argument("--all-production", action="store_true")
    args = parser.parse_args(argv)

    registry = load_registry()
    scopes = (
        tuple(registry.scope(region.canonical_name) for region in registry.production_regions)
        if args.all_production
        else tuple(registry.scope(name) for name in args.regions)
    )
    api_key = os.getenv("DATA_GO_KR_DECODED_KEY") or load_env_value(
        PROJECT_DIR / ".env", "DATA_GO_KR_DECODED_KEY"
    )
    if not api_key or api_key.startswith("your_"):
        raise RuntimeError("DATA_GO_KR_DECODED_KEY is not configured")

    if args.all_production:
        # The gateway's ROAD_NM_ADDR LIKE filter is not complete across local
        # governments. Download the authoritative nationwide result and apply
        # the region registry locally so no municipality is silently missed.
        all_rows = fetch_all(api_key)
        print(f"nationwide source: {len(all_rows):,}")
    else:
        all_rows_by_id: dict[str, dict[str, Any]] = {}
        for selected_scope in scopes:
            for address_prefix in selected_scope.region.address_prefixes:
                prefix_rows = fetch_all(api_key, address_prefix)
                print(f"{address_prefix}: {len(prefix_rows):,}")
                for row in prefix_rows:
                    source_id = str(row.get("MNG_NO") or "").strip()
                    all_rows_by_id[source_id or json.dumps(row, sort_keys=True)] = row
        all_rows = list(all_rows_by_id.values())
    selected = [row for row in all_rows if row_in_scope(row, scopes)]
    normalized = []
    for row in selected:
        address = str(row.get("ROAD_NM_ADDR") or row.get("LOTNO_ADDR") or "")
        region = registry.region_for_address(address)
        if region:
            normalized.append(normalize(row, region.canonical_name))

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    stamp = date.today().strftime("%Y%m%d")
    label = "nationwide" if args.all_production else "pilot"
    output = RUNTIME_DIR / f"sports_dojo_{label}_{stamp}.json"
    output.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "generated_at": datetime.now().isoformat(),
        "source": ENDPOINT,
        "scope": [scope.label for scope in scopes],
        "all_rows": len(all_rows),
        "selected_rows": len(selected),
        "normalized_rows": len(normalized),
        "active_rows": sum(row["business_status"] in {"영업", "정상", "영업/정상"} for row in normalized),
        "missing_coordinates": sum(row["latitude"] is None for row in normalized),
        "sport_counts": dict(Counter(row["sport_type"] for row in normalized)),
        "status_counts": dict(Counter(row["business_status"] for row in normalized)),
        "output": output.name,
    }
    report_path = RUNTIME_DIR / f"sports_dojo_{label}_profile_{stamp}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
