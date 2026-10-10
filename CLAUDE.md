# Session Init: Elementary Map

새 작업 세션에서 프로젝트 상태를 빠르게 복원하기 위한 인수인계 문서다.
세부 상태는 이 파일보다 `elementary-v2/docs/operations/OPERATION_PLAN.md`와
`elementary-v2/docs/ux/FRONTEND_UX_SYSTEM_PLAN.md`를 우선한다.

## Start Here

- Git root: `F:\sm\vibe\elementary\pjt_250826`
- Active app: `F:\sm\vibe\elementary\pjt_250826\elementary-v2`
- Stack: React 18, TypeScript, Vite, Tailwind CSS, Supabase, Naver Maps
- Branch: `master` (작업), `release` (운영 배포. push가 곧 운영 배포다)
- Last pushed baseline (2026-10-08): 운영 `release` `920d8ee` = master `8fc2df7`의 트리
  (그 앞 `c27530f` 초1 하루 예상 카드 SQL 26, `920d8ee` 홈 카드 간격 12px).
  10-07 `4e766df`: SEO 허브·동별 등록 단지 canonical 통합·아파트 상세 보강, 신축 단지 '배정 확인 필요' 안내, 커리큘럼 화면 삭제.
  10-08: 하단 탭 **홈 · 학교 찾기 · 입학 준비 · MY**(사용자 확정. '입학 행정'은 안 씀)
  작업 트리: 다른 세션이 뺀 홈 탭을 사용자 요청으로 되살림(홈·학교 찾기·입학 준비·학습 준비·MY, 미커밋).
  탭 5개라 모바일은 아이콘 위·글자 아래, 칸 수는 탭 수대로(`index.css` `.app-gnb`), 데스크톱 레일은 `grid-auto-flow: row`
- push가 "Git LFS locking API … Unable to verify locks"로 막혀 2026-10-08 이 저장소 로컬 설정에
  `lfs.<origin>/info/lfs.locksverify false`를 넣었다(사용자 승인). LFS 파일은 없다
- Production: `https://wherecho.co.kr` (옛 주소 `elementary-lovat.vercel.app`은 301로 넘어온다)
- Supabase project ref: `vsgeksumgvcrkzjwvlgs`

세션 시작 시 아래부터 확인한다.

```powershell
cd F:\sm\vibe\elementary\pjt_250826
git status --short
git log -5 --oneline
cd elementary-v2
npm run typecheck
```

작업 트리가 dirty이면 사용자 변경으로 간주한다. 관련 파일의 diff를 읽고 함께
작업하며, 명시적 요청 없이 되돌리거나 삭제하지 않는다.

## Current Product State

앱 버전 2.3.0, 브랜드 **어디초**, 전국 17개 시·도. 2026-10-03에 차기 버전 PRD
(`elementary-v2/docs/product/PRD_V2_ELEMENTARY_START.md`)의 MVP 1a·1b를 모두 운영에 냈다.

- **도메인**: `wherecho.co.kr` 전환·검색엔진 등록 완료. 구성표는 `docs/operations/DEPLOYMENT.md` 7.1절
- **라우팅(ADR-008)**: `/` 홈, `/map`, `/school/…`·`/apt/…`, `/guide`, `/guide/{slug}`, `/faq`,
  `/checklist`, `/news`, `/my`(옛 `/favorites`는 `/my`로 고친다), `/privacy`. 라우팅 라이브러리 없이 `urlState.ts`의 `parseRoute`
- **셸 분리**: `dist/app.html`(셸), `dist/index.html`(정적 홈), 가이드·FAQ·체크리스트 정적 페이지,
  `dist/404.html`. 네이버 지도 SDK는 지도 화면에서만 읽는다(`naverMapsLoader.ts`)
- **GA4** `G-NQT4XV9R00` + `/privacy`. 이벤트·진입경로 규칙은 `docs/product/MEASUREMENT_PLAN.md` 8절
- **콘텐츠**: 가이드 9편(입학 1~2년 전 3 / 입학하는 해 6), FAQ 24문항, 각 가이드 요약 도식.
  원본은 `src/content/*.md`·`*.json`, `scripts/build-content.mjs`가 출처·확인일·링크·설명 길이를 검증
- **입학 단계**: 입학연도 칩(출생연도 병기)으로 planning/admission을 고른다. 프로필·체크리스트는
  기기 저장만(D1 A안)
- **학교 상세 모듈** "이 학교 입학을 준비한다면"과 로드맵(3월 입학까지, 이사·사립 맞춤)
- **GNB 재편(2026-10-04)**: 하단 탭 **홈 · 지도 · 입학 준비 · MY**. 지도 = 데이터 탐색,
  입학 준비(`/guide`) = 공개 매뉴얼(시기별 가이드·읽음 표시·FAQ·데이터 리포트, 앱과 정적 페이지가 같다),
  MY(`/my`, `MyPage.tsx`) = 기기 저장 전부(프로필·저장한 학교·아파트·전체 로드맵·읽음 수).
  즐겨찾기 탭은 MY에 흡수됐다. 홈은 검색 + 요약 카드(D-Day·할 일 2개, `RoadmapSummary` → `/my`)이고
  시기별 가이드 목록은 홈에서 뺐다. 결정 기록은 ADR-008 구현 기록 마지막 항목
- **공유**: 가이드·FAQ·체크리스트에 '공유' 버튼(주소만). 체크 상태는 기기별 — 부부 공유 체크리스트는 보류
- **체크리스트 배너**: 모든 가이드 본문 아래(`ChecklistBanner`, 진행률 표시)
- 화면 디자인은 사용자 평가로 "AI 전형 디자인" — 재검토 대기

이전 단계(v2.0~v2.2, P4~P6)의 기록은 `elementary-v2/docs/PROJECT_PROGRESS.html`에 있다.

## Uncommitted Work At Handoff

### 2026-10-10: 시·도 클릭 시 시·군·구 목록 시트 · 지도 시트의 지역 허브 링크

- 줌 아웃 시·도 마커 클릭 → 줌 11 이동 + 하단 시트에 시·군·구 목록(1학년 합계, 80+/80 미만 학교 수).
  `DistrictNeighborhoodSheet`에 `district`를 안 주면 시·도 단계(`historyKey` `region`). 행 클릭은 기존 구 시트로,
  뒤로 가기는 구 → 시·도 목록 → 원래 시점. 줌 10 이하로 나가면 해제, 13 이상에선 숨김
- 시·도·구 시트 아래 "○○ 초등학교 전체 비교" 링크 → 지역 허브(`/area/대구`, `/area/서울/강남구`). 내부 링크 보강용.
  `App` → `MapContainer` → `MarkerManager`로 `navigate`를 내려 앱 안에서 연다
- 검증: typecheck·lint·build, `localhost:3000` public smoke PASS(시·도 시트·허브 링크 검사 추가)

### 2026-10-10: 구·동 시트 닫기 · 광역시 학교 이름의 도시 접두 생략 (`47e7aaf`·`e3c0698`, 운영 `ee90595`)

- 지도는 다른 메뉴로 가도 내려가지 않아 구·동 시트가 남았다. `MapScreenContext`(`panelSlot.ts`)로 지도 화면일 때만 연다.
- `src/utils/schoolName.ts`의 `displaySchoolName`이 서울·인천·대구·대전·광주 공립초의 도시 접두를 **화면에서만** 뗀다. 데이터·ETL·공개 주소·문서 제목·검색은 공식 이름 그대로. 예외(한 글자 남음, 인천삼산초처럼 떼면 겹침, 국립·사립, 다른 시·도)는 파일 주석과 `schoolName.test.ts`에 있다. 새 학교가 들어와 떼면 겹치는 이름이 생기면 `KEEP_PREFIX`에 넣는다.
- 공개 스모크의 학교 이름 확인은 화면 표기(대현초등학교, 방현초등학교)로 바뀌었다. 운영 스모크 통과.

### 2026-10-09: P1-04~06 입학 준비 정리 · P2 학습 준비 콘텐츠 틀 (커밋 `1b15dc7`~`64ab799`, **미배포**)

- P1-04: 가이드·FAQ에 적용 범위 칩(front matter `rule`·`basisYear` 필수)과 `.go.kr` 출처 '공식' 표시
- P1-05: 가이드 3편 `admission-timeline`·`delay-or-early-entry`·`first-weeks`(경기도교육청 학적 길라잡이 원문 대조)
- P1-06: 홈 '학습 준비' 카드, 학교 하교 카드 → 입학 첫 주 가이드
- P2: `src/content/learning/*.md` + `learning-taxonomy.json`, `/learn/{slug}`, 빌드 검증(B11 규칙). **published만 운영에
  나간다** — `npm run dev`만 `--preview`로 초안을 보인다(typecheck/build 뒤 dev 화면에서 초안이 사라지면 `node scripts/build-content.mjs --preview`).
  seed 3편(한글·수학·영어)은 `status: review`, 사용자 검수 대기. 부모 반응은 사람이 수집(네이버 robots.txt)
