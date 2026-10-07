# Audit 2 Docker 없는 읽기 전용 검증 — 2026-10-06

사용자 확인에 따라 Docker 준비를 현재 감사의 선행조건에서 제외했다. 실제 운영 DB에서 READ ONLY transaction 안에 역할/시험용 claim을 설정하여 제한된 SELECT 검증을 수행했다. Docker 설치/시작, 테스트 계정 생성, 운영 데이터/권한/Auth 설정 변경, migration 또는 배포는 하지 않았다.

## DB 역할 검증 결과

[SQL](verify_read_roles.sql), [결과 JSON](read_role_results_20261006.json), [역할 속성](read_role_attributes_20261006.json). 세 transaction 모두 `transaction_read_only=on`을 결과로 확인했고 마지막에 ROLLBACK했다. `SET LOCAL ROLE`과 시험용 claims는 transaction 범위다. 조회는 EXISTS/LIMIT 1로 최소화하고 statement timeout 5초, lock timeout 500ms를 사용했다. 테이블의 실제 사용자 행이나 실사용자 ID는 반환하지 않았다.

| 조건 | 확인 결과 |
| --- | --- |
| anon, sub 없음 | 학교·아파트·학원·돌봄 공개 자료 존재 확인; private apartment master 행 비노출 |
| 비관리자 authenticated, 시험용 sub | 공개 학교/아파트 조회 가능; 관리자 역할 행과 ETL runs/schedules/checks/source snapshots 비노출 |
| 동일 sub, is_anonymous=true | authenticated 역할로 위와 동일한 공개 조회/관리자 비노출 확인 |
| anon | 관리자 role/staging 테이블 SELECT grant 없음 |
| anon 및 두 authenticated 조건 | serving refresh/cleanup 함수 EXECUTE grant 없음; 함수 자체는 실행하지 않음 |
| authenticated | public_table_sizes/etl_staging_depth/region_from_address EXECUTE grant 있음; 기존 개선 사항 유지, 실행하지 않음 |

검증 전 시험용 sub가 관리자 목록에 없음을 확인했다. 원본 관리자/control-plane/private master 테이블들에 데이터가 있다는 것도 별도 EXISTS로 확인했다. 따라서 비관리자에게 0행이 나온 결과를 빈 원본 테이블 때문이라고 해석하지 않는다. anon/authenticated 역할은 superuser 및 RLS bypass 속성이 모두 false였다.

한계: 이것은 **SQL 세션 내 역할/claim 모사**다. 실제 Auth 가입/로그인, 실제 서명 JWT, API 요청 전체 경로, 실제 관리자 positive case, owner/non-owner 쓰기 또는 모든 가능한 계정에 대한 증명은 아니다. 신규 개인/가족 schema는 아직 없으므로 그것의 RLS 테스트 완료를 의미하지 않는다. 읽기 쿼리 자체의 소량 부하는 있지만 제품 데이터/설정 변경은 없었다.

## 공개 Auth 설정 — 부분 확인

기존 자동 승인 사용량 제한과 달리 이번 승인된 읽기 요청은 실행에 성공했다. `/auth/v1/settings` GET, 공개 anon key 사용; 비밀 키/토큰/전체 설정 출력 없음. [안전한 boolean subset](public_auth_settings_20261006.json), [재현 도구](../../../scripts/audit-public-auth-settings.mjs), 실행 `node scripts/audit-public-auth-settings.mjs`.

- email=true, kakao=false, google=false, anonymous_users=false, phone=false.
- disable_signup=false, mailer_autoconfirm=false, phone_autoconfirm=false.
- 따라서 익명 인증 시나리오의 DB 역할 모사가 통과해도 **운영 익명 로그인 기능이 켜졌다는 뜻은 아니다**. 카카오/Google/익명 로그인은 제품 확장 전에 설정 및 실제 callback 테스트가 필요하다. 이번에 켜지 않았다.
- site_url, redirect allow-list, manual identity linking, OAuth client/secret 설정은 이 공개 응답에서 확인할 수 없어 계속 미확인이다. 사용 가능한 연결 도구에도 Auth 관리 설정 조회 기능이 없었다. 이를 확인하려고 운영 키를 출력하거나 설정을 추정하지 않았다.

