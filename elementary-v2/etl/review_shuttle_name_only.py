"""Person review of registration rows that match an academy by name but not by building.

ACADEMY_SIGNALS_PLAN.md section 4, stage 1 item 6: such rows are not marked until a person
looks. This writes the review sheet and records the decisions.

    python etl/review_shuttle_name_only.py export \
        --registration etl/runtime/shuttle/shuttle_registration_20261116.xlsx \
        --academies etl/runtime/academy/acainsti_scope_20261116.json
    # fill the review column with Y (same institution) or N, then
    python etl/review_shuttle_name_only.py accept etl/runtime/shuttle/shuttle_review_20261116.csv

The sheet carries names and addresses and stays in ignored runtime/. What is committed,
etl/shuttle_reviewed_links.json, holds a hash of the registration row and the institution
key only. mark_shuttle_registration.py marks an accepted link while the registration row
is unchanged and still names that institution as a candidate.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from datetime import date
from pathlib import Path

from academy_institutions import academy_entries
from audit_shuttle_registration import (ALIASES, Matcher, name_key, normalize_address, read_registration,
                                        region_key, road_number_key)

BASE_DIR = Path(__file__).resolve().parent
REVIEWED = BASE_DIR / "shuttle_reviewed_links.json"
TARGET_TYPES = {"학원", "교습소"}
REVIEW_STATUSES = {"name_only_address_unverified", "ambiguous"}
FIELDS = ("registration_id", "region", "institution_type", "registered_name", "registered_address",
          "institution_key", "institution_name", "institution_address", "hint", "review")


def registration_id(row: dict) -> str:
    """Stable across downloads: the source row number changes, the institution does not."""
    address = re.sub(r"\s+", "", normalize_address(row["address"]))
    text = "|".join((row["institution_type"], region_key(row["region"]), name_key(row["name"]), address))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def masters_from(neis_rows: list[dict]) -> list[dict]:
    return [{**entry, "addresses": [entry["road_address"]]}
            for entry in academy_entries(neis_rows) if entry["institution_type"] in TARGET_TYPES]


def review_rows(registration: list[dict], masters: list[dict]) -> list[tuple[dict, dict]]:
    """(registration row, match result) for every row a person has to decide."""
    matcher = Matcher(masters)
    valid_regions = set(ALIASES.values())
    rows = []
    for row in registration:
        if row["institution_type"] not in TARGET_TYPES or region_key(row["region"]) not in valid_regions:
            continue
        result = matcher.match(row)
        if result["status"] in REVIEW_STATUSES:
            rows.append((row, result))
    return rows


def hint(registered: str, candidate: str) -> str:
    """Where the two addresses part, to sort the sheet. Not a decision."""
    mine, theirs = road_number_key(registered), road_number_key(candidate)
    if not mine:
        return "등록 주소가 지번 — 지도로 확인"
    if not theirs:
        return "학원 주소에 도로명 없음"
    _, city, road, _ = mine.split(":")
    _, other_city, other_road, _ = theirs.split(":")
    if city != other_city:
        return "다른 시군구 — 다른 지점일 가능성이 큼"
    if road == other_road:
        return "같은 도로, 번호 다름 — 이전·표기 차이 가능"
    return "같은 시군구, 다른 도로"


def load_reviewed(path: Path = REVIEWED) -> dict[str, str]:
    if not path.exists():
        return {}
    return {item["registration_id"]: item["institution_key"]
            for item in json.loads(path.read_text(encoding="utf-8"))["links"]}


def export(registration_path: Path, academies_path: Path, output: Path) -> int:
    masters = masters_from(json.loads(academies_path.read_text(encoding="utf-8")))
    by_key = {item["institution_key"]: item for item in masters}
    reviewed = load_reviewed()
    rows = []
    for row, result in review_rows(read_registration(registration_path), masters):
        rid = registration_id(row)
        for key in result["candidates"]:
            candidate = by_key[key]
            rows.append({
                "registration_id": rid, "region": row["region"], "institution_type": row["institution_type"],
                "registered_name": row["name"], "registered_address": row["address"],
                "institution_key": key, "institution_name": candidate["name"],
                "institution_address": candidate["road_address"],
                "hint": hint(row["address"], candidate["road_address"]),
                "review": "Y" if reviewed.get(rid) == key else "",
            })
    rows.sort(key=lambda item: (item["hint"], item["region"], item["registered_name"]))
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def accept(sheet: Path, path: Path = REVIEWED) -> dict[str, int]:
    with sheet.open(encoding="utf-8-sig", newline="") as handle:
        decided = [row for row in csv.DictReader(handle) if row["review"].strip().upper() in {"Y", "N"}]
    links = {item["registration_id"]: item for item in
             (json.loads(path.read_text(encoding="utf-8"))["links"] if path.exists() else [])}
    yes = [row for row in decided if row["review"].strip().upper() == "Y"]
    per_registration: dict[str, list[str]] = {}
    for row in yes:
        per_registration.setdefault(row["registration_id"], []).append(row["institution_key"])
    doubled = [rid for rid, keys in per_registration.items() if len(keys) > 1]
    if doubled:
        raise SystemExit(f"{len(doubled)} registration rows have more than one Y: {', '.join(doubled[:5])}")
    today = date.today().isoformat()
    for row in decided:
        rid = row["registration_id"]
        if row["review"].strip().upper() == "Y":
            links[rid] = {"registration_id": rid, "institution_key": row["institution_key"], "decided_on": today}
        elif links.get(rid, {}).get("institution_key") == row["institution_key"]:
            del links[rid]
    path.write_text(json.dumps({"links": sorted(links.values(), key=lambda item: item["registration_id"])},
                               ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"decided": len(decided), "accepted": len(yes), "links": len(links)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    out = commands.add_parser("export")
    out.add_argument("--registration", type=Path, required=True)
    out.add_argument("--academies", type=Path, required=True)
    out.add_argument("--output", type=Path)
    take = commands.add_parser("accept")
    take.add_argument("sheet", type=Path)
    args = parser.parse_args()
    if args.command == "export":
        stamp = re.search(r"(\d{8})", args.registration.name)
        suffix = stamp.group(1) if stamp else f"{date.today():%Y%m%d}"
        output = args.output or BASE_DIR / "runtime" / "shuttle" / f"shuttle_review_{suffix}.csv"
        print(json.dumps({"rows": export(args.registration, args.academies, output), "sheet": str(output)}, ensure_ascii=False))
    else:
        print(json.dumps(accept(args.sheet), ensure_ascii=False))


if __name__ == "__main__":
    main()
