# Session Init: Elementary Map

새 작업 세션에서 프로젝트 상태를 빠르게 복원하기 위한 인수인계 문서다.
세부 상태는 이 파일보다 `elementary-v2/docs/ETL_OPERATION_PLAN.md`와
`elementary-v2/docs/FRONTEND_UX_SYSTEM_PLAN.md`를 우선한다.

## Start Here

- Git root: `F:\sm\vibe\elementary\pjt_250826`
- Active app: `F:\sm\vibe\elementary\pjt_250826\elementary-v2`
- Stack: React 18, TypeScript, Vite, Tailwind CSS, Supabase, Naver Maps
- Branch: `master`
- Last pushed baseline: `1c87d49` (`Advance v2.2 UX and ETL portability`)
- Production: `https://elementary-lovat.vercel.app`
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
- v2.2 P5: build-complete bundle v2의 로컬 전체 재현과 Windows checksum 기준선 완료,
  v2 Storage 업로드 및 GitHub Actions 실제 실행 대기
- P6: 학원·시간표·놀이터 데이터 후보 검증 대기

전체 진행표는 `elementary-v2/docs/PROJECT_PROGRESS.html`에서 확인한다.

## Uncommitted Work At Handoff

2026-09-07 세션 시작 기준으로 `1c87d49` 이후 아래 변경이 미커밋 상태다.
다음 세션에서는 내용을 먼저 검토하고 완료 여부를 판단한다.

- `elementary-v2/src/components/map/MarkerManager.tsx`
- `elementary-v2/src/components/navigation/NewsPage.tsx`
- `elementary-v2/etl/analyze_report_clusters.py`
- `elementary-v2/etl/verify_missing_school_sample.py`
- `elementary-v2/docs/REPORT_CLUSTER_INSIGHTS_20260906.md`
- `elementary-v2/docs/REPORT_MISSING_SCHOOL_SAMPLE_20260906.md`
- `elementary-v2/docs/INSTAGRAM_CAROUSEL_GRADE1_CLUSTER_20260906.md`

이 목록은 시점 기록이다. 실제 상태는 항상 `git status --short`로 다시 확인한다.

## Data Contract

브라우저의 익명 조회는 아래 두 테이블만 사용한다.

1. `school_master`
2. `school_apartment_serving`

정규화 마스터, 배정 링크, ETL run/check, staging, source snapshot은 공개하지 않는다.
관리 작업은 `service_role` 또는 등록된 ETL 관리자 계정으로만 수행한다.

현재 운영 규모:

- 학교 2,260개
- canonical apartment complex 20,164개
- school-apartment Serving 20,891행
- 적용 완료 SQL `06`~`13`

SQL 작업은 `elementary-v2/sql/EXECUTION_GUIDE.md`와 번호 순서를 따른다. 이미 적용된
migration은 Supabase 상태를 확인하지 않고 재설계하지 않는다.

## Next Priority

### 1. 현재 미커밋 Front·콘텐츠 작업 정리

1. MarkerManager와 NewsPage diff를 검토한다.
2. 클러스터 분석 스크립트와 두 검증 리포트의 재현성을 확인한다.
3. Instagram carousel 원고가 분석 결과와 일치하는지 대조한다.
4. `PROJECT_PROGRESS.html`과 관련 계획 문서에 상태를 반영한다.
5. frontend 검증 후 선별 commit/push 한다.

### 2. P5 ETL 원격 실행 검증

1. GitHub Actions secrets에 `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`를 등록한다.
2. `.github/workflows/etl-portability-check.yml`을 수동 실행한다.
3. 원격 restore, checksum, unit test 결과를 확인한다.
4. GitHub read-only build와 Windows 산출물의 행 수·해시·품질 결과를 비교한다.
5. 첫 원격 성공 전까지 Windows Task Scheduler를 유지한다.
6. 비교 통과 후에만 DB write와 정기 schedule 전환을 승인한다.

Actions secrets는 영구 외부 설정이므로 사용자 승인 없이 등록하거나 변경하지 않는다.

### 3. 이후 후보

- 비개인용 인증 계정을 이용한 `/admin/etl` smoke 확장
- Serving source timestamp 공개 후 freshness 표시
- KRIC 공식 원본 확보 후 역/주소 검색 P4 재개
- 학원·시간표·놀이터 수도권 pilot과 go/no-go 판단

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
- Windows 결과 7개 행 수·SHA-256 기준선: `etl/portable_readonly_baseline.json`
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

- 계획: `elementary-v2/docs/STATION_SEARCH_SOURCE_PLAN.md`
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
- ETL 기준 계획: `elementary-v2/docs/ETL_OPERATION_PLAN.md`
- Frontend UX 계획: `elementary-v2/docs/FRONTEND_UX_SYSTEM_PLAN.md`
- ETL scheduling: `elementary-v2/docs/ETL_SCHEDULING_SETUP.md`
- 추가 데이터: `elementary-v2/docs/FUTURE_DATA_DOMAINS_PLAN.md`
- 릴리스 기록: `elementary-v2/docs/RELEASES.md`
- v2.0 시각 snapshot: `elementary-v2/docs/JOINMAP_V2_0.html`

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