- 다음: 사용자 결정 — release 여부, seed 검수 후 발행, 환경·습관·준비물 seed의 공식 출처

### 2026-10-08: 시간표 엔진 S01·S02 (커밋 — 화면 미연결) · 하단 메뉴 접근성 (운영 `db3bd88`)

- 접근성: 활성 탭 글자 #b8452f(5.3:1), `:focus-visible` 테두리, smoke에 `/learn` 3검사 → 운영 smoke PASS 104건
- 엔진: `src/utils/schedule/{types,fromSchoolData,engine}.ts`. 입력은 SQL 26의 하교·돌봄, 출력은 요일별 배치·미배치·
  후보·겹침·이동 확인·공백(confirmed/estimated/uncertain). 하교 모름이면 공백 분을 내지 않는다
- 테스트: `npm run test:unit`(Node 내장 runner, 타입 제거 실행) 16개 PASS. 새 script라 루트 CLAUDE.md·AGENTS.md도 고침
- 다음: S06 MY 시간표 화면은 **로그인 준비 후**(사용자 결정 2026-10-08, 기기 저장 선행 안 함). 그 전에 할 수 있는 것: S03 일회 취소·보강

### 2026-10-08: 5개 메뉴 — 학습 준비(`/learn`) 추가 (`b6376f2`, 운영 `129f87c`)

- 사용자 결정: GNB **홈 / 학교 찾기 / 입학 준비 / 학습 준비 / MY**. 홈은 잠시 보류했다가 유지로 확정.
  학습 준비는 가이드 '준비 중' + 시간표는 학교 상세 카드로 연결, 콘텐츠 전 배포도 사용자 결정
- 계획: `docs/product/PLATFORM_EXPANSION_PLAN.md` §1(메뉴별 로그인 행동, MY 시간 관리 §1.1, 내 학교 소식 §1.2,
  남은 결정 §1.3). 4분류 중 환경·습관·배움 → 학습 준비, 선택·준비물 → 입학 준비
- 검증: lint·typecheck·build, Python 39개, 로컬 smoke(3000) 통과 → 운영 smoke PASS 101건, `/learn` 5탭·활성 확인
- 커밋 제외: `etl/academy_geocode_profile.json`(로컬 학원 ETL 실행 산출물)

### 2026-10-08: 지도 빠른 필터 배열·안드로이드 뒤로 가기로 시트 닫기 (`e27c142`, 운영 `129f87c`)

- 빠른 필터(`QuickFilterBar.tsx`, `index.css`): 전체 필터 버튼을 스크롤 밖에 고정, 학교·아파트 칩을
  묶음(`.quick-filter-group`)으로 감쌈. 모바일은 이름표(`.quick-filter-scope`)에 흰 바탕을 깔아 지도 위에서
  읽히게, 데스크톱 패널은 두 묶음을 한 줄씩 쌓아 칩 정렬. 이전에는 데스크톱에서 '학생 수'가 아파트 줄로 넘어갔다.
- 뒤로 가기: 구·동 목록 시트와 필터 서랍은 주소가 없어 뒤로 가기가 아래 화면만 넘기고 시트는 남았다.
  `src/components/ui/useCloseOnBack.ts`가 열릴 때 같은 주소로 기록을 쌓고(`history.state.sheets`) 빠지면 닫는다.
  `BottomSheet`의 `historyKey`(구 `district`, 동 `neighborhood`)와 `Sidebar`(`filter`)가 쓴다. 학교·아파트
  상세는 주소가 기록을 맡으므로 쓰지 않는다. `App.tsx`는 주소가 같은 popstate에서 복원을 건너뛴다.
- 상세 X 닫기: 전에는 X가 `/map`을 새로 쌓아, 다음 뒤로 가기가 방금 닫은 상세를 다시 열었다. 이제 지도에서
  연 상세 기록은 `history.state.detailDepth`(지도 위 상세 겹수)를 남기고, X는 `history.go(-depth)`로 돌아간다.
  링크·홈 검색·MY로 연 상세(겹수 0)는 주소만 `/map`으로 바꿔 쓴다. `SchoolDetail`의 close는 아파트 선택을
  먼저 비우지 않는다(비우면 학교 주소가 새로 쌓인다). 같은 상세의 다른 철자(이름 바뀐 옛 링크)는 `syncPath`가
  쌓지 않고 바꿔 쓴다 — 주석은 그렇게 말했지만 코드는 쌓고 있었다. `syncPath`에 `state` 인자 추가.
- 검증: lint·typecheck·build 통과, public smoke 전체 통과(dev 3000). 브라우저(390px)에서 구→동→뒤로→구→뒤로→닫힘,
  동→학교→뒤로→동, 동→학교→X→동(이후 뒤로는 구), 학교→아파트→X→동, 옛 이름 링크→정규 주소로 교체(기록 그대로)→
  X→`/map` 교체, 필터 서랍 뒤로 닫기 확인. 실기기 안드로이드 확인은 아직.
- 알려진 한계: 시트 기록으로 앞으로 가기를 하면 기록과 지도 상태가 어긋날 수 있다(닫힌 시트는 다시 열리지 않음).
- `/learn` 작업과 나눠 커밋했다(`e27c142` → `b6376f2`). 운영 smoke 통과.

### 2026-10-06~07: 개편 Audit 2 — 운영 기준선·NEIS·학교 문서 PoC (미커밋, 운영 변경 없음)

- 체크 상태의 원본은 `OPERATION_PLAN.md` "Audit 2" 절. 근거 자료는 `docs/research/audit2/`,
  계획은 `docs/product/PLATFORM_EXPANSION_{PLAN,AUDIT_20261005,AUDIT2_20261006}.md`
- 완료: 스키마 기준선·정의 대조·읽기 역할 검증(B03), 운영 smoke(B05), 보호 fixture(B06), 60학교 PoC 분모(E01),
  crosswalk 59/60(E02, 청산초 `B000006819` 실주소 상충 보류), NEIS 5학교 표본(E03, 절대시각 없음)
- E04-b: 한솔·양영 학교 홈페이지 첨부 PDF 3 + 본문 이미지 1, 전부 2026학년도. 계획안≠기수별 가정통신문(가정통신문이 최종).
  `DOCUMENT_ATTACHMENT_REVIEW_20261006.md`
- E04-c1·c2: 중앙 출처는 **학교알리미**(교육청 통합저장소는 확인 안 됨). 2-가(4월) 교육과정 첨부 59/60, 15-라(5월) 방과후·돌봄 60/60.
  판독은 로컬 추출 채택(`etl/school_document_text.py`, HWP는 `olefile` 필요) — 학교알리미 미리보기는 HWP 변환 실패·결과 1분 내 만료.
  `python -m etl.audit_schoolinfo_daily_clock`: 시정표 탐지 35/60, 이미지 표 1, 미탐지 23(발췌본), 첨부 없음 1, 1학년 요일별 교시 수 14곳.
  탐지 구간에 인접 표가 섞여 필드값은 미확정. 공시는 해당 학년도 4~5월이라 2027 입학 부모에게는 **전년도 기준선(estimated)**,
  확정값은 기수별 가정통신문뿐. `SCHOOLINFO_SOURCE_SURVEY_20261006.md`
- 신규 스크립트: `scripts/{collect-neis-poc,collect-school-document-pilot,probe-school-document-sources,probe-schoolinfo-disclosures,verify-protected-contract,audit-public-auth-settings}.mjs`,
  `etl/{audit_neis_crosswalk,audit_product_definitions,audit_product_schema,audit_schoolinfo_daily_clock,school_document_text}.py`와 테스트들
- 검증: `python -m unittest etl.tests.test_schoolinfo_daily_clock`(12개),
  `node --test scripts/probe-schoolinfo-disclosures.test.mjs scripts/collect-school-document-pilot.test.mjs scripts/probe-school-document-sources.test.mjs`(17개) PASS
- 원본 bytes·추출 텍스트는 `etl/runtime/audit2-documents/`(ignored). 이전 세션의 `elementary-v2/tmp/`는 사용자 요청으로 삭제함
- 2026-10-07 계획 재정렬(사용자 결정): 비로그인 "초1 하루 예상" 카드를 로그인보다 먼저(11월), 파일럿 추출은 규칙+사람 검수,
  로그인 공급자 설정은 사용자가 10월 중(`docs/operations/AUTH_PROVIDER_SETUP.md`). 순서는 OPERATION_PLAN "2026-10-07 재정렬" 표
- A2-R01 완료: NEIS 1학년 요일별 교시 수(`scripts/collect-neis-grade1-periods.mjs`, `NEIS_GRADE1_PERIODS_20261007.md`) — 1학기 평시 50곳,
  문서 표와 12/14 일치. 전남은 1학기 NEIS 자료 없음
