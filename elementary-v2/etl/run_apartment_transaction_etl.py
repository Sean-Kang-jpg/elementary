"""Collect and build the monthly MOLIT apartment-trade snapshot.

The production schedule is disabled while linkage is below the publication
gate.  Rehearsal is fully functional; ``--apply`` refuses publication unless
the quality report passes and SQL 27 has been applied by operations.
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
from molit_lawd_codes import effective_lawd_code


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


def district_codes(rows: list[dict[str, str]], month: str) -> list[str]:
    master_codes = {
        row.get("legal_dong_code", "")[:5]
        for row in rows
        if len(row.get("legal_dong_code", "")) >= 5
    }
    return sorted({effective_lawd_code(code, month) for code in master_codes})


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
    parser.add_argument(
        "--publish", action="store_true",
        help="with --apply, approve summaries and refresh public serving after all gates pass",
    )
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
    if args.publish and not args.apply:
        raise ValueError("--publish requires --apply")
    master_paths = [args.master, *args.master_supplement]
    master = load_master(master_paths)
    if args.raw:
        trades = []
        snapshots = []
        for path in args.raw:
            rows = json.loads(path.read_text(encoding="utf-8"))
            lawd_codes = {row.get("sggCd") or row.get("법정동시군구코드") for row in rows}
            lawd_codes.discard(None)
            if len(lawd_codes) != 1:
                raise ValueError(f"{path}: expected exactly one source district, got {sorted(lawd_codes)}")
            payload = path.read_bytes()
            lawd_cd = next(iter(lawd_codes))
            trades.extend(rows)
            snapshots.append({
                "lawd_cd": lawd_cd,
                "source_month": f"{args.month[:4]}-{args.month[4:]}-01",
                "source_as_of": date.today().isoformat(),
                "row_count": len(rows),
                "content_sha256": hashlib.sha256(payload).hexdigest(),
                "path": str(path),
            })
    else:
        if not args.api_key:
            from profile_apartment_transaction_source import api_key
            key = api_key()
        else:
            key = args.api_key
        trades, snapshots = collect(
            key,
            args.month,
            args.lawd_cd or district_codes(master, args.month),
            args.delay_seconds,
        )
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
        if args.publish and not result["quality"]["publication_allowed"]:
            raise RuntimeError("publication gate failed; public serving unchanged")
        from upload_apartment_transactions import apply as upload
        upload_report = upload(
            result,
            master,
            snapshots,
            date.today().isoformat(),
            publish=args.publish,
        )
        report["upload"] = upload_report
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(upload_report, ensure_ascii=False, indent=2))
        print("transaction ETL upload complete" + ("; public serving refreshed" if args.publish else "; summaries remain private on hold"))
        return
    print("transaction ETL rehearsal complete; raw rows remain private and nothing was uploaded")


if __name__ == "__main__":
    main()
