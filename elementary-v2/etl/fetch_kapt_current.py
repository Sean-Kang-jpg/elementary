"""Fetch current K-apt basic/detail records for known capital-region codes."""

from __future__ import annotations

import argparse
import csv
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
ROOT_DIR = BASE_DIR.parents[2]
DEFAULT_CODES = ROOT_DIR / "archive" / "legacy-v1" / "etl" / "data" / "kapt" / "20250801_apt_data.csv"
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
API_BASE = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4"
REGIONS = {"서울특별시", "경기도", "인천광역시"}


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value)


def api_key() -> str:
    load_env(PROJECT_DIR / ".env")
    value = os.getenv("DATA_GO_KR_DECODED_KEY") or os.getenv("MOLIT_API_KEY")
    if not value:
        raise RuntimeError("DATA_GO_KR_DECODED_KEY or MOLIT_API_KEY is required")
    return urllib.parse.unquote(value)


def load_codes(path: Path) -> list[str]:
    with path.open(encoding="cp949", newline="") as handle:
        rows = csv.DictReader(handle)
        return sorted({row["단지코드"].strip() for row in rows if row.get("시도") in REGIONS and row.get("단지코드")})


def parse_response(payload: bytes, content_type: str) -> tuple[dict[str, Any] | None, str | None]:
    if "json" in content_type or payload.lstrip().startswith(b"{"):
        data = json.loads(payload)
        service_error = data.get("OpenAPI_ServiceResponse", {}).get("cmmMsgHeader", {})
        if service_error:
            return None, f"{service_error.get('returnReasonCode')}: {service_error.get('returnAuthMsg') or service_error.get('errMsg')}"
        response = data.get("response", data)
        header = response.get("header", {})
        if str(header.get("resultCode", "00")) not in {"00", "0"}:
            return None, f"{header.get('resultCode')}: {header.get('resultMsg')}"
        body = response.get("body", {})
        item = body.get("item") or body.get("items", {}).get("item")
        if isinstance(item, list):
            item = item[0] if item else None
        return item, None

    root = ET.fromstring(payload)
    reason = root.findtext(".//returnAuthMsg") or root.findtext(".//resultMsg")
    reason_code = root.findtext(".//returnReasonCode") or root.findtext(".//resultCode")
    item_node = root.find(".//item")
    if item_node is None:
        return None, f"{reason_code or 'unknown'}: {reason or 'empty response'}"
    return {child.tag: child.text for child in item_node}, None


def fetch(endpoint: str, kapt_code: str, key: str) -> tuple[dict[str, Any] | None, str | None]:
    query = urllib.parse.urlencode({"serviceKey": key, "kaptCode": kapt_code, "_type": "json"})
    request = urllib.request.Request(
        f"{API_BASE}/{endpoint}?{query}",
        headers={"User-Agent": "elementary-v2-etl/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return parse_response(response.read(), response.headers.get_content_type())
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        try:
            _, reason = parse_response(payload, exc.headers.get_content_type())
        except Exception:
            reason = payload[:300].decode("utf-8", errors="replace")
        return None, f"HTTP {exc.code}: {reason}"
    except (urllib.error.URLError, TimeoutError) as exc:
        return None, str(exc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--codes-from", type=Path, default=DEFAULT_CODES)
    parser.add_argument("--limit", type=int, default=0, help="0 fetches every known capital-region code")
    parser.add_argument("--include-detail", action="store_true")
    parser.add_argument("--delay", type=float, default=0.1)
    args = parser.parse_args()

    key = api_key()
    codes = load_codes(args.codes_from)
    if args.limit:
        codes = codes[: args.limit]
    snapshot_date = date.today().isoformat()
    output_path = OUTPUT_DIR / f"kapt_api_snapshot_{snapshot_date}.json"
    report_path = OUTPUT_DIR / f"kapt_api_snapshot_{snapshot_date}_report.json"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    existing: dict[str, dict[str, Any]] = {}
    if output_path.exists():
        existing = {row["kapt_code"]: row for row in json.loads(output_path.read_text(encoding="utf-8"))}

    failures: list[dict[str, str]] = []
    for index, code in enumerate(codes, start=1):
        if code in existing and (not args.include_detail or existing[code].get("detail")):
            continue
        basic, error = fetch("getAphusBassInfoV4", code, key)
        if error:
            failures.append({"kapt_code": code, "endpoint": "basic", "error": error})
            if index == 1 and "NO_OPENAPI_SERVICE" in error:
                break
            continue
        detail = None
        if args.include_detail:
            detail, detail_error = fetch("getAphusDtlInfoV4", code, key)
            if detail_error:
                failures.append({"kapt_code": code, "endpoint": "detail", "error": detail_error})
        existing[code] = {"kapt_code": code, "fetched_at": datetime.now().isoformat(), "basic": basic, "detail": detail}
        if index % 100 == 0:
            output_path.write_text(json.dumps(list(existing.values()), ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"fetched {index:,}/{len(codes):,}")
        time.sleep(args.delay)

    output_path.write_text(json.dumps(list(existing.values()), ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "generated_at": datetime.now().isoformat(),
        "requested_codes": len(codes),
        "fetched_codes": len(existing),
        "failed_requests": len(failures),
        "include_detail": args.include_detail,
        "failures": failures[:100],
        "output": output_path.name,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
