"""Load the keys a curriculum like may point at (SQL 24) from the repository content.

Cards and items live in src/content/curriculum/ (PRD_CURRICULUM_SHARING); the
database holds only likes and the keys they point at, with each card's context:

    I:{item}            an item's own page
    P:{plan}            a card
    PI:{plan}:{item}    an item inside a card - carries the card's age band,
                        region and module domain, which is what the ranking counts

Dry run by default. `--apply` upserts every current key as active and marks keys
that left the content inactive. It never deletes: a deleted ref would cascade
away the likes on it, and a card that returns would come back with none.
Run after every content change that adds, removes or moves a card or item.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from etl.collect_care_data import credentials, rest  # noqa: E402

CONTENT_DIR = PROJECT_DIR / "src" / "content" / "curriculum"


def build_refs() -> list[dict[str, Any]]:
    items = json.loads((CONTENT_DIR / "items.json").read_text(encoding="utf-8"))["items"]
    plans = json.loads((CONTENT_DIR / "plans.json").read_text(encoding="utf-8"))["plans"]
    known = {item["key"] for item in items}
    refs: list[dict[str, Any]] = []

    def ref(target_key: str, target_type: str, plan_key=None, item_key=None, age_band=None, region=None, domain=None):
        refs.append({
            "target_key": target_key, "target_type": target_type, "plan_key": plan_key, "item_key": item_key,
            "age_band": age_band, "region": region, "domain": domain, "active": True,
        })

    for item in items:
        ref(f"I:{item['key']}", "item", item_key=item["key"])
    for plan in plans:
        ref(f"P:{plan['key']}", "plan", plan_key=plan["key"], age_band=plan["ageBand"], region=plan.get("region"))
        for module in plan["modules"]:
            for entry in module["items"]:
                if entry["item"] not in known:
                    raise ValueError(f"card {plan['key']} names unknown item {entry['item']}; run npm run content")
                ref(f"PI:{plan['key']}:{entry['item']}", "plan_item", plan_key=plan["key"], item_key=entry["item"],
                    age_band=plan["ageBand"], region=plan.get("region"), domain=module["domain"])
    keys = [row["target_key"] for row in refs]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate like keys; run npm run content to find them")
    return refs


def remote_keys(url: str, key: str) -> set[str]:
    found: set[str] = set()
    start = 0
    while True:
        rows, _ = rest(url, key, "curriculum_refs?select=target_key&active=is.true", headers={"Range": f"{start}-{start + 999}"})
        found.update(row["target_key"] for row in rows)
        if len(rows) < 1000:
            return found
        start += 1000


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write after SQL 24 has been applied")
    args = parser.parse_args()

    refs = build_refs()
    url, service_key, _ = credentials()
    current = {row["target_key"] for row in refs}
    try:
        live = remote_keys(url, service_key)
    except RuntimeError as error:
        if "PGRST205" not in str(error):
            raise
        if args.apply:
            raise RuntimeError("curriculum_refs does not exist; apply sql/24_create_curriculum_likes.sql first") from None
        live = set()  # dry run before SQL 24: show what would be loaded
    retired = sorted(live - current)
    report = {
        "refs": len(refs),
        "by_type": {kind: sum(1 for row in refs if row["target_type"] == kind) for kind in ("item", "plan", "plan_item")},
        "new": len(current - live),
        "retire": len(retired),
        "mode": "apply" if args.apply else "dry-run",
    }
    if args.apply:
        for start in range(0, len(refs), 500):
            rest(url, service_key, "curriculum_refs?on_conflict=target_key", method="POST", data=refs[start:start + 500],
                 headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        for start in range(0, len(retired), 100):
            chunk = ",".join(f'"{key}"' for key in retired[start:start + 100])
            rest(url, service_key, f"curriculum_refs?target_key=in.({urllib.parse.quote(chunk, safe=',:')})", method="PATCH",
                 data={"active": False}, headers={"Prefer": "return=minimal"})
        report["active_after"] = len(remote_keys(url, service_key))
        if report["active_after"] != len(current):
            raise RuntimeError(f"remote has {report['active_after']} active keys, content has {len(current)}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
