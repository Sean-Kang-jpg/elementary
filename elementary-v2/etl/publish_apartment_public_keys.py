"""Issue public keys for newly published complexes, from the database, and rejoin serving.

ADR-007. The registry of public keys used to live only in
etl/local_outputs_20260320/apartment_public_keys.json on the ETL workstation, so a
GitHub runner could not issue a key and losing that file meant losing the authority
for every apartment URL. The database already holds a complete copy
(apartment_public_key, apartment_public_key_atom), and it is now the source:

1. rebuild the registry from those two tables into etl/runtime/public_keys/
2. issue_apartment_public_keys.py --from-serving against it (reuses every key whose
   atoms still match; mints only for complexes no key covers)
3. upload_apartment_public_keys.py, which refuses to withdraw or move a key
4. refresh_school_apartment_serving(), so serving carries the new keys, and check
   that no published complex is left without one

Dry-run by default; --apply writes. A run that would mint more than --max-new keys
stops: on an ordinary month that number is the count of new complexes, and a large
one means published URLs were about to be abandoned.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_academy_refresh import credentials, fetch_all, rest  # noqa: E402
from upload_operational_masters import refresh_serving  # noqa: E402


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
REGISTRY = BASE_DIR / "runtime" / "public_keys" / "registry_from_db.json"


def registry_from_db(url: str, key: str) -> dict:
    keys = fetch_all(url, key, "apartment_public_key", "public_key,issued_at,superseded_by", "public_key")
    atoms = fetch_all(url, key, "apartment_public_key_atom", "apt_cd,public_key", "apt_cd")
    return {
        "keys": {row["public_key"]: {"issued_at": str(row["issued_at"])[:10], "superseded_by": row["superseded_by"]}
                 for row in keys},
        "atom_to_key": {row["apt_cd"]: row["public_key"] for row in atoms},
    }


def run(*parts: str) -> str:
    result = subprocess.run([sys.executable, *parts], cwd=PROJECT_DIR, capture_output=True, text=True,
                            encoding="utf-8", errors="replace")
    print(result.stdout, end="")
    print(result.stderr, end="", file=sys.stderr)
    if result.returncode:
        raise SystemExit(f"{Path(parts[0]).name} exited with {result.returncode}")
    return result.stdout


def keyless(url: str, key: str) -> int:
    rows = rest(url, key, "GET", "school_apartment_serving?" + urllib.parse.urlencode(
        {"select": "canonical_complex_id", "complex_public_key": "is.null", "limit": 50}))
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--max-new", type=int, default=1200)
    args = parser.parse_args()

    url, key = credentials()
    registry = registry_from_db(url, key)
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"registry from the database: {len(registry['keys']):,} keys, {len(registry['atom_to_key']):,} atoms")

    # Always a dry run first, to read how many keys would be minted.
    out = run("etl/issue_apartment_public_keys.py", "--from-serving", "--registry", str(REGISTRY))
    minted = next((int(line.split()[-1].replace(",", "")) for line in out.splitlines()
                   if line.strip().startswith("newly issued")), 0)
    if minted > args.max_new:
        raise SystemExit(f"{minted:,} keys would be minted (limit {args.max_new:,}); refusing")
    if not args.apply:
        print(f"dry run: {minted:,} keys would be issued; nothing written")
        return
    if minted == 0 and keyless(url, key) == 0:
        print("every published complex already has a key")
        return

    run("etl/issue_apartment_public_keys.py", "--from-serving", "--registry", str(REGISTRY), "--apply")
    run("etl/upload_apartment_public_keys.py", "--registry", str(REGISTRY), "--apply")
    rows = refresh_serving(url, key)
    missing = keyless(url, key)
    print(f"serving refreshed: {rows:,} rows; complexes without a key: {missing}")
    if missing:
        raise SystemExit(f"{missing} published complexes still have no public key")


if __name__ == "__main__":
    main()
