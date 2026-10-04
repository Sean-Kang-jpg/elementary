"""Collect school care disclosures and community care centers for SQL 23.

Two sources, both loaded into their own public tables so the recurring master
ETL is untouched:

- Schoolinfo apiType=59 (방과후학교·돌봄교실 공시), joined to `school_master`
  through its `schoolinfo_code`. The disclosure has no applicant or waitlist
  counts; the frontend derives a care-to-students ratio as a proxy.
- The 다함께돌봄 support team's public center list (dadol.or.kr), which also
  carries Seoul's 우리동네키움센터. Only approved centers, and only the fields
  the site's own public center page shows. The JSON also returns staff names
  and e-mails; they are dropped on read and never written anywhere.

Dry run by default: writes local snapshots under etl/runtime/care/.
`--apply` upserts, then removes rows from earlier snapshots. Run monthly.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
for path in (PROJECT_DIR, BASE_DIR):  # geocode_academy_addresses imports region_registry bare
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from etl.fetch_schoolinfo_2026 import fetch as fetch_schoolinfo  # noqa: E402
from etl.geocode_academy_addresses import env_value, geocode  # noqa: E402

RUNTIME_DIR = BASE_DIR / "runtime" / "care"
GEOCODE_CACHE = RUNTIME_DIR / "care_geocode_cache.json"
CENTER_LIST_URL = "https://dadol.or.kr/board/center/list?page=1&rows=5000"
# Fields kept from the center list. Everything else, including the staff
# contact fields, is discarded before anything is cached or written.
CENTER_FIELDS = (
    "center_id", "name", "macd_desc", "micd_desc", "address1", "address2", "tel",
    "capacity", "c_term", "c_vaca", "status_desc", "updatedate",
)
REGION_NAMES = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
    "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시",
    "경기": "경기도", "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도", "경남": "경상남도",
    "제주": "제주특별자치도",
}
SCHOOL_FIELDS = {
    "afternoon_care_rooms": "ECC_PM_OPER_CCCLA_FGR",
    "afternoon_care_students": "ECC_PM_PTPT_STDNT_FGR",
    "evening_care_rooms": "ECC_DINNR_OPER_CCCLA_FGR",
    "evening_care_students": "ECC_DINNR_PTPT_STDNT_FGR",
    "linked_care_rooms": "ASL_LINK_ECC_OPER_CCCLA_FGR",
    "linked_care_students": "ASL_LINK_ECC_PTPT_STDNT_FGR",
    "afterschool_aptitude_programs": "ASL_SPABL_APTD_PGM_FGR",
    "afterschool_curriculum_programs": "ASL_CURR_PGM_FGR",
    "afterschool_participants": "ASL_PTPT_STDNT_FGR",
}
HOURS = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})\s*$")


def integer(value: Any) -> int | None:
    try:
        number = int(float(str(value).replace(",", "")))
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def hours(value: Any) -> str | None:
    """'13:00 ~ 19:00' -> '13:00~19:00'; unset ('00:00 ~ 00:00') or inverted -> None."""
    match = HOURS.match(str(value or ""))
    if not match:
        return None
    open_h, open_m, close_h, close_m = (int(part) for part in match.groups())
    if not (0 <= open_h <= 24 and 0 <= close_h <= 24 and open_m < 60 and close_m < 60):
        return None
    if open_h * 60 + open_m >= close_h * 60 + close_m:
        return None
    return f"{open_h:02d}:{open_m:02d}~{close_h:02d}:{close_m:02d}"


# Incheon reorganised its districts on 2026-07-01 and VWorld knows only the new
# names; centers still type the old ones. Each old name maps to every successor.
INCHEON_SUCCESSORS = {"중구": ("제물포구", "영종구"), "동구": ("제물포구",), "서구": ("서해구", "검단구")}


def address_variants(address: str) -> list[tuple[str, str]]:
    """(spelling, VWorld address type) pairs to try, the center's own first.

    Centers type their addresses by hand: parenthesised building names,
    '87번길' split from its road, '경기 광주' without 시, 면 that became 읍,
    pre-reorganisation Incheon districts, and lot-number addresses.
    """
    cleaned = re.sub(r"\s*\(.*?\)\s*", " ", address)
    cleaned = re.sub(r"(로|길)\s+(\d+(?:번)?길)", r"\1\2", cleaned)
    cleaned = re.sub(r"^(경기|충북|충남|전북|전남|경북|경남|강원)\s+([가-힣]{2})\s", r"\1 \2시 ", cleaned)
    cleaned = " ".join(cleaned.split())
    # A road address is unique without its 읍·면, which may have been renamed.
    no_town = " ".join(token for token in cleaned.split() if not re.fullmatch(r"[가-힣]+[읍면]", token))
    spellings = [address, cleaned, no_town]
    parts = no_town.split()
    if len(parts) > 2 and parts[0] in ("인천", "인천광역시") and parts[1] in INCHEON_SUCCESSORS:
        spellings += [" ".join([parts[0], successor, *parts[2:]]) for successor in INCHEON_SUCCESSORS[parts[1]]]
    variants = [(spelling, "road") for spelling in dict.fromkeys(spellings)]
    if re.search(r"[가-힣]+[리동가]\s+\d+(-\d+)?$", cleaned):
        variants.append((cleaned, "parcel"))
    return variants


def geocode_center(key: str, address: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for variant, address_type in address_variants(address):
        result = geocode(key, variant, address_type=address_type)
        if result.get("status") in ("matched", "transport_error"):
            return result
    return result


def credentials() -> tuple[str, str, str]:
    url = env_value("SUPABASE_URL")
    service_key = env_value("SUPABASE_SERVICE_KEY")
    anon_key = env_value("SUPABASE_ANON_KEY") or env_value("VITE_SUPABASE_ANON_KEY")
    if not url or not service_key or not anon_key:
        raise RuntimeError("SUPABASE_URL, SUPABASE_SERVICE_KEY, and SUPABASE_ANON_KEY are required")
    return url.rstrip("/"), service_key, anon_key


def rest(url: str, key: str, path: str, *, method: str = "GET", data: Any = None,
         headers: dict[str, str] | None = None) -> tuple[Any, dict[str, str]]:
    body = json.dumps(data, ensure_ascii=False).encode("utf-8") if data is not None else None
    request = urllib.request.Request(f"{url}/rest/v1/{path}", data=body, method=method, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        **(headers or {}),
    })
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
            return (json.loads(raw) if raw else None), dict(response.headers)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"{method} {path.split('?')[0]} HTTP {error.code}: {detail}") from None


def school_codes(url: str, key: str) -> dict[str, str]:
    """schoolinfo_code -> school_id, paginated past the 1000-row cap."""
    mapping: dict[str, str] = {}
    start = 0
    while True:
        rows, _ = rest(url, key, "school_master?select=school_id,schoolinfo_code&schoolinfo_code=not.is.null",
                       headers={"Range": f"{start}-{start + 999}"})
        for row in rows:
            mapping[row["schoolinfo_code"]] = row["school_id"]
        if len(rows) < 1000:
            return mapping
        start += 1000


def build_school_rows(year: int, codes: dict[str, str], snapshot: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    api_key = env_value("KERIS_SCHOOLINFO_API_KEY")
    if not api_key:
        raise RuntimeError("KERIS_SCHOOLINFO_API_KEY is not configured")
    source_rows, _ = fetch_schoolinfo(api_key, "59", year)
    rows = []
    unmatched = 0
    for source in source_rows:
        school_id = codes.get(str(source.get("SCHUL_CODE") or "").strip())
        if not school_id:
            unmatched += 1
            continue
        row: dict[str, Any] = {"school_id": school_id, "statistics_year": year, "snapshot_date": snapshot}
        row.update({column: integer(source.get(field)) for column, field in SCHOOL_FIELDS.items()})
        rows.append(row)
    return rows, {"source_rows": len(source_rows), "matched": len(rows), "unmatched": unmatched}


def fetch_centers() -> list[dict[str, Any]]:
    request = urllib.request.Request(CENTER_LIST_URL, headers={"User-Agent": "wherecho-care-collector/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))
    records = payload.get("list_data") or []
    if len(records) != int(payload.get("records") or -1):
        raise RuntimeError(f"center list incomplete: {len(records)} of {payload.get('records')}")
    return [{field: record.get(field) for field in CENTER_FIELDS} for record in records]


def build_center_rows(snapshot: str, workers: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    centers = [center for center in fetch_centers() if center.get("status_desc") == "승인완료"]
    cache: dict[str, dict[str, Any]] = (
        json.loads(GEOCODE_CACHE.read_text(encoding="utf-8")) if GEOCODE_CACHE.exists() else {}
    )
    key = env_value("VWORLD_API_KEY")
    addresses = {" ".join(str(c.get("address1") or "").split()) for c in centers} - {""}
    # Misses are retried each run: a center may have corrected its address.
    pending = sorted(a for a in addresses if cache.get(a, {}).get("status") != "matched")
    if pending:
        if not key:
            raise RuntimeError("VWORLD_API_KEY is required to geocode new addresses")
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for address, result in zip(pending, pool.map(lambda a: geocode_center(key, a), pending)):
                if result.get("status") != "transport_error":
                    cache[address] = result
        GEOCODE_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    rows = []
    outcome: Counter[str] = Counter()
    for center in centers:
        address = " ".join(str(center.get("address1") or "").split())
        point = cache.get(address) or {}
        region = REGION_NAMES.get(str(center.get("macd_desc") or ""))
        if point.get("status") != "matched" or not region:
            outcome["no_coordinates" if region else "no_region"] += 1
            continue
        name = str(center["name"]).strip()
        rows.append({
            "center_id": str(center["center_id"]),
            "center_kind": "우리동네키움센터" if "키움" in name else "다함께돌봄센터",
            "name": name,
            "region": region,
            "district": center.get("micd_desc") or None,
            "address": address,
            "address_detail": (center.get("address2") or "").strip() or None,
            "phone": (center.get("tel") or "").strip() or None,
            "capacity": integer(center.get("capacity")) or None,
            "term_hours": hours(center.get("c_term")),
            "vacation_hours": hours(center.get("c_vaca")),
            "latitude": point["latitude"],
            "longitude": point["longitude"],
            "source_updated_on": str(center.get("updatedate") or "")[:10] or None,
            "snapshot_date": snapshot,
        })
        outcome["loaded"] += 1
    report = {
        "approved_centers": len(centers),
        **dict(outcome),
        "with_vacation_hours": sum(1 for row in rows if row["vacation_hours"]),
        "with_term_hours": sum(1 for row in rows if row["term_hours"]),
        "kinds": dict(Counter(row["center_kind"] for row in rows)),
    }
    return rows, report


def remote_count(url: str, key: str, table: str) -> int:
    _, headers = rest(url, key, f"{table}?select=*", headers={"Prefer": "count=exact", "Range": "0-0"})
    return int(headers.get("Content-Range", "*/0").rsplit("/", 1)[1])


def replace_table(url: str, key: str, table: str, conflict: str, rows: list[dict[str, Any]], snapshot: str) -> None:
    """Upsert this snapshot, then drop rows only an earlier snapshot had.

    Refuses to shrink a table by more than a fifth: a source that answered
    partially must not quietly delete most of what is live.
    """
    before = remote_count(url, key, table)
    if before and len(rows) < before * 0.8:
        raise RuntimeError(f"{table}: {len(rows)} rows would replace {before}; refusing to shrink by over 20%")
    for start in range(0, len(rows), 500):
        rest(url, key, f"{table}?on_conflict={conflict}", method="POST", data=rows[start:start + 500],
             headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    rest(url, key, f"{table}?snapshot_date=lt.{snapshot}", method="DELETE", headers={"Prefer": "return=minimal"})
    after = remote_count(url, key, table)
    if after != len(rows):
        raise RuntimeError(f"{table}: remote has {after} rows, snapshot has {len(rows)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--year", type=int, default=date.today().year, help="Schoolinfo publication year")
    parser.add_argument("--apply", action="store_true", help="upload after SQL 23 has been applied")
    parser.add_argument("--workers", type=int, default=4, help="parallel geocoding requests")
    args = parser.parse_args()

    snapshot = date.today().isoformat()
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    url, service_key, anon_key = credentials()

    school_rows, school_report = build_school_rows(args.year, school_codes(url, service_key), snapshot)
    center_rows, center_report = build_center_rows(snapshot, args.workers)
    report = {"snapshot_date": snapshot, "schoolinfo_year": args.year,
              "school_care_statistics": school_report, "care_centers": center_report}
    for name, rows in (("school_care_statistics", school_rows), ("care_centers", center_rows)):
        (RUNTIME_DIR / f"{name}_{snapshot}.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")

    if args.apply:
        replace_table(url, service_key, "school_care_statistics", "school_id", school_rows, snapshot)
        replace_table(url, service_key, "care_centers", "center_id", center_rows, snapshot)
        report["anon_school_care_statistics"] = remote_count(url, anon_key, "school_care_statistics")
        sample = center_rows[0]
        nearby, _ = rest(url, anon_key, "rpc/nearby_care_centers", method="POST", data={
            "p_latitude": sample["latitude"], "p_longitude": sample["longitude"], "p_max_distance_m": 1000,
        })
        report["anon_rpc_sample_rows"] = len(nearby or [])
    report["mode"] = "apply" if args.apply else "dry-run"
    (RUNTIME_DIR / f"care_report_{snapshot}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
