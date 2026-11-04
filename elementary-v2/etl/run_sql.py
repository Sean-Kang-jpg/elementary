"""Run SQL against the production database through the Supabase Management API.

The SQL editor was the only way to apply a migration until 2026-11-04. This does
the same from the shell, so an agent can apply and verify in one pass.

    python etl/run_sql.py sql/41_serving_excludes_optional_one_way.sql
    python etl/run_sql.py -c "SELECT refresh_school_apartment_serving();"

Needs SUPABASE_ACCESS_TOKEN (a personal access token, dashboard -> Account ->
Access Tokens) in the environment or in elementary-v2/.env. The token covers the
whole account, not one project: give it an expiry and revoke it when done. It is
never printed. The project is taken from SUPABASE_URL.

A file runs as one request, so its BEGIN/COMMIT behave as in the SQL editor.
Statements that cannot run in a transaction (VACUUM) go alone with -c.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value)


def project_ref() -> str:
    match = re.match(r"https://([a-z0-9]+)\.supabase\.co", os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "")
    if not match:
        raise SystemExit("SUPABASE_URL is missing or not a supabase.co URL")
    return match.group(1)


def run(query: str) -> list[dict]:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        raise SystemExit("SUPABASE_ACCESS_TOKEN is not set (environment or elementary-v2/.env)")
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{project_ref()}/database/query",
        data=json.dumps({"query": query}).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            return json.loads(response.read() or b"[]")
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:2000]}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("file", nargs="?", type=Path, help="SQL file to run")
    source.add_argument("-c", "--command", help="SQL text to run")
    args = parser.parse_args()

    load_env(ROOT / ".env")
    query = args.command if args.command is not None else args.file.read_text(encoding="utf-8")
    rows = run(query)
    json.dump(rows, sys.stdout, ensure_ascii=False, indent=2, default=str)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