- E04-c2b 1차 검수: `etl/extract_school_day_periods.py`(규칙) → 원문 표 assistant 검수(`school_day_review_first_pass_20261007.json`) →
  `python -m etl.build_grade1_dismissal_estimates` → 요일별 예상 하교 31/35 완성(`GRADE1_DISMISSAL_FIRST_PASS_20261007.md`).
  사용자 확인 완료(화랑 월 NEIS 유지, 추론값은 `inferred` 추정 표시, 점심 앞 4교시 해석 확정, 빈 요일은 `school_check_needed`)
- A2-R02 1차 검수: `python -m etl.audit_schoolinfo_care_plans` → 원문 검수(`care_review_first_pass_20261007.json`,
  `CARE_HOURS_FIRST_PASS_20261007.md`). 1학년 돌봄 시간 44/60. 표시는 기본·연장 분리(사용자 결정 2026-10-08)
- E04-c3: 전년도→다음 해 안정성 — NEIS 요일 패턴 45/48, 시정표 핵심 시각 25/26 동일(`YEAR_OVER_YEAR_STABILITY_20261008.md`)
- A2-R03 설계 완료·**미적용**: `sql/26_create_school_day_estimates.sql`(공개 읽기 3테이블), `etl/load_school_day_estimates.py`
  (dry-run 35/175/60, 위반 0), 영향 보고 `SCHOOL_DAY_CARD_CONTRACT_20261008.md`. **운영 적용은 사용자 승인 대기**
- A2-R04 로컬 완료·**미배포**: `SchoolDayEstimateCard.tsx` + `getSchoolDayEstimate`(SQL 26 없으면 카드 숨김). 로컬 확인은
  `python -m etl.load_school_day_estimates --write-fixture`(src/dev-fixtures/, git 제외, 운영 번들 미포함). typecheck·lint·build·로컬 smoke PASS
- **2026-10-08 운영 반영**: SQL 26 적용(사용자)·anon 쓰기 42501 확인·적재 35/175/60 → master `df14027` → release `c27530f`,
  운영 smoke PASS, 카드 확인. 이 커밋에 Audit 2 연구 자료·스크립트 포함. OPERATION_PLAN·이 파일의 Audit 2 기록은 다른 작업과 섞여 미커밋
- **2026-10-08 파일럿 확대 운영 적재**(사용자 결정: 성남시 + 서울 강남·서초·송파): 새 148곳 1차 검수·사용자 확인 →
  운영 106/530/208행, master `813aff3`. `etl/build_pilot_manifest.py`(NEIS 코드는 학교알리미 페이지 sdSchulCode, 59/59 검증).
  적재기 REVIEW_SETS에 confirmed 표시, 미확인 세트는 --apply 거부. 메뉴는 홈 포함 5개 유지(사용자 결정), 로그인은 다른 팀원 담당
- 다음 후보: 추가 지역 확대(규칙 정확도 57%라 원문 검수 필요 — 수백 곳 이상이면 E05 자동화 먼저), E04-d 2027 게시 감시(12~2월),
  2월 1기 가정통신문으로 확정값 갱신

### 2026-10-07: SEO — 허브·중복 정리·아파트 상세 보강 (커밋 `37a6bc2`, 운영 `release` `4e766df`)

- 배경(Search Console 10/7): 발견됨-미색인 50,236 · 크롤링됨-미색인 350 · Google이 다른 표준 선택 82.
  도메인 5일차라 "발견됨"은 대부분 시간 문제지만, 상세가 사이트맵으로만 닿고 아파트 페이지가 얇았다
- **허브** `/area`, `/area/{시·도}`, `/area/{시·도}/{시·군·구}`(`api/detail.js` `type=area`, `AreaPage.tsx`,
  첫 진입은 `utils/prerendered.ts`). 인근 학교 5곳 비교(프리렌더+`NearbySchools.tsx`), 빵부스러기·BreadcrumbList,
  홈 '지역별 배정 현황' 카드, `sitemap-areas-1.xml`(270). 개발 서버에는 함수가 없어 허브가 "불러오지 못했습니다"가 정상
- **동별 등록 단지 묶음**: 성호샤인힐즈(용인, 이현로29번길 72-1~72-41)처럼 건물마다 단지 ID·공개 키가 따로인 경우.
  규칙 = 지역·시군구·단지명·도로명 주소 본번(`-부번` 제거)·배정 학교 집합이 같음, 대표 = 부번이 가장 낮은 동.
  비대표 동은 canonical을 대표로(`data-for-key`, 앱 `setCanonical`이 유지), 사이트맵은 대표만(45,853→45,699, 154건).
  같은 이름 1,053묶음 중 대부분은 **다른 단지**라 묶지 않고 제목에 도로명을 붙인다(`제일(이촌로)`).
  규칙은 `api/detail.js`와 `scripts/build-seo-files.mjs` 두 곳 — 같이 바꿀 것. 학교 상세·허브 목록도 묶음을 한 줄로(N개 동 합계)
- **아파트 프리렌더 보강**: 배정 학교 표(1학년·학급당·전교생, 학교 정규 주소로 링크), 같은 학교 배정 아파트 10곳,
  주변 학원·교습소·체육도장 수, '배정 학교' 중복 행 제거
- 메뉴 이름은 10-08에 '학교 찾기'·'입학 준비'로 확정해 별도 배포(`fcb0550`)
- 검증: lint·typecheck·build(격리 worktree에서도), 로컬 dist+함수 서버에서 묶음 canonical 브라우저 유지·허브 렌더·smoke 프리렌더 검사 PASS.
  로컬 smoke의 지도 단계는 네이버 지도 허용 호스트가 아니라 실패(환경 문제).
  **배포 후 운영 smoke PASS 101건, 실패 0**(커밋된 smoke로 실행. 작업 트리의 smoke는 P1-01의 '입학 행정' 탭을 기대하므로 메뉴 변경 배포 전에는 탭 검사에서 멈춘다)
- 다음: Search Console에 `sitemap.xml` 다시 제출(허브 사이트맵 포함), 2~4주 뒤 "발견됨"·"다른 표준" 추이 확인

### 2026-10-07: 전체 ETL 점검과 후속 (2·3·4번)

- 점검 결과(사용자 결정: 아파트 K-apt 반영은 11/2 정기 실행까지 기다림): K-apt는 8/21 자료에 멈춤, **단지 목록이
  2024-10 기준 파일에 고정돼 신축이 못 들어옴**(K-apt 미사용 2,521곳, 2025+ 승인 583곳·약 40만 세대), 학구도 자동화
  없음(2026-09-20판 10/02 공개, 우리는 03-20판), 실패 알림 없음, 1~5월 학교알리미 당해연도 빈 데이터 위험
- **실패 알림**: GitHub 이슈 라벨 `etl-failure`. Actions 예약·apply 실패 시 이슈 생성/댓글, Windows 작업도 `gh`로 같은 방식.
  시험 이슈 #1 생성·닫음
- **Windows 작업 개편**: `Elementary Academy Geocode` → `Elementary Local Monthly ETL`(`install_local_monthly_task.ps1`,
  `run_local_monthly_etl.ps1`), 단계 = 학원 지오코딩 + **돌봄 `collect_care_data.py --apply`**. 단계별 로그
  `etl/logs/local-monthly-etl-<시각>-<단계>.log`(transcript가 Python 출력을 놓쳐서). 2026-10-07 시험 실행 성공(돌봄 6,266행)
- **학교알리미 연도 대체**(`run_due_etl.collect_school`): 학년 행이 학교 행의 70% 미만이면 전년도 사용. 2027-01 실행 대비
- **학구도**: `etl/compare_school_zone_release.py`(새 판으로 전 범위 점 배정 재생성 → 현재와 비교, 운영 파일 안 건드림).
  현재 판 자기 시험 13개 범위 변경 0. 사이트가 스크립트 다운로드를 막아 **9월판은 사용자가 브라우저로 내려받아야 함**
  (`etl/data/hakgudo/20260920/`, 학교 위치도 함께). `build_local_assignment_etl.SHP` 기본값을 03-20판으로 정정
- **신축 단지 유입**(`88528ef`, `40a6ac6`): 계획 `docs/operations/NEW_COMPLEX_INTAKE_PLAN.md`, D1~D4 권고안 확정
  (D1은 리허설 뒤 이름 유사도 규칙으로 변경). 보충 파일 808곳(약 57만 세대)을 Storage `apartment-supplement/`에
  올림. 월간 실행이 아파트 빌드 전에 복원하고, 빌드 뒤 `publish_apartment_public_keys.py`가 DB 키 테이블 기준으로
  발급(운영 dry-run 신규 0 = 현재 그대로). **첫 운영 반영은 11/2 정기 실행**(사용자 결정). 철거 추정 옛 단지 49곳은
  보고서만(1안), 정리는 별도 작업. 화면 "배정 확인 필요"(serving `review_required`)는 다음 release에 나간다
