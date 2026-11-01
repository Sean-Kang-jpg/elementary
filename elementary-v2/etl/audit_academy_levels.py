"""Count academies by course-list level and draw a review sample.

Reads a NEIS snapshot (collect_academy_snapshot.py output), tags each academy
with etl/academy_levels.py, and writes the bucket counts plus up to 200 random
academies per bucket for a person to check. Local files only; nothing is written
to the database.

    python etl/audit_academy_levels.py etl/runtime/academy/acainsti_scope_20261007.json \
        --out docs/research/academy-levels
"""

from __future__ import annotations

import argparse
import csv
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

from academy_institutions import EXCLUDED_REALMS
from academy_levels import level_evidence

BUCKETS = (
    "lower", "elem_only", "elem_with_secondary", "secondary_or_adult_only",
    "preschool_only", "no_level", "no_text",
)
SAMPLE = 200
SEED = 20261031


def text(row: dict, key: str) -> str:
    return str(row.get(key) or "").strip()


def bucket(row: dict, tags: set[str]) -> str:
    if not (text(row, "LE_CRSE_LIST_NM") or text(row, "PSNBY_THCC_CNTNT")):
        return "no_text"
    if "lower" in tags:
        return "lower"
    if "elem" in tags:
        return "elem_with_secondary" if "secondary" in tags else "elem_only"
    if tags == {"preschool"}:
        return "preschool_only"
    if tags & {"secondary", "adult"}:
        return "secondary_or_adult_only"
    return "no_level"


def fee_items(row: dict) -> str:
    names = (entry.split(":", 1)[0].strip() for entry in text(row, "PSNBY_THCC_CNTNT").split(","))
    return ", ".join(name for name in names if name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    rows = [row for row in json.loads(args.snapshot.read_text(encoding="utf-8"))
            if text(row, "REALM_SC_NM") not in EXCLUDED_REALMS]
    grouped: dict[str, list[tuple[dict, dict]]] = defaultdict(list)
    for row in rows:
        evidence = level_evidence(text(row, "LE_CRSE_LIST_NM"), text(row, "PSNBY_THCC_CNTNT"), text(row, "ACA_NM"))
        grouped[bucket(row, set(evidence))].append((row, evidence))

    args.out.mkdir(parents=True, exist_ok=True)
    stem = args.snapshot.stem.rsplit("_", 1)[-1]
    rng = random.Random(SEED)
    with (args.out / f"sample_{stem}.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["bucket", "institution_key", "name", "realm", "course_list", "fee_items", "levels", "evidence", "review"])
        for name in BUCKETS:
            members = grouped[name]
            for row, evidence in rng.sample(members, min(SAMPLE, len(members))):
                writer.writerow([
                    name,
                    f"neis:{text(row, 'ATPT_OFCDC_SC_CODE')}-{text(row, 'ACA_ASNUM')}",
                    text(row, "ACA_NM"),
                    text(row, "REALM_SC_NM"),
                    text(row, "LE_CRSE_LIST_NM")[:200],
                    fee_items(row)[:200],
                    "|".join(evidence),
                    " / ".join(f"{tag}:{';'.join(items[:3])}" for tag, items in evidence.items()),
                    "",
                ])

    counts = {name: len(grouped[name]) for name in BUCKETS}
    realms = {name: Counter(text(row, "REALM_SC_NM") for row, _ in grouped[name]).most_common() for name in BUCKETS}
    summary = {"snapshot": args.snapshot.name, "academies": len(rows), "buckets": counts, "realms": realms}
    (args.out / f"summary_{stem}.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    for name in BUCKETS:
        print(f"{name:26} {counts[name]:>7,} {counts[name] / len(rows):6.1%}")


if __name__ == "__main__":
    main()
