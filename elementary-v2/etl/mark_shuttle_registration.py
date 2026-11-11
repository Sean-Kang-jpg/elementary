"""Mark academies that registered a school vehicle (ACADEMY_SIGNALS_PLAN.md section 4, stage 1 item 6).

Reads the SchoolSafe 통학버스 등록현황 workbook (collect_shuttle_registration.py) and the
NEIS snapshot the markers were built from, links registration rows to NEIS institutions
with the audit's matcher (audit_shuttle_registration.Matcher: same type, province, name
and building), and adds ``"shuttle_registered": true`` to the matching institutions in
the address-marker CSV, rewriting it in place.

Only confirmed links are marked. Name-only and ambiguous rows are left out until a person
reviews them, and an institution without the flag is "not confirmed", never "no shuttle".
The registration says a vehicle is registered, not which school it serves.

Operator names and plate numbers never leave the workbook: the profile holds counts only.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

from academy_institutions import academy_entries
from audit_shuttle_registration import ALIASES, Matcher, read_registration, region_key

TARGET_TYPES = {"학원", "교습소"}
FLAG = "shuttle_registered"


def registered_keys(registration: list[dict], neis_rows: list[dict]) -> tuple[set[str], Counter]:
    masters = [{**entry, "addresses": [entry["road_address"]]}
               for entry in academy_entries(neis_rows) if entry["institution_type"] in TARGET_TYPES]
    matcher = Matcher(masters)
    valid_regions = set(ALIASES.values())
    keys: set[str] = set()
    statuses: Counter = Counter()
    for row in registration:
        # The public export carries a few '테스트시도' rows; they are not institutions.
        if row["institution_type"] not in TARGET_TYPES or region_key(row["region"]) not in valid_regions:
            continue
        result = matcher.match(row)
        statuses[result["status"]] += 1
        if result["status"] == "matched":
            keys.add(result["institution_key"])
    return keys, statuses


def mark_markers(path: Path, keys: set[str]) -> int:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames
        rows = list(reader)
    marked = 0
    for row in rows:
        institutions = json.loads(row["institutions"] or "[]")
        for item in institutions:
            item.pop(FLAG, None)
            if item.get("key") in keys:
                item[FLAG] = True
                marked += 1
        row["institutions"] = json.dumps(institutions, ensure_ascii=False)
    temporary = path.with_suffix(".marking.csv")
    with temporary.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    temporary.replace(path)
    return marked


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--registration", type=Path, required=True)
    parser.add_argument("--academies", type=Path, required=True, help="NEIS snapshot the markers were built from")
    parser.add_argument("--markers", type=Path, required=True, help="academy_address_markers_*.csv, rewritten in place")
    parser.add_argument("--profile", type=Path, required=True)
    args = parser.parse_args()
    registration = read_registration(args.registration)
    keys, statuses = registered_keys(registration, json.loads(args.academies.read_text(encoding="utf-8")))
    marked = mark_markers(args.markers, keys)
    profile = {"registration_rows": len(registration), "target_statuses": dict(statuses),
               "matched_institutions": len(keys), "marked_on_markers": marked,
               "registration": args.registration.name, "markers": args.markers.name}
    args.profile.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(profile, ensure_ascii=False))


if __name__ == "__main__":
    main()
