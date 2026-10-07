"""Watch for a new 학구도 release and, when it can be downloaded, prepare it for review.

학구도 is published every March and September on schoolzone.emac.kr (공공데이터 목록).
The list page reads fine from a script; the attachments did not download at all from
the site in October 2026 (scripts, an automated browser and the owner's own browser
all got the error page), so this cannot assume either way. Monthly, from the Windows
task (run_local_monthly_etl.ps1):

- no release newer than the one in use      -> nothing
- newer release, attachment still broken     -> one GitHub issue says so; later runs comment
- newer release, attachment downloads        -> unzip the shapefile and the school location
  file under etl/data/, run compare_school_zone_release.py, and put its counts in the
  issue. Nothing the ETL reads changes: promotion stays a reviewed step
  (docs/operations/ETL_SCHEDULING.md, "School Zones").

The release in use is the date folder build_local_assignment_etl.SHP points at.
"""

from __future__ import annotations

import http.cookiejar
import io
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
SITE = "https://schoolzone.emac.kr"
LIST_URL = f"{SITE}/publicData/publicDataList.do"
DOWNLOAD_URL = f"{SITE}/publicData/publicDataFileDownload.do"
REPOSITORY = "Sean-Kang-jpg/elementary"
LABEL = "school-zone-release"
ZONES_TITLE = "초등학교 통학구역 및 공동통학구역"
SCHOOLS_TITLE = "초중고 학교 위치"
REPORT = BASE_DIR / "runtime" / "school_zone_release_check.json"


def release_in_use() -> str:
    # Read the path without importing the builder (it needs shapely at import time).
    source = (BASE_DIR / "build_local_assignment_etl.py").read_text(encoding="utf-8")
    match = re.search(r'^SHP = .*?"(\d{8})"', source, re.M)
    if not match:
        raise SystemExit("cannot read the release in use from build_local_assignment_etl.SHP")
    return match.group(1)


def opener() -> urllib.request.OpenerDirector:
    built = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    built.addheaders = [("User-Agent", "Mozilla/5.0"), ("Referer", LIST_URL)]
    return built


def list_releases(session) -> list[dict]:
    with session.open(LIST_URL, timeout=60) as response:
        page = response.read().decode("utf-8", errors="replace")
    rows = []
    for match in re.finditer(r"fn_view_detail\(event, '(\d+)'\)(.*?)</tr>", page, re.S):
        body = match.group(2)
        title = " ".join(re.sub(r"<[^>]+>", " ", body).split())
        file = re.search(r'data-atchFileId="([^"]+)"\s+data-fileSn="(\d+)"', body)
        date = re.search(r"\((\d{4})\.(\d{2})\.(\d{2})\.?\)", title)
        if file and date:
            rows.append({"ntt_id": match.group(1), "file_id": file.group(1), "file_sn": file.group(2),
                         "release": "".join(date.groups()), "title": title})
    return rows


def latest(rows: list[dict], title: str) -> dict | None:
    matching = [row for row in rows if title in row["title"]]
    return max(matching, key=lambda row: row["release"]) if matching else None


def download(session, row: dict) -> bytes | None:
    """The zip, or None when the site answers with its error page."""
    query = urllib.parse.urlencode({"nttId": row["ntt_id"], "atchFileId": row["file_id"], "fileSn": row["file_sn"]})
    with session.open(f"{DOWNLOAD_URL}?{query}", timeout=600) as response:
        body = response.read()
    return body if body[:2] == b"PK" else None


def extract(body: bytes, target: Path) -> list[Path]:
    """Unzip, repairing Korean member names stored in cp949 without the UTF-8 flag."""
    target.mkdir(parents=True, exist_ok=True)
    written = []
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        for info in archive.infolist():
            name = info.filename
            if not info.flag_bits & 0x800:
                try:
                    name = name.encode("cp437").decode("cp949")
                except (UnicodeEncodeError, UnicodeDecodeError):
                    pass
            if info.is_dir():
                continue
            path = target / Path(name).name
            path.write_bytes(archive.read(info))
            written.append(path)
    return written


