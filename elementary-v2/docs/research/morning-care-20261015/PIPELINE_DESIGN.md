# 아침돌봄 ETL·백엔드 설계 v1

2026-10-15 설계 기준. 아래 내용은 조사 당시 명세다.
2026-10-16에 이 중 비공개 관측·근거 저장소와 40개교 시험 적재를 구축했다. 실제 구현·설계와의 차이·검증 기록은
[SCHEMA_PILOT_20261016.md](SCHEMA_PILOT_20261016.md)를 따른다. 공개 read model·자동 갱신 스케줄은 후속 범위다.

## 현재 코드와 DB에서 확인한 것

|구성|현재 역할|아침돌봄 관점의 빈칸|
|---|---|---|
|`etl/collect_care_data.py`|학교알리미 apiType=59 정형 통계, dadol 승인센터 수집. 기본 dry-run, apply 시 업서트 후 이전 스냅샷 제거|아침 전용 통계 없음. 센터의 일반 학기중 개장시각은 아침 지정서비스·동행 근거가 아님|
|`etl/audit_schoolinfo_daily_clock.py` + `etl/school_document_text.py`|학교알리미 첨부 다운로드/캐시, HWP·HWPX·PDF 텍스트 추출, 해시 인덱스|OCR·표 복원·기관별 홈페이지 구조는 별도 필요. 추출 성공과 필드 의미 확인은 별개|
|`etl/audit_schoolinfo_care_plans.py`|돌봄/늘봄 줄의 구간 탐지. 오전은 06:30 이후, 09:10 이하 종료 후보|같은 줄에 표제·시각이 있어야 하므로 두산 누락. ‘수업전’ 종료와 충돌·대상·정원·조건을 해결 못함|
|`etl/load_school_day_estimates.py`|확인된 review 세트를 SQL 26의 3개 테이블로 적재|아침 별도 상태 없음. 공통 `unknown/status/grades`로 오후·아침 근거를 혼합할 위험. 연도 상수 2026/입학 2027은 실운영 확정과 다름|
|`sql/23_create_care_serving.sql`|`school_care_statistics`, `care_centers`, 주변센터 RPC|거리만으로 동행·학교 매칭·선정 조건 판단 불가|
|`sql/26_create_school_day_estimates.sql`|`school_care_hours.morning_hours` 문자열과 돌봄 공통 학년|아침 상태·정원·신청·출처 URL·시간대별 구분·예외일 부족|
|`etl/run_due_etl.py` / `.github/workflows/etl-recurring.yml`|기본·학년별 학교정보, 아파트, 학원, 거래 소스 그룹|현재 source group에 care 없음. `collect_care_data.py`의 ‘월별 실행’ 주석과 실제 자동 스케줄은 다름|

운영 Supabase `elementary_v2.0`을 **SELECT**로 확인한 결과:

|테이블|행/시점|해석|
|---|---|---|
|`school_care_statistics`|6,266행, statistics_year 2026, snapshot 2026-10-07|전국 공시 통계. 아침 운영수 아님|
|`school_care_hours`|2,014행, source_year 2026, morning_hours 477행, 최근 검토 2026-10-11|전국 기존 추출 저장량|
|서울 `school_care_hours`|606행, morning_hours 411행, 공통 stated 453 / school_check_needed 153|학교별 현재 아침 운영확인률로 쓰지 않음|
|서울 `care_centers`|282행, capacity 269 / term_hours 251, snapshot 2026-10-07|일반 센터 데이터. 공식 아침 명단 30개와 분모·수집원·기준일이 다름|
|`etl_schedules`의 care/schoolinfo 검색|학교 기본·학년학생수 annual 2개만 확인, care 없음|아침 전용 자동 갱신 없음|

위 집계와 스키마 조회만 했다. 운영 적재기·일정·기존 review/프론트 파일을 변경하지 않았다.
일반 센터의 282행을 ‘서울 아침돌봄 282개소’로 표시하면 오류다.

## 저장 단위

