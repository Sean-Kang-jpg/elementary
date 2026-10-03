# Session Init: Elementary Map

새 작업 세션에서 프로젝트 상태를 빠르게 복원하기 위한 인수인계 문서다.
세부 상태는 이 파일보다 `elementary-v2/docs/operations/OPERATION_PLAN.md`와
`elementary-v2/docs/ux/FRONTEND_UX_SYSTEM_PLAN.md`를 우선한다.

## Start Here

- Git root: `F:\sm\vibe\elementary\pjt_250826`
- Active app: `F:\sm\vibe\elementary\pjt_250826\elementary-v2`
- Stack: React 18, TypeScript, Vite, Tailwind CSS, Supabase, Naver Maps
- Branch: `master` (작업), `release` (운영 배포. push가 곧 운영 배포다)
- Last pushed baseline (2026-10-03): `release` `5cc5157` = `master` `cf9c7b5`의 트리, 운영에
  나가 있다. 그 위 `master`의 이 문서 갱신 커밋은 문서뿐이라 release하지 않았다
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

현재 제품 버전은 v2.2다.

- v2.0: 운영 DB와 2-table frontend contract 완료
- v2.1: 지도 탐색, 검색, 필터, GNB, 지역 drilldown, 즐겨찾기, 반응형 QA 완료
- v2.2 P0: content-aware bottom-sheet gesture engine 완료
- v2.2 P1: 학교·아파트 통합 검색 완료
- v2.2 P2: viewport와 filter 문맥 정리 완료
- v2.2 P3: 아파트 `building_count` 표시 완료
- P3 follow-up: 상세 bottom sheet를 아래로 밀면 선택을 유지한 채 제목 높이로 최소화
- v2.2 P4: 역·주소 검색은 공식 원본과 비용·정확도 검증 전까지 보류
- v2.2 P5: build-complete bundle v2의 로컬·Ubuntu 전체 재현 완료. read-only
  GitHub Actions run `34242752216`에서 52/52 감사와 7개 산출물 비교 통과
- P6: 수도권 실측 검토 완료. 학원 진행 권고, 시간표 보류, 놀이터 착수 불가
  (`../archive/elementary-v2-analysis-20260916/docs/REPORT_P6_DATA_DOMAIN_FEASIBILITY_20260907.md`)

전체 진행표는 `elementary-v2/docs/PROJECT_PROGRESS.html`에서 확인한다.

## Uncommitted Work At Handoff

2026-10-03 기준. 예전 목록의 `MarkerManager.tsx`·`dataService.ts`는 커밋·배포됐다
(`1453663`). 같은 날 **다른 세션이 같은 작업 트리에서 동시에 작업**했다 — 가이드
콘텐츠(`src/content/guides/*.md`), `GuidePage.tsx`, `GuideSummary.tsx`(신규),
`build-content.mjs`, `build-shell-pages.mjs`, `content.css`가 그 세션의 미커밋 변경이다.
내 것이 아니면 커밋에 섞지 않는다. 파일을 골라 `git add`한다.

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

현재 운영 규모 (2026-09-27, 시점 기록이므로 판단 전 재확인한다):

- 운영 공개 지역 7개: 서울·경기·인천·대전·울산·제주·대구
  (전체 17개 중. `etl/region_registry.json`의 `status=production`이 기준)
- 적용 완료 SQL `06`~`17`
- DB 143.4 MB, 무료 한도의 28.7%

행 수는 지역 승격 때마다 바뀌므로 여기에 적지 않는다.
`docs/operations/OPERATION_PLAN.md`의 Update Log가 웨이브별 실측을 기록한다.

SQL 작업은 `elementary-v2/sql/EXECUTION_GUIDE.md`와 번호 순서를 따른다. 이미 적용된
migration은 Supabase 상태를 확인하지 않고 재설계하지 않는다.

## Next Priority

### 1. 미커밋 frontend 작업 정리

2026-09-07의 미커밋 frontend 작업은 정리됐다(위 절). 지금 작업 트리의 미커밋 변경은
동시 작업 중인 다른 세션의 것이므로, 그 세션이 검증·커밋한다.

### 2. P5 ETL 쓰기 전환 검토

1. GitHub Actions secrets 등록과 read-only run `34242752216` 검증은 완료했다.
2. Windows Task Scheduler를 fallback으로 유지한다.
3. DB write와 정기 schedule 전환은 사용자 별도 승인 후에만 진행한다.
4. 첫 write run은 ETL dashboard, Serving, snapshot, alert를 함께 모니터링한다.

Actions secrets는 영구 외부 설정이므로 사용자 승인 없이 등록하거나 변경하지 않는다.

### 3. P6 학원 도메인

블로커는 VWORLD 인증키 만료 하나다. `EXPIRE_KEY`로 300건 표본 지오코딩이 전량 실패했고,
`coordinate_bbox_sample_rematch.py`, `refine_building_assignments_vworld.py`,
`verify_building_level.py`도 같은 키를 쓰므로 현재 함께 동작하지 않는다.

1. 사용자가 vworld.kr에서 키를 갱신하고 `.env`의 `VWORLD_API_KEY`를 교체한다.
2. 300건 표본으로 지오코딩 매치율을 측정한다.
3. 통과하면 고유 주소 29,683건을 전량 지오코딩한다(71,690건이 아니다. 75.5%가 같은
   건물에 입주해 있다).
4. 아파트 반경 기준을 정하고 `학원 → 반경 내 아파트 → 배정 학교`로 연결한다. 학원은
   학교에 배정되지 않으므로 배정 관계를 만들지 않는다.
5. 마커는 주소 단위 1개로 생성한다. 표기 방식은 추후 논의한다.

관련 스크립트는 `../archive/elementary-v2-analysis-20260916/etl/research/`에 있고 원천 스냅샷은
`elementary-v2/etl/runtime/academy/`에 둔다(Git 제외).

### 4. 이후 후보

- 비개인용 인증 계정을 이용한 `/admin/etl` smoke 확장
- Serving source timestamp 공개 후 freshness 표시
- KRIC 공식 원본 확보 후 역/주소 검색 P4 재개
- 학교 마스터의 인천 행정구역을 2026 개편 후 기준으로 갱신
- 시간표 재개 시 창의적 체험활동 프로그램 태그 축소안으로 한정

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

현재 미커밋 변경은 위 기록 이후에 생겼으므로 별도로 재검증해야 한다.

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
