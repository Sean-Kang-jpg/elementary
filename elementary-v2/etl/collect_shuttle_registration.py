"""Download the public SchoolSafe XLSX using its published search form.

Raw files belong in ignored runtime/shuttle, not in the public serving layer.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from audit_shuttle_registration import read_registration

LIST_URL = "https://www.schoolsafe24.or.kr/front/scbus/scbusCmptncSchoolList.do?menuSn=170&upperMenuSn=146"
EXCEL_URL = "https://www.schoolsafe24.or.kr/front/scbus/scbusCmptncExcelList.do"


def collect(output: Path) -> dict:
    params = {"menuSn": "170", "upperMenuSn": "146", "pageIndex": "1", "listType": "LIST",
              "schlCd": "", "excelDown": "", "searchRgnSeCd": "", "searchCmptncSeCd": "",
              "searchFcltNm": "", "searchFcltSeCd": ""}
    request = urllib.request.Request(EXCEL_URL, data=urllib.parse.urlencode(params).encode(),
                                    headers={"User-Agent": "Mozilla/5.0", "Referer": LIST_URL})
    with urllib.request.urlopen(request, timeout=120) as response:
        content = response.read()
        headers = {"content_type": response.headers.get("Content-Type"),
                   "content_disposition": response.headers.get("Content-Disposition")}
    if not content.startswith(b"PK"):
        raise ValueError("Download did not return an XLSX ZIP file")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".download.xlsx")
    temporary.write_bytes(content)
    rows = read_registration(temporary)
    if not rows:
        raise ValueError("Downloaded registration workbook is empty")
    temporary.replace(output)
    metadata = {"downloaded_at_utc": datetime.now(timezone.utc).isoformat(), "url": EXCEL_URL,
                "list_url": LIST_URL, "params": params, **headers, "bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(), "parsed_institutions": len(rows)}
    output.with_suffix(".metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = collect(args.output)
    print(json.dumps({"bytes": result["bytes"], "parsed_institutions": result["parsed_institutions"]}))


if __name__ == "__main__":
    main()
