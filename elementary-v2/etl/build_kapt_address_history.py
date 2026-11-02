"""Road addresses K-apt once listed for a complex and no longer does.

Until its 2026-09-22 file K-apt listed every road address of a multi-building
complex, comma-separated (583 complexes nationwide on 2026-09-14). From the
2026-09-25 file it lists one. The apartment base keeps each building's own
address, so 602 capital complexes matched by road address lost the match: the
2026-11-02 monthly run regrouped them from KAPT: to APT: ids and stopped
(run 41354707718). The buildings did not move, so build_apartment_master_v1.py
keeps reading these addresses as match evidence.

    python etl/build_kapt_address_history.py    # local K-apt snapshots -> etl/kapt_road_address_history.csv

The output is committed so the remote runner, which fetches only the newest
K-apt file, builds the same matches. Each address carries the first snapshot
that listed it, and a build only uses addresses seen on or before its own K-apt
date, so an older snapshot still builds what it did.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SNAPSHOT_DIR = BASE_DIR / "local_outputs_20260320"
OUTPUT = BASE_DIR / "kapt_road_address_history.csv"
FIELDS = ("kapt_code", "road_address", "first_seen", "last_seen")


def snapshot_date(path: Path) -> str:
    digits = re.fullmatch(r"kapt_basic_(\d{8})\.csv", path.name).group(1)
    return f"{digits[:4]}-{digits[4:6]}-{digits[6:]}"


def addresses(value: str) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def snapshot_addresses(path: Path) -> dict[str, list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return {
            (row.get("단지코드") or "").strip(): addresses(row.get("도로명주소") or "")
            for row in csv.DictReader(handle)
            if (row.get("단지코드") or "").strip()
        }


def history(snapshots: list[tuple[str, dict[str, list[str]]]]) -> list[dict[str, str]]:
    """Addresses of a multi-address listing the newest snapshot no longer lists.

    Only lists of two or more count. A single address that changed may be K-apt
    correcting a wrong one, and a wrong address is not evidence.
    """
    seen: dict[tuple[str, str], list[str]] = {}
    for as_of, by_code in snapshots:
        for code, listed in by_code.items():
            if len(listed) < 2:
                continue
            for address in listed:
                seen.setdefault((code, address), []).append(as_of)
    latest = snapshots[-1][1]
    rows = [
        {"kapt_code": code, "road_address": address, "first_seen": min(dates), "last_seen": max(dates)}
        for (code, address), dates in seen.items()
        if address not in latest.get(code, [])
    ]
    return sorted(rows, key=lambda row: (row["kapt_code"], row["first_seen"], row["road_address"]))


def main() -> None:
    paths = sorted(SNAPSHOT_DIR.glob("kapt_basic_*.csv"), key=snapshot_date)
    paths = [path for path in paths if re.fullmatch(r"kapt_basic_\d{8}\.csv", path.name)]
    if len(paths) < 2:
        raise SystemExit("need at least two K-apt snapshots")
    rows = history([(snapshot_date(path), snapshot_addresses(path)) for path in paths])
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(paths)} snapshots {snapshot_date(paths[0])}..{snapshot_date(paths[-1])}: "
          f"{len(rows):,} addresses for {len({row['kapt_code'] for row in rows}):,} complexes -> {OUTPUT.name}")


if __name__ == "__main__":
    main()
