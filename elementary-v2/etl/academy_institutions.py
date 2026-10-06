"""Private institution list of the academy layer, keyed per institution, and its
month-over-month diff (docs/operations/ACADEMY_REFRESH_PLAN.md section 7).

The serving tables key on addresses and the marker builder merges institutions by
name, so neither can tell an opening from a rename. This list keeps the source keys:

- NEIS academies   ``neis:{ATPT_OFCDC_SC_CODE}-{ACA_ASNUM}``. The number alone
  repeats across education offices (75,034 values in 138,542 rows, 2026-10-06).
- Sports dojos     ``dojo:{OPN_ATMY_GRP_CD}-{MNG_NO}``, already composed as
  ``source_id`` by collect_sports_dojo_snapshot.py. MNG_NO alone repeats across
  local governments (1,571 values in 32,882 rows).

Membership follows the sources, not the map: academies outside EXCLUDED_REALMS and
dojos in business. Geocoding is left out on purpose, or a month of VWorld failures
would read as closures.

The list holds road addresses and stays private (Storage academy-refresh/institutions/).
The diff report carries counts and keys with names only.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

# Same exclusion as build_academy_marker_snapshot.py; kept in step by a test.
EXCLUDED_REALMS = {"직업기술"}
ACTIVE_DOJO = "영업/정상"
FIELDS = ("institution_key", "source", "name", "institution_type", "realm", "region", "road_address", "registered_on")
SAMPLE = 20


def normalize_address(value: str) -> str:
    return " ".join(str(value or "").split())


def academy_entries(rows: Iterable[dict[str, Any]]) -> list[dict[str, str]]:
    entries = []
    for row in rows:
        realm = (row.get("REALM_SC_NM") or "").strip()
        office, number = (row.get("ATPT_OFCDC_SC_CODE") or "").strip(), (row.get("ACA_ASNUM") or "").strip()
        if realm in EXCLUDED_REALMS or not office or not number:
            continue
        entries.append({
            "institution_key": f"neis:{office}-{number}",
            "source": "neis",
            "name": (row.get("ACA_NM") or "").strip(),
            "institution_type": (row.get("ACA_INSTI_SC_NM") or "").strip(),
            "realm": realm,
            "region": row.get("_region", ""),
            "road_address": normalize_address(row.get("FA_RDNMA", "")),
            "registered_on": (row.get("REG_YMD") or "").strip(),
        })
    return entries


def dojo_entries(rows: Iterable[dict[str, Any]]) -> list[dict[str, str]]:
    entries = []
    for row in rows:
        if row.get("business_status") != ACTIVE_DOJO:
            continue
        # A snapshot collected before 2026-10-06 has source_id = MNG_NO alone, which
        # is not unique; refuse it rather than silently merging dojos.
        if not row.get("local_gov_code"):
            raise ValueError("sports-dojo snapshot has no local_gov_code; recollect it")
        entries.append({
            "institution_key": f"dojo:{row['source_id']}",
            "source": "dojo",
            "name": row.get("institution_name", ""),
            "institution_type": "체육도장업",
            "realm": row.get("sport_type", ""),
            "region": row.get("region", ""),
            "road_address": normalize_address(row.get("road_address") or row.get("lot_address") or ""),
            "registered_on": row.get("licensed_on", ""),
        })
    return entries


def build_entries(academy_rows, dojo_rows) -> list[dict[str, str]]:
    entries = academy_entries(academy_rows) + dojo_entries(dojo_rows)
    duplicates = [key for key, count in Counter(row["institution_key"] for row in entries).items() if count > 1]
    if duplicates:
        raise ValueError(f"{len(duplicates):,} institution keys repeat, e.g. {duplicates[:3]}")
    return sorted(entries, key=lambda row: row["institution_key"])


def write_entries(path: Path, entries: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(entries)


def read_entries(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def diff_entries(previous: list[dict[str, str]], current: list[dict[str, str]]) -> dict[str, Any]:
    before = {row["institution_key"]: row for row in previous}
    after = {row["institution_key"]: row for row in current}
    kept = before.keys() & after.keys()
    added, removed = sorted(after.keys() - before.keys()), sorted(before.keys() - after.keys())
    renamed = sorted(key for key in kept if before[key]["name"] != after[key]["name"])
    moved = sorted(key for key in kept if before[key]["road_address"] != after[key]["road_address"])

    def by_source(keys: Iterable[str]) -> dict[str, int]:
        return dict(sorted(Counter(key.split(":", 1)[0] for key in keys).items()))

    return {
        "previous": len(before),
        "current": len(after),
        "kept": len(kept),
        "added": by_source(added),
        "removed": by_source(removed),
        "renamed": by_source(renamed),
        "moved": by_source(moved),
        # Names only: the report can leave the machine as an Actions artifact.
        "samples": {
            "added": [{"key": key, "name": after[key]["name"]} for key in added[:SAMPLE]],
            "removed": [{"key": key, "name": before[key]["name"]} for key in removed[:SAMPLE]],
            "renamed": [{"key": key, "from": before[key]["name"], "to": after[key]["name"]} for key in renamed[:SAMPLE]],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--academies", type=Path, required=True, help="NEIS snapshot (acainsti_scope_*.json)")
    parser.add_argument("--sports-dojos", type=Path, required=True, help="sports_dojo_nationwide_*.json")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--previous", type=Path, help="last month's list; prints the diff")
    args = parser.parse_args()

    entries = build_entries(
        json.loads(args.academies.read_text(encoding="utf-8")),
        json.loads(args.sports_dojos.read_text(encoding="utf-8")),
    )
    write_entries(args.output, entries)
    print(f"{len(entries):,} institutions -> {args.output}")
    if args.previous:
        print(json.dumps(diff_entries(read_entries(args.previous), entries), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
