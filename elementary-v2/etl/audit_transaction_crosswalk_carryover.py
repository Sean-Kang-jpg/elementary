"""Measure how reviewed prior-month aptSeq crosswalks affect a later month."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from apartment_transaction_linkage import (
    DETERMINISTIC_TIERS, Linker, collapse_master, overlay_missing_master_atoms,
)
from build_apartment_transaction_snapshot import build, read_csv


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", type=Path, required=True)
    parser.add_argument("--master-supplement", type=Path, action="append", default=[])
    parser.add_argument("--prior-raw", type=Path, action="append", required=True)
    parser.add_argument("--current-raw", type=Path, action="append", required=True)
    args = parser.parse_args()
    master = read_csv(args.master)
    for path in args.master_supplement:
        master = overlay_missing_master_atoms(master, read_csv(path))
    prior = [row for path in args.prior_raw for row in json.loads(path.read_text(encoding="utf-8"))]
    current = [row for path in args.current_raw for row in json.loads(path.read_text(encoding="utf-8"))]
    prior_result = build(prior, master)
    # Audit simulation only: proposals remain review in persisted output. This
    # asks what coverage would become after a human approves every clean one.
    approved = {
        row["apt_seq"]: {
            "canonical_complex_id": row["canonical_complex_id"],
            "parcel_key": row["parcel_key"],
        }
        for row in prior_result["crosswalk_proposals"]
    }
    linker = Linker(collapse_master(master), approved)
    counts = Counter(linker.decide(row).tier for row in current)
    deterministic = sum(counts[tier] for tier in DETERMINISTIC_TIERS)
    print(json.dumps({
        "prior_crosswalk_proposals": len(approved),
        "prior_crosswalk_conflicts": len(prior_result["crosswalk_conflicts"]),
        "current_transactions": len(current),
        "current_match_tiers": dict(sorted(counts.items())),
        "current_deterministic_links": deterministic,
        "current_deterministic_rate": round(deterministic / len(current), 6) if current else 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
