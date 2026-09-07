"""Build school, apartment, and regional insight clusters for report content."""

from __future__ import annotations

import csv
import json
import math
import random
import statistics
from collections import Counter, defaultdict
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "local_outputs_20260320"
SCHOOL_FILE = OUTPUT_DIR / "school_master_v2_20260320.csv"
SERVING_FILE = OUTPUT_DIR / "school_apartment_serving_v1.csv"
REPORT_JSON = OUTPUT_DIR / "report_cluster_insights.json"
REPORT_MD = BASE_DIR.parent / "docs" / "REPORT_CLUSTER_INSIGHTS_20260906.md"


FEATURES = (
    "grade1_students",
    "grade1_per_class",
    "complex_count",
    "assigned_households",
    "median_built_year",
    "median_parking_ratio",
    "public_rental_ratio",
)


def number(value: str | None) -> float | None:
    if value is None or value.strip() == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def pct(value: float, digits: int = 1) -> float:
    return round(value * 100, digits)


def load_rows() -> tuple[dict[str, dict], list[dict]]:
    with SCHOOL_FILE.open(encoding="utf-8-sig", newline="") as handle:
        schools = {row["school_id"]: row for row in csv.DictReader(handle)}
    with SERVING_FILE.open(encoding="utf-8-sig", newline="") as handle:
        serving = list(csv.DictReader(handle))
    return schools, serving


