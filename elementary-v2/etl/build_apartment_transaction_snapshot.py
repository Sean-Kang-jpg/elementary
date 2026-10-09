"""Build private MOLIT trade rows, linkage decisions, and publishable summaries.

The input is an immutable raw monthly JSON snapshot.  Equal-looking trades are
kept as separate rows through source-row ordinal plus occurrence ordinal.
Publication is disabled unless the deterministic linkage gate passes.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path
from statistics import median
from typing import Any

try:  # package import in tests; direct import when run as a script
    from .apartment_transaction_linkage import (
        DETERMINISTIC_TIERS, MATCHER_VERSION, Linker, apt_seq_address_key, area_band, collapse_master,
        decimal_value, overlay_missing_master_atoms, trade_fingerprint, value,
    )
except ImportError:
    from apartment_transaction_linkage import (
        DETERMINISTIC_TIERS,
        MATCHER_VERSION,
        Linker,
        apt_seq_address_key,
        area_band,
        collapse_master,
        decimal_value,
        overlay_missing_master_atoms,
        trade_fingerprint,
        value,
    )


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MASTER = BASE_DIR / "local_outputs_20260320" / "apartment_master_v1_20260320.csv"
DEFAULT_OUTPUT = BASE_DIR / "runtime" / "transactions" / "built"
PUBLICATION_GATE = Decimal("0.95")


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_crosswalk(path: Path | None) -> dict[str, dict[str, Any]]:
    if not path or not path.exists():
        return {}
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {
        row.get("source_id") or row["apt_seq"]: row
        for row in rows
        if row.get("decision_status") == "confirmed" and row.get("apt_seq")
    }


def is_cancelled(row: dict[str, str]) -> bool:
    return bool(value(row, "cdealDay", "해제사유발생일") or value(row, "cdealType", "해제여부"))


def build(
    trades: list[dict[str, str]],
    master_rows: list[dict[str, str]],
    crosswalk: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    linker = Linker(collapse_master(master_rows), crosswalk)
    fingerprint_counts: Counter[str] = Counter()
    snapshot_ordinals: Counter[str] = Counter()
    raw_rows: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []
    reviews: list[dict[str, Any]] = []
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    tier_counts: Counter[str] = Counter()

    for ordinal, trade in enumerate(trades, start=1):
        lawd_cd = value(trade, "sggCd", "법정동시군구코드")
        snapshot_ordinals[lawd_cd] += 1
        snapshot_ordinal = snapshot_ordinals[lawd_cd]
        fingerprint = trade_fingerprint(trade)
        fingerprint_counts[fingerprint] += 1
        occurrence = fingerprint_counts[fingerprint]
        decision = linker.decide(trade)
        tier_counts[decision.tier] += 1
        deal_month = f"{int(value(trade, 'dealYear')):04d}-{int(value(trade, 'dealMonth')):02d}-01"
        row = {
            "source_row_ordinal": snapshot_ordinal,
            "source_lawd_cd": lawd_cd,
            "fingerprint": fingerprint,
            "occurrence_ordinal": occurrence,
            "apt_seq": value(trade, "aptSeq"),
            "deal_month": deal_month,
            "deal_day": int(value(trade, "dealDay") or 0),
            "exclusive_area_m2": str(decimal_value(value(trade, "excluUseAr"))),
            "floor": int(value(trade, "floor") or 0),
            "deal_amount_10k_krw": int(decimal_value(value(trade, "dealAmount"))),
            "registration_date": value(trade, "rgstDate") or None,
            "cancellation_date": value(trade, "cdealDay") or None,
            "cancellation_type": value(trade, "cdealType") or None,
            "raw_payload": trade,
        }
        raw_rows.append(row)
        link = {
            "source_row_ordinal": snapshot_ordinal,
            "source_lawd_cd": lawd_cd,
            "link_status": decision.status,
            "match_tier": decision.tier,
            "canonical_complex_id": decision.canonical_complex_id,
            "matcher_version": MATCHER_VERSION,
            "candidate_ids": list(decision.candidate_ids),
            "evidence": decision.evidence,
        }
        links.append(link)
        if not decision.deterministic:
            reviews.append(link)
            continue
        if is_cancelled(trade):
            continue
        area = decimal_value(value(trade, "excluUseAr"))
        grouped[(decision.canonical_complex_id or "", deal_month, area_band(area))].append(
            {"amount": Decimal(row["deal_amount_10k_krw"]), "area": area, "day": row["deal_day"]}
        )

    deterministic = sum(tier_counts[tier] for tier in DETERMINISTIC_TIERS)
    rate = Decimal(deterministic) / Decimal(len(trades)) if trades else Decimal(0)
    summaries = []
    for (complex_id, month, band), rows in sorted(grouped.items()):
        amounts = [item["amount"] for item in rows]
        price_per_m2 = [item["amount"] / item["area"] for item in rows]
        summaries.append(
            {
                "canonical_complex_id": complex_id,
                "deal_month": month,
                "area_band": band,
                "transaction_count": len(rows),
                "median_amount_10k_krw": str(median(amounts)),
                "mean_amount_10k_krw": str(sum(amounts) / len(amounts)),
                "median_amount_per_m2_10k_krw": str(median(price_per_m2)),
                "latest_contract_date": f"{month[:7]}-{max(item['day'] for item in rows):02d}",
            }
        )
    proposals_by_seq: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    for raw, link in zip(raw_rows, links):
        if raw["apt_seq"] and link["link_status"] == "confirmed":
            proposals_by_seq[raw["apt_seq"]].append((raw, link))
    crosswalk_proposals = []
    crosswalk_conflicts = []
    for apt_seq, items in sorted(proposals_by_seq.items()):
        complex_ids = {link["canonical_complex_id"] for _, link in items}
        parcel_keys = {
            tuple(link["evidence"].get("parcel_key") or ())
            for _, link in items if link["evidence"].get("parcel_key")
        }
        payload = {
            "apt_seq": apt_seq,
            "candidate_canonical_complex_ids": sorted(complex_ids),
            "parcel_keys": [list(key) for key in sorted(parcel_keys)],
            "observation_count": len(items),
            "matcher_version": MATCHER_VERSION,
        }
        if len(complex_ids) == 1 and len(parcel_keys) <= 1:
            crosswalk_proposals.append({
                **payload,
                "source_id": apt_seq,
                "identity_scope": "apt_seq",
                "canonical_complex_id": next(iter(complex_ids)),
                "parcel_key": list(next(iter(parcel_keys), ())),
                "decision_status": "review",
            })
        else:
            by_address: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
            for raw, link in items:
                source_id = apt_seq_address_key(raw["raw_payload"])
                if source_id:
                    by_address[source_id].append((raw, link))
            address_scopes_are_unique = (
                len(by_address) > 1
                and sum(len(rows) for rows in by_address.values()) == len(items)
                and all(len({link["canonical_complex_id"] for _, link in rows}) == 1 for rows in by_address.values())
            )
            if address_scopes_are_unique:
                for source_id, rows in sorted(by_address.items()):
                    road = rows[0][1]["evidence"].get("road_key") or ()
                    scoped_parcels = {
                        tuple(link["evidence"].get("parcel_key") or ())
                        for _, link in rows if link["evidence"].get("parcel_key")
                    }
                    crosswalk_proposals.append({
                        "apt_seq": apt_seq,
                        "source_id": source_id,
                        "identity_scope": "apt_seq_address",
                        "canonical_complex_id": rows[0][1]["canonical_complex_id"],
                        "parcel_key": list(next(iter(scoped_parcels), ())),
                        "road_key": list(road),
                        "observation_count": len(rows),
                        "matcher_version": MATCHER_VERSION,
                        "decision_status": "review",
                    })
            else:
                crosswalk_conflicts.append({**payload, "decision_status": "conflict"})
    return {
        "raw_rows": raw_rows,
        "links": links,
        "reviews": reviews,
        "summaries": summaries,
        "crosswalk_proposals": crosswalk_proposals,
        "crosswalk_conflicts": crosswalk_conflicts,
        "quality": {
            "transactions": len(trades),
            "deterministic_links": deterministic,
            "deterministic_link_rate": float(round(rate, 6)),
            "publication_gate": float(PUBLICATION_GATE),
            "publication_allowed": rate >= PUBLICATION_GATE and not crosswalk_conflicts,
            "publication_blockers": [
                *(["deterministic_link_rate_below_gate"] if rate < PUBLICATION_GATE else []),
                *(["apt_seq_crosswalk_conflicts"] if crosswalk_conflicts else []),
            ],
            "match_tiers": dict(sorted(tier_counts.items())),
            "duplicate_fingerprint_rows_retained": sum(count - 1 for count in fingerprint_counts.values() if count > 1),
            "cancelled_rows_excluded_from_summary": sum(is_cancelled(row) for row in trades),
            "apt_seq_crosswalk_proposals": len(crosswalk_proposals),
            "apt_seq_crosswalk_conflicts": len(crosswalk_conflicts),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("raw", type=Path, nargs="+")
    parser.add_argument("--master", type=Path, default=DEFAULT_MASTER)
    parser.add_argument("--master-supplement", type=Path, action="append", default=[])
    parser.add_argument("--crosswalk", type=Path)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    trades = [row for path in args.raw for row in json.loads(path.read_text(encoding="utf-8"))]
    master_rows = read_csv(args.master)
    for path in args.master_supplement:
        master_rows = overlay_missing_master_atoms(master_rows, read_csv(path))
    result = build(trades, master_rows, read_crosswalk(args.crosswalk))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    stamp = date.today().isoformat()
    for name in ("raw_rows", "links", "reviews", "summaries"):
        (args.output_dir / f"{name}_{stamp}.json").write_text(
            json.dumps(result[name], ensure_ascii=False, indent=2), encoding="utf-8"
        )
    (args.output_dir / f"quality_{stamp}.json").write_text(
        json.dumps(result["quality"], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(result["quality"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
