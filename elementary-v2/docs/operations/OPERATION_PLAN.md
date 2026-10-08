# ETL Operation Plan

Last updated: 2026-10-06

Release status: **v2.0 operational baseline complete; v2.1 released; v2.2 interaction work in progress; nationwide expansion live — all seventeen regions are deployed to the public site as of 2026-09-28, with the pooled manual review still outstanding.**

This document is the single checklist for the school-zone, school, apartment, Supabase, frontend, and candidate data-domain pipeline. Update it whenever a task is completed, deferred, or blocked. Dated analysis reports and their reproduction code are archived outside the active application tree.

## Status Rules

- `[x]`: completed and verified
- `[ ]`: pending work
- **Deferred**: intentionally postponed; not a current blocker
- **Issue**: requires monitoring, review, or a later correction

<a id="platform-expansion"></a>

<a id="audit2-expansion"></a>

## Audit 2 — 시간표·익명 수요 확장 (2026-10-06)

기준 문서: [Audit 2 / 11개 산출물](../product/PLATFORM_EXPANSION_AUDIT2_20261006.md). 아래 Audit 1 체크 이력과 문서는 foundation으로 보존한다. 현재 실행 순서는 이 Audit 2 절을 우선하며 A1 P6/P7 사업/UGC 확장은 이번 범위에서 실행하지 않는다. 입점·결제·수수료·상담/수업중개·셔틀·학원 숙제 LMS·수익화 제외.

### 2026-10-07 재정렬 — 현재 실행 순서

E04 조사 결과(학교알리미는 전년도 예상값, 확정값은 2월 이후 기수별 가정통신문)에 따라 사용자 결정으로 순서를 바꿨다. **비로그인 "초1 하루 예상" 카드를 로그인보다 먼저** 내고, 파일럿 추출은 규칙+사람 검수로 하며, 로그인 설정은 10월 중 사용자가 시작한다. 아래 표가 Phase 1~3 표의 순서보다 우선한다.

| 시기 | 항목 |
| --- | --- |
| ~10월 말 | A2-R01 → E04-c2b·A2-R02 → E04-c3 → E06(축소) / 병행: I01, P1-02~03, S01·S02 / 사용자: B04-b |
| 11월 | A2-R03 공개 계약·영향 보고·B03-W gate → A2-R04 예상 카드 |
| 11~12월 | 로그인(카카오 우선) → MY 시간표 개인 저장·직접 입력(S04~S06 중 개인 범위) |
| 1월 | E04-d 2027 계획 게시 감시, 가족 공유 |
| 2월 | 분당 20곳 1기 가정통신문 수집 → 신청 모드 |
| 3월~ | 실제 모드, Phase 3(U01~U07)은 표본을 보고 판단 |

- [x] A2-R01 NEIS 1학년 시간표 60학교 전체 조회 → 학교별 요일별 교시 수. 2026-10-07: [결과](../research/audit2/NEIS_GRADE1_PERIODS_20261007.md). 59/60 조회, 1학기 평시 50곳(요일 칸 244/250이 일치율 0.8 이상), 2학기 57곳. 문서 표 14곳 중 12곳 요일 5개 완전 일치. 전남 9곳은 1학기 NEIS 자료 없음(2학기만). 3월 주차별: 1주차 21/43곳이 매일 4교시 이하, 3주차부터 대부분 평시 패턴. node 테스트 3개 PASS.
- [x] A2-R02 15-라 방과후·돌봄 계획 60/60 첨부에서 돌봄 운영시간·대상학년·정원·1~2학년 방과후 시작 시각 후보 추출(규칙+검수, `etl/school_document_text.py` 재사용).
  2026-10-07 **1차 검수(assistant)**: `python -m etl.audit_schoolinfo_care_plans`(탐지 43/60, 테스트 5개 PASS) → 원문 검수 [검수 값](../research/audit2/care_review_first_pass_20261007.json) → [요약](../research/audit2/CARE_HOURS_FIRST_PASS_20261007.md). 1학년 돌봄 시간 44/60 확인(기본 종료 17:00 16곳·19:00 18곳 등, 저녁·연장 포함 최대 19:00 32곳), 아침돌봄 17곳, 시간 미기재 16곳은 학교 확인 필요. 2026-10-08 사용자 결정: 카드는 기본 종료와 저녁·연장을 분리 표시하고 연장 조건·정원·선발제 안내를 붙인다.
  - [ ] A2-R02b **Deferred** 1~2학년 방과후 시작 시각: 기수별 가정통신문(2월 1기)에서 확정되므로 E04-d와 함께 수집.
- [x] A2-R03 예상 카드 공개 데이터 계약: 공개 테이블/RPC 설계(검수 통과 행만, 출처·기준연도·`estimated` 표시 필수), §11 영향 보고, B03-W 쓰기 권한 gate. 운영 적용은 사용자 확인 후.
  2026-10-08 **설계·초안 완료, 미적용**: [영향 보고](../research/audit2/SCHOOL_DAY_CARD_CONTRACT_20261008.md), `sql/26_create_school_day_estimates.sql`(공개 읽기 3테이블, 기본 쓰기 grant 회수), `etl/load_school_day_estimates.py`(dry-run 35/175/60행, 제약 위반 0, 테스트 4개 PASS). EXECUTION_GUIDE 26 추가. **운영 적용 사용자 승인 대기.**
- [x] A2-R04 학교 상세 "초1 하루 예상" 카드: 요일별 예상 하교·돌봄 종료, 출처·기준일, "전년도 기준 예상" 문구, 자료 없는 학교 fallback. 분당 20곳 중 검수 통과 학교부터. lint/typecheck/build/public smoke.
  2026-10-08 **로컬 구현·검증 완료, 미배포**: `src/components/school/SchoolDayEstimateCard.tsx`(학교 상세 StartModule 아래), `getSchoolDayEstimate`(SQL 26 미적용 시 null → 카드 숨김), 타입 3개. 요일별 예상 하교(추정·학교 확인 표시), 점심 위치 문구, 돌봄 기본·연장 분리, 출처·예상 안내. SQL 26 적용 전 확인용 dev 전용 fixture(`--write-fixture`, git 제외, 운영 번들 미포함 확인). typecheck·lint·build PASS, 360/1280px 넘침 없음, 로컬 public smoke exit 0. 측정 이벤트 `view_school_day_estimate` 문서화. 2026-10-08 **운영 반영**: 사용자 SQL 26 적용 → anon GET 200·POST/PATCH/DELETE 전부 42501 → `--apply` 35/175/60행 → master `df14027`(작업분만 선별 커밋, 격리 worktree에서 typecheck·lint·vite build 확인) → release `c27530f` → 약 3분 후 반영, 운영 public smoke exit 0, wherecho.co.kr에서 상탑·마량 카드와 비파일럿 학교 카드 숨김 확인. DATA_CONTRACTS·루트 CLAUDE.md 공개 계약 목록 갱신.
- 범위 조정: E05 LLM 파이프라인은 100곳 이상 확장 때 착수. E06 정답 세트는 분당 20곳 × 필드 4개(1학년 요일별 하교, 점심, 돌봄 종료, 1~2학년 방과후 시작)로 축소. **보류**: E07 학원 이동시간, S03 보강·동시편집, U01~U03 수요 공개, E02 청산초 1곳(분당 표본 밖).
- 사용자 작업: B04-b 로그인 공급자 설정 — [설정 체크리스트](AUTH_PROVIDER_SETUP.md).

### 문서 산출물 (구현/실증 완료와 구분)

- [x] A2-D01 Audit1 유지/충돌/변경 mapping. 2026-10-06: Audit2 §1.
- [x] A2-D02 통합 Product Thesis/사용자여정. 2026-10-06: §2.
- [x] A2-D03 IA/GNB/공개·로그인 경계 개정안. 2026-10-06: §3, 4GNB와 로고 HOME 유지.
- [x] A2-D04 Phase1/2/3 로드맵. 2026-10-06: §4, ETL 50~100학교와 사용자 10~20학교 구분.
- [x] A2-D05 ETL PoC/schema/confidence gate 설계. 2026-10-06: §5; 실제 수집·정확도 미검증.
- [x] A2-D06 시간표 MVP/상태/UX/가족·수요 모델. 2026-10-06: §6.
- [x] A2-D07 SEO/AEO/GEO/SNS funnel. 2026-10-06: §7; 예시 숫자는 미검증 아이디어 표시.
- [x] A2-D08 경쟁사 공식 소개 비교. 2026-10-06: §8; 설치/실사용 비교는 미실시.
- [x] A2-D09 이벤트/지표 분모·관측창/go-no-go 제안. 2026-10-06: §9; 사용자 가설임을 명시.
- [x] A2-D10 코드 재사용/수정/신규 audit. 2026-10-06: §10 및 실제 school/care/academy 컬럼 확인.
- [x] A2-D11 영향도/적용순서/복구 계획 선행 보고 문서. 2026-10-06: §11; 실제 migration 미실행.

### Phase 1 — 운영 기준선과 ETL 가능성

- [x] A2-B01 운영 DB catalog 1차 조회 결과를 기준선에 기록. 2026-10-05~06: core RLS/정책/grant, curriculum refs/likes 부재, school/care/academy 실컬럼 확인. 전체 migration diff 완료는 아님.
- [x] A2-B02 HTTP smoke 부분 PASS와 browser 최종 결과 미확인을 구분해 기록. 2026-10-06: 세션 29285 최종 회수 불가. 전체 통과 아님.
- [x] A2-B03 SQL06~24 대비 live column/FK/index/RPC/policy/grant 및 호출 영향의 **읽기 감사 범위 완료**. 2026-10-06: [기준선](../research/audit2/SCHEMA_BASELINE_20261006.md) → [정의 대조](../research/audit2/DEFINITION_DIFF_20261006.md) → [읽기 역할 검증](../research/audit2/READ_ONLY_VERIFICATION_20261006.md). 보안 수정·실로그인·쓰기·전체 PostgreSQL 실행 동등성 완료는 아님. Docker는 선행조건에서 제외.
  - [x] A2-B03-a live catalog·유효 grants·default ACL·보안 함수 본문 저장. 24테이블/1뷰, 380컬럼, 26FK, 108인덱스, 12정책, 68함수. 운영 변경 없음.
  - [x] A2-B03-b SQL06~24 전체 19파일 선언 존재 대조와 SHA256 기록, 오프라인 비교기 5개 테스트 통과. 06~23 이름/컬럼 존재, SQL24 2테이블/3함수 부재. 정의 동등성 증명은 아님.
  - [x] A2-B03-c legacy RLS-off·client 기본 쓰기 grants·monitoring definer RPC의 저장소 호출자 및 조치 영향 기록. 실제 쓰기 테스트/권한 변경 미실시.
  - [x] A2-B03-d 최종 정의 대조와 제한된 읽기 역할 검증 완료. Data API 전체 노출 설정 및 저장소 밖 소비자는 미확인 목록으로 기록; 실제 변경 전에 확인.
    - [x] A2-B03-d1 컬럼 290개(type/정밀도/nullable/default)·FK 23개(action 포함)·인덱스 40개·함수 13개(identity/body/result/config) 대조, 정책 4개 구조 차이와 deparser 표기 차이 기록. SQL24 미적용 유지. 테스트 17개 통과, 운영 변경 없음.
    - [x] A2-B03-d2 Docker 없이 READ ONLY transaction의 anon·비관리자 authenticated·익명 authenticated claim 모사 SELECT 검증. 원본 데이터 존재/역할 non-bypass 확인, 공개 조회 가능·관리자/private 행 비노출. 실제 JWT 로그인/실관리자 positive/쓰기/성능 테스트 아님.
- [ ] A2-B03-W **Deferred — 변경 적용 전 gate**: 별도 테스트 DB 실제 관리자/owner/non-owner 쓰기 allow/deny·정책 성능·외부 소비자 검증. 현재 읽기 감사와 PoC를 막지 않음. legacy grants/definer RPC 보안 개선은 아직 미적용.
- [ ] A2-B04 Auth provider/redirect/linking 운영 설정 확인. 2026-10-06: 공개 settings GET 성공, 부분 완료. 이전 자동 승인 사용량 제한은 이번 요청에서 재발하지 않음.
  - [x] A2-B04-a 공개 provider 확인: email=true, kakao/google/anonymous_users/phone=false; disable_signup=false, mailer_autoconfirm=false. 설정 변경·가입·로그인 없음.
  - [ ] A2-B04-b 관리 설정의 site_url/redirect allow-list/manual identity linking 및 실제 callback 확인. **담당: 다른 팀원(2026-10-08 사용자 지정)** — 설정 순서는 [AUTH_PROVIDER_SETUP](AUTH_PROVIDER_SETUP.md). 공개 응답/현재 연결 도구로 확인 불가; 로그인 구현/배포 전 gate.
- [x] A2-B05 운영 public smoke 최종 exit 0/PASS(세션 88596), wherecho.co.kr 검색/지도·학교/단지 deep link·MY·콘텐츠·360~1280px 확인. 이름 검색 지원, 임의주소 배정/polygon UI 미확인·미지원 범위 구분. [검증 기록](../research/audit2/READ_ONLY_VERIFICATION_20261006.md).
- [ ] A2-B05-P **Issue**: smoke 최종 성능 배열이 빈 값이라 시간 gate 통과만으로 실측 성능을 입증하지 못함. 계측 누락 및 최소 표본 gate 보완; 기능 smoke 완료와 구분.
- [x] A2-B06 최소 URL/영구 ID/localStorage/checklist·guide/지역 QA 보호 fixture 고정. 2026-10-06: [최소 기준선](../research/audit2/MINIMUM_PROTECTION_BASELINE_20261006.md), 실제 helper 메모리 검증 28개 PASS. 기존 QA 912행/15 scope의 표본 참조(새 전국 재검수 아님). 별도 학원 refresh/실험 기능 정리 변경 보존. 개편 착수 gate 완료; 검증 범위를 선행조건으로 계속 확대하지 않음.
- [x] A2-E01 60학교 PoC manifest와 분모 고정. 2026-10-06: [PoC 착수](../research/audit2/ETL_POC_START_20261006.md). 분당 development/밀집 후보20, 서울·인천 holdout20, 부산·전남 coverage20. 공개 master READ ONLY 선정, 6개 integrity 검사 PASS. 학교 자료 확보/NEIS crosswalk/모집 성공/운영 공개는 아직 아님.
- [ ] A2-E02 school_id↔NEIS office/school code↔schoolinfo_code crosswalk 검증. 2026-10-06 **부분 완료**: 최신 [기존 ETL+Schoolinfo 재검증](../research/audit2/NEIS_RECONCILIATION_20261006.md) 59/60 연결, 청산초 1개 실주소 원천 상충 보류. 기존 master 변경 없음. 최초 47/13 결과는 비교 이력으로 보존.
  - [x] A2-E02-a 공개 schoolInfo 3,039행/6페이지 조회, 47개 유일 code·13 보류 큐 증거 보존. Node 12개/Python evidence 6개 검사 PASS. 표본 교체/유사 이름 자동 연결 없음.
  - [x] A2-E02-b [기존 ETL 규칙+Schoolinfo 재검증](../research/audit2/NEIS_RECONCILIATION_20261006.md): 현재 공개 주소 READ ONLY 확인, 기존 canonicalize_address/current_district 함수 직접 재사용, Schoolinfo code/이름/주소 대조 및 입력 hash. 현재 59/60 연결; 청산초는 NEIS 청산로1602-1 ↔ Schoolinfo1579-74 실주소 차이로 보류. 13개 원문 보류는 역사 이력이며 현재 미해결은 1개. 8개 테스트 PASS. 운영 주소/지역 체계 변경 없음.
