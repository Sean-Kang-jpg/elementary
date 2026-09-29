#!/usr/bin/env python3
"""Upload the issued public slugs to Supabase. Dry-run by default.

`issue_apartment_public_keys.py` writes the registry locally; this puts it in
the `apartment_public_key` and `apartment_public_key_atom` tables migration 18
created, so the serving refresh and the frontend can reach it.

Slugs are append-only. This never deletes a key or moves an atom to a different
key, because either would silently break a published URL. A run that would have
to do so stops and says which rows.

    python etl/upload_apartment_public_keys.py
    python etl/upload_apartment_public_keys.py --apply
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # `python etl/upload_apartment_public_keys.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DEFAULT_REGISTRY = BASE_DIR / "local_outputs_20260320" / "apartment_public_keys.json"
BATCH = 500


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value)


def credentials() -> tuple[str, str]:
    load_env(PROJECT_DIR / ".env")
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return url.rstrip("/"), key


def request(url: str, key: str, path: str, *, method: str = "GET",
            payload: Any = None, prefer: str | None = None) -> Any:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{url}/rest/v1/{path}", data=data,
                                 method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body.strip() else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:400]
        raise RuntimeError(f"{method} {path} -> {error.code}: {detail}") from None


def fetch_all(url: str, key: str, table: str, columns: str) -> list[dict]:
    rows, offset = [], 0
    while True:
        page = request(url, key,
                       f"{table}?select={columns}&limit=1000&offset={offset}")
        if not page:
            break
        rows += page
        if len(page) < 1000:
            break
        offset += 1000
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--apply", action="store_true",
                        help="write to Supabase. Without this nothing is sent")
    args = parser.parse_args(argv)

    if not args.registry.is_file():
        print(f"registry not found: {args.registry}\n"
              f"Run issue_apartment_public_keys.py --apply first.", file=sys.stderr)
        return 2

    local = json.loads(args.registry.read_text(encoding="utf-8"))
    local_keys: dict[str, dict] = local["keys"]
    local_atoms: dict[str, str] = local["atom_to_key"]

    url, key = credentials()
    remote_keys = {r["public_key"]: r for r in
                   fetch_all(url, key, "apartment_public_key", "public_key,superseded_by")}
    remote_atoms = {r["apt_cd"]: r["public_key"] for r in
                    fetch_all(url, key, "apartment_public_key_atom", "apt_cd,public_key")}

    # Append-only. A key that vanished locally, or an atom that changed hands,
    # means a published URL would move; refuse rather than do it quietly.
    dropped = sorted(set(remote_keys) - set(local_keys))
    moved = sorted(a for a, k in remote_atoms.items()
                   if a in local_atoms and local_atoms[a] != k)
    lost_atoms = sorted(set(remote_atoms) - set(local_atoms))

    new_keys = [{"public_key": k,
                 "issued_at": v["issued_at"],
                 "superseded_by": v.get("superseded_by")}
                for k, v in sorted(local_keys.items()) if k not in remote_keys]
    # Supersession is the one field that legitimately changes on an existing key.
    changed = [{"public_key": k,
                "issued_at": v["issued_at"],
                "superseded_by": v.get("superseded_by")}
               for k, v in sorted(local_keys.items())
               if k in remote_keys
               and (v.get("superseded_by") or None) != (remote_keys[k]["superseded_by"] or None)]
    new_atoms = [{"apt_cd": a, "public_key": k}
                 for a, k in sorted(local_atoms.items()) if a not in remote_atoms]

    print(f"local keys         {len(local_keys):,}")
    print(f"local atoms        {len(local_atoms):,}")
    print(f"remote keys        {len(remote_keys):,}")
    print(f"remote atoms       {len(remote_atoms):,}")
    print(f"  keys to insert   {len(new_keys):,}")
    print(f"  keys to update   {len(changed):,}  (supersession only)")
    print(f"  atoms to insert  {len(new_atoms):,}")

    problems = []
    if dropped:
        problems.append(f"{len(dropped)} keys exist remotely but not locally, "
                        f"e.g. {dropped[:3]} — slugs are never withdrawn")
    if moved:
        problems.append(f"{len(moved)} atoms would change key, e.g. {moved[:3]} — "
                        f"that moves a published URL")
    if lost_atoms:
        problems.append(f"{len(lost_atoms)} atoms exist remotely but not locally, "
                        f"e.g. {lost_atoms[:3]}")
    if problems:
        print("\nFAIL:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    if not args.apply:
        print("\ndry run; nothing sent. Pass --apply to upload.")
        return 0

    # Keys before atoms: the atom table references them.
    for label, table, conflict, rows in (
        ("keys", "apartment_public_key", "public_key", new_keys + changed),
        ("atoms", "apartment_public_key_atom", "public_key,apt_cd", new_atoms),
    ):
        for start in range(0, len(rows), BATCH):
            chunk = rows[start:start + BATCH]
            request(url, key, f"{table}?on_conflict={urllib.parse.quote(conflict)}",
                    method="POST", payload=chunk,
                    prefer="resolution=merge-duplicates,return=minimal")
        print(f"uploaded {len(rows):,} {label}")

    after_keys = fetch_all(url, key, "apartment_public_key", "public_key")
    after_atoms = fetch_all(url, key, "apartment_public_key_atom", "apt_cd")
    print(f"\nremote now: {len(after_keys):,} keys, {len(after_atoms):,} atoms")
    if len(after_keys) != len(local_keys) or len(after_atoms) != len(local_atoms):
        print("FAIL: remote counts do not match the registry", file=sys.stderr)
        return 1
    print("counts match the registry")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