- 9월판 학구도: 사이트가 자동 다운로드(스크립트·자동 브라우저 모두)를 오류 페이지로 막음 → 사용자 브라우저 다운로드 필요
- **Actions 아파트 리허설 `37613661871` 성공**(보충 805곳 복원, 전 범위 감사 pass, 키 dry-run 정상). 거기까지
  실패 3번: 반포초·신문초 원천 공백(학교알리미엔 있고 표준데이터 03-20판엔 없음 → `upstream_school_gaps.json`),
  K-apt 같은 코드 여러 행(보충 빌더가 코드당 1행), 학교알리미 시간 초과(재시도 4회). K-apt 다운로드도 러너에서
  가끔 끊겨 그룹 재시도(5분 대기)로 회복하던 것을 스크립트 안 재시도로 바꿈

### 2026-10-06: 학원·체육도장 기관 키 (커밋 — 아래 커밋 메시지 참고)

- 실측: 학원 `ACA_ASNUM`·체육도장 `MNG_NO`는 단독으로 전국에서 유일하지 않다. 유일한 키는
  `(교육청코드, 지정번호)`·`(지자체코드, 관리번호)` 복합키(각각 중복 0). 상세는 `ACADEMY_REFRESH_PLAN.md` 7절
- `OPERATION_PLAN.md` 학원 절의 "ACA_ASNUM 단독 키" 문구 정정(한 줄, 같은 파일의 다른 미커밋 변경과 섞지 말 것)
- `etl/collect_sports_dojo_snapshot.py`: `source_id`를 `{지자체코드}-{관리번호}`로, `local_gov_code`·`management_number` 추가.
  파일럿 경로의 `MNG_NO` 단독 중복 제거 결함 수정. 원본 32,882행으로 유일성 확인, py_compile 통과
- K2 `etl/academy_institutions.py`(신규): 학원·체육도장 기관 키 목록(비공개 CSV)과 월간 비교. 10/6 원본 151,256곳, 키 중복 0
- K3 `run_academy_refresh.py`: 5단계 뒤 목록 작성·Storage `academy-refresh/institutions/latest.csv.gz`와 비교해 보고서
  `institutions`에 기록. `--apply` 성공 뒤에만 Storage에 쓴다. 이 단계 실패는 갱신을 막지 않는다
- 검증: `etl.tests.test_academy_institutions`(8개) 포함 학원 관련 테스트 20개 통과, 실 Storage 읽기 경로(기준 없음)·옛 형식 거부 확인
- push `92e0b2e`(임시 인덱스로 이 작업 파일만 커밋 — 인덱스의 `.ps1` 이름 변경 2건은 다른 세션 것이라 남겨 둠).
  기준 목록 Storage 시드 2026-10-07(151,256곳, 익명 400). **11/2 실행 보고서의 `institutions`에서 첫 월간 비교 확인**

### 2026-10-06: 학원 데이터 월간 자동 갱신 (`f905ac7`, 운영 데이터 반영)

- 계획 `docs/operations/ACADEMY_REFRESH_PLAN.md`(D1~D3 권고안 확정). 구현은 `etl/run_academy_refresh.py` 하나:
  NEIS·체육도장 수집 → 새 주소만 VWorld → 마커 → 지역별 근접도 → 운영 3테이블 **전체 교체**(빠진 행 삭제).
  한 지역이라도 15% 넘게 줄면 전체를 쓰지 않는다(계획의 "그 지역만 제외"에서 바꿈 — 주소가 지역을 넘어 걸려서)
- Actions 비밀값 `NEIS_CLASS_API_KEY`·`VWORLD_API_KEY`·`DATA_GO_KR_DECODED_KEY` 등록(2026-10-06, `gh secret set`)
- Storage `etl-source-snapshots/academy-refresh/`에 지오코딩 캐시·건물 기준점 2종 시드(익명 읽기 400 확인)
- **운영 적용 완료** run `34ebb91f`: 주소 78,820 → 76,300(+202, −2,722), 기준점 80,641 → 80,220, 요약 46,927 → 46,929,
  지역별 −1.7~−4.2%. 직업기술 0건(가드 dry-run), 익명 RPC 정상. 앞서 막혔던 `apply_academy_realm_exclusion --apply`는 이 적용으로 대체됨
- **진행 기록**: ① SQL 25는 사용자가 SQL 편집기로 적용(psql·CLI 없음)
  ② **지오코딩은 이 PC의 Windows 작업**(`eedd96b`): VWorld가 해외 IP를 막고(러너 재시도 698곳 전부 `transport_error`),
  카카오 Local API는 결과 저장 금지라 대안이 아니다(운영팀 답변). 작업 `Elementary Local Monthly ETL`이 매월 1일 21:00
  `run_academy_refresh.py --geocode-only`(NEIS·체육도장 수집 → 새 주소 변환 → 캐시·체육도장 사본을 Storage로) 실행,
  러너는 지오코딩을 건너뛴다. **이 PC가 그 무렵 켜져 있고 로그인돼 있어야 한다**(StartWhenAvailable). 시험 실행 2회 성공
  ③ 체육도장 API가 러너에서 가끔 시간 초과(`37466238434` 실패) → 재시도 강화 + Storage 사본 대체(`3eb6e99`).
  Actions 리허설 `37470629136` 성공 ④ SQL 25 적용 확인(2026-10-06), 일정 `next_due_at` 비워 둠 → 11/2 정기 실행에 포함
  ⑤ 11/2 정기 실행 결과 확인 ⑥ `/admin/etl`의 '학원' 라벨은 다음 release에 나간다
- 첫 Actions 리허설(`37457087619`) 실패 원인: `collect_academy_snapshot.py`가 키를 `.env`에서만 읽음 → `14fe2ff`에서 환경변수 우선
- 계획서의 "요약 고아 1,072행"은 오판이었다(운영 단지 마스터 기준 고아 없음) — 문서 정정함

### 2026-10-06: 가이드·FAQ 취소선·`**` 노출 수정과 굵게 정리 (커밋·운영 반영)

- 원인 1: `marked`의 GFM이 물결표 한 쌍을 취소선으로 읽어 `10~1월 … 12~2월` 사이가 그어졌다(돌봄 가이드 2곳, 1곳 더).
  `scripts/build-content.mjs`에서 `del` 토크나이저를 꺼 물결표는 항상 글자로 둔다
- 원인 2: `**…(학구도)**을`처럼 닫는 `**`가 문장부호 뒤·조사 앞이면 굵게가 안 닫혀 별표가 보였다. 4곳을 굵게가 글자에서
  끝나도록 고쳤고(`faq.md`, `school-notice.md`, `care-afterschool.md` 2곳), 렌더 결과에 `**`가 남으면 빌드가 실패한다
- 굵게 정리: 본문 굵게 125곳 → 11곳. 쪽마다 놓치면 안 되는 사실(핵심 규칙·법적 처벌·되돌릴 수 없는 결과) 한두 곳만 남겼다.
  목록 머리의 `**라벨** — 설명` 꼴은 `라벨: 설명`(라벨이 문장이면 `문장. 설명`)으로 바꿨다. 새 글도 이 기준을 따른다
- 검증: lint·build, 생성 JSON과 `dist/guide`·`dist/faq`에 `<del>`·`**` 0건, 본문 `<strong>` 11개(요약 도식 제목은 별개)

### 2026-10-05: 데스크톱 지도 레이아웃 — 왼쪽 패널 (`2418dc7`, 운영 `f079364`)

- 1024px 이상에서만 바뀐다. 하단 탭은 왼쪽 레일(72px), 지도 화면은 레일 옆 400px 패널에 검색·빠른 필터·상세를 담고
  지도는 그 오른쪽 전체를 쓴다(네이버 지도·리치고 방식). 이전엔 시트가 전체 폭이라 좌우 여백이 컸고 올리면 지도가 가려졌다
- `layout/panelSlot.ts`(신규): 패널 자리 컨텍스트와 `useIsDesktop`. `MainLayout`이 `.app-map-panel`(모바일에선 `display: contents`)을
  그리고, `BottomSheet`는 데스크톱이면 그 자리에 펼친 채로 포털한다(드래그 없음, `data-snap-index`는 맨 위 단계)
- `App.tsx`: 지도를 `.app-map-area`로 감싸 데스크톱에서 패널 폭만큼 비킨다. CSS는 `index.css` 끝 블록
- 검증: lint·typecheck·build, 로컬 public smoke 통과, 1440px 학교·단지·빈 지도·홈과 390px 학교 화면 확인
- 같은 릴리스로 `0411c7d`(월간 ETL 학원 가드)·`10a7ba7`(1학년 미리보기, 플래그 뒤)도 운영에 나갔다
- **운영 smoke 미실행**: agent-browser 데몬이 첫 명령에서 os error 10060으로 응답하지 않았다(프로젝트·전역 사본 모두,
  멈춘 데몬 종료 후에도). 대신 HTTP로 주요 경로 200·프리렌더 제목·새 번들 반영을 확인했다. 다음 세션에서
  `npm run browser:smoke:public -- https://wherecho.co.kr`부터 다시 돌린다

### 2026-10-05: 단지 카드 연식·규모 일러스트 (커밋·운영 반영)

