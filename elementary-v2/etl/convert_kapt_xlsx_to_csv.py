"""Convert a K-apt weekly XLSX snapshot to a UTF-8 CSV without Excel dependencies."""

from __future__ import annotations

import argparse
import csv
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference)
    if not letters:
        return 0
    result = 0
    for char in letters.group(0):
        result = result * 26 + ord(char) - 64
    return result - 1


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(node.text or "" for node in item.iter(f"{NS}t")) for item in root]


def cell_value(cell: ET.Element, strings: list[str]) -> str:
    if cell.get("t") == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{NS}t"))
    value = cell.find(f"{NS}v")
    if value is None or value.text is None:
        return ""
    if cell.get("t") == "s":
        return strings[int(value.text)]
    return value.text


def rows(archive: zipfile.ZipFile, strings: list[str]):
    with archive.open("xl/worksheets/sheet1.xml") as handle:
        for _, element in ET.iterparse(handle, events=("end",)):
            if element.tag != f"{NS}row":
                continue
            values: dict[int, str] = {}
            for cell in element.findall(f"{NS}c"):
                values[column_index(cell.get("r", "A1"))] = cell_value(cell, strings)
            width = max(values, default=-1) + 1
            yield [values.get(index, "") for index in range(width)]
            element.clear()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    output = args.output or args.input.with_suffix(".csv")

    with zipfile.ZipFile(args.input) as archive, output.open("w", encoding="utf-8-sig", newline="") as handle:
        source_rows = rows(archive, shared_strings(archive))
        header = next(source_rows)
        while "단지코드" not in header or "단지명" not in header:
            header = next(source_rows)
        writer = csv.writer(handle)
        writer.writerow(header)
        count = 0
        for row in source_rows:
            writer.writerow(row + [""] * (len(header) - len(row)))
            count += 1

    print(f"rows={count:,} columns={len(header)} output={output}")
    print("headers=" + " | ".join(header))


if __name__ == "__main__":
    main()
