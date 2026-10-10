"""Upload audited apartment entities and monthly trades to Supabase.

Private rows may be retained after a failed run, but public serving changes only
after every private count check passes and the caller explicitly requests
publication.  SQL 27 must already be applied.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any, Iterable

try:
    from .plan_apartment_entity_crosswalk import plan
    from .upload_operational_masters import credentials, table_count, upsert_batch
except ImportError:
    from plan_apartment_entity_crosswalk import plan
    from upload_operational_masters import credentials, table_count, upsert_batch


PRIVATE_TABLES = (
    "apartment_entity",
    "apartment_source_identity",
    "apartment_identity_decision",
    "apartment_transaction_source_snapshot",
    "apartment_transaction_raw",
    "apartment_transaction_link",
    "apartment_transaction_monthly_summary",
)


def upload_storage_object(url: str, key: str, bucket: str, object_path: str, body: bytes) -> None:
    quoted = urllib.parse.quote(object_path, safe="/")
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{bucket}/{quoted}",
        data=body,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/gzip",
            "x-upsert": "true",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=180):
            pass
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(f"storage upload {object_path}: HTTP {exc.code}: {detail}") from exc


def request_json(
    url: str,
    key: str,
    method: str,
    path: str,
    payload: Any | None = None,
    prefer: str | None = None,
    timeout: int = 120,
) -> Any:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(
        f"{url}{path}",
        data=None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(f"{method} {path}: HTTP {exc.code}: {detail}") from exc


def fetch_all(url: str, key: str, path: str, page_size: int = 1000) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for start in range(0, 10_000_000, page_size):
        separator = "&" if "?" in path else "?"
        request = urllib.request.Request(
            f"{url}{path}{separator}limit={page_size}&offset={start}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                page = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:2000]
            raise RuntimeError(f"GET {path}: HTTP {exc.code}: {detail}") from exc
        rows.extend(page)
        if len(page) < page_size:
            return rows
    raise RuntimeError(f"pagination safety limit reached: {path}")


def preflight_schema(url: str, key: str) -> None:
    for table in PRIVATE_TABLES:
        table_count(url, key, table)


def entity_map(backfill: dict[str, list[dict[str, Any]]]) -> dict[str, str]:
    result: dict[str, str] = {}
    for identity in backfill["identities"]:
        if identity["source_system"] != "apt_base":
            continue
        complex_id = identity["evidence"]["current_canonical_complex_id"]
        previous = result.setdefault(complex_id, identity["entity_id"])
        if previous != identity["entity_id"]:
            raise ValueError(f"{complex_id}: multiple entity IDs")
    return result


def transaction_rows(
    result: dict[str, Any],
    snapshot_ids: dict[str, str],
    entities: dict[str, str],
    source_as_of: str,
    publish: bool,
) -> dict[str, list[dict[str, Any]]]:
    raw_rows, link_rows = [], []
    for raw, link in zip(result["raw_rows"], result["links"]):
        snapshot_id = snapshot_ids[raw["source_lawd_cd"]]
        raw_rows.append({
            "transaction_snapshot_id": snapshot_id,
            "source_row_ordinal": raw["source_row_ordinal"],
            "comparison_fingerprint": raw["fingerprint"],
            "occurrence_ordinal": raw["occurrence_ordinal"],
            "apt_seq": raw["apt_seq"] or None,
            "contract_date": f"{raw['deal_month'][:7]}-{raw['deal_day']:02d}",
            "exclusive_area_m2": raw["exclusive_area_m2"],
            "floor": raw["floor"],
            "deal_amount_10k_krw": raw["deal_amount_10k_krw"],
            "registration_date": raw["registration_date"],
            "cancellation_date": raw["cancellation_date"],
            "cancellation_type": raw["cancellation_type"],
            "raw_payload": raw["raw_payload"],
        })
        canonical_id = link["canonical_complex_id"]
        candidates = [entities[item] for item in link["candidate_ids"] if item in entities]
        link_rows.append({
            "transaction_snapshot_id": snapshot_id,
            "source_row_ordinal": link["source_row_ordinal"],
            "entity_id": entities.get(canonical_id) if canonical_id else None,
            "link_status": link["link_status"],
            "match_tier": link["match_tier"],
            "matcher_version": link["matcher_version"],
            "candidate_entity_ids": candidates,
            "evidence": link["evidence"],
        })
    decisions = []
    for proposal in result["crosswalk_proposals"]:
        decisions.append({
            "source_system": proposal["identity_scope"].replace("apt_seq", "molit_apt_seq"),
            "source_id": proposal["source_id"],
            "candidate_entity_id": entities[proposal["canonical_complex_id"]],
            "decision_status": "review",
            "decision_reason": "deterministic monthly observation awaiting crosswalk approval",
            "matcher_version": proposal["matcher_version"],
            "evidence": proposal,
            "decided_by": "apartment_transaction_etl",
            "source_as_of": source_as_of,
        })
    for conflict in result["crosswalk_conflicts"]:
        decisions.append({
            "source_system": "molit_apt_seq",
            "source_id": conflict["apt_seq"],
            "candidate_entity_id": None,
            "decision_status": "conflict",
            "decision_reason": "one source identity resolves to multiple apartment entities",
            "matcher_version": conflict["matcher_version"],
            "evidence": conflict,
            "decided_by": "apartment_transaction_etl",
            "source_as_of": source_as_of,
        })
    summaries = [{
        "entity_id": entities[row["canonical_complex_id"]],
        "deal_month": row["deal_month"],
        "area_band": row["area_band"],
        "transaction_count": row["transaction_count"],
        "median_amount_10k_krw": row["median_amount_10k_krw"],
        "mean_amount_10k_krw": row["mean_amount_10k_krw"],
        "median_amount_per_m2_10k_krw": row["median_amount_per_m2_10k_krw"],
        "latest_contract_date": row["latest_contract_date"],
        "source_as_of": source_as_of,
        "quality_status": "approved" if publish else "hold",
        "matcher_version": result["links"][0]["matcher_version"],
    } for row in result["summaries"]]
    return {"raw": raw_rows, "links": link_rows, "decisions": decisions, "summaries": summaries}


def batches(rows: list[dict[str, Any]], size: int = 500) -> Iterable[list[dict[str, Any]]]:
    for start in range(0, len(rows), size):
        yield rows[start:start + size]


def upload_snapshot(url: str, key: str, snapshot: dict[str, Any]) -> str:
    path = Path(snapshot["path"])
    body = path.read_bytes()
    digest = hashlib.sha256(body).hexdigest()
    object_path = f"molit-apartment-trade/{snapshot['source_month'][:7]}/{digest[:12]}-{path.name}.gz"
    upload_storage_object(url, key, "etl-source-snapshots", object_path, gzip.compress(body, 6))
    payload = {
        "source_month": snapshot["source_month"],
        "lawd_cd": snapshot["lawd_cd"],
        "source_as_of": snapshot["source_as_of"],
        "content_sha256": digest,
        "object_path": object_path,
        "row_count": snapshot["row_count"],
    }
    query = urllib.parse.urlencode({"on_conflict": "source_month,lawd_cd,content_sha256"})
    rows = request_json(
        url, key, "POST", f"/rest/v1/apartment_transaction_source_snapshot?{query}",
        payload, "resolution=merge-duplicates,return=representation",
    )
    return rows[0]["transaction_snapshot_id"]


def apply(
    result: dict[str, Any],
    master_rows: list[dict[str, str]],
    snapshots: list[dict[str, Any]],
    source_as_of: str,
    publish: bool = False,
    batch_size: int = 500,
) -> dict[str, int]:
    if publish and not result["quality"]["publication_allowed"]:
        raise RuntimeError("publication gate failed; public serving unchanged")
    url, key = credentials()
    preflight_schema(url, key)
    existing = fetch_all(
        url, key,
        "/rest/v1/apartment_source_identity?decision_status=eq.confirmed"
        "&select=source_system,source_id,entity_id,decision_status",
    )
    existing_entities = {
        row["entity_id"] for row in fetch_all(
            url, key, "/rest/v1/apartment_entity?select=entity_id"
        )
    }
    backfill = plan(master_rows, existing, source_as_of)
    if backfill["decisions"]:
        raise RuntimeError(f"entity backfill has {len(backfill['decisions'])} conflicts; nothing uploaded")
    known = {(row["source_system"], row["source_id"]) for row in existing}
    new_identities = [
        row for row in backfill["identities"]
        if (row["source_system"], row["source_id"]) not in known
    ]
    new_entities = [row for row in backfill["entities"] if row["entity_id"] not in existing_entities]
    for chunk in batches(new_entities, batch_size):
        upsert_batch(url, key, "apartment_entity", ("entity_id",), chunk)
    for chunk in batches(new_identities, batch_size):
        upsert_batch(url, key, "apartment_source_identity", ("source_system", "source_id"), chunk)
    snapshot_ids = {item["lawd_cd"]: upload_snapshot(url, key, item) for item in snapshots}
    mapped = transaction_rows(result, snapshot_ids, entity_map(backfill), source_as_of, publish)
    for chunk in batches(mapped["raw"], batch_size):
        upsert_batch(url, key, "apartment_transaction_raw", ("transaction_snapshot_id", "source_row_ordinal"), chunk)
    for chunk in batches(mapped["links"], batch_size):
        upsert_batch(url, key, "apartment_transaction_link", ("transaction_snapshot_id", "source_row_ordinal"), chunk)
    for snapshot in snapshots:
        snapshot_id = snapshot_ids[snapshot["lawd_cd"]]
        filters = f"transaction_snapshot_id=eq.{urllib.parse.quote(snapshot_id)}"
        expected = int(snapshot["row_count"])
        raw_count = table_count(url, key, "apartment_transaction_raw", filters)
        link_count = table_count(url, key, "apartment_transaction_link", filters)
        if raw_count != expected or link_count != expected:
            raise RuntimeError(
                f"{snapshot['lawd_cd']}: raw/link {raw_count}/{link_count} != expected {expected}; "
                "public serving unchanged"
            )
    for chunk in batches(mapped["decisions"], batch_size):
        upsert_batch(
            url, key, "apartment_identity_decision",
            ("source_system", "source_id", "matcher_version", "source_as_of", "decision_status"),
            chunk,
        )
    for chunk in batches(mapped["summaries"], batch_size):
        upsert_batch(url, key, "apartment_transaction_monthly_summary", ("entity_id", "deal_month", "area_band"), chunk)
    serving = 0
    if publish:
        serving = int(request_json(
            url, key, "POST", "/rest/v1/rpc/refresh_apartment_transaction_monthly_serving", {}
        ))
    return {
        "entities": len(new_entities),
        "new_identities": len(new_identities),
        "snapshots": len(snapshot_ids),
        "raw": len(mapped["raw"]),
        "links": len(mapped["links"]),
        "decisions": len(mapped["decisions"]),
        "summaries": len(mapped["summaries"]),
        "serving": serving,
    }
