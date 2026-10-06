"""Monthly refresh of the academy and education-facility layer, end to end.

Stages (docs/operations/ACADEMY_REFRESH_PLAN.md):

1. restore    geocode cache and building-origin files from private Storage
2. collect    NEIS academies nationwide; every region checked against the last run
3. geocode    only new addresses and earlier failures (VWorld)
4. markers    address markers (drops 직업기술, classifies subjects)
5. dojos      sports-dojo permits collected and merged into the markers
6. complexes  apartment complexes exported from the live master
7. proximity  links and summaries, one region at a time (memory)
8. plan       what changes against the live tables, and the shrink limit per region
9. apply      upsert, then delete what the build no longer has (--apply only)

The upload replaces the three serving tables as a whole. The older uploaders only
added rows, which left closed academies and orphaned summaries behind. If any region
would lose more than SHRINK_LIMIT of its addresses or institutions, nothing is written:
a partial NEIS response must not empty part of the map.

--rehearse (the default) runs 1-8 and writes nothing, neither tables nor Storage.
--apply records an etl_runs row, archives the raw sources, writes, verifies, and
moves the neis-academy schedule. --seed-storage uploads this machine's cache and
origin files once, so a runner can start.

--geocode-only is the half that cannot run on GitHub: VWorld refuses foreign IPs, so
a runner's geocoding only ever fails. A Windows task on a machine in Korea runs it the
day before the monthly run (install_academy_geocode_task.ps1): collect NEIS, geocode
new and failed addresses, write the cache back to Storage. The runner then finds them.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import run_recurring_etl as recurring  # noqa: E402
from build_academy_proximity_snapshot import NEW_DONGS, PRIOR_DONGS  # noqa: E402
from region_registry import load_registry  # noqa: E402
from upload_academy_proximity import load_env  # noqa: E402


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
ACADEMY_DIR = BASE_DIR / "runtime" / "academy"
DOJO_DIR = BASE_DIR / "runtime" / "sports_dojo"
REPORT_PATH = BASE_DIR / "runtime" / "recurring_academy_refresh.json"
GEOCODE_CACHE = ACADEMY_DIR / "academy_geocodes_all.csv"

BUCKET = "etl-source-snapshots"
STORAGE_PREFIX = "academy-refresh"
STORAGE_INPUTS = {
    "academy_geocodes_all.csv.gz": GEOCODE_CACHE,
    "building_refined_dongs.csv.gz": PRIOR_DONGS,
    "trusted_large_complex_buildings.csv.gz": NEW_DONGS,
}

PIPELINE_NAME = "elementary-academy-refresh"
PIPELINE_VERSION = "academy-refresh-v1"
SOURCE_NAME = "neis-academy"
RETENTION_DAYS = 45
COMPLETENESS_FLOOR = 0.90   # a region's NEIS rows against the last completed run
SHRINK_LIMIT = 0.15         # D3: a region may lose at most this share in one run
PAGE = 1000
BATCH = 500
ON_RUNNER = os.getenv("GITHUB_ACTIONS") == "true"

TABLES = {
    "academy_address_serving": ("address_id",),
    "apartment_academy_origin_points": ("canonical_complex_id", "origin_sequence"),
    "apartment_academy_summary": ("canonical_complex_id",),
}
JSON_FIELDS = ("institution_type_counts", "realm_counts", "institutions")


# --- Supabase -----------------------------------------------------------------

def credentials() -> tuple[str, str]:
    load_env(PROJECT_DIR / ".env")
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return url.rstrip("/"), key


def rest(url: str, key: str, method: str, path: str, payload: Any = None, prefer: str | None = None) -> Any:
    return recurring.request_json(url, key, method, f"/rest/v1/{path}", payload, prefer, timeout=180)


def fetch_all(url: str, key: str, table: str, select: str, order: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    while True:
        query = urllib.parse.urlencode({"select": select, "order": order, "offset": len(rows), "limit": PAGE})
        batch = rest(url, key, "GET", f"{table}?{query}")
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows


def storage_get(url: str, key: str, object_path: str) -> bytes | None:
    quoted = urllib.parse.quote(f"{STORAGE_PREFIX}/{object_path}", safe="/")
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{BUCKET}/{quoted}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 404):
            return None
        raise


def storage_put(url: str, key: str, object_path: str, path: Path) -> None:
    recurring.upload_storage_object(url, key, BUCKET, f"{STORAGE_PREFIX}/{object_path}",
                                    gzip.compress(path.read_bytes(), compresslevel=6))


# --- stages -----------------------------------------------------------------------

def run_step(*parts: str) -> None:
    command = [sys.executable, *parts]
    print("running " + " ".join(parts), flush=True)
    subprocess.run(command, cwd=PROJECT_DIR, check=True)


def restore_inputs(url: str, key: str) -> dict[str, str]:
    restored = {}
    for object_path, target in STORAGE_INPUTS.items():
        body = storage_get(url, key, object_path)
        if body is not None:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(gzip.decompress(body))
            restored[target.name] = "storage"
        elif target.exists():
            restored[target.name] = "local"
        else:
            raise RuntimeError(f"{object_path} is not in Storage and {target} is missing; run --seed-storage once")
    return restored


def neis_rows_by_region(snapshot: Path) -> dict[str, int]:
    return dict(Counter(row.get("_region", "") for row in json.loads(snapshot.read_text(encoding="utf-8"))))


def last_completed_run(url: str, key: str) -> dict[str, Any] | None:
    query = urllib.parse.urlencode({
        "pipeline_name": f"eq.{PIPELINE_NAME}", "status": "eq.completed",
        "select": "run_id,row_counts,completed_at", "order": "completed_at.desc", "limit": 1,
    })
    rows = rest(url, key, "GET", f"etl_runs?{query}")
    return rows[0] if rows else None


def baseline(url: str, key: str, today_snapshot: Path) -> tuple[dict[str, int], int | None, str]:
    previous = last_completed_run(url, key)
    if previous:
        counts = previous["row_counts"]
        return counts.get("neis_rows_by_region", {}), counts.get("active_dojos"), f"etl_runs {previous['run_id']}"
    # First run: the last snapshot taken on this machine, if there is one.
    older = [path for path in sorted(ACADEMY_DIR.glob("acainsti_scope_*.json")) if path != today_snapshot]
    today_profile = f"sports_dojo_nationwide_profile_{today_snapshot.stem.rsplit('_', 1)[-1]}.json"
    profiles = [path for path in sorted(DOJO_DIR.glob("sports_dojo_nationwide_profile_*.json")) if path.name != today_profile]
    dojos = json.loads(profiles[-1].read_text(encoding="utf-8"))["active_rows"] if profiles else None
    if older:
        return neis_rows_by_region(older[-1]), dojos, older[-1].name
    return {}, dojos, "none"


def check_completeness(current: dict[str, int], previous: dict[str, int]) -> list[str]:
    short = []
    for region, before in sorted(previous.items()):
        after = current.get(region, 0)
        if before and after < before * COMPLETENESS_FLOOR:
            short.append(f"{region} {after:,}/{before:,}")
    return short


def export_complexes(url: str, key: str, path: Path) -> int:
    rows = fetch_all(
        url, key, "apartment_complex_master",
        "canonical_complex_id,region,latitude,longitude,households,building_count,component_apt_ids",
        "canonical_complex_id",
    )
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=(
            "canonical_complex_id", "region", "latitude", "longitude", "households", "building_count", "component_apt_ids",
        ))
        writer.writeheader()
        for row in rows:
            # build_academy_proximity_snapshot reads this column with ast.literal_eval.
            writer.writerow({**row, "component_apt_ids": json.dumps(row.get("component_apt_ids") or [], ensure_ascii=False)})
    return len(rows)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def typed_address(row: dict[str, str]) -> dict[str, Any]:
    return {
        **row,
        "latitude": float(row["latitude"]), "longitude": float(row["longitude"]),
        "institution_count": int(row["institution_count"]),
        **{field: json.loads(row[field] or "{}") for field in JSON_FIELDS},
    }


def load_build(stamp: str, suffixes: list[str]) -> dict[str, dict[tuple, dict[str, Any]]]:
    build: dict[str, dict[tuple, dict[str, Any]]] = {table: {} for table in TABLES}
    for suffix in suffixes:
        for row in read_csv(ACADEMY_DIR / f"academy_address_serving_{stamp}_{suffix}.csv"):
            # One address can be near complexes of two regions; both builds write the same row.
            build["academy_address_serving"][(row["address_id"],)] = typed_address(row)
        for row in read_csv(ACADEMY_DIR / f"apartment_academy_origins_{stamp}_{suffix}.csv"):
            typed = {**row, "origin_sequence": int(row["origin_sequence"]),
                     "latitude": float(row["latitude"]), "longitude": float(row["longitude"])}
            build["apartment_academy_origin_points"][(row["canonical_complex_id"], typed["origin_sequence"])] = typed
        for row in read_csv(ACADEMY_DIR / f"apartment_academy_summary_{stamp}_{suffix}.csv"):
            typed = {**row, **{field: int(row[field]) for field in (
                "core_address_count", "extended_address_count", "core_institution_count", "extended_institution_count")}}
            build["apartment_academy_summary"][(row["canonical_complex_id"],)] = typed
    return build


def region_totals(rows) -> dict[str, tuple[int, int]]:
    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for row in rows:
        totals[row["region"]][0] += 1
        totals[row["region"]][1] += int(row["institution_count"])
    return {region: (value[0], value[1]) for region, value in totals.items()}


def plan_changes(url: str, key: str, build) -> dict[str, Any]:
    live_addresses = fetch_all(url, key, "academy_address_serving", "address_id,region,institution_count", "address_id")
    live_keys = {
        "academy_address_serving": {(row["address_id"],) for row in live_addresses},
        "apartment_academy_origin_points": {
            (row["canonical_complex_id"], row["origin_sequence"])
            for row in fetch_all(url, key, "apartment_academy_origin_points", "canonical_complex_id,origin_sequence",
                                 "canonical_complex_id,origin_sequence")
        },
        "apartment_academy_summary": {
            (row["canonical_complex_id"],)
            for row in fetch_all(url, key, "apartment_academy_summary", "canonical_complex_id", "canonical_complex_id")
        },
    }
    return diff_plan(live_keys, live_addresses, build)


def diff_plan(live_keys: dict[str, set[tuple]], live_addresses: list[dict[str, Any]], build) -> dict[str, Any]:
    tables = {}
    for table, rows in build.items():
        new_keys = set(rows)
        tables[table] = {
            "live": len(live_keys[table]), "build": len(new_keys),
            "added": len(new_keys - live_keys[table]), "removed": len(live_keys[table] - new_keys),
            "removed_keys": sorted(live_keys[table] - new_keys),
        }
    before = region_totals(live_addresses)
    after = region_totals(build["academy_address_serving"].values())
    regions, blocked = {}, []
    for region in sorted(set(before) | set(after)):
        old, new = before.get(region, (0, 0)), after.get(region, (0, 0))
        change = {
            "addresses": [old[0], new[0]], "institutions": [old[1], new[1]],
            "address_change": round(new[0] / old[0] - 1, 4) if old[0] else None,
            "institution_change": round(new[1] / old[1] - 1, 4) if old[1] else None,
        }
        if any(value is not None and value < -SHRINK_LIMIT for value in (change["address_change"], change["institution_change"])):
            blocked.append(region)
        regions[region] = change
    return {"tables": tables, "regions": regions, "blocked_regions": blocked}


def delete_keys(url: str, key: str, table: str, keys: list[tuple]) -> None:
    if table == "apartment_academy_origin_points":
        by_complex: dict[str, list[int]] = defaultdict(list)
        for complex_id, sequence in keys:
            by_complex[complex_id].append(sequence)
        for complex_id, sequences in by_complex.items():
            values = ",".join(str(value) for value in sequences)
            rest(url, key, "DELETE", "apartment_academy_origin_points?" + urllib.parse.urlencode({
                "canonical_complex_id": f"eq.{complex_id}", "origin_sequence": f"in.({values})",
            }), prefer="return=minimal")
        return
    column = TABLES[table][0]
    for start in range(0, len(keys), 100):
        values = ",".join(f'"{identity[0]}"' for identity in keys[start:start + 100])
        rest(url, key, "DELETE", f"{table}?{column}=in.({values})", prefer="return=minimal")


def table_count(url: str, key: str, table: str) -> int:
    request = urllib.request.Request(
        f"{url}/rest/v1/{table}?select={TABLES[table][0]}&limit=1",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "count=exact", "Range": "0-0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return int(response.headers["Content-Range"].rsplit("/", 1)[-1])


def apply_build(url: str, key: str, build, plan: dict[str, Any], as_of: str) -> None:
    now = datetime.now().astimezone().isoformat()
    # Write everything new first, then remove what the build no longer has, so a
    # failure part-way leaves extra rows rather than missing ones.
    for table, rows in build.items():
        values = [{**row, "source_as_of": as_of, "updated_at": now} if table == "academy_address_serving"
                  else {**row, "updated_at": now} for row in rows.values()]
        for start in range(0, len(values), BATCH):
            rest(url, key, "POST", f"{table}?on_conflict={','.join(TABLES[table])}", values[start:start + BATCH],
                 "resolution=merge-duplicates,return=minimal")
        print(f"upserted {table}: {len(values):,}", flush=True)
    for table in ("apartment_academy_summary", "apartment_academy_origin_points", "academy_address_serving"):
        removed = [tuple(identity) for identity in plan["tables"][table]["removed_keys"]]
        delete_keys(url, key, table, removed)
        print(f"deleted {table}: {len(removed):,}", flush=True)
    for table, rows in build.items():
        remote = table_count(url, key, table)
        if remote != len(rows):
            raise RuntimeError(f"{table}: remote {remote:,} != build {len(rows):,}")
    sample = next(row for row in build["apartment_academy_summary"].values()
                  if row["core_institution_count"] + row["extended_institution_count"] > 0)
    nearby = rest(url, key, "POST", "rpc/nearby_academy_addresses",
                  {"p_canonical_complex_id": sample["canonical_complex_id"], "p_max_distance_m": 800})
    if not nearby:
        raise RuntimeError(f"nearby_academy_addresses returned nothing for {sample['canonical_complex_id']}")
    print(f"verified counts and RPC ({len(nearby):,} addresses near {sample['canonical_complex_id']})")


def archive_sources(url: str, key: str, run_id: str, sources: list[tuple[str, Path, int]], as_of: str) -> None:
    manifest = {
        "retention_days": RETENTION_DAYS,
        "snapshots": [
            {"source_name": name, "source_as_of": as_of, "resolved_path": path, "row_count": rows,
             "schema_version": PIPELINE_VERSION}
            for name, path, rows in sources
        ],
    }
    recurring.archive_snapshots(url, key, run_id, manifest)


def geocode_only(url: str, key: str, reuse_sources: bool) -> None:
    report: dict[str, Any] = {"mode": "geocode-only", "as_of": date.today().isoformat()}
    try:
        report["inputs"] = restore_inputs(url, key)
        if not reuse_sources:
            run_step("etl/collect_academy_snapshot.py", "--all-production")
        run_step("etl/geocode_academy_addresses.py", "--all", "--retry-failures")
        profile = json.loads((BASE_DIR / "academy_geocode_profile.json").read_text(encoding="utf-8"))
        report["geocode"] = {k: profile[k] for k in ("snapshot", "selected_unique_addresses", "matched", "match_rate", "statuses")}
        if profile["statuses"].get("transport_error", 0) > profile["selected_unique_addresses"] * 0.05:
            # Reaching VWorld at all is the point of running here; do not overwrite a good cache with a failed pass.
            raise RuntimeError(f"VWorld unreachable: {profile['statuses']['transport_error']:,} transport errors")
        storage_put(url, key, "academy_geocodes_all.csv.gz", GEOCODE_CACHE)
        report["result"] = "cache written to Storage"
    except Exception as error:
        report["result"] = f"failed: {error}"
        raise
    finally:
        path = BASE_DIR / "runtime" / "academy_geocode_local.json"
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"report: {path} - {report.get('result')}")


# --- main ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--rehearse", action="store_true", help="the default: build and plan, write nothing")
    mode.add_argument("--seed-storage", action="store_true", help="upload this machine's cache and origin files")
    mode.add_argument("--geocode-only", action="store_true",
                      help="collect NEIS, geocode new addresses, write the cache back (a machine in Korea)")
    parser.add_argument("--reuse-sources", action="store_true",
                        help="skip collection and use today's snapshots already on disk (local iteration)")
    args = parser.parse_args()

    url, key = credentials()
    if args.seed_storage:
        for object_path, path in STORAGE_INPUTS.items():
            storage_put(url, key, object_path, path)
            print(f"seeded {STORAGE_PREFIX}/{object_path} from {path}")
        return

    if args.geocode_only:
        geocode_only(url, key, args.reuse_sources)
        return

    today = date.today()
    stamp, as_of = f"{today:%Y%m%d}", today.isoformat()
    registry = load_registry()
    regions = list(registry.production_regions)
    report: dict[str, Any] = {"mode": "apply" if args.apply else "rehearse", "as_of": as_of}
    run_id = None
    try:
        report["inputs"] = restore_inputs(url, key)

        snapshot = ACADEMY_DIR / f"acainsti_scope_{stamp}.json"
        if not args.reuse_sources:
            run_step("etl/collect_academy_snapshot.py", "--all-production")
        current = neis_rows_by_region(snapshot)
        previous, previous_dojos, baseline_source = baseline(url, key, snapshot)
        short = check_completeness(current, previous)
        report["collect"] = {"neis_rows": sum(current.values()), "by_region": current, "baseline": baseline_source}
        if short:
            raise RuntimeError("NEIS returned too few rows for: " + ", ".join(short))

        if ON_RUNNER:
            # VWorld refuses foreign IPs; the Windows task geocoded new addresses into
            # the restored cache the day before. Addresses newer than that wait a month.
            report["geocode"] = "skipped on the runner; cache from the --geocode-only task"
        else:
            run_step("etl/geocode_academy_addresses.py", "--all", "--retry-failures")
            report["geocode"] = json.loads((BASE_DIR / "academy_geocode_profile.json").read_text(encoding="utf-8"))
        run_step("etl/build_academy_marker_snapshot.py")
        report["markers"] = json.loads((BASE_DIR / "academy_marker_profile.json").read_text(encoding="utf-8"))

        dojos = DOJO_DIR / f"sports_dojo_nationwide_{stamp}.json"
        if not args.reuse_sources:
            run_step("etl/collect_sports_dojo_snapshot.py", "--all-production")
        dojo_profile = json.loads((DOJO_DIR / f"sports_dojo_nationwide_profile_{stamp}.json").read_text(encoding="utf-8"))
        active_dojos = int(dojo_profile["active_rows"])
        report["dojos"] = {"active": active_dojos, "baseline": previous_dojos}
        if previous_dojos and active_dojos < previous_dojos * (1 - SHRINK_LIMIT):
            raise RuntimeError(f"sports-dojo source shrank {previous_dojos:,} -> {active_dojos:,}")
        run_step("etl/merge_sports_dojo_markers.py",
                 "--academy-markers", str(ACADEMY_DIR / f"academy_address_markers_{stamp}.csv"),
                 "--sports-dojos", str(dojos), "--as-of", stamp)
        merged = ACADEMY_DIR / f"education_facility_markers_{stamp}.csv"

        complexes = ACADEMY_DIR / f"academy_refresh_complexes_{stamp}.csv"
        report["complexes"] = export_complexes(url, key, complexes)

        suffixes = []
        for region in regions:
            suffix = f"{region.neis_office_code.lower()}-refresh"
            run_step("etl/build_academy_proximity_snapshot.py", "--as-of", as_of,
                     "--complexes", str(complexes), "--academies", str(merged),
                     "--regions", region.canonical_name, "--output-suffix", suffix,
                     "--profile", str(ACADEMY_DIR / f"academy_refresh_profile_{stamp}_{suffix}.json"))
            suffixes.append(suffix)
        build = load_build(stamp, suffixes)

        plan = plan_changes(url, key, build)
        report["plan"] = {
            "tables": {table: {k: v for k, v in value.items() if k != "removed_keys"} for table, value in plan["tables"].items()},
            "regions": plan["regions"], "blocked_regions": plan["blocked_regions"],
        }
        if plan["blocked_regions"]:
            raise RuntimeError(f"regions would shrink more than {SHRINK_LIMIT:.0%}: {', '.join(plan['blocked_regions'])}")

        if not args.apply:
            report["result"] = "rehearsed; nothing written"
            return

        run_id = recurring.create_run(
            url, key,
            {"pipeline_name": PIPELINE_NAME, "pipeline_version": PIPELINE_VERSION,
             "snapshots": [{"source_name": SOURCE_NAME, "source_as_of": as_of}],
             "resolved_scope": {"regions": [region.canonical_name for region in regions], "domains": ["academy"]}},
            {"neis_rows": sum(current.values()), "neis_rows_by_region": current, "active_dojos": active_dojos,
             **{table: len(rows) for table, rows in build.items()}},
            "scheduled" if os.getenv("GITHUB_EVENT_NAME") == "schedule" else "manual", 1,
        )
        archive_sources(url, key, run_id, [(SOURCE_NAME, snapshot, sum(current.values())),
                                           ("sports-dojo", dojos, int(dojo_profile["normalized_rows"]))], as_of)
        if not ON_RUNNER:
            storage_put(url, key, "academy_geocodes_all.csv.gz", GEOCODE_CACHE)
        apply_build(url, key, build, plan, as_of)
        recurring.mark_snapshots(url, key, run_id, "validated")
        recurring.update_schedules(url, key, run_id, {"snapshots": [{"source_name": SOURCE_NAME}]})
        rest(url, key, "PATCH", f"etl_runs?run_id=eq.{run_id}",
             {"status": "completed", "completed_at": datetime.now().astimezone().isoformat()}, "return=minimal")
        report["result"] = f"applied; run {run_id}"
    except Exception as error:
        report["result"] = f"failed: {error}"
        if run_id:
            recurring.mark_snapshots(url, key, run_id, "rejected")
            rest(url, key, "PATCH", f"etl_runs?run_id=eq.{run_id}", {
                "status": "failed", "completed_at": datetime.now().astimezone().isoformat(),
                "error_summary": {"stage": "academy-refresh", "error": str(error)[:2000]},
            }, "return=minimal")
        raise
    finally:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"report: {REPORT_PATH} - {report.get('result')}")


if __name__ == "__main__":
    main()
