# 어디초 플랫폼 확장: Current-state audit와 migration plan

작성일: 2026-10-05  
상태: 코드·저장소 SQL 기준 1차 감사 작성, 비파괴 Phase 1 일부 착수. 운영 DB 전체 schema/권한과 실제 사용자 경로 검증은 미완료.

2026-10-05 첨부 실행 가이드 대조: 최종 GNB에서 HOME을 제외하고 로고로 HOME에 진입한다. 실행 계획은 [개편 실행 계획](PLATFORM_EXPANSION_PLAN.md), 체크 상태는 [운영 TODO](../operations/OPERATION_PLAN.md#platform-expansion)에서 관리한다. 아래 DB 설명은 저장소의 정의이며 실제 적용 여부를 모두 확인했다는 의미가 아니다. 이전 응답의 browser smoke 통과 표기는 최종 종료 로그가 확인되지 않았으므로 완료 판정을 보류한다.

## 1. 결론

현재 앱은 단순한 배정학교 검색기보다 이미 넓다. 학교·아파트 검색/지도 외에도 입학연도 프로필, 시기별 공식 가이드, FAQ, 체크리스트, MY, 저장, 1학년 학습 콘텐츠, 익명 좋아요, 운영 QA가 존재한다. 따라서 신규 플랫폼은 별도 앱처럼 다시 만드는 것보다 아래 경계를 명확히 하는 방향이 안전하다.

- HOME은 기존 검색 진입점을 유지하면서 `Discovery`를 추가한다.
- `/map`, `/school/*`, `/apt/*`는 학교찾기의 영구 자산으로 유지한다.
- 기존 `/guide/*`, `/faq`, 체크리스트의 행정 항목은 `입학 행정`으로 재분류한다.
- 기존 `/plans`, `/items/*`, `/grade1`은 그대로 출시하지 않고 새 `입학 준비` 원칙에 맞춰 재분류·수정한다.
- MY의 브라우저 저장 상태는 로그인 전 상태로 유지하고, 계정 생성 시 명시적으로 병합한다.
- 새 사용자 소유 테이블은 모두 RLS와 소유자 인덱스를 전제로 한다.
- 학교 Serving/ETL/QA 테이블과 신규 콘텐츠·사용자 테이블은 마이그레이션과 서비스 계층을 분리한다.

## 2. Current-state audit

### 2.1 Route tree

현재 라우팅은 React Router 없이 `src/utils/urlState.ts`가 주소를 해석하고 `App.tsx`가 화면·지도 선택 상태를 동기화한다.

| 현재 URL | 화면/역할 | 색인/호환성 |
|---|---|---|
| `/` | 검색 중심 홈 + 입학연도 + 로드맵 요약 | 정적 HTML, canonical, sitemap |
| `/map` | 학교/아파트 검색, 학구·필터 지도 | 앱 shell |
| `/school/{장식}--{school_id}` | 학교 상세 + 배정 아파트 | prerender, canonical, sitemap |
| `/apt/{장식}--{public_key}` | 아파트 상세 + 배정학교 | prerender, canonical, sitemap |
| `/guide` | 공식 근거 기반 입학 가이드 목록 | 정적 HTML, sitemap |
| `/guide/{slug}` | 10개 시기/상황형 가이드 | 정적 HTML, canonical, sitemap |
| `/faq` | 공식 근거 FAQ | 정적 HTML, sitemap |
| `/checklist` | 행정·돌봄·생활·준비물 체크리스트 | 정적 HTML, sitemap; 상태는 localStorage |
| `/my` | 입학 프로필, 저장 학교/아파트, 로드맵, 읽은 가이드 | 비색인 앱 화면 |
| `/favorites` | `/my` 호환 별칭 | 클라이언트에서 `/my`로 정규화 |
| `/plans`, `/plans/*`, `/items/*`, `/ranking`, `/grade1` | 커리큘럼/학습 콘텐츠와 익명 좋아요 | `VITE_CURRICULUM_ENABLED=1`일 때만 노출; 현재 production 보류 |
| `/news`, `/privacy` | 소식, 개인정보처리방침 | 앱 화면 |
| `/admin/etl` | 인증된 운영자 ETL 모니터링 | robots 차단, 별도 관리자 권한 |

보호 규칙: 상세 URL에서 마지막 `--` 뒤 불변 키만 식별자로 사용한다. 학교는 `school_id`, 아파트는 별도 `complex_public_key`를 쓴다. 이 규칙과 기존 URL은 변경하지 않는다.

### 2.2 Supabase와 DB

공개 프런트 계약은 `school_master`와 `school_apartment_serving` 두 테이블이다. 정규화된 apartment/assignment master는 service role 전용이고, 지도·학교 상세은 두 공개 Serving 계약과 RPC를 읽는다.

주요 도메인:

- 학교/아파트: `school_master`, `apartment_complex_master`, `apartment_assignment_units`, `apartment_assignment_schools`, `school_apartment_serving`
- 불변 공개키/이력: `apartment_public_key`, `apartment_public_key_atom`, `apartment_name_history`, `apartment_property_history`
- 학원/돌봄: `academy_address_serving`, `apartment_academy_origin_points`, `apartment_academy_summary`, `school_care_statistics`, `care_centers`
- 운영: `etl_runs`, `etl_source_snapshots`, `etl_staging_rows`, `etl_schedules`, `etl_run_checks`, `etl_admin_users`, `region_registry`
- 참여 기능: `curriculum_refs`, `curriculum_likes`

RLS는 공개 Serving에는 public SELECT, 내부 master에는 공개 policy 없음, ETL 관리에는 `etl_admin_users` 기반 policy가 적용된다. `curriculum_likes`는 `auth.users`의 익명 사용자 UUID를 소유자로 사용한다.

충돌/주의:

- `auth.users`는 이미 관리자 로그인과 익명 투표에 사용 중이므로 별도 `users` 테이블을 만들지 않는다. 앱 프로필은 `profiles(user_id PK/FK)`가 맞다.
- Supabase 익명 사용자는 DB에서 `authenticated` role이므로 `TO authenticated`만으로 영구 계정과 구분할 수 없다.
- 기존 익명 좋아요를 Google/Kakao 계정으로 이어가려면 새 로그인보다 현재 익명 사용자에 OAuth identity를 연결하는 경로가 우선이다. 기존 계정 로그인과 충돌하면 merge 정책이 필요하다.
- 현재 SQL 24의 `SECURITY DEFINER` 함수는 public schema에 있고 execute 권한을 제한하지만, 신규 함수는 가능하면 invoker를 쓰고 꼭 필요한 definer만 private schema에 둔다.
- 저장/투표/체크 상태 테이블에는 `user_id` 선두 인덱스와 operation별 RLS가 필요하다.

### 2.3 Component map

| 영역 | 현재 책임 |
|---|---|
| `App.tsx` | route 해석, 화면 전환, canonical/title, analytics, 지도 선택 복원 |
| `AppContext.tsx` | 지도 중심 전역 상태(학교, 아파트, 필터, UI) |
| `MapContainer` + marker managers | 지도, 학구/학교/아파트/돌봄/학원 표시 |
| `SearchBox` | 학교·아파트 이름 검색 및 최근 검색 |
| `SchoolDetail`, `ApartmentDetail` | 상세와 상호 매핑, 저장/공유/연관 정보 |
| `HomePage` | 검색, 입학연도, 로드맵 요약, 가이드/FAQ 진입 |
| `Guide*`, `FaqPage`, `ChecklistPage` | 공식 콘텐츠와 기기 체크 상태 |
| `MyPage` | 기기 프로필, 저장 목록, 로드맵, 가이드 읽음 상태 |
| `Curriculum*`, `Grade1PreviewPage` | 보류 중인 학습 콘텐츠, 익명 좋아요/순위 |
| `EtlMonitoringPage` | 이메일/비밀번호 관리자 인증, ETL 상태 |

### 2.4 콘텐츠 목록

- 공식/행정 가이드 10개: 학교 비교, 학구 확인, 취학통지서, 예비소집, 이사 시점별 3개, 통지 전 이사, 사립/국립, 돌봄/방과후.
- FAQ: planning/admission 단계별 공식 근거 콘텐츠.
- 체크리스트 17개: 행정 4, 돌봄 3, 생활 3, 준비물 7. ID는 localStorage 키이므로 변경 금지.
- 로드맵: 입학연도와 현재 시점으로 planning/admission 상태 및 할 일 계산.
- 보류 콘텐츠: curriculum plans/items/taxonomy, 1학년 미리보기. 현재 목표의 환경/습관/배움/선택·준비물 taxonomy와 일치하지 않아 그대로 승격하면 안 된다.

### 2.5 MY/state/auth

- `wherecho:profile-v1`: 입학연도, 공립/사립 관심, 이사 계획.
- `wherecho:checklist-v1`: 체크리스트 완료 상태.
- `wherecho:read-guides-v1`: 읽은 가이드.
- `elementary-favorites-v1`: 학교/아파트 저장.
- 최근 검색과 1학년 미리보기 상태도 localStorage.
- 일반 사용자용 로그인 UI는 없다.
- Auth는 ETL 관리자 email/password와 curriculum 투표용 anonymous sign-in만 사용한다.

계정 도입 시 localStorage를 즉시 폐기하지 않는다. 비로그인 사용자는 계속 기기 상태를 쓰고, 로그인 완료 후 `local -> cloud` 병합을 한 번 수행하며 성공 후에도 캐시로 유지하는 단계적 전환이 안전하다.

### 2.6 SEO

- 빌드 시 `/`, 가이드, FAQ, 체크리스트 정적 HTML 생성.
- 학교/아파트 상세은 git root `api/detail.js`가 crawler prerender.
- 약 52,000개 학교/아파트/콘텐츠 URL을 분할 sitemap으로 생성.
- origin은 `SITE_ORIGIN` 단일 계약으로 robots, sitemap, canonical, prerender가 공유.
- public smoke가 deep link, canonical 단일성, 절대 origin, share metadata를 검증.

따라서 기존 URL을 rename하지 않고 신규 IA의 canonical 신규 URL은 콘텐츠가 준비된 뒤 추가한다. 기존 경로를 신규 경로로 무조건 redirect하지 않는다.

### 2.7 QA/수동검수

- 운영 파이프라인: `build_apartment_master_v1.py` → `build_operational_masters.py` → `audit_operational_backend.py` → `upload_operational_masters.py`.
- 수동검수: `build_assignment_review_queue.py`, `collect_review_cases.py`, `build_manual_qa_review_page.py`, `review_verdicts.csv`.
- 브라우저/공간 검증: `verify_p1_schoolzone_browser.py`, `verify_hakgudo_spatial_join.py`, `verify_building_level.py`.
- ETL unittest와 portable read-only baseline이 존재한다.
- 운영 UI: `/admin/etl`, 스케줄/실행/체크/스냅샷 조회.

신규 콘텐츠 CMS/UGC moderation은 이 QA 흐름에 섞지 않고 별도 도메인으로 둔다.

## 3. Reuse Map

| 분류 | 기능/자산 | 결정 |
|---|---|---|
| Keep | 학구 데이터, 지도, 주소/학교/아파트 검색, 양방향 학교-아파트 매핑, 상세 URL, Serving tables/RPC | 변경 없이 보호 |
| Keep | ETL audit, review queue/verdict, 운영 모니터링 | 콘텐츠 QA와 분리 유지 |
| Keep | sitemap/prerender/canonical/public smoke | 새 공개 콘텐츠가 생길 때 확장 |
| Move | 취학통지서, 예비소집, 이사, 학교 비교, 돌봄, FAQ | `입학 행정` 정보 구조로 이동하되 URL 유지 |
| Modify | HOME | 검색 hero 유지 + rule-based Discovery modules 추가 |
| Modify | 학교 상세 | 관심학교, 관련 행정/준비 콘텐츠 trigger 추가 |
| Modify | 체크리스트 | ID 유지; 정의와 사용자 상태를 분리해 MY state로 확장 |
| Modify | MY | local-first에서 optional account sync로 확장 |
| Modify | curriculum/grade1 | 불안·선행 중심을 배제하고 4개 준비 taxonomy/질문형 템플릿으로 재편 |
| Modify | curriculum likes | 범용 poll/reaction으로 승격하되 기존 likes 데이터 보존/매핑 |
| New | profile sync, interests, saves, views, seen/unseen, category interest | 로그인 후 동기화 |
| New | content/source/tag CMS contract | official/editorial/parent signal 분리 |
| New | poll/options/votes, 한줄 경험, comments | 콘텐츠 social layer |
| New | recommendation v1, analytics event contract | rule-based, 설명 가능한 후보군 |
| Remove | 없음(Phase 1) | 기존 기능·URL 삭제 금지 |
| Later | 사진 UGC, 자유게시판, following, influencer, commerce/ads | 별도 검증 전 보류 |

## 4. 기존 route → 신규 IA/GNB mapping

| 신규 IA | 기존 route | Phase 1 처리 |
|---|---|---|
| HOME / Discovery | `/` | URL 유지. 검색과 연도 trigger 유지, discovery 모듈 추가 |
| 학교찾기 | `/map`, `/school/*`, `/apt/*` | URL/데이터/상세 흐름 그대로 유지. GNB 라벨만 명확화 |
| 입학 행정 | `/guide`, `/guide/*`, `/faq`, 체크리스트의 admin/care | URL 유지. UI에서 Official/Timing badge와 분류 제공 |
| 입학 준비 | 보류된 `/plans`, `/items/*`, `/grade1`, 체크리스트 life/items | 기존 URL은 보존. 새 taxonomy 검증 전 production flag 유지 |
| MY | `/my`, 호환 `/favorites`, `/checklist` 상태 | `/my` 유지. 저장/진행/최근 본/참여 상태를 점진 추가 |
| 운영자 | `/admin/etl` | GNB 밖에서 유지 |

최종 GNB는 `학교찾기 / 입학 행정 / 입학 준비 / MY` 4개다. HOME(`/`)은 로고로 진입한다. 현재 코드의 홈 탭은 중간 상태이며 Phase 1 완료가 아니다. 입학 준비 landing과 로고 진입 동선을 함께 구현하고 검증한다.

## 5. 신규 최소 schema 초안

이 초안은 기존 operational SQL과 분리할 `product` migration군을 전제로 한다. 실제 migration 적용 전 live schema diff와 auth provider 설정 확인이 필요하다.

### 5.1 Identity와 관심

- `profiles`: `user_id uuid PK references auth.users`, `entry_year`, `interest_region_codes text[]`, `onboarding_completed_at`, timestamps. 아이 이름/성별/정확주소 없음.
- `user_school_interests`: `(user_id, school_id) PK`, `created_at`; `school_master` FK.
- 별도 `users` 테이블은 만들지 않는다.

### 5.2 콘텐츠

- `contents`: UUID PK, immutable `slug`, `kind`(official/editorial/prep), `category`(admin/environment/habit/learning/choice), `title`, `summary`, structured body JSON, age/timing fields, publish state/timestamps, sponsor flag.
- `content_sources`: content FK, source URL/domain/type, observed/published/verified timestamps, sponsor/partner flag, structured signals(`positive_reason`, `negative_reason`, `conditional_signal`, target age/situation/frequency). 원문/댓글 본문 저장 금지.
- `tags`, `content_tags`: taxonomy와 N:M join. `content_tags`라는 이름을 array 컬럼보다 우선한다.
- `content_views`: user nullable이면 analytics와 중복·쿠키 설계가 복잡하므로 Phase 1 DB에는 로그인 사용자만 저장. `(user_id, content_id)`별 `first_viewed_at`, `last_viewed_at`, `view_count`, `completed_at`.
- `content_saves`: `(user_id, content_id) PK`.

### 5.3 Social layer

- `polls`: content FK, prompt, reaction type, active window.
- `poll_options`: poll FK, stable option key, label, order.
- `poll_votes`: `(poll_id, user_id) PK`, option FK, timestamps. 한 poll 한 표; 변경 허용 여부 명시.
- `experiences`: content FK, user FK, short body, moderation status, timestamps. 한줄 경험의 독립 lifecycle.
- `comments`: 처음부터 범용 중첩 댓글을 열지 않는다. 필요해질 때 `experience_id` 또는 `content_id`에 1단 reply로 추가한다.

### 5.4 Checklist

- `checklist_items`: stable text ID를 PK로 사용해 현재 JSON/localStorage ID와 직접 매핑. category, label, timing, official flag, content link, version/active.
- `user_checklist_states`: `(user_id, item_id) PK`, state, completed_at, timestamps.

### 5.5 RLS/권한 원칙

- 모든 public schema 신규 테이블 RLS 활성화, grants와 policies를 같은 migration에서 정의.
- user-owned row는 operation별 `TO authenticated` + `(select auth.uid()) = user_id`; UPDATE는 `USING`과 `WITH CHECK` 모두 둔다.
- `user_id` 선두 인덱스 필수.
- 공개 집계는 원본 vote/experience row를 열지 않고 제한된 RPC 또는 `security_invoker` view 사용.
- 관리자/편집 권한은 user-editable metadata가 아닌 app metadata 또는 별도 role table에서 확인.
- 익명 투표를 허용하면 JWT `is_anonymous` 정책을 의도적으로 결정한다. 저장/MY 동기화는 영구 identity만 허용할지 별도 정책이 필요하다.

## 6. Phase 1 계획

1. 비파괴 IA 라벨: 기존 path와 active state를 유지하며 지도→학교찾기, 가이드→입학 행정으로 명확화.
2. 콘텐츠 계약: 20~30개 seed를 코드 기반 정적 콘텐츠로 먼저 검증. 질문형 제목과 요약/찬반/조건부/source signal/poll/experience 슬롯을 schema와 UI 타입으로 고정.
3. HOME Discovery v1: entry year, viewed/unseen, saved school/region, category interaction의 local-first rule engine. 로그인 없이 작동하고 서버 개인화는 나중에 연결.
4. 학교 상세 trigger: 관심학교 저장 뒤 관련 공식 행정과 준비 콘텐츠를 노출. 기존 상세 data request와 URL은 변경하지 않는다.
5. MY composition: 기존 local state에 저장 콘텐츠, 최근 본 콘텐츠, poll 참여를 추가. 계정이 없어도 완전한 browsing/search 경험 유지.
6. Auth 준비: Kakao/Google provider/redirect allowlist 확인, anonymous→OAuth link와 existing-account merge UX를 설계한 뒤 UI 적용.
7. DB migration: live schema 확인 → migration 생성 → grants/RLS/policy tests/advisors → service/UI 연결 순서.
8. SEO 확장: 검증된 공개 콘텐츠만 static shell/sitemap/canonical에 추가. 기존 학교·아파트·가이드 sitemap은 그대로 유지.

## 7. 즉시 적용 범위와 보류선

즉시 안전:

- 기존 path를 그대로 쓰는 GNB 용어 정리.
- 공식 행정 콘텐츠와 부모 의견 콘텐츠의 시각적 출처 구분.
- 정적 seed/type/rule engine처럼 DB 쓰기가 없는 기능.
- analytics event 이름 확장(개인정보 없는 속성만).

사전 확인 후 적용:

- Kakao/Google provider와 redirect URL.
- anonymous identity linking/merge.
- product schema migration과 grants/RLS.
- UGC moderation/삭제/신고 정책.
- 기존 curriculum likes를 새 poll로 옮기는 migration.

## 8. 검증 게이트

- `npm run lint`, `npm run typecheck`, `npm run build`.
- production 또는 명시 URL에 `npm run browser:smoke:public -- <url>`.
- `/`, `/map`, 임의 `/school/*`, `/apt/*`, 기존 `/guide/*`, `/faq`, `/checklist`, `/my` 회귀 확인.
- 신규 DB는 allow/deny RLS 테스트와 advisor를 통과하기 전 프런트 연결 금지.
- sitemap URL 수와 canonical origin 변화가 없는지 비교.

