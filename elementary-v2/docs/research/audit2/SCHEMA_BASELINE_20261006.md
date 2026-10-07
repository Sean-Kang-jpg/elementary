# Audit 2 운영 DB 기준선 — 2026-10-06

대상: Supabase `vsgeksumgvcrkzjwvlgs`, active app `elementary-v2`, SQL06~24 전체 19개 파일. 실행 범위는 catalog SELECT와 저장소 읽기뿐이다. 운영 테이블·권한·Auth 설정·데이터·배포를 변경하지 않았다. 사용자 행, 환경변수 값, API 키를 수집하지 않았다.

## 결과와 완료 범위

- public 애플리케이션 객체 25개: 테이블 24개, 뷰 1개. 테이블 21개 RLS on, legacy 3개 RLS off.
- 컬럼 380개, 제약 110개(외래키 26개), 인덱스 108개, 정책 12개, extension 소유 함수를 제외한 함수 68개를 기록했다.
- SQL06~23에 선언된 테이블/컬럼/인덱스/함수 이름/정책 이름은 모두 live에 존재한다. 이것은 **선언 존재 확인**이며 SQL 전체 적용 이력 또는 정의 동등성의 증명이 아니다. 11의 이전 cleanup signature와 17의 교체 signature처럼 최종 상태가 우선한다.
- SQL24의 `curriculum_refs`, `curriculum_likes`, 함수 3개, 인덱스 2개, 정책 3개는 live에 없다. 플래그 뒤 미적용 상태라는 기존 인수인계와 일치한다. 이 감사에서 적용하지 않는다.
- 이후 [실제 정의 대조](DEFINITION_DIFF_20261006.md) 및 [Docker 없는 읽기 검증](READ_ONLY_VERIFICATION_20261006.md)으로 A2-B03 읽기 감사 범위를 완료했다. 실제 쓰기/실관리자/성능·외부 소비자/API 전체 노출 확인은 변경 적용 전 별도 gate로 남긴다. 보안 수정 완료는 아니다.

## 증거와 재현

| 파일 | 내용 |
| --- | --- |
| [live catalog](live_catalog_20261006.json) | 컬럼·nullable/default·UDT, FK/check/PK 정의, 인덱스 정의, RLS·정책, 직접 grants, 함수 signature·definer·search_path·실행권한·definition MD5 |
| [catalog 조회 SQL](capture_public_catalog.sql) | metadata SELECT, migration이 아님 |
| [effective security](effective_security_20261006.json) | 역할별 유효 테이블 권한, column ACL, default ACL, legacy 뷰 정의 |
| [security 조회 SQL](capture_effective_security.sql) | metadata SELECT, migration이 아님 |
| [함수 본문](security_function_definitions_20261006.json) | 보안 영향 검토 대상 6개 함수의 live 정의 |
| [선언 비교](declaration_presence_20261006.json) | 19개 SQL 각각의 SHA256, 선언 목록과 live 존재 여부, 전체 live FK 목록 |
| [오프라인 비교기](../../../etl/audit_product_schema.py) | DB 연결 없이 저장된 snapshot과 저장소 SQL을 비교, stdout만 출력 |

재현: 앱 폴더에서 `python etl/audit_product_schema.py`. 테스트: `python -m unittest etl.tests.test_product_schema_audit` — 5개 통과. 비교기는 제한된 선언 추출기이며 PostgreSQL 실행/semantic parser가 아니다. 함수는 이름만 비교하므로 overload/signature 삭제를 판정하지 않는다. snapshot 날짜 이후 운영 상태 변화와 SQL 파일 수정은 별도로 재수집해야 한다.

## 보안 영향 및 조치 제안 — 아직 미적용

### 1. Legacy 테이블 — 우선 조치 검토

`schools`, `apartments`, `apartment_school_mappings`는 RLS off이며 anon/authenticated의 SELECT/INSERT/UPDATE/DELETE/TRUNCATE 권한이 유효하다. catalog 기준으로 행별 접근 제한이 없다. Data API 노출 설정과 실제 익명 HTTP 쓰기 성공은 테스트하지 않았다. 파괴적·변경성 증명은 수행하지 않는다.

legacy `create_apartment_school_mapping`은 INSERT/UPDATE, `update_all_school_normalized_data`와 `update_all_apartment_normalized_data`는 UPDATE 본문을 가지고 있다. 모두 invoker이고 anon/authenticated EXECUTE가 유효하다. definer가 아니어도 대상 테이블 쓰기 권한과 결합하면 위험하다. 실행하지 않았으며 파라미터 충돌·실제 성공 여부는 판정하지 않았다.

호출자 조사: active `src/`, `etl/`, root `api/`, `scripts/`에서 위 세 legacy 테이블의 직접 `.from(...)` 호출 및 위 함수의 호출 참조가 발견되지 않았다. 현재 앱 데이터는 `school_master`, `school_apartment_serving` 및 academy/care serving을 사용한다. 외부 SQL 편집기·별도 소비자·저장소 밖 호출은 미확인이다. `archive/` 두 운영 CSV 입력은 별개이며 그대로 보존한다.

권장 순서: 외부 소비자 확인 → 격리 환경 역할 테스트 → legacy client 쓰기 grants 및 쓰기 RPC EXECUTE 회수안 작성 → 기존 앱/ETL 회귀 → 적용 직전 승인 범위 재확인. 읽기 차단 여부는 별도 결정한다. 테이블 drop, ID 변경, archive 입력 변경은 제안하지 않는다.