- `components/apartment/ApartmentIllustration.tsx`(신규): 카드 왼쪽 68×76 칸의 건물 아이콘+막대를 SVG
  일러스트로 교체. 연식으로 모양·색(10년 이하 탑상형 초록, 11~25년 중층 파랑, 26년 이상 저층 분홍 — 연식 칩과
  같은 색), 세대수로 건물 수(300 미만 1, 1,000 미만 2, 3,000 미만 3, 이상 4). 연식 모름은 기존 청록
- `ApartmentCard.tsx`에서 `Building2`·`buildingBars` 제거, `index.css`의 `.apartment-card__skyline` 규칙 삭제.
  상세 시트는 이 카드를 그대로 쓰므로 시트 머리에는 따로 넣지 않았다
- 결정 경위: 건설사 로고는 상표 문제로 제외, 브랜드 배지(1안)는 단지명과 중복·모바일 정보 과다로 제외.
  브랜드명 매칭률은 수도권 21,228단지 기준 26.6%(옛 건설사명 포함 41%)
- 검증: lint·typecheck·build, 로컬 public smoke 통과(전역 agent-browser 사본), 412px 학교·단지 상세 화면 확인

### 2026-10-05: 학원 지도 — 직업기술 제외·팝업 X·상호별 분류 칩 (`d30bc8f`, 운영 `f542691`)

- `dataService.ts`: NEIS 분야 `직업기술`(성인 직무·자격 학원)을 RPC 응답에서 걸러 개수 재계산, 남는 학원이
  없는 주소는 버림. 두 RPC가 `toPublishedAcademies` 하나로 매핑. `build_academy_marker_snapshot.py`도 원천에서
  제외 — **`apartment_academy_summary`(카드·상세의 "교육시설 N곳")는 아래 `--apply` 전까지 직업기술 포함값**
- `etl/apply_academy_realm_exclusion.py`(`0411c7d`): 운영 학원 테이블을 제자리 수정(직업기술 기관 제거, 빈 주소 삭제,
  800m 안 단지 요약 차감). 멱등이라 `run_due_etl.py`가 매 실행 끝에 돈다(리허설은 dry-run). dry-run: 주소 3,526
  (갱신 969·삭제 2,557), 기관 3,752, 요약 31,537단지, 표본 25단지 RPC와 일치. **`--apply`는 자동 모드 권한 판단에
  막혀 아직 안 돌렸다 — 사용자가 직접 실행하거나 다음 월간 실행(11/2 03:15 KST)에 적용된다**
- `utils/mapPopup.ts`(신규): 학원·돌봄센터 팝업 X 버튼, 그리고 X가 검색창·우측 교육시설 버튼·범례(지도 캔버스
  밖 요소, `data-map-canvas`로 판별)에 가리면 지도를 내리는 `keepPopupClearOfMapControls`
- 학원 팝업: 표 → 상호마다 마커 색과 같은 분류 칩(`getInstitutionCategories`), 분류 순 정렬, 상단 분류별 개수
- 검증: lint·typecheck·build, 로컬 390px 화면 확인(X 노출·닫힘·레이어 유지), 운영 public smoke 통과
- **smoke 실행 주의**: 프로젝트 `node_modules/agent-browser`의 win32 exe가 `spawn UNKNOWN`으로 막힌다(스마트
  앱 컨트롤). 전역 설치본(`%APPDATA%/npm/node_modules/agent-browser`)은 동작해, `public-smoke.mjs` 사본의 `cli`
  경로만 전역으로 바꿔 돌렸다

### 2026-10-04: 지도 하단 간격·교육시설 범례 닫기·브라우저 확대 차단 (커밋·운영 반영)

- `src/index.css`: 범례·"내 주변"·위치 안내의 bottom에서 GNB 높이 제거. `<main>`이 이미
  `pb-app-gnb`로 GNB 위에서 끝나므로 64px가 이중으로 더해져 있었다(2026-10-03 GNB 전 폭 노출 때 생김)
- `AcademyMarkerManager.tsx`: 교육시설 범례에 X(범례만 닫힘, 마커 유지). 레이어 재토글·선택 변경 시 다시 표시
- `MapContainer.tsx`: 지도 영역에서 멀티터치 touchmove, ctrl+wheel, Safari gesture 이벤트의 기본
  동작(페이지 확대)을 취소. 네이버 지도는 touch-action이 auto라 마커·범례 위에서 시작한 핀치가
  브라우저 확대로 새어 지도와 마커 크기가 어긋났다. 전파는 막지 않아 SDK 확대는 그대로
- `MapContainer.tsx`: 지도 래퍼에 `isolate`. SDK 컨트롤·마커의 z-index(100~)가 앱 레이어와 경쟁해
  네이버 로고·축척이 상세 시트(50) 위에 그려졌다
- 검증: lint · typecheck · build, 로컬 public smoke 통과, 390/1280px 화면 확인. 실기기(iOS/Android)
  핀치는 미확인
- **같은 작업 트리의 `SchoolCarePanel.tsx` 변경(소규모 학교 돌봄 이용률)은 다른 세션 작업이라 이 커밋에서 뺐다**

### 2026-10-06: 커리큘럼·1학년 미리보기 검토안 폐기, 화면 코드 삭제

- 사용자 결정으로 기존 검토안을 폐기하고 개편 계획(`PLATFORM_EXPANSION_PLAN.md`)을 따른다. 적용할 포인트는
  `docs/product/PLATFORM_EXPANSION_LEARNING_INPUTS.md`(A2~A8, B9·B11·B12)
- 삭제: `/plans`·`/items`·`/ranking`·`/grade1` 화면과 따봉 UI, 라우트, 입학 준비 진입 링크, 처리방침 7항 코드,
  `src/content/curriculum.ts`·`learning.ts`, `build-content`의 1학년 검증. 플래그 `VITE_CURRICULUM_ENABLED`도 더 읽지 않는다
- 보존(개편 Audit 2 §10 '보존/보류', P0-04·P3 결정 때 정리): SQL `24`(운영 미적용, EXECUTION_GUIDE에 '적용 보류'),
  `src/lib/voter.ts`, `src/services/curriculumService.ts`, `src/content/curriculum/*.json`, `etl/upload_curriculum_refs.py`
- 참고 자료로 이동: `docs/research/learning/stages.json`, `public-recommended-items.json`. 원칙·후보 문서는 '폐기 — 참고 자료'로 표시

### 2026-10-05: 1학년 미리보기 (master, 플래그 뒤 — 운영 노출 안 됨) — 2026-10-06 폐기

- 방향 전환: 따봉·순위 대신 **초1 교과서를 기준점으로** 과목·단계별 "언제 배우나"와 근거 있는 콘텐츠.
  원칙 `docs/product/LEARNING_CONTENT_PRINCIPLES.md`, 단계표 `src/content/learning/stages.json`(국어 6·수학 5·영어 5단계),
  콘텐츠 `src/content/learning/items.json`(공공 추천 국어 5개), 파일럿 후보·후기 양식 `docs/research/LEARNING_PILOT_CANDIDATES.md`
- 화면 `/grade1` — 입학 준비 탭 진입 링크와 함께 `VITE_CURRICULUM_ENABLED=1`일 때만. 지금 수준 선택은 기기 저장
  (`wherecho:grade1-level-v1`). `build-content`가 단계·콘텐츠·후기(본문 인용 금지, 협찬 표기 글 금지)를 검증
- 공식 근거: 교육부 고시 2022-33호 [별책 2]·[별책 5] 원문, 경남교육청 도움자료(2024-12, 현장검토본 기준 — 2027-03 교과서로 재확인)
- **네이버 검색·블로그와 NCIC는 robots.txt로 AI·봇 수집 금지.** 후기는 사람이 읽고 양식에 기록한다.
  확인 중 네이버 검색 결과 페이지를 한 번 받았다가 지웠다. 찬찬한글 옛 주소(basics.re.kr)는 DNS가 없어 서울학습진단성장센터로 바꿨다
- 검증: lint·typecheck·build, 플래그 켠 dev 서버(3005)에서 전역 agent-browser로 국어·수학 화면·수준 저장 확인
- 따봉(SQL 24)·카드·순위 코드는 그대로 플래그 뒤에 남아 있다 — 정리할지 결정 필요

### 2026-10-05: 커리큘럼 공유 1단계 코드 (운영 `f542691`에 포함, **플래그 꺼짐이라 노출 안 됨**)

- **기능 플래그 `VITE_CURRICULUM_ENABLED=1`일 때만 켜진다.** 기본은 꺼짐 — 주소는 홈으로, 개인정보처리방침은 이전
  그대로(`privacy.json`의 `effectiveDate`). master를 release해도 이 기능은 나가지 않는다. 사용자가 입학 준비 탭과
  성격이 달라 표출 위치·운영 방식을 다시 고민 중(2026-10-05)

- 설계 `docs/product/PRD_CURRICULUM_SHARING.md`, C-1~C-9 확정. 카드·아이템은 **저장소 콘텐츠**
  (`src/content/curriculum/{items,plans,taxonomy}.json`, `build-content`가 검증), DB는 따봉만(SQL `24`)
