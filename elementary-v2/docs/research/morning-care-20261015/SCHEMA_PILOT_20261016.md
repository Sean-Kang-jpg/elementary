# 아침돌봄 비공개 스키마·40개교 시험 적재 완료

완료 확인일: **2026-10-16, Asia/Seoul**. 대상 Supabase는 `elementary_v2.0`이다.
2026-10-15에 기본 스키마와 표본을 적재했고, 10월 16일 인덱스를 보완한 뒤 최종 검증했다.
앞서 마지막 계수 조회는 사용량 한도로 자동 승인 검토가 완료되지 않아 실행되지 않았으며, 재개 후 같은 조회가 정상 실행됐다.

## 실제 구축 범위

`care_research` 비공개 스키마에 다음 8개 테이블을 구축했다.

|테이블|역할|표본 적재 후 행|
|---|---|---:|
|`ingestion_batches`|입력 해시·적재 버전·표본 크기 기록|1|
|`care_services`|학교 내 아침돌봄·키움 아침·통학 동행의 서비스 식별|40|
|`care_service_sources`|공식 원문 URL·문서명·원문/텍스트 해시·검토일|72|
|`care_service_observations`|학년도·범위·계획/실운영 상태·신청 조건·검토 상태|40|
|`care_service_schedules`|시작·종료·학년·요일·정원·충돌 후보|40|
|`observation_sources`|학교 관측에 귀속되는 전체 첨부 관계|72|
|`care_service_assertions`|필드별 값·출처·근거 줄·발췌|283|
|`school_service_links`|센터/노선→학교의 명시적 동행 연결|0|

이번에는 기존 40개교 `school_morning_care`만 적재했다. 정책 명단의 센터를 가짜 시설 ID로 생성하거나
인접 학교에 자동 연결하지 않았다. 모든 관측은 `operation_status=unknown`, `escort_status=unknown`, `publication_state=research_only`, 학년도 2026이다.
계획은 planned 27 / conditional 2 / not_found 11이고, 실제 운영 미확인은 그대로 보존했다.
요일은 전부 null이며 `term_weekday` 조사 범위만으로 월~금을 자동 입력하지 않았다.

시각·대상·정원 확보량도 원본과 일치했다: 시작 28, 종료 27, 대상학년 24, 정원 7.
화일의 시작시각 충돌과 초당·방이의 ‘수업전’은 보류/경계 표현으로 남아 있다.

## 적용 파일과 DB 이력

세 파일은 Supabase CLI `2.81.3 migration new`로 생성한 이름을 보존하여 기존 저장소 관례인 `sql/`에 두었다.
실제 DB는 Supabase migration 도구로 적용했다. CLI 파일 생성시각과 원격 적용시각은 다르므로 아래 대응표로 추적한다.

|저장소 파일|원격 migration version / name|
|---|---|
|[20261015121243_create_morning_care_research.sql](../../../sql/20261015121243_create_morning_care_research.sql)|`20261015121639 / create_morning_care_research`|
|[20261015202136_index_morning_care_research_foreign_keys.sql](../../../sql/20261015202136_index_morning_care_research_foreign_keys.sql)|`20261015202142 / index_morning_care_research_foreign_keys`|
|[20261015202439_allow_partial_morning_care_schedule_fields.sql](../../../sql/20261015202439_allow_partial_morning_care_schedule_fields.sql)|`20261015202510 / allow_partial_morning_care_schedule_fields`|

기본 스키마 → 인덱스 보완 → 시각 미기재 제약 보완 순서로 적용한다. 이미 적용된 DB에 CREATE SCHEMA 파일을 다시 실행하지 않는다.
기본 파일은 기존 공개 테이블을 참조하는 외래키만 추가하며 공개 테이블의 정의·행·권한을 바꾸지 않는다.

## 적재기와 재현 절차

[etl/load_morning_care_research.py](../../../etl/load_morning_care_research.py)는 기본값이 dry-run인 **검증·SQL 생성기**다.
네트워크·인증키·공개 API를 사용하지 않는다. 기존 연구 JSON을 검증하고 비공개 영역에 실행할 한 트랜잭션 SQL을 만든다.

```powershell
# elementary-v2/에서 실행
python -m etl.load_morning_care_research
python -m etl.load_morning_care_research --write-sql
python -m unittest etl.tests.test_load_morning_care_research etl.tests.test_morning_care_research etl.tests.test_schoolinfo_care_plans etl.tests.test_collect_care_data
```

생성 SQL은 git 제외 경로 `etl/runtime/morning-care/sample_load.sql`이다. SQL은 검토 후 승인된 DB 연결/SQL 편집기/connector로 실행한다.
현재 공개 Data API에 private schema를 추가하거나 브라우저 클라이언트에 service_role 키를 넣는 방식으로 실행하지 않는다.

재현 단계:

1. 입력 `school_sample.json`의 학년도·상태·출처·근거 참조를 검증한다.
2. `--write-sql`로 SQL을 생성하고 변경분을 확인한다. 다른 스냅샷은 `--sample PATH --dataset-key KEY`로 구분한다.
3. 대상 스키마·migration 이력을 확인한 후 생성 SQL을 실행한다.
4. [DB 통합검증 SQL](../../../sql/verify_morning_care_research.sql)을 실행한다. 이 파일은 고정된 40개교 파일럿 회귀검사이며 테스트 변경을 ROLLBACK한다.
5. 계수·권한·advisors 결과를 실행 기록으로 보존한다. 향후 다른 자료를 적재한 뒤에는 고정 계수 40/72/283을 그대로 전수 QA 기준으로 사용하지 않는다.

