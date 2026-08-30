"""Build a capital-region apartment master with conservative K-apt enrichment."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parents[2]
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
APT_SOURCE = ROOT_DIR / "archive" / "GAS" / "GAS" / "임시" / "apt_mst_info_202410.csv"
LEGACY_KAPT_SOURCE = ROOT_DIR / "archive" / "legacy-v1" / "etl" / "data" / "kapt" / "20250801_apt_data.csv"


def latest_kapt_source() -> tuple[Path, str, str]:
    candidates: list[tuple[str, Path]] = []
    for path in OUTPUT_DIR.glob("kapt_basic_*.csv"):
        match = re.fullmatch(r"kapt_basic_(\d{8})\.csv", path.name)
        if match:
            candidates.append((match.group(1), path))
    if candidates:
        snapshot_date, path = max(candidates)
        return path, datetime.strptime(snapshot_date, "%Y%m%d").date().isoformat(), "utf-8-sig"
    return LEGACY_KAPT_SOURCE, "2025-08-01", "cp949"


KAPT_SOURCE, KAPT_AS_OF, KAPT_ENCODING = latest_kapt_source()
TARGET_CODES = {"11": "서울특별시", "41": "경기도", "28": "인천광역시"}
TARGET_REGIONS = set(TARGET_CODES.values())
APARTMENT_BASE_AS_OF = "2024-10-01"


def text(value: Any) -> str:
    return str(value or "").strip()


def normalize(value: Any) -> str:
    normalized = text(value).replace("서울시", "서울특별시").replace("인천시", "인천광역시")
    normalized = re.sub(r"\([^)]*\)", "", normalized)
    return re.sub(r"[^0-9A-Za-z가-힣]", "", normalized).lower()


def normalize_name(value: Any) -> str:
    return normalize(re.sub(r"(?:아파트|apt)$", "", text(value), flags=re.IGNORECASE))


def names_are_variants(left: Any, right: Any) -> bool:
    left_name = normalize_name(left)
    right_name = normalize_name(right)
    if not left_name or not right_name:
        return False
    shorter, longer = sorted((left_name, right_name), key=len)
    return (
        (len(shorter) >= 4 and shorter in longer)
        or SequenceMatcher(None, left_name, right_name).ratio() >= 0.72
    )


def address_candidates(value: Any) -> set[str]:
    candidates = {normalize(part) for part in text(value).split(",") if normalize(part)}
    if normalize(value):
        candidates.add(normalize(value))
    return candidates


def integer(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def floating(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def district_from_address(value: Any) -> str:
    parts = text(value).split()
    return parts[1] if len(parts) > 1 else ""


def approval_year(value: Any) -> int | None:
    match = re.match(r"(19|20)\d{2}", text(value))
    return int(match.group(0)) if match else None


def resolve_property(base: int | None, kapt: int | None, tolerance: int = 0) -> tuple[int | None, str, bool]:
    if base is None and kapt is None:
        return None, "missing", False
    if base is None:
        return kapt, "kapt_fill", False
    if kapt is None:
        return base, "apartment_base", False
    if abs(base - kapt) <= tolerance:
        return base, "confirmed_both", False
    return base, "apartment_base_conflict", True


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    apartments: list[dict[str, str]] = []
    with APT_SOURCE.open(encoding="cp949", newline="") as handle:
        for row in csv.DictReader(handle):
            region_code = text(row.get("legaldong_cd"))[:2]
            expected_region = TARGET_CODES.get(region_code)
            addresses = (text(row.get("rdnmadr")), text(row.get("lnmadr")))
            if expected_region and any(address.startswith(expected_region) for address in addresses):
                apartments.append(row)

    kapt_rows: list[dict[str, str]] = []
    with KAPT_SOURCE.open(encoding=KAPT_ENCODING, newline="") as handle:
        for row in csv.DictReader(handle):
            if text(row.get("시도")) in TARGET_REGIONS:
                kapt_rows.append(row)
    kapt_by_code = {text(row.get("단지코드")): row for row in kapt_rows}

    road_index: dict[str, set[str]] = defaultdict(set)
    legal_index: dict[str, set[str]] = defaultdict(set)
    name_index: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for row in kapt_rows:
        code = text(row.get("단지코드"))
        for candidate in address_candidates(row.get("도로명주소")):
            road_index[candidate].add(code)
        for candidate in address_candidates(row.get("법정동주소")):
            legal_index[candidate].add(code)
        name_index[(text(row.get("시도")), text(row.get("시군구")), normalize_name(row.get("단지명")))].add(code)

    ranked_by_apt: dict[str, list[dict[str, Any]]] = {}
    for apt in apartments:
        road_codes: set[str] = set()
        for candidate in address_candidates(apt.get("rdnmadr")):
            road_codes.update(road_index.get(candidate, set()))
        legal_codes: set[str] = set()
        for candidate in address_candidates(apt.get("lnno_adres")):
            legal_codes.update(legal_index.get(candidate, set()))
        region = TARGET_CODES[text(apt.get("legaldong_cd"))[:2]]
        name_codes = name_index.get((region, district_from_address(apt.get("rdnmadr")), normalize_name(apt.get("apt_nm"))), set())

        ranked: list[dict[str, Any]] = []
        for code in road_codes | legal_codes | name_codes:
            kapt = kapt_by_code[code]
            score = 0
            evidence: list[str] = []
            if code in road_codes:
                score += 100
                evidence.append("road_address")
            if code in legal_codes:
                score += 80
                evidence.append("legal_address")
            if code in name_codes:
                score += 30
                evidence.append("name_district")

            apt_households = integer(apt.get("nmhsh"))
            kapt_households = integer(kapt.get("세대수"))
            if apt_households is not None and kapt_households is not None:
                difference = abs(apt_households - kapt_households)
                if difference == 0:
                    score += 25
                    evidence.append("households")
                elif difference / max(apt_households, kapt_households, 1) <= 0.03:
                    score += 10
                    evidence.append("households_near")

            apt_buildings = integer(apt.get("dngct"))
            kapt_buildings = integer(kapt.get("동수"))
            if apt_buildings is not None and kapt_buildings is not None and apt_buildings == kapt_buildings:
                score += 15
                evidence.append("building_count")

            apt_year = approval_year(apt.get("use_aprv_yr"))
            kapt_year = approval_year(kapt.get("사용승인일"))
            if apt_year is not None and apt_year == kapt_year:
                score += 15
                evidence.append("approval_year")
            ranked.append({"kapt_code": code, "score": score, "evidence": "+".join(evidence)})
        ranked.sort(key=lambda row: (-row["score"], row["kapt_code"]))
        ranked_by_apt[text(apt.get("apt_cd"))] = ranked

    provisional: dict[str, dict[str, Any]] = {}
    for apt_id, ranked in ranked_by_apt.items():
        if not ranked:
            continue
        top = ranked[0]
        runner_score = ranked[1]["score"] if len(ranked) > 1 else -1
        if top["score"] >= 80 and (len(ranked) == 1 or top["score"] - runner_score >= 10):
            provisional[apt_id] = top

    apt_ids_by_kapt: dict[str, list[str]] = defaultdict(list)
    for apt_id, match in provisional.items():
        apt_ids_by_kapt[match["kapt_code"]].append(apt_id)

    accepted = dict(provisional)
    shared_kapt_codes = {kapt_code for kapt_code, apt_ids in apt_ids_by_kapt.items() if len(apt_ids) > 1}
    apartment_by_id = {text(apt.get("apt_cd")): apt for apt in apartments}
    shared_complex_metrics: dict[str, dict[str, Any]] = {}
    shared_complex_review: list[dict[str, Any]] = []
    for kapt_code in sorted(shared_kapt_codes):
        apt_ids = apt_ids_by_kapt[kapt_code]
        component_households = [integer(apartment_by_id[apt_id].get("nmhsh")) for apt_id in apt_ids]
        component_households = [value for value in component_households if value is not None]
        kapt_households = integer(kapt_by_code[kapt_code].get("\uc138\ub300\uc218"))
        household_sum = sum(component_households) if component_households else None
        difference_pct = (
            abs(household_sum - kapt_households) / kapt_households
            if household_sum is not None and kapt_households not in (None, 0)
            else None
        )
        individually_equivalent = sum(
            abs(value - kapt_households) / kapt_households <= 0.03
            for value in component_households
            if kapt_households not in (None, 0)
        )
        if household_sum is not None and household_sum == kapt_households:
            validation = "partition_exact"
        elif difference_pct is not None and difference_pct <= 0.03:
            validation = "partition_near"
        else:
            validation = "partition_review"
        if validation != "partition_review":
            review_reason = None
        elif individually_equivalent >= 2:
            review_reason = "historical_current_overlap"
        elif household_sum is not None and kapt_households is not None and household_sum > kapt_households:
            review_reason = "overlapping_components_or_aliases"
        elif household_sum is not None and kapt_households is not None and household_sum < kapt_households:
            review_reason = "missing_components"
        else:
            review_reason = "household_comparison_unavailable"
        shared_complex_metrics[kapt_code] = {
            "validation": validation,
            "review_reason": review_reason,
            "household_sum": household_sum,
            "kapt_households": kapt_households,
            "difference_pct": difference_pct,
        }
        if validation == "partition_review":
            shared_complex_review.append({
                "kapt_code": kapt_code,
                "kapt_name": text(kapt_by_code[kapt_code].get("\ub2e8\uc9c0\uba85")),
                "component_count": len(apt_ids),
                "component_apt_ids": "+".join(apt_ids),
                "component_names": "+".join(text(apartment_by_id[apt_id].get("apt_nm")) for apt_id in apt_ids),
                "component_household_sum": household_sum,
                "kapt_households": kapt_households,
                "household_difference_pct": round(difference_pct * 100, 2) if difference_pct is not None else None,
                "review_reason": review_reason,
            })

    master: list[dict[str, Any]] = []
    review: list[dict[str, Any]] = []
    property_review: list[dict[str, Any]] = []
    name_history: list[dict[str, Any]] = []
    property_history: list[dict[str, Any]] = []
    for apt in apartments:
        apt_id = text(apt.get("apt_cd"))
        legal_code = text(apt.get("legaldong_cd"))
        match = accepted.get(apt_id)
        kapt = kapt_by_code.get(match["kapt_code"]) if match else None
        ranked = ranked_by_apt[apt_id]
        if match and match["kapt_code"] in shared_kapt_codes:
            shared_validation = shared_complex_metrics[match["kapt_code"]]["validation"]
            match_status = (
                "matched_shared_complex_validated"
                if shared_validation in {"partition_exact", "partition_near"}
                else "matched_shared_complex_review"
            )
        elif match:
            match_status = "matched_high" if match["score"] >= 150 else "matched_supported"
        elif ranked:
            match_status = "ambiguous_or_weak_candidate"
        else:
            base_households = integer(apt.get("nmhsh"))
            if base_households is None:
                match_status = "kapt_scope_unknown"
            elif base_households < 150:
                match_status = "not_in_kapt_scope_likely"
            else:
                match_status = "kapt_coverage_gap"

        base_name = text(apt.get("apt_nm"))
        kapt_name = text(kapt.get("단지명")) if kapt else ""
        same_normalized_name = bool(kapt_name and normalize_name(base_name) == normalize_name(kapt_name))
        shared_scope = match_status.startswith("matched_shared_complex")
        match_evidence = set(match["evidence"].split("+")) if match else set()
        structural_evidence_count = len(match_evidence & {"households", "households_near", "building_count", "approval_year"})
        if not match:
            name_resolution_status = "base_only"
            latest_known_name = base_name
        elif shared_scope:
            name_resolution_status = "component_name_with_latest_group_name"
            latest_known_name = base_name
        elif same_normalized_name:
            name_resolution_status = "latest_name_confirmed"
            latest_known_name = kapt_name
        elif names_are_variants(base_name, kapt_name):
            name_resolution_status = "latest_name_format_variant"
            latest_known_name = kapt_name
        elif match_evidence & {"road_address", "legal_address"} and structural_evidence_count >= 2:
            name_resolution_status = "renamed_latest_kapt"
            latest_known_name = kapt_name
        else:
            name_resolution_status = "name_change_review"
            latest_known_name = base_name

        row = {
            "uid": text(apt.get("uid")),
            "apt_cd": apt_id,
            "apt_nm": base_name,
            "latest_known_name": latest_known_name,
            "name_resolution_status": name_resolution_status,
            "name_aliases": json.dumps(list(dict.fromkeys(name for name in (base_name, kapt_name) if name)), ensure_ascii=False),
            "apartment_base_as_of": APARTMENT_BASE_AS_OF,
            "kapt_as_of": KAPT_AS_OF if match else None,
            "region": TARGET_CODES[legal_code[:2]],
            "district": district_from_address(apt.get("rdnmadr")),
            "road_address": text(apt.get("rdnmadr")),
            "legal_address": text(apt.get("lnno_adres")),
            "legal_dong_code": legal_code,
            "longitude": floating(apt.get("lo")),
            "latitude": floating(apt.get("la")),
            "households": integer(apt.get("nmhsh")),
            "building_count": integer(apt.get("dngct")),
            "use_approval_year": approval_year(apt.get("use_aprv_yr")),
            "complex_type": text(apt.get("hsmp_type")) or None,
            "sale_type": text(apt.get("ltout_type")) or None,
            "rental_housing": integer(apt.get("let_hus_yn")),
            "company_housing": integer(apt.get("cmpny_hus_yn")),
            "rebuild": integer(apt.get("rbld_yn")),
            "heating_method": text(apt.get("htng_mthd")) or None,
            "corridor_type": text(apt.get("crrdpr_type")) or None,
            "constructor": text(apt.get("cnst_entrprs_nm")) or None,
            "parking_total": integer(apt.get("totprk_ecct")),
            "parking_ground": integer(apt.get("grnd_prkg_ecct")),
            "parking_underground": integer(apt.get("undgr_prkg_ecct")),
            "kapt_code": match["kapt_code"] if match else None,
            "kapt_match_status": match_status,
            "kapt_match_score": match["score"] if match else None,
            "kapt_match_evidence": match["evidence"] if match else None,
            "canonical_complex_id": f"KAPT:{match['kapt_code']}" if match else f"APT:{apt_id}",
            "kapt_property_scope": "shared_complex" if match_status.startswith("matched_shared_complex") else "same_unit" if match else None,
            "shared_complex_validation": shared_complex_metrics[match["kapt_code"]]["validation"] if match and match["kapt_code"] in shared_kapt_codes else None,
            "shared_component_household_sum": shared_complex_metrics[match["kapt_code"]]["household_sum"] if match and match["kapt_code"] in shared_kapt_codes else None,
            "shared_household_difference_pct": round(shared_complex_metrics[match["kapt_code"]]["difference_pct"] * 100, 2) if match and match["kapt_code"] in shared_kapt_codes and shared_complex_metrics[match["kapt_code"]]["difference_pct"] is not None else None,
            "kapt_name": kapt_name or None,
            "kapt_road_address": text(kapt.get("도로명주소")) if kapt else None,
            "kapt_households": integer(kapt.get("세대수")) if kapt else None,
            "kapt_building_count": integer(kapt.get("동수")) if kapt else None,
            "kapt_use_approval_date": text(kapt.get("사용승인일")) if kapt else None,
            "kapt_use_approval_year": approval_year(kapt.get("사용승인일")) if kapt else None,
            "kapt_parking_total": integer(kapt.get("총주차대수")) if kapt else None,
            "kapt_parking_ground": integer(kapt.get("지상주차대수")) if kapt else None,
            "kapt_parking_underground": integer(kapt.get("지하주차대수")) if kapt else None,
            "kapt_sale_households": integer(kapt.get("분양세대수")) if kapt else None,
            "kapt_rental_units_total": integer(kapt.get("임대세대수")) if kapt else None,
            "kapt_public_rental_units": integer(kapt.get("임대세대수(공공)")) if kapt else None,
            "kapt_private_rental_units": integer(kapt.get("임대세대수(민간)")) if kapt else None,
            "kapt_management_type": text(kapt.get("관리방식")) if kapt else None,
            "apartment_base_source": APT_SOURCE.name,
            "kapt_source": KAPT_SOURCE.name if match else None,
        }
        name_history.append({
            "apt_cd": apt_id,
            "canonical_complex_id": row["canonical_complex_id"],
            "name": base_name,
            "source": APT_SOURCE.name,
            "observed_as_of": APARTMENT_BASE_AS_OF,
            "name_role": "component_or_historical_name" if match and not same_normalized_name else "confirmed_name",
        })
        if kapt_name and not same_normalized_name:
            name_history.append({
                "apt_cd": apt_id,
                "canonical_complex_id": row["canonical_complex_id"],
                "name": kapt_name,
                "source": KAPT_SOURCE.name,
                "observed_as_of": KAPT_AS_OF,
                "name_role": "latest_group_name" if shared_scope else "latest_known_name_candidate",
            })
        if match_status.startswith("matched_shared_complex"):
            row["canonical_households"], row["households_source"], household_conflict = row["households"], "apartment_component", False
            row["canonical_building_count"], row["building_count_source"], building_conflict = row["building_count"], "apartment_component", False
            row["canonical_use_approval_year"], row["use_approval_year_source"], year_conflict = row["use_approval_year"], "apartment_component", False
            row["canonical_parking_total"], row["parking_source"], parking_conflict = row["parking_total"], "apartment_component", False
            parking_latest_adopted = False
        else:
            household_tolerance = max(5, round(max(row["households"] or 0, row["kapt_households"] or 0) * 0.03))
            row["canonical_households"], row["households_source"], household_conflict = resolve_property(
                row["households"], row["kapt_households"], household_tolerance
            )
            row["canonical_building_count"], row["building_count_source"], building_conflict = resolve_property(
                row["building_count"], row["kapt_building_count"]
            )
            row["canonical_use_approval_year"], row["use_approval_year_source"], year_conflict = resolve_property(
                row["use_approval_year"], row["kapt_use_approval_year"], 1
            )
            base_parking = row["parking_total"] if row["parking_total"] not in (None, 0) else None
            _, _, parking_conflict = resolve_property(
                base_parking, row["kapt_parking_total"]
            )
            structural_conflict = any((household_conflict, building_conflict, year_conflict))
            parking_latest_adopted = row["kapt_parking_total"] is not None and not structural_conflict
            if parking_latest_adopted:
                row["canonical_parking_total"] = row["kapt_parking_total"]
                row["parking_source"] = "kapt_latest" if parking_conflict or base_parking is None else "confirmed_both"
            else:
                row["canonical_parking_total"] = base_parking
                row["parking_source"] = "apartment_base" if base_parking is not None else "missing"
        row["property_difference_detected"] = any(
            (household_conflict, building_conflict, year_conflict, parking_conflict)
        )
        row["property_review_required"] = any((household_conflict, building_conflict, year_conflict))
        if row["property_difference_detected"]:
            conflict_fields = "+".join(
                name for name, conflict in (
                    ("households", household_conflict),
                    ("building_count", building_conflict),
                    ("use_approval_year", year_conflict),
                    ("parking_total", parking_conflict),
                ) if conflict
            )
            property_review.append({
                "apt_cd": apt_id,
                "apt_nm": row["apt_nm"],
                "road_address": row["road_address"],
                "kapt_code": row["kapt_code"],
                "households": row["households"],
                "kapt_households": row["kapt_households"],
                "building_count": row["building_count"],
                "kapt_building_count": row["kapt_building_count"],
                "use_approval_year": row["use_approval_year"],
                "kapt_use_approval_year": row["kapt_use_approval_year"],
                "parking_total": row["parking_total"],
                "kapt_parking_total": row["kapt_parking_total"],
                "conflict_fields": conflict_fields,
                "conflict_severity": "refresh_difference" if conflict_fields == "parking_total" else "identity_or_scope_review",
            })
            for field_name, base_value, kapt_value, canonical_value, conflict in (
                ("households", row["households"], row["kapt_households"], row["canonical_households"], household_conflict),
                ("building_count", row["building_count"], row["kapt_building_count"], row["canonical_building_count"], building_conflict),
                ("use_approval_year", row["use_approval_year"], row["kapt_use_approval_year"], row["canonical_use_approval_year"], year_conflict),
                ("parking_total", row["parking_total"], row["kapt_parking_total"], row["canonical_parking_total"], parking_conflict),
            ):
                if conflict:
                    property_history.append({
                        "apt_cd": apt_id,
                        "canonical_complex_id": row["canonical_complex_id"],
                        "field_name": field_name,
                        "base_value": base_value,
                        "base_as_of": APARTMENT_BASE_AS_OF,
                        "latest_observed_value": kapt_value,
                        "latest_observed_as_of": KAPT_AS_OF,
                        "canonical_value": canonical_value,
                        "resolution": "latest_kapt_adopted" if field_name == "parking_total" and parking_latest_adopted else "identity_or_scope_review",
                    })
        master.append(row)
        if match_status == "ambiguous_or_weak_candidate":
            review.append({
                "apt_cd": apt_id,
                "apt_nm": row["apt_nm"],
                "road_address": row["road_address"],
                "match_status": match_status,
                "candidate_count": len(ranked),
                "top_candidates": json.dumps(ranked[:5], ensure_ascii=False),
            })

    csv_path = OUTPUT_DIR / "apartment_master_v1_20260320.csv"
    json_path = OUTPUT_DIR / "apartment_master_v1_20260320.json"
    review_path = OUTPUT_DIR / "apartment_kapt_review_queue.csv"
    shared_review_path = OUTPUT_DIR / "apartment_shared_complex_review.csv"
    property_review_path = OUTPUT_DIR / "apartment_property_conflicts.csv"
    name_history_path = OUTPUT_DIR / "apartment_name_history.csv"
    property_history_path = OUTPUT_DIR / "apartment_property_history.csv"
    write_csv(csv_path, master, list(master[0]))
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(master, handle, ensure_ascii=False, indent=2)
    write_csv(review_path, review, ["apt_cd", "apt_nm", "road_address", "match_status", "candidate_count", "top_candidates"])
    write_csv(
        shared_review_path,
        shared_complex_review,
        [
            "kapt_code", "kapt_name", "component_count", "component_apt_ids", "component_names",
            "component_household_sum", "kapt_households", "household_difference_pct", "review_reason",
        ],
    )
    write_csv(
        property_review_path,
        property_review,
        [
            "apt_cd", "apt_nm", "road_address", "kapt_code", "households", "kapt_households",
            "building_count", "kapt_building_count", "use_approval_year", "kapt_use_approval_year",
            "parking_total", "kapt_parking_total", "conflict_fields", "conflict_severity",
        ],
    )
    write_csv(
        name_history_path,
        name_history,
        ["apt_cd", "canonical_complex_id", "name", "source", "observed_as_of", "name_role"],
    )
    write_csv(
        property_history_path,
        property_history,
        [
            "apt_cd", "canonical_complex_id", "field_name", "base_value", "base_as_of",
            "latest_observed_value", "latest_observed_as_of", "canonical_value", "resolution",
        ],
    )

    status_counts = Counter(row["kapt_match_status"] for row in master)
    report = {
        "generated_at": datetime.now().isoformat(),
        "apartments": len(master),
        "kapt_rows": len(kapt_rows),
        "kapt_match_status_counts": dict(sorted(status_counts.items())),
        "kapt_matched": sum(status.startswith("matched_") for status in (row["kapt_match_status"] for row in master)),
        "kapt_codes_used": len({row["kapt_code"] for row in master if row["kapt_code"]}),
        "shared_kapt_codes": len(shared_kapt_codes),
        "shared_complex_validation_counts": dict(sorted(Counter(
            metrics["validation"] for metrics in shared_complex_metrics.values()
        ).items())),
        "shared_complex_review": len(shared_complex_review),
        "shared_complex_review_reason_counts": dict(sorted(Counter(
            row["review_reason"] for row in shared_complex_review
        ).items())),
        "review_queue": len(review),
        "name_resolution_status_counts": dict(sorted(Counter(
            row["name_resolution_status"] for row in master
        ).items())),
        "name_history_rows": len(name_history),
        "property_conflicts": len(property_review),
        "property_manual_review": sum(row["property_review_required"] for row in master),
        "property_history_rows": len(property_history),
        "property_history_resolution_counts": dict(sorted(Counter(
            row["resolution"] for row in property_history
        ).items())),
        "property_conflict_fields": dict(sorted(Counter(
            field for row in property_review for field in row["conflict_fields"].split("+") if field
        ).items())),
        "property_conflict_severity_counts": dict(sorted(Counter(
            row["conflict_severity"] for row in property_review
        ).items())),
        "base_field_completeness": {
            "coordinates": sum(row["latitude"] is not None and row["longitude"] is not None for row in master),
            "road_address": sum(bool(row["road_address"]) for row in master),
            "households": sum(row["households"] is not None for row in master),
            "building_count": sum(row["building_count"] is not None for row in master),
            "use_approval_year": sum(row["use_approval_year"] is not None for row in master),
        },
        "canonical_field_completeness": {
            "households": sum(row["canonical_households"] is not None for row in master),
            "building_count": sum(row["canonical_building_count"] is not None for row in master),
            "use_approval_year": sum(row["canonical_use_approval_year"] is not None for row in master),
            "parking_total": sum(row["canonical_parking_total"] is not None for row in master),
            "kapt_parking_ground": sum(row["kapt_parking_ground"] is not None for row in master),
            "kapt_parking_underground": sum(row["kapt_parking_underground"] is not None for row in master),
            "kapt_public_rental_units": sum(row["kapt_public_rental_units"] is not None for row in master),
        },
        "outputs": [
            csv_path.name, json_path.name, review_path.name, shared_review_path.name,
            property_review_path.name, name_history_path.name, property_history_path.name,
        ],
    }
    with (OUTPUT_DIR / "apartment_master_v1_report.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
