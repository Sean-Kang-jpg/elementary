"""Profile the official KRIC urban rail station file before schema approval."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree


CAPITAL_REGIONS = ("서울특별시", "경기도", "인천광역시")
HEADER_ALIASES = {
    "station_number": ("역번호", "역사번호", "전철역코드", "역코드"),
    "station_name": ("역사명", "역명", "전철역명"),
    "line_number": ("노선번호", "노선코드"),
    "line_name": ("노선명", "호선명"),
    "operator_name": ("운영기관명", "운영기관", "철도운영기관명"),
    "latitude": ("역위도", "위도", "WGS84위도"),
    "longitude": ("역경도", "경도", "WGS84경도"),
    "road_address": ("역도로명주소", "도로명주소", "소재지도로명주소"),
    "transfer_flag": ("환승역여부", "환승여부"),
    "transfer_lines": ("환승노선", "환승노선명"),
    "source_date": ("데이터기준일자", "기준일자"),
}


def normalized_header(value: object) -> str:
    return re.sub(r"[\s_·ㆍ()（）/-]", "", str(value or "")).lower()


def normalized_station_name(value: object) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\([^)]*\)|（[^）]*）", "", text)
    text = re.sub(r"(?:역사|역)$", "", text)
    return re.sub(r"[\s.·ㆍ_-]", "", text).lower()


def resolve_columns(headers: list[str]) -> dict[str, str]:
    normalized = {normalized_header(header): header for header in headers}
    resolved: dict[str, str] = {}
    for field, aliases in HEADER_ALIASES.items():
        for alias in aliases:
            if normalized_header(alias) in normalized:
                resolved[field] = normalized[normalized_header(alias)]
                break
    required = {"station_number", "station_name", "line_name", "latitude", "longitude", "road_address"}
    missing = sorted(required - resolved.keys())
    if missing:
        raise ValueError(f"Required station columns not found: {', '.join(missing)}; headers={headers}")
    return resolved


def column_name(cell_reference: str) -> str:
    return "".join(character for character in cell_reference if character.isalpha())


def read_xlsx(path: Path) -> list[dict[str, str]]:
    namespace = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = ["".join(node.itertext()) for node in root.findall(f"{namespace}si")]

        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationship_targets = {
            node.attrib["Id"]: node.attrib["Target"]
            for node in relationships
        }
        first_sheet = workbook.find(f"{namespace}sheets/{namespace}sheet")
        if first_sheet is None:
            return []
        relationship_id = first_sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = relationship_targets[relationship_id].lstrip("/")
        sheet_path = target if target.startswith("xl/") else f"xl/{target}"
        sheet = ElementTree.fromstring(archive.read(sheet_path))

        rows: list[dict[str, str]] = []
        raw_rows: list[dict[str, str]] = []
        for row in sheet.findall(f".//{namespace}row"):
            values: dict[str, str] = {}
            for cell in row.findall(f"{namespace}c"):
                reference = column_name(cell.attrib.get("r", ""))
                value_node = cell.find(f"{namespace}v")
                inline_node = cell.find(f"{namespace}is")
                value = "" if value_node is None else value_node.text or ""
                if cell.attrib.get("t") == "s" and value:
                    value = shared_strings[int(value)]
                elif cell.attrib.get("t") == "inlineStr" and inline_node is not None:
                    value = "".join(inline_node.itertext())
                values[reference] = value.strip()
            if values:
                raw_rows.append(values)
        if not raw_rows:
            return rows
        ordered_columns = sorted(raw_rows[0], key=lambda item: (len(item), item))
        headers = {column: raw_rows[0].get(column, "") for column in ordered_columns}
        for raw in raw_rows[1:]:
            row = {header: raw.get(column, "") for column, header in headers.items() if header}
            if any(row.values()):
                rows.append(row)
        return rows


def read_rows(path: Path) -> list[dict[str, str]]:
    if path.suffix.lower() == ".xlsx":
        return read_xlsx(path)
    if path.suffix.lower() == ".csv":
        for encoding in ("utf-8-sig", "cp949"):
            try:
                with path.open(encoding=encoding, newline="") as handle:
                    return list(csv.DictReader(handle))
            except UnicodeDecodeError:
                continue
    raise ValueError("Input must be an XLSX or CSV file")


def number(value: object) -> float | None:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def region_for(address: str) -> str | None:
    return next((region for region in CAPITAL_REGIONS if address.startswith(region)), None)


def write_review_csv(path: Path, rows: Iterable[dict[str, object]]) -> None:
    materialized = list(rows)
    if not materialized:
        path.write_text("review_type\n", encoding="utf-8-sig")
        return
    headers = list(materialized[0])
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(materialized)


def profile(source: Path, output_dir: Path) -> dict[str, object]:
    rows = read_rows(source)
    if not rows:
        raise ValueError("Station source contains no data rows")
    columns = resolve_columns(list(rows[0]))

    canonical: list[dict[str, object]] = []
    for row_number, row in enumerate(rows, start=2):
        value = lambda field: str(row.get(columns.get(field, ""), "") or "").strip()
        address = value("road_address")
        region = region_for(address)
        if not region:
            continue
        latitude = number(value("latitude"))
        longitude = number(value("longitude"))
        coordinate_valid = latitude is not None and longitude is not None and 33 <= latitude <= 39 and 124 <= longitude <= 132
        canonical.append({
            "source_row": row_number,
            "region": region,
            "station_number": value("station_number"),
            "station_name": value("station_name"),
            "normalized_name": normalized_station_name(value("station_name")),
            "line_number": value("line_number"),
            "line_name": value("line_name"),
            "operator_name": value("operator_name"),
            "latitude": latitude,
            "longitude": longitude,
            "road_address": address,
            "transfer_flag": value("transfer_flag"),
            "transfer_lines": value("transfer_lines"),
            "source_date": value("source_date"),
            "coordinate_valid": coordinate_valid,
        })

    key_counts = Counter(
        (row["operator_name"], row["line_number"] or row["line_name"], row["station_number"])
        for row in canonical
    )
    name_groups: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in canonical:
        name_groups[str(row["normalized_name"])].append(row)

    reviews: list[dict[str, object]] = []
    for row in canonical:
        source_key = (row["operator_name"], row["line_number"] or row["line_name"], row["station_number"])
        reasons = []
        if not row["coordinate_valid"]:
            reasons.append("invalid_coordinate")
        if not row["station_number"]:
            reasons.append("missing_station_number")
        if key_counts[source_key] > 1:
            reasons.append("duplicate_source_key")
        if len(name_groups[str(row["normalized_name"])]) > 1:
            reasons.append("duplicate_normalized_name")
        if reasons:
            reviews.append({"review_type": "|".join(reasons), **row})

    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    valid_coordinates = sum(bool(row["coordinate_valid"]) for row in canonical)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_file": source.name,
        "source_sha256": digest,
        "source_rows": len(rows),
        "capital_region_rows": len(canonical),
        "rows_by_region": dict(Counter(str(row["region"]) for row in canonical)),
        "coordinate_valid_rows": valid_coordinates,
        "coordinate_completeness_pct": round(valid_coordinates / len(canonical) * 100, 2) if canonical else 0,
        "duplicate_source_key_groups": sum(count > 1 for count in key_counts.values()),
        "duplicate_normalized_name_groups": sum(len(group) > 1 for group in name_groups.values()),
        "transfer_flagged_rows": sum(bool(str(row["transfer_flag"]).strip()) and str(row["transfer_flag"]).strip() not in {"N", "아니오"} for row in canonical),
        "review_rows": len(reviews),
        "resolved_columns": columns,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "station_profile.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_review_csv(output_dir / "station_review_candidates.csv", reviews)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Official KRIC XLSX or CSV")
    parser.add_argument("--output-dir", type=Path, default=Path("etl/local_outputs/station_profile"))
    args = parser.parse_args()
    print(json.dumps(profile(args.source, args.output_dir), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