현재 loader는 `morning-care-research-v1`, 학교알리미 annual_plan, 실운영/동행 미확인 관측만 받는다.
학교/학년도 변경, 다른 학교의 근거 참조, 텍스트 범위를 벗어난 줄, 빈 스냅샷, 임의 공개 상태 승격은 거부한다.
현재 SQL의 학교 검증 범위는 **서울**이다. 전국 확대는 지역 검증 정책과 QA를 먼저 확장해야 한다.

## 중복·이력 보존

- 입력을 안정적인 JSON으로 정규화한 SHA-256과 dataset_key를 배치 키로 사용한다.
- 같은 입력을 두 번 실행한 결과 동일 batch ID, 배치 1개·관측 40개·근거 283개로 유지됐다.
- 입력이 바뀌면 새 배치가 생성된다. 이전 관측·출처를 삭제하거나 덮어쓰지 않는다.
- 테이블 적재와 계수 검증은 한 트랜잭션이다. 학교 ID/지역이나 최종 계수가 맞지 않으면 전체 롤백한다.
- 동일 dataset_key의 동시 적재는 transaction advisory lock으로 직렬화한다.

이번 입력 payload SHA-256은 `ebf12548356480acce94be03245ce21b516ffff9d5ef49e20a685d12b070c3d4`이며
배치 ID는 `a44487ea-c6b9-42b4-83fc-d2334c5ae09c`다. 입력 해시·DB ID는 실행 기록이며 migration SQL에 하드코딩하지 않았다.

## 권한·DB 제약 검증

8개 테이블 모두 RLS를 활성화했고 PUBLIC·anon·authenticated의 스키마/테이블 접근을 제거했다.
service_role에는 SELECT·INSERT만 명시적으로 부여했다. 새 public RPC나 뷰·공개 읽기 테이블은 만들지 않았다.

실제 DB에서 **19개 제약·권한 검사**가 통과했다.

- annual_plan을 confirmed_operating으로 바꾸는 입력, research_only를 published로 바꾸는 입력 거부
- 역전 시각, 24:00, 정원 0, 학년 0, 충돌 시각의 무근거 확정 거부
- 다른 학교의 원문 근거와 다른 관측의 시간표를 연결하는 입력 거부
- anon·authenticated 각각 SELECT/INSERT/UPDATE/DELETE 거부
- service_role의 표본 읽기 성공
- 시각이 없어도 별도 근거가 있는 대상학년·정원 저장 성공. 제약 보완 migration으로 시각 확보 상태와 다른 필드를 분리했다.

Python **22개 테스트**도 통과했다. 변경 입력의 새 해시, 같은 입력의 동일 해시, 근거 해석·학년도 승격 거부,
SQL 인용 처리, 빈 데이터 거부, 기존 돌봄 추출기 회귀를 포함한다.

advisors에서 발견된 외래키 인덱스 누락 2곳을 별도 migration으로 보완했다. 최종 `care_research` 범위의 WARN/ERROR와 누락 외래키 인덱스는 0이다.
남은 INFO는 [RLS 정책 없음](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)과
[새 인덱스 미사용](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)이다.
전자는 비공개 기본 거부 정책이며 실제 브라우저 역할 차단을 검증했다. 후자는 소규모 신규 테이블의 FK/후속 조회용 인덱스로 유지했다.
기존 프로젝트의 다른 스키마에 대한 점검 항목은 이번 변경에 포함하지 않았다.

원수치는 [schema_pilot_verification_20261016.json](schema_pilot_verification_20261016.json)에 보관했다.
기존 `public.school_care_hours`는 **2,014행 / morning_hours 477행**으로 전후 계수가 일치했다.

## 공개 계약과 전수 확대

이 단계는 비공개 데이터 기반 구축이다. 기존 공개 필드·조회 응답이 바뀌지 않아 `src/types/index.ts`와 `src/services/dataService.ts`는 수정하지 않았다.
새 public read model을 구현할 때는 SQL·적재기·TS 타입·조회 코드·Track B 어댑터를 함께 변경해야 한다.
`publication_state`는 현재 DB에서도 research_only만 허용하므로 이 파일럿을 운영 화면에 바로 노출할 수 없다.

다음 데이터 작업은 **서울 606개교의 기존 공시 첨부를 같은 기준으로 전수 검토**하는 것이다.
이 적재기를 재사용하되 학교별 학년도·범위와 필드 근거를 갖춘 연구 JSON을 먼저 생성한다.
기존 `morning_hours` 411개를 현재 실운영 확인으로 복사하지 않는다. 공시 누락·충돌·신청 정보 부족 학교는 별도 검수 큐로 남긴다.
기관 현재 안내·동행 매칭과 2027 확정 자료를 확보한 뒤 실제 운영 판정용 loader 및 공개 read model을 별도 단계에서 추가한다.
자동 갱신 스케줄은 아직 등록하지 않았다.
