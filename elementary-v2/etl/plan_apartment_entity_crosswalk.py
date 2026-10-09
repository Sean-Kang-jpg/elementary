"""Plan an idempotent apartment-entity backfill without forcing merges.

Existing confirmed source identities always win.  A current complex whose atoms
already point to multiple entities is emitted as a conflict decision; this tool
never picks a winner.  New UUIDs use a fixed UUIDv5 namespace and the smallest
APT_BASE atom, making repeated dry-runs reproducible before the first upload.
"""

from __future__ import annotations

import argparse
import csv
import json
import uuid
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

try:
    from .apartment_transaction_linkage import overlay_missing_master_atoms
except ImportError:
    from apartment_transaction_linkage import overlay_missing_master_atoms


ENTITY_NAMESPACE = uuid.UUID("5f14798f-57aa-4be8-9b55-30ba06d495ac")
MATCHER_VERSION = "apartment-entity-crosswalk-v1"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def stable_entity_id(apt_cd: str) -> str:
    return str(uuid.uuid5(ENTITY_NAMESPACE, f"apt_base:{apt_cd}"))


def plan(
    master_rows: list[dict[str, str]],
    existing_identities: list[dict[str, Any]],
    source_as_of: str,
) -> dict[str, list[dict[str, Any]]]:
    existing = {
        (row["source_system"], row["source_id"]): str(row["entity_id"])
        for row in existing_identities
        if row.get("decision_status") == "confirmed"
    }
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in master_rows:
        if row.get("canonical_complex_id") and row.get("apt_cd"):
            groups[row["canonical_complex_id"]].append(row)

    entities: dict[str, dict[str, Any]] = {}
    identities: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    for complex_id, rows in sorted(groups.items()):
        atoms = sorted({row["apt_cd"] for row in rows})
        known_entities = {existing[("apt_base", atom)] for atom in atoms if ("apt_base", atom) in existing}
        if len(known_entities) > 1:
            decisions.append({
                "source_system": "apt_base_group",
                "source_id": complex_id,
                "candidate_entity_ids": sorted(known_entities),
                "decision_status": "conflict",
                "decision_reason": "current group spans multiple confirmed entities; manual lineage decision required",
                "matcher_version": MATCHER_VERSION,
                "source_as_of": source_as_of,
                "evidence": {"apt_cd_list": atoms},
            })
            continue
        entity_id = next(iter(known_entities), stable_entity_id(atoms[0]))
        entities[entity_id] = {"entity_id": entity_id, "entity_status": "active"}
        for atom in atoms:
            previous = existing.get(("apt_base", atom))
            if previous and previous != entity_id:
                raise AssertionError("conflict should have been queued")
            identities.append({
                "source_system": "apt_base",
                "source_id": atom,
                "entity_id": entity_id,
                "decision_status": "confirmed",
                "confidence": 1.0,
                "matcher_version": MATCHER_VERSION,
                "evidence": {"current_canonical_complex_id": complex_id},
                "first_seen_as_of": source_as_of,
                "last_seen_as_of": source_as_of,
                "confirmed_at": f"{source_as_of}T00:00:00Z",
                "confirmed_by": "deterministic_apt_base_backfill",
            })
        kapt_codes = sorted({row.get("kapt_code", "") for row in rows if row.get("kapt_code")})
        if len(kapt_codes) == 1:
            identities.append({
                "source_system": "kapt", "source_id": kapt_codes[0], "entity_id": entity_id,
                "decision_status": "review", "confidence": None, "matcher_version": MATCHER_VERSION,
                "evidence": {"apt_cd_list": atoms, "current_canonical_complex_id": complex_id},
                "first_seen_as_of": source_as_of, "last_seen_as_of": source_as_of,
                "confirmed_by": None,
            })
    return {"entities": list(entities.values()), "identities": identities, "decisions": decisions}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", type=Path, required=True)
    parser.add_argument("--master-supplement", type=Path, action="append", default=[])
    parser.add_argument("--existing", type=Path, help="exported apartment_source_identity JSON")
    parser.add_argument("--source-as-of", default=date.today().isoformat())
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    existing = json.loads(args.existing.read_text(encoding="utf-8")) if args.existing else []
    master_rows = read_csv(args.master)
    for path in args.master_supplement:
        master_rows = overlay_missing_master_atoms(master_rows, read_csv(path))
    result = plan(master_rows, existing, args.source_as_of)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: len(value) for key, value in result.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
