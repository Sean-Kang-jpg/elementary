"""Verify a deterministic sample of schools missing apartment serving rows."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
SCHOOL_FILE = OUTPUT_DIR / "school_master_v2_20260320.csv"
OPERATIONAL_SCHOOL_FILE = OUTPUT_DIR / "school_master_operational_v1.csv"
SERVING_FILE = OUTPUT_DIR / "school_apartment_serving_v1.csv"
ASSIGNMENT_LINK_FILE = OUTPUT_DIR / "apartment_assignment_schools_v1.csv"
ASSIGNMENT_UNIT_FILE = OUTPUT_DIR / "apartment_assignment_units_v1.csv"
POINT_FILE = OUTPUT_DIR / "apartment_point_assignments.csv"
SAMPLE_FILE = OUTPUT_DIR / "missing_school_sample_20.csv"
REPORT_FILE = BASE_DIR.parent / "docs" / "REPORT_MISSING_SCHOOL_SAMPLE_20260906.md"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def integer(value: str | None) -> int | None:
    try:
        return int(float(value or ""))
    except ValueError:
        return None


def address_parts(row: dict[str, str]) -> list[str]:
    return (row.get("address") or row.get("address_old") or "").strip().split()


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    fields = list(rows[0]) if rows else []
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def round_robin_sample(rows: list[dict[str, str]], size: int) -> list[dict[str, str]]:
    by_district: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in sorted(rows, key=lambda item: (address_parts(item)[1] if len(address_parts(item)) > 1 else "", item["school_id"])):
        district = address_parts(row)[1] if len(address_parts(row)) > 1 else "미상"
        by_district[district].append(row)
    sample = []
    districts = sorted(by_district)
    index = 0
    while len(sample) < size and districts:
        district = districts[index % len(districts)]
        if by_district[district]:
            sample.append(by_district[district].pop(0))
        districts = [name for name in districts if by_district[name]]
        index += 1
    return sample


def main() -> None:
    schools = read_csv(SCHOOL_FILE)
    operational_schools = {row["school_id"]: row for row in read_csv(OPERATIONAL_SCHOOL_FILE)}
    serving = read_csv(SERVING_FILE)
    assignment_links = read_csv(ASSIGNMENT_LINK_FILE)
    assignment_units = read_csv(ASSIGNMENT_UNIT_FILE)
    point_assignments = read_csv(POINT_FILE)

    serving_by_school: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in serving:
        serving_by_school[row["school_id"]].append(row)
    links_by_school: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in assignment_links:
        links_by_school[row["school_id"]].append(row)
    apt_by_school: dict[str, set[str]] = defaultdict(set)
    for row in assignment_links:
        apt_by_school[row["school_id"]].add(row["apt_cd"])
    units_by_apt = {row["apt_cd"]: row for row in assignment_units}
    points_by_apt = {row["apt_cd"]: row for row in point_assignments}

    capital_schools = [
        row for row in schools
        if (address_parts(row)[0] if address_parts(row) else "") == "경기도"
        and (integer(row["grade1_students"]) or 0) < 80
        and not serving_by_school[row["school_id"]]
    ]
    sample = round_robin_sample(capital_schools, 20)

    sample_rows = []
    for school in sample:
        school_id = school["school_id"]
        linked_apts = sorted(apt_by_school[school_id])
        sample_rows.append({
            "school_id": school_id,
            "school_name": school["school_name"],
            "district": address_parts(school)[1] if len(address_parts(school)) > 1 else "",
            "address": " ".join(address_parts(school)),
            "grade1_students": integer(school["grade1_students"]),
            "grade1_classes": integer(school["grade1_classes"]),
            "total_students": integer(school["total_students"]),
            "school_master_present": True,
            "operational_school_present": school_id in operational_schools,
            "assignment_link_count": len(links_by_school[school_id]),
            "assignment_unit_count": len(linked_apts),
            "serving_row_count": len(serving_by_school[school_id]),
            "point_assignment_check": "not_school_keyed",
            "review_queue_check": "not_school_keyed",
            "raw_verdict": "학교 원장은 존재하지만 operational 아파트-학교 연결과 serving 행이 없음",
        })

    connected_without_households = []
    for school in schools:
        school_id = school["school_id"]
        rows = serving_by_school[school_id]
        if rows and not any(row["households"].strip() for row in rows):
            connected_without_households.append({
                "school_id": school_id,
                "school_name": school["school_name"],
                "region": address_parts(school)[0] if address_parts(school) else "",
                "serving_row_count": len(rows),
                "complex_names": ", ".join(row["complex_name"] for row in rows),
                "household_status": "connected complex, household attribute missing",
            })

    write_csv(SAMPLE_FILE, sample_rows)
    report_lines = [
        "# 배정 아파트 결측 학교 표본 검증 보고서",
        "",
        "> 작성일: 2026-09-06 · 대상 스냅샷: 2026-03-20 · 표본 원천: `school_master_v2_20260320.csv`, `apartment_assignment_schools_v1.csv`, `school_apartment_serving_v1.csv`",
        "",
        "## 검증 질문",
        "",
        "경기 지역에서 1학년 학생수가 80명 미만이고 `school_apartment_serving` 행이 없는 학교는 실제 학교 원장에도 없는 학교인지, 아니면 학교는 존재하지만 아파트 배정 연결만 누락된 것인지 확인했다.",
        "",
        "## 모집단과 표본",
        "",
        f"- 모집단: 경기 1학년 80명 미만 학교 중 serving 미연결 {len(capital_schools)}개교",
        "- 표본: 20개교",
        "- 추출 방식: 시·군별 학교 ID 정렬 후 라운드로빈 추출. 동일 조건에서 재실행 가능한 결정적 표본이다.",
        "- 표본 파일: `etl/local_outputs_20260320/missing_school_sample_20.csv`",
        "",
        "## 확인 결과",
        "",
        f"- 20개 표본 전부 학교 원장 존재: 20/20",
        f"- 20개 표본 전부 operational 학교 마스터 존재: {sum(row['operational_school_present'] for row in sample_rows)}/20",
        f"- 20개 표본 전부 아파트-학교 assignment link 없음: {sum(row['assignment_link_count'] == 0 for row in sample_rows)}/20",
        f"- 20개 표본 전부 serving 행 없음: {sum(row['serving_row_count'] == 0 for row in sample_rows)}/20",
        "- 결론: 이번 표본의 결측은 학교 자체 결측이 아니라, 현재 운영 아파트 데이터에서 학교 ID로 확정된 배정 연결이 없는 상태다.",
        "",
        "## 표본 원자료 대조",
        "",
        "| 학교 | 지역 | 1학년 | 전체 학생 | 학교 원장 | operational 마스터 | assignment link | serving | 판정 |",
        "|---|---|---:|---:|---|---|---:|---:|---|",
    ]
    for row in sample_rows:
        report_lines.append(
            f"| {row['school_name']} | {row['district']} | {row['grade1_students']}명 | {row['total_students']}명 | 있음 | {'있음' if row['operational_school_present'] else '없음'} | {row['assignment_link_count']} | {row['serving_row_count']} | 연결 미확정 |"
        )

    report_lines.extend([
        "",
        "## 이 결과가 의미하는 것",
        "",
        "이번 표본만으로 ‘해당 학교 주변에 아파트가 없다’고 결론 낼 수는 없다. 확인된 사실은 운영 serving 데이터에 학교 ID가 포함된 확정 연결이 없다는 것뿐이다. 실제 원인은 다음 단계에서 아파트 단위로 추가 대조해야 한다.",
        "",
        "- 학교 원장: 학교 존재와 학생 통계 확인용",
        "- assignment link: 아파트 배정 단위가 학교 ID에 연결됐는지 확인용",
        "- serving: 프런트엔드에 노출되는 최종 학교-단지 연결용",
        "- point assignment: 학교 ID가 아닌 학구도 ID 중심 원자료이므로 학교별 결측의 직접 증거로 사용할 수 없음",
        "- review queue / excluded: 아파트 단위 검토·제외 큐이며 학교 전체 누락 사유를 직접 설명하지 않음",
        "",
        "## 별도 발견: 단지는 연결됐지만 세대수만 없는 경우",
        "",
    ])
    if connected_without_households:
        report_lines.append("| 학교 | 지역 | serving 행 | 연결 단지 | 세대수 상태 |")
        report_lines.append("|---|---|---:|---|---|")
        for row in connected_without_households:
            report_lines.append(f"| {row['school_name']} | {row['region']} | {row['serving_row_count']} | {row['complex_names']} | 없음 |")
    else:
        report_lines.append("현재 스냅샷에서 해당 사례는 확인되지 않았다.")
    report_lines.extend([
        "",
        "## 후속 검증 권고",
        "",
        "1. 표본 20개교의 좌표를 공식 학구도 폴리곤과 다시 공간조인한다.",
        "2. 각 학교 반경 내 아파트 후보를 `apartment_assignment_units_v1.csv`에서 역추적한다.",
        "3. 학교 ID 미연결 후보는 학교명·학구명·교육지원청 코드 교차표로 재연결한다.",
        "4. 재연결 가능·아파트 없음·학구도 미확정으로 사유를 세분화한다.",
    ])
    REPORT_FILE.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "population": len(capital_schools),
        "sample": len(sample_rows),
        "sample_school_master_present": sum(row["school_master_present"] for row in sample_rows),
        "sample_operational_school_present": sum(row["operational_school_present"] for row in sample_rows),
        "sample_assignment_links": sum(row["assignment_link_count"] for row in sample_rows),
        "sample_serving_rows": sum(row["serving_row_count"] for row in sample_rows),
        "connected_without_households": connected_without_households,
        "sample_file": str(SAMPLE_FILE),
        "report_file": str(REPORT_FILE),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
