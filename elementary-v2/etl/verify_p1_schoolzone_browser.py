#!/usr/bin/env python3
"""Verify the first P1 batch through the official school-zone browser endpoint."""

import argparse
import csv
import html
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from pyproj import Transformer


BASE = Path(__file__).parent
DEFAULT_BUILDING = BASE / "local_outputs" / "building_refined_assignments.csv"
DEFAULT_LATEST = BASE / "local_outputs_20260320" / "apartment_point_assignments.csv"
DEFAULT_OUTPUT = BASE / "local_outputs_20260320" / "p1_schoolzone_batch1.csv"
ENDPOINT = "https://schoolzone.emac.kr/gis/schoolAreaSearch.do"

TO_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)
ZONE_RE = re.compile(
    r'id="elementSchzone"\s+hakgudoId="([^"]+)"[^>]*>(.*?)</p>',
    re.IGNORECASE | re.DOTALL,
)
SCHOOL_RE = re.compile(r'type="element"\s+schoolName="([^"]+)"', re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def clean_text(value):
    return " ".join(html.unescape(TAG_RE.sub(" ", value or "")).split())


def query_schoolzone(lon, lat):
    x, y = TO_5186.transform(lon, lat)
    payload = urllib.parse.urlencode(
        {
            "x": x,
            "y": y,
            "lon": lon,
            "lat": lat,
            "schoolType": "elementSchoolArea",
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read().decode("utf-8", errors="replace")

    zone = ZONE_RE.search(body)
    schools = sorted(set(SCHOOL_RE.findall(body)))
    return {
        "browser_hakgudo_id": zone.group(1) if zone else "",
        "browser_hakgudo_nm": clean_text(zone.group(2)) if zone else "",
        "browser_school_names": "|".join(schools),
    }


def select_batch(rows):
    selected = []
    for row in rows:
        if row.get("refined_status") != "building_match_failed":
            continue
        reasons = row.get("building_check_reasons", "")
        point_nohit = "point_nohit" in reasons
        multi_large = (
            "nearby_multiple_hakgudo" in reasons
            and "large_complex_near_boundary" in reasons
        )
        if point_nohit or multi_large:
            selected.append(("A_point_nohit" if point_nohit else "B_multi_large", row))
    return sorted(selected, key=lambda item: (item[0], -int(float(item[1].get("households") or 0))))


def main():
    parser = argparse.ArgumentParser(description="Run official browser-backed verification for P1 A+B rows.")
    parser.add_argument("--building", type=Path, default=DEFAULT_BUILDING)
    parser.add_argument("--latest", type=Path, default=DEFAULT_LATEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--sleep", type=float, default=0.15)
    args = parser.parse_args()

    latest = {row["apt_cd"]: row for row in read_csv(args.latest)}
    batch = select_batch(read_csv(args.building))
    if args.limit:
        batch = batch[: args.limit]

    output_rows = []
    for index, (category, row) in enumerate(batch, start=1):
        lon, lat = float(row["longitude"]), float(row["latitude"])
        try:
            browser = query_schoolzone(lon, lat)
            query_status = "zone_found" if browser["browser_hakgudo_nm"] else "no_zone_found"
        except Exception as exc:
            browser = {"browser_hakgudo_id": "", "browser_hakgudo_nm": "", "browser_school_names": ""}
            query_status = f"request_failed:{type(exc).__name__}"
        current = latest.get(row["apt_cd"], {})
        if category == "B_multi_large":
            decision = "needs_dong_map_review"
        elif browser["browser_hakgudo_nm"]:
            decision = "browser_point_assignment_available"
        else:
            decision = "needs_address_or_coordinate_review"

        output_rows.append(
            {
                "review_category": category,
                "review_status": query_status,
                "review_decision": decision,
                "apt_cd": row["apt_cd"],
                "apt_nm": row["apt_nm"],
                "region": row["region"],
                "households": row["households"],
                "road_address": row["road_address"],
                "longitude": row["longitude"],
                "latitude": row["latitude"],
                "x_5186": round(TO_5186.transform(lon, lat)[0], 3),
                "y_5186": round(TO_5186.transform(lon, lat)[1], 3),
                "latest_local_hakgudo_nm": current.get("primary_hakgudo_nm", ""),
                "candidate_hakgudo_names": current.get("candidate_hakgudo_names", ""),
                "browser_hakgudo_id": browser["browser_hakgudo_id"],
                "browser_hakgudo_nm": browser["browser_hakgudo_nm"],
                "browser_school_names": browser["browser_school_names"],
                "source_url": ENDPOINT,
                "review_notes": "",
            }
        )
        print(f"{index:>2}/{len(batch)} {row['apt_nm']} · {query_status} · {browser['browser_hakgudo_nm']}")
        time.sleep(args.sleep)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(output_rows[0].keys()))
        writer.writeheader()
        writer.writerows(output_rows)

    print(f"P1 A+B 브라우저 확인: {len(output_rows):,}")
    print(f"결과: {args.output}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
