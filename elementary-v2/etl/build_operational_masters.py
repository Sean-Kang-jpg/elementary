"""Build DB-ready school, apartment-complex, and assignment-unit masters."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
APARTMENTS = OUTPUT_DIR / "apartment_master_v1_20260320.csv"
SCHOOLS = OUTPUT_DIR / "school_master_v2_20260320.csv"
POINT_ASSIGNMENTS = OUTPUT_DIR / "apartment_point_assignments.csv"
REVIEW_QUEUE = OUTPUT_DIR / "assignment_review_queue.csv"
RESOLVED_CASES = OUTPUT_DIR / "p1_resolved_cases.csv"
NAME_HISTORY = OUTPUT_DIR / "apartment_name_history.csv"
PROPERTY_HISTORY = OUTPUT_DIR / "apartment_property_history.csv"
PIPELINE_VERSION = "operational-v1"
INACTIVE_ZONE_SCHOOL_LABELS = {"대원초"}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def integer(value: Any) -> int | None:
    try:
        return int(float(value)) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def floating(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def boolean(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "t", "yes", "y"}


def normalize_school_name(value: Any) -> str:
    name = str(value or "")
    name = re.sub(r"\([^)]*\)", "", name)
    name = name.replace("공동통학구역", "").replace("통학구역", "")
    name = name.replace("초등학교", "").replace("초등", "").replace("초", "")
    return re.sub(r"[^0-9A-Za-z가-힣]", "", name).lower()


def school_zone_label(value: Any) -> str:
    name = str(value or "")
    name = name.replace("초중학교", "초").replace("초등학교", "초").replace("초등", "초")
    name = re.sub(r"\([^)]*\)|\[[^]]*\]", "", name)
    name = re.sub(r"^\d{4}\..*?월\s*", "", name)
    name = name.replace("소규모학교", "").replace("작업 후", "")
    name = re.sub(r"공동(?:\(일방\))?통학구역$", "", name)
    name = re.sub(r"통학구역$", "", name)
    return re.sub(r"[^0-9A-Za-z가-힣]", "", name).lower()


def school_region(school: dict[str, Any]) -> str:
    address = str(school.get("road_address") or school.get("legal_address") or "")
    return next((region for region in ("서울특별시", "경기도", "인천광역시") if address.startswith(region)), "")


def segment_school_zone(label: str, candidates: list[tuple[str, str]]) -> list[str]:
    memo: dict[int, list[str] | None] = {}

    def visit(position: int) -> list[str] | None:
        if position == len(label):
            return []
        if position in memo:
            return memo[position]
        for school_label, school_id in candidates:
            if label.startswith(school_label, position):
                remainder = visit(position + len(school_label))
                if remainder is not None:
                    memo[position] = [school_id, *remainder]
                    return memo[position]
        memo[position] = None
        return None

    return visit(0) or []


def match_school_zone(value: Any, region: str, candidates: list[tuple[str, str]]) -> list[str]:
    cleaned_value = re.sub(r"\([^)]*\)|\[[^]]*\]", "", str(value or ""))
    parts = re.split(r"\||\s+및\s+", cleaned_value)
    region_prefix = {"서울특별시": "서울", "인천광역시": "인천"}.get(region)
    candidate_variants = list(candidates)
    if region_prefix:
        candidate_variants.extend(
            (label[len(region_prefix) :], school_id)
            for label, school_id in candidates
            if label.startswith(region_prefix)
        )
    candidate_variants.extend(
        (label.removesuffix("장"), school_id)
        for label, school_id in candidate_variants
        if label.endswith("분교장")
    )
    candidate_variants.extend(
        (label.split("초", 1)[1], school_id)
        for label, school_id in candidate_variants
        if "초" in label and label.endswith("분교장")
    )
    candidate_variants = sorted(set(candidate_variants), key=lambda item: (-len(item[0]), item[0], item[1]))

    matches: list[str] = []
    for part in parts:
        label = school_zone_label(part)
        for inactive_label in INACTIVE_ZONE_SCHOOL_LABELS:
            if label.startswith(inactive_label):
                label = label[len(inactive_label) :]
        labels = [label]
        if region_prefix:
            labels.append(label.replace(region_prefix, ""))
        for candidate_label in labels:
            segmented = segment_school_zone(candidate_label, candidate_variants)
            if segmented:
                matches.extend(segmented)
                break
    return list(dict.fromkeys(matches))


def source_value(kapt_value: Any, base_value: Any, use_kapt: bool, kapt_as_of: Any) -> tuple[Any, str]:
    if use_kapt and kapt_value not in (None, ""):
        return kapt_value, f"kapt_{str(kapt_as_of or 'unknown').replace('-', '_')}"
    return base_value, "apartment_base_2024_10"


def student_statistics_year(status: Any) -> int | None:
    match = re.fullmatch(r"observed_schoolinfo_(\d{4})", str(status or ""))
    if match:
        return int(match.group(1))
    return 2025 if status else None


def build_school_master(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    output = []
    for row in rows:
        output.append({
            "school_id": row["school_id"],
            "schoolinfo_code": row.get("schoolinfo_code") or None,
            "school_name": row["school_name"],
            "school_type": row.get("school_type") or None,
            "establishment_date": row.get("establishment_date") or None,
            "establishment_type": row.get("establishment_type") or None,
            "campus_type": row.get("campus_type") or None,
            "operation_status": row.get("operation_status") or None,
            "road_address": row.get("address") or None,
            "legal_address": row.get("address_old") or None,
            "region": next(
                (
                    region
                    for region in ("서울특별시", "경기도", "인천광역시")
                    if str(row.get("address") or row.get("address_old") or "").startswith(region)
                ),
                None,
            ),
            "education_office": row.get("education_office") or None,
            "education_support_office": row.get("education_support_office") or None,
            "latitude": floating(row.get("latitude")),
            "longitude": floating(row.get("longitude")),
            **{f"grade{grade}_students": integer(row.get(f"grade{grade}_students")) for grade in range(1, 7)},
            **{f"grade{grade}_classes": integer(row.get(f"grade{grade}_classes")) for grade in range(1, 7)},
            **{f"grade{grade}_per_class": floating(row.get(f"grade{grade}_per_class")) for grade in range(1, 7)},
            "grade1_6_students_sum": integer(row.get("grade1_6_students_sum")),
            "other_students": integer(row.get("other_students")),
            "total_students": integer(row.get("total_students")),
            "teachers": integer(row.get("teachers")),
            "student_statistics_year": student_statistics_year(row.get("student_data_status")),
            "student_data_status": row.get("student_data_status") or None,
            "student_data_source": row.get("student_data_source") or None,
            "reference_date": row.get("reference_date") or None,
            "homepage": row.get("homepage") or None,
            "phone": row.get("phone") or None,
            "pipeline_version": PIPELINE_VERSION,
        })
    return output


def effective_complex_id(row: dict[str, str]) -> str:
    if row.get("kapt_match_status") == "matched_shared_complex_review":
        return f"APT:{row['apt_cd']}"
    return row["canonical_complex_id"]


def build_complex_master(apartments: list[dict[str, str]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in apartments:
        groups[effective_complex_id(row)].append(row)

    output = []
    for complex_id, components in sorted(groups.items()):
        first = components[0]
        is_kapt = complex_id.startswith("KAPT:")
        is_shared = len(components) > 1
        use_kapt = is_kapt
        if is_shared:
            group_type = "kapt_shared_validated"
        elif first.get("kapt_match_status") == "matched_shared_complex_review":
            group_type = "shared_review_unmerged"
        elif is_kapt:
            group_type = "kapt_single"
        else:
            group_type = "apt_fallback"

        kapt_as_of = first.get("kapt_as_of")
        name, name_source = source_value(first.get("kapt_name"), first.get("latest_known_name") or first["apt_nm"], use_kapt, kapt_as_of)
        households, households_source = source_value(integer(first.get("kapt_households")), integer(first.get("canonical_households")), use_kapt, kapt_as_of)
        building_count, building_source = source_value(integer(first.get("kapt_building_count")), integer(first.get("canonical_building_count")), use_kapt, kapt_as_of)
        approval_year, approval_source = source_value(integer(first.get("kapt_use_approval_year")), integer(first.get("canonical_use_approval_year")), use_kapt, kapt_as_of)
        parking_total, parking_source = source_value(integer(first.get("kapt_parking_total")), integer(first.get("canonical_parking_total")), use_kapt, kapt_as_of)
        parking_ground = integer(first.get("kapt_parking_ground")) if use_kapt else integer(first.get("parking_ground"))
        parking_underground = integer(first.get("kapt_parking_underground")) if use_kapt else integer(first.get("parking_underground"))
        sale_households = integer(first.get("kapt_sale_households")) if use_kapt else None
        rental_units_total = integer(first.get("kapt_rental_units_total")) if use_kapt else None
        public_rental_units = integer(first.get("kapt_public_rental_units")) if use_kapt else None
        private_rental_units = integer(first.get("kapt_private_rental_units")) if use_kapt else None
        rental_breakdown_valid = (
            not use_kapt
            or households in (None, 0)
            or (
                (public_rental_units is None or public_rental_units <= households)
                and (private_rental_units is None or private_rental_units <= households)
                and (public_rental_units or 0) + (private_rental_units or 0) <= households
            )
        )
        if not rental_breakdown_valid:
            public_rental_units = None
            private_rental_units = None
        public_rental_ratio = (
            round(public_rental_units / households * 100, 3)
            if public_rental_units is not None and households not in (None, 0)
            else None
        )
        latitudes = [value for value in (floating(row.get("latitude")) for row in components) if value is not None]
        longitudes = [value for value in (floating(row.get("longitude")) for row in components) if value is not None]
        review_required = not rental_breakdown_valid or group_type == "shared_review_unmerged" or any(
            boolean(row.get("property_review_required")) or row.get("name_resolution_status") == "name_change_review"
            for row in components
        )
        output.append({
            "canonical_complex_id": complex_id,
            "kapt_code": first.get("kapt_code") or None,
            "complex_name": name,
            "name_source": name_source,
            "road_address": (first.get("kapt_road_address") if use_kapt else None) or first.get("road_address") or None,
            "legal_address": first.get("legal_address") or None,
            "region": first.get("region") or None,
            "district": first.get("district") or None,
            "latitude": round(mean(latitudes), 7) if latitudes else None,
            "longitude": round(mean(longitudes), 7) if longitudes else None,
            "households": households,
            "households_source": households_source,
            "building_count": building_count,
            "building_count_source": building_source,
            "use_approval_year": approval_year,
            "use_approval_year_source": approval_source,
            "parking_total": parking_total,
            "parking_ground": parking_ground,
            "parking_underground": parking_underground,
            "parking_source": parking_source,
            "sale_households": sale_households,
            "rental_units_total": rental_units_total,
            "public_rental_units": public_rental_units,
            "private_rental_units": private_rental_units,
            "public_rental_ratio": public_rental_ratio,
            "rental_source": (
                "kapt_invalid_breakdown"
                if use_kapt and not rental_breakdown_valid
                else "kapt_latest" if use_kapt else "missing"
            ),
            "component_count": len(components),
            "component_apt_ids": [row["apt_cd"] for row in components],
            "group_type": group_type,
            "review_required": review_required,
            "source_as_of": first.get("kapt_as_of") if use_kapt else first.get("apartment_base_as_of"),
            "pipeline_version": PIPELINE_VERSION,
        })
    return output


def build_assignment_units(
    apartments: list[dict[str, str]],
    points: list[dict[str, str]],
    review_rows: list[dict[str, str]],
    resolved_rows: list[dict[str, str]],
    schools: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    apartment_by_id = {row["apt_cd"]: row for row in apartments}
    point_by_id = {row["apt_cd"]: row for row in points}
    review_by_id = {row["apt_cd"]: row for row in review_rows}
    resolved_by_id = {row["apt_cd"]: row for row in resolved_rows if row.get("status") == "resolved"}
    schools_by_region: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for school in schools:
        label = school_zone_label(school["school_name"])
        if label:
            schools_by_region[school_region(school)].append((label, school["school_id"]))
    for region in schools_by_region:
        schools_by_region[region].sort(key=lambda item: (-len(item[0]), item[0], item[1]))
    all_school_candidates = sorted(
        {item for candidates in schools_by_region.values() for item in candidates},
        key=lambda item: (-len(item[0]), item[0], item[1]),
    )

    output = []
    school_links = []
    school_match_cache: dict[tuple[str, str], list[str]] = {}
    for apt_id, apartment in sorted(apartment_by_id.items()):
        point = point_by_id.get(apt_id, {})
        resolved = resolved_by_id.get(apt_id)
        in_review = apt_id in review_by_id
        hakgudo_name = point.get("primary_hakgudo_nm") or None
        hakgudo_id = point.get("primary_hakgudo_id") or None
        assignment_method = "official_polygon_point"
        confidence = "high" if point.get("confidence") == "high" else "supported"
        evidence = point.get("building_check_reasons") or None
        if resolved:
            hakgudo_name = resolved.get("official_assignment") or hakgudo_name
            assignment_method = resolved.get("resolution_type") or "manual_resolution"
            confidence = "verified_manual"
            evidence = resolved.get("evidence") or evidence
            in_review = False
        elif in_review:
            assignment_method = "official_polygon_point_provisional"
            confidence = "provisional"
            evidence = review_by_id[apt_id].get("review_reasons") or evidence
        elif not hakgudo_id:
            assignment_method = "unassigned_point_nohit"
            confidence = "unassigned"
            in_review = True

        cache_key = (hakgudo_name or "", apartment.get("region") or "")
        if cache_key not in school_match_cache:
            school_candidates = match_school_zone(
                hakgudo_name,
                cache_key[1],
                schools_by_region.get(cache_key[1], []),
            ) if hakgudo_name else []
            if hakgudo_name and not school_candidates:
                school_candidates = match_school_zone(hakgudo_name, cache_key[1], all_school_candidates)
            school_match_cache[cache_key] = school_candidates
        school_candidates = school_match_cache[cache_key]
        for rank, school_id in enumerate(school_candidates, start=1):
            school_links.append({
                "apt_cd": apt_id,
                "school_id": school_id,
                "assignment_rank": rank,
                "assignment_role": "shared_zone_active" if "공동" in str(hakgudo_name) else "primary",
                "match_method": "region_school_zone_segmentation_with_inactive_alias" if "대원초" in str(hakgudo_name) else "region_school_zone_segmentation",
                "pipeline_version": PIPELINE_VERSION,
            })
        output.append({
            "apt_cd": apt_id,
            "canonical_complex_id": effective_complex_id(apartment),
            "apt_name": apartment["apt_nm"],
            "road_address": apartment.get("road_address") or None,
            "region": apartment.get("region") or None,
            "latitude": floating(apartment.get("latitude")),
            "longitude": floating(apartment.get("longitude")),
            "hakgudo_id": hakgudo_id,
            "hakgudo_name": hakgudo_name,
            "school_id": school_candidates[0] if len(school_candidates) == 1 else None,
            "education_office": point.get("primary_edu_nm") or None,
            "assignment_method": assignment_method,
            "confidence": confidence,
            "review_required": in_review,
            "review_reason": evidence,
            "hakgudo_reference_date": "2026-03-20",
            "pipeline_version": PIPELINE_VERSION,
        })
    return output, school_links


def dump_outputs(name: str, rows: list[dict[str, Any]]) -> tuple[Path, Path]:
    csv_path = OUTPUT_DIR / f"{name}.csv"
    json_path = OUTPUT_DIR / f"{name}.json"
    write_csv(csv_path, rows)
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return csv_path, json_path


def remap_history(rows: list[dict[str, str]], assignment_units: list[dict[str, Any]]) -> list[dict[str, str]]:
    complex_by_apt = {row["apt_cd"]: row["canonical_complex_id"] for row in assignment_units}
    output = []
    for row in rows:
        if row.get("apt_cd") not in complex_by_apt:
            continue
        updated = dict(row)
        updated["canonical_complex_id"] = complex_by_apt[row["apt_cd"]]
        output.append(updated)
    return output


def build_school_apartment_serving(
    schools: list[dict[str, Any]],
    complexes: list[dict[str, Any]],
    units: list[dict[str, Any]],
    links: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    school_by_id = {row["school_id"]: row for row in schools}
    complex_by_id = {row["canonical_complex_id"]: row for row in complexes}
    unit_by_id = {row["apt_cd"]: row for row in units}
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    confidence_rank = {"low": 0, "medium": 1, "high": 2}

    for link in links:
        unit = unit_by_id[link["apt_cd"]]
        key = (link["school_id"], unit["canonical_complex_id"])
        group = groups.setdefault(key, {"apt_cd_list": set(), "assignment_roles": set(), "links": []})
        group["apt_cd_list"].add(link["apt_cd"])
        group["assignment_roles"].add(link["assignment_role"])
        group["links"].append((link, unit))

    output = []
    for (school_id, complex_id), group in sorted(groups.items()):
        school = school_by_id[school_id]
        complex_row = complex_by_id[complex_id]
        pairs = group["links"]
        confidence = min(
            (unit["confidence"] for _, unit in pairs),
            key=lambda value: confidence_rank.get(str(value), -1),
        )
        output.append({
            "school_id": school_id,
            "school_name": school["school_name"],
            "canonical_complex_id": complex_id,
            "apt_cd_list": sorted(group["apt_cd_list"]),
            "complex_name": complex_row["complex_name"],
            "road_address": complex_row.get("road_address"),
            "region": complex_row["region"],
            "district": complex_row.get("district"),
            "latitude": complex_row.get("latitude"),
            "longitude": complex_row.get("longitude"),
            "households": complex_row.get("households"),
            "building_count": complex_row.get("building_count"),
            "use_approval_year": complex_row.get("use_approval_year"),
            "parking_total": complex_row.get("parking_total"),
            "parking_ground": complex_row.get("parking_ground"),
            "parking_underground": complex_row.get("parking_underground"),
            "parking_per_household": round(
                float(complex_row["parking_total"]) / float(complex_row["households"]), 3
            ) if complex_row.get("parking_total") is not None and complex_row.get("households") else None,
            "sale_households": complex_row.get("sale_households"),
            "rental_units_total": complex_row.get("rental_units_total"),
            "public_rental_units": complex_row.get("public_rental_units"),
            "private_rental_units": complex_row.get("private_rental_units"),
            "public_rental_ratio": complex_row.get("public_rental_ratio"),
            "assignment_rank": min(int(link["assignment_rank"]) for link, _ in pairs),
            "assignment_roles": sorted(group["assignment_roles"]),
            "confidence": confidence,
            "review_required": any(unit["review_required"] for _, unit in pairs),
            "pipeline_version": PIPELINE_VERSION,
        })
    return output


def main() -> None:
    apartments = read_csv(APARTMENTS)
    school_source = read_csv(SCHOOLS)
    school_master = build_school_master(school_source)
    complex_master = build_complex_master(apartments)
    assignment_units, assignment_school_links = build_assignment_units(
        apartments,
        read_csv(POINT_ASSIGNMENTS),
        read_csv(REVIEW_QUEUE),
        read_csv(RESOLVED_CASES),
        school_master,
    )
    name_history = remap_history(read_csv(NAME_HISTORY), assignment_units)
    property_history = remap_history(read_csv(PROPERTY_HISTORY), assignment_units)
    school_apartment_serving = build_school_apartment_serving(
        school_master,
        complex_master,
        assignment_units,
        assignment_school_links,
    )
    complex_ids = {row["canonical_complex_id"] for row in complex_master}
    school_ids = {row["school_id"] for row in school_master}
    assignment_ids = {row["apt_cd"] for row in assignment_units}
    if any(row["canonical_complex_id"] not in complex_ids for row in assignment_units):
        raise ValueError("assignment unit references an unknown apartment complex")
    if any(row["apt_cd"] not in assignment_ids or row["school_id"] not in school_ids for row in assignment_school_links):
        raise ValueError("assignment-school link contains an unknown key")

    outputs = []
    for name, rows in (
        ("school_master_operational_v1", school_master),
        ("apartment_complex_master_v1", complex_master),
        ("apartment_assignment_units_v1", assignment_units),
        ("apartment_assignment_schools_v1", assignment_school_links),
        ("school_apartment_serving_v1", school_apartment_serving),
    ):
        outputs.extend(path.name for path in dump_outputs(name, rows))
    for name, rows in (
        ("apartment_name_history_operational_v1", name_history),
        ("apartment_property_history_operational_v1", property_history),
    ):
        path = OUTPUT_DIR / f"{name}.csv"
        write_csv(path, rows)
        outputs.append(path.name)

    report = {
        "generated_at": datetime.now().isoformat(),
        "pipeline_version": PIPELINE_VERSION,
        "school_master": len(school_master),
        "apartment_complex_master": len(complex_master),
        "apartment_assignment_units": len(assignment_units),
        "complex_group_types": dict(sorted(Counter(row["group_type"] for row in complex_master).items())),
        "complex_review_required": sum(row["review_required"] for row in complex_master),
        "assignment_methods": dict(sorted(Counter(row["assignment_method"] for row in assignment_units).items())),
        "assignment_review_required": sum(row["review_required"] for row in assignment_units),
        "assignment_school_id_linked": sum(row["school_id"] is not None for row in assignment_units),
        "assignment_units_with_school_links": len({row["apt_cd"] for row in assignment_school_links}),
        "assignment_school_links": len(assignment_school_links),
        "school_apartment_serving": len(school_apartment_serving),
        "apartment_name_history": len(name_history),
        "apartment_property_history": len(property_history),
        "outputs": outputs,
    }
    report_path = OUTPUT_DIR / "operational_masters_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
