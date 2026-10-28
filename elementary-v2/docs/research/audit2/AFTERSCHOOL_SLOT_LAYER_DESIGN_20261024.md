# 방과후 시간대 층 설계 (2026-10-24)

상태: 설계와 빌더 코드(`etl/afterschool_slots.py`, 테스트 7개) 완료. 2026-10-28 블록 합치기·돌봄 운영 구간 제외 추가([분당·위례 맹검](AFTERSCHOOL_P1_BLIND_SLOT_CHECK_20261028.md)). SQL 38 초안, 운영 미적용. 근거: [시간대 정확도 측정](AFTERSCHOOL_V3_SLOT_AUDIT_20261024.md). 수집 기준: [파일럿 기준](../../operations/PIVOT_SLOT_STANDARD.md).

## 두 층

| 층 | 내용 | 정확도(서울 30개교) | 쓰는 곳 |
| --- | --- | --- | --- |
| 핵심층: 시간대 | 학교·요일별 1학년 시간 창 (맞춤형, 저학년 방과후 + 빗금으로 그리는 전학년·학년 미기재 방과후, 2026-10-24 추가) | 99.2%~100% (맞춤형·저학년만 측정) | 학교 상세 막대, 데리러 가는 시각, MY 시간표 계산 |
| 참고층: 강좌 | 강좌·반·대상 학년 (SQL 30 programs, 지금과 같음) | 96% | 강좌 목록, MY에서 시간대에 강좌명 붙이기 |

## 데이터 흐름

```
v3 추출 행 ─ afterschool_rules.resolve_period_slots ─ merge_terms ─┬─ programs (참고층, SQL 30·32)
                                                                   └─ afterschool_slots.school_slots ─ slots·checks (SQL 38)
```

`school_slots`가 만드는 것:

- **slots**: `(종류, 요일, 시작, 종료)`, 그 창의 강좌 이름들, `place`(돌봄내), `time_source`(plan / period_slot).
- **checks**: 사람이 볼 항목. `맞춤형시각없음`(맞춤형 행은 있는데 그 요일에 시각이 없음), `원문불일치`(지시서의 `conflicts`), `PDF원문`(요일·시각 짝이 어긋날 수 있는 유일한 경우).
- **status**: `ok` / `check` / `none`(원문에 1학년 시간대가 없음).

서울 30개교 v3 결과에 적용하면 ok 18, check 10(맞춤형 시각 없음 4, PDF뿐 6), none 2. 학교당 시간대 중앙값 13.

## 적재기 변경 (`etl/load_school_afterschool.py`)

1. 14칸 v3 행 읽기(P1 브랜치가 13칸을 넣어 둠, 그 위에 `place`).
2. 학교의 `period_slots`와 SQL 26 요일별 교시 수로 `resolve_period_slots`, 이어서 `merge_terms`.
3. programs는 지금처럼, 여기에 `place`·`time_source`(SQL 32).
4. `school_slots`로 slots·checks를 만들어 SQL 38 테이블과 `summary.slot_status`에 쓴다. 전체 교체 적재라 기존 안전장치(빠지는 학교가 있으면 중단)를 그대로 쓴다.

## 화면

- **학교 상세 '초1 오후 한눈에'**: 막대를 slots로 그린다. 저학년 방과후는 진한 막대, 맞춤형은 위 칸. `time_source = period_slot`은 '교시 기준 추정', `place = 돌봄내`는 '돌봄 이용 시'를 붙인다. `slot_status = check`면 확인 필요한 요일에 표시하고 이유를 한 줄로 쓴다. 테이블이 없으면 지금처럼 programs로 그린다.
- **MY 시간표**: 요일을 고르면 그날의 시간대가 먼저 나오고, 시간대를 고른 뒤 강좌명을 목록에서 고르거나 직접 적는다. 돌봄내 시간대를 고르면 `requiresCare`가 붙고 `careDependencyIssues`가 같은 요일 돌봄을 확인한다.

## 사람 확인

`school_afterschool_checks`의 미해결 항목을 학교알리미 15-라 링크와 함께 CSV로 뽑아 확인하고, 확인한 날을 `resolved_on`에 적는다. 파일럿 44곳 예상: 약 15곳, 학교당 1~5건.

## 순서

1. P1 브랜치 병합(적재기 13칸) → 적재기 14칸·규칙·slots 연결과 테스트.
2. 사용자 승인 뒤 SQL 32·38 적용.
3. 파일럿 44곳 적재 → 확인 목록 처리.
4. 화면을 slots로 전환(없으면 programs).
5. 서울 536곳은 v3로 다시 추출할 때 같은 경로로 바꾼다(지금 운영 데이터는 v2 계열이라 시간대만 다시 만들면 98.1% 수준).
