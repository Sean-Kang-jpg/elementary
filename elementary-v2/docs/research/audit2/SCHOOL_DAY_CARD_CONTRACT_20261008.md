# "초1 하루 예상" 카드 공개 데이터 계약 — 적용 전 영향 보고 (A2-R03)

2026-10-08. Audit 2 §11(적용 전 보고) 형식이다. **SQL은 초안이며 운영 DB에 적용하지 않았다.** 적용과 적재는 사용자 확인 후 진행한다.

## 무엇을 추가하나

[`sql/26_create_school_day_estimates.sql`](../../sql/26_create_school_day_estimates.sql) — 공개 읽기 테이블 3개.

| 테이블 | 행 | 내용 |
| --- | --- | --- |
| `school_day_estimates` | 학교당 1 (파일럿 35) | 1학년 4교시 종료·점심·5교시 종료, 점심 위치, 5교시 종료 추론 여부, 출처, 검수일 |
| `school_day_estimate_weekdays` | 학교 × 월~금 (175) | 교시 수, 예상 하교 시각, `inferred`(추정) / `school_check_needed`(학교 확인 필요) |
| `school_care_hours` | 학교당 1 (파일럿 60) | 오후돌봄 기본 종료, 저녁·연장 종료와 조건, 아침돌봄, 대상 학년, `stated` / `school_check_needed` |

적재: [`python -m etl.load_school_day_estimates`](../../etl/load_school_day_estimates.py). dry-run이 기본이며, 검수·확인을 마친 세 파일만 읽는다.
- [시정 검수](school_day_review_first_pass_20261007.json)
- [요일별 예상](grade1_dismissal_estimates_20261007.json)
- [돌봄 검수](care_review_first_pass_20261007.json)

보낼 행 전체를 SQL 26 제약과 같은 규칙으로 먼저 검사하고, 위반이 하나라도 있으면 아무것도 보내지 않는다. dry-run 결과는 35 / 175 / 60행이고 위반은 0이다. `etl.tests.test_load_school_day_estimates` 4개 PASS.

## 영향 범위

- **기존 테이블·함수·grant·RPC는 바꾸지 않는다.** serving 재구축(`refresh_school_apartment_serving`), 정기 ETL, 공개키, URL에 영향이 없다.
- 공개 데이터 계약이 3개 테이블만큼 늘어난다. 적용할 때 [DATA_CONTRACTS](../architecture/DATA_CONTRACTS.md)와 git root `CLAUDE.md`의 공개 테이블 목록을 함께 고친다.
- 프런트엔드는 R04에서 학교 상세가 이 테이블을 읽는다. 행이 없거나 조회가 실패하면 카드를 숨긴다(fail-open). 테이블이 적용되기 전에 배포해도 기존 화면은 그대로다.
- 공개되는 값은 학교 공시에서 온 학교 단위 시각·학년·조건 문구뿐이다. 개인정보는 없다. 공개될 자유 텍스트를 전수 확인했고, 담당자 이름이나 연락처는 없다(근거 문구는 검수 파일에만 있고 적재하지 않는다).

## 보안 (B03-W 범위)

- RLS를 켜고 SELECT 정책만 둔다. 쓰기는 `service_role`만 가능하다.
- B03 감사에서 Supabase 기본 권한이 새 테이블에 anon/authenticated 쓰기 grant를 준다는 점을 확인했다. SQL 26은 이 grant를 **명시적으로 회수**한 뒤 SELECT만 다시 준다. SQL 23은 회수하지 않고 RLS에만 의존한다.
- 적용 후 확인 항목:
  1. anon으로 3개 테이블 GET → 200과 행
  2. anon으로 POST·PATCH·DELETE → 401 또는 403, 201/204가 나오면 안 됨
  3. `verify_read_roles.sql` 방식의 READ ONLY 역할 모사로 anon·authenticated의 SELECT 가능과 쓰기 grant 부재 확인
  4. 적재 후 행 수 35 / 175 / 60
- B03-W가 요구한 "별도 테스트 DB에서의 관리자/owner/non-owner 쓰기 검증"은 사용자 소유 데이터가 생기는 테이블(로그인·MY, S04 이후)에서 필요하다. 이 세 테이블은 사용자 쓰기가 없는 공개 읽기 전용이라 위 확인으로 대신한다.

## 적용 순서와 복구

1. 사용자 확인 → Supabase SQL Editor에서 SQL 26 실행
2. 위 확인 1~3
3. `python -m etl.load_school_day_estimates`(dry-run) → `--apply`
4. 확인 4, 공개 키로 표본 학교 조회
5. R04 카드 구현·배포(별도 확인)

복구: 화면 노출은 R04 배포를 되돌리면 사라진다. 데이터는 `TRUNCATE`하거나, 세 테이블 모두 다른 객체가 참조하지 않으므로 `DROP TABLE school_day_estimate_weekdays, school_day_estimates, school_care_hours`로 지운다. 기존 데이터에는 영향이 없다.

## 갱신

값은 2026학년도 공시와 NEIS 실적이며, 2027 입학생에게는 예상으로 보인다. [연도 간 비교](YEAR_OVER_YEAR_STABILITY_20261008.md)에서 요일 패턴 94%, 시정표 96%가 그대로였다. 다음 갱신은 2027년 2월 1기 가정통신문(확정값, E04-d)과 2027년 4~5월 학교알리미 공시다. 정기 ETL에는 아직 넣지 않는다. 파일럿 범위를 넓힐 때 검수 절차와 함께 넣는다.
