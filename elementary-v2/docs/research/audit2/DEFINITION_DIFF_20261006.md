# Audit 2 실제 정의 대조 — 2026-10-06

이전 [catalog 기준선](SCHEMA_BASELINE_20261006.md)에 이어 SQL06~24의 최종 선언과 운영 정의를 대조했다. 운영 DB는 metadata SELECT만 수행했다. 함수 실행, 사용자 데이터 조회, INSERT/UPDATE/DELETE, migration, 권한 변경, 배포는 수행하지 않았다.

## 결과

| 항목 | 비교 결과 | 판정 범위 |
| --- | --- | --- |
| 컬럼 | 302개 중 운영 290개 type/정밀도/nullable/default 일치, SQL24 12개 부재 | datatype alias 및 단순 literal default cast를 정규화 |
| 외래키 | 25개 중 운영 23개 definition 일치, SQL24 2개 부재 | 대상 컬럼과 UPDATE/DELETE action 포함 |
| 명시 인덱스 | 42개 중 운영 40개 definition 일치, SQL24 2개 부재 | btree 기본값과 predicate 바깥 괄호 정규화; 자동 PK/UNIQUE 인덱스는 별도 |
| 함수 | 16개 중 운영 13개 signature identity/result/body/language/volatility/definer/search_path 일치, SQL24 3개 부재 | 함수 본문은 주석/공백/비인용 토큰 대소문자 정규화 후 비교 |
| 함수 기본값 | 운영 13개 중 12개 token 일치; cleanup 1개 표기 차이 수동 확인 | 아래 deparser 차이 참조; 실제 기본값으로 함수를 실행하지 않음 |
| 정책 | 15개 중 운영 8개 일치, 관리자 4개 qual 차이, SQL24 3개 부재 | command/roles/USING/WITH CHECK 비교 |

이 결과는 저장소의 알려진 문법을 대상으로 한 **정의 계약 대조**다. PostgreSQL 실행 의미의 포괄적 동등성 증명이나 실제 두 계정 allow/deny 테스트는 아니다. 의도적으로 SQL24 미적용을 오류로 복구하지 않았다.

## 차이 분류

### A. PostgreSQL 출력 표기 차이 — 적용 변경 불필요

`filter_school_ids`의 `DEFAULT NULL`이 live에서 `NULL::text[]`/`NULL::integer`로 표현된다. parameter 이름·형식·순서·default 유무는 같으며 target-type NULL cast를 정규화하면 기본값도 일치한다.

`cleanup_recurring_etl`의 기본 cutoff:

- 저장소: `NOW() - INTERVAL '2 days'`
- live: `(now() - '2 days'::interval)`

동일한 interval literal을 prefix type 표기와 postfix cast로 표현한 차이로 검토했다. 인자 identity, `max_runs DEFAULT 5`, 본문·결과·보안 설정은 일치한다. 자동 비교기는 이 표현을 일반적으로 등가 처리하지 않아 raw `arguments` 차이를 증거 파일에 남긴다. 데이터를 지우는 cleanup은 실행하지 않았다.

### B. 관리자 정책 4개 — 실제 구조 차이

`etl_schedules`, `etl_run_checks`, `etl_runs`, `etl_source_snapshots`의 관리자 SELECT 정책:

- 저장소 SQL12: `USING ((SELECT is_etl_admin()))`
- live: `USING (is_etl_admin())`

둘 다 authenticated 역할에 관리자 존재 검사 조건을 사용한다. live 함수는 STABLE이며 `auth.uid()`를 현재 관리자 목록에서 검사한다. 접근 조건이 없어진 상태는 아니다. 다만 scalar subselect로 행별 재평가를 줄이려는 저장소 구조가 live에 반영되지 않았다. 실제 실행 계획/성능·실계정 허용/거부는 아직 테스트하지 않았으므로 완전히 동일한 실행이라고 단정하지 않는다. 정책 재적용은 격리 테스트와 변경 계획 후 진행한다.

### C. region 함수 실행권한 — 추가 영향 확인

SQL16/생성기 `etl/export_region_registry_sql.py`는 `region_from_address(TEXT)`를 PUBLIC/anon에서만 revoke한 뒤 service_role에 grant한다. 이전 snapshot에서 authenticated EXECUTE는 true였다. 테이블/함수 default ACL에 이미 있는 authenticated 직접 권한은 이 revoke로 없어지지 않는다.

