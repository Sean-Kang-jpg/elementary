"""Fetch and region-filter Schoolinfo disclosure datasets for a chosen scope.

The API is queried nationwide (`sidoCode=00`) and filtered locally, so widening
the scope costs no extra requests. Scope comes from the region registry rather
than a hardcoded list; with no arguments it stays the three capital regions, and
the output file keeps its `_capital` name so the portability baseline and the
recurring runner are unaffected.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

if __package__ in (None, ""):  # `python etl/fetch_schoolinfo_2026.py`, as the runner invokes it
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from etl.region_registry import RegionScope, load_registry

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
ENDPOINT = "https://www.schoolinfo.go.kr/openApi.do"

OFFICE_KEYS = ("ATPT_OFCDC_ORG_NM", "ATPT_OFCDC_NM", "SIDO_NM")
ADDRESS_KEYS = ("ORG_RDNMA", "RDNMA", "ADRCD_NM", "ADDRESS")


def first_value(row: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def row_in_scope(row: dict[str, Any], scopes: Sequence[RegionScope]) -> bool:
    """Whether a Schoolinfo row belongs to any selected scope.

    A row is accepted by its education office or by its address, matching the
    previous capital-region behavior. A scope narrowed to specific cities is
    decided on the address alone, because the office covers the whole region.
    """
    registry = load_registry()
    office = first_value(row, OFFICE_KEYS)
    address = first_value(row, ADDRESS_KEYS)
    office_region = registry.by_education_office(office)
    address_region = registry.region_for_address(address)
    for scope in scopes:
        if scope.cities:
            if address and scope.includes_address(address):
                return True
            continue
        if office_region is not None and office_region.canonical_name == scope.region.canonical_name:
            return True
        if address_region is not None and address_region.canonical_name == scope.region.canonical_name:
            return True
    return False


def scope_slug(scopes: Sequence[RegionScope]) -> str:
    """Stable file-name fragment for a scope.

    The three capital regions keep the historical `capital` slug so existing
    outputs, the portable bundle manifest, and the locked baseline keep matching.
    Other scopes are named by NEIS office code, with `-partial` marking a
    city-filtered scope; the exact cities are recorded in the fetch report, not
    in the file name.
    """
    registry = load_registry()
    selected = {scope.region.canonical_name for scope in scopes}
    if not any(scope.cities for scope in scopes):
        if selected == {region.canonical_name for region in registry.production_regions}:
            return "capital"
    parts = [
        scope.region.neis_office_code.lower() + ("-partial" if scope.cities else "")
        for scope in scopes
    ]
    return "-".join(sorted(parts))


def build_scopes(registry, regions: Sequence[str], cities: Sequence[str]) -> tuple[RegionScope, ...]:
    if not regions:
        return tuple(registry.scope(region.canonical_name) for region in registry.production_regions)
    if cities and len(regions) != 1:
        raise ValueError("--cities applies to a single --regions value")
    if cities:
        return (registry.scope(regions[0], cities),)
    return tuple(registry.scope(name) for name in regions)


def load_env_value(path: Path, key: str) -> str:
    if not path.exists():
        return ""
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        if name.strip() == key:
            return value.strip().strip('"').strip("'")
    return ""


def fetch(api_key: str, api_type: str, year: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    query = urlencode(
        {
            "apiKey": api_key,
            "apiType": api_type,
            "pbanYr": year,
            "schulKndCode": "02",
            "sidoCode": "00",
        }
    )
    try:
        with urlopen(f"{ENDPOINT}?{query}", timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError(f"Schoolinfo apiType={api_type} HTTP {exc.code}") from None
    except URLError as exc:
        raise RuntimeError(f"Schoolinfo apiType={api_type} network error: {exc.reason}") from None
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Schoolinfo apiType={api_type} returned invalid JSON: {exc}") from None
    if payload.get("resultCode") != "success":
        raise RuntimeError(f"Schoolinfo apiType={api_type} failed: {payload.get('resultMsg')}")
    rows = payload.get("list") or []
    if not isinstance(rows, list):
        raise TypeError(f"Schoolinfo apiType={api_type} returned non-list data")
    return rows, payload


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=date.today().year)
    parser.add_argument(
        "--regions",
        nargs="*",
        default=(),
        help="registry region names; default is the current production scope",
    )
    parser.add_argument(
        "--cities",
        nargs="*",
        default=(),
        help="restrict a single region to these cities, as in --regions 전라남도 --cities 목포시",
    )
    args = parser.parse_args(argv)
    if not 2000 <= args.year <= date.today().year + 1:
        raise ValueError("year is outside the supported range")

    registry = load_registry()
    scopes = build_scopes(registry, args.regions, args.cities)
    slug = scope_slug(scopes)

    api_key = os.getenv("KERIS_SCHOOLINFO_API_KEY") or load_env_value(
        BASE_DIR.parent / ".env", "KERIS_SCHOOLINFO_API_KEY"
    )
    if not api_key:
        raise RuntimeError("KERIS_SCHOOLINFO_API_KEY is not configured")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "generated_at": datetime.now().isoformat(),
        "year": args.year,
        "registry_version": registry.registry_version,
        "scope": [scope.label for scope in scopes],
        "scope_slug": slug,
        "filter": "education office or address, resolved through the region registry",
        "datasets": {},
    }

    for api_type, label in (("0", "basic"), ("09", "grade_students")):
        rows, payload = fetch(api_key, api_type, args.year)
        selected = [row for row in rows if row_in_scope(row, scopes)]
        output_path = OUTPUT_DIR / f"schoolinfo_{args.year}_{label}_{slug}.json"
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(selected, handle, ensure_ascii=False, indent=2)
        report["datasets"][label] = {
            "api_type": api_type,
            "result_message": payload.get("resultMsg"),
            "all_rows": len(rows),
            "selected_rows": len(selected),
            "field_names": sorted({key for row in selected for key in row}),
            "output": output_path.name,
        }

    with (OUTPUT_DIR / f"schoolinfo_{args.year}_fetch_report.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