`school_master`를 확장해 정책·시각을 한 행에 덮어쓰기보다 별도 서비스·증거 테이블을 둔다. 아래는 논리 테이블 이름이며 아직 migration 파일이 아니다.

|테이블|핵심 컬럼·키|역할|
|---|---|---|
|비공개 `care_service_sources`|`source_id` UUID PK; publisher, official_url, document_name, published_on, source_list_checked_at, fetched_at, checked_on, raw_sha256, text_sha256, parser_version, fetch_status, rights_note|불변 원문 스냅샷의 계보. 일자·원문·버전 변경을 구분|
|비공개 `care_services`|`service_id` UUID PK; service_type enum, provider_type enum, school_id FK nullable, center_id FK nullable, district_code, provider_external_id|학교 내, 키움 아침, 노선 동행을 다른 서비스로 관리. 문자열 이름을 운영 키로 쓰지 않음|
|비공개 `care_service_observations`|`observation_id` UUID PK; service_id FK, academic_year, service_calendar_year nullable, calendar_scope, valid_from/to, operation_status, plan_status, admission_status, reviewed_at, reviewer, review_state, supersedes_id|서비스의 기간별 판단. 정책 연도와 학교 학년도 분리. 원문 충돌·교체 이력 보존|
|비공개 `care_service_schedules`|`schedule_id` PK; observation_id FK, target_grades int[], weekdays int[], date_from/to, start/end time nullable, end_boundary text, time_status, place, capacity, capacity_qualifier|학년·요일·학기/방학·시각이 다르면 다른 행. 여러 구간을 한 최장시간으로 합치지 않음|
|비공개 `care_service_assertions`|`assertion_id` UUID PK; observation_id/schedule_id FK, field_name, value JSONB, source_id FK, page/line/table locator, evidence_excerpt, extraction_method, review_result|필드별 근거. ‘아침’ 표의 대상·정원을 검증한 뒤 채움|
|비공개 `school_service_links`|`service_id`, `school_id`, academic_year, valid_from/to, target_grades, weekdays, route_id, boarding_point, handoff_location, pickup_time, escort_status, link_status, source_id|센터·노선의 도착학교·이용조건 명시 매칭. 서비스 제공과 우리 학교까지 동행 가능을 분리|
|공개 `school_morning_care_summary`|school_id, academic_year, operation_status, plan_status, schedules[], application, sources[], checked_on, source_as_of, verification_basis, stale|검수·게시 상태를 통과한 최소 사실 read model. 원문 파일·개인 정보는 제외|

`care_services` 제약: school_morning_care는 school_id 필수, kium_morning_care는 매칭된 center_id 또는 확정 전 외부 시설 ID 필수.
`walking_school_bus`의 노선이 아직 없으면 학교별 동행 가능값을 생성하지 않는다. 동일 시설이 두 서비스를 운영하면 service_id는 각각 다르다.
센터 ID를 아직 매칭하지 못한 이번 연구 명단 30개는 외부 staging에 남기고 public FK 행을 가짜로 만들지 않는다.

관측 중복키는 `(service_id, academic_year/정책연도, calendar_scope, 유효기간, 원문해시)`를 기준으로 한다.
정규화한 시각만으로 중복 제거하지 않는다. 이전 연도·이전 원문을 삭제하는 전량 교체 로직을 이번 데이터에 재사용하지 않는다.

## 상태 전이·시각 제약