이 함수는 INVOKER이며 private `region_registry`를 읽는다. 따라서 현재 authenticated EXECUTE=true를 곧바로 private 데이터 조회 성공이라고 해석하지 않는다. SQL16의 service-only 의도와 ACL은 다르며, 다음 보안 변경에서 함수와 생성기 정의를 함께 검토해야 한다. active frontend/ETL의 이 DB RPC 호출은 발견되지 않았다. `build_school_master_v2.py`의 동명 Python 함수는 DB RPC가 아니다.

### D. SQL24 — 의도적 미적용 유지

curriculum 테이블·함수·인덱스·정책은 계속 없다. 플래그 뒤 제품 경로이며 이번 시간표 확장과 자동으로 결합하거나 SQL24를 적용하지 않는다. 새로운 개인/가족 데이터 계약은 별도 migration 및 RLS 테스트를 거쳐야 한다.

## 재현 가능한 산출물

- [live 세부 정의](live_definitions_20261006.json): 373개 public 테이블 컬럼의 format_type/default/nullable, 대상 운영 함수 13개의 argument/result/config/prosrc. 사용자 행/키 없음.
- [읽기 전용 수집 SQL](capture_live_definitions.sql).
- [정의 비교 결과](definition_comparison_20261006.json): 항목별 결과, 차이 양측 정의, SQL 19파일 SHA256, 검증 한계.
- [비교기](../../../etl/audit_product_definitions.py): `python -m etl.audit_product_definitions`. 기존 선언 비교기를 대체하지 않고 추가한다.
- [테스트](../../../etl/tests/test_product_definition_audit.py): 인용 문자열 보존, 주석 문자열, array cast, 괄호, 최종 교체 함수, schema-qualified RPC 누락 방지, 기본값/서명 비교.

검증: `python -m unittest etl.tests.test_product_definition_audit etl.tests.test_product_schema_audit etl.tests.test_portable_inputs` — **17개 통과**. 저장된 비교 결과와 재실행 결과 일치 여부도 확인한다.

비교기의 명시적 한계: 일반 SQL AST interpreter가 아니다. CHECK/UNIQUE/PK 식·trigger·Storage bucket·seed data·migration 이력의 동등성, live-only 객체의 필요성, 실제 API exposed schema 및 소유자/타 사용자 쓰기 권한은 이 결과로 판정하지 않는다. 비교된 이름만 보고 live-only 객체를 삭제하지 않는다.

## 남은 검증과 실행 순서

1. **A2-B03-d 정의 대조 부분 완료**: 위 차이를 검토 기록했다. 운영 보안 설정을 수정하지 않았다.
2. **격리 역할 테스트 미실시**: 로컬 Docker executable은 있지만 engine pipe가 없어 연결할 수 없고 Docker config 읽기도 제한된다. `psql`/Supabase CLI는 현재 실행 경로에서 발견되지 않았다. 이 때문에 격리 DB의 allow/deny 테스트를 수행했다고 표시하지 않는다. 도구 설치, Docker 시작, 별도 Supabase 프로젝트 생성은 수행하지 않았다.
3. 격리 DB가 준비되면 anon·일반 authenticated·관리자·service-role 읽기/쓰기 권한과 기존 공개 조회를 테스트한다. 없는 개인 테이블의 owner/non-owner 테스트는 schema가 만들어지는 Phase2에서 별도로 수행한다. 운영에서 가짜 사용자를 만들거나 변경성 시험을 하지 않는다.
4. [이전 보안 조치 영향](SCHEMA_BASELINE_20261006.md)의 legacy 쓰기 권한, default grants, 관리자용 definer 함수 2개, legacy 통계 뷰에 region 함수 ACL을 추가한다. 외부 소비자/API 노출 설정은 계속 미확인이다.
5. A2-B03 전체 완료는 위 남은 검증과 구분한다. 이후 Auth 운영 설정(A2-B04), public smoke(A2-B05), 보호 fixture(A2-B06), 학교 PoC(A2-E01) 순서를 유지한다.

Supabase 스킬의 함수별 권한 점검을 사용했다. 공식 근거: [authenticated definer 실행권한 안내](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable). 이는 권한 변경의 참고 기준이며 이번 결과는 실제 catalog와 저장소 정의에 근거한다.

## 후속 결과 — Docker 없는 검증

사용자 확인에 따라 [읽기 역할 검증](READ_ONLY_VERIFICATION_20261006.md)을 운영 READ ONLY transaction으로 수행했다. 현재 감사는 Docker 없이 완료할 수 있다. 위 격리 환경 부재 기록은 당시 시도 이력이며 전체 업무의 대기 조건으로 유지하지 않는다. 쓰기/실관리자/성능 검증은 변경 적용 전 별도 gate로 분리했다. 최종 체크 상태는 OPERATION_PLAN을 따른다.