- [ ] A2-E03 NEIS 실제 응답·일과표·학사일정 sample 수집, 교시와 절대시각 분리 계약 검증. 2026-10-06 **부분 완료**: 최신 전남 포함 5학교/10응답, 376행 수신/120행 한정 fixture. 일과표 절대시각 미확보, 2026 자료를 2027 확정으로 사용하지 않음. 최초 4학교/8응답 이력 보존.
  - [x] A2-E03-a 실제 API 응답·총 건수·페이지 SHA256·sample truncation 기록, 교시/반/날짜 보존 및 시작·종료 null 유지. 전체 60학교 coverage/개인 시간표/원문 archive 완료는 아님.
  - [x] A2-E03-b 재검증 code로 전남 포함 5학교/10응답 보완: 376행 수신/120행 한정 fixture, 전남 영광중앙초 시간표92/학사일정14. 절대시각은 여전히 미확보이며 개인 확정 시간표 아님. 2026-10-06 E04-b 첨부 검토에서도 정규 일과 시각은 발견되지 않음(E04-c).
- [ ] A2-E04 교육청/학교알리미 첨부/학교홈페이지 HWP/HWPX/PDF 수집 registry, hash/version/current/last_checked 구현.
  - [x] A2-E04-a 개발학교2 × 자료3종 = 6슬롯 source registry와 제한 공개 게시판 probe 구현. 3게시판 HTTP200/게시판 응답hash/last_checked/상세글 후보31개, 5개 parser 테스트 PASS. 첨부 문서 hash/version/current와 일과표 절대시각은 아직 미검증; 게시판 hash와 문서 hash를 구분. 남은 미발견3슬롯 유지, holdout 규칙 조정 없음.
  - [x] A2-E04-b 개발학교2 첨부 확보·학년도 판정. 2026-10-06: [첨부 검토](../research/audit2/DOCUMENT_ATTACHMENT_REVIEW_20261006.md). PDF3+본문 이미지1 확보, 두 번 수집 문서 hash 동일. 4건 모두 2026학년도(제목·요일 18개 정합), 2027 문서 없음. 방과후·돌봄 블록 시각은 school-plan/현재 기수 근거로 [필드 기록](../research/audit2/document_attachment_review_20261006.json), 계획안↔3기 안내 차이(금요일 강좌 미개설·수강료 변경)와 원문 오기 3건은 source_conflict로 보류. 수집기 본문 이미지 탐지 추가, node 테스트 12개 PASS. 강사·전담사 이름/연락처 미복사. 운영 DB 변경 없음.
  - [x] A2-E04-c **정규 일과(교시 시작·종료, 하교) 시각 출처**. 2026-10-08 c1~c3 완료로 닫음: 학교알리미 2-가 시정표 × NEIS 교시 수, 파일럿 35곳 중 31곳 요일별 예상 하교 확정. 2026-10-06: 확보한 4건 어디에도 없음 → 두 학교 모두 unknown. 학사 게시판·교육과정 운영계획·학교알리미 교육과정 공시에서 찾고, 없으면 학교 문의 대상으로 기록. 방과후/돌봄 시작 시각으로 하교시각을 추정하지 않음.
    - [x] A2-E04-c1 중앙 출처 조사. 2026-10-06: [학교알리미 조사](../research/audit2/SCHOOLINFO_SOURCE_SURVEY_20261006.md). 60/60 SHL_IDF_CD 연결, 2-가(4월) 첨부 59/60·15-라(5월) 60/60. 전체본 PDF 8개 중 5개 시정표 명시·1개 암시([표본](../research/audit2/schoolinfo_daily_clock_sample_20261006.json)); 한솔 발췌본에는 없음. 15-라 첨부 7개는 2025학년도 파일. 첨부 3/4이 HWP 계열. 별도 교육청 통합저장소는 확인되지 않아 출처 순서를 학교알리미 → 학교 홈페이지로 정정. node 테스트 5개 PASS.
    - [x] A2-E04-c2 HWP/HWPX 판독 경로 결정 후 2-가 59학교 시정표 유무 전수 판정. 2026-10-07: [비교·판정](../research/audit2/SCHOOLINFO_SOURCE_SURVEY_20261006.md#e04-c2-판독-방식-비교와-60학교-전수-판정-2026-10-07). 로컬 추출(HWP/HWPX/PDF) 채택 — 미리보기와 HWPX 결과 동일, 미리보기는 HWP 변환 실패·결과 1분 내 만료. 시정표 탐지 35/60, 이미지 표 1, 미탐지 23(발췌본 위주), 첨부 없음 1. 1학년 요일별 교시 수 14곳. 단위 테스트 12개 PASS. 탐지 구간에 인접 표가 섞일 수 있어 필드값은 미확정.
    - [x] A2-E04-c2b 탐지 구간에서 `school_day_periods`(학년 범위·교시·시작·종료·점심·요일별 교시 수·입학 초기 적응기) 후보 추출 → E05 검증기·검수. 이미지 표(효성)는 OCR 또는 수동.
      2026-10-07 **1차 규칙 추출**: `python -m etl.extract_school_day_periods` → [후보](../research/audit2/school_day_periods_candidates_20261007.json). 시정표 35곳 중 19곳은 요일별 예상 하교 완성(무플래그 8, 다중 표 플래그 11), 16곳 미완(학년군·요일별 열 배치, 점심 순서 오독, 전남 2학기 목·금 NEIS 불일치, 청산 NEIS 코드 없음). 검수 창은 `etl/runtime/audit2-documents/review_windows_20261007.md`(git 제외). 사람 검수 전이라 전부 `not_approved`.
      2026-10-07 **1차 검수(assistant)**: 35곳 원문 표를 읽어 [검수 값](../research/audit2/school_day_review_first_pass_20261007.json) 기록 → `python -m etl.build_grade1_dismissal_estimates` → [요일별 예상 하교](../research/audit2/GRADE1_DISMISSAL_FIRST_PASS_20261007.md) **31/35 완성**. NEIS↔문서 교시 수 충돌 1곳(성남화랑 월), 1학년 점심이 4교시 앞인 학교 4곳, 추론값 3곳. NEIS에 2학기 초 구간(8/24~9/4) 추가. 규칙 버그(우유급식을 점심으로 읽음) 수정, 테스트 12개 PASS. 2026-10-07 **사용자 확인 완료**: 화랑 월 NEIS 유지, 추론값은 `inferred`(추정 표시), 점심이 4교시 앞인 해석 확정, 빈 요일은 `school_check_needed`(학교 확인 필요). 추정 9개 요일·확인 필요 8개 요일. 이미지 표(효성)와 시정표 미탐지 23곳은 범위 밖.
    - [x] A2-E04-c3 2025↔2026 공시 시정표 동일 학교 비교로 연도 간 변동률 측정(전년도 기준선 `estimated` 사용 근거). 2026-10-08: [비교](../research/audit2/YEAR_OVER_YEAR_STABILITY_20261008.md). NEIS 1학년 요일 패턴 48곳 중 45곳 동일(요일 칸 237/240), 시정표 핵심 시각 26곳 중 25곳 동일(영광중앙만 10분 이동). 전년도 값을 `estimated`로 쓰는 근거 확보. `--ay=2025` 수집 모드, `etl/compare_daily_clock_years.py` 추가.
  - [ ] A2-E04-d 2027학년도 계획 게시 감시(통상 12~2월)와 양영초 2~4기 안내 수집. 새 hash 발생 시 E04-b 검토 반복.
- [ ] A2-E05 LLM 후보 추출+필드 evidence+deterministic validation+confidence/review gate 구현. 승인 전 publish 금지.
- [ ] A2-E06 gold set 분리 평가: 시간/학년/요일 정확도, unknown/학교 coverage, 검수 시간/비용, 버전 교체 안정성 보고.
- [ ] A2-E07 학원 초등대상 3등급과 이동시간 데이터 접근/품질 조사. 기존 거리 contract 유지.
- [ ] A2-I01 보호 경로를 유지한 5GNB(홈/학교 찾기/입학 준비/학습 준비/MY, 2026-10-08 사용자 결정: 홈 유지)/학교→학습 준비 시간표 조회→MY 시간표·대안 UI 구체안과 route fixture 작성. 실제 라우트 적용 전 영향 재확인.

### Phase 2 — 시간표 MVP와 가족 상태

- [x] A2-S01 planning/application/actual 및 evidence/participation/transition 독립 상태 타입·fixture 작성. 2026-10-08: `src/utils/schedule/types.ts`(세 축·전이 규칙·학기/방학·오후 구간·날짜 덮어쓰기), `fromSchoolData.ts`(SQL 26 하교·돌봄 → 일정; 하교는 estimated, 학교 확인 요일은 unknown, 돌봄 기본·연장 분리, 기본 참여 considering). fixture는 반안초 운영 값 모양.
- [x] A2-S02 정규+선택 방과후/돌봄+수동 일정 순수 엔진, unknown 시각/충돌/단축/방학 처리 검증. 2026-10-08: `src/utils/schedule/engine.ts` `computeDay`/`computeWeek` — [start,end) 이어짐≠겹침, 점유는 planned/applying/confirmed만, 돌봄∩방과후는 `care_afterschool`로 충돌과 구분, 이어지는 일정의 미확인·금지 이동, 공백 confirmed/estimated/uncertain 분리, 하교 모름이면 공백 분 미산출, 단축·방학 덮어쓰기. 정규수업 시작은 자료에 없어 09:00 가정(오전 겹침 판정에만). `npm run test:unit` 16개 PASS, lint/typecheck/build 통과(번들 미포함). 화면 연결·저장은 S06·로그인 이후. 일회 취소·보강은 S03.
- [ ] A2-S03 반복/일회/보강/취소 override와 source revision diff·동시편집 처리.
- [ ] A2-S04 Auth·profile·개인 저장→가족 membership RLS와 초대 만료/취소/수락 설계·격리 DB 테스트.
- [ ] A2-S05 local 기록 import/계정 충돌/로그인 취소 후 복원, 가족 viewer/editor/owner 권한 테스트.
- [ ] A2-S06 MY 시간표 UI·주간 계획·자료 상태·source/date·가족 공유·직접 입력 통합.
- [ ] A2-S07 미계획 구간 산출, 자유시간/아직모름/activity+pickup need 입력, 공개 참여 별도 동의.
- [ ] A2-S08 migration/배포 계획 재확인 후 제한 rollout. 기존 school/SEO/관리자 regression과 신규 상태 테스트 최종 검증.

### Phase 3 — 수요 공개와 밀집 검증

- [ ] A2-U01 가족 단위 중복 제거·유효기간·동의 철회/수정 반영 aggregate worker 구현.
- [ ] A2-U02 5가정 threshold·구간표시·총계 역산/필터 조합 억제·반복 snapshot/삭제 검증. raw public 접근 차단.
- [ ] A2-U03 누구나 열람 가능한 학교별 aggregate와 기간/표본/모드/방법 표시. 개인 게시판 없음.
- [ ] A2-U04 Audit1 이벤트와 신규 schedule/unmet/family/demand 이벤트 연결·중복/개인정보 점검.
- [ ] A2-U05 검증된 학교 숫자/자료만으로 SEO/AEO/GEO landing과 SNS 초안 작성. 외부 게시 상태 별도 기록.
- [ ] A2-U06 10~20학교 집중 모집·4~6주 관측 계획 확정. 7일 start→save, 미계획/응답, 반복 cluster 가설 평가.
- [ ] A2-U07 Go/Hold/No-go 보고 후 확대 범위 결정. 실제모드(3월 이후)는 별도 cohort 검증, 수익화 확장 없음.

완료 기준: 설계·코드·검증·운영 적용·실험 결과를 별도로 기록한다. Audit1의 24개 콘텐츠 framework와 100개 장기 목표는 유지하되 현재 실행은 위 의존성을 우선한다.

## 어디초 플랫폼 개편 — 실행 TODO (2026-10-05)

목표·산출물·의존성·완료 조건: [개편 실행 계획](../product/PLATFORM_EXPANSION_PLAN.md). 근거: [1차 감사](../product/PLATFORM_EXPANSION_AUDIT_20261005.md)와 사용자 첨부 실행 가이드 0~25절. 이 절이 개편 체크 상태의 단일 원본이다. 기존 아래 운영/데이터 backlog는 계속 유지한다.

체크 규칙: `[x]`는 해당 범위의 결과와 검증 근거가 있을 때만 사용한다. 코드 작성은 배포 완료가 아니다. 각 완료 행에 날짜와 근거를 추가한다. 미확인·실패는 `[ ]`로 유지하고 사유를 기록한다. 다음 실행 순서: **P0-04~07 → P1 → P2 → P3 → P4 → P5 → Release**. 구현 중 해당 단계의 analytics와 회귀 검증도 함께 수행한다.

### P0 — 감사와 보호 기준선

- [x] P0-01 코드 route/component, 콘텐츠, local MY/state, 저장소 SQL/Auth 사용 조사. 2026-10-05: 1차 감사 보고서 작성. 운영 DB 전체 검증은 포함하지 않음.
- [x] P0-02 Keep/Move/Modify/New/Remove, 기존 route mapping, 최소 schema 초안 작성. 2026-10-05: 감사 §3~5.
- [x] P0-03 첨부 가이드 0~25절 대조, GNB 4개/로고 HOME 정정, Phase 0~7 실행 계획과 TODO 작성. 2026-10-05: `PLATFORM_EXPANSION_PLAN.md`와 이 절.
- [ ] P0-04 실제 DB의 테이블/컬럼/FK/RPC/grants/RLS를 SQL 06~24와 대조. 특히 curriculum 테이블 적용 여부·데이터 유무 확인. 읽기 권한이 없으면 구체적인 미확인 목록을 남김.
- [ ] P0-05 Supabase 익명 인증/Kakao/Google/identity linking/redirect 설정과 관리자 세션 영향 확인. 비밀값은 출력하지 않음.
- [ ] P0-06 주소 검색·학구도 표시·학교/아파트 양방향 탐색의 실제 지원 범위 확인. 이름 검색을 임의 주소 배정 조회로 간주하지 않고 미지원 범위를 분리.
- [ ] P0-07 기존 URL·canonical·OG·sitemap·체크리스트 ID·저장 형식과 대표 지역 QA 기준선 기록. 빌드 당시 sitemap은 학교 6,302/아파트 45,853/콘텐츠 14개였으며 향후 데이터 증감과 URL 손상을 구분.
- [ ] P0-08 이전 public smoke의 최종 종료 결과까지 재확인. 앞선 기록은 중간 PASS와 실행 세션만 있어 전체 통과 판정 보류.

### P1 — IA/GNB 및 행정 재분류

- [x] P1-01 기존 URL을 유지한 임시 라벨 변경: 지도→학교찾기, 공식 가이드→입학 행정. 2026-10-05: BottomNavigation/HomePage/MyPage/structure.json; lint/typecheck/full build 확인. 2026-10-06: 팀원 검토 반영, public-smoke.mjs의 /guide 활성 메뉴 기대값도 입학 행정으로 동기화(구문 검사 PASS). 2026-10-08 사용자 결정: 최종 이름은 **학교 찾기·입학 준비**(입학 행정 안 씀, 가이드 목록 제목도 '입학 준비 가이드' 유지). 바뀌는 것은 지도→학교 찾기 한 곳.
- [x] P1-02 홈/학교 찾기/입학 준비/학습 준비/MY 5개 GNB와 활성 상태, 모바일 접근성 검증. 2026-10-08 사용자 결정: 학습 준비 추가, 홈 유지 5개 확정(잠시 보류했다 철회 — [계획 §1](../product/PLATFORM_EXPANSION_PLAN.md#1-확정된-방향)). 학습 준비는 '준비 중' 화면으로 배포. 2026-10-08 **로컬 구현**: `BottomNavigation` 학습 준비 추가, `urlState` `/learn` 경로, `LearnPage`(자료 없음 표시만). lint/typecheck/build PASS, public smoke(127.0.0.1:3000) exit 0, 390px `/learn` 화면·활성 탭 확인. **운영 반영** master `b6376f2` → release `129f87c`, 운영 smoke PASS 101건, `/learn` 5탭 확인. 2026-10-08 **접근성·데스크톱**: 320/360/390/430/768px 하단 탭 잘림 없음·터치 영역 60~112×59px, 1280px 왼쪽 레일 64px 칸; `nav[aria-label]`·`aria-current`·아이콘 `aria-hidden` 확인. 활성 탭 글자 대비 3.26:1 → `#b8452f` 5.3:1(아이콘은 강조색 유지), 키보드 `:focus-visible` 2px 테두리 추가. public smoke에 `/learn` 탭 순서·활성·시간표→학교 찾기 검사 3개 추가, 로컬 smoke 통과(exit 0).
- [ ] P1-03 학습 준비 landing(학습 가이드 + 초1 시간표 조회) 및 신규 경로 계약 구현. `/learn` 확정(2026-10-08, 기존 `/prep` 후보 대체), 기존 `/plans/*`, `/items/*`, `/grade1`와 feature flag 호환 전략 기록.
- [ ] P1-04 `/guide/*`, `/faq`를 행정 주제로 재분류하고 Official/출처/검증일/지역·년도 범위 표시. title과 정적 HTML 문구 동기화.
- [ ] P1-05 전체 일정·통지서·예비소집·입학식·전입/전출·이사·조기입학·유예/면제·지역차이·FAQ의 기존 콘텐츠/누락 목록 작성, 공식 출처 검증 후 보완.
- [ ] P1-06 HOME의 진행상태 중심 UI를 MY로 정리하고 학교→행정/준비 교차 링크 및 관련 학교 진입 구성. 기존 체크리스트 URL/ID 유지.
- [ ] P1-07 학교 상세의 관심학교/관련 콘텐츠 위치를 구현·검증하고 기존 배정 정보/지도 동작 회귀 확인.
- [ ] P1-08 lint/typecheck/build/public smoke 최종 통과, 모바일·데스크톱·키보드·뒤로가기·deep link 검증 근거 기록.

### P2 — 콘텐츠 Framework와 24개 seed

- [ ] P2-01 환경/습관/배움/선택·준비물 taxonomy 및 하위분류 정의. 배움의 한글·수학·영어 노출·독서·영상·오디오·교구/보드게임 모두 포함.
- [ ] P2-02 기존 10개 guide/24개 FAQ 답변/17개 checklist와 1학년 자료 및 기존 YouTube 연구 자료를 항목별 재사용 목록으로 정리. 빈 curriculum 데이터와 실제 콘텐츠를 구분.
- [ ] P2-03 공통 템플릿 구현: 질문/요약/긍정/부정/조건부/외부 분석/Poll/한줄 경험/다음 Need. 미수집 반응과 미구현 버튼을 작동하는 것처럼 표시하지 않음.
- [ ] P2-04 content metadata와 source signal 계약 구현: 연령·입학년도·시기·지역·학교·발행상태·검증일·출처 수, 광고 flag, 조사일/표본/빈도. HTML/링크 입력 안전성 검증.
- [ ] P2-05 원문 재게시 없이 외부 signal 조사·교차검증·출처 기록. 협찬/파트너스/광고 구분, 출처 접근 불가와 불충분한 근거 명시.
- [ ] P2-06 24개 실제 seed 작성·검수·등록: 환경 6/습관 6/배움 8/선택·준비물 4. 계획 문서의 후보부터 진행.
- [ ] P2-07 초1 교육과정 기준·영어 노출 분리·불안/선행 경쟁 방지 편집 검수. 에디터 의견/공식 사실/부모 반응 구별.
- [ ] P2-08 draft/review/published/archived 상태와 콘텐츠 수정·출처 재검증 운영 절차 구현. 초기 저장소 편집 계약을 CMS 전환에도 재사용.
- [ ] P2-09 24개 목록/상세/관련 링크를 실제 UI에서 확인하고 신규 공개 페이지 static HTML/canonical/OG/sitemap 검증. 기존 SEO 회귀 확인.

### P3 — Login, 사용자 DB, MY MVP

- [ ] P3-01 live DB 충돌 확인 후 profiles/interests/content/source/tag/views/saves/checklist 최소 schema 확정. auth.users 재사용, 학교 데이터 계약과 분리.
- [ ] P3-02 migration/인덱스/operation별 grants·RLS 작성, 미로그인·익명·소유자·타 사용자·관리자 allow/deny 테스트와 advisor 검증. 실제 DB 적용은 별도 기록.
- [ ] P3-03 Kakao 우선·Google 로그인과 callback/오류/취소/로그아웃/return path 구현. 관리자 인증 흐름 회귀 확인.
- [ ] P3-04 익명 identity 연결과 기존 계정 로그인 충돌 처리. 저장/투표/체크 상태의 중복 없는 병합 및 실패·재시도 검증.
- [ ] P3-05 입학년도+관심학교 또는 관심지역 최소 onboarding 구현. 아이 이름/성별/정확주소 수집 없음.
- [ ] P3-06 관심학교·콘텐츠 저장·내 준비 추가·MY·경험/댓글·동기화에서 로그인 trigger와 성공 후 원래 행동 복원. 공개 검색/열람 유지.
- [ ] P3-07 기존 프로필/학교·아파트 즐겨찾기/체크/읽음 localStorage 이전과 기기 간 동기화 구현. 기존 아파트 공개키와 checklist ID 보존.
- [ ] P3-08 MY 입학연도/D-day/학교·지역/행정 및 4분류 준비 진행/저장/최근 열람 구현. 참여내역은 P4 연결.
- [ ] P3-09 개인정보 안내·보관/삭제·탈퇴·동기화 설명을 실제 동작에 맞춤. 서버 개인 데이터 보관 범위 확정.
- [ ] P3-10 검증된 migration 적용 후 사용자별 조회와 실제 두 계정·두 기기 동작, 재로그인 복원을 확인. rollout/복구 결과 기록.

### P4 — Poll / Reaction / 한줄 경험 및 seed 100개

- [ ] P4-01 polls/options/votes 및 유용성 reaction 계약 구현. poll-option 일치, 1인1표/변경 규칙, 익명 중복 방지의 한계·보완 정책 명시.
- [ ] P4-02 거실서재 만족/애매/다시 안 함, 책상 구매시기, 준비물 평가, 행정 해결/추가 궁금 반응 UI 구현.
- [ ] P4-03 원본 투표/사용자 정보를 공개하지 않는 집계 제공. 최소 표본·집계 기간·0건 상태 표시, 실제 참여만 집계.
- [ ] P4-04 로그인 한줄 경험 작성/수정/삭제, 검수·신고·스팸 대응 구현. 댓글은 콘텐츠 내 최소 범위로 정의·연결, 별도 Community GNB 없음.
- [ ] P4-05 MY 참여 Poll/내 경험 연결. 익명→계정 전환, 이중 클릭·재시도·권한·게시 상태 검증.
- [ ] P4-06 콘텐츠를 총 100개로 확장: 환경25/습관25/배움30/선택20. 주제 100개와 검증·발행된 본문 100개를 구분해 집계.

### P5 — HOME Discovery

- [ ] P5-01 기존 콘텐츠 ID를 재조합하는 rule engine 구현. entry_year/학교/지역/viewed/saved/voted/category_interest 입력과 추천 이유 정의.
- [ ] P5-02 seen/unseen·신규 분석·시기별 행정 모듈 구현. HOME의 원본 콘텐츠 중복 생성 없음.
- [ ] P5-03 비슷한 부모 인기·최근 반응 증가 모듈에 기간/표본 기준 적용. 근거 부족 시 시기/최신/편집 추천으로 표시.
- [ ] P5-04 관련/함께 보는 학교 후보 제공. 주변 학교와 실제 배정학교 의미 구분, 공동조회 통계 없는 경우 허위 설명 없음.
- [ ] P5-05 비로그인·로그인·관심 미설정·모두 열람·API 실패 fallback과 MY 역할 분리 검증.
- [ ] P5-06 추천 노출/클릭·다음 Need 이동률 검증 및 첫 결과 보고. 과거 행동만 반복 추천하지 않도록 다양성 확인.

### A — 단계와 함께 구현할 Analytics

- [ ] A-01 기존 이벤트→신규 이벤트 매핑과 조회/완료·중복 제거·개인정보 없는 속성·분모/기간 정의.
- [ ] A-02 school_search/view/save, admin_content_view/complete, prep_content_view/complete, content_save 연결.
- [ ] A-03 poll_vote, experience_create, comment_create, login_start/complete 연결.
- [ ] A-04 recommendation_impression/click, my_view, checklist_update 연결. 실제 노출/실제 저장 성공 시 발화 검증.
- [ ] A-05 Search→배정 확인→다음 Need→반응/저장→로그인→개인화→HOME/MY funnel 보고 구성. 자동화 테스트로 production 분석 오염 방지.

### R — 출시와 운영 확인

- [ ] R-01 각 프런트 변경의 lint/typecheck/build 및 명시 URL public smoke가 최종 종료까지 통과했는지 기록.
- [ ] R-02 360/390/430px와 데스크톱의 GNB·로고·학교/아파트 상세·검색·지도·저장·Auth·MY 전체 시나리오 검증, 화면 증거 저장.
- [ ] R-03 기존/신규 URL 직접 진입·새로고침·뒤로/앞으로·canonical·OG·sitemap origin·404/별칭 처리 검증.
- [ ] R-04 대표 지역 배정 QA/수동검수 기록과 운영 관리자 접근 회귀 확인. ETL/학구/공개키 산출 변경 여부 점검.
- [ ] R-05 변경 내역·migration 상태·배포 순서·복구 절차 정리, release runbook에 따라 배포 상태 별도 기록.
- [ ] R-06 배포 후 허용 도메인 지도/로그인 callback/public smoke·신규 funnel 확인. production 확인 전 출시 완료 체크 금지.

### P6/P7 — 조건 충족 후 검토 (Deferred)

- [ ] P6-01 실제 참여량과 검수 운영 근거로 사진·긴 경험글·부모 사례의 착수 조건/범위 결정.
- [ ] P6-02 조건 충족 시 업로드/권한/신고/삭제와 사례 탐색 설계·구현. 자유게시판/Following/Influencer는 별도 검토.
- [ ] P7-01 반복되는 부모 문제와 선택 근거를 Parent Insight로 정리하고 Wherecho Select/브랜드 협업 적합성 검토.
- [ ] P7-02 자체 오디오/인터랙티브 장난감 등 수요 검증 후 별도 계획. 초기 수익화 CTA/배너/lead 판매는 현재 범위 제외.

## Current UX Milestone: School, Apartment, and Academy Integration

- [x] Replace text-heavy assigned-apartment rows with reusable visual cards showing scale, age, parking composition, and nearby-academy context.
- [x] Add apartment-detail academy summaries with 600 m core and 600-800 m extended counts plus an opt-in map layer.
- [x] Add a school-detail education tab and a school-scoped academy map-layer trigger.
- [x] Keep school-scoped academy access on the public serving boundary by deriving assigned complexes from `school_apartment_serving`.
- [x] Pass frontend lint, typecheck, and production build for the local integration.
- [x] Apply `15_create_school_academy_proximity.sql` to Supabase and verify the anonymous RPC result and representative latency. **Verified live 2026-09-27** against production with the deployed anon key: `nearby_academy_addresses` and `nearby_academy_addresses_for_school` both return rows, and `apartment_academy_summary` reads anonymously, so migrations `14` and `15` are applied. Representative latency over five apartments and five schools: 0.193-0.316 s and 0.235-0.316 s, inside the 3 s apartment-detail budget.
- [x] Start the regional academy expansion with Busan. The 2026-09-28 cumulative snapshot contains 9,086 Busan institutions; VWorld matched 4,144/4,208 unique addresses (98.48%). Additive upserts preserved the capital-region rows and increased the production academy tables to 33,085 address aggregates, 58,220 origin points, and 25,019 apartment summaries. A Busan anonymous RPC sample returned 33 address aggregates. Regions without a loaded academy snapshot display `학원 데이터 준비 중` instead of a misleading zero.
- [x] Continue the academy expansion through Daegu, Daejeon, Gwangju, Ulsan, and Sejong. Source institutions and VWorld address matches were Daegu 8,012 and 3,729/3,763 (99.10%), Daejeon 3,842 and 1,807/1,809 (99.89%), Gwangju 4,826 and 2,629/2,632 (99.89%), Ulsan 3,693 and 2,131/2,140 (99.58%), and Sejong 1,752 and 310/312 (99.36%). Regional additive upserts raised production to 43,653 address aggregates, 64,501 origin points, and 31,300 apartment summaries. Every region passed both anonymous apartment and school RPC samples after upload.
- [x] Complete academy coverage for the remaining eight regions. Source institutions and final VWorld address matches were Jeonnam 3,462 and 2,297/2,301 (99.83%), Jeju 1,765 and 1,237/1,238 (99.92%), Gangwon 3,208 and 2,058/2,058 (100%), Chungbuk 3,469 and 1,886/1,896 (99.47%), Chungnam 4,492 and 2,239/2,348 (95.36% raw; 99.64% after excluding 101 obsolete pre-Sejong Yeongi-gun addresses), Jeonbuk 4,723 and 2,969/2,972 (99.90%), Gyeongbuk 5,757 and 3,567/3,632 (98.21%), and Gyeongnam 8,762 and 4,075/4,105 (99.27%). Every regional dry-run and anonymous apartment/school RPC sample passed. Production now contains 63,654 academy address aggregates, 79,124 origin points, and 45,923 apartment summaries; the cumulative private snapshot covers all 17 regions with 138,541 institutions and 64,352/65,078 geocoded address markers (98.88%).
- [ ] Run allowed-domain mobile QA for school detail, apartment detail, academy markers, sheet gestures, and 360/390/430 px layouts.
- [x] ~~Commit and deploy only after SQL 15 and the allowed-domain smoke pass~~ — **overtaken by events.** The academy work is committed and live: the production bundle `index-BvJ6pQRZ.js` contains both RPC names and `apartment_academy_summary`. SQL 15 was applied first, so the substantive gate held; the mobile QA row above is the part still outstanding, now against a deployment rather than a local build.

## Completed Baseline

- [x] Establish official 2026 school-zone polygons as the assignment source of truth; retain Geomarket only for comparison.
- [x] Build school-zone assignments for 20,421 apartment units and preserve method, confidence, and review status.
- [x] Build `school_master` for 2,260 schools, including grade 1-6 student and class statistics.
- [x] Build 20,164 canonical apartment complexes, name history, property history, and school assignments.
- [x] Pass the local backend audit: 49/49 checks.
- [x] Apply `06_create_operational_master_tables.sql` and `07_add_school_grade_statistics.sql`.
- [x] Create and load `school_apartment_serving` through migration `06`; migration `08` is only an idempotent incremental fallback.
- [x] Load seven operational data tables: 112,997 rows across eight operational tables.
- [x] Verify public/private RLS boundaries and anonymous serving-table reads.
- [x] Move frontend school/apartment reads to the operational schema and pass lint, typecheck, and build.
- [x] Archive superseded 2024-2025 docs, SQL, frontend copies, ETL experiments, and outputs outside the active app tree.

## Current Milestone: Frontend Data Contract

Finalize the read model and UX before expanding the recurring ETL. The frontend should read schools from `school_master` and apartments from `school_apartment_serving` without browser-side joins.

- [x] Remove the nested `AppProvider` that split search, map, and detail state.
- [x] Synchronize initial map bounds and replace overlapping map events with a single debounced `idle` request.
- [x] Include school type and region filters in map cache keys and ignore stale viewport responses.
- [x] Verify current frontend changes with `npm run lint`, `npm run typecheck`, and `npm run build`.
- [x] Finalize explicit frontend fields for `school_master` and `school_apartment_serving`; remove frontend `select('*')` reads.
- [x] Add K-apt ground/underground parking and public/private rental counts to the local apartment master and serving contract.
- [x] Apply the public-rental-ratio filter to the Supabase query instead of returning placeholder zero values.
- [x] Add an unrestricted apartment-age option so pre-1986 complexes remain discoverable.
- [x] Prepare matching indexes for school-name partial search and latitude/longitude viewport filtering.
- [x] Rebuild local outputs and pass the expanded backend audit: 52/52 checks.
- [x] Validate the selected-table upload dry-run: 20,164 complex rows and 20,891 serving rows.
- [x] Apply `10_finalize_frontend_data_contract.sql` to the existing Supabase database.
- [x] Upload the rebuilt `apartment_complex_master` and `school_apartment_serving` rows.
- [x] Confirm least-privilege RLS: anonymous frontend access only to the two read tables.
- [x] Run remote count/RLS checks and desktop/mobile browser smoke tests against the migrated schema.
- [x] Record the finalized read contract in SQL, frontend types/services, and the now-archived `joinmap.html` visual snapshot.
- [x] Re-run the idempotent SQL `10` migration and install the 0-100 public-rental-ratio constraints.

## Next Milestone: Recurring ETL

- [x] Define the private `etl-source-snapshots/{source}/{date}/` path and 45-day metadata retention rule.
- [x] Add SQL `11` contracts for source metadata, transient staging rows, cleanup, and service-role-only access.
- [x] Implement `run_recurring_etl.py` for archive, staging, validated master upserts, and Serving refresh; pass local dry-run.
- [x] Apply `11_create_recurring_etl_contract.sql` in Supabase.
- [x] Execute a controlled recurring ETL pilot: three validated snapshots, zero retained staging rows, completed run log, and 20,891 Serving rows.
- [x] Re-apply the corrected `09_create_serving_refresh_function.sql` with the Supabase-safe explicit delete predicate.
- [x] Test `refresh_school_apartment_serving()`: 20,891 rows before, inserted, and after; RLS remained valid.
- [x] Verify row counts, foreign keys, RLS, grade statistics, and frontend query latency after refresh; sample reads completed in about 210 ms and 191 ms.
- [x] Select the local Windows workstation as the initial recurring-run host; keep its Supabase service-role secret in the ignored `.env` file.
- [x] Add a due-source runner for latest K-apt and current-year Schoolinfo collection, dynamic manifests, and daily schedule evaluation.
- [x] Register the Windows daily task and verify its no-op and maintenance execution paths with `LastTaskResult=0`.
- [ ] Verify the first unattended due-source production run when a schedule becomes due.
- [x] Add bounded retry behavior, overlap prevention, logs, and optional webhook failure notification.
- [x] Verify with a controlled pre-refresh failure that the previous Serving snapshot is not replaced.
- [x] Run staging cleanup and expired Storage-object deletion on every daily task, including no-op days.
- [ ] Monitor PostgreSQL and Storage free-tier usage after the first retention window.
- [x] Record each production run in `etl_runs` with source dates, counts, status, and pipeline version.

## Current Milestone: Nationwide Data Expansion

Expand the production database from Seoul, Gyeonggi, and Incheon in bounded regional waves. Each wave must complete a read-only build, regional quality audit, capacity check, controlled Supabase upload, Serving refresh, and frontend smoke test before the next wave begins. Do not replace the current capital-region snapshot until the new regional rows pass the same gates.

### Expansion order

1. **N0 — pipeline generalization:** remove capital-region allowlists from active school, apartment, assignment, audit, monitoring, and upload paths; replace them with one versioned region registry. Keep report-only regional assumptions outside the production ETL.
2. **N1 — metropolitan pilot, one region at a time:** Daejeon, Daegu, Busan, Gwangju, and Ulsan as full metropolitan-city scopes, plus Mokpo as a bounded `전라남도 / 목포시` city pilot rather than a province-wide load. 광주 and Mokpo stay in this queue and run their EDA like every other scope; their build work follows the EDA, and their scope names resolve through the registry while the sources still carry pre-merger values (I-20). These regions are a queue, not a batch. Each one starts with its own EDA pass and finishes its release gates before the next one begins, because school-zone records are organized differently by education office and sometimes differently by district inside a single office.
3. **N2 — remaining high-density scopes:** add Sejong and Jeju, then provincial capitals and major cities in Gangwon, Chungcheong, Jeolla, and Gyeongsang provinces.
4. **N3 — rural completion:** expand county-by-county, prioritizing source coverage and manual validation for wide school zones, sparse apartments, islands, and address/geocoding exceptions.
5. **N4 — nationwide steady state:** enable nationwide recurring collection only after every regional wave has an accepted baseline and storage/database growth remains within the approved operating budget.

### N0 implementation backlog

- [x] Define a canonical registry for all 17 first-level administrative regions, NEIS/KERIS office codes, legal-dong prefixes, aliases, coordinate bounds, and optional city filters. `etl/region_registry.json` plus the `etl/region_registry.py` loader; 15 tests in `etl/tests/test_region_registry.py`. The registry separates verified values from assumed ones (`school_name_prefix_status`, `bounds_source`), and only a `verified` school-name prefix may be stripped during matching. Capital-region bounds are measured and contain all 2,260 production schools; every other region carries an approximate envelope that its EDA pass must replace.
- [x] Inventory every capital-region constant and classify it as production scope, validation rule, historical baseline, naming artifact, or research-only code: `REGION_SCOPE_INVENTORY.md`. The two that change behavior most are the single hardcoded coordinate box in `audit_operational_backend.py`, which would reject Busan, Jeju, and Ulleung outright, and the `경기도`-only city-level branch in the frontend address parser.
- [ ] Generalize `fetch_schoolinfo_2026.py`, K-apt collection, school/apartment builders, `build_operational_masters.py`, and upload manifests to accept explicit region/city scopes. **Collectors and builders done**: both take `--regions`/`--cities`, default to the registry's production regions, and were checked for parity — the capital filter keeps all 2,313 Schoolinfo rows and selects the identical 9,645 K-apt codes. The default output slug stays `capital`. **Builders, the backend audit, the recurring runner, and the frontend** now read region scope from the registry. The audit checks each row against its own region's envelope instead of one capital-region box and still reports 52/52; each run records its resolved scope and per-region row counts; the frontend reads a generated `src/constants/regionRegistry.ts`, with a drift test that fails when the registry changes without regeneration. Remaining: applying migration `16` to Supabase.
- [ ] Replace the three-region database checks on apartment tables with nationwide-valid region validation without weakening `NOT NULL`, foreign-key, RLS, or source-traceability guarantees.
- [ ] Parameterize backend audits by selected scope and add per-region counts, coordinate bounds, duplicate keys, unmatched schools, unassigned apartments, and review-required rates.
- [ ] Extend ETL schedule and run metadata so each execution records the exact region/city scope and can be retried or rolled back independently.
- [ ] Establish pre-upload capacity budgets for PostgreSQL rows, indexes, Storage snapshots, Serving refresh time, and public map query latency.
- [ ] Add automated tests for one metropolitan region and the Mokpo city-filter case before collecting production-sized inputs.

### Per-region EDA gate

Every region and city scope passes an EDA pass before any build or upload work for it starts, and no region is collected in parallel with another. The capital-region pipeline encodes assumptions that hold for three education offices and must not be assumed to hold anywhere else: school-zone labels are written per office, and districts inside one office can differ from each other.

The EDA output for a scope is a dated profile that answers, with counts and examples rather than prose:

- [ ] School-zone label format per district: naming pattern, whether the school name carries a region prefix, and how the label relates to the official school name.
- [ ] Which label-to-school matching method the scope needs, and whether the capital-region segmentation approach applies unchanged.
- [ ] Shared and joint school zones (`공동통학구역`), one-way zones, and how many apartments they affect.
- [ ] Branch schools (`분교장`), small schools, and schools whose zone record is missing entirely.
- [ ] Address shape: whether the scope has a city level, general-purpose districts, or 읍/면/리, and what the neighborhood level is.
- [ ] Source field values for this scope: K-apt `시도`/`시군구` spellings, education-office name, legal-dong code prefix, and whether renamed or merged region values appear. Sources migrate at different times, so record which spelling each source uses at the scope's collection date rather than assuming one.
- [ ] Measured coordinate bounds, replacing the registry's approximate envelope.
- [ ] Anything that differs from the capital-region assumptions, stated explicitly as a required code change.

A scope whose EDA reveals a matching method the pipeline does not support is paused, not forced through with similarity matching. The registry records unverified assumptions as `assumed`; the EDA pass is what promotes them to `verified`.

### Per-wave release gates

These thresholds were set on 2026-09-17 from the capital-region baseline: 52/52 backend checks, 247 of 20,421 assignment units (1.2%) marked `review_required`, 98.4% agreement between the polygon spatial join and Geomarket, a 1.2-2.4 second initial map read, and 0.26-0.43 second apartment reads. Change a threshold only through an Update Log entry that states the reason; never relax one to let a failing wave pass.

| Area | Pass criteria |
| --- | --- |
| Source completeness | Every input for the scope has a dated manifest entry and SHA-256 checksum. The NEIS school count for the scope matches `school_master` within ±1%, and every difference is listed with a reason (closure, branch school, new opening). |
| Data quality | The scoped backend audit passes 100% of its checks. 0 orphaned assignments, 0 duplicate canonical keys, 0 school coordinates outside the registry bounds. Apartment assignment coverage is ≥ 98%. `review_required` is ≤ 3% for metropolitan and city scopes and ≤ 10% for county scopes. Where Geomarket is available, spatial-join agreement is ≥ 97%. Unresolved records stay reviewable and are never silently matched. |
| Manual QA | A stratified sample of at least 50 apartments per metropolitan region and 30 per city or county scope, covering urban core, suburban edge, new town, shared zone, and no-hit cases. 0 wrong-school assignments in the sample; one stops the wave. |
| Supabase / RLS | The migration is idempotent and passes a second run. The anonymous role reads only `school_master` and `school_apartment_serving` and cannot read any control, staging, snapshot, or normalized table, verified explicitly rather than assumed. No new public table or RPC. Writes use the service role only. |
| Capacity | PostgreSQL (tables plus indexes) stays ≤ 70% of the plan limit after the wave, and Storage snapshots stay ≤ 70% under 45-day retention. Measured growth is within ±25% of the pre-wave projection; a larger miss stops the next wave until the projection is redone. |
| Performance | Public smoke passes at 360/390/430/1280 px. Initial map read ≤ 2.5 s, apartment read ≤ 0.5 s, school search ≤ 1.0 s, measured in production. The 5 s and 3 s smoke budgets remain hard failure limits. `refresh_school_apartment_serving()` completes with at least 50% headroom under the statement timeout. |
| Rollback | Per-region row counts for every operational table are recorded **immediately before** the upload and compared against that snapshot afterwards, not against the reviewed-inputs baseline: production moves ahead whenever a scheduled run loads a newer source. Uploads are scoped so one wave can be deleted by region/city scope and a Serving refresh restores the pre-load counts exactly. Capital-region counts are unchanged after every wave. A gate that fails after upload triggers rollback before investigation. |
| Operations | `/admin/etl` shows the wave's scope, source dates, row deltas, and quality checks, and the run is recorded in `etl_runs` with its exact scope. |

### Stage exit criteria

| Stage | Scope | Additional exit criteria |
| --- | --- | --- |
| **N0** | No new data | Capital-region behavior is unchanged: the portable read-only build still matches all seven row counts and canonical checksums in `portable_readonly_baseline.json`, and 52/52 checks plus public smoke pass. The registry-backed region migration is applied and the anonymous-access check passes. A scoped rollback rehearsal restores exact counts. The N1-N4 capacity projection is recorded. |
| **N1** | Daejeon, Daegu, Busan, Gwangju, Ulsan; `전라남도 / 목포시` | Every shared gate passes for each of the six scopes separately. The Mokpo scope publishes 0 rows outside `목포시`, and no other Jeollanam-do city appears in any public read. District drilldown works in all five metropolitan cities. |
| **N2** | Sejong, Jeju, then provincial capitals and major cities | Sejong's fast-changing new-town zones are validated against the latest school-zone file date. Jeju and Sejong address parsing produces correct district and neighborhood grouping. Province → city → district drilldown works for cities with general-purpose districts such as Cheongju and Jeonju. Renamed-region aliases resolve to one canonical name. |
| **N3** | Remaining counties, rural and island areas | County-scope `review_required` ≤ 10%. Branch schools and shared school zones are represented without duplicate schools. Every island school zone is checked manually. Apartments with no assignment stay visibly unassigned rather than being attached to the nearest school. |
| **N4** | Nationwide recurring collection | Every regional baseline is accepted. Two consecutive scheduled nationwide runs complete with all checks passing. Run time fits the schedule window, capacity stays within the 70% budgets after one full retention window, and failure alerts are verified. A plan upgrade or a shorter retention period is a user decision, not an automatic fallback. |

### Deferred report backlog

- [ ] **Deferred — owner will resume manually:** continue the archived school/housing quadrant report generation and its analysis inputs.
- [ ] Regenerate snapshot-bound report figures only after the relevant nationwide expansion wave is accepted; report work is not a blocker for N0 or N1.

## Current Milestone: ETL Monitoring

- [x] Add SQL `12` schedule, scope, run-check, and Supabase Auth administrator contracts.
- [x] Record run scope, trigger type, attempt number, row-count checks, Serving rows, and staging cleanup in the recurring runner.
- [x] Build the authenticated `/admin/etl` dashboard with cadence, regional scope, runs, snapshots, and quality gates.
- [x] Keep the dashboard out of the public map bundle through lazy loading; pass lint, typecheck, and production build.
- [x] Verify the administrator login layout on desktop and mobile.
- [x] Apply `12_create_etl_monitoring_dashboard.sql` in Supabase.
- [x] Create a Supabase Auth user and register its UUID in `etl_admin_users`.
- [x] Run a post-SQL-12 recurring pilot and verify authenticated dashboard reads: four schedules, six runs, six snapshot records, and eight passing checks.
- [x] Install project-pinned `agent-browser` and Chrome for Testing; add a repeatable admin-dashboard smoke command.

## Next Milestone: Frontend UX

- [x] Audit the current school search, map, filter, and school-detail workflows on desktop and mobile.
- [x] Add mobile filter accessibility, inert closed-drawer behavior, stable marker refresh, and viewport-aware clustering.
- [x] Add a nearby-school entry point: restore previously granted geolocation automatically and provide an explicit `내 주변` control without prompting on first visit.
- [x] Reorder school detail around grade-1 students/classes/per-class, then show key assigned-apartment fields from the existing two-table contract.
- [x] Reuse the apartment query result between the school summary and full apartment list; verify 서울대곡초 on desktop and mobile.
- [x] Restore the legacy v1 map language: full-screen map, white school-name markers, district summary pills, restrained hover, and a non-dimming bottom detail sheet.
- [x] Show assigned apartment name and household-count markers after school selection; share one Serving query with school detail and open apartment detail from the marker.
- [x] Define the frontend theme, entity colors, unified-search behavior, scoped filter model, and phased UX delivery plan.
- [x] Implement shared design tokens and replace the primary map/search/filter/navigation colors, icons, radii, and layer values.
- [x] Add a deduplicated school/apartment search contract and grouped unified-search results.
- [x] Separate school and assigned-apartment filter scopes, add direct chips, and keep staged mobile apply in the full panel.
- [ ] Add location filters only after the P4 station/address source contract is approved.
- [x] Select KRIC's nationwide urban-rail station file as the station master source and add a local XLSX/CSV profiler before station schema approval.
- [x] Add explicit loading, empty, and recoverable error states for school-map and assigned-apartment reads.
- [ ] Add source-freshness and stale-data indicators after the public Serving contracts expose source timestamps.
- [x] Measure map and assigned-apartment reads against 5-second and 3-second smoke budgets.
- [x] Improve mobile filter and detail-panel ergonomics without changing the finalized two-table data contract.
- [x] Add a repeatable `agent-browser` smoke scenario for public map load, filters, search, school detail, apartment reads, responsive widths, and request budgets.
- [ ] Extend the repeatable smoke suite to the authenticated ETL dashboard with a non-personal test account.
- [ ] **Deferred until after v2.2 frontend work:** Package reviewed local assignment inputs as a versioned portable bundle, then migrate recurring execution from the logged-in Windows task to GitHub Actions.
- [x] Replace the incomplete five-file portability bundle with build-complete v2 inputs: eight files, 50,553,797 input bytes, and an 8,383,649-byte local ZIP.
- [x] Reproduce all seven operational outputs from the local v2 bundle without database writes; pass 52/52 backend checks and lock Windows row counts plus SHA-256 values as the remote comparison baseline.
- [x] Make the comparison baseline platform-independent: hash JSON outputs by canonical content rather than raw bytes, so a Linux Actions run can match the Windows baseline.
- [x] Upload portability bundle v2 to its versioned private Storage path, verify its remote archive and eight member checksums, and confirm anonymous download is blocked.
- [x] Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as GitHub Actions secrets and pass read-only GitHub Actions run `34242752216`; all seven output row counts and canonical checksums match the locked Windows baseline.
- [ ] Keep the Windows task as fallback and require separate approval before enabling scheduled GitHub Actions database writes.

### v2.2 P3 And Follow-up Order

1. **P3 frontend contract completion:** expose the already-stored `building_count` value through the apartment TypeScript model and the list/detail UI. No SQL or Serving refresh is required unless live completeness checks reveal missing uploads.
2. **P3 verification:** check null handling, representative complex values, school/apartment navigation, 360/390/430/1280 layouts, public smoke tests, and map/apartment request budgets before commit and deployment.
3. **P4 location discovery:** choose station and address-search sources, then document identifiers, aliases, coordinates, licensing, API cost, refresh cadence, and proximity semantics. Do not add public tables before this contract is approved.
4. **P5 ETL portability:** the reviewed-input bundle now reproduces successfully in read-only GitHub Actions. Retain Windows scheduling as fallback and enable remote database writes only after separate approval and a monitored production run.
5. **P5 admin QA:** create a non-personal authenticated test account and automate monitoring-dashboard checks without placing credentials in the repository.
6. **P6 future data pilots:** run academy, timetable, and playground pilots independently; production schema work begins only after each domain's quality, legal, product, and free-tier gates pass.

P3 exit criteria are: `building_count` is visible where available, absent values render cleanly, no schema migration is introduced, frontend quality commands and browser QA pass, and the deployed production alias is verified. Station search, address search, GitHub Actions migration, and new data domains are explicitly not part of P3.

P3 implementation status: production verification passed on 2026-09-06 (`cafe111`). Serving coverage is 19,502 of 20,891 rows (93.4%); 은마 renders as 4,424 households and 28 buildings, while missing values remain hidden. The production smoke measured a 1.20-second initial map read and 0.28-0.35-second apartment reads.

### v2.1 Map Discovery Sprint

Detailed behavior and acceptance checks are maintained in [`../ux/FRONTEND_UX_SYSTEM_PLAN.md`](../ux/FRONTEND_UX_SYSTEM_PLAN.md).

- [x] P1: add shared layout/layer tokens, safe-area-aware `지도 / 소식 / 즐겨찾기` GNB, and mobile zoom-control removal.
- [x] P2: redesign the rounded search surface and add a horizontally scrollable quick-filter bar below it.
- [x] P2: keep SQL `13` as the filter contract and verify frontend cache keys and combined-filter requests against its existing parameters.
- [x] P2: keep the equalizer icon as the full-filter entry and expose establishment type, grade, students, households, and parking as direct chips.
- [x] P3: sort district-sheet neighborhoods by selected-grade students and replace threshold text with accessible blue/amber count circles.
- [x] P4: build local-first school/apartment favorites and define the editorial contract before enabling the published news feed.
- [x] Verify mobile/desktop layering, navigation-state preservation, filter equivalence, district drilldown, favorites, and all frontend quality commands in production.

## Future Milestone: Additional Data Domains

This section incorporates the final decisions previously maintained in `FUTURE_DATA_DOMAINS_PLAN.md`. No candidate domain may change the production schema until its remaining product, quality, legal, security, and capacity gates pass. Raw snapshots stay private and candidate data stays outside the current two-table public frontend contract.

### Academy and tutoring centers — proceed after geocoding gate

Discovery established that `acaInsTiInfo` returns 71,690 capital-region institutions, `(ATPT_OFCDC_SC_CODE, ACA_ASNUM)` is a one-row-per-institution key (corrected 2026-10-06: `ACA_ASNUM` alone repeats across education offices — 75,034 distinct values in 138,542 nationwide rows; see `ACADEMY_REFRESH_PLAN.md` section 7), and school-district joins cover 100%. Elementary-course classification is not viable because only 14.7% explicitly identify an elementary audience; use density and subject composition instead of claiming elementary eligibility.

- [x] Renew the VWORLD credential outside the repository and verify address geocoding (2026-09-16 to 2026-09-18).
- [x] Geocode a stratified 300-address sample: 291/300 matched (97.0%); all nine failures were `NOT_FOUND`, not authentication errors.
- [x] Refresh the NEIS capital-region snapshot to 71,692 institutions and geocode 29,664 unique road addresses: 29,274 matched (98.69%).
- [x] Build one private address-level marker candidate with institution count and subject composition; keep raw addresses and coordinates outside Git.
- [x] Fix proximity semantics: use a 600 m straight-line core and a separate 600-800 m extended band; model `academy -> nearby apartment -> assigned school` as derived proximity, never as an official school assignment.
- [x] Collect VWorld building polygons for the 3,632 complexes with at least 500 households that lacked prior building points. All requests succeeded; 2,498 passed the 75-125% official-building-count gate and 1,134 remain representative-point fallbacks.
- [x] Validate the hybrid origin rule across 4,285 large complexes: 3,057 have trusted building-centroid coverage, while 1,228 use the complex representative point. At 600 m, trusted building origins add 20,983 deduplicated academy-address links versus representative points.
- [x] Design one privacy-minimized map marker per address with institution count and subject composition; exclude raw addresses and institution names from the public candidate.
- [x] Reject the 1,075,094-row materialized link candidate in favor of 29,274 address markers, 53,373 proximity origins, 20,172 apartment summaries, and an indexed on-demand RPC (`sql/14`, not yet applied).
- [x] Review and apply SQL `14`, upload the three serving candidates, and verify exact service-role/anonymous counts plus the anonymous proximity RPC.
- [x] Benchmark the anonymous RPC across sparse, median, dense, and maximum-density complexes: median latency was 182-346 ms and all returned counts matched the precomputed summaries.
- [x] Connect an apartment-scoped, default-off frontend academy layer. Address markers expose only institution counts, distinguish 0-600 m core from 600-800 m extended results, and reset whenever the selected apartment changes.
- [ ] Verify marker rendering on an allowed Naver Maps domain and decide whether address-marker selection should open a compact subject-composition sheet.
- [ ] Add a weekly collector, private snapshots, schema-drift checks, monitoring, storage estimates, and an RLS-protected serving contract only after product approval.

### Elementary timetables — deferred on product value

The technical pilot passed: school-code linkage reached 99.91%, weekly repetition was 97%, and a pattern-plus-exception nationwide annual estimate was 126 MB. The domain remains deferred because national curriculum hours provide little school-selection differentiation and the likely audience does not match the product. If resumed, limit discovery to school-specific creative-experience program tags collected once per semester; creating `school_master.neis_school_code` remains a prerequisite because current production coverage is 0%.

### Apartment sale transactions - linkage refinement in progress

The MOLIT transaction source can be linked to `canonical_complex_id` through legal-dong district, legal-dong name, lot number, and normalized apartment aliases. It does not provide the K-apt code, so linkage must remain tiered and auditable. See [`../decisions/ADR-005-apartment-transaction-linkage.md`](../decisions/ADR-005-apartment-transaction-linkage.md).

- [x] Add a private-source profiler that records API field population and apartment-master match tiers without committing raw transactions.
- [x] Confirm that the current apartment master contains the legal code, lot address, aliases, and canonical ID required by the proposed match contract.
- [x] Obtain data.go.kr authorization for detailed apartment sale API `15126468` and confirm the detailed endpoint works.
- [x] Run August 2026 samples for Jongno, Gangnam, Bundang, and Yeonsu: 647/683 transactions linked (94.73%).
- [ ] Add an audited `aptSeq` crosswalk, road-name matching, and newly completed complex refresh; then require at least 95% deterministic linkage before designing production tables.
- [ ] Model cancellations and corrections, then publish only complex-level monthly aggregates; keep individual transaction rows private.

### Children's playgrounds — blocked pending legal review

- [ ] Confirm commercial-use and derivative-work compatibility with the stated Korea Open Government License Type 4 conditions.
- [ ] Confirm whether location-information business registration or notification applies to this product.
- [ ] Request an API key only after both legal gates pass.
- [ ] Then validate the source CRS and coordinates against at least 100 addresses, profile stable IDs and duplicates, and estimate annual storage before any schema work.
- [ ] Preserve separate source records for colocated facilities; do not infer school or apartment assignment from proximity.

### Shared production gates

- [ ] Extend monitoring domain constraints and cadences only through an approved migration.
- [ ] Add source-key, geocoding, linkage, coordinate, freshness, and retention checks appropriate to the approved domain.
- [ ] Estimate PostgreSQL, index, and Storage growth before recurring collection.
- [ ] For any exposed serving table or RPC, retain least-privilege grants and RLS and verify anonymous access explicitly.

## Refresh Runbook

1. Archive source files in private Storage and record their checksums.
2. Load transient staging data and run schema/completeness checks.
3. Upsert normalized school, apartment, and assignment masters.
4. Call `refresh_school_apartment_serving()` in Supabase.
5. Run backend audit and remote count/RLS checks.
6. Run a frontend smoke test; publish the run only when all checks pass.

Current pilot commands, run from the project root:

```bash
python etl/run_recurring_etl.py
python etl/run_recurring_etl.py --apply
python etl/run_due_etl.py
npm run browser:smoke
```

The first command is read-only. Use `--build` when newly collected source files must rebuild all local outputs before the audit.

## Open Issues

| ID | Status | Issue and handling |
| --- | --- | --- |
| I-01 | Resolved | SQL `09` was re-applied with `DELETE ... WHERE TRUE`; the refresh returned 20,891 rows and preserved the frontend/RLS contract. |
| I-02 | Accepted v1 | 247 수도권 building-match failures retain official representative-point assignments with `review_required=true`. |
| I-03 | Review queue | Apartment name, shared-complex, coverage, and property conflicts remain traceable and must not be silently auto-resolved. |
| I-04 | In progress | Nationwide expansion is now the current data milestone. Execute N0 pipeline generalization, then N1 metropolitan pilots; Building HUB/GIS/address-building integration and regional validation remain release gates. |
| I-05 | Monitor | Track PostgreSQL and Storage usage before retaining additional raw snapshots on the Supabase free tier. |
| I-06 | Resolved | SQL `10`, the two-table upload, remote RLS verification, and rental-ratio range constraints are complete. |
| I-07 | Resolved | Apartment age offers an unrestricted option; an old-complex sample passed the browser smoke test. |
| I-08 | Monitor | Naver Maps local authorization is configured for `localhost`; `127.0.0.1` is not an equivalent authorized origin. |
| I-09 | Review queue | Four K-apt rows report public-rental units above total households. Their rental breakdown and ratio are stored as null, `review_required=true`, rather than publishing impossible values. |
| I-10 | Resolved | SQL `11` and the first recurring pilot completed. Three source objects use about 12.2 MB, staging was purged, and the run is recorded as completed. |
| I-11 | Resolved | SQL `12`, one administrator UUID, the post-migration pilot, anonymous blocking, and authenticated monitoring reads are verified. |
| I-12 | Accepted v1 | The Windows task uses interactive logon and runs only while the ETL workstation user is logged in; `StartWhenAvailable` catches a missed run after login. |
| I-13 | In progress | The reviewed-input bundle is stored privately and read-only Actions run `34242752216` passed remote restore, tests, 52/52 checks, and all seven Windows-baseline comparisons. Keep the Windows task as fallback and require separate approval before enabling scheduled database writes and monitoring the first production run. |
| I-14 | Product contract pending | Academy geocoding passed: 29,274/29,664 unique addresses (98.69%). Decide apartment-radius semantics, marker UX, and private/public serving boundaries before production ingestion. |
| I-15 | Deferred | Timetable linkage and volume gates passed, but product value is insufficient. Resume only as a bounded creative-experience program pilot with a defined user feature. |
| I-16 | Blocked pending review | Playground data states Korea Open Government License Type 4 and location-information business requirements. Confirm commercial-use and location-service eligibility before API ingestion or publication. |
| I-17 | Resolved | The 학구도 source was not lost. The 2026-08-28 archiving pass had moved it to `archive/elementary-v2-pre-operational-20260828/etl/data/hakgudo/`, leaving empty directories behind; all 13 files were moved back to `etl/data/hakgudo/` on 2026-09-20 and verified readable. No download was needed. |
| I-18 | Corrected before use | The registry first carried assumed school-name prefixes for 부산, 대구, 광주, 울산. Measurement showed 부산 1.3% and 울산 4.0%, so those assumptions were wrong and are replaced by measured coverage. The per-region EDA gate caught this before any matching code used it. |
| I-19 | Open | Two 학구도 snapshots are present locally and `verify_hakgudo_spatial_join.py` points at the older one: `elem_hakgudo_20250922.shp` (`BASE_DT` 2025-09-22, 7,123 zones) versus `20260320/extracted/초등학교통학구역.shp` (2026-03-20, 7,140 zones). The 2026-03-20 file matches the school standard data the pipeline already uses, and for 대전 it carries 170 zones instead of 167. Choose the snapshot explicitly per run and record it in the manifest before the Daejeon build. |
| I-20 | Source layer done; migration pending | 광주시 and 전라남도 merged into **전라남도광주특별시** on 2026-07-01, and their education offices merge too. K-apt already writes the merged value (as 전남광주통합특별시) in its 시도 column and 법정동주소, while every source feeding the assignment backbone — the school standard data, the 학구도 polygons, and K-apt's own road addresses — still writes both names separately. Both halves therefore remain separate registry regions and `resolve_source_region()` translates either spelling of the merged value by 시군구 or road address; all 21,712 K-apt rows resolve into exactly 17 regions. Remaining work, due when the school and school-zone sources publish merged naming: collapse the two regions into one with a per-area address depth (광주 has no city level, 전남 does), merge the education office entries, and decide the displayed region name. |
| I-21 | Resolved | The portable read-only build was not hermetic on the ETL workstation: `build_apartment_master_v1.latest_kapt_source()` globbed the output directory and picked that morning's scheduled snapshot (`kapt_basic_20260918.csv`) instead of the bundle's reviewed input (`kapt_basic_20260904.csv`), so the locked baseline failed locally while a clean Actions runner passed. The builder now takes `--kapt-source` (or `ELEMENTARY_KAPT_SOURCE`), rejects a file it cannot date, and prints the snapshot it used; the read-only runner pins it to the materialized bundle input. The baseline now matches on this workstation: all seven files and 52/52 checks. |
| I-22 | Monitor | Production has moved ahead of the reviewed-inputs baseline, as designed: `apartment_complex_master` holds 21,178 rows against the bundle's 20,164, with `source_as_of` values up to 2026-09-18 from the scheduled Windows runs, while `school_master` (2,260) and `school_apartment_serving` (20,891) are unchanged. Nothing is out of scope — every row is in a production region. Treat the locked portability baseline as a reproducibility contract for the reviewed inputs, never as an expectation for live row counts; wave rollback compares against a snapshot taken just before that wave. |
| I-23 | Resolved | `etl_staging_rows` reached 3,296,176 rows and 3.11 GB, 95% of the database, while the operational tables stayed small. `cleanup_recurring_etl` deleted by `staged_at`, which has no index, so once the table grew every call scanned the whole table and was cancelled by the statement timeout, and each run added about 92,000 more rows. Migration `17` rewrites the cleanup to delete per run through the primary key with a bounded batch, adds the size RPCs, and the runner now fails rather than warns when staging is left behind. Applied, and a TRUNCATE reclaimed the space that DELETE alone would have left allocated. Verified 2026-09-29: `etl/check_capacity.py` calls both `public_table_sizes()` and `etl_staging_depth()` successfully, which only exist in 17, and reports staging at 0 rows across 0 runs and 0.0 MB. The database is 202.7 MB of 500 MB (40.5%) with all seventeen regions loaded — the staging table no longer appears among the largest at all. |
| I-24 | Resolved | One-way joint zones (`공동(일방)`, `일방향공동`) were published as ordinary assignments, so a 경주 apartment appeared in seventeen schools' assigned lists and 경북 produced 10,308 serving rows from 2,882 assignments. In such a zone the first school is the assignment and the rest are rural schools the student may choose instead. Rank 2 and beyond now carry `assignment_role = optional_one_way`, stay in the assignment tables, and are excluded from the published serving model. Nationwide serving falls from 60,520 to 48,038, 경북 from 10,308 to 2,995, and the capital from 20,891 to 20,850, which is 41 rows across four zones in 여주, 광주, and 수원. |
| I-25 | Resolved | Promoting 대전 broke more than freshness. The recurring runner verified each table's whole remote count against the capital snapshot, so the next scheduled run would have failed outright now that production holds four regions, and `run_due_etl` collected and staged the capital only. Both are now scope-aware: the daily task runs the capital as one scope and every later-promoted region as its own, verification is per region, and the serving refresh is checked against the scope it is accountable for. The `capital` slug was also narrowed to exactly the three capital regions, because it had come to mean "whatever is in production" and a default run would have written a four-region file over the one the portability baseline reproduces. |
| I-28 | Resolved | `npm run browser:smoke:public` failed at the apartment-detail step. The recorded diagnosis looked at sheet-content selection between `cafe111` and `c779548`; the cause was later than that and elsewhere. `0d42ca1` gated school detail's assignment features on `!isPublicElementarySchool`, a flag meaning public elementary school — true for 983 of a 1,000-school sample — so the negation switched the core feature off almost everywhere: the apartment detail never rendered, the three tabs were hidden, and the loading effect returned early after clearing `apartments`. The discriminator the code needed is `establishment_type`: only 공립 elementary schools are assigned by zone, while 국립 and 사립 are applied to and carry no complexes — 22 of 25 공립 against 1 of 17 국립 and 1 of 25 사립, measured against production. Fixed in `533531b` by renaming the flag to `assignsByZone` and using it in the direction the data supports, with the badge moved to mark the schools that legitimately have no assignment (`국립 · 통학구역 배정 없음`) rather than labelling the 98% case. The assertion could not have caught it either: it checked '총 세대수', '동 수' and '배정학교:', labels deleted in `1960fef`, so it failed on stale copy before reaching the broken flow; it now asserts the apartment detail itself. 29 assertions pass three runs in a row against production. |
| I-27 | Resolved | **Every deep link 404s in production.** `/` served normally while `/admin/etl` and every other non-asset path returned `X-Vercel-Error: NOT_FOUND`, leaving the ETL monitoring dashboard unreachable. The cause was the deploy path, not the app. Vercel's production branch was set to `main` — a two-commit stub from repository creation, sharing no history with `master` — so no push ever produced a production build, and releases went out as Vercel CLI deploys from `../.deploy/<sha>/app/`, a copy of `elementary-v2/` outside version control whose `vercel.json` carried no `rewrites`. The repo-root `pjt_250826/vercel.json` had the rewrite all along and was simply never the file in use. Resolved 2026-09-28 by moving the production branch to `release`: the first git build ran from the repository root, picked up that rewrite, and deep links answered 200 with the deployed tree byte-identical to what was already live. Deleted the `main` stub, which until then would have replaced the site with that prototype on a single push, preserving it as tag `archive/netlify-prototype-20250729`, and removed the 250 MB of `.deploy/` trees. Two findings kept in [`DEPLOYMENT.md`](DEPLOYMENT.md): CLI deploys were blocked seven times in ten since 09-21 by fork protection while no git build ever failed, and the CLI reports that only as `Error: Not authorized`. The public smoke now asserts a deep path resolves, which it could not before. `/vite.svg` still 404s because no `public/` directory exists — folded into the ADR-006 sitemap work. |
| I-26 | Contained; source still stale | The official school standard-data API returns exactly the snapshot we already hold: 12,011 rows, 6,303 elementary, reference date 2026-03-20, so refetching cannot help. Four schools exist and operate but are absent from that dataset, which is the only source of `school_id`: 참미르초 (광주, 4 units), 신연초 (부산, 3), 천안중앙초 (충남, 4, Schoolinfo `S120000815`, 천안시 동남구 영성로 73), and 무안희망초 (전남, 2, a new school in the 오룡 development). Such a school cannot enter `school_master`, so neither it nor its apartments get a serving row and both are simply absent from the map rather than shown as incomplete. Rather than block five regions indefinitely, these are now listed in `etl/upstream_school_gaps.json` with their evidence; the audit excuses only those exact single-school zone labels, counts them as `known_upstream_gap_units`, and still fails on any other unmatched label. Each affected complex stays on the pooled review sheet as `upstream_school_gap`, so the work is tracked and reversible: delete the entry when the source republishes. Still open: a joint zone naming a listed gap loses its whole assignment, because segmentation requires full cover. 전남's 무안사랑초무안희망초공동통학구역 is the one measured case; its primary 무안사랑초 exists and the unit should link to it once segmentation can skip a listed gap. Separately, 군위's 송원초 and 효령초 report as 대구군위초등학교송원캠퍼스 and 대구부계초등학교효령캠퍼스 since the 2023 transfer, so their figures are absent by design. |

## Update Log

- 2026-09-30: Prepared for a domain move and stopped spending the title on a release number. The origin had five hardcoded copies — the prerender, index.html's canonical and og:url, robots.txt's Sitemap directive, and the sitemap generator — which is the shape of problem where four of them get updated. It now has one definition in `scripts/site-origin.mjs`; a Vite plugin stamps index.html (Vite's own `%VAR%` substitution is not used, because it leaves an unknown name in the output verbatim and would ship a canonical URL reading `%VITE_SITE_ORIGIN%`), and robots.txt moved out of `public/` into the post-build step, since a file copied verbatim would carry the old domain through a move. A domain change is now `SITE_ORIGIN` plus registering the host with Naver Cloud, whose allowlist protects the maps key — an unregistered domain loads the page and then fails to draw a map, which is worth knowing before rather than after. The prerender is deployed from the repository root and cannot import that resolver, so it reads the same variable and keeps the same fallback; that is a promise rather than a guarantee, so the smoke now compares what the two deployment units actually serve and refuses a state where only one of them moved. Verified by pointing robots.txt at a different domain, which the check named exactly, and it distinguishes a real prerendered response from the SPA fallback so it cannot claim to have checked the function when it only saw the shell twice — production reports five addresses agreeing with the prerender included, the dev server four without it. **The sequencing point matters more than the refactor**: Search Console and 네이버 서치어드바이저 registration moved behind the domain in the concept's phase-1 list, because registering first and moving later means 301s across 52,155 addresses and a re-indexing wait, which is the same reason the slugs were issued before any URL was published. Brand name settled as 어디초 and the title is now `어디초 | 초등학교 배정 아파트 찾기`; 킨더엘 was rejected on meaning rather than taste, since it names a kindergarten-to-elementary transition and the product answers an apartment's assignment at any grade. The release number moved from the title to `<meta name=app-version>`, stamped from package.json instead of hand-edited each release, and the freshness assertion moved with it. One incidental finding: eslint had no TypeScript parser configured for root config files, which is why `vite.config.ts` carried no type annotations — the first one read as a syntax error in valid code. `docs/operations/DEPLOYMENT.md` §7 is the domain-move checklist, including what needs no change at all: the share button and client canonical read `window.location.origin`, and admin login uses `signInWithPassword`, so no Supabase redirect allowlist is involved.
- 2026-09-30: Shipped the ADR-006 prerender and gave the shell its own share metadata. Split into two deploys on purpose: the function went out with the rewrites untouched, so no visitor path reached it until it had answered all five cases correctly in production. That is what caught the real bug. On its first cold start the school route returned the bare shell, and the cause was sequencing rather than logic — the handler awaited the shell, then `school_master`, then serving, each with a 4s budget, so a cold request could spend 12s against the function's 10s limit and be killed before the fail-open path could run. None of the three depends on another, so they now run concurrently, which is also the difference between a crawler seeing the prerender and seeing nothing: crawlers arrive rarely, so they arrive cold almost every time. Verified on a cold deploy: apartment, school, bare key and arbitrary decoration all render with title, description, canonical and the assignment links, a key that names nothing answers 404, and every other address still falls through the catch-all. Three separate problems in the shell's head closed with it. The description still named 서울/경기/인천 after all seventeen regions went live, so search results told a searcher the answer was not here. There were no `og:` tags at all, which meant the share button built the week before produced an empty KakaoTalk preview for the map page and for every fail-open response. And adding them to the shell would have given detail pages two canonicals and two of each `og:` tag, so `inject()` now strips the shell's copies first and leaves `og:type`, `og:site_name` and `og:locale` — the same on every page — as the shell set them. `og:image` is still missing and is recorded as an outstanding item; a preview thumbnail needs a designed 1200×630 image, and a blank one looks more broken than none. The gate now covers all of it: the smoke asserts the `og:` tags exist and that the description does not name a stale subset of regions, both of which fail against the site as it stood that morning, and its sitemap checks fall back to `dist/` when the target cannot serve a build-generated file and say which copy they read — a check that can pass without looking at anything is the failure this script has been bitten by more than once. Full smoke passes against both the dev server and production.
- 2026-09-29: Closed the nationwide data expansion and decided against the join tolerance. Snapping a point 30–50 m outside a boundary to its nearest zone would recover most of the 19 explained complexes, but it changes the assignment rule for all seventeen regions at once, so it risks moving complexes that are currently assigned correctly for the sake of 33 that are missing — 0.07% of 45,853. Not taken; if these are fixed, correcting the coordinates is the narrower route. The measurements are recorded either way, so the option stays open on evidence rather than on memory. `docs/PROJECT_OVERVIEW.md` now carries the whole ETL outcome for a non-technical reader: the final scale, the four upstream school gaps and their 13 complexes, the 20 unmatched points and what measuring them showed, the single case still held, and the two traps this work actually hit — looking a complex up by name when names repeat nationwide, and tests that encode a point-in-time fact such as "a region not yet in production", which broke the moment none was left.
- 2026-09-29: Measured the held review cases against the zone polygons instead of reading them one by one, which took the open list from 20 to 1. `unassigned_point_nohit` reports only that a representative point matched no polygon, and that turned out to be three different problems under one label. Against all 7,140 polygons, **no point sits inside a polygon yet unassigned**, so the spatial join itself is sound; the points really are outside every zone, but mostly by very little — 17 m at the closest, 72 m median, 393 m at the furthest. Six are within 30 m, which is narrower than a building, so the coordinate is the likelier culprit than the polygon; eleven sit in a gap with two to four zones within 300 m, including four complexes clustered at one spot near 전포초 that are one polygon defect rather than four cases; and three are beyond the coverage. Only 부산 기장's `(75-0)` has no zone within 300 m at all, and with an unnamed-looking complex and no approval year it needs its source data checked first — it is the single case still held. The other nineteen are recorded as explained, with the measurement in the note, but they remain absent from the map because an unassigned complex gets no serving row; closing that needs either corrected coordinates or a join tolerance, which would change assignment rules nationwide and is not done here. `etl/measure_unassigned_points.py` makes the measurement one command, and [REVIEW_HELD_CASES.md](REVIEW_HELD_CASES.md) carries the per-complex table.
- 2026-09-29: Closed out the pooled manual review. Of 182 cases, 162 are accepted and 20 are held, and three measurements did most of the sorting: `unassigned_apartment` and `review_required_unit` name the same 23 complexes, so half of those 46 rows were one complex counted twice; 17 of the 23 unmatched zone labels have no apartment on them at all and the other 6 are the already-listed source gaps and Sejong's cross-border zone; and the 6 목포 cases resolve in production once looked up by `canonical_complex_id` rather than by name, which is what my earlier by-name query got wrong. That leaves 20 complexes whose representative point falls in no zone polygon (`unassigned_point_nohit`) and which therefore have no serving row, so they are absent from the map rather than wrongly assigned. They are listed with coordinates and map links in [REVIEW_HELD_CASES.md](REVIEW_HELD_CASES.md). Verdicts now live in the committed `etl/review_verdicts.csv` and are reapplied by `collect_review_cases.py`, so regenerating the sheet no longer discards them and unjudged cases sort to the top. I-23 was also stale: migration 17 is applied — `check_capacity.py` calls both of its RPCs successfully and staging is 0 rows — so it is marked resolved.
- 2026-09-28: Shipped the nationwide expansion to the public site and fixed what was blocking it. The deploy path changed first: production had been tracking `main`, a two-commit stub from repository creation, so no push ever built production and releases went out as CLI deploys from an unversioned `.deploy/<sha>/app/` copy whose `vercel.json` had no `rewrites` — which is the whole of I-27. Production now tracks `release`; the first git build ran from the repository root, picked up the rewrite that had been sitting there since August, and deep links answered 200 with the deployed tree byte-identical to what was already live. Deleted the `main` stub after tagging it `archive/netlify-prototype-20250729`, since a single push to it would have replaced the site with that prototype, and removed 250 MB of `.deploy/` trees. Then I-28: `0d42ca1` had disabled assigned-apartment browsing for 공립 elementary schools, which is nearly all of them, by negating a flag that identifies exactly the schools the feature is for; `establishment_type` is the discriminator, and 국립/사립 schools now say why they have no assignment instead of rendering empty. Released with lint, typecheck, build and 29 smoke assertions passing on the shipping tree: 1,985 schools in 606ms, assigned-apartment reads in 182-276ms. Two things the gate had been hiding are now closed — the smoke only ever opened the base URL, and its waits were fixed durations that passed locally and failed intermittently over the network, so it asserts a deep path and polls for conditions. Academy figures cover nine regions; the other eight render 학원 데이터 준비 중.
- 2026-09-27: Fixed the one matcher defect the gap allowlist exposed, then loaded the rest of the country. Segmentation needs full cover, so a joint zone naming a listed gap lost the schools that do exist beside it; it now drops only listed gap names, only when no candidate carries them, and only on a label that matched nothing at all — so it can add an assignment but never rewrite one. 전남's 무안사랑초무안희망초공동통학구역 now resolves to 무안사랑초, and the capital's three operational outputs are byte-identical after a full rebuild. Uploaded and promoted the last five regions: 전남, 강원, 전북, 경북, 경남. **Production now covers all seventeen regions: 6,302 schools and 48,189 serving rows, with the per-region totals summing exactly to the table totals, so nothing is out of scope.** The registry contract passes 14/14 and capacity is 183.6 MB of 500 MB (36.7%) — well under the 264 MB projected earlier. 100 ETL tests pass; three more point-in-time assumptions were rewritten as contracts, two of which broke precisely because no unpromoted region exists any more to serve as an "outside the scope" fixture. The pooled review sheet stands at 182 cases, 13 of them tracked source gaps. Recorded I-28: the public smoke fails on a frontend regression that predates this work.
- 2026-09-27: Five regions were blocked by one upstream defect, so it was contained rather than waited out. 세종 was built together with 충북 and 충남, since its joint zones name schools across both borders; that scope resolved every one of them and reached 52/52, 3,080 of 3,085 assignments linked. The four remaining unlinked complexes all sat in one 천안 polygon naming 천안중앙초, a school that operates and is in the Schoolinfo API but is missing from the school standard data that supplies `school_id` — the same defect as 참미르초, 신연초, and 전남's 무안희망초. `etl/upstream_school_gaps.json` now lists those four with their evidence; the audit excuses only those exact single-school labels, reports them as `known_upstream_gap_units`, and keeps failing on anything else, verified by 수도권 staying at 0 excused and 전남 still failing its joint-zone case. Uploaded and promoted 세종, 충북, 충남, then 광주 and 부산: production covers twelve regions with 4,092 schools and 36,496 serving rows, each verified per region by anonymous read, and the registry contract passes 14/14. Capacity is 155.5 MB / 500 MB (31.1%). The pooled review sheet is regenerated at 183 cases, 11 of them the tracked source gaps, and the collector learned `--group` so a multi-region wave's sheet reads the scope it will actually upload. Two earlier statements of mine were wrong and are corrected here: the combined build's failures were 4 in one check, not 24 plus a review-queue mismatch, and 전남's 삼향초 is not a matcher bug but a 목포-only scope that excludes its 무안군 neighbour.
- 2026-09-27: Switched manual acceptance to one pooled expansion review, without weakening the upload gate. The standalone page now contains 730 stratified samples across fourteen non-capital regional scopes plus the 30-row Mokpo pilot, and 185 explicit pipeline exception cases, 915 rows total. Rebuilt and re-audited the ten regions not yet in production. Fixed three measured parser defects: a capital-era `대원초` inactive alias shadowed the real Changwon school, grade-specific records separated by whitespace were treated as one label, and provincial one-way/branch/transition-plan spellings were not normalized. Also fixed the regional audit's review-trace check so polygon no-hits no longer depend on the capital-only queue. 강원, 충북, 전북, 경북, and 경남 now pass 52/52. The remaining 14 unlinked apartment units reduce to four source-freshness school names: 부산 신연초 (3), 광주 참미르초 (4), 충남 천안중앙초 (4), and 전남 무안희망초 (3). They remain explicit review cases rather than guessed aliases. Capacity is 143.4 MB / 500 MB (28.7%), within the 70% budget. No additional region was promoted or uploaded before the pooled human review.
- 2026-09-27: Confirmed with the source rather than by inference that no fresher school standard data exists: the official API returns the same 12,011 rows and the same 2026-03-20 reference date we already hold, so 광주's missing 참미르초 is an upstream gap. Added `etl/fetch_school_standard_data.py` so the next refresh is one command. Split the grade-statistics check three ways, since only one of them is our problem: a school outside the disclosure system, a school the disclosure lists without publishing any figures, and a school whose published figures are incomplete. 대구's four are the middle case, two of them 군위 schools now reporting as campuses of others, and none of the four has a single assigned apartment. That took 대구 to 52/52; it is uploaded and promoted with 237 schools, 2,075 complexes and 2,259 serving rows. Production covers seven regions and the database is 143.4 MB, 28.7% of the limit.
- 2026-09-27: The city prefix turns out to go both ways. Gangwon zones add it, 원주섬강초 for 섬강초등학교, while a Gyeongbuk zone drops it, 압량초 for 경산압량초등학교. Dropping it is the looser direction, and offering it everywhere silently changed capital assignments: row counts held but three checksums moved, because the wider pool picked a different school. Stripped spellings are therefore offered only in the wider pool, where every match is distance-validated, and the capital is byte-identical again. 경북 gains 14 apartments and the pooled cases fall from 241 to 223. Recorded I-26: 참미르초 and 신연초 exist in the Schoolinfo API but not in the school standard data that supplies `school_id`, so 광주 stays blocked until that source is refreshed, and 군위's two schools now report as campuses of other schools rather than separately.
- 2026-09-27: Built the pooled review sheet and uploaded 제주. The sheet now carries a priority, what to check, and a map link per case, ordered so a wrong or missing assignment is read before a school that simply has no apartments nearby. The audit also learned a distinction it was missing: a school with no Schoolinfo code is not in the disclosure system at all, such as the international school in 제주영어교육도시, while a school that has a code and no grade figures is a real gap. Exempting the former took 제주 to 52/52 and left 대구's four coded schools still failing, which is correct. 제주 uploaded and promoted: 119 schools, 1,121 complexes, 1,169 serving rows, verified per region. Production covers six regions and the database is 140.5 MB, 28.1% of the limit.
- 2026-09-27: Added a standalone manual-QA review page for the next regional acceptance pass. It loads reproducible stratified samples for 대전, 대구, 부산, 광주, 울산, 세종, 제주, and the 목포 city pilot: 50 rows for each metropolitan or special-self-governing scope and 30 for 목포, 380 rows total. Review verdicts and notes persist locally in the browser and export to CSV; this prepares the human gate but does not mark any region accepted. The initial view is 대전, and the selected region is remembered between sessions.
- 2026-09-26: Uploaded 울산 and promoted it, the second region beyond the capital: 124 schools, 1,631 complexes, 1,670 assignment units, 1,631 serving rows, each verified by region. Production now serves five regions and the database is 139.1 MB, 27.8% of the limit. Two tests still described the pre-pinning build arguments and were updated to the current contract, which pins every baseline build stage to the capital scope.
- 2026-09-26: Closed I-25, which turned out to be worse than stale data. With 대전 in production the recurring runner would have failed on its next scheduled run, because it compared each table's whole remote count against the capital snapshot; `run_due_etl` also collected and staged the capital only. The daily task now runs the capital as one scope and each later-promoted region as its own, verifies per region, and checks the serving refresh against its own scope. Narrowed the `capital` slug to exactly the three capital regions: it had silently come to mean "whatever is in production", so a default fetch would have overwritten the file the portability baseline reproduces. A manifest must now declare its scope. Four more tests that asserted a three-region production set were rewritten against the registry; 80 tests pass and the baseline matches.
- 2026-09-26: Uploaded 대전 to production, the first non-capital region. 155 schools, 1,035 complexes, 1,063 assignment units, 1,200 links, 1,085 serving rows, each verified by region against the live database, with the capital totals growing by exactly those amounts and anonymous reads of the 대전 serving rows working. Promoted 대전 in the registry, regenerated the TypeScript and SQL artifacts, and synced the monitoring schedules. Two defects surfaced and were fixed on the way: the scoped count query built a malformed URL with two question marks, which aborted the first attempt after `school_master` had already loaded, and three tests asserted that only the capital is in production, which was a point-in-time fact rather than an invariant. Database is 136.6 MB, 27.3% of the limit. Recorded I-25: the recurring manifest still collects the capital only, so 대전 will go stale until it is added.
- 2026-09-26: Made the uploader scope-aware and added a readiness check. The uploader verified that a table's whole remote count equalled the local snapshot, which a regional wave can never satisfy; it now reads the wave's own output files, verifies the scope's regions rather than the table, grows the history tables by exactly the rows it adds, and writes a pre-upload count snapshot as the rollback evidence the gate asks for. `etl/check_wave_readiness.py` reports the measurable gates per scope and names the ones that still need a person. Of the fourteen built scopes, 대전 and 울산 pass every measurable gate today; the other twelve fail only on audit checks that correspond to the 242 pooled review cases.
- 2026-09-26: Zone labels can prefix a school with its city, not only its region: Gangwon writes 원주섬강초 and 고성동광초 where the schools are 섬강초등학교 in 원주시 and 동광초등학교 in 고성군. Candidate generation now includes that spelling for provinces, which takes 강원 from 98.5% to 100% and cuts the pooled review cases from 300 to 242; 강원 alone drops from 75 to 15. One missing component had been failing whole multi-school labels, so a single county-prefixed name cost 21 apartments their assignment. The capital outputs are unchanged against the relocked baseline.
- 2026-09-26: Separated one-way joint zones from real assignments. In a `공동(일방)` or `일방향공동` zone only the first school is the assignment; the rest are rural schools a student may choose instead, which is why 경북 produced 10,308 serving rows from 2,882 assignments. Those links keep their place in the assignment tables with `assignment_role = optional_one_way` and are excluded from the serving model, taking nationwide serving from 60,520 to 48,038 and 경북 from 10,308 to 2,995. The capital changes too, by 41 rows across four zones in 여주, 광주, and 수원, so the locked baseline was relocked through a new `--relock REASON` flag that records why its numbers moved. Measured capacity: the database is 135.2 MB after the staging truncation, and the nationwide projection is about 264 MB, 53% of the free-tier limit.
- 2026-09-26: Found why the database is 3.3 GB, and it is not the expansion. `etl_staging_rows` holds 3,296,176 rows across about 36 runs' worth of staging because the retention delete filtered on an unindexed `staged_at` and timed out once the table grew, and the post-run check recorded a warning rather than a failure. Migration `17` deletes per run through the primary key in bounded batches, adds `etl_staging_depth()` and `public_table_sizes()`, and `etl/check_capacity.py` now measures the capacity gate instead of estimating it. Also corrected my own projection: measured against the real sizes, the nationwide estimate is about 230 MB rather than the 119 MB reported on 2026-09-23, because the earlier multiplier understated JSONB and index overhead by roughly half.
- 2026-09-23: Built the remaining six provinces and 전라남도 in full, completing all seventeen regions: 6,302 schools, 45,915 canonical complexes, and 60,520 serving rows against the 2,260 / 20,164 / 20,891 in production. Four more zone-suffix formats appeared, the largest being 광역통학구역, which alone held 경상남도 at 86.0%; it now reads 99.7%, and every province is above 98%. The capital outputs still match the locked baseline after each label change. 300 review cases are pooled nationwide. One question is left open for the product rather than decided in the pipeline: 경북 generates 10,308 serving rows from 2,882 assignments because a 경주 zone names 17 schools and 484 complexes nationwide are assigned to nine or more.
- 2026-09-23: Built 광주, 세종, 제주, and the 전라남도/목포시 city pilot. The Schoolinfo API already uses the merged 전남광주통합특별시 for both the education office and the address, which the registry knew only as a K-apt value, so 광주 and 목포 silently fetched 0 rows and produced school masters with no statistics. The registry now resolves merged offices and addresses by the district that follows them and canonicalizes addresses before comparison, which also restored exact-address matching for 광주 at 155/155. Added 제한적공동통학구역 to the label formats, taking 전남 from 76.6% to 99.0%, and found joint zones that name schools in a neighbouring region: 전남 names 광주 schools and 세종 names 충북 and 충남 ones, which a single-region build cannot resolve. Fixed a defect of my own making along the way: the school builder matched any scope's Schoolinfo file when the slug was omitted, so the capital build had started reading Busan's snapshot; the slug is now required and the locked baseline matches again. 49 review cases pooled across seven regions, plus 13 for 목포.
- 2026-09-22: Built 대구, 부산, and 울산 beside 대전 and parked their review cases for one batch review instead of resolving them region by region. The zone profiler caught Daegu at 94.8%: it writes joint zones as 일방향공동/양방향공동, which the matcher did not strip, and every 군위 zone failed. Widening that expression took Daegu to 100% and left the capital outputs byte-identical against the locked baseline. Also fixed a latent crash in the school builder, which sorted a counter containing None and had never seen an unmatched school before. Audits: 대전 and 울산 52/52, 대구 51/52, 부산 49/52, with the failures being exactly the parked cases. 36 review rows across the four regions, 25 distinct subjects.
- 2026-09-22: Verified migration 16 live with a new read-only checker, `etl/verify_region_registry_contract.py`: 14/14 checks pass. All 17 regions are seeded with only the three capital ones in production, the registry version matches the local file, anonymous reads of `region_registry` are refused while both public tables still read normally, the schedules follow the production regions, and every region-backed table holds only production regions. The three foreign keys are proven by asking PostgREST to embed `region_registry`, which only works through a real foreign key. The run also showed production sitting ahead of the reviewed-inputs baseline from scheduled loads, recorded as I-22, and the per-wave rollback gate now compares against a pre-upload snapshot rather than the frozen baseline numbers.
- 2026-09-21: Finished the remaining N0 code items. `audit_apartment_etl.py` now takes its legal-dong prefixes from the registry, resolves K-apt rows through `resolve_source_region()` so merged region values split instead of dropping, and reports per region. `build_school_master_v2.py` derives region from the registry and treats the collector's scope slug as opaque, so a new wave needs no change there. Closed two items deliberately rather than generalizing them: `audit_school_etl.py` audits v1 snapshots that no longer exist and nothing calls it, so it is annotated as historical, and the `_capital` file names stay because `capital` is just the slug for the production scope. Verified against the locked baseline: the portable read-only build still matches on all seven files with 52/52 checks.
- 2026-09-21: Wrote `sql/16_create_region_registry_contract.sql`, generated from the registry. It replaces migration 06's literal three-region CHECK constraints with a private `region_registry` table and foreign keys from the two apartment tables plus `school_master`, which had no region validation at all, and repoints the migration-12 schedule scopes at whatever is flagged production. Promoting a region becomes an UPDATE rather than a new migration. All 17 regions are seeded with only the three capital ones in production, so applying it changes no current behavior. The file number is 16 because 14 and 15 are the academy migrations. Not applied yet: it needs approval and a live check, and the guide carries the verification queries.
- 2026-09-21: Scoped the map's school read to the regions actually on screen. `fetchDistrictOverviewData` took no bounds and paged every school matching the filters, which is what made the initial read 2.21 s for 2,260 rows and would have paged roughly 6,300 nationwide; it now intersects the selected regions with the registry envelopes for the current viewport, and the aggregate read honors the region filter too. District and neighborhood totals stay full-area rather than viewport-clipped, because a district never spans two regions. The initial read fell to 0.89 s, and the public smoke passed at all four widths.
- 2026-09-21: Moved the frontend onto the registry through a generated `src/constants/regionRegistry.ts`: default selected regions, the news region filter, region map centers, and the address parser's city level, which was previously a `경기도`-only branch and now covers every province plus Jeju and Sejong. Capital map centers keep their existing government-office coordinates, so the map does not shift. Verified with lint, typecheck, build, and the public browser smoke at 360/390/430/1280 px: all checks passed, initial map read 2.21 s and apartment reads 0.53-0.77 s, inside the 5 s and 3 s budgets. The 2.21 s is measured on an unscoped 2,260-row read, which is why the region-scoped school read stays on the N0 list.
- 2026-09-21: Fixed I-21 and restored the local regression gate. The apartment builder now requires an explicit K-apt snapshot for a reproducible build instead of discovering the newest local one, and `run_portable_readonly_build.py` pins it to the file the bundle restored. The portable read-only build now reports `match: true` on this workstation, which also confirms the registry move in the builders and audit against the locked baseline rather than only against a before-and-after comparison.
- 2026-09-21: Moved the builders and the backend audit onto the registry: address-derived region, legal-dong prefixes including legacy codes, the school-name prefix used for zone matching, and per-region coordinate bounds replacing the single capital box. Proven output-neutral — the portable read-only build produces byte-identical output with and without the change, checked by running it both ways. That run also exposed I-21: the build is not hermetic on this workstation, because the apartment builder picks the newest local `kapt_basic_*.csv` (2026-09-18) rather than the one the bundle restored (2026-09-04), so the locked baseline fails here while a clean Actions runner passes.
- 2026-09-21: Parameterized both collectors by scope through the region registry. `fetch_schoolinfo_2026.py` filters by education office or address and `fetch_kapt_current.py` resolves the `시도` column, so merged post-2026-07-01 values split by 시군구 instead of being dropped. Verified against the real sources that the capital scope is unchanged (2,313 of 2,313 Schoolinfo rows, an identical 9,645 K-apt codes) and that new scopes work (대전 568 codes, 전라남도/목포시 146). Added a package-import bootstrap so the scheduled runner can keep invoking these by file path; 46 Python tests pass.
- 2026-09-21: Confirmed the merged region's official name (전라남도광주특별시) and that the education offices merge as well. The registry now records the official name alongside the K-apt spelling, resolves either spelling identically, and refuses both through `get()`; 23 registry tests pass. The full collapse into one region with a per-area address depth and a merged education office waits until the school and school-zone sources migrate. 광주 and 목포 remain in the N1 queue with EDA first.
- 2026-09-20: Confirmed the 광주-전남 merger of 2026-07-01 and added registry source translation for it: both halves stay separate regions, `resolve_source_region()` splits the merged source value by 시군구 or road address, and `get()` refuses the merged value outright. Validated on the full K-apt file — all 21,712 rows resolve into exactly 17 regions, 광주 932 plus 전남 778 matching the 1,710 merged rows, with the only 2 disagreements being unrelated source errors. Registry tests now number 21.
- 2026-09-20: Completed the Daejeon apartment EDA on the 2026-03-20 school-zone snapshot. All 1,063 Daejeon complexes have coordinates and fall inside exactly one school zone (100%, no duplicates and no representative-point fallback needed), and K-apt links to the base master at 81.8% by exact road address, with 80 rows carrying no road address and 27 storing two addresses in one field. Found that K-apt now reports `전남광주통합특별시` in place of 광주광역시 and 전라남도 while every other source, including K-apt's own road addresses, keeps them separate; recorded as I-20 because it redefines two N1 scopes.
- 2026-09-20: Moved the 학구도 source back from the archive to `etl/data/hakgudo/` and verified both snapshots read correctly. Daejeon segments at 100% on either one (167/167 on 2025-09-22, 170/170 on 2026-03-20), with only the two private schools lacking a zone. Recorded the snapshot-version choice as I-19.
- 2026-09-20: Completed the Daejeon school-zone EDA. All 167 Daejeon zones (139 단독, 28 공동) segment into known schools at 100% using the existing `match_school_zone` with registry-driven name variants, so the capital matching method needs no replacement for this scope; the only 2 schools without a zone are private. Located the 학구도 source in the 2026-08-28 archive rather than re-downloading it.
- 2026-09-20: Ran the school half of the Daejeon EDA with the new reusable profiler (`etl/profile_region_schools.py`) and recorded it in `REGION_EDA_FINDINGS.md`. Measured all 17 regions while doing so: they account for all 6,303 nationwide elementary schools with no unresolved address, and every registry coordinate envelope is now measured rather than approximate. The school-name region prefix turns out to be measured, not categorical — 대구 96.6%, 서울 93.9%, 대전 80.6%, but 부산 1.3% and 울산 4.0%, and no region reaches 100% — so the registry now stores coverage and matching must accept both forms of every label. Daejeon's school-zone EDA is blocked: the 학구도 source is a local artifact and is no longer present.
- 2026-09-20: Started N0. Added the canonical region registry, its loader, and 15 tests; capital-region bounds are measured from the operational school master and the alias rules keep `경기도 광주시` from resolving to 광주광역시. Changed N1 from a five-region batch to a one-region-at-a-time queue and added the per-region EDA gate, because school-zone records are organized differently by education office and by district inside one office.
- 2026-09-17: Added quantitative per-wave release gates covering source completeness, data quality, manual QA, Supabase/RLS, capacity, performance, rollback, and operations, plus stage exit criteria for N0-N4.
- 2026-09-17: Reorganized active documentation into product, architecture, UX, operations, decisions, and reference sections. Promoted the newer joinmap baseline into a current `architecture/DATA_ARCHITECTURE.html` DRD with SQL 12–13, v2.2 P3, security boundaries, and nationwide rollout context; retained compatibility pointers at prior document paths for one release.
- 2026-09-16: Consolidated the future data-domain decisions into this authoritative plan and archived the superseded plan, dated analysis reports, visual reports, and analysis/research-only ETL outside the active application tree.
- 2026-09-16: Deferred the school/housing quadrant report generation to the owner-managed backlog. Promoted nationwide database expansion to the current data milestone, with N0 pipeline generalization followed by Daejeon, Daegu, Busan, Gwangju, Ulsan, and a bounded Mokpo city pilot; later waves cover remaining major cities and rural counties.
- 2026-09-09: Registered `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as repository secrets and passed read-only GitHub Actions run `34242752216` at `d3e29f1`. Ubuntu restored all eight private inputs, passed portability tests and 52/52 backend checks, matched all seven output row counts and canonical checksums, and uploaded the comparison artifact. The workflow performed no database or Serving writes.
- 2026-09-07: Fixed the portability comparison baseline, which could never have matched a Linux Actions run. JSON outputs are written through `Path.write_text`, so Windows stored CRLF and Linux would store LF, changing the byte hash without changing the data. `run_portable_readonly_build.py` now hashes JSON by canonical content (`sort_keys`, fixed separators) and keeps byte hashes for CSV, which `csv.DictWriter` writes as CRLF on every platform. Re-locked the five JSON baseline hashes; row counts and the two CSV hashes are unchanged. 13 Python unit tests pass and all seven outputs match the baseline. Remaining P5 work is unchanged: register Actions secrets and run the workflow.
- 2026-09-07: Regenerated the two 2026-09-06 analysis reports against the current snapshot. `verify_missing_school_sample.py` reproduced byte-identical output, but `analyze_report_clusters.py` did not: the operational outputs were rebuilt at 20:01 on 2026-09-07, which shifted school and complex cluster membership (school cluster 0: 730 to 707; complex cluster 0: 2,921 to 3,420 complexes, median 788 to 594 households). Committed the regenerated reports and corrected five figures in the Instagram carousel draft that still quoted the superseded run. Analysis reports are snapshot-bound and must be regenerated whenever operational outputs are rebuilt.
- 2026-09-06: Deferred station/address search after source-contract discovery. Added a checksum-locked five-file ETL portability manifest, generated a 4.35 MB bundle from 23.04 MB of reviewed inputs, uploaded it to private Storage, passed service-role restore, and confirmed anonymous download is blocked.

- 2026-08-28: Archived 146 pre-operational files under `archive/elementary-v2-pre-operational-20260828/` and added an active documentation index.
- 2026-08-28: Consolidated the current pipeline status; marked SQL `09` and recurring source ingestion as the next milestone.
- 2026-08-28: Reordered the plan to finalize the frontend data contract before recurring ETL and recorded the current frontend fixes and remaining field/index work.
- 2026-08-28: Finalized the two-table frontend contract locally, rebuilt outputs with K-apt parking/rental fields, and passed 51/51 backend checks. Remote SQL `10` application is next.
- 2026-08-29: Applied SQL `10`, uploaded 20,164 complex and 20,891 serving rows, verified the two-table anonymous contract, and passed desktop/mobile browser smoke tests.
- 2026-08-29: Rejected four impossible K-apt rental breakdowns, expanded the audit to 52/52 checks, and prepared idempotent 0-100 ratio constraints for one SQL `10` rerun.
- 2026-08-29: Re-ran SQL `10` and completed the frontend data-contract milestone, including the public-rental-ratio constraints.
- 2026-08-29: Installed SQL `09`; the first refresh test was safely rolled back by Supabase's predicate-free DELETE guard. Prepared a `WHERE TRUE` correction for re-application.
- 2026-08-29: Re-applied SQL `09` and verified an atomic Serving refresh: 20,891 rows before, inserted, and after, with public/private RLS unchanged.
- 2026-08-29: Added SQL `11`, the versioned source manifest, and a recurring ETL runner. The read-only pilot validated 92,106 staged master rows and about 12.2 MB of compressed source snapshots.
- 2026-08-29: Completed recurring pilot `6a0dec11-db00-40df-98f4-43563ebbdf4f`: archived three sources, staged/upserted 92,106 master rows, rebuilt 20,891 Serving rows, and purged staging. Anonymous frontend samples returned in about 210 ms and 191 ms.
- 2026-08-29: Added the authenticated ETL monitoring contract and `/admin/etl` dashboard for schedule, region/domain scope, run history, source retention, and quality gates; frontend and Python checks pass.
- 2026-08-29: Applied SQL `12`, verified one administrator and RLS, and completed pilot `c4cdf11d-a3df-4855-ab92-d4200b89c842` with 92,106 master rows, 20,891 Serving rows, and 8/8 monitoring checks.
- 2026-08-29: Installed project-pinned `agent-browser` 0.35.1 with Chrome for Testing and added the repeatable `/admin/etl` smoke command.
- 2026-08-29: Chose the local Windows host for the first recurring schedule, added due-source collection and bounded retries, and separated frontend UX work into the next milestone.
- 2026-08-29: Registered and smoke-tested the daily 03:15 Windows task, including battery execution, no-op maintenance, expired-object cleanup, and Serving-preservation retry tests.
- 2026-08-29: Completed the first public-map UX pass: accessible mobile controls, a correctly scrollable/inert filter drawer, persistent markers during refresh, and mobile clusters reduced from 147 to 37 at the initial viewport.
- 2026-08-30: Reframed the public map around nearby schools, added permission-aware geolocation, removed restrictive default filters, prioritized grade-1 and assigned-apartment facts, eliminated a duplicate apartment query, and verified 서울대곡초 on desktop/mobile.
- 2026-08-30: Restored the v1 map presentation, removed hover popups and singleton circle markers, fixed Gyeonggi city/district parsing, and verified district summaries plus school-detail selection in the browser.
- 2026-08-30: Completed the v2.0 apartment-map flow: 서울대곡초 displays 은마 and 대치미도맨션 with household counts, fits both markers above the detail sheet, and opens apartment detail from marker selection.
- 2026-08-31: Finalized the v2.0 school-detail contract: grade statistics precede household-sorted apartments, chart modes are students and students per class, parking is split by ground/underground, and map levels are district, neighborhood, then individual school.
- 2026-08-31: Refined apartment marker density using the 서울방현초 sample: 22 of 24 sub-100-household complexes render as low-priority dots, while larger complexes use tier-scaled exact-count callouts above them.
- 2026-08-31: Replaced building-icon abbreviations with parking/Airbnb-style exact household callouts, selected-state color inversion, and bottom-sheet detail; verified 서울대곡초 and 서울방현초 on desktop and 390px mobile.
- 2026-08-31: Unified neighborhood grouping and drilldown fallback labels, made map-level transitions immediate, and added school-selection focus: solid blue selected marker, 62% nearby markers, and teal assigned apartments.
- 2026-08-31: Added administrative drilldown queries for district-to-neighborhood-to-school clicks and removed apartment-bound fitting so school selection preserves zoom 15; verified 강남구→도곡동→서울대도초 in Chrome.
- 2026-08-31: Removed address-string rematching from neighborhood clicks. The frontend now fetches the exact school IDs contained in the clicked neighborhood marker; verified 성남시 분당구→정자동 and 광명시→철산동 in Chrome.
- 2026-08-31: Removed school-selection `panTo`/`panBy`; clicking a visible school now opens its details and apartment markers without changing the current map center or zoom.
- 2026-09-01: Replaced inequality text on administrative markers with blue/orange numeric counts and a compact legend. Added selectable students/classes/per-class summary buttons, persistent school favorites, and swipe-down dismissal to the shared school/apartment bottom sheet.
- 2026-09-01: Changed district and neighborhood summaries from viewport counts to full administrative-area counts. Capital-region school rows are paged once and cached for 30 minutes; viewport changes only filter marker visibility. Verified 서초구 remained 15/8 before and after panning.
- 2026-09-02: Planned the v2.1 discovery sprint: rounded search, SQL-13-based quick-filter chips, mobile zoom removal, student-sorted district rows, marker-style count circles, and a map/news/favorites GNB. Students per class remains a detail metric rather than a filter.
- 2026-09-02: Added post-v2.1 NEIS academy and elementary-timetable discovery. Academy publication requires course-level elementary classification; timetable storage requires a measured volume and bounded-retention pilot.
- 2026-09-18: Refreshed 71,692 capital-region academy rows, geocoded 29,274 of 29,664 unique road addresses (98.69%), and generated a private address-level marker candidate. Production ingestion remains gated by proximity semantics and serving-contract approval.
- 2026-09-20: Approved the academy proximity contract (600 m core, 600-800 m extended), collected VWorld polygons for 3,632 additional 500+ household complexes, and validated trusted building-centroid coverage for 3,057 of 4,285 large complexes; all other complexes retain representative-point fallback.
- 2026-09-20: Authorized and profiled the detailed MOLIT apartment trade API. Four August 2026 regional samples linked 647/683 rows (94.73%); production remains gated on an `aptSeq` crosswalk, road-address matching, and the 95% threshold.
- 2026-09-20: Applied the academy proximity contract and loaded 28,952 public address aggregates, 53,373 apartment origin points, and 20,172 apartment summaries. Exact anonymous counts and a 54-row sample RPC passed; frontend exposure remains gated on representative latency QA and product integration.
- 2026-09-20: Passed academy RPC latency QA (182-346 ms median across four density tiers) and added the default-off apartment-scoped academy map layer. Local UI verified the selected-apartment flow and a 409-address Eunma result; marker rendering still requires QA on a Naver Maps allowed domain.
- 2026-09-02: Added playgrounds as the third future data domain. Annual ingestion remains blocked until license/location-service eligibility, coordinate CRS, source IDs, and duplicate behavior are verified.
- 2026-09-03: Verified the Windows ETL task is Ready and completed its 03:15 no-op maintenance run with result 0; no source group was due. Deferred GitHub Actions migration until after v2.2 frontend work.
- 2026-09-03: Started v2.2 with content-aware bottom-sheet gestures, three-stage expansion up to 88% of the viewport, nested scroll handoff, and automated mobile gesture smoke coverage.
- 2026-09-03: Added v2.2 school/apartment name search using the existing public Serving contract; canonical complexes are deduplicated and multi-school assignments remain visible in search results.
- 2026-09-05: Promoted v2.2 P1 (`507e3a8`) to production and passed the public browser smoke suite at 360, 390, 430, and 1280 pixels. The 2,260-school initial map read completed in 2.39 seconds and apartment reads completed in 0.32 seconds.
- 2026-09-05: Completed v2.2 P2 by applying the same selected-district ID contract to viewport markers and result counts, with explicit school/apartment quick-filter scope labels. A live `서울특별시/강남구` RPC check returned 34 schools with zero address-scope mismatches.
- 2026-09-05: Deployed and production-verified v2.2 P2 (`cfb8954`); the public smoke suite passed with a 1.23-second initial map read and 0.32-0.43-second apartment reads.