- 화면 `/plans`, `/plans/…--KEY`, `/items/…--KEY`, `/ranking`(입학 준비 탭 활성). 입학 준비 화면의 진입 링크는
  카드가 하나 이상일 때만 보인다 — 지금 콘텐츠가 비어 있어 숨겨져 있다
- 투표: Supabase 익명 로그인(`src/lib/voter.ts`) + Turnstile(`VITE_TURNSTILE_SITE_KEY`가 있을 때). 따봉 키
  `P:`·`PI:{카드}:{아이템}`·`I:`. 순위는 카드 맥락(연령·지역·영역)으로 세고, 투표자 30명 미만 칸은 비공개
- 개인정보처리방침 7항 '따봉 기록' 추가(Supabase 싱가포르 — DB IP로 AWS ap-southeast-1 확인, Cloudflare 미국)
- **운영 전 남은 것**: SQL `24` 적용 · 익명 로그인 켜기 · Turnstile 사이트 키(Vercel)와 비밀 키(Supabase) 함께 ·
  아이템 사전·에디터 카드 작성 · `python etl/upload_curriculum_refs.py --apply` · 익명 세션으로 학교·아파트 조회가
  되는지 확인(역할이 `authenticated`로 바뀐다) · 브라우저 화면 검증과 smoke
- **검증 한계**: Windows 스마트 앱 컨트롤이 agent-browser 실행 파일을 막아(2026-10-05) 화면 확인·smoke를 못 돌렸다.
  lint·typecheck·build, 임시 샘플 콘텐츠로 빌드·검증 실패 케이스, `/plans/…` 라우트 200까지만 확인
- `.env.example`은 권한 규칙으로 읽기·쓰기가 막혀 `VITE_TURNSTILE_SITE_KEY`를 넣지 못했다 — 사용자 몫

### 2026-10-04: 돌봄 후속 — 필터·지도·프리렌더·측정·가이드

- **필터** '저녁 돌봄 운영 학교만'(`FilterState.evening_care_only`): `school_care_statistics`에서
  저녁 돌봄 학교 ID를 한 번 읽어(약 900) 모든 학교 목록 경로(`applyMatchingSchoolFilter`, 시·도 집계)에 적용.
  결과 수는 교차 필터 RPC가 돌봄을 모르므로 RPC id 집합과의 교집합으로 센다. 전체 6,302 → 888
- **지도**: 상세의 '지도에서 돌봄센터 보기' → `joinmap:show-care-centers` 이벤트로 목록 그대로 전달,
  `CareCenterMarkerManager`가 마커·팝업·왼쪽 칩('돌봄센터 N곳 ×'). 지도는 따로 조회하지 않는다
- **프리렌더** `api/detail.js` 학교 페이지에 오후·저녁 돌봄·방과후 사실 4줄. 돌봄 조회 실패는 그 줄만 빠진다
- **GA4** `view_care`(블록 절반이 보일 때), `call_care_center`, `show_care_map`, `filter_evening_care`,
  `click_care_guide`. `MEASUREMENT_PLAN.md` 8절
- **가이드** `care-afterschool` "늘봄·돌봄, 무엇을 언제 신청하나요"(입학하는 해, 10번째). 2026학년도 기준이라
  2027 정책 발표(2027년 초) 뒤 재확인 필요. 학교 사례는 인천계양초 2026 운영계획
- 이용률은 `1·2학년 대비 이용률 %`, 전교생 120명 미만·100% 초과 학교는 '전 학년' 표기(`b258f48`)

### 2026-10-04: 학교 돌봄·방과후와 주변 돌봄센터 (`9cf7ae5`, 운영 `f75f3cf`)

- PRD D4 해소. 학교알리미 **apiType=59**(방과후·돌봄 공시) → `school_care_statistics`,
  다함께돌봄 지원단 센터 목록(`dadol.or.kr/board/center/list`, 서울 우리동네키움센터 포함) →
  `care_centers`, 반경 검색 `nearby_care_centers()`. SQL `23`(사용자가 SQL 편집기로 적용)
- 적재: `python etl/collect_care_data.py --apply`(기본 dry-run). 운영 6,266개교 · 센터 1,483곳
  (승인 1,489 중 좌표 실패 6). **월 1회 수동 실행** — 정기 ETL·Actions에는 아직 넣지 않았다
- 화면: 학교 상세 "돌봄·방과후"(오후 돌봄 실·인원, 1·2학년 100명당, 교실당, 저녁 돌봄, 방과후 수),
  학교·아파트 상세 "주변 돌봄센터"(1km, 학기·방학 운영시간). 신청·탈락 인원은 공시에 없어 간접 지표만,
  점수 합산 없음. 센터의 이용료·현원은 공개 페이지에 없고 단위가 불분명해 싣지 않았다
- 센터 목록 JSON에 담당자 이름·이메일이 섞여 온다. 수집기가 읽는 즉시 버린다 — 바꿀 때 유지할 것
- 지오코딩: 인천 2026 구 개편(중·동·서구 → 제물포·영종·서해·검단구), 면→읍, 지번 주소를 변형으로 재시도.
  `geocode_academy_addresses.geocode()`에 `address_type`(기본 road) 인자 추가
- 검증: lint · typecheck · build, 로컬 public smoke 전체 통과(돌봄 검사 2개 추가). 배포 후
  `browser:smoke:public -- https://wherecho.co.kr` 전체 통과(돌봄 검사 포함)
- 사용자가 돌봄 이용비율을 경쟁률 proxy로 채택. 지역아동센터는 취약계층 대상이라 제외

2026-10-03 세션 종료 시점에 **작업 트리는 깨끗하다.** 같은 날 두 세션이 같은 작업 트리에서
동시에 작업했고, 둘 다 커밋·종료했다.

### 2026-10-04: 모바일 화면 위아래 띠·검색창 가림 (`6f96125`, 운영 `05120ff`)

- 원인: body에 남은 Vite 템플릿 `display:flex; place-items:center; min-height:100vh`. 모바일에서
  100vh(주소창 숨김 높이) > 100dvh(앱)라서 앱이 가운데 정렬돼 위아래 띠(다크 모드 강제 브라우저에서 검정)가
  생기고, 문서가 스크롤돼 지도 검색창이 주소창 밑으로 들어갔다
- 수정: body 정렬·min-height 제거, 앱 높이 `.app-viewport`(100vh 대체 후 100dvh). smoke에 "앱이 화면을
  맨 위부터 채우고 문서가 스크롤되지 않는다" 검사 추가. 운영 smoke 통과. 실기기 확인은 사용자 몫
- dev 서버 주의: 네이버 지도 키는 `localhost:3000`(과 운영)만 허용한다. 다른 포트에서 smoke를 돌리면
  지도가 "등록되어 있지 않습니다"로 막혀 시·도 마커 검사에서 실패한다

### 2026-10-04: 즐겨찾기 → MY (`2d036f0`, 운영 `476798d`)

- 하단 탭 '즐겨찾기'를 'MY'로 바꾸고 `/guide`의 개인 허브 요소(프로필·전체 로드맵)를 `/my`로 옮겼다.
  `FavoritesPage.tsx` 삭제, `MyPage.tsx` 추가. `/favorites`는 앱이 `/my`로 `replaceState`
- 홈(앱·정적 `dist/index.html`)에서 시기별 가이드 목록 제거. 홈의 가이드 내부 링크 9개가 빠졌다
- 버그 수정: 저장한 아파트를 열면 배정 학교만 열리던 것. 기록에 `publicKey`를 남기고
  (`favorites.ts`), 옛 기록은 단지 상세를 다시 열 때 채운다(`refreshFavorite`)
- ★ 버튼 라벨 'MY에 저장' / 'MY에서 빼기'. 저장소 키 `elementary-favorites-v1`, `entry_source=favorites`는 유지.
  `view_roadmap`의 `entry_source`에 `my` 추가
- 검증: lint · typecheck · build 통과, `browser:smoke:public -- http://localhost:3000` 전체 통과
  (저장한 아파트가 그 단지로 열리는 검사, `/favorites` → `/my` 검사 추가). dev 서버는 `127.0.0.1`이
  아니라 `localhost`로만 응답했다
- 운영 검증: release 후 `browser:smoke:public -- https://wherecho.co.kr` 전체 통과(MY 검사 포함)
- 커밋할 때 같은 작업 트리의 다른 세션 변경(`DataFreshness`·SQL `22`·ETL 정기 실행)과 섞이지 않게
  `ApartmentDetail.tsx`·`SchoolDetail.tsx`는 HEAD에 이 작업의 수정만 얹은 내용을 인덱스에 넣었다.
  그 세션의 `DataFreshness` 네 줄은 작업 트리에 미커밋으로 남아 있다

**동시 작업 교훈**: 한 세션이 파일째 `git add`해서 다른 세션의 hunk가 남의 커밋에 섞였다(아래
줌아웃 smoke 블록). 동시 작업 중에는 같은 파일을 건드리기 전에 서로 알리고, `git add`는 파일이
아니라 hunk 단위로 고른다.

