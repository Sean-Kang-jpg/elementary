"""Offline evidence audit. Raw source and institution joins stay in ignored runtime/.

No database writes. XLSX is parsed with the standard library; no Excel execution.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from academy_institutions import academy_entries, dojo_entries
from academy_subjects import classify

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ALIASES = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전",
    "울산광역시": "울산", "세종특별자치시": "세종", "세종시": "세종",
    "경기도": "경기", "강원특별자치도": "강원", "강원도": "강원",
    "충청북도": "충북", "충청남도": "충남", "전북특별자치도": "전북",
    "전라북도": "전북", "전라남도": "전남", "경상북도": "경북",
    "경상남도": "경남", "제주특별자치도": "제주", "제주도": "제주",
}
COURSE_FIELDS = ("LE_CRSE_LIST_NM", "LE_CRSE_NM", "PSNBY_THCC_CNTNT")
GRADE_PATTERNS = {
    "grade1_explicit_candidate": re.compile(
        r"초등(?:학교)?\s*1\s*학년|(?<![가-힣])초\s*1(?!\d)|"
        r"(?:영어|수학|논술|국어|미술|독서|과학|한자)초\s*1(?!\d)"),
    "lower_grade_candidate": re.compile(r"저학년"),
    "elementary_label": re.compile(r"초등"),
    "beginner_not_grade": re.compile(r"초급"),
}


def compact(value: str) -> str:
    return re.sub(r"[^가-힣a-z0-9]", "", unicodedata.normalize("NFKC", value or "").lower())


def name_key(value: str, loose: bool = False) -> str:
    value = re.sub(r"\(주\)|㈜|주식회사", "", value or "")
    result = compact(value)
    if loose:
        result = re.sub(r"(?:학원|교습소)$", "", result)
    return result


def region_key(value: str) -> str:
    value = (value or "").strip()
    return ALIASES.get(value, value)


def normalize_address(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").strip()
    for old, new in sorted(ALIASES.items(), key=lambda item: -len(item[0])):
        if value.startswith(old):
            return new + value[len(old):]
    return value


def address_keys(value: str) -> set[str]:
    """Full address plus road/lot building. Keep district and number separators.

    Floor/unit omissions may be bridged only when name+building is unique.
    A road number of 1 must never match 10 or 1-1.
    """
    value = normalize_address(value)
    value = re.sub(r"\([^)]*\)", "", value)
    keys = {"full:" + re.sub(r"\s+", "", value)} if value else set()
    road = re.search(r"[가-힣A-Za-z0-9·.]+(?:대로|로|길)\s*\d+(?:-\d+)?(?=\s|[,()]|$)", value)
    lot = re.search(r"[가-힣A-Za-z0-9·]+(?:동|리|가)\s*(?:산\s*)?\d+(?:-\d+)?(?=\s|[,()]|$)", value)
    for kind, match in (("road", road), ("lot", lot)):
        if match:
            keys.add(kind + ":" + re.sub(r"\s+", "", value[:match.end()]))
    return keys


def read_registration(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(x.itertext()) for x in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        cells = []
        for row in root.findall(".//s:sheetData/s:row", NS):
            values = {}
            for cell in row:
                col = re.sub(r"\d", "", cell.get("r", ""))
                val = cell.find("s:v", NS)
                if cell.get("t") == "s" and val is not None:
                    text = shared[int(val.text)]
                elif cell.get("t") == "inlineStr":
                    text = "".join(cell.find("s:is", NS).itertext())
                else:
                    text = val.text if val is not None else ""
                values[col] = text
            cells.append(values)
    header = next((i for i, row in enumerate(cells) if row.get("E") == "시설명" and row.get("D") == "시설 종류"), None)
    if header is None:
        raise ValueError("Unexpected registration XLSX headers")
    result = []
    for row in cells[header + 1:]:
        if not row.get("A") or not row.get("E"):
            raise ValueError("Missing registration sequence/name")
        # Do not carry operator names or registration plates into analysis outputs.
        result.append({"source_row": int(row["A"]), "region": row.get("B", ""),
                       "authority": row.get("C", ""), "institution_type": row["D"],
                       "name": row["E"], "address": row.get("G", ""),
                       "has_vehicle_information": bool((row.get("H") or "").strip())})
    if len({r["source_row"] for r in result}) != len(result):
        raise ValueError("Duplicate registration row numbers")
    return result


def grade_evidence(row: dict) -> dict:
    flags = {key: any(pattern.search(row.get(f) or "") for f in COURSE_FIELDS)
             for key, pattern in GRADE_PATTERNS.items()}
    tier = next((k for k in ("grade1_explicit_candidate", "lower_grade_candidate", "elementary_label") if flags[k]), "unknown")
    evidence = []
    if tier != "unknown":
        for field in COURSE_FIELDS:
            text = row.get(field) or ""
            match = GRADE_PATTERNS[tier].search(text)
            if match:
                evidence.append({"field": field, "snippet": text[max(0, match.start()-35):match.end()+65]})
    return {"tier": tier, "flags": flags, "evidence": evidence}


def load_masters(academy_path: Path, dojo_path: Path, care_path: Path) -> tuple[list[dict], dict]:
    raw = json.loads(academy_path.read_text(encoding="utf-8"))
    courses = {f"neis:{r['ATPT_OFCDC_SC_CODE']}-{r['ACA_ASNUM']}": r for r in raw}
    entries = academy_entries(raw)
    for item in entries:
        source = courses[item["institution_key"]]
        grade = grade_evidence(source)
        # Subject breakdown is needed only for institutions carrying grade evidence.
        subjects = classify(item["name"], item["realm"], item["institution_type"]) if grade["tier"] != "unknown" else []
        item.update(addresses=[item["road_address"]], grade=grade, subjects=subjects)
    dojo_raw = json.loads(dojo_path.read_text(encoding="utf-8"))
    by_key = {f"dojo:{r['source_id']}": r for r in dojo_raw}
    dojos = dojo_entries(dojo_raw)
    for item in dojos:
        source = by_key[item["institution_key"]]
        item.update(addresses=[source.get("road_address", ""), source.get("lot_address", "")],
                    grade={"tier": "unknown", "flags": {}, "evidence": []}, subjects=["sports"])
    care = json.loads(care_path.read_text(encoding="utf-8"))
    centers = [{"institution_key": f"care:{r['center_id']}", "source": "care", "name": r["name"],
                "institution_type": r["center_kind"], "region": r["region"],
                "addresses": [r.get("address", "")], "road_address": r.get("address", ""),
                "grade": {"tier": "unknown", "flags": {}, "evidence": []}, "subjects": []} for r in care]
    all_rows = entries + dojos + centers
    if len({r["institution_key"] for r in all_rows}) != len(all_rows):
        raise ValueError("Duplicate master institution keys")
    course_coverage = {}
    for group in ("학원", "교습소"):
        subset = [r for r in raw if r.get("ACA_INSTI_SC_NM") == group and r.get("REALM_SC_NM") != "직업기술"]
        course_coverage[group] = {"institutions": len(subset), "nonblank_fields": {
            field: sum(bool((r.get(field) or "").strip()) for r in subset) for field in COURSE_FIELDS}}
    return all_rows, {"academy_source_rows": len(raw), "dojo_source_rows": len(dojo_raw),
                      "care_source_rows": len(care), "course_source_coverage": course_coverage}


class Matcher:
    def __init__(self, masters: list[dict]):
        self.masters = {r["institution_key"]: r for r in masters}
        self.exact = defaultdict(set)
        self.loose = defaultdict(set)
        self.names = defaultdict(set)
        for row in masters:
            group = row["institution_type"]
            region = region_key(row["region"])
            key = row["institution_key"]
            self.names[(group, region, name_key(row["name"]))].add(key)
            for address in row["addresses"]:
                for addr in address_keys(address):
                    self.exact[(group, region, name_key(row["name"]), addr)].add(key)
                    self.loose[(group, region, name_key(row["name"], True), addr)].add(key)

    def match(self, row: dict) -> dict:
        group, region = row["institution_type"], region_key(row["region"])
        if group not in {"학원", "교습소", "거점형늘봄센터"}:
            return {"status": "outside_requested_source_types", "candidates": []}
        if not row.get("has_vehicle_information"):
            return {"status": "missing_vehicle_evidence", "candidates": []}
        for method, index, loose in (("name_address", self.exact, False), ("suffix_normalized_name_address", self.loose, True)):
            candidates = set()
            for addr in address_keys(row["address"]):
                candidates.update(index.get((group, region, name_key(row["name"], loose), addr), set()))
            if len(candidates) == 1:
                return {"status": "matched", "method": method, "institution_key": next(iter(candidates)), "candidates": sorted(candidates)}
            if len(candidates) > 1:
                return {"status": "ambiguous", "method": method, "candidates": sorted(candidates)}
        names = sorted(self.names.get((group, region, name_key(row["name"])), set()))
        return {"status": "name_only_address_unverified" if names else "unmatched", "candidates": names}


def ratio(numerator: int, denominator: int) -> float | None:
    return round(100*numerator/denominator, 2) if denominator else None


def audit(registration: list[dict], masters: list[dict], inventory: dict) -> tuple[dict, list[dict]]:
    matcher = Matcher(masters)
    # The public export contains two academy rows under literal '테스트시도'.
    # Keep them in source totals, but do not use them as real institutions.
    valid_regions = set(ALIASES.values())
    excluded = [r for r in registration if region_key(r["region"]) not in valid_regions]
    targets = [r for r in registration if r["institution_type"] in {"학원", "교습소", "거점형늘봄센터"}
               and region_key(r["region"]) in valid_regions]
    joined = [{**row, **matcher.match(row)} for row in targets]
    matched_keys = {r["institution_key"] for r in joined if r["status"] == "matched"}
    summary = {"inventory": inventory, "registration_rows": len(registration),
               "registration_types": dict(Counter(r["institution_type"] for r in registration)),
               "excluded_nonproduction_region_rows": len(excluded),
               "excluded_region_counts": dict(Counter(r["region"] for r in excluded)),
               "master_types": dict(Counter(r["institution_type"] for r in masters)),
               "by_type": {}, "grade_tiers": {}, "grade_flags_overlapping": {}, "grade_and_registration": {}}
    for group in ("학원", "교습소", "거점형늘봄센터"):
        source = [r for r in joined if r["institution_type"] == group]
        master = [r for r in masters if r["institution_type"] == group]
        found = {r["institution_key"] for r in source if r["status"] == "matched"}
        summary["by_type"][group] = {"registration_rows": len(source), "master_rows": len(master),
            "statuses": dict(Counter(r["status"] for r in source)),
            "matched_registration_rows": sum(r["status"] == "matched" for r in source),
            "matched_master_institutions": len(found),
            "comparison_available": bool(master),
            "registration_to_master_match_pct": ratio(sum(r["status"] == "matched" for r in source), len(source)) if master else None,
            "master_with_registration_pct": ratio(len(found), len(master)),
            "methods": dict(Counter(r.get("method", "") for r in source if r["status"] == "matched"))}
    for flag in GRADE_PATTERNS:
        subset = [r for r in masters if r["grade"]["flags"].get(flag)]
        summary["grade_flags_overlapping"][flag] = {"institutions": len(subset),
            "with_registration": sum(r["institution_key"] in matched_keys for r in subset),
            "by_type": dict(Counter(r["institution_type"] for r in subset))}
    for tier in ("grade1_explicit_candidate", "lower_grade_candidate", "elementary_label", "unknown"):
        rows = [r for r in masters if r["source"] == "neis" and r["grade"]["tier"] == tier]
        summary["grade_tiers"][tier] = len(rows)
        summary["grade_and_registration"][tier] = {"institutions": len(rows),
            "with_registration": sum(r["institution_key"] in matched_keys for r in rows),
            "by_type": {group: {"institutions": sum(r["institution_type"] == group for r in rows),
                "with_registration": sum(r["institution_type"] == group and r["institution_key"] in matched_keys for r in rows)} for group in ("학원", "교습소")},
            "subjects": dict(Counter(s for r in rows for s in r["subjects"]))}
    summary["sports"] = {"master_active_dojos": sum(r["source"] == "dojo" for r in masters),
                         "source_has_sports_category": False, "match_rate": None,
                         "reason": "SchoolSafe source has no sports-facility category; absence is not non-registration."}
    summary["care"] = {"master_rows": sum(r["source"] == "care" for r in masters),
                       "master_kinds": dict(Counter(r["institution_type"] for r in masters if r["source"] == "care")),
                       "hub_master_available": any(r["institution_type"] == "거점형늘봄센터" for r in masters)}
    care_rows = [r for r in masters if r["source"] == "care"]
    summary["care"]["hub_crosscheck_against_existing_care"] = []
    for hub in [r for r in targets if r["institution_type"] == "거점형늘봄센터"]:
        same_name = [r["institution_key"] for r in care_rows if name_key(r["name"]) == name_key(hub["name"])]
        same_address = [r["institution_key"] for r in care_rows if region_key(r["region"]) == region_key(hub["region"])
                        and any(address_keys(a) & address_keys(hub["address"]) for a in r["addresses"])]
        summary["care"]["hub_crosscheck_against_existing_care"].append(
            {"name": hub["name"], "region": hub["region"], "same_name_keys": same_name, "same_address_keys": same_address})
    summary["by_region"] = {}
    for region in sorted({r["region"] for r in targets}):
        subset = [r for r in joined if r["region"] == region]
        summary["by_region"][region] = {"registration_rows": len(subset), "matched": sum(r["status"] == "matched" for r in subset)}
    return summary, joined


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registration", type=Path, required=True)
    parser.add_argument("--academies", type=Path, required=True)
    parser.add_argument("--dojos", type=Path, required=True)
    parser.add_argument("--care", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    masters, inventory = load_masters(args.academies, args.dojos, args.care)
    registration = read_registration(args.registration)
    summary, joined = audit(registration, masters, inventory)
    summary["inputs"] = {k: {"file": v.name, "sha256": hashlib.sha256(v.read_bytes()).hexdigest()} for k, v in
                         {"registration": args.registration, "academies": args.academies, "dojos": args.dojos, "care": args.care}.items()}
    summary["source_url"] = "https://www.schoolsafe24.or.kr/front/scbus/scbusCmptncSchoolList.do?menuSn=170&upperMenuSn=146"
    summary["matching_scope"] = "Offline existing snapshots, exact type+province+normalized name+address/building only. Name-only candidates are not matched. Grade labels are candidates, not confirmed enrolment."
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, data in (("summary.json", summary), ("registration_joins.json", joined), ("master_grade_evidence.json", masters)):
        (args.output_dir/name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"registration_rows": len(registration), "by_type": summary["by_type"], "grade_tiers": summary["grade_tiers"]}, ensure_ascii=True))


if __name__ == "__main__":
    main()