def gh(*args: str) -> str:
    result = subprocess.run(["gh", *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        raise RuntimeError(f"gh {' '.join(args[:2])} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def report_issue(release: str, body: str) -> str:
    """One open issue per release, found by its title; later runs comment on it.

    The label is created on first use. On 2026-10-08 GitHub answered 500 to every
    label and issue write for a while, so an issue without the label is better than
    none, and a failure here fails the step (the task then reports it).
    """
    title = f"학구도 새 판 {release[:4]}.{release[4:6]}.{release[6:]}"
    existing = gh("issue", "list", "--repo", REPOSITORY, "--state", "open",
                  "--search", f'"{title}" in:title', "--json", "number", "--jq", ".[0].number")
    if existing:
        gh("issue", "comment", existing, "--repo", REPOSITORY, "--body", body)
        return f"commented on #{existing}"
    try:
        gh("label", "create", LABEL, "--repo", REPOSITORY, "--color", "1D76DB", "--force",
           "--description", "학구도 새 판 공개·다운로드·배정 비교 알림")
    except RuntimeError:
        pass
    try:
        return gh("issue", "create", "--repo", REPOSITORY, "--label", LABEL, "--title", title, "--body", body)
    except RuntimeError:
        return gh("issue", "create", "--repo", REPOSITORY, "--title", title, "--body", body)


def main() -> None:
    in_use = release_in_use()
    session = opener()
    rows = list_releases(session)
    zones, schools = latest(rows, ZONES_TITLE), latest(rows, SCHOOLS_TITLE)
    result = {"in_use": in_use, "latest": zones["release"] if zones else None}
    if not zones:
        raise SystemExit(f"no '{ZONES_TITLE}' row on {LIST_URL}; the page layout may have changed")
    if zones["release"] <= in_use:
        result["status"] = "current"
    else:
        release = zones["release"]
        zone_zip = download(session, zones)
        school_zip = download(session, schools) if schools and schools["release"] == release else None
        if zone_zip is None:
            result["status"] = "published_not_downloadable"
            result["issue"] = report_issue(release, (
                f"학구도안내서비스에 {release} 판이 공개됐지만 첨부파일이 다운로드되지 않습니다(사이트 오류 페이지). "
                f"지금 쓰는 판은 {in_use}입니다.\n\n"
                f"목록: {LIST_URL} — \"{zones['title']}\"\n\n"
                "이 PC의 월간 작업이 매월 다시 확인하고, 받아지는 달에 자동으로 내려받아 배정 비교 보고서를 이 이슈에 남깁니다."
            ))
        else:
            zone_dir = BASE_DIR / "data" / "hakgudo" / release
            (zone_dir / f"elementary_hakgudo_{release}.zip").parent.mkdir(parents=True, exist_ok=True)
            (zone_dir / f"elementary_hakgudo_{release}.zip").write_bytes(zone_zip)
            shapefiles = [path for path in extract(zone_zip, zone_dir / "extracted") if path.suffix.lower() == ".shp"]
            if school_zip:
                school_dir = BASE_DIR / "data" / "schoolzone" / release
                (school_dir / f"school_location_{release}.zip").parent.mkdir(parents=True, exist_ok=True)
                (school_dir / f"school_location_{release}.zip").write_bytes(school_zip)
                extract(school_zip, school_dir / "extracted")
            if len(shapefiles) != 1:
                raise SystemExit(f"expected one shapefile in the {release} zone release, found {len(shapefiles)}")
            subprocess.run([sys.executable, str(BASE_DIR / "compare_school_zone_release.py"),
                            "--shp", str(shapefiles[0]), "--release", release], cwd=PROJECT_DIR, check=True)
            comparison = json.loads((BASE_DIR / "runtime" / f"school_zone_{release}" / "comparison.json").read_text(encoding="utf-8"))
            totals = comparison["totals"]
            lines = "\n".join(
                f"- {slug}: 학구 변경 {scope['zone_changed']:,}, 이름만 변경 {scope['zone_renamed_only']:,}"
                for slug, scope in comparison["scopes"].items() if scope["zone_changed"] or scope["zone_renamed_only"]
            ) or "- 변경 없음"
            result["status"] = "downloaded_and_compared"
            result["totals"] = totals
            result["issue"] = report_issue(release, (
                f"{release} 판을 내려받아 전 범위 점 배정을 다시 계산했습니다(지금 쓰는 판 {in_use}).\n\n"
                f"학구가 바뀌는 단지 {totals['zone_changed']:,}곳, 학구 이름만 바뀐 단지 {totals['zone_renamed_only']:,}곳.\n\n"
                f"{lines}\n\n"
                f"상세: `etl/runtime/school_zone_{release}/comparison.json`(이 PC). 학교 위치 파일: "
                f"{'함께 받음' if school_zip else '받지 못함'}.\n"
                "운영 반영은 검토 후 docs/operations/ETL_SCHEDULING.md \"School Zones\" 3단계로 합니다."
            ))
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
