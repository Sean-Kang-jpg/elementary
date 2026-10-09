"""Compare transaction linkage decisions across two apartment masters.

This is a read-only release audit.  A refreshed apartment master must not
silently reduce deterministic trade linkage; every regression is emitted with
enough non-sensitive evidence to diagnose alias/address drift.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

try:
    from apartment_transaction_linkage import Linker, collapse_master, normalize_name, overlay_missing_master_atoms, parcel_key, road_key
except ModuleNotFoundError:  # pragma: no cover - package invocation
    from etl.apartment_transaction_linkage import Linker, collapse_master, normalize_name, overlay_missing_master_atoms, parcel_key, road_key


def read_master(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_trades(paths: list[Path]) -> list[dict[str, str]]:
    trades: list[dict[str, str]] = []
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(payload, list):
            raise ValueError(f"expected a JSON array: {path}")
        trades.extend(payload)
    return trades


def compare(
    trades: list[dict[str, str]],
    baseline_rows: list[dict[str, str]],
    candidate_rows: list[dict[str, str]],
) -> dict[str, object]:
    baseline = Linker(collapse_master(baseline_rows))
    candidate = Linker(collapse_master(candidate_rows))
    transitions: Counter[str] = Counter()
    regressions: list[dict[str, object]] = []

    for trade in trades:
        before = baseline.decide(trade)
        after = candidate.decide(trade)
        transitions[f"{before.tier}->{after.tier}"] += 1
        if before.deterministic and not after.deterministic:
            regressions.append(
                {
                    "apt_seq": trade.get("aptSeq", ""),
                    "normalized_name": normalize_name(trade.get("aptNm", "")),
                    "parcel_key": parcel_key(trade),
                    "road_key": road_key(trade),
                    "baseline_tier": before.tier,
                    "baseline_complex_id": before.canonical_complex_id,
                    "candidate_tier": after.tier,
                    "candidate_ids": list(after.candidate_ids),
                }
            )

    return {
        "trade_rows": len(trades),
        "baseline_candidates": len(baseline.candidates),
        "candidate_candidates": len(candidate.candidates),
        "deterministic_regressions": len(regressions),
        "transitions": dict(sorted(transitions.items())),
        "regressions": regressions,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-master", type=Path, required=True)
    parser.add_argument("--candidate-master", type=Path, nargs="+", required=True)
    parser.add_argument("--trades", type=Path, nargs="+", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    candidate_rows = read_master(args.candidate_master[0])
    for path in args.candidate_master[1:]:
        candidate_rows = overlay_missing_master_atoms(candidate_rows, read_master(path))
    report = compare(read_trades(args.trades), read_master(args.baseline_master), candidate_rows)
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
