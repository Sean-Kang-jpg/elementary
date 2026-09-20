"""Build private address-level academy markers from NEIS rows and VWorld cache."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = BASE_DIR / "runtime" / "academy"
PROFILE_FILE = BASE_DIR / "academy_marker_profile.json"
INCHEON_DISTRICT_MAP = {"검단구": "서구", "서해구": "서구", "영종구": "중구", "제물포구": "중구"}


def latest_snapshot() -> Path:
    files = sorted(RUNTIME_DIR.glob("acainsti_capital_*.json"))
    if not files:
        raise SystemExit("academy snapshot missing")
    return files[-1]


def normalize_address(value: str) -> str:
    return " ".join((value or "").split())


def district(row: dict) -> str:
    value = (row.get("ADMST_ZONE_NM") or "").strip()
    if not value:
        parts = normalize_address(row.get("FA_RDNMA", "")).split()
        value = parts[1] if len(parts) > 1 else ""
    return INCHEON_DISTRICT_MAP.get(value, value)


def split_subjects(value: str) -> list[str]:
    normalized = (value or "").replace("/", ",").replace("·", ",")
    return [item.strip() for item in normalized.split(",") if item.strip()]


def main() -> None:
    snapshot = latest_snapshot()
    geocode_file = RUNTIME_DIR / "academy_geocodes_all.csv"
    if not geocode_file.exists():
        raise SystemExit("academy_geocodes_all.csv missing")
    academies = json.loads(snapshot.read_text(encoding="utf-8"))
    with geocode_file.open(encoding="utf-8-sig", newline="") as handle:
        geocodes = {row["address"]: row for row in csv.DictReader(handle)}

    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in academies:
        address = normalize_address(row.get("FA_RDNMA", ""))
        if address:
            grouped[address].append(row)

    markers = []
    for address, rows in grouped.items():
        geocode = geocodes.get(address, {})
        institution_types = Counter(row.get("ACA_INSTI_SC_NM") or "미상" for row in rows)
        realms = Counter(row.get("REALM_SC_NM") or "미상" for row in rows)
        subjects = Counter(
            subject
            for row in rows
            for subject in split_subjects(row.get("LE_CRSE_LIST_NM") or row.get("LE_CRSE_NM") or "")
        )
        markers.append({
            "address_id": hashlib.sha256(address.encode("utf-8")).hexdigest()[:24],
            "region": rows[0]["_region"],
            "district": district(rows[0]),
            "road_address": address,
            "longitude": geocode.get("longitude", ""),
            "latitude": geocode.get("latitude", ""),
            "geocode_status": geocode.get("status", "missing"),
            "academy_count": len(rows),
            "institution_type_counts": json.dumps(dict(institution_types.most_common()), ensure_ascii=False),
            "realm_counts": json.dumps(dict(realms.most_common()), ensure_ascii=False),
            "top_subjects": " | ".join(name for name, _ in subjects.most_common(5)),
            "source_snapshot": snapshot.name,
        })

    output = RUNTIME_DIR / f"academy_address_markers_{snapshot.stem.rsplit('_', 1)[-1]}.csv"
    fields = tuple(markers[0])
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(sorted(markers, key=lambda row: (row["region"], row["district"], row["road_address"])))

    status_counts = Counter(row["geocode_status"] for row in markers)
    profile = {
        "snapshot": snapshot.name,
        "source_institutions": len(academies),
        "address_markers": len(markers),
        "geocoded_markers": status_counts["matched"],
        "geocode_coverage": round(status_counts["matched"] / len(markers), 4),
        "geocode_statuses": dict(status_counts),
        "institutions_per_marker": round(len(academies) / len(markers), 2),
        "output": output.name,
    }
    PROFILE_FILE.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(profile, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
