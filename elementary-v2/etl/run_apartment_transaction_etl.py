"""Collect and build the monthly MOLIT apartment-trade snapshot.

The production schedule is disabled while linkage is below the publication
gate.  Rehearsal is fully functional; ``--apply`` refuses publication unless
the quality report passes and SQL 26 has been applied by operations.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import time
from datetime import date
from pathlib import Path

from build_apartment_transaction_snapshot import build, read_crosswalk
from profile_apartment_transaction_source import fetch_all
from apartment_transaction_linkage import collapse_master, overlay_missing_master_atoms


BASE_DIR = Path(__file__).resolve().parent
RUNTIME = BASE_DIR / "runtime" / "transactions"
DEFAULT_MASTER = BASE_DIR / "local_outputs_20260320" / "apartment_master_v1_20260320.csv"


def previous_month(today: date) -> str:
    first = today.replace(day=1)
    previous = first.fromordinal(first.toordinal() - 1)
    return previous.strftime("%Y%m")


def load_master(paths: list[Path]) -> list[dict[str, str]]:
    sources: list[list[dict[str, str]]] = []
    for path in paths:
        with path.open(encoding="utf-8-sig", newline="") as handle:
            sources.append(list(csv.DictReader(handle)))
    rows = sources[0]
    for supplement in sources[1:]:
        rows = overlay_missing_master_atoms(rows, supplement)
    return rows


def district_codes(rows: list[dict[str, str]]) -> list[str]:
    return sorted({row.get("legal_dong_code", "")[:5] for row in rows if len(row.get("legal_dong_code", "")) >= 5})


def collect(key: str, month: str, codes: list[str], delay_seconds: float) -> tuple[list[dict[str, str]], list[dict[str, object]]]:
    all_rows: list[dict[str, str]] = []
    snapshots = []
    RUNTIME.mkdir(parents=True, exist_ok=True)
    for index, code in enumerate(codes):
        rows = fetch_all(key, code, month, 1000)
        payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        path = RUNTIME / f"apt_trade_{code}_{month}.json"
        path.write_bytes(payload)
        snapshots.append({
            "lawd_cd": code, "source_month": f"{month[:4]}-{month[4:]}-01",
            "source_as_of": date.today().isoformat(), "row_count": len(rows),
            "content_sha256": hashlib.sha256(payload).hexdigest(), "path": str(path),
        })
        all_rows.extend(rows)
        print(f"MOLIT {code} {month}: {len(rows):,} rows")
        if index + 1 < len(codes) and delay_seconds:
            time.sleep(delay_seconds)
    return all_rows, snapshots


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rehearse", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--month", default=previous_month(date.today()))
    parser.add_argument("--lawd-cd", action="append", default=[])
    parser.add_argument("--master", type=Path, default=DEFAULT_MASTER)
    parser.add_argument(
        "--master-supplement", type=Path, action="append", default=[],
        help="append K-apt/new-build supplements omitted from the regional master",
    )
    parser.add_argument("--crosswalk", type=Path)
    parser.add_argument("--api-key")
    parser.add_argument("--raw", type=Path, action="append", default=[])
    parser.add_argument("--delay-seconds", type=float, default=0.05)
    args = parser.parse_args()
    if args.apply == args.rehearse:
        raise ValueError("choose exactly one of --rehearse or --apply")
    master_paths = [args.master, *args.master_supplement]
    master = load_master(master_paths)
    if args.raw:
        trades = [row for path in args.raw for row in json.loads(path.read_text(encoding="utf-8"))]
        snapshots = [{"path": str(path), "row_count": len(json.loads(path.read_text(encoding="utf-8")))} for path in args.raw]
    else:
        if not args.api_key:
            from profile_apartment_transaction_source import api_key
            key = api_key()
        else:
            key = args.api_key
        trades, snapshots = collect(key, args.month, args.lawd_cd or district_codes(master), args.delay_seconds)
    result = build(trades, master, read_crosswalk(args.crosswalk))
    report = {
        **result["quality"], "month": args.month, "snapshots": snapshots,
        "master_paths": [str(path) for path in master_paths],
        "canonical_candidates": len(collapse_master(master)),
    }
    report_path = RUNTIME / f"transaction_etl_report_{args.month}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (RUNTIME / f"apt_seq_crosswalk_proposals_{args.month}.json").write_text(
        json.dumps(result["crosswalk_proposals"], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (RUNTIME / f"apt_seq_crosswalk_conflicts_{args.month}.json").write_text(
        json.dumps(result["crosswalk_conflicts"], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.apply:
        if not result["quality"]["publication_allowed"]:
            raise RuntimeError("publication gate failed; private snapshot retained and public serving unchanged")
        raise RuntimeError("SQL 26/private backfill must be verified before enabling database upload")
    print("transaction ETL rehearsal complete; raw rows remain private and nothing was uploaded")


if __name__ == "__main__":
    main()