이 목록은 시점 기록이다. 실제 상태는 항상 `git status --short`로 다시 확인한다.

### 2026-10-03: 줌아웃 시·도 마커 복구

- 증상: 구 마커(줌 11)보다 더 줌아웃하면 지도에 아무것도 안 떴다.
- 원인: `5bc5b05`(09-23)가 시·도 마커 조회·컴포넌트·CSS를 넣었지만
  `MarkerManager`의 렌더 가드 `if (!map || !shouldShowMarkers) return null`을 그대로 둬서,
  조회는 되는데 그리기 전에 반환했다. 열흘간 운영에서 빈 지도였다.
- 수정(`1453663`): 가드가 `showRegionMarkers`도 통과시킨다. 시·도 마커가 있을 때
  "조건에 맞는 학교가 없습니다" 안내를 띄우지 않는다. 시·도 클릭은 줌 10이 아니라 11로
  간다(10도 시·도 모드라 중심만 옮겨졌다). 시·도 집계는 `school_master` 전체를 읽으므로
  필터별로 캐시한다.
- 줌 계층: 8–10 시·도 → 11–12 구 → 13 동 → 14+ 학교. 루트 `../CLAUDE.md`의
  Zoom-driven granularity 절에 표로 적었다.
- 배포: `release` `d263f2b`로 올렸고, 직후 다른 세션이 `b128cf0`을 `5d64ccb`로 릴리스해
  운영에 둘 다 반영됐다.
- smoke 보강: `public-smoke.mjs`가 지도 로드 직후 실제 휠로 줌아웃해 시·도 마커 10개
  이상·구 마커 없음·빈 상태 안내 없음을 확인하고, 시·도 마커를 실제 포인터로 눌러 구
  마커가 뜨는지 본 뒤 `/map`을 다시 열어 이후 흐름을 잇는다. 이 블록은 동시 작업하던
  세션이 파일째 `git add`하면서 **그 세션의 커밋 `cf9c7b5`(가이드 요약 도식)에 함께
  들어갔다.** 내용은 의도대로이고 push된 이력이라 고쳐 쓰지 않았다. 동시 작업 중에는
  같은 파일을 건드리기 전에 서로 알리고, `git add`는 hunk 단위로 고른다.

## Data Contract

브라우저의 익명 조회가 닿는 것은 테이블 3개와 함수 3개다. 2026-09-27에 배포된
anon 키로 운영 DB에 직접 확인했다.

1. `school_master`
2. `school_apartment_serving`
3. `apartment_academy_summary` — 학원 개수만, 주소·기관명은 비공개 (SQL `14`)
4. `filter_school_ids(...)` (SQL `13`)
5. `nearby_academy_addresses(...)` (SQL `14`)
6. `nearby_academy_addresses_for_school(...)` (SQL `15`)

정규화 마스터, 배정 링크, ETL run/check, staging, source snapshot은 공개하지 않는다.
같은 확인에서 `apartment_complex_master`·`apartment_name_history`·
`apartment_property_history`·`etl_runs`는 `200 []`, `region_registry`·
`etl_schedules`·`etl_staging_rows`·`etl_source_snapshots`는 `401`로 차단을 확인했다.
관리 작업은 `service_role` 또는 등록된 ETL 관리자 계정으로만 수행한다.

전체 계약은 `elementary-v2/docs/architecture/DATA_CONTRACTS.md`를 따른다.

현재 운영 규모 (2026-09-30 실측, 시점 기록이므로 판단 전 재확인한다):

- 운영 공개 지역: 17개 시·도 전부
- 적용 완료 SQL `06`~`23`. 공개 계약은 위 6개에 SQL `22` `public_data_freshness()`,
  SQL `23` `school_care_statistics`·`care_centers`·`nearby_care_centers()`가 더해졌다
- 학교 6,302 · serving 48,189행 · 공개 키를 가진 단지 45,853

행 수는 지역 승격 때마다 바뀌므로 여기에 적지 않는다.
`docs/operations/OPERATION_PLAN.md`의 Update Log가 웨이브별 실측을 기록한다.

SQL 작업은 `elementary-v2/sql/EXECUTION_GUIDE.md`와 번호 순서를 따른다. 이미 적용된
migration은 Supabase 상태를 확인하지 않고 재설계하지 않는다.

## Next Priority

### 1. 학원 과목 분류 — 2026-10-03 완료

학원명에서 과목(영어·수학·국어·논술·과학·코딩, 그 외 입시·종합)을 뽑는 ETL·프런트를 배포하고
(`5e588e9`) 운영 DB에 백필했다(사용자 승인, 주소 78,820 · 기관 151,709, 이어서 세부 과학 과목
키워드 추가분 9곳). 규칙은 `etl/academy_subjects.py`, 테스트 `etl/tests/test_academy_subjects.py`.
과목은 공개 `institutions` JSONB 안의 `subjects`라 마이그레이션이 없다.

- 키워드를 더할 때는 스냅샷 전체에서 그 문자열이 들어간 이름을 먼저 뽑아 본다. '어학원'(국어학원),
  '문학'(전문학원), '국어'(중국어), '화학'(만화학원), '물리'(범물리드웰)가 모두 그렇게 걸렸다
- 규칙을 바꾸면 `python etl/backfill_academy_subjects.py`(dry-run) → `--apply`. 바뀐 행만 쓴다
- '입시.검정 및 보습' 중 26.5%는 이름에 과목이 없는 브랜드형 학원이라 입시·종합으로 남는다
  (대치동처럼 브랜드 학원이 많은 곳은 비율이 더 높다).
- **단일 과목 체인 사전**(`BRAND_SUBJECTS`, 2026-10-04 사용자 요청): 황소·필즈·폴리아·소마·CMS 등은
  수학, 와이즈만은 수학+과학, 지앤비·아발론·이보영은 영어, 리드인·책나무·플라톤 등은 국어·논술.
  같은 체인의 과목명 있는 지점 분포로 근거를 확인한 것만 넣었고, 이름에 과목이 있으면 그것이 우선한다.
  적용 후 전국 입시·종합 25.3%, 대치(서울대현초 주변) 684→655. 남은 대치 입시·종합은 시대인재·
  미래탐구·에듀플렉스 같은 전과목·관리형이 대부분이다. 엘브라운·플라즈마·강안교육·윤도영 등은
  근거가 부족해 넣지 않았다 — 추가할 때도 같은 방식으로 지점 분포부터 본다

### 2. 사용자 몫·예약된 일

- GA4 맞춤 측정기준 `entry_year`, `guide_id` 등록 (관리 → 데이터 표시 → 맞춤 정의)
- **2026-12-03 09:00 KST** 원격 루틴 `trig_012czGSetkKiGzozEgdmU1KT`가 2027학년도 정부24·
  예비소집·사립초 일정을 찾아 `master` 대상 PR을 연다. 검수 후 병합·릴리스한다
- UI 재검토 — 참고 사이트나 무드를 받은 뒤
- 콘텐츠 큐레이션(PRD 7.5) — 책·영상 선정은 사용자 몫
- 돌봄 데이터 월 1회 갱신(`etl/collect_care_data.py --apply`) — 정기 ETL 편입 전까지 수동

### 3. ETL — 월 1회, GitHub Actions 이전 (2026-10-04)

- **9/27~10/4 정기 ETL 전부 실패**(DB 쓰기 없음, 데이터만 멈춤). 결함 3개 수정:
  빌더에 범위 미전달, K-apt의 `전남광주통합특별시`로 광주·전남 K-apt 매칭 0건,
  세종을 충북·충남과 분리해 접경 공동통학구역 실패. 상세는 `docs/operations/ETL_SCHEDULING.md`
- **주기**: 사용자 결정으로 월 1회. `etl_schedules.kapt-basic`을 weekly→monthly로 바꿨다
  (학교알리미는 원본이 연 1회라 annual 유지)
- **Actions**: `.github/workflows/etl-recurring.yml` — 매월 2일 03:15 KST, 수동 실행은 기본
  `rehearse`(쓰기 없음). 입력 묶음 `etl/recurring_inputs_manifest.json` → 비공개 Storage
  `portable-inputs/elementary-recurring-inputs-v1/2026-10-04.2/bundle.zip` (익명 차단 확인)
- **사용자 몫(권한 분류기가 막음)**: Actions 시크릿 `KERIS_SCHOOLINFO_API_KEY` 등록
  (`gh secret set KERIS_SCHOOLINFO_API_KEY` 후 값 붙여넣기). 원격 실행기는 매달 학교알리미 스냅샷을 새로 받아야 하므로 **이 시크릿 없이는 Actions 실행이 실패**한다. 등록 후 `gh workflow run etl-recurring.yml -f mode=rehearse -f force=apartment`로 리허설