### 2. 기본 grants와 PUBLIC만 회수하는 SQL

public schema의 postgres/supabase_admin default ACL에 anon/authenticated 직접 권한이 남아 있다. SQL14/23에서 `REVOKE ... FROM PUBLIC` 후 SELECT만 GRANT하더라도 이미 존재하는 anon/authenticated 직접 쓰기 권한은 사라지지 않는다. 실제 academy/care 테이블에서 INSERT/UPDATE/DELETE/TRUNCATE 권한이 유효하다.

현재 공개 serving 정책은 SELECT뿐이므로 일반 행 쓰기는 RLS로 막히는 구조다. **grant가 있다는 사실과 API 쓰기가 성공했다는 사실을 구분한다.** TRUNCATE는 RLS의 행 정책 대상이 아니지만 일반 PostgREST 테이블 DELETE와도 다른 작업이다. 익명 브라우저에서 TRUNCATE가 가능하다고 단정하지 않는다. 방어 심화를 위해 client 직접 grants를 SELECT-only로 정리할 범위를 검토한다. 새로운 개인/가족 테이블은 명시적인 operation별 grants와 RLS를 함께 설계해야 한다.

### 3. 관리자용 definer 조회 함수

`etl_staging_depth()`와 `public_table_sizes()`는 SECURITY DEFINER, search_path `public, pg_temp`, authenticated EXECUTE=true, anon=false다. live 본문에는 `is_etl_admin()` 또는 auth.uid 기반 caller 검사 없음. RLS로 보호한 control-plane 데이터의 전체 staging run 수/공간 크기와 public 테이블 이름/크기를 집계해 반환한다. **개인 행 원본 유출을 확인한 것은 아니다.**

저장소 호출자: `etl/check_capacity.py` 두 함수, `etl/run_recurring_etl.py` staging 함수. 둘 다 ETL service credential 경로다. `src/services/monitoringService.ts`는 별도로 `is_etl_admin`과 RLS 보호 테이블을 조회하며 위 두 함수는 호출하지 않는다.

권장안: 두 함수의 authenticated EXECUTE 회수 후 service-only 유지, 또는 관리자 caller gate 추가. 현재 확인된 ETL 호출자는 service-only로 유지할 수 있다. 저장소 밖 관리자 소비자 확인과 역할 테스트 이후 적용한다. `is_etl_admin()`의 authenticated 실행은 관리자 여부 검사에 필요하므로 일괄 회수하지 않는다. `public_data_freshness()`는 공개 집계 계약이므로 함께 차단하지 않는다.

### 4. Legacy 통계 뷰

`index_usage_stats`는 security_invoker 옵션이 없고 client SELECT가 유효하다. 뷰 본문은 세 legacy 테이블의 인덱스 이름·사용 횟수·분류만 반환한다. 학생/가족 데이터 뷰로 간주하지 않는다. active 호출 참조가 발견되지 않았으므로 private 이동 또는 client SELECT 회수 후보지만 저장소 밖 소비자는 확인이 필요하다.

### 5. 유지할 권한 경계

- `refresh_school_apartment_serving`, `cleanup_recurring_etl`: anon/authenticated 실행 불가. service 경계 유지.
- `etl_admin_users`: 본인 role 읽기; etl_runs/schedules/checks/source_snapshots: authenticated + is_etl_admin 정책. 개인/가족 테이블에 관리자 전체읽기를 복제하지 않는다.
- private apartment master/assignment/history/key/staging/region 테이블은 public SELECT 정책이 없거나 client grants가 회수되어 있다. 서비스에서 사용하는 serving 테이블과 혼동하지 않는다.
- school_master에 NEIS office/school code 컬럼은 없다. 기존 school_id 또는 schoolinfo_code를 NEIS code로 추정하지 않는다. crosswalk는 A2-E02에서 별도 검증한다.

공식 기준: [RLS와 grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [함수 권한](https://supabase.com/docs/guides/database/functions). Supabase 스킬의 grants·RLS·definer 체크리스트를 적용했다. changelog.md는 웹 도구의 markdown content-type 제한으로 읽지 못했으며 이번 작업은 기능 구현이 아닌 catalog 조회다.

## 다음 순서

1. A2-B03-d1 정의 대조와 d2 READ ONLY 역할 검증 완료. [대조 결과](DEFINITION_DIFF_20261006.md)/[읽기 검증](READ_ONLY_VERIFICATION_20261006.md) 참조. 쓰기·실관리자/성능은 별도 테스트 DB에서 변경 적용 전에 검증한다.
2. A2-B04: Auth provider/redirect/linking 읽기 확인. 이전 자동 승인 제한과 구분하여 결과 기록.
3. A2-B05~06: 운영 smoke 최종 종료와 URL/ID/localStorage/지역 QA 보호 fixture.
4. A2-E01: DB/라우트 기준선 이후 50~100학교 PoC 분모와 밀집 학교 후보 manifest. 학교 선정은 사용자 모집 또는 문서 확보 완료와 구분.

Audit1 두 문서의 SHA256은 이전 기록과 동일함을 확인했다. 별도 학원 refresh 계획·가이드/FAQ 수정은 사용자 변경으로 보존했다. 이번 단계에는 frontend 변경이나 배포가 없어 frontend 4종 검증을 새로 수행하지 않았다.