def aggregate_schools(schools: dict[str, dict], serving: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in serving:
        if row["school_id"] in schools:
            grouped[row["school_id"]].append(row)

    result = []
    for school_id, school in schools.items():
        rows = grouped.get(school_id, [])
        unique_complexes = {row["canonical_complex_id"] for row in rows}
        raw_households = [number(row["households"]) for row in rows]
        households = [value for value in raw_households if value is not None]
        years = [number(row["use_approval_year"]) for row in rows]
        parking = [number(row["parking_per_household"]) for row in rows]
        rental = [number(row["public_rental_ratio"]) for row in rows]
        years = [value for value in years if value is not None]
        parking = [value for value in parking if value is not None]
        rental = [value for value in rental if value is not None]
        address_parts = (school["address"] or school.get("address_old", "")).strip().split()
        region = address_parts[0] if address_parts else "미상"
        result.append(
            {
                "school_id": school_id,
                "school_name": school["school_name"],
                "region": region,
                "district": address_parts[1] if len(address_parts) > 1 else "",
                "grade1_students": number(school["grade1_students"]) or 0,
                "grade1_per_class": number(school["grade1_per_class"]),
                "grade1_classes": number(school["grade1_classes"]) or 0,
                "total_students": number(school["total_students"]) or 0,
                "complex_count": len(unique_complexes),
                "assigned_households": sum(households) if households else None,
                "serving_row_count": len(rows),
                "household_value_row_count": len(households),
                "median_built_year": median(years),
                "median_parking_ratio": median(parking),
                "public_rental_ratio": median(rental),
                "apartment_attribute_coverage": round(len(years) / len(rows), 3) if rows else 0,
            }
        )
    return result


def prepare_matrix(rows: list[dict]) -> tuple[list[list[float]], dict[str, tuple[float, float]]]:
    centers: dict[str, tuple[float, float]] = {}
    for feature in FEATURES:
        values = [row[feature] for row in rows if row[feature] is not None]
        center = statistics.median(values) if values else 0
        spread = statistics.pstdev(values) if len(values) > 1 else 1
        centers[feature] = (center, spread or 1)
    matrix = []
    for row in rows:
        matrix.append([(row[feature] if row[feature] is not None else centers[feature][0]) for feature in FEATURES])
    matrix = [[(value - centers[feature][0]) / centers[feature][1] for value, feature in zip(values, FEATURES)] for values in matrix]
    return matrix, centers


def distance(left: list[float], right: list[float]) -> float:
    return sum((a - b) ** 2 for a, b in zip(left, right))


def kmeans(matrix: list[list[float]], clusters: int = 5, iterations: int = 80) -> list[int]:
    random.seed(20260906)
    centers = [matrix[index][:] for index in random.sample(range(len(matrix)), clusters)]
    assignments = [0] * len(matrix)
    for _ in range(iterations):
        next_assignments = [min(range(clusters), key=lambda index: distance(row, centers[index])) for row in matrix]
        if next_assignments == assignments:
            break
        assignments = next_assignments
        for index in range(clusters):
            members = [row for row, assigned in zip(matrix, assignments) if assigned == index]
            if members:
                centers[index] = [sum(values) / len(values) for values in zip(*members)]
    return assignments


def profile(rows: list[dict], assignments: list[int]) -> list[dict]:
    profiles = []
    for cluster in sorted(set(assignments)):
        members = [row for row, assigned in zip(rows, assignments) if assigned == cluster]
        def avg(field: str) -> float:
            values = [row[field] for row in members if row[field] is not None]
            return round(statistics.mean(values), 1) if values else 0
        large = sum(row["grade1_students"] >= 80 for row in members)
        profiles.append(
            {
                "cluster": cluster,
                "school_count": len(members),
                "large_school_share": round(large / len(members), 3),
                "regions": dict(Counter(row["region"] for row in members)),
                "avg_grade1_students": avg("grade1_students"),
                "avg_grade1_per_class": avg("grade1_per_class"),
                "avg_complex_count": avg("complex_count"),
                "avg_assigned_households": avg("assigned_households"),
                "median_built_year": median([row["median_built_year"] for row in members if row["median_built_year"] is not None]),
                "median_parking_ratio": median([row["median_parking_ratio"] for row in members if row["median_parking_ratio"] is not None]),
                "median_public_rental_ratio": median([row["public_rental_ratio"] for row in members if row["public_rental_ratio"] is not None]),
                "top_schools": sorted(members, key=lambda row: (row["grade1_students"], row["assigned_households"] or 0), reverse=True)[:8],
            }
        )
    return profiles


def region_profiles(rows: list[dict]) -> list[dict]:
    result = []
    for region, members in sorted((key, list(group)) for key, group in __import__("itertools").groupby(sorted(rows, key=lambda row: row["region"]), key=lambda row: row["region"])):
        result.append({
            "region": region,
            "school_count": len(members),
            "large_school_share": round(sum(row["grade1_students"] >= 80 for row in members) / len(members), 3),
            "median_grade1_students": median([row["grade1_students"] for row in members]),
            "median_complex_count": median([row["complex_count"] for row in members]),
            "median_assigned_households": median([row["assigned_households"] for row in members if row["assigned_households"] is not None]),
            "median_built_year": median([row["median_built_year"] for row in members if row["median_built_year"] is not None]),
            "median_parking_ratio": median([row["median_parking_ratio"] for row in members if row["median_parking_ratio"] is not None]),
            "top_schools": sorted(members, key=lambda row: row["grade1_students"], reverse=True)[:5],
        })
    return result


def distribution(values: list[float], bins: list[tuple[str, float, float | None]], total_count: int) -> list[dict]:
    values = [value for value in values if value is not None]
    result = []
    assigned = 0
    for label, lower, upper in bins:
        count = sum(value >= lower and (upper is None or value < upper) for value in values)
        assigned += count
        result.append({"label": label, "count": count, "share": round(count / total_count, 3) if total_count else 0})
    unknown = total_count - assigned
    if unknown:
        result.append({"label": "정보 없음/해당 없음", "count": unknown, "share": round(unknown / total_count, 3) if total_count else 0})
    if result and total_count:
        result[-1]["share"] = round(1 - sum(item["share"] for item in result[:-1]), 3)
    return result


def regional_group_profiles(rows: list[dict]) -> list[dict]:
    bins = {
        "grade1_students": [("0-39명", 0, 40), ("40-79명", 40, 80), ("80-119명", 80, 120), ("120-199명", 120, 200), ("200명 이상", 200, None)],
        "assigned_households": [("1,000세대 미만", 0, 1000), ("1,000-2,999세대", 1000, 3000), ("3,000-4,999세대", 3000, 5000), ("5,000세대 이상", 5000, None)],
        "complex_count": [("0개/미연결", 0, 1), ("1-4개", 1, 5), ("5-9개", 5, 10), ("10-19개", 10, 20), ("20개 이상", 20, None)],
        "median_built_year": [("1999년 이전", 0, 2000), ("2000-2009년", 2000, 2010), ("2010-2019년", 2010, 2020), ("2020년 이후", 2020, None)],
        "median_parking_ratio": [("0.8대 미만", 0, 0.8), ("0.8-0.99대", 0.8, 1.0), ("1.0-1.19대", 1.0, 1.2), ("1.2대 이상", 1.2, None)],
    }
    result = []
    for region in sorted({row["region"] for row in rows}):
        region_rows = [row for row in rows if row["region"] == region]
        for group_name, group_rows in (("80명 이상", [row for row in region_rows if row["grade1_students"] >= 80]), ("80명 미만", [row for row in region_rows if row["grade1_students"] < 80])):
            result.append({
                "region": region,
                "group": group_name,
                "school_count": len(group_rows),
                "coverage": {
                    "no_serving_rows": sum(row["serving_row_count"] == 0 for row in group_rows),
                    "serving_without_household_value": sum(row["serving_row_count"] > 0 and row["household_value_row_count"] == 0 for row in group_rows),
                    "no_complex_connection": sum(row["complex_count"] == 0 for row in group_rows),
                },
                "distributions": {
                    feature: distribution([row[feature] for row in group_rows], feature_bins, len(group_rows))
                    for feature, feature_bins in bins.items()
                },
            })
    return result


def aggregate_complexes(schools: dict[str, dict], serving: list[dict]) -> list[dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in serving:
        if row["school_id"] in schools and row["canonical_complex_id"]:
            grouped[row["canonical_complex_id"]].append(row)
    result = []
    for complex_id, rows in grouped.items():
        first = rows[0]
        grade1 = [number(schools[row["school_id"]]["grade1_students"]) or 0 for row in rows]
        households = number(first["households"])
        built_year = number(first["use_approval_year"])
        parking = number(first["parking_per_household"])
        rental = number(first["public_rental_ratio"])
        result.append({
            "canonical_complex_id": complex_id,
            "complex_name": first["complex_name"],
            "region": first["region"],
            "district": first["district"],
            "households": households,
            "built_year": built_year,
            "parking_ratio": parking,
            "public_rental_ratio": rental,
            "assigned_school_count": len({row["school_id"] for row in rows}),
            "max_school_grade1_students": max(grade1) if grade1 else 0,
            "avg_school_grade1_students": statistics.mean(grade1) if grade1 else 0,
        })
    return result


def cluster_complexes(complexes: list[dict]) -> list[dict]:
    features = ("households", "built_year", "parking_ratio", "public_rental_ratio", "assigned_school_count", "max_school_grade1_students")
    valid = [row for row in complexes if row["households"] is not None and row["built_year"] is not None]
    centers = {}
    for feature in features:
        values = [row[feature] for row in valid if row[feature] is not None]
        centers[feature] = (statistics.median(values) if values else 0, statistics.pstdev(values) or 1)
    matrix = [[(row[feature] if row[feature] is not None else centers[feature][0] - centers[feature][0] + centers[feature][0] * 0) for feature in features] for row in valid]
    matrix = [[(value - centers[feature][0]) / centers[feature][1] for value, feature in zip(values, features)] for values in matrix]
    assignments = kmeans(matrix, clusters=4)
    for row, assigned in zip(valid, assignments):
        row["cluster"] = assigned
    profiles = []
    for cluster in sorted(set(assignments)):
        members = [row for row in valid if row["cluster"] == cluster]
        def med(feature: str) -> float | None:
            return median([row[feature] for row in members if row[feature] is not None])
        profiles.append({
            "cluster": cluster,
            "complex_count": len(members),
            "median_households": med("households"),
            "median_built_year": med("built_year"),
            "median_parking_ratio": med("parking_ratio"),
            "median_assigned_school_count": med("assigned_school_count"),
            "median_max_school_grade1_students": med("max_school_grade1_students"),
            "top_complexes": sorted(members, key=lambda row: (row["households"] or 0, row["max_school_grade1_students"]), reverse=True)[:8],
        })
    return profiles


def compact_school(row: dict) -> dict:
    return {key: row[key] for key in ("school_id", "school_name", "region", "district", "grade1_students", "complex_count", "assigned_households", "median_built_year", "median_parking_ratio", "public_rental_ratio")}


def compact_complex(row: dict) -> dict:
    return {key: row[key] for key in ("canonical_complex_id", "complex_name", "region", "district", "households", "built_year", "parking_ratio", "public_rental_ratio", "assigned_school_count", "max_school_grade1_students")}


def write_markdown(payload: dict) -> None:
    lines = [
        "# 수도권 초등학교 1학년 학령인구 클러스터 리포트",
        "",
        "> 2026-03-20 학교 통계와 운영 아파트 serving 스냅샷을 학교 단위로 집계하고, 학교 규모·배정 주거 규모·연식·주차·임대 비중을 표준화해 5개 군집으로 분류했다.",
        "",
        "## 콘텐츠로 쓸 수 있는 핵심 발견",
        "",
        "- 학교는 단순히 ‘1학년 80명 이상/미만’으로 나뉘지 않는다. 같은 큰 학교라도 대단지 집중형, 여러 단지 분산형, 구축 대단지형, 신축 고주차형이 서로 다르게 나타난다.",
        "- 지역 비교의 핵심은 평균 학생수가 아니라 ‘학교가 어떤 주거 집단을 모으는가’다. 배정 단지 수와 배정 세대수는 같은 학교 규모를 서로 다른 방식으로 만든다.",
        "- 카드뉴스의 가장 좋은 소재는 극단값보다 대비쌍이다. 학생수는 비슷하지만 연식·주차·단지 수가 다른 학교를 한 장에 배치하면 학군 내부 격차가 보인다.",
        "",
        "## 지역 × 학교 규모 분포",
        "",
        "지역별로 1학년 80명 이상 학교와 미만 학교를 나눈 뒤, 각 그룹 안에서 학교·배정 주거 구조의 분포를 비교했다.",
        "",
    ]
    for row in payload["regional_groups"]:
        lines.append(f"### {row['region']} · 1학년 {row['group']} · {row['school_count']:,}개 학교")
        lines.append(f"- 데이터 커버리지: serving 미연결 {row['coverage']['no_serving_rows']}개교 · 연결됐지만 세대수 없음 {row['coverage']['serving_without_household_value']}개교 · 단지 연결 0개 {row['coverage']['no_complex_connection']}개교")
        for feature, values in row["distributions"].items():
            lines.append("- " + feature + ": " + " · ".join(f"{item['label']} {item['count']}개교({pct(item['count'] / row['school_count'])}%)" for item in values))
        lines.append("")
    lines.extend(["## 학교 군집", ""])
    for row in payload["clusters"]:
        lines.extend([
            f"### 군집 {row['cluster']} · {row['school_count']}개 학교",
            "",
            f"- 1학년 평균 {row['avg_grade1_students']:.0f}명, 학급당 평균 {row['avg_grade1_per_class'] or 0:.1f}명",
            f"- 평균 배정 단지 {row['avg_complex_count']:.1f}개, 평균 배정 세대수 {row['avg_assigned_households'] or 0:.0f}세대",
            f"- 대표 연식 중앙값 {row['median_built_year'] or 0:.0f}년, 세대당 주차 중앙값 {row['median_parking_ratio'] or 0:.2f}대",
            f"- 1학년 80명 이상 학교 비중 {pct(row['large_school_share'])}%",
            "- 대표 학교: " + ", ".join(f"{school['school_name']}({school['grade1_students']:.0f}명)" for school in row["top_schools"][:5]),
            "",
        ])
    lines.extend([
        "## 단지 군집",
        "",
    ])
    for row in payload["complex_clusters"]:
        lines.extend([
            f"### 단지 군집 {row['cluster']} · {row['complex_count']:,}개 단지",
            "",
            f"- 세대수 중앙값 {row['median_households'] or 0:.0f}세대, 사용승인연도 중앙값 {row['median_built_year'] or 0:.0f}년",
            f"- 세대당 주차 중앙값 {row['median_parking_ratio'] or 0:.2f}대, 연결 학교 수 중앙값 {row['median_assigned_school_count'] or 0:.0f}개",
            f"- 연결 학교 중 최대 1학년 학생수 중앙값 {row['median_max_school_grade1_students'] or 0:.0f}명",
            "- 대표 단지: " + ", ".join(f"{complex_row['complex_name']}({complex_row['households'] or 0:.0f}세대)" for complex_row in row["top_complexes"][:5]),
            "",
        ])
    lines.extend([
        "## 인스타그램 캐러셀 구성안",
        "",
        "1. 표지: ‘같은 학군, 전혀 다른 초등학교 수요’",
        "2. 문제 제기: 1학년 학생수만으로는 학군의 주거 구조를 설명할 수 없다",
        "3. 지역 카드: 서울·경기·인천의 학교 규모와 배정 단지 구조 비교",
        "4. 군집 카드: 대단지 집중형 / 여러 단지 분산형 / 구축 대단지형 / 신축 고주차형 / 소규모 혼합형",
        "5. 사례 카드: 학생수는 비슷하지만 연식·주차·배정 단지가 다른 학교 두 곳 비교",
        "6. 결론: 학군 프리미엄은 공유되지만 주거 조건은 공유되지 않는다",
        "",
        "## 해석 주의",
        "",
        "학교 학생수는 학교 단위 통계이며 개별 단지에서 실제 유입된 학생수를 뜻하지 않는다. 아파트 속성은 결측을 포함하므로 표본 수와 기준일을 카드와 본문에 표시해야 한다. 군집은 탐색적 분류이며 인과관계를 의미하지 않는다.",
    ])
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    schools, serving = load_rows()
    rows = aggregate_schools(schools, serving)
    matrix, _ = prepare_matrix(rows)
    assignments = kmeans(matrix)
    for row, assigned in zip(rows, assignments):
        row["cluster"] = assigned
    payload = {
        "as_of": "2026-03-20",
        "method": "school-level aggregation + median imputation + population standardization + deterministic k-means",
        "school_count": len(rows),
        "serving_row_count": len(serving),
        "features": list(FEATURES),
        "regions": region_profiles(rows),
        "regional_groups": regional_group_profiles(rows),
        "clusters": [{**profile, "top_schools": [compact_school(school) for school in profile["top_schools"]]} for profile in profile(rows, assignments)],
        "complex_clusters": [{**profile, "top_complexes": [compact_complex(complex_row) for complex_row in profile["top_complexes"]]} for profile in cluster_complexes(aggregate_complexes(schools, serving))],
        "schools": [compact_school(row) | {"cluster": row["cluster"]} for row in rows],
    }
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(payload)
    print(json.dumps({"schools": len(rows), "serving_rows": len(serving), "regions": payload["regions"], "clusters": [{key: value for key, value in cluster.items() if key != "top_schools"} for cluster in payload["clusters"]]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()