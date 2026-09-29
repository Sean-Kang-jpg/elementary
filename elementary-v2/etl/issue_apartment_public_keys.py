#!/usr/bin/env python3
"""Issue and rejoin the immutable public slugs apartment URLs are built on.

Public URLs cannot carry `canonical_complex_id`: its prefix depends on whether a
K-apt match succeeded, so it moves on a rebuild, on a merge, and wholesale when
the frozen apartment base is replaced. This assigns a slug that never moves and
rejoins it across rebuilds by the complex's component `apt_cd` atoms, because
the grouping is what changes while the atoms stay.

See docs/decisions/ADR-007-immutable-public-identifiers.md.

Dry-run by default; `--apply` is the only thing that writes.

    python etl/issue_apartment_public_keys.py
    python etl/issue_apartment_public_keys.py --apply
    python etl/issue_apartment_public_keys.py --registry etl/local_outputs_.../keys.json
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import secrets
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Iterable, NamedTuple

if __package__ in (None, ""):  # `python etl/issue_apartment_public_keys.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
COMPLEX_MASTER = OUTPUT_DIR / "apartment_complex_master_v1.csv"
DEFAULT_REGISTRY = OUTPUT_DIR / "apartment_public_keys.json"

# Crockford Base32: no I, L, O or U, so a key can be read aloud or copied by
# hand without ambiguity. Eight characters is 32**8; the unique constraint, not
# the entropy, is what actually guarantees uniqueness.
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
KEY_LENGTH = 8


class Complex(NamedTuple):
    canonical_complex_id: str
    atoms: frozenset[str]


class Registry:
    """Slugs and the atoms they cover. Keys are never reissued or deleted."""

    def __init__(self, keys: dict[str, dict] | None = None,
                 atoms: dict[str, str] | None = None) -> None:
        self.keys: dict[str, dict] = keys or {}
        self.atom_to_key: dict[str, str] = atoms or {}

    @classmethod
    def load(cls, path: Path) -> "Registry":
        if not path.is_file():
            return cls()
        raw = json.loads(path.read_text(encoding="utf-8"))
        return cls(raw.get("keys", {}), raw.get("atom_to_key", {}))

    def dump(self, path: Path) -> None:
        path.write_text(
            json.dumps({"keys": self.keys, "atom_to_key": self.atom_to_key},
                       ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def mint(self) -> str:
        """A key not already in use. Collides rarely; retries rather than hopes."""
        for _ in range(1000):
            candidate = "".join(secrets.choice(ALPHABET) for _ in range(KEY_LENGTH))
            if candidate not in self.keys:
                return candidate
        raise RuntimeError("could not mint an unused key in 1000 attempts")

    def atoms_of(self, public_key: str) -> set[str]:
        return {a for a, k in self.atom_to_key.items() if k == public_key}


def canonical_rank(registry: Registry, public_key: str, covered: int) -> tuple:
    """Order candidates for canonical. Every term is immutable after issue.

    Choosing by something that gets corrected later - households, say - would
    flip the canonical between rebuilds, and a canonical URL that moves is the
    failure this design exists to prevent.
    """
    return (-covered, registry.keys[public_key]["issued_at"], public_key)


def read_complexes(path: Path) -> list[Complex]:
    rows = list(csv.DictReader(path.open(encoding="utf-8-sig")))
    out: list[Complex] = []
    for row in rows:
        atoms = ast.literal_eval(row["component_apt_ids"])
        if not atoms:
            raise ValueError(f"{row['canonical_complex_id']} has no component atoms")
        out.append(Complex(row["canonical_complex_id"], frozenset(atoms)))
    return out


def assign(registry: Registry, complexes: Iterable[Complex], today: str) -> dict:
    """Give every complex a key, reusing an existing one wherever the atoms match.

    Four cases, per ADR-007:
      - one key found   -> reuse it, whatever happened to canonical_complex_id
      - several found   -> merge: pick canonical, supersede the rest (redirects)
      - none found      -> new complex, mint a key
      - key's atoms split across complexes -> one side keeps it, other mints
    """
    result = {
        "reused": 0, "minted": 0, "merged": 0, "superseded": [],
        "split": 0, "assignments": {}, "conflicts": [],
    }
    # A key can only stay with one complex this round; whoever wins keeps it.
    claimed: dict[str, str] = {}

    for cx in sorted(complexes, key=lambda c: c.canonical_complex_id):
        found = {registry.atom_to_key[a] for a in cx.atoms if a in registry.atom_to_key}
        available = {k for k in found if k not in claimed}

        if not found:
            key = registry.mint()
            registry.keys[key] = {"issued_at": today, "superseded_by": None}
            result["minted"] += 1
        elif not available:
            # Every candidate already went to another complex this round: a split.
            key = registry.mint()
            registry.keys[key] = {"issued_at": today, "superseded_by": None}
            result["minted"] += 1
            result["split"] += 1
        else:
            ranked = sorted(
                available,
                key=lambda k: canonical_rank(registry, k, len(registry.atoms_of(k) & cx.atoms)),
            )
            key = ranked[0]
            result["reused"] += 1
            if len(found) > 1:
                result["merged"] += 1
                for loser in sorted(found - {key}):
                    if registry.keys[loser].get("superseded_by") in (None, key):
                        registry.keys[loser]["superseded_by"] = key
                        result["superseded"].append({"from": loser, "to": key})
                    else:
                        result["conflicts"].append(
                            {"key": loser, "already": registry.keys[loser]["superseded_by"],
                             "wanted": key})

        claimed[key] = cx.canonical_complex_id
        result["assignments"][cx.canonical_complex_id] = key
        for atom in sorted(cx.atoms):
            registry.atom_to_key[atom] = key

    return result


def verify(registry: Registry, complexes: list[Complex], result: dict) -> list[str]:
    """Fail loudly on the things that would silently move a published URL."""
    problems: list[str] = []

    if len(result["assignments"]) != len(complexes):
        problems.append("not every complex received a key")

    used = list(result["assignments"].values())
    if len(set(used)) != len(used):
        problems.append("a key was assigned to more than one complex")

    for key, meta in registry.keys.items():
        target = meta.get("superseded_by")
        if target and target not in registry.keys:
            problems.append(f"{key} is superseded by unknown key {target}")
        if target == key:
            problems.append(f"{key} supersedes itself")

    # A canonical key must not itself be superseded: that is a redirect chain.
    for cid, key in result["assignments"].items():
        if registry.keys[key].get("superseded_by"):
            problems.append(f"{cid} was assigned superseded key {key}")

    if result["conflicts"]:
        problems.append(f"{len(result['conflicts'])} keys were asked to supersede two targets")

    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--master", type=Path, default=COMPLEX_MASTER,
                        help="apartment complex master CSV")
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY,
                        help="slug registry JSON; created on first run")
    parser.add_argument("--apply", action="store_true",
                        help="write the registry. Without this nothing is saved")
    args = parser.parse_args(argv)

    if not args.master.is_file():
        print(f"master not found: {args.master}", file=sys.stderr)
        return 2

    complexes = read_complexes(args.master)

    # The invariant the design rests on, checked on the input before it can
    # corrupt the registry.
    owners: dict[str, list[str]] = defaultdict(list)
    for cx in complexes:
        for atom in cx.atoms:
            owners[atom].append(cx.canonical_complex_id)
    shared = {a: c for a, c in owners.items() if len(c) > 1}
    if shared:
        print(f"FAIL: {len(shared)} atoms belong to more than one complex; "
              f"rejoin would be ambiguous. First: {list(shared.items())[:3]}", file=sys.stderr)
        return 1

    registry = Registry.load(args.registry)
    before = len(registry.keys)
    result = assign(registry, complexes, date.today().isoformat())
    problems = verify(registry, complexes, result)

    print(f"complexes          {len(complexes):,}")
    print(f"atoms              {len(owners):,}")
    print(f"keys before        {before:,}")
    print(f"  reused           {result['reused']:,}")
    print(f"  newly issued     {result['minted']:,}")
    print(f"  merges absorbed  {result['merged']:,}")
    print(f"  redirects added  {len(result['superseded']):,}")
    print(f"  splits           {result['split']:,}")
    print(f"keys after         {len(registry.keys):,}")

    if problems:
        print("\nFAIL:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    if before and result["minted"] and not result["split"]:
        rate = result["minted"] / len(complexes) * 100
        print(f"\nNOTE: {result['minted']:,} complexes ({rate:.2f}%) did not rejoin to an "
              f"existing key. On a rebuild of the same scope this should be ~0; a "
              f"non-zero rate means published URLs were abandoned.")

    if args.apply:
        args.registry.parent.mkdir(parents=True, exist_ok=True)
        registry.dump(args.registry)
        print(f"\nwrote {args.registry}")
    else:
        print("\ndry run; nothing written. Pass --apply to save.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