- **Windows 작업은 2026-10-04 비활성화**(사용자 결정, Actions로 전환). 운영 데이터는 8/29 이후
  갱신되지 않은 상태. 시크릿 등록 완료, Actions 리허설 통과(run 37199555940, 13개 범위·쓰기 없음).
  **첫 쓰기는 2026-11-02 03:15 KST 정기 실행**(사용자 결정 — 10월 수동 apply는 하지 않음).
  인천 구 이름 80곳과 광주·전남 K-apt 매칭도 이때 운영에 들어간다.
  **11/2 이후 확인할 것**: `gh run list --workflow etl-recurring.yml`로 성공 여부, `/admin/etl`의
  최근 실행·검증 지표(`npm run browser:smoke:admin -- https://wherecho.co.kr`), 인천 학교가
  새 구로 묶이는지, 상세 화면 기준일 줄(릴리스 후)이 아파트 2026-10-xx로 바뀌는지.
  실패하면 GitHub가 메일로 알린다. Windows 작업 복구는 `Enable-ScheduledTask -TaskName "Elementary ETL Daily Check"`

### 3-1. 사용자 확인이 필요한 운영 변경

- **인천 행정구역** — DB 백필 대신 ETL에서 해결(2026-10-04). 학교 주소의 구 이름을 학교알리미 값으로
  맞추는 규칙을 `build_school_master_v2`에 넣었다(수도권 80곳, 다른 지역 0곳). 백필은 매달 ETL이
  `school_master`를 다시 쓰므로 되돌려졌을 것이다. **운영 반영은 다음 `mode=apply` 실행 때**
- ~~SQL 22~~ — 2026-10-04 사용자 적용, anon 호출로 3행 확인. 상세 화면 기준일 줄은 다음 릴리스에 나간다
- ~~관리자 smoke 계정~~ — 2026-10-04 생성·등록 완료. `npm run browser:smoke:admin -- https://wherecho.co.kr`
  운영에서 통과(로그인·4개 패널·RLS 조회). 자격 증명은 `.env`의 `ADMIN_SMOKE_*`

### 4. 이후 후보

- KRIC 공식 원본 확보 후 역/주소 검색 P4 재개
- 4컷 웹툰 파일럿(when-to-move 가이드, 인스타그램 겸용) — 사용자 결정 대기
- **커리큘럼 공유(오늘의집형)** — 플랜(카드) > 모듈 > 아이템 구조, 아이템 단위 투표·인기도.
  DB부터 프런트까지 설계 논의 중(2026-10-04). 계정이 필요해 D1(기기 저장만) 재검토가 걸린다
- 방학 틈새돌봄 지정센터(국가아동권리보장원, 방학마다 게시) 수집 — 12월 겨울방학 전

## ETL Portability

관련 파일:

- `elementary-v2/etl/portable_inputs_manifest.json`
- `elementary-v2/etl/prepare_portable_inputs.py`
- `elementary-v2/etl/tests/test_portable_inputs.py`
- `.github/workflows/etl-portability-check.yml`

검증된 bundle:

- 입력 8개, 총 50,553,797 bytes
- ZIP 8,383,649 bytes
- ZIP SHA-256: `d7226fcf92ea9a60be431cce414e304e8abe8ee78c664a4ab774592e110f8b6f`
- bundle v2 로컬 전체 빌드 및 backend audit 52/52 통과
- 결과 7개 행 수·SHA-256 기준선: `etl/portable_readonly_baseline.json`
- 기준선 해시는 플랫폼 독립이다. JSON은 canonical 직렬화 내용을 해싱하고
  (`Path.write_text`가 Windows에서 CRLF를 쓰기 때문), CSV는 `csv.DictWriter`가
  모든 플랫폼에서 CRLF를 쓰므로 바이트 해시를 유지한다.
- Storage object:
  `etl-source-snapshots/portable-inputs/elementary-reviewed-inputs-v1/2026-09-06/bundle.zip`
- 기존 bundle v1은 service-role restore 및 anon 다운로드 차단 확인 완료
- bundle v2의 Storage 업로드·원격 8개 checksum·anon 차단 검증 완료
- 예정 v2 object: `etl-source-snapshots/portable-inputs/elementary-reviewed-inputs-v2/2026-09-07/bundle.zip`

bundle과 restore 결과는 `elementary-v2/etl/runtime/`의 로컬 산출물이며 Git에 넣지
않는다.

## Station Search P4

canonical 후보는 KRIC `전체_도시철도역사정보_20260630`이다. profiler와 source
contract만 준비되어 있으며 production schema는 없다.

- 계획: `elementary-v2/docs/reference/STATION_SEARCH_SOURCE_PLAN.md`
- profiler: `elementary-v2/etl/profile_station_source.py`
- tests: `elementary-v2/etl/tests/test_station_profile.py`

공식 파일을 private snapshot으로 보존하고 수도권 coverage, 좌표, source key, 중복,
환승역 alias를 검증한 뒤에만 schema와 검색 UI를 진행한다.

## Verification

Frontend 변경 후:

```powershell
cd F:\sm\vibe\elementary\pjt_250826\elementary-v2
npm run lint
npm run typecheck
npm run build
npm run browser:smoke:public
```

ETL portability와 station profiler:

```powershell
python -m unittest etl.tests.test_portable_inputs etl.tests.test_station_profile
python -m py_compile etl/prepare_portable_inputs.py etl/profile_station_source.py
```

`package.json`에는 일반 test runner가 없다. 존재하지 않는 npm test 명령을 가정하지
않는다.

운영 검증은 URL을 넘긴다: `npm run browser:smoke:public -- https://wherecho.co.kr`.
작업 트리의 smoke 스크립트에 다른 세션의 미배포 검사가 섞여 있으면 운영에 대해 실패한다.
그때는 배포된 판을 꺼내 돌린다:
`git show origin/release:elementary-v2/scripts/public-smoke.mjs > scripts/.smoke-release.tmp.mjs`
(같은 `scripts/`에 둬야 `node_modules` 경로가 맞는다. 실행 후 지운다.)

2026-10-03 운영 검증:

- `5d64ccb`: `/admin/etl` 200, 배포된 smoke 전체 통과(360·430·1280 overflow 없음,
  지도 5초·아파트 3초 예산 안). 운영 지도에서 줌 8에 시·도 마커 17개, 대구 클릭 시 줌
  11에서 구 마커 표시
- `5cc5157`: 줌아웃 검사가 들어간 smoke를 운영에 3회 실행. 줌아웃·시·도 클릭 검사는
  3회 모두 통과. 1회차는 한참 뒤 단계인 `school search returned results`(학교 딥링크 →
  가이드 → 뒤로 → '서울방현' 검색)에서 15초 시간 초과로 실패했고 2·3회차는 전체 통과.
  재현되지 않았고 원인은 확인하지 못했다. 다시 나오면 그 단계부터 본다
- 깨끗한 worktree에서 lint·typecheck·vite build 통과. `seo` 단계는 `.env`가 없어
  로컬에서 확인 못 했고 Vercel 빌드에서 생성됐다

`1c87d49` 직전 검증 기록:

- lint, typecheck, production build 통과
- Python unit tests 5개 통과, compile 통과
- 공개 smoke에서 선택 학교 최소화 상태 유지
- 360, 390, 430, 1280 너비 horizontal overflow 없음
- 초기 지도 약 1.45초, 아파트 read 약 0.26~0.39초
- 비차단 경고: 오래된 browserslist 데이터, 500 kB 초과 bundle chunk


## Documentation Map

- 진행 요약: `elementary-v2/docs/PROJECT_PROGRESS.html`
- ETL 기준 계획: `elementary-v2/docs/operations/OPERATION_PLAN.md`
- Frontend UX 계획: `elementary-v2/docs/ux/FRONTEND_UX_SYSTEM_PLAN.md`
- ETL scheduling: `elementary-v2/docs/operations/ETL_SCHEDULING.md`
- 추가 데이터: `elementary-v2/docs/operations/OPERATION_PLAN.md`의 Additional Data Domains 절
- 릴리스 기록: `elementary-v2/docs/RELEASES.md`
- 분석 아카이브: `../archive/elementary-v2-analysis-20260916/`

`F:\sm\vibe\elementary\archive`와 v1 문서는 참고 전용이다.

## Security

- `.env` 실제 값을 출력, 문서화, 커밋하지 않는다.
- frontend에는 anon key만 사용한다.
- service role key는 ETL, Actions secret, 관리자 작업에서만 사용한다.
- Supabase Storage 원천 snapshot은 private으로 유지한다.
- commit 전 JWT 형태 문자열과 `etl/runtime/` 포함 여부를 확인한다.

## End Of Session

종료 전에 다음을 갱신한다.

1. `git status --short`, 최신 pushed commit, 배포 여부
2. 완료한 단계와 다음 첫 작업
3. 실행한 검증, 실패와 경고
4. SQL 적용 및 외부 서비스 설정 여부
5. `PROJECT_PROGRESS.html`과 해당 기준 계획
6. 이 파일의 미커밋 목록과 최근 검증 기준
