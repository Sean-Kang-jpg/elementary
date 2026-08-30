"""Fetch and region-filter 2026 Schoolinfo disclosure datasets."""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
ENDPOINT = "https://www.schoolinfo.go.kr/openApi.do"
CAPITAL_OFFICES = {
    "서울특별시교육청",
    "경기도교육청",
    "인천광역시교육청",
}
CAPITAL_PREFIXES = ("서울특별시", "경기도", "인천광역시")


def first_value(row: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def is_capital_row(row: dict[str, Any]) -> bool:
    office = first_value(row, ("ATPT_OFCDC_ORG_NM", "ATPT_OFCDC_NM", "SIDO_NM"))
    address = first_value(row, ("ORG_RDNMA", "RDNMA", "ADRCD_NM", "ADDRESS"))
    return office in CAPITAL_OFFICES or address.startswith(CAPITAL_PREFIXES)


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=date.today().year)
    args = parser.parse_args()
    if not 2000 <= args.year <= date.today().year + 1:
        raise ValueError("year is outside the supported range")

    api_key = os.getenv("KERIS_SCHOOLINFO_API_KEY") or load_env_value(
        BASE_DIR.parent / ".env", "KERIS_SCHOOLINFO_API_KEY"
    )
    if not api_key:
        raise RuntimeError("KERIS_SCHOOLINFO_API_KEY is not configured")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "generated_at": datetime.now().isoformat(),
        "year": args.year,
        "filter": "capital education office or address prefix",
        "datasets": {},
    }

    for api_type, label in (("0", "basic"), ("09", "grade_students")):
        rows, payload = fetch(api_key, api_type, args.year)
        capital_rows = [row for row in rows if is_capital_row(row)]
        output_path = OUTPUT_DIR / f"schoolinfo_{args.year}_{label}_capital.json"
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(capital_rows, handle, ensure_ascii=False, indent=2)
        report["datasets"][label] = {
            "api_type": api_type,
            "result_message": payload.get("resultMsg"),
            "all_rows": len(rows),
            "capital_rows": len(capital_rows),
            "field_names": sorted({key for row in capital_rows for key in row}),
            "output": output_path.name,
        }

    with (OUTPUT_DIR / f"schoolinfo_{args.year}_fetch_report.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
