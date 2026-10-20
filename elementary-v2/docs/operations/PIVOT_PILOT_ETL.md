# 어디초 2.0 파일럿 데이터 작업 (ETL)

컨셉: `docs/product/PIVOT_V2_CONCEPT.md`. 이 문서는 그 4절 범위(11개 지역, 3단계)를 채우는 데이터 작업만 다룬다.

## 작업 구분

- 브랜치 `claude/pivot-pilot-etl`, worktree `F:\sm\vibe\elementary\.worktrees\pivot-pilot-etl`. `master`에는 검토가 끝난 단위로만 합친다.
- 다른 팀원이 진행 중인 ETL과 파일을 나눈다. 2026-10-20 `master` 작업 트리에 미커밋으로 있는 아래 작업은 **이 브랜치에서 고치지 않는다**:
  - 아침돌봄 연구 — `etl/*morning_care_research*.py`, `sql/20261015*_morning_care_research*.sql`
  - 서울 gap37 — `etl/*seoul_gap37*.py`, `docs/research/seoul-gap37-20261019/`
  - 방과후 v3 추출·맞춤형 재추출 — `etl/load_school_afterschool.py`, `etl/llm_extraction_spec_custom.md`
  - transaction-identity — 브랜치 `codex/transaction-identity-etl`
- 적재기(`load_school_day_estimates.py`, `load_school_afterschool.py`)를 바꿔야 하면 그 팀원의 커밋이 들어온 뒤 그 위에서 바꾼다. 특히 `load_school_afterschool.py`는 지금 다른 작업 트리에서 수정 중이다.
- 새 파일은 이름에 `pivot`을 붙인다(`etl/*pivot*`, `docs/research/pivot/`).

## 범위와 공백 (2026-10-20 운영 DB)

`python -m etl.build_pivot_pilot_manifest`가 공개 계약(anon 키)만 읽어 학교별로 비어 있는 층을 적는다.
결과: `docs/research/pivot/pilot_manifest_20261020.json`.

| 단계 | 지역 | 학교 | 하교 예상 빔 | 돌봄 시간 빔 | 방과후 빔 |
| --- | --- | --- | --- | --- | --- |
| 1 | 성남 분당구 (운영 파일럿) | 38 | 13 | 0 | 38 |
| 1 | 위례 경기·강동 7곳 (운영 파일럿) | 7 | 2 | 0 | 6 |
| 1 | 강남 | 34 | 16 | 0 | 1 |
| 1 | 서초 | 23 | 16 | 0 | 0 |
| 1 | 송파 (위례 송파 5곳 포함) | 41 | 31 | 0 | 2 |
| 2 | 양천 | 30 | 15 | 0 | 4 |
| 2 | 노원 | 42 | 29 | 0 | 2 |
| 3 | 용인 수지구 | 32 | 10 | 0 | 32 |
| 3 | 안양 동안구 | 26 | 10 | 0 | 26 |
| 3 | 광명 | 25 | 8 | 0 | 25 |

합계 298개교. 지역은 도로명 주소로 고른다. 위례 12곳은 이름 목록 + 서울·성남·하남 주소로 고른다(천안에도 위례초등학교가 있다).

## 순서

1. **운영 파일럿 50곳 먼저** (분당 38 + 위례 12): 방과후 44곳(분당 38, 성남 위례 4, 하남 2), 하교 예상 빈 곳. 학원 전화·인터뷰가 시작되는 11월 전에 끝낸다.
2. 1단계 나머지 서울 3개 구: 하교 예상 63곳.
3. 2단계 양천·노원: 하교 예상 44곳.
4. 3단계 수지·동안·광명: 방과후 83곳, 하교 예상 28곳.

방법은 기존 경로를 쓴다. 하교는 학교알리미 2-가 시정표 → 규칙 추출 → 원문 검수 → `load_school_day_estimates.py`, 방과후는 15-라 운영계획 → 추출 → `load_school_afterschool.py`.
운영 적재(`--apply`)는 단계마다 사용자 확인 뒤에 한다.

## 열린 질문

- 하교 예상이 빈 학교가 '시정표 미탐지'인지 '아직 처리 안 함'인지 아직 구분하지 않았다. 1단계 착수 때 학교별 사유를 매니페스트에 더한다.
- 방과후 경기 추출은 서울과 문서 형식이 다를 수 있다. 분당 3~5곳으로 먼저 시험한다.