## 운영 public smoke — 최종 PASS

명령: `npm run browser:smoke:public -- https://wherecho.co.kr`. 실행 세션 88596, **최종 exit 0**, 마지막 메시지 `Public map smoke test passed.`. 이전 중간 PASS 기록을 이번 실행의 종료 확인으로 보완했다.

확인 범위: 공개 정적/셸 deep link, 단일 canonical과 운영 origin, 공유 메타/OG/robots/sitemap, 지도 지역 확대·축소, 학교/단지 이름 검색, 단지→학교와 학교→배정단지, 장식 slug 정규화와 영구 key 상세 복원, 돌봄 표시, HOME 검색→상세→뒤로가기, MY 기기저장, guide/FAQ/checklist/privacy, 체크 재접속, 360/390/430/1280px 가로 넘침, 예상하지 않은 페이지 오류 없음, 지도/아파트 요청 시간 gate, smoke 브라우저 GA4 제외.

성능 gate의 한계: 이번 마지막 `Performance metrics`는 빈 배열(`[]`)이었다. `.every(...)` 검사가 통과했지만 측정 표본이 없으므로 실제 지도 5초/아파트 3초 이내 지연시간을 실측 입증한 결과로 집계하지 않는다. 기능 smoke PASS와 별도로 성능 계측 보완 항목을 남긴다.

브라우저의 체크/관심 저장은 격리된 smoke 세션의 localStorage에만 기록하고 테스트가 정리했다. 운영 DB에 사용자 데이터를 저장하지 않았다. 스크립트 finally가 브라우저 close를 수행했다. production 화면은 아직 기존 배포 상태이며 로컬 개편 라벨/최종 4GNB 구현의 배포 완료를 뜻하지 않는다.

지원 범위 구분: 현재 검색은 학교/단지 이름으로 serving 자료를 찾는다. 임의 도로명 주소로 학구 배정을 산출하는 검색과 학구 polygon 경계 UI는 현재 코드 및 이 smoke에서 확인되지 않았다. 기존 학구 ETL과 배정 결과 표시를 polygon UI 또는 임의주소 조회 지원으로 확대 해석하지 않는다.

## TODO 판정 및 다음 순서

- A2-B03: catalog/최종 정의/권한 차이/호출 영향 및 제한된 읽기 역할 검증을 완료. 알려진 보안 개선 사항은 해결 완료가 아니다.
- 쓰기·실관리자·성능 검증은 별도 변경 적용 전 gate로 **Deferred**. Docker 없는 방식으로도 별도 테스트 DB를 사용할 수 있다. 현재 읽기 감사와 다른 업무를 막는 조건으로 두지 않는다.
- A2-B04: provider 부분 완료, redirect/linking 미확인 유지.
- A2-B05: 이번 운영 public smoke 최종 종료 확인 완료.
- 다음: A2-B06 URL/ID/localStorage/지역 QA 보호 fixture → A2-E01 학교 PoC manifest. Auth 설정 확인의 미확인 범위는 로그인 구현/배포 전에 해소해야 한다.

검증 도구/저장 증거 테스트: `python -m unittest etl.tests.test_read_role_evidence etl.tests.test_product_definition_audit etl.tests.test_product_schema_audit etl.tests.test_portable_inputs` — **22개 통과**. 증거 테스트는 저장 JSON의 일관성 확인이며 DB를 새로 실행하거나 쓰기 RLS를 검증하는 테스트가 아니다. `node --check scripts/audit-public-auth-settings.mjs` 통과.

이번에는 Supabase 스킬로 read/write 검증 범위를 분리하고 agent-browser 스킬로 운영 smoke를 최종 종료까지 확인했다. 관련 사용자/학원 refresh 변경은 그대로 보존했다.
