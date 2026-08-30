"""Download the latest K-apt weekly basic-information attachment."""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path


BASE_URL = "https://www.k-apt.go.kr"
LIST_PATH = "/web/board/webReference/boardList.do?boardType=03&scodeT=03"
OUTPUT_DIR = Path(__file__).resolve().parent / "local_outputs_20260320"
USER_AGENT = "Mozilla/5.0 (compatible; elementary-v2-etl/1.0)"


def latest_attachment(page: str) -> tuple[str, str]:
    pattern = re.compile(
        r"K-apt\s+관리비공개의무단지\s+기본정보\((\d{4}\.\d{2}\.\d{2})\.\)"
        r"[\s\S]*?fileDown\('(\d+)','03','1'\)",
    )
    match = pattern.search(page)
    if not match:
        raise RuntimeError("latest K-apt basic-information attachment was not found")
    return match.group(1).replace(".", ""), match.group(2)


def csrf_token(page: str) -> str:
    match = re.search(r'name="_csrf"\s+content="([^"]+)"', page)
    if not match:
        raise RuntimeError("K-apt CSRF token was not found")
    return match.group(1)


def filename_from_headers(headers: object, snapshot_date: str) -> str:
    disposition = str(headers.get("Content-Disposition", ""))
    encoded = re.search(r"filename\*=UTF-8''([^;]+)", disposition, re.IGNORECASE)
    plain = re.search(r'filename="?([^";]+)', disposition, re.IGNORECASE)
    if encoded:
        return urllib.parse.unquote(encoded.group(1))
    if plain:
        return plain.group(1)
    return f"kapt_basic_{snapshot_date}.xlsx"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    headers = {"User-Agent": USER_AGENT}
    list_url = f"{BASE_URL}{LIST_PATH}"
    with opener.open(urllib.request.Request(list_url, headers=headers), timeout=30) as response:
        page = response.read().decode("utf-8", errors="replace")

    token = csrf_token(page)
    ajax_url = f"{BASE_URL}/web/board/webReference/boardListAjax.do"
    ajax_body = urllib.parse.urlencode(
        {"scode": "01", "boardType": "03", "pageNo": "1", "stype": "", "keyword": "", "_csrf": token}
    ).encode("ascii")
    ajax_request = urllib.request.Request(
        ajax_url,
        data=ajax_body,
        headers={
            **headers,
            "Referer": list_url,
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRF-TOKEN": token,
        },
    )
    with opener.open(ajax_request, timeout=30) as response:
        attachment_list = response.read().decode("utf-8", errors="replace")

    try:
        snapshot_date, board_seq = latest_attachment(attachment_list)
    except RuntimeError:
        debug_path = args.output_dir / "kapt_board_list_debug.html"
        debug_path.write_text(attachment_list, encoding="utf-8")
        raise RuntimeError(f"latest attachment was not found; response saved to {debug_path}")
    download_url = f"{BASE_URL}/board/getFileDownload.do?seq={board_seq}&boardType=03"
    body = urllib.parse.urlencode({"file_num": "1"}).encode("ascii")
    request = urllib.request.Request(
        download_url,
        data=body,
        headers={
            **headers,
            "Referer": list_url,
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRF-TOKEN": token,
        },
    )
    with opener.open(request, timeout=60) as response:
        payload = response.read()
        content_type = response.headers.get_content_type()
        source_filename = filename_from_headers(response.headers, snapshot_date)

    if content_type.startswith("text/") or payload.lstrip().startswith(b"<"):
        message = payload[:500].decode("utf-8", errors="replace")
        raise RuntimeError(f"K-apt returned {content_type}: {message}")

    output_path = args.output_dir / f"kapt_basic_{snapshot_date}.xlsx"
    output_path.write_bytes(payload)
    report = {
        "downloaded_at": datetime.now().isoformat(),
        "snapshot_date": snapshot_date,
        "board_seq": board_seq,
        "content_type": content_type,
        "bytes": len(payload),
        "source_filename": source_filename,
        "output": output_path.name,
    }
    report_path = args.output_dir / f"kapt_board_snapshot_{snapshot_date}_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