1. 수집·파싱·규칙/LLM 추출 결과는 항상 candidate로 시작한다. LLM은 없는 값을 보충하지 않고 필드별 근거 위치를 반환해야 한다.
2. `annual_plan`은 plan_status만 갱신한다. 현재 안내·기관 확인 등 범위가 맞는 근거를 검토한 뒤 실제 operation_status를 별도로 판정한다.
3. 미기재·404·요청 제한·추출 실패·빈 응답은 fetch/review 상태다. 미운영으로 바꾸지 않으며 직전 승인 관측을 삭제하지 않는다.
4. 명시 ‘미운영’도 적용 열을 확인한다. 선린의 방학 미운영은 학기중 운영 상태를 바꾸지 않는다. ‘맞춤형 미운영’도 아침에 전이하지 않는다.
5. `수업전`은 end_boundary로 남긴다. 수업 시작·권장 등교·교실 인계는 서로 다른 시각이다. 검증된 동일 연도·학년·요일 학교시정과 결합하기 전 종료시각을 계산하지 않는다.
6. 유효 시각은 00:00~23:59와 시작 < 종료. 아침으로 보기 어려운 시각·공휴일·수능일 예외는 review queue로 보낸다. 자동으로 09:00에 자르지 않는다.
7. `00명(예정)`, `○○`, 교실 2실, 학생 현황 10명·41명, 인력 1명은 모집 정원에서 제외한다. 정원 0과 미확인 null을 구분한다.
8. 현재 모집중 여부는 `admission_status=accepting/closed/waitlist/unknown`으로 운영 상태와 분리한다. 남은 자리 수는 공식 실시간 근거가 있을 때만 별도 기록한다.
9. 같은 적용범위·같은 시점의 출처가 충돌하면 `source_conflict`; 정정/추가공지가 종전 계획을 대체한다는 증거가 있을 때만 최신값을 승격한다. 검색 결과 날짜만으로 덮어쓰지 않는다.
10. 유효기간이 끝나거나 fresh 기준을 넘기면 stale를 켠다. 과거 확인 상태를 이력으로 보존하되 현재 조회에서 확인 상태로 재사용하지 않는다.

## 수집·검수·공개 흐름

```text
공식 출처 레지스트리 + 기존 첨부 probe/해시 인덱스
  → 접근 가능 여부·수집 정책 확인 → 원문 hash 캐시 재사용/변경분 수집
  → 텍스트 추출·표/단락 구간화 → 필드별 후보 + 근거 위치
  → 학년도·서비스·아침/오후·학기/방학 범위 검사
  → 검수 큐(미기재/충돌/OCR/조건/정원/학교매칭)
  → 승인 관측 이력 + 공개 read model 생성
  → 읽기 전용 조회·계수 QA → 원자적 snapshot 승격
```

서울 학교 홈페이지 공통 플랫폼은 기존 [2026-10-10 조사 결정](../../product/PLATFORM_EXPANSION_PLAN.md)에 자동 수집 제한이 기록돼 있다.
이번에 해당 플랫폼을 다시 크롤링하지 않았다. 허용된 학교알리미 경로를 우선 재사용하고, 학교 공지 원문은 허용 여부 확인 후 수집하거나
사람이 합법적으로 확인한 자료를 수동 등록한다. 접근 제한을 우회하는 수집기나 비공개·로그인 문서는 대상에 넣지 않는다.

기존 `fetch_text()`는 텍스트 계층이 있어도 표의 병합 셀 의미까지 보장하지 않는다. 자동화 확대 시 아침 표의 행/열 관계를 보존하는 파서를 먼저 적용한다.
스캔 PDF·HWP 이미지 표는 OCR 후보만 생성한다. 충돌·정원·동행 연결은 초기 단계에서 100% 검수하고, 자동 승인 성능은 별도 정답셋으로 측정한다.
40개 편의표본은 파서 타당성 검토용이며 성능 인증셋이 아니다.

비공개 staging은 원문과 검수정보를 보관하고 anon/authenticated에 쓰기·읽기 권한을 주지 않는다.
공개 스키마의 read model은 RLS와 명시 SELECT 권한을 적용하고 승인·유효 관측만 노출한다. 뷰를 쓸 경우 security_invoker와 하위 접근 범위를 함께 검증한다.
service_role은 ETL 실행 환경에만 둔다. 학생 이름·신청서·맞벌이 증빙·담당자 개인 연락처는 수집하지 않는다.
출처의 재배포 허용 범위를 검토하여 사실·원문 링크 중심으로 공개하고 원문 전체나 발췌를 그대로 노출하지 않는다.

## 갱신 주기 제안

