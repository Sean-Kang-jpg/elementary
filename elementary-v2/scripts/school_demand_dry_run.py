"""Rank GA4 school demand and compare reviewed local inputs with PR #11."""

import argparse
import json
import os
import re
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

from scripts.school_afterschool_dry_run import KEYS, SLOTS, SUMMARY, compare, dump

GA = "https://analyticsdata.googleapis.com/v1beta/properties/557166556"
REST = "https://vsgeksumgvcrkzjwvlgs.supabase.co/rest/v1"
SCHOOL, METHOD = "customEvent:school_id", "customEvent:selection_method"
SCHOOL_ID = re.compile(r"B[0-9]+")
PAGE_SIZE = 10000


class LookupFailure(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(url, headers, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = Request(url, data=data, headers={**headers, "Content-Type": "application/json"})
    try:
        with build_opener(NoRedirect).open(request, timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        raise LookupFailure(f"HTTP {error.code}") from None
    except (OSError, ValueError):
        raise LookupFailure("network or JSON response error") from None


def exact(field, value):
    return {"filter": {"fieldName": field, "stringFilter": {
        "matchType": "EXACT", "value": value, "caseSensitive": True,
    }}}


def ga_demand(start, end):
    token = os.environ.get("GA4_ACCESS_TOKEN")
    if not token:
        raise LookupFailure("GA4_ACCESS_TOKEN is unavailable")
    headers = {"Authorization": f"Bearer {token}"}
    if os.environ.get("GA4_QUOTA_PROJECT"):
        headers["x-goog-user-project"] = os.environ["GA4_QUOTA_PROJECT"]
    try:
        metadata = request_json(f"{GA}/metadata", headers)
    except LookupFailure as error:
        raise LookupFailure(f"metadata: {error}") from None
    dimensions = {item["apiName"] for item in metadata["dimensions"]}
    if missing := {SCHOOL, METHOD} - dimensions:
        raise LookupFailure("metadata missing event dimensions: " + ", ".join(sorted(missing)))
    rows, expected = [], None
    while expected is None or len(rows) < expected:
        body = {
            "dateRanges": [{"startDate": start, "endDate": end}],
            "dimensions": [{"name": SCHOOL}],
            "metrics": [{"name": "totalUsers"}],
            "dimensionFilter": {"andGroup": {"expressions": [
                exact("eventName", "timetable_school_pick"), exact(METHOD, "user"),
            ]}},
            "orderBys": [{"dimension": {"dimensionName": SCHOOL}}],
            "limit": str(PAGE_SIZE), "offset": str(len(rows)),
        }
        try:
            page = request_json(f"{GA}:runReport", headers, body)
        except LookupFailure as error:
            raise LookupFailure(f"runReport: {error}") from None
        quality = page.get("metadata", {})
        if quality.get("timeZone", "Asia/Seoul") != "Asia/Seoul":
            raise LookupFailure("runReport property timezone differs from Asia/Seoul")
        if any(quality.get(key) for key in ("subjectToThresholding", "dataLossFromOtherRow", "samplingMetadatas")):
            raise LookupFailure("runReport may omit or sample demand")
        if ([x["name"] for x in page["dimensionHeaders"]] != [SCHOOL]
                or [x["name"] for x in page["metricHeaders"]] != ["totalUsers"]):
            raise LookupFailure("unexpected runReport headers")
        batch = page.get("rows", [])
        count = page.get("rowCount", 0)
        if type(count) is not int or count < 0 or (expected is not None and count != expected):
            raise LookupFailure("inconsistent runReport row count")
        expected = count
        rows.extend(batch)
        if len(rows) > expected or (len(rows) < expected and not batch):
            raise LookupFailure("incomplete runReport pagination")
    return [(row["dimensionValues"][0]["value"], int(row["metricValues"][0]["value"])) for row in rows]


def coverage_missing(school_id):
    key = os.environ.get("SUPABASE_READ_KEY", "")
    if not key:
        raise LookupFailure("SUPABASE_READ_KEY is unavailable")
    headers = {"apikey": key}
    if not key.startswith("sb_publishable_"):
        headers["Authorization"] = f"Bearer {key}"
    query = urlencode({"select": "school_id", "school_id": f"eq.{school_id}", "limit": 1})
    missing = []
    for table in (SUMMARY, SLOTS):
        rows = request_json(f"{REST}/{table}?{query}", headers)
        if rows == []:
            missing.append(table)
        elif rows != [{"school_id": school_id}]:
            raise LookupFailure("unexpected Supabase coverage response")
    return missing


def ranked_demand(rows):
    demand = {}
    for school_id, users in rows:
        if school_id in ("", "(not set)"):
            continue
        if not SCHOOL_ID.fullmatch(school_id) or type(users) is not int or users < 0 or school_id in demand:
            raise LookupFailure("invalid or repeated school demand row")
        demand[school_id] = users
    return sorted(((school, count) for school, count in demand.items() if count),
                  key=lambda row: (-row[1], row[0]))


def read_input(path):
    return json.loads(path.read_text(encoding="utf-8"))


def review_school(item, inputs):
    school_id = item["school_id"]
    baseline = inputs / school_id / "baseline.json"
    candidate = inputs / school_id / "candidate.json"
    missing = [path.name for path in (baseline, candidate) if not path.is_file()]
    if missing:
        return {**item, "status": "source_review_required", "missing_inputs": missing}
    try:
        original, reviewed = read_input(baseline), read_input(candidate)
        scopes = reviewed["tables"].values()
        if not any(scope["state"] in ("partial_reviewed", "complete_reviewed", "failed") for scope in scopes):
            return {**item, "status": "source_review_required", "missing_inputs": ["reviewed_rows"]}
        result = compare(school_id, original, reviewed)
        for table in KEYS:
            before, after = ([row for row in snapshot[table] if row["school_id"] != school_id]
                             for snapshot in (original, result["proposed_baseline"]))
            if before != after:
                raise ValueError("off-target change")
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return {**item, "status": "dry_run_failed", "reason": "input rejected or off-target change detected"}
    failed = [table for table in KEYS if result["coverage"][table]["state"] == "failed"]
    return {**item, "status": "dry_run_failed" if failed else "dry_run_completed",
            "failed_tables": failed, "off_target_changes": 0, "counts": result["counts"]}


def batch(as_of, read_demand, missing_coverage, inputs, mode):
    start, end = ((as_of - timedelta(days=days)).isoformat() for days in (14, 1))
    report = {"as_of": as_of.isoformat(), "timezone": "Asia/Seoul", "start_date": start,
              "end_date": end, "mode": mode, "candidates": []}
    stage = "ga4"
    try:
        demand = ranked_demand(read_demand(start, end))
        if not demand:
            return {**report, "status": "no_demand"}, 0
        stage = "supabase"
        selected = []
        for school_id, users in demand:
            missing = missing_coverage(school_id)
            if missing:
                selected.append({"school_id": school_id, "total_users": users, "missing_tables": missing})
                if len(selected) == 5:
                    break
    except (LookupFailure, OSError, ValueError, TypeError, KeyError, AttributeError, IndexError) as error:
        reason = str(error) if isinstance(error, LookupFailure) else "invalid or unreadable lookup input"
        return {**report, "status": "lookup_failed", "stage": stage, "reason": reason}, 2
    results = [review_school(item, inputs) for item in selected]
    failed = any(item["status"] == "dry_run_failed" for item in results)
    status = "dry_run_failed" if failed else "completed" if results else "no_missing_coverage"
    return {**report, "status": status, "candidates": results}, 3 if failed else 0


def publish(report, path):
    payload = dump(report) + "\n"
    if path is None:
        print(payload, end="")
        return
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=f".{path.name}.", delete=False) as output:
            temporary_path = Path(output.name)
            output.write(payload)
        temporary_path.replace(path)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    today = datetime.now(ZoneInfo("Asia/Seoul")).date()
    parser.add_argument("--as-of", type=date.fromisoformat, default=today)
    parser.add_argument("--inputs", required=True, type=Path)
    parser.add_argument("--offline", type=Path, help="fixed demand and coverage JSON")
    parser.add_argument("--output", type=Path, help="atomically replace this report file")
    args = parser.parse_args()
    if not date.min + timedelta(days=14) <= args.as_of <= today:
        parser.error("--as-of must allow 14 completed days and cannot be in the future")
    if args.offline is not None:
        def offline_demand(_start, _end):
            fixture.update(read_input(args.offline))
            return fixture["demand"]

        def offline_coverage(school_id):
            missing = fixture["missing_tables"][school_id]
            if not isinstance(missing, list) or any(table not in (SUMMARY, SLOTS) for table in missing):
                raise LookupFailure("invalid offline coverage")
            return missing

        fixture = {}
        report, code = batch(args.as_of, offline_demand, offline_coverage, args.inputs, "offline")
    else:
        report, code = batch(args.as_of, ga_demand, coverage_missing, args.inputs, "online")
    try:
        publish(report, args.output)
    except OSError:
        parser.exit(2, "could not publish report\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
