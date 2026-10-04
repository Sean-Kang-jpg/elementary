# Session Init: Elementary Map

새 작업 세션에서 프로젝트 상태를 빠르게 복원하기 위한 인수인계 문서다.
세부 상태는 이 파일보다 `elementary-v2/docs/operations/OPERATION_PLAN.md`와
`elementary-v2/docs/ux/FRONTEND_UX_SYSTEM_PLAN.md`를 우선한다.

## Start Here

- Git root: `F:\sm\vibe\elementary\pjt_250826`
- Active app: `F:\sm\vibe\elementary\pjt_250826\elementary-v2`
- Stack: React 18, TypeScript, Vite, Tailwind CSS, Supabase, Naver Maps
- Branch: `master` (작업), `release` (운영 배포. push가 곧 운영 배포다)
- Last pushed baseline (2026-10-04): 운영 `release` `05120ff`. **master 트리와 같지 않다** —
  `476798d`(MY 재편 = `2d036f0`의 트리)에 모바일 화면 수정 `6f96125`의 세 파일만 얹었다.
  master의 다른 세션 커밋 `1899418`(정기 ETL·데이터 기준일 표시, SQL `22` 필요)·`d36d84f`·`efd927c`는
  아직 운영에 없다. 다음 release는 SQL `22` 운영 적용을 확인한 뒤 master 트리로 올린다
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
- 적용 완료 SQL `06`~`20`. 공개 계약은 테이블 3개(`school_master`,
  `school_apartment_serving`, `apartment_academy_summary`)와 함수 3개
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
- 학교 상세 돌봄·방과후 정보 — D4(학교알리미 공시 항목 실증)가 선행

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
  갱신되지 않은 상태 — 시크릿 등록 → Actions 리허설 통과 → `mode=apply` 수동 실행(또는 11/2 정기
  실행)이 10월 갱신이다. 되돌리려면 `Enable-ScheduledTask -TaskName "Elementary ETL Daily Check"`

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
