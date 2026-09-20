"""Profile MOLIT apartment trades and measure linkage to the apartment master."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import urllib.parse
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
MASTER_PATH = BASE_DIR / "local_outputs_20260320" / "apartment_master_v1_20260320.csv"
RUNTIME_DIR = BASE_DIR / "runtime" / "transactions"
PROFILE_PATH = BASE_DIR / "apartment_transaction_source_profile.json"
API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_key() -> str:
    load_env(PROJECT_DIR / ".env")
    load_env(PROJECT_DIR.parent / ".env.local")
    value = os.getenv("DATA_GO_KR_DECODED_KEY") or os.getenv("MOLIT_API_KEY")
    if not value:
        raise RuntimeError("DATA_GO_KR_DECODED_KEY or MOLIT_API_KEY is required")
    return urllib.parse.unquote(value)


def normalize_name(value: str | None) -> str:
    text = re.sub(r"\s+", "", value or "").lower()
    return re.sub(r"(?:아파트|apt\.?|주상복합)$", "", text)


def normalize_jibun(value: str | None) -> str:
    text = re.sub(r"\s+", "", value or "")
    text = text.replace("번지", "")
    match = re.search(r"(산)?\s*(\d+)(?:-(\d+))?", text)
    if not match:
        return text
    prefix = "산" if match.group(1) else ""
    return f"{prefix}{int(match.group(2))}-{int(match.group(3) or 0)}"


def legal_dong_from_address(value: str) -> str:
    parts = value.split()
    for part in reversed(parts):
        if part.endswith(("동", "읍", "면", "가")):
            return part
    return ""


def aliases(row: dict[str, str]) -> set[str]:
    values = {row.get("apt_nm", ""), row.get("latest_known_name", ""), row.get("kapt_name", "")}
    try:
        values.update(json.loads(row.get("name_aliases") or "[]"))
    except json.JSONDecodeError:
        pass
    return {normalized for value in values if (normalized := normalize_name(value))}


def load_master(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for source in csv.DictReader(handle):
            legal_code = source.get("legal_dong_code", "")
            legal_address = source.get("legal_address", "")
            rows.append(
                {
                    "canonical_complex_id": source.get("canonical_complex_id"),
                    "sgg_cd": legal_code[:5],
                    "umd_nm": legal_dong_from_address(legal_address),
                    "jibun": normalize_jibun(legal_address),
                    "names": aliases(source),
                }
            )
    return rows


def parse_payload(payload: bytes) -> tuple[list[dict[str, str]], int]:
    root = ET.fromstring(payload)
    result_code = root.findtext(".//resultCode")
    if result_code not in {None, "00", "000"}:
        message = root.findtext(".//resultMsg") or "unknown API error"
        raise RuntimeError(f"MOLIT API {result_code}: {message}")
    items = [
        {child.tag: (child.text or "").strip() for child in node}
        for node in root.findall(".//item")
    ]
    return items, int(root.findtext(".//totalCount") or len(items))


def fetch_page(key: str, lawd_cd: str, deal_ymd: str, page: int, rows: int) -> tuple[list[dict[str, str]], int]:
    query = urllib.parse.urlencode(
        {
            "serviceKey": key,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ymd,
            "pageNo": page,
            "numOfRows": rows,
        }
    )
    request = urllib.request.Request(f"{API_URL}?{query}", headers={"User-Agent": "elementary-v2-etl/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return parse_payload(response.read())
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        try:
            root = ET.fromstring(payload)
            code = root.findtext(".//returnReasonCode") or root.findtext(".//resultCode")
            message = root.findtext(".//returnAuthMsg") or root.findtext(".//resultMsg")
            detail = f"{code or 'unknown'}: {message or 'unknown API error'}"
        except ET.ParseError:
            detail = payload[:300].decode("utf-8", errors="replace")
        raise RuntimeError(f"MOLIT API HTTP {exc.code}: {detail}") from exc


def fetch_all(key: str, lawd_cd: str, deal_ymd: str, rows: int) -> list[dict[str, str]]:
    first, total = fetch_page(key, lawd_cd, deal_ymd, 1, rows)
    result = list(first)
    for page in range(2, (total + rows - 1) // rows + 1):
        page_rows, _ = fetch_page(key, lawd_cd, deal_ymd, page, rows)
        result.extend(page_rows)
    return result


def transaction_value(row: dict[str, str], *names: str) -> str:
    for name in names:
        if row.get(name):
            return row[name].strip()
    return ""


def match_transactions(transactions: list[dict[str, str]], master: list[dict[str, Any]]) -> tuple[Counter[str], list[dict[str, Any]]]:
    address_index: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    district_name_index: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for complex_row in master:
        address_index[(complex_row["sgg_cd"], complex_row["umd_nm"], complex_row["jibun"])].append(complex_row)
        for name in complex_row["names"]:
            district_name_index[(complex_row["sgg_cd"], name)].append(complex_row)

    counts: Counter[str] = Counter()
    samples: list[dict[str, Any]] = []
    for transaction in transactions:
        sgg = transaction_value(transaction, "sggCd", "법정동시군구코드")
        umd = transaction_value(transaction, "umdNm", "법정동")
        jibun = normalize_jibun(transaction_value(transaction, "jibun", "지번"))
        name = normalize_name(transaction_value(transaction, "aptNm", "아파트"))
        address_candidates = address_index.get((sgg, umd, jibun), [])
        exact = [candidate for candidate in address_candidates if name in candidate["names"]]
        matched: dict[str, Any] | None = None
        if len(exact) == 1:
            tier, matched = "exact_address_name", exact[0]
        elif len(address_candidates) == 1:
            tier, matched = "unique_address", address_candidates[0]
        else:
            name_candidates = district_name_index.get((sgg, name), [])
            if len(name_candidates) == 1:
                tier, matched = "unique_district_name", name_candidates[0]
            elif exact or address_candidates or name_candidates:
                tier = "ambiguous"
            else:
                tier = "unmatched"
        counts[tier] += 1
        if len(samples) < 30 and tier != "exact_address_name":
            samples.append(
                {
                    "tier": tier,
                    "sgg_cd": sgg,
                    "umd_nm": umd,
                    "jibun": jibun,
                    "apt_nm": transaction_value(transaction, "aptNm", "아파트"),
                    "matched_complex_id": matched and matched["canonical_complex_id"],
                }
            )
    return counts, samples


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lawd-cd", default="11110", help="Five-digit legal-dong district code")
    parser.add_argument("--deal-ymd", default="202608", help="Contract month in YYYYMM")
    parser.add_argument("--rows", type=int, default=1000)
    parser.add_argument("--master", type=Path, default=MASTER_PATH)
    args = parser.parse_args()

    transactions = fetch_all(api_key(), args.lawd_cd, args.deal_ymd, args.rows)
    master = load_master(args.master)
    counts, samples = match_transactions(transactions, master)
    field_counts = Counter(field for row in transactions for field, value in row.items() if value)
    matched = sum(counts[tier] for tier in ("exact_address_name", "unique_address", "unique_district_name"))
    profile = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "source": {
            "provider": "국토교통부",
            "dataset": "아파트 매매 실거래 상세 자료",
            "endpoint": API_URL,
            "lawd_cd": args.lawd_cd,
            "deal_ymd": args.deal_ymd,
        },
        "transactions": len(transactions),
        "available_fields": sorted(field_counts),
        "field_population": dict(sorted(field_counts.items())),
        "match_counts": dict(counts),
        "matched_transactions": matched,
        "match_rate": round(matched / len(transactions), 4) if transactions else 0,
        "non_exact_samples": samples,
        "notes": [
            "The API has no K-apt code or canonical_complex_id; linkage is derived.",
            "Raw transaction rows are private runtime artifacts and must not be committed.",
            "Cancellation/change fields must be retained because the source is mutable after first publication.",
        ],
    }

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = RUNTIME_DIR / f"apt_trade_{args.lawd_cd}_{args.deal_ymd}.json"
    raw_path.write_text(json.dumps(transactions, ensure_ascii=False, indent=2), encoding="utf-8")
    sample_profile_path = BASE_DIR / f"apartment_transaction_source_profile_{args.lawd_cd}_{args.deal_ymd}.json"
    sample_profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    PROFILE_PATH.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(profile, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