|소스·시기|제안 주기|변경 판정·주의|
|---|---|---|
|2027 수요조사·정책, 2026년 11~12월|허용된 공식 출처 주 1회|수요·확충 목표와 확정 운영을 구분|
|새 학년 신청·추가모집, 1~3월|허용된 피드/공식 게시판 1일 1회; 제한 플랫폼은 수동 확인|신청 마감·학생 대상·적용연도 우선. 2027 확정 자료만 2027 관측 생성|
|학교알리미 15-라, 5월 공시 전후|공시 확인 뒤 변경분 수집; 이후 월 1회 목록 확인|기존 본문 재다운로드 대신 첨부 변경을 확인. FILE_SEQ를 버전 그 자체로 간주하지 않음|
|학기·방학 변경, 7~8월/12~2월|주 1회 및 변경 공지 시|방학 오전돌봄을 학기중 아침돌봄에 합치지 않음|
|키움 아침 서비스 목록|월 1회; 새 학기 주 1회|목록 전체 건수와 고유 시설 ID 계수. 삭제는 즉시 미운영 판정하지 않고 검수|
|자치구 동행 학교·노선|학기 시작 전·학기 중 월 1회|노선/정류장·학교·요일·대상 변경 확인|

이는 설계상 제안이며 새 자동화·알림을 등록하지 않았다. 초기에 학교 현재 안내의 fresh 기준은 90일, 센터/노선 목록 45일을 검토하되
원문의 명시적 유효기간·폐지 공지가 우선한다. 자동 만료는 운영 이력 삭제를 뜻하지 않는다.
이후 `etl_schedules`에 별도 source_name을 추가하고 run_due_etl source group·실행 로그·실패시 유지 로직·QA를 함께 구현해야 실제 자동 갱신이 된다.

## 조회 계약과 Track B 연결

논리 조회 입력은 `school_id`, `academic_year`, `on_date`(KST)다. 응답은 `school_morning_care`, `linked_kium_services[]`, `walking_school_bus[]`를 분리한다.
요청 연도 관측이 없으면 unknown 응답을 반환한다. 2026 값을 요청된 2027 학년도로 바꾸지 않는다. 과거 계획은 `reference_year=2026` 참고 구역으로만 반환한다.
근처 센터는 별도 후보이며 명시 school_service_link가 없으면 동행 가능 목록에 넣지 않는다.

현재 별도 트랙의 `src/types/morningCare.ts`와 문서 `TRACK_B_MORNING_CARE_20261015.md`를 읽어 연결 지점을 확인했다. 그 파일들은 수정하지 않았다.

|Track B 표시 모델|백엔드 변환 규칙|
|---|---|
|`operating`|유효기간 내 `confirmed_operating`이면서 게시 승인된 관측만|
|`reported`|게시 승인된 계획상 기재값. 실제 운영은 unknown으로 보존하고 `verification_basis=annual_plan` 제공|
|`not_operating`|같은 시간대·학년도 범위의 직접 미운영 근거가 있는 승인 관측만|
|`unknown`|자료 없음·미확인·충돌·범위 불일치·승인 안 됨. 원문이 있으면 별도 참고 정보 제공|
|`arrivalTime`|아침돌봄 종료가 아닌 학교의 명시 등교시각 근거. 이번 조사에는 없음|
|시각·학년·조건·확인일|아침 전용 검토 필드만 제공. 기존 공통 grades/status는 그대로 전이하지 않음|

이번 표본은 **research_only**여서 `reported` 화면으로도 자동 연결하지 않는다. 신규 공개 계약을 구현할 때 SQL·적재기·`src/types/index.ts`·`src/services/dataService.ts`를
함께 변경하고, 다중 구간을 단일 시각으로 손실시키지 않는 어댑터를 Track B에서 검증해야 한다. 기존 DB 문자열은 기존 어댑터 정책을 유지한다.

남산초는 중구 공식 동행 안내에 학교명이 있으므로 이후 `walking_school_bus`의 학교 연결 후보를 만들 수 있다.
이번에는 노선·인계 지점·학교별 시각·신청 조건이 없어 학교 아침돌봄의 동행값을 채우지 않았다.
