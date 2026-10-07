# Audit 2 — 입학 전 시간표와 학교별 미계획 수요 확장안

작성: 2026-10-06 (Asia/Seoul). 상태: 검토 가능한 설계안. 운영 migration·라우트 변경·대량 ETL·외부 게시를 수행하지 않음.

기반: [Audit 1](PLATFORM_EXPANSION_AUDIT_20261005.md), [Audit 1 실행 계획](PLATFORM_EXPANSION_PLAN.md), [운영 TODO](../operations/OPERATION_PLAN.md#platform-expansion). Audit 1의 문서와 완료 이력을 보존한다. 이번 합의에 따른 실행 우선순위는 운영 TODO의 Audit 2 절을 따른다. 아래 가설·제안은 구현 완료나 실측 결과가 아니다.

## 현재 상태 기준선 — 증거와 한계

| 구분 | 확인 결과 | 의미/후속 |
|---|---|---|
| 작업트리 | 기존 수정: BottomNavigation/HomePage/MyPage/structure.json, docs README/OPERATION_PLAN. 미추적 Audit 1/실행 계획과 ACADEMY_REFRESH_PLAN 존재 | 이번 단계에서 기존 앱 변경과 사용자 학원 계획을 덮어쓰지 않음 |
| 운영 DB | 연결 프로젝트 `elementary_v2.0`과 앱 환경의 project ref 일치. 2026-10-05 읽기 전용 pg catalog 조회 | 개발용 별도 DB로 착각하지 않음; 이번 작업 DDL/DML 없음 |
| core tables | school_master, school_apartment_serving 및 운영 master·ETL·academy·care 테이블 존재, core RLS 활성화 확인 | 학교 데이터 재작성 없이 별도 시간표 계층 추가 가능 |
| 신규 충돌 | curriculum_refs/likes가 운영 public tables에 없음. profiles/contents/schedules/families도 2026-10-06 지정 테이블 컬럼 조회에서 없음 | 익명 좋아요는 코드/SQL만 존재; 실제 좋아요 데이터 이전이 필요하다고 단정하지 않음 |
| 학교 키 | school_master에 school_id와 schoolinfo_code 존재, NEIS office/school code 컬럼은 없음 | TS의 optional neis_school_code만 보고 운영 키가 있다고 가정하면 안 됨 |
| 돌봄 | school_care_statistics에는 공시 연도·교실/참여 인원·프로그램 수·snapshot_date 존재 | 운영 시간·초1 자격·신청 성공·잔여 정원·전환 허용 여부를 계산할 수 없음 |
| 학원 | academy_address_serving은 주소 집계+institutions JSON, apartment_academy_summary는 기존 거리권역 집계 | 개별 학원 대상학년·이동시간·요일/시간 계약 신규 필요 |
| 보안 | legacy schools/apartments/apartment_school_mappings RLS 꺼짐 + anon 광범위 grant. core에도 필요 이상 grants 관측 | 신규 사용자 데이터 도입 전 최소권한 영향 조사. RLS가 모든 권한을 대신한다고 가정하지 않음 |
| advisor | index_usage_stats definer view, search_path 경고, authenticated 운영 RPC 등 발견 | 즉시 일괄 변경하지 않고 의도/호출자/권한별 후속 검증. policy 없는 내부 master는 설계상 비공개일 수 있음 |
| Auth | 관리자 password와 익명 투표 코드 확인. Kakao/Google 활성, redirect, identity linking 운영 설정 미확인 | 설정 조회는 네트워크 제한 후 자동 승인 검토 사용량 제한으로 실행되지 않음. 승인 안전성 거절이 아니라 검토 실패 |
| 검색·지도 코드 | SearchBox/searchMapEntities는 school_name/complex_name 검색. 지도 코드 검색에서 Polygon/GeoJSON/geocoder 구현 미발견 | 임의주소→학구 판정/학구 경계 UI는 기존 완성 기능으로 계상하지 않음. 학구 ETL은 계속 보호 |
| 빌드 | 이전 lint/typecheck/build 완료 기록. 당시 sitemap 학교6,302/아파트45,853/페이지14 | 당시 기준값이며 현재 exact row count가 아님 |
| production HTTP smoke | `/`, map/MY/favorites/admin shell, guide/FAQ/checklist 정적 응답, OG 이미지, robots/sitemap, prerender canonical, 6개 절대주소 origin 일치 PASS | 브라우저 전체 회귀와 같지 않음 |
| browser smoke | 실행 세션 29285의 최종 종료/브라우저 결과 회수 불가(Unknown process id) | 전체 통과 체크 금지. 재실행 과제 유지 |

DB 권한 확인은 catalog 기반이며 실제 공격성 쓰기 테스트를 하지 않았다. 운영 DB 전체 컬럼/FK diff, 관리자 외 authenticated RPC 접근과 최신 Auth 설정은 아직 미완료다. 보안 참고: [RLS 경고](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public), [definer view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [authenticated definer RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## 1. Audit 1 유지·충돌·변경 매핑

| Audit 1 자산/결정 | Audit 2 처리 | 이유/계획 |
|---|---|---|
| Needs Precision × Timing Precision, 예비초 의사결정 | 유지 + 다음 행동 구체화 | 입학 준비에서 초1 오후시간 계획으로 연결 |
| 학교/아파트/학구 ETL, QA, SEO | Keep | acquisition과 학교 식별의 foundation |
| HOME Discovery / MY State | Keep | HOME에 개인 가족 시간표를 공개하지 않음 |
| 4개 GNB + 로고 HOME | Keep | 시간표는 MY의 주요 서비스, 학교 상세에서 진입 |
| 행정/준비 분리, 4분류 콘텐츠 | Keep | 행정 일정과 학교 운영계획에서 시간표로 연결 |
| seed 24 →100, Poll/경험 우선 | 순서 변경 | 24개 콘텐츠 framework 유지, 100개 확대·social 확장은 시간표/수요 실험 뒤로. 목표 폐기 아님 |
| local MY와 개인 user-owned RLS | Modify | 가족 공동 접근 모델 추가; 개인 저장과 가족 일정 권한 구분 |
| anonymous curriculum likes 승계 | 조건부 보류 | 운영 테이블 미생성. 실재 데이터 확인 후 필요한 경우만 승계 |
| HOME 인기/추천 | Modify | 신규 데이터 없으면 편집/시기 추천; 시간표와 수요로 유입 연결 |
| 돌봄 집계/학원 거리정보 | Modify | 집계는 참고 정보 유지, 프로그램·대상학년·시간·이동 근거 별도 추가 |
| 사진/긴 UGC/Following | Deferred | 현재 시간표 검증과 무관한 확장 보류 |
| Commerce, Select, 협업, 제품, lead | 현재 범위에서 제외 | Audit 1 기록은 보존하되 이번 실행 목록에서는 착수하지 않음 |
| 신규 | 시간표 3모드, 문서 ETL, 가족 공유, 예외 일정, 공개 익명 수요 | 아래 §5~6, §11 |

제외: 학원 입점/결제/수수료/상담중개/셔틀 서비스/그룹과외/온라인수업 중개/학원 숙제 LMS/수익화. `pickup_need`는 희망 입력일 뿐 중개나 연락처 수집 기능이 아니다. 학원비는 공개자료의 프로그램 비용 정보만 다루며 결제 기능을 만들지 않는다.

## 2. 통합 Product Thesis와 사용자 여정

어디초는 배정·학교·입학 정보로 들어온 예비초 부모가, 관심학교의 확인 가능한 자료를 바탕으로 초1 하루를 계획하고 아직 결정하지 않은 시간을 표현하게 돕는다. 이를 학교/학년/시간대/활동 단위의 익명 수요로 공개한다. 시간표 편집 자체보다 입학 전 진입, 방과후·돌봄 데이터 품질, 지역 내 수요 밀집이 검증 대상이다.

핵심 여정:

1. SEO/AEO 또는 SNS → 공개 학교/아파트/입학 콘텐츠. 로그인 없이 배정·자료 확인.
2. 관심학교 저장 → Kakao/Google → 입학연도와 관심학교. 관심학교는 배정 확정과 구분.
3. 입학 준비 → 학교의 자료 범위와 기준연도 확인 → 시간표 시작.
4. 정규수업 기본 블록 생성 → 부모가 방과후/돌봄 후보 선택 → 출처·불확실성이 표시된 계획 저장.
5. 필요 시 주변 학원을 탐색하고 직접 요일/시간 입력. 개인일정, 보강/일회 일정과 가족 공유.
6. 사용자가 정한 오후 계획 구간에서 미계획 시간 안내 → 자유시간/아직모름/희망 활동과 픽업 필요 선택.
7. 별도 수요공개 참여 동의 → 가족별 중복 제거 → 최소 표본을 충족한 학교별 익명 집계 공개.

예외 여정: 학교/반 미정이면 계획모드, 자료 미확보이면 unknown과 직접 입력, 신청 탈락이면 미확정 후보 제거를 제안, 공시 변경이면 차이를 보여주고 재생성 여부 확인. 미계획 시간은 실패가 아니며 자유시간은 유효한 완료 상태다.

가족 공유만 원하는 부모는 수요 입력 없이도 사용 가능하다. 가족 시간표 저장 동의와 익명 집계 참여 동의를 묶지 않는다.

## 3. IA/GNB 및 공개/로그인 경계 개정안

| IA/제안 경로 | 공개 | 로그인/권한 | SEO |
|---|---|---|---|
| 로고 HOME `/` | 시기별 콘텐츠/학교/집계 소개 | 개인 관심으로 재조합 | 기존 canonical 유지 |
| 학교찾기 `/map`, `/school/*`, `/apt/*` | 배정·학교·아파트, 학교별 자료 | 관심학교 저장 | 기존 영구 URL 유지 |
| 입학 행정 `/guide/*`, `/faq` | 공식 일정·운영계획 설명 | 체크/저장 동기화 | 기존 HTML 유지 |
| 입학 준비 `/prep`, `/prep/{slug}` 제안 | 4분류 콘텐츠, 초1 하루 예시 | 저장/내 준비 | 발행본만 색인 |
| MY `/my` | 로그인 안내 + 기존 기기 기록 접근 | 프로필/체크/저장/내 시간표 | noindex, 개인 응답 캐시 금지 |
| 시간표 `/my/schedules/{id}` 제안 | 식별 불가 데모만 공개 | 가족 owner/editor/viewer 범위 | 비공개, 인증·RLS 필수 |
| 가족 초대 `/family/invite` 제안 | 안내만 | 만료 토큰 수락 후 권한 | noindex, 토큰 analytics 제외 |
| 학교 수요 `/school/{기존slug}/demand` 제안 | 억제된 aggregate 누구나 열람 | 원본 작성/수정은 본인 가족 | 초기 noindex, 표본·품질 검증 후 제한적 색인 |

GNB는 학교찾기/입학 행정/입학 준비/MY. 별도 시간표·커뮤니티·학원마켓 탭 추가 없음. MY 안에서 시간표를 주요 CTA로 배치한다. 학교 상세에는 `입학 준비`와 `이 학교로 초1 시간표 만들기`, `학교별 희망 시간 보기`를 제공한다.

새 nested `/school/*/demand`는 현재 2-segment parser와 root prerender rewrite에 충돌할 수 있다. §11의 라우팅 검증 전 등록하지 않는다. 개인 시간표를 공개 링크로 만들지 않고 가족 초대로 공유한다. 향후 이미지 공유도 별도 opt-in 검토 사항이다.

## 4. Phase 1/2/3 통합 로드맵

| 단계 | 범위/산출물 | 통과 조건 | 실패 시 |
|---|---|---|---|
| Phase 1: 기반·자료 가능성 | Audit1 보호, 운영 권한/키 조사, 4GNB 설계, schema 계약, 50~100학교 문서/NEIS ETL PoC. 실제 모집은 그중 밀집 10~20학교 | 키 매핑·자료 확보·필수필드 정확도·검수 부담을 측정, 출처 확인 가능한 예상 시간표 fixture | 확보 경로/파서 보완, 지원 학교 축소. 전국 확장 안 함 |
| Phase 2: 초1 시간표 MVP | 최소 Auth/MY, 3모드 시간표, 선택형 방과후/돌봄, 직접 일정, 가족 공유, 예외/보강, 미계획 입력과 제한 집계 | 비공개 권한·불확실성·충돌/갱신·가족 중복 제거 테스트 통과; 내부 파일럿에서 start→save/입력 측정 | 데이터 문제와 UX 문제를 분리해 수정 |
| Phase 3: 수요 공개·유입 실험 | 익명 aggregate 공개, 10~20학교 밀집 모집, SEO/AEO/GEO/SNS funnel, rule-based HOME 연결 | §9 가설과 비식별 검증을 만족하는 반복 cluster; 충분한 기간·표본 | 표본 부족이면 hold, 노출 안전성 실패면 공개 중단 |

진행 의존성: 운영 키/권한 확인 → source/field 계약 → PoC gold set → 순수 시간표 엔진 → Auth/가족 저장 → 수요 집계 → 공개/유입. 콘텐츠 UI와 자료 inventory는 동시에 준비할 수 있지만 DB/라우트 대규모 적용 전 §11을 먼저 보고한다.

**2026-10-07 개정(사용자 결정)**: E04 조사로 학교알리미 공시는 해당 학년도 4~5월에 올라오는 전년도 기준 예상값이고, 확정값은 2월 이후 학교 홈페이지의 기수별 가정통신문뿐임을 확인했다. 그래서 Phase 2 앞에 **Phase 1.5 — 비로그인 "초1 하루 예상" 카드**(학교 상세, 검수 통과 학교만, 출처·기준연도·`estimated` 표시)를 둔다. 로그인은 저장이 필요한 시점(11~12월)에 붙인다. 파일럿 추출은 규칙+사람 검수, LLM 파이프라인은 확장 때 착수한다. 실행 순서는 [운영 TODO 재정렬](../operations/OPERATION_PLAN.md#2026-10-07-재정렬--현재-실행-순서)을 따른다. 위 표는 원안으로 보존한다.

시기 기준: 2026-10 현재 2027 입학 cohort의 자료 준비를 우선한다. 12~1월 계획, 1~2월 신청, 3월 실제는 기본 안내이며 학기/학교별 발표일과 자료 상태로 모드를 결정한다. 2026 자료로 2027 확정표를 만들지 않는다. 파일럿 날짜는 모집/자료 가능성을 확인한 뒤 고정하며 3월 이전에는 실제모드 성과를 주장하지 않는다.

## 5. ETL PoC — 범위·schema·confidence gate

### 5.1 출처와 아직 검증하지 못한 부분

NEIS 공식 데이터셋 목록에서 학교 기본정보·초등시간표·학사일정·학원교습소 항목을 확인했다. 포털의 실시간 상세 페이지는 동적 렌더에서 목록이 비어 보이는 경우가 있어, 필드 계약과 학교별 실제 coverage는 PoC에서 샘플 API 응답으로 고정한다. [NEIS 포털](https://open.neis.go.kr/portal/mainPage.do).

학교알리미 수치와 운영계획 첨부는 구분한다. 현재 `collect_care_data.py`는 schoolinfo_code→school_id로 공시 수치를 수집한다. 교육청 안내에서 운영계획/운영·지원 현황 공시를 확인할 수 있지만 개별 학교의 최신 첨부 확보를 보장하지 않는다. [학교알리미 API 안내](https://www.schoolinfo.go.kr/ng/fa/pnngfa_a01_l0.do), [경기도교육청 공시 안내 자료](https://www.goe.go.kr/resource/old/BBSMSTR_000000030140/BBS_202403040441533101.pdf). 후자는 2024 자료로, 2027 규칙 근거로 사용하지 않는다.

교육청 통합저장소 → 학교알리미 첨부 → 학교 홈페이지의 공식 HWP/HWPX/PDF를 source registry로 관리한다. 채널마다 제공/갱신 여부를 학교 단위로 기록한다. URL만 같아도 파일 교체될 수 있으므로 hash를 검사한다. 로그인·접근제어를 우회하지 않는다.

NEIS 교시/교과 정보가 있어도 절대 시작·종료 시각은 별도 학교 일과표가 필요할 수 있다. `교시 수 × 40분`만으로 하교시각을 확정하지 않는다. 점심/쉬는시간/단축수업/입학 초기 적응기간/방학을 별도 근거로 결합한다.

### 5.2 표본과 작업 순서

PoC 표본은 기본 60학교(최소50~최대100), 그중 사용자 파일럿은 인접 생활권 10~20학교다. 후보 school_id 확정은 별도 작업으로 두고 임의 학교 이름을 정답 목록으로 넣지 않는다. 교육청·대/소규모·도시/외곽·문서형식·스캔·표 복잡도·공동/분교 여부를 포함한다. 자료 없는 학교를 표본에서 제거해 coverage를 부풀리지 않는다.

1. school_id↔학교알리미↔NEIS 교육청/학교코드 매핑. 이름/주소/지역 교차 확인, 동명이교/통폐합/분교는 수동 검수.
2. 문서와 NEIS raw snapshot 확보, 출처·학년도·버전·취득일·최종확인일 기록.
3. 형식별 텍스트/표 추출; 스캔은 OCR. 표 병합 셀과 각주를 보존.
4. LLM은 후보 JSON+필드별 근거 위치만 산출. 문서의 지시문은 실행하지 않음. 개인정보 포함 raw는 별도 접근제한/보관 정책 적용.
5. deterministic validator로 타입/요일/시각/기간/단위/대상학년/키/중복 검증.
6. confidence gate → manual review → 공개 serving snapshot. 이전 approved version을 검수 중 덮어쓰지 않음.
7. gold set과 parser별 정확도/학교 coverage/검수 시간/비용 측정. API와 parse 처리 비용도 포함.

gold set 제안: 60개 중 20개는 개발용, 20개는 미사용 검증용, 나머지는 coverage/운영 부담 확인용. 검증 세트에는 어려운 형식을 강제 포함하고 동일 문서의 다른 페이지가 개발/검증에 동시에 들어가지 않게 한다. 비용·정원·자격·전환 등 핵심 필드는 두 명 또는 독립된 두 차례 판독으로 불일치를 해소한다.

### 5.3 논리 schema 초안 (실행 SQL 아님)

| entity | 주요 필드/키 | 제약 |
|---|---|---|
| school_external_ids | school_id FK, provider, office_code, external_code, valid_from/to, match_status, evidence | provider+office+code의 유효기간 중복 방지; 미승인 매핑 publish 금지 |
| school_documents | id, school_id, kind, source_url, academic_year, term, published_at, fetched_at, last_checked_at, document_hash, version, is_current, supersedes_id, content_type | 학교+문서계열+학년도/학기별 승인 current 하나; bytes hash와 URL 별도 |
| extraction_runs | document_id, parser/model/prompt/schema version, validator_version, status, errors, cost, reviewed_at | 재실행 가능, provenance immutable |
| school_programs | id, school_id, year/term, program_name, eligible_grades, selection_method, application_dates | 이름만으로 다른 반/차수를 합치지 않음 |
| program_sessions | program_id, weekday, start/end, effective_dates, room, tuition, material_fee, fee_unit, source_document_id | 요일별 별도 row; 원/월·원/기·회당을 구분; null은 무료 아님 |
| care_offerings | school_id, year/term, day/start/end, capacity, priority_conditions, application_dates, source_document_id | 참여 인원≠정원, 모집조건은 근거 필요 |
| care_program_transitions | care_id, program_id 또는 명시 scope, status, conditions, source_document_id | confirmed/prohibited/unknown; unknown 기본값 |
| school_day_periods | school_id, year/term/date 범위, grade/class scope, period, start/end, lunch/break | 시간 근거 없이 정확시각 생성 금지 |
| school_class_lessons | school_id, office/school code, year/term, date, grade, class, period, subject, snapshot_id | 학교+날짜+학년+반+교시 고유; 변경 이력 보존 |
| school_calendar_events | school_id, date span, grade scope, event_type, source, observed_at | 누락을 등교일/휴일로 자동 확정하지 않음 |
| field_evidence | entity/field, value_status, source_id/url, source_date, locator(page/table/cell), extraction_confidence, reviewed_by/at | status와 confidence를 분리; 민감 raw는 public projection 제외 |

학년도 integer, term 명시, KST local date/time, UTC 수집 timestamps를 구분한다. 모든 serving 필드에 `confirmed / school-plan / estimated / unknown`과 source/date를 연결한다. 사용자 입력은 `source=user`로 provenance를 구별하며 학교가 확인한 사실로 보이지 않게 한다.

### 5.4 confidence gate 제안

| gate | 자동 처리 | 판정 |
|---|---|---|
| G0 출처/키 | 학교·학년도·문서 version 식별 | 출처 불명/학교 불일치→격리 |
| G1 구조 | 필수키/단위/요일/start<end/유효기간/허용값 | 실패→publish 차단, 오류코드 |
| G2 근거 | 필수필드 모두 page/cell 근거, 충돌 감지 | 근거 누락은 unknown; 모델 추정 보충 금지 |
| G3 정확도 | gold set 정답과 필드별 비교 | 모델 자체 confidence만으로 승인하지 않음 |
| G4 공개 | human 승인 또는 검증된 파서 정책 | 학교계획은 school-plan으로만 승격, 개인 신청 확정 아님 |

초기 제안 목표(업계 기준 아님): source/학교/year provenance 100%, 검증셋 필수 시간·요일·대상학년 exact accuracy 98% 이상, 치명적 오확정 0건. 50~100학교 중 필수 정보 확보 비율 70% 이상을 조사 목표로 시작하되 학교별 unknown율과 검수 p50/p95 시간을 같이 보고한다. 점수 기준은 calibration 후 정하며, 첫 PoC는 시간·자격·전환 조건을 사람이 확인한다. 미달이면 학교/문서 포맷별로 지원을 제한하고 estimated/unknown으로 표시한다.

전환 가능 여부는 해당 학교/운영 기간의 명시 근거가 있어야 confirmed/prohibited로 분류한다. 두 프로그램 시간이 겹치지 않는다는 이유만으로 이동 가능을 확정하지 않는다.

갱신 제안: 계획 발표기 학교 문서는 주1회+변경 알림 확인, 신청기 더 짧은 주기 검토, 실제 시간표는 당일/가까운 미래를 매일 확인. 실제 제한/쿼터를 측정해 주기를 확정한다. source 폐쇄·취소·정정은 tombstone/stale로 남기고 사용자에게 재확인을 요청한다.

## 6. Schedule Engine MVP — 상태·UX·데이터

### 6.1 세 가지 상태 축

| 축 | 값 | 전이 규칙 |
|---|---|---|
| schedule_mode | planning(12~1월), application(1~2월), actual(3월 이후) | 학교 자료·학년/반·부모 확인을 반영. 날짜가 왔다고 자동 확정 전환하지 않음 |
| evidence_status | confirmed, school-plan, estimated, unknown | 필드별 근거; 원본 시각과 사용자 수정시각 각각 보존 |
| participation_status | considering, planned, applying, confirmed, rejected, cancelled | 학교 프로그램 공개와 가정 선정 확정은 별도 상태 |

전환 rule은 또 다른 enum confirmed/prohibited/unknown이다. extraction_confidence, evidence_status, participation_status를 하나의 신뢰 점수로 합치지 않는다. 정규수업 과목은 confirmed여도 하교시각은 estimated일 수 있다.

### 6.2 계산 순서와 화면

1. 학교·입학연도 선택. 반 미정은 정상 상태. 자료 기준연도·예상/실제 범위를 먼저 표시.
2. NEIS 교시 + 검증된 일과표 + 학사일정으로 정규 블록 생성. 전년도면 점선 estimated, 시각 unknown은 미배치 영역에 표시.
3. 방과후/돌봄 후보를 초1 대상·기간·요일로 필터. 부모가 선택한 후보만 삽입. 제외 이유와 unknown 자격을 표시.
4. 중복·시간 공백·전환 가능성 검사. unknown 전환은 `학교 확인 필요`, prohibited는 충돌 표시하고 확정 가능한 조합으로 취급하지 않음.
5. 학원/개인일정은 사용자 입력. 반복 요일과 유효기간, 일회성 날짜, 보강 원일정 참조를 저장.
6. 확인 후 저장 → 가족 초대. 보기/편집 권한과 변경 내역 표시.
7. 사용자가 정한 오후 구간(예: 하교~보호자 지정 종료)에서 `아직 계획하지 않은 시간이 있어요. 어떻게 보내고 싶으세요?` 안내.

전체 24시간을 빈칸으로 채우려 하지 않는다. 수업/돌봄/사용자 일정의 합집합으로 점유시간을 구한다. 구간은 `[start,end)`로 계산하고 인접 블록을 중복으로 보지 않는다. 점심/이동/귀가도 사용자가 표시할 수 있다. 확정 공백과 예상 공백은 분리하며 unknown 하교시각으로 정확한 공백 분을 산출하지 않는다.

기본 주간 반복 → 날짜별 휴업/단축 → 개인 취소/변경/보강 override 순서. 방학 돌봄은 방학 문서가 있을 때만 생성. 삭제한 수업이 동기화 때 부활하지 않도록 source reference와 user override를 보존한다. 새 source version은 diff를 제안하고 기존 저장표를 조용히 교체하지 않는다.

### 6.3 사용자·가족 데이터 모델

| entity | 핵심 필드/권한 |
|---|---|
| families / family_members | family_id, user_id, owner/editor/viewer; 가족 membership 기반 RLS. 자기 자신을 타 가족에 추가하는 요청 차단 |
| family_invites | token_hash, family_id, role, expires_at, used_at, inviter; 원문 토큰 저장/로그 금지, 만료/취소/1회수락 |
| learner_plans | family_id, id, 선택 별칭, entry_year, school_id, grade, class nullable | 
| schedules | family_id, learner_plan_id, academic_year/term, mode, revision, planning_window, status |
| schedule_entries | schedule_id, source reference/version, kind, recurrence, time/date, evidence, participation_status, user_override |
| schedule_exceptions | entry_id, date, cancel/replace/makeup, replacement time, original_entry_id |
| schedule_revisions | actor_id, version, changed fields, recorded_at; 가족 외 접근 금지 |
| unmet_slot_intents | family/learner/school/year/term, weekday, coarse time bucket, activity, pickup_need, evidence_mode, consent, updated/expires_at |
| demand_snapshots | 학교/학년/기간/시간대/활동, suppression, 공개 count band/sample band, method_version, published_at | 

아이 이름·생일·성별·정확주소는 필요 없음. 선택 별칭과 학교/학년/반만 시간표에 필요한 범위에서 보관한다. 반은 private이며 공개 집계 차원에 쓰지 않는다. 관심학교와 실제/입학예정 학교는 별도 relation/status로 구별한다. 공개 수요 집계에는 가족이 대표로 선택한 학교 하나만 기여하며 후보 학교 여러 곳에 중복하지 않는다.

가족 owner/editor만 일정 변경, viewer는 열람. 초대 수락 전 원본 일정은 제공하지 않는다. 탈퇴/초대 취소 시 권한 즉시 재검사, 오래된 링크/캐시에서도 조회 차단. 동시 편집은 revision 비교 후 충돌 안내. service key는 서버 전용, raw 문서·원본 수요·가족 데이터는 비공개, public endpoint는 승인된 집계만 제공한다.

### 6.4 미계획 수요와 공개 보호

입력은 activity와 pickup need(필요/불필요/아직모름) 정도로 제한한다. activity에는 자유시간·아직모름을 포함한다. 연락처/학원 선택 의사/정확한 거주지/반/아이 이름을 요구하지 않는다. 사용자가 남긴 희망만 수요이며 자동 감지 공백 전체를 수요로 집계하지 않는다.

집계 키 제안: school_id + grade + academic_year + term + weekday + 60분 bucket + activity. `최근30일`은 업데이트/유효한 응답 창, `학기/학년도`는 대상 시간표 기간으로 구별한다. 최근30일/학기/학년도 모두 화면에 기간·기준시점·표본 정의를 표시한다. 계획/신청/실제모드 수요는 혼합하지 않으며 보고서에 모드 구성을 명시한다.

동일 가족은 같은 셀에 최대 1기여; 여러 보호자와 형제자매가 있어도 1가정. 일정 변경·선택 학교 변경·동의 철회는 다음 집계에서 반영하고 오래된 의향은 재확인/만료한다. 자유시간·아직모름을 유료 활동 수요와 합산하지 않는다.

초기 보호 기준 제안: 5가정 미만 숫자 비공개. 임계값만으로 익명성을 보장한다고 주장하지 않는다. 공개는 고정 snapshot과 사전 정의한 필터로 제한하고 임의 시간 범위/교차 필터를 막는다. 5 이상도 `5~9가정` 등 구간 표시를 우선하며 전체 표본 수 역시 작은 셀을 역산할 수 있으면 구간/억제한다. 합계 차감으로 작은 집단을 추론할 수 있는 경우 상위 합계도 함께 억제한다. 픽업 세부 집계도 독립적으로 같은 기준 적용.

매일 증감이 한 가족을 드러내지 않도록 기본 주간 공개와 고정 집계창을 검토한다. 철회/삭제는 조기 비공개 재산출, 오래된 공개 snapshot의 민감 수치 접근도 제거한다. 최근30일 기준은 주간 갱신시 평가한다. 공개 API/CSV/OG/로그에 suppressed 원시 count를 보내지 않는다. 누구나 로그인 없이 승인 snapshot을 볼 수 있지만 원본 게시판·가족 목록·개별 시간표는 제공하지 않는다.

### 6.5 학원 탐색 보조

NEIS 학원/교습소 등록자료를 재사용한다. 등록자료에 모든 초등 대상/실제 반시간이 있다고 가정하지 않는다. 공식 데이터 설명은 분야/계열/과정과 공개된 교습비를 제공한다. [공공데이터포털](https://www.data.go.kr/data/15096277/standard.do).

등급: `초등대상 확인됨`은 명시된 대상학년과 source/date, `가능성높음`은 교습과정 등 규칙 근거, `확인안됨`은 근거 부족. 낮은 등급을 추천으로 포장하지 않고 최신 영업상태/출처를 표시한다. 사용자가 선택한 뒤 요일·시각을 직접 입력한다.

기존 600/800m distance contract는 유지한다. 이동시간은 별도 `travel_mode/estimated_minutes/provider/as_of/origin_type`으로 제안한다. API 이용 가능성·보행경로·횡단/신호·동행 가정을 PoC에서 평가하고, 거리만으로 계산한 값을 실제 도보시간처럼 표시하지 않는다. 제공 불가 시 거리 정보만 표시한다. 셔틀 서비스/라이딩 중개는 만들지 않는다.

### 6.6 엔진 필수 검증 예시

전년도→신학년도 자료 교체, 반 미정, 요일별 단축, 점심시간, 방학, 같은 시각 인접 수업, 중복 돌봄/방과후, unknown/prohibited 전환, 신청 탈락, 일회 보강, 반복 일정 한 번만 취소, 사용자 수정 보존, 시간표 revision 충돌, 가족 권한 취소, 4→5가정 임계/철회/형제 중복/총계 역산을 테스트한다. 개인표 저장 성공과 수요 공개 성공은 별도 결과다.

## 7. SEO/AEO/GEO/SNS 통합 funnel

여기서 GEO는 생성형 검색에서 근거로 인용될 수 있는 정보 제공을 뜻한다. 지역 기반 acquisition은 학교/생활권 segmentation으로 별도 관리한다.

SEO/AEO: 기존 학교/아파트/행정 URL에서 부모 질문에 짧은 답, 기준연도, 학년·반 적용 범위, 공식 source/date, unknown 구간을 함께 제공. 시간표 예시는 익명 합성 예시임을 표시한다. 운영계획의 프로그램 총수와 초1 eligible 수를 구별한다. 기존 static HTML/canonical/sitemap/prerender를 재사용한다.

GEO: 검색엔진이 읽을 수 있는 본문·표·출처·갱신일을 제공하고 structured data를 실제 본문과 일치시킨다. 특별한 AI markup이나 인용 노출을 보장하지 않는다. Google의 AI 검색 안내도 기존 SEO 원칙을 기반으로 설명한다. [Google Search Central](https://developers.google.com/search/docs/appearance/ai-features).

SNS: Instagram/Threads에서 아직 문제를 인식하지 못한 부모에게 사실 기반 차이를 제시한다. `같은 생활권 학교 규모 차이`, `초1 실제 하교시각`, `방과후 총수와 초1 가능 수`, `맞벌이 오후 계획 예시` → 공개 근거 페이지 → 우리 학교 찾기/관심학교 저장/입학준비 시작. 계정 게시/메시지 전송은 이번 문서 작업에 포함하지 않는다.

사용자가 제시한 `1,224명 vs 68명`, `방과후 28개`는 아직 검증하지 않은 콘텐츠 아이디어다. 같은 학년도·학교급·분교 포함 여부·집계 분모를 대조한 후에만 사용한다. 학생 수만으로 폐교 위기·학교 질·돌봄 선정 가능성을 주장하지 않는다. 기존 SchoolCarePanel의 인원 비율도 선정 가능성을 설명하는 근거로 승격하지 않는다.

landing별 CTA와 UTM은 channel/campaign/content_id만 유지하고 개인 시간표 ID·초대 토큰·반·가족 정보는 넣지 않는다. 일정 저장/수요 제출 전후 출처 기여를 연결하되 GA에 가족 식별자를 넘기지 않는다. AI 응답의 직접 노출은 모두 측정할 수 없으므로 referral/검색유입·정기 질문 점검을 구분한다.

## 8. 경쟁사 비교 — 공식 소개 확인 기준

확인일 2026-10-06. 아래는 공식 웹/개발자 앱스토어 설명 기준이며 설치 후 사용성·coverage 테스트는 아니다. `미확인`은 기능이 없다는 뜻이 아니다. 별점/다운로드 수/매출을 경쟁 우열의 근거로 쓰지 않는다.

| 제품 | 확인된 주요 기능 | 이번 Wherecho와 겹침 | 추가 확인 필요 |
|---|---|---|---|
| 골든갭(구 Studay) | NEIS 시간표, 학교/학원 일정, 보강, 빈 시간, 가족 공유 소개 | 자동 시간표·수동 일정·공유·공백 | 입학 전 추정의 근거 체계, 학교 운영계획 ETL, 학교별 익명 수요 공개 |
| 다다링 | 반복 주간/다음 학기 시간표, 가족 공유, 알림장 AI, 학원 검색 소개 | 시간표·가족 일정·자료 구조화 일부 | NEIS 자동연동 범위, 학교별 방과후/돌봄 계획 coverage와 공개 수요 |
| 하루메이트 | NEIS/직접 시간표, 학원 일정, 가족 기능, 방학 모드 소개 | 수업/학원·가족·방학 일정 | 보강 예외의 현행 지원 범위, 사전 계획 provenance, 공개 수요 |
| Wherecho 제안 | 배정 SEO→입학 전 활성화→운영계획 기반 시간표→익명 수요 | 편집/공유는 기본 기대치 | ETL 정확도와 학교 밀집 참여가 실제 차별화되는지 실험 필요 |

근거: [골든갭 개발자 소개](https://play.google.com/store/apps/details?hl=ko&id=com.sosisters.studay), [다다링 공식](https://www.dadaring.com/), [다다링 가족 공유 FAQ](https://www.dadaring.com/faq), [하루메이트 개발자 소개](https://apps.apple.com/kr/app/하루메이트/id6760273701). 기능 차별화는 검증 가설로 다루며 경쟁사에 해당 기능이 전혀 없다고 주장하지 않는다.

## 9. 이벤트/분석 및 go/no-go

Audit 1 학교·콘텐츠·저장·로그인·추천 이벤트를 유지하면서 다음 이벤트를 추가한다. 성공 이벤트는 실제 저장/수락 후 서버에서 한 번만 기록하고 attempt_id/revision으로 중복 제거한다. 모드별/학교별 집계는 접근제한 분석 저장소에서 처리한다.

| 이벤트 | 발화 | 최소 속성 |
|---|---|---|
| schedule_start | 학교 선택 후 편집 첫 진입 | attempt_id, mode, cohort, acquisition_source |
| schedule_generate | 블록 생성 완료/실패 | attempt_id, source_coverage_band, unknown_present, result |
| schedule_save | 저장 commit 성공 | attempt_id, mode, revision, result |
| program_select / schedule_manual_add | 부모 선택/직접 입력 완료 | kind, evidence_status, participation_status; 자유입력명 제외 |
| schedule_exception_create | 보강/일회/취소 저장 | exception_type |
| family_invite_accept | 초대 수락 완료 | role; 토큰·email 제외 |
| unmet_slot_prompt_view | 실제 안내 노출 | mode, window_version |
| unmet_slot_activity_submit | 자유시간/아직모름 포함 응답 저장 | activity_enum, pickup_need_enum, consent_state |
| demand_publication / demand_view | 승인 snapshot 공개/열람 | snapshot_id, suppression_state, window_type |
| source_change_review | 갱신 차이 적용/보류 | source_version, decision |

학교/학년/정확 일정·가족 연결 분석은 최소권한 first-party 집계로 두고 GA에는 개인 일정/반/가족 ID/자유텍스트를 전송하지 않는다. 로그 보관·동의·삭제 정책을 Auth 단계에서 정의한다.

초기 판정안은 사용자가 제시한 **가설이며 업계 benchmark가 아니다**. 숫자만 넘으면 출시하는 규칙이 아니라 coverage/오류/개인정보 gate와 함께 본다.

| 가설 | 분자/분모와 관측창 제안 | 판정 |
|---|---|---|
| start→save 50%+ | 첫 start 후 7일 내 저장한 고유 가정 / 첫 start 가정; 마지막 유입은 7일 관측 후 포함 | 모드/학교/채널별 분리 |
| 저장자 중 미계획 시간 30%+ | 7일 내 사용자 지정 구간에서 유효한 미계획 구간이 확인된 가정 / 저장 가정 | unknown 시간표는 구분해 coverage도 표시; 빈 시간을 인위적으로 만들지 않음 |
| 미계획 중 활동입력 50%+ | 안내 대상 중 의향 저장 가정 / 유효 미계획 구간 가정 | 자유시간/아직모름 포함 응답률과 구체 활동 선택률을 별도 표시 |
| 학교 20~30%에서 반복 cluster | 동일 학교/학년/요일/bucket/활동에 5고유가정 이상이 2개 연속 주간 snapshot에서 유지된 학교 / 사전 등록 테스트 학교 전체 | 최초 검증은 20% 탐색 신호, 30% 확대 목표로 제안 |

집중 모집: 사전 지정 10~20학교, 4~6주 관측안. 학교당 20가정 start를 모집 목표로 놓되 충분한 통계 검증을 보장하는 수는 아니다. 실제 n/신뢰구간/자료 coverage를 함께 보고하고 미달이면 실패가 아닌 표본 부족 hold로 표기한다. 같은 응답이 단순 잔존한 반복 cluster와 새/재확인 참여가 있는 cluster를 따로 보고한다. 3월 실제모드는 별도 후속 cohort에서 확인한다.

Go: 핵심 정확도/권한/억제 gate 충족 + 충분한 관측에서 가설 신호. Hold: 모집·자료·관측 부족. No-go/재설계: 잘못된 확정표, 수요 역산/개별 유출, 자료 확보가 지속 불가, 충분한 표본에도 저장/입력 실패 반복. 전체 학교 수를 늘려 밀집 부족을 숨기지 않는다. 초기 KPI에 결제/리드/학원 매출 없음.

## 10. 코드 재사용/수정/신규 audit

| 파일/영역 | 처리 | Audit 2 변경 근거 |
|---|---|---|
| src/utils/urlState.ts, App.tsx | Modify | 현재 1~2 segment parser; 새로운 private/nested route를 별도 처리, 기존 map 복원 유지 |
| layout/BottomNavigation, MainLayout | Modify | 최종 4GNB·로고, MY 시간표 진입; 현재 라벨 변경은 보존 |
| SchoolDetail/ApartmentDetail/dataService | Keep + 제한 확장 | 기존 데이터 읽기와 관심학교→시간표 진입 추가. 개인 데이터 query를 별도 service로 분리 |
| AppContext | Keep | 지도 state에 가족 일정 state를 밀어 넣지 않음 |
| profile/favorites/roadmap | Modify | local record 보호, cloud/family scope의 명시적 이전 |
| SchoolCarePanel/collect_care_data.py/SQL23 | Keep + 표시 검토 | 공시 aggregate 재사용; 정원/선정 가능성/초1 대상/시간 inference에 사용 금지 |
| collect_academy_snapshot.py/academy helpers | Keep + 별도 보강 | NEIS 수집·좌표 재사용, 대상학년 grade와 travel-time 실험 추가 |
| region_registry, schoolinfo matching | Reuse | 학교 identity crosswalk의 증거로 사용; 이름만 연결 금지 |
| operational ETL/audit/review_verdicts | Keep | 독립 program review queue가 재사용할 운영 패턴, 기존 verdict file에 혼합하지 않음 |
| api/detail.js, build-shell-pages/build-seo/public-smoke | Keep + additive | 기존 상세 URL 보호, 새로운 공개 수요 경로 priority와 private cache/noindex 검증 |
| curriculum lib/voter/SQL24 | 보존/보류 | 운영 미적용, 새 시간표 Auth의 기본 전제로 간주하지 않음 |
| 새 etl/school_programs 도메인(제안) | New | sources/extract/validate/review/publish; raw와 public serving 분리 |
| 새 scheduleEngine/scheduleService(제안) | New | 순수 시간 구간 엔진과 DB 저장 분리; revision/source overlay |
| 새 family/demand services(제안) | New | 가족 권한, 초대, 수요 의향과 공개 집계 경계 |

기존 학원 갱신 작업의 `docs/operations/ACADEMY_REFRESH_PLAN.md`는 사용자 변경으로 보존하며, 주소집계 스키마 변경이 필요하면 그 작업과 충돌 범위를 먼저 대조한다. 현재 단계는 TypeScript/SQL/ETL 실행 파일을 수정하지 않는다.

## 11. 영향도와 migration plan — 적용 전 보고

| 변경 | 영향 | 위험/완화 |
|---|---|---|
| 4GNB/새 경로 | parser/App titles/static build/Vercel rewrites | 라우트 fixture와 production deep-link 회귀, 기존 상세 canonical 유지 |
| 학교 external IDs + 문서/program 계층 | 기존 school_id 참조 | 이름 추정 연결 차단, nullable crosswalk, 기존 master rewrite 없음 |
| Auth/MY/family | local 저장·관리자 세션·RLS | 단계적 import, 계정/가족 경계와 idempotency 검증 |
| public demand | 원본 가족 데이터가 공개로 변환 | private raw + 제한된 publish worker + 억제된 snapshot만 공개 |
| 주변 학원 설명 | 기존 거리 contract·분류 | 거리와 시간·대상학년 신뢰등급을 서로 다른 필드로 유지 |
| DB 최소권한 | legacy/운영 RPC/기본 grants | 호출자 inventory와 staging 검증 후 별도 migration; 일괄 RLS 적용 금지 |

실행 순서:

1. 변경 전 baseline 확보: URL sample, 공개 table/RPC contract, schema/권한 snapshot, localStorage 샘플, git diff. 키/개인 데이터는 보고서에서 제외.
2. 모든 새 객체/enum/FK/index/RLS/schema exposure의 이름 충돌을 live DB와 재대조. 실제 catalog query 결과를 저장해 재현 가능한 diff 생성.
3. 격리 개발 DB 또는 로컬 DB에서 additive migration 작성. migration 번호/도구는 저장소 운영 방식과 맞추며 지금 SQL 파일을 임의 발급하지 않음.
4. source registry→crosswalk→documents→program/calendar serving 순서. private raw/parse→approved public projection으로 단방향 publish. `is_current` 전환은 atomic하고 직전 approved version을 유지.
5. profiles/개인 interests→families/members/invites→learner/schedule/entries/exceptions 순서. 복합 family FK 또는 정책으로 타 가족 schedule ID 참조 차단.
6. unmet intents(private)→worker aggregation→demand snapshots(public) 순서. 읽기 role로 원본 접근 불가와 4/5가정·합계 역산·철회 테스트.
7. Auth flag와 schedule flag는 별도 rollout. 첫 로그인은 기존 local 데이터를 제안/병합하고 성공 확인 전 삭제하지 않음. 가족 생성/참여도 임의로 다른 가족에 합치지 않음.
8. 10~20학교 allowlist의 feature rollout 후, 새 public demand route를 prerender보다 먼저 판별. 개인 route는 CDN public cache 금지 및 noindex; public snapshot만 캐시.
9. lint/typecheck/build, public smoke 최종 exit, Auth/family RLS, ETL gold set, schedule unit/통합, 수요 privacy 테스트와 대표 학교 UI 확인.
10. root Vercel config 및 master/release runbook에 맞춰 배포. old URL/robots/sitemap/OG·개인 cache·callback·집계를 production에서 재검증.

복구: feature flag로 새 진입을 끄고 기존 map/guide/MY local 흐름으로 복귀. 새 table은 즉시 drop하지 않고 쓰기/publish를 중지, 읽기 호환 유지. source/serving snapshot은 직전 승인본으로 되돌리되 사용자 override를 삭제하지 않는다. 수요 노출 결함이면 public snapshot/API/cache를 우선 비공개 처리하고 원본 접근을 점검한다. destructive down migration은 자동 실행하지 않는다.

현재 보고 시점의 중단선: 위 영향도와 migration 계획을 먼저 공유했으며, 운영 schema/라우트 대규모 변경은 아직 수행하지 않았다. 다음 실행은 source inventory·live diff·순수 엔진 fixture 등 검토 가능한 자료부터 진행한다. Auth 설정 조회 권한/연결이 확인될 때까지 실제 provider 활성화·callback 검증 완료로 표시하지 않는다.

## 검증/진행 기록

- 2026-10-06: 11개 설계 산출물 작성, 공식 경쟁사/NEIS/학교알리미/검색 문서 확인. 제품 기능 실측으로 포장하지 않음.
- Audit 1과 기존 실행 계획은 내용 보존. 운영 TODO에는 Audit 2 절을 추가하고 이전 체크 이력을 유지.
- DB에는 catalog SELECT만 수행. 외부 계정 설정/데이터 업로드/게시/배포 없음.
- 남은 검증: 최신 Auth 설정, 전체 schema diff, browser smoke 최종 결과, 실제 50~100학교 문서/NEIS coverage, HWP/PDF parser 성능, 10~20학교 모집과 전환율. 문서 작성 완료와 이 작업들의 완료는 별개.
