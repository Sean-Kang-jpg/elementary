# Session Init: Elementary Map

새 작업 세션에서 프로젝트 상태를 빠르게 복원하기 위한 인수인계 문서다. 세부 상태는 이 파일보다
`elementary-v2/docs/operations/OPERATION_PLAN.md`와 `elementary-v2/docs/ux/FRONTEND_UX_SYSTEM_PLAN.md`를 우선한다.
구조·빌드·데이터 계약은 루트 `../CLAUDE.md`가 맡고, 이 파일은 **지금 상태와 다음 일**만 적는다.

2026-11-03 요약 정리: 935줄을 이 판으로 줄였다. 11-02까지의 날짜별 전문은 `git show db6e90f:CLAUDE.md`
(옛 판)와 그때 작업 트리에만 있던 11-02 ETL·학원 신호 기록을 아래 절에 합쳤다. 지난 기록은 맨 아래 색인에 한 줄씩.

## Start Here

- Git root `F:\sm\vibe\elementary\pjt_250826`, 앱 `elementary-v2/` (React 18 · TypeScript · Vite · Tailwind · Supabase · Naver Maps)
- 브랜치: `master`(작업), `release`(운영 — **push가 곧 배포**). 운영 `https://wherecho.co.kr`(옛 `elementary-lovat.vercel.app`은 301)
- Supabase project ref `vsgeksumgvcrkzjwvlgs`
- 세션 시작: `git status --short` · `git log -5 --oneline` · `git fetch && git log --oneline HEAD..origin/master` · `cd elementary-v2 && npm run typecheck`

작업 규칙(여러 세션이 같은 작업 트리를 쓴다):

- dirty 파일은 다른 세션 작업으로 본다. 되돌리거나 stash하지 않는다. `git add`는 파일이 아니라 hunk 단위
- 로컬 master가 origin보다 뒤처져 있고 작업 트리가 더러우면 pull하지 말고, 임시 인덱스로 origin 위에 커밋한다:
  `GIT_INDEX_FILE=<tmp> git read-tree origin/master` → `git update-index --cacheinfo 100644,<hash-object -w>,<path>` →
  `write-tree` → `commit-tree -p origin/master` → `git push origin <sha>:refs/heads/master`. release도 `commit-tree`+`update-ref`
- push 전 `git log`로 내 커밋이 남았는지 확인(10-28 이력 재작성으로 커밋이 한 번 빠졌다)
- release push·운영 DB 쓰기·SQL 적용·Actions 시크릿은 사용자 승인 뒤. 자동 모드 권한 판단에 막히면 우회하지 말고 사용자에게 넘긴다
- LFS 잠금 검사 끔(`lfs.<origin>/info/lfs.locksverify false`, 10-08 사용자 승인). LFS 파일은 없다

## Current Product State

앱 2.3.0, 브랜드 **어디초**, 전국 17개 시·도. 2.0 개편(10-20 합의, `docs/product/PIVOT_V2_CONCEPT.md`):
정보 검색 → 학부모 고민(하교 후 공백 → 방학 → 학원 연결). 파일럿 298곳(학군지 10곳 + 위례), 운영 파일럿은 분당·판교와 위례.

- 메뉴: 상단 로고·MY, 탭 **학교 찾기 · 입학 준비 · 우리집 일정(`/timetable`) · 배움·돌봄(`/frontyard`, 플래그)**.
  홈은 고민 목록에서 시작(UX-08c `PlanSummary`), MY는 입학연도·관심 후보·저장 학원
- 우리집 일정: `?face=timeline`(입학까지 D-day·완료 체크) / `?face=week`(한 주 시간표). 한 주는 질문으로 시작(UX-13)
- 학교 상세: 1학년 요일별 하교 예상(SQL 26), 돌봄 시간, **방과후·맞춤형 시간대 막대**(SQL 38 slots, 돌봄내는 연한 초록, 확인 요일 `!`)
- 라우팅·SEO·프리렌더·허브(`/area/*`)는 루트 `../CLAUDE.md`. GA4 `G-NQT4XV9R00`, 이벤트 규칙 `docs/product/MEASUREMENT_PLAN.md` 8절
- 백로그 `docs/product/UX_BACKLOG_PLAN_CENTERED.md`(UX-01~26), Codex 분담 `docs/operations/CODEX_UX_HANDOFF.md`(C-01~09)

## 진행 중 작업

### A. 우리집 일정 UX (11-01~04)

- 운영 배포: release `013bc70`(UX-K0·UX-03·C-01·C-02 .ics) → `439607b`(C-03·UX-26·UX-06·UX-08c·UX-10·C-07~09) →
  `1ec626f`(C-04 홈 고민 목록·C-05 홈 하단, 다른 세션) → `e4f2688`(UX-13: 보호자 귀가 → 학교 돌봄 → 맞춤형·방과후 → 남은 빈 시간,
  `SchoolPlan.starter`, 빈 시간은 귀가 시각까지 `coverageUntil`). 다른 세션의 `ab3e4b2`(지도 빠른 필터 숨김)도 운영에 있다
- **UX-14**(11-03 운영 배포, `ab67bff`): 칸의 의도 안전·기초·관심·휴식·미정(휴식은 11-03 사용자 확정, 저장값 `free`).
  `ScheduleEntry.intent`는 부모가 고를 때만 저장, 없으면 종류·과목 기본값. 이름 바꾸기는 `schedule/intent.ts` 표만
- **UX-18**(11-03 운영 배포, release `c48f0a1`, 운영 smoke 176 PASS): 돌아온 가족에게 "지난번(M월 D일) 이후" — 달 바뀜·그 사이 지난 일(했어요)·새로 2주 안. 홈 카드·입학까지 면.
  `notePlanVisit`이 `lastSeenAt`을 덮기 전 값을 붙잡아 `readPlanChanges`가 쓴다. 학교 자료 갱신 알림은 미포함
- **UX-27 빼기**(11-04 운영 배포, release `8c804b1`, 운영 smoke 188 PASS): 사용자 지적 "넣기는 되는데 빼기가 없다" — 입학까지 줄마다 ×(담은 것 빼기·로드맵은 "해당 없어요" 숨김, 되돌리기, 숨긴 일정 다시 보기), 입학연도 전 담은 항목 목록, 한 주 "모든 요일에서 빼기"+되돌리기, 출발 질문 "← 이전 질문", 지도 학원 담기 뒤 우리집 일정 링크. 사용자 결정: 로드맵 항목은 숨김(A)
- **C-06 추첨 결과 가이드 2편**(11-05 운영 배포, release `749c20a`, 운영 smoke 통과): Codex 브랜치 `codex/ux-15-care-disclosure`에서 가이드·홈 노출(11/16~19)과 한일초 접수일만 가져옴. 돌봄 패널 문구(UX-15)와 사립·국립 가이드 문단 교체는 사용자 지시로 제외 — UX-15는 미완, UX-16·17은 시작 전, UX-23은 사용자 보류
- **11-05 아파트 이름 검색 시간 초과(일시)**: anon `statement_timeout` 3초에 걸려 은마 검색이 500(`57014`). 수동 `VACUUM ANALYZE` 뒤에도 잠시 이어지다 회복, 재측정 81 ms·dead 0·운영 smoke 통과. 원인은 확정 못 함(같은 시간대 부하 추정). 순차 스캔이지만 trigram 인덱스(SQL 42)는 만들지 않음 — 평소 충분히 빠르고 2글자 검색어엔 효과가 불확실. 재발하면 그때 pg_stat_activity부터. DB 464 MB / 한도 500 MB
- 다음: Claude 몫 P2(UX-13·14·18) 끝 — 남은 Claude 항목은 UX-23(기기 간 동기화, D1 재결정 필요)·UX-20(고민 카드, 사용자와 함께)
- **홈 배정 검색 카드·아이콘 규칙(11-02~03, 미커밋)**: '지금 챙길 것' 첫 카드 = 질문+검색창+학구도 안내(`worry-item--search`,
  첫 포커스에 `home_worry_click(assignment)` 1회, 정적 홈 동일). 고민 항목 버튼은 달력+(일정 담기)·공유 아이콘 2개.
  **아이콘 규칙(사용자 확정 11-03)**: 관심 저장 = 하트(학교·아파트 별 → 하트, 저장 색 `#c94f3a`), 우리집 일정에 담기 = 달력+,
  화면 안 새 일정 = +. MY '관심 후보' → '관심 학교·아파트', 상세 aria-label '관심 학교 저장'/'관심 아파트 저장'.
  검증 lint·typecheck·build·test:unit 142·public smoke 158·my-ux-smoke 38(`localhost:3001` — 127.0.0.1:3001은 다른 worktree 서버)
- 사용자 몫: C-03 가이드 버튼 문구 14개, C-06 추첨 결과 사실, 휴대폰 캘린더에서 .ics 열어 보기

### A2. 학교 찾기 지도 UI (11-01~03, 운영 `ab3e4b2`)

- 사용자 결정: 빠른 필터는 지도를 가려 **숨긴다**. 부모 대상 브랜딩·UX 개편 뒤 다듬어 다시 켠다 — `Header.tsx`의 `SHOW_QUICK_FILTERS` 하나로 켜고 끈다.
  상세 필터(`.map-filter-open`)·표시 필터는 MY 버튼 바로 아래(`MapLayerControl.tsx`, 데스크톱은 지도 오른쪽 위). 위치도 개편 때 다시 볼 것
- 학교 시트 탭 '배정·통학' → 배정아파트, 아파트 시트 탭은 배정 학교(사용자 확인). 교육환경을 켜면 과목 선택이 표시 필터 아래 나온다.
  학원 상세의 시간표 추가·관심 학원은 학원명 줄 오른쪽 달력+·하트 아이콘
- 11-03: 주차순 정렬에서 **주차 미확인 단지는 어느 방향이든 맨 뒤**(사용자 결정, `ApartmentList.tsx`). smoke는 숨긴 주제 줄 대신 시트 탭을 쓴다.
  빠른 필터 메뉴 검사는 p1-ux에서 뺐다 — 다시 켤 때 git 기록에서 복원

### B. 방과후·맞춤형 시간대층 (SQL 32·38)

현황(11-03 운영): summary 688곳(서울 561 + 경기 127 — 경기 파일럿 지역 분당·위례·수지·동안·광명 전부) · slots 10,952 · checks 1,200(13건 확인 완료) · 통과 357 · 확인 282 · 해당 없음 49.
기준 `docs/operations/PIVOT_SLOT_STANDARD.md`, 빌더 `etl/afterschool_slots.py`, 적재 `etl/load_school_afterschool.py`.

- **표준 적재 명령**(저장소 경로만, 11-03 운영과 차이 0 확인):
  `python -m etl.load_school_afterschool $(cat etl/afterschool_load_args.txt)` → 차이 확인 뒤 `--apply`.
  서울 입력 `etl/runtime/llm_extraction/...`는 이 PC에만 있다(git 제외). 교시 수는 SQL 26 스냅숏
  `docs/research/pivot/p1_gate_20261102/sql26_periods_20261031.json`
- 확인 목록: `python -m etl.afterschool_checks_sheet export`(항목 CSV + 학교별 질문지) → 확인일 기입 → `resolve <csv> [--apply]`.
  재적재 때 `resolved_on`을 이어받는다. 남은 항목 대부분은 원문에 시각이 없는 것이라 **학교 문의(사용자 몫)**
- 11-02 반영:
  - PDF원문 14곳 대조(`docs/research/pivot/p1_pdf_review_20261102.json`): 13곳 닫음, **안현 B000004262는 원문 표 칸 밀림 — 학교 확인**
  - 규칙 `a19bf81`: 입학초기·적응기·3월 1~3주만인 행은 학기 시간대가 아니다(낙생·불곡의 3월 초 창 제거, 학기 표가 없으면 그 요일은 확인 항목)
  - 규칙(11-03 커밋): 교시 조건 시간(`period_slots`)은 원문불일치(`conflicts`)가 가리키는 줄의 행을 채우지 않는다(신백현 돌봄2반이 독립 맞춤형 5교시 창을 받던 것).
    3월 안에서 시작·끝나는 날짜 범위('3.3~3.27')도 입학 초기로 본다(위례한빛). 둘 다 운영 학교 변화 0
  - **신백현 B000003746 게이트·운영 적재**: Codex 작업 폴더 추출(71행)을 원문 줄과 대조해 전부 일치, 유료 46반은 요일 미공시라 1학년 반을 `방과후시각미확인`.
    파일 `docs/research/pivot/p1_gate_20261102/`
  - 사용자 결정: 서울 B000001921(3월 1~4주 표뿐)은 그대로 둔다
- **대기**:
  - **분당·위례 남은 5곳 게이트·운영 적재(11-03, 사용자 승인)**. 파일 `p1_gate_20261102/`(batch + slot_review, 각 note에 대조 기록).
    새 학교도 같은 방식: batch를 그 폴더에, `afterschool_load_args.txt`에 `--slot-reviews`를 더한 뒤 차이 확인 → `--apply`
    - 보평 B000003743·성남화랑 B000024167: Codex 추출(10-28), 97·87행 원문 일치
    - 성남미금 B000003754·위례한빛 B000024238·위례중앙 B000024241: 11-03 소네트 하위 에이전트 추출(v3, 입력 Codex 작업 폴더 `inputs_v3/pivot_p1_stage2_20261023/`).
      게이트에서 고친 것: 미금 공개주간(5.18~5.22) 맞춤형 10행 제거, 위례중앙 요일 열로 월·금 요일 채우고 풀린 충돌 2건 제거. 위례한빛은 그대로
    - 5곳 모두 A등급·확인 필요, 맞춤형 창은 학교마다 월~금. 확인 목록 다시 뽑음(`afterschool_checks_20261103.csv`, 222곳 1,118건)
  - 서울 검사(11-03 사용자 결정): ① PDF뿐인 54곳에 `PDF원문`(`docs/research/audit2/seoul_pdf_only_checks_20261103.json`, 운영 반영). [file:] 머리글 없는 57곳은 미판정.
    ② 표본 30곳 원문불일치(11-03, `docs/research/audit2/seoul_conflict_sample_20261103.json`, 소네트 174만 토큰): 보고 43건 중 원문 대조로 24건·9곳 확인 →
    `seoul_conflict_checks_20261104.json`으로 운영 반영(15항목, 신답은 원인 두 줄로 묶음). 대부분 종료 10분·대상 학년 차이.
    주의: 같은 학교가 여러 `--slot-reviews`에 있으면 마지막 파일 항목만 남는다 — 앞 파일 항목을 뒤 파일에 다시 적을 것.
    ③ 코드 사전검사(같은 강좌가 두 줄에서 시각·학년이 다름)는 표본 기준 넓게 잡으면 294곳·9곳 중 8곳, 좁게 잡으면 106곳·3곳 — 나머지 범위는 사용자 결정 대기
  - Codex 작업 폴더 `.worktrees/pivot-p1-v3-20261021`에 미커밋 검수 파일(part_a/b/c 리뷰, all44 후보 등)이 남아 있다 — 그 세션 것
  - `my-inline-selection`·`care-planning-defaults` 스모크는 playwright가 없어 못 돌림

### C. 정기 ETL — 11/2 실패와 아파트 빌더 수정

- run `41354707718`(이슈 #3): 수도권 아파트 3회 모두 `apartment_complex_master: remote 21,738 != staged 20,683`, 학원 단계 미실행.
  원인: K-apt 9/25 자료가 2026 신설 구 이름(화성 동탄·만세·병점·효행, 인천 검단·서해·영종·제물포)을 쓰고 여러 동 단지 주소를 하나로 줄여
  602곳 매칭이 풀림(1,055곳 모두 새 빌드에 대응 단지 있음 — 묶음 ID 변경)
- 수정 push: `0d20649`(`DISTRICT_PREDECESSORS`, `etl/kapt_road_address_history.csv` — `.gitignore` 때문에 `add -f`), `82a80be`(옛 ID 정리·실패 시 staging 삭제, 다른 세션)
- staging 281,781행 삭제·VACUUM 완료(11/3, 공개 스키마 661.7 → 391.1 MB). 부분 쓰기(school_master 2,260·단지 마스터 20,683)는 공개 화면 영향 없음
- 리허설 `41521944429`(아파트만): 15개 지역 빌드·검증 통과, 공개 키 단계 실패 — 9/29 발급 때 남은 **잘못된 `superseded_by` 80개**
  (각자 단지 하나의 serving 공개 키인데 다른 단지 키로 합쳐짐 표시, 앱·프리렌더는 이 칸을 읽지 않음). **11/3 사용자 승인으로 NULL 처리**
  (백업 스크래치 `superseded_keys_backup_20261103.json`), 로컬 dry-run 통과(재사용 45,853·신규 0). 재발 방지(assign에서 갈라진 키 되살리기)는 미착수
- 다음: 전체 리허설 `41527953990`(아파트+학원) 결과 → 맞으면 `apply`(staging 최대 ~90 MB, 시작 391 MB) → 학원 갱신으로 `levels` 첫 반영

### D. 학교 주변 기관 셔틀·1학년 신호 (10-31~, 미커밋 일부)

- 계획 `docs/operations/ACADEMY_SIGNALS_PLAN.md`: 1 공개자료 → 2 운영자 입력 → 3 학원 자기등록 → 4 부모 확인(보류). **타 서비스 수집 안 함**.
  1단계 전국, 2단계는 파일럿 범위·공개 게시물만. 셔틀은 통학버스 등록현황(`889e420`, 7,670곳)으로 '통학차량 등록' 배지까지
- `etl/academy_levels.py`(lower/elem/preschool/secondary/adult) 마커 빌더 반영 `5029923`. 초등 표기 12.0%, 표기 없음 60.7%. 백필 안 함(11/2 실패로 아직 미반영)
- 다음: 표본 CSV 사람 검수(`review` 칸) → 화면 S1. 표본 CSV·`docs/research/academy-levels/`는 학원명 포함이라 커밋 여부 미정

### E. 하교 예상·돌봄 시간 (SQL 26, 파일럿 P2)

- 파일럿 298곳 중 하교 예상 235곳(10-21), 단서 없는 58곳은 학교 전화 후보(`p2_school_day_review_stage*_20261021.json`의 `unresolved`)
- `load_school_day_estimates.py`는 **전체 교체** — REVIEW_SETS에 없는 학교 행을 지운다. 세트 파일 없는 판으로 `--apply` 금지

## 사용자 몫·대기 중인 운영 변경

- SQL: `34_reclaim_database_space`(DB 한도, 1부 한 번 + VACUUM FULL 새벽), `37`(SEO 로봇 집계), `27`(소셜 링크), `33`(앞마당 — 익명 로그인·Turnstile·처리방침 먼저), `24`는 적용 보류
- DB 한도: 10-23 491.97/500 MB. 월간 실거래가 일정을 켜면 월 약 40 MB 증가 — 켜기 전 34 적용·요금제 판단
- 학구도 9월판은 사이트가 자동 다운로드를 막아 사용자가 브라우저로 `etl/data/hakgudo/20260920/`에 받아야 한다(`compare_school_zone_release.py`로 비교)
- 학교 문의: 방과후 확인 질문지(`etl/runtime/afterschool_checks/afterschool_school_questions_<날짜>.csv`), 하교 예상 58곳, 안현 표
- 콘텐츠: 학습 seed 3편 검수(`status: review`), 사립초 경기 일정(작년 일정일 수 있음)·교대부초 공식 발표 재확인, 돌봄 가이드는 2027 정책 뒤 재확인
- 검색: 서치어드바이저 수집 URL 확인·RSS·수집 요청, Search Console 사이트맵 재제출
- GA4 맞춤 측정기준 `entry_year`·`guide_id`. **2026-12-03 09:00 KST** 원격 루틴이 2027 일정 PR을 연다 — 검수 후 병합
- 돌봄 데이터 월 1회 `etl/collect_care_data.py --apply`(Windows 월간 작업에 편입됨, 10-07)

## 함정 모음

- **로컬 smoke는 3001(또는 3000)에서**(`npm run browser:smoke:public -- http://127.0.0.1:3001`). 다른 포트는 Naver 허용 호스트가 아니라 지도 검사에서 멈춘다.
  운영은 URL을 넘긴다. 작업 트리 smoke에 미배포 검사가 섞이면 `git show origin/release:elementary-v2/scripts/public-smoke.mjs > scripts/.smoke-release.tmp.mjs`로 돌리고 지운다
- vite dev 서버는 오래 켜 두면 응답이 멈춘다 — smoke 직전에 새로 띄운다. `vite preview`는 rewrite가 없어 smoke에 못 쓴다
- agent-browser: 프로젝트 사본이 스마트 앱 컨트롤에 막히면 전역 설치본, os error 10060이면 `--namespace` 세션.
  playwright는 의존성에 없다 — `CALENDAR_QA_PLAYWRIGHT`·`CALENDAR_QA_CHROME`을 넘겨 실행
- `morning-care-smoke`는 `docs/research/track-b-morning-care/*.png`를 덮어쓴다 — 돌린 뒤 `git checkout`
- 운영 smoke가 "은마" 검색 대기에서 멈추는 일이 있다(손으로는 정상, 원인 미확정)
- 이식성 읽기 전용 빌드는 이 PC의 `etl/runtime/apartment_supplement/apartment_base_supplement.csv` 때문에 약 360행이 늘어 기준선과 어긋난다 — 재잠금 때 잠시 치운다
- 지오코딩은 이 PC의 Windows 작업(`Elementary Local Monthly ETL`, 매월 1일 21:00) — VWorld가 해외 IP를 막고, 카카오는 결과 저장 금지. 그 무렵 PC가 켜져 있어야 한다
- 학원 갱신은 serving 전체 교체, 한 지역이라도 15% 넘게 줄면 쓰지 않는다. 과목 키워드는 스냅숏 전체에서 그 문자열이 든 이름부터 뽑아 본다(어학원·전문학원 함정)
- robots: 네이버 검색·블로그·NCIC는 AI 수집 금지, 서울 `sen.es.kr`은 첫 화면 밖 금지 — 링크만 둔다
- 돌봄센터 원본 JSON의 담당자 이름·이메일은 수집기가 즉시 버린다. 방과후 원문의 강사 이름·연락처는 옮기지 않는다
- 이 PC 콘솔은 cp949 — Python 출력은 `PYTHONIOENCODING=utf-8`. 한글을 REST 쿼리에 넣을 때는 퍼센트 인코딩

## Data Contract (요약)

공개 조회는 루트 `../CLAUDE.md`의 목록과 `docs/architecture/DATA_CONTRACTS.md`를 따른다(SQL 06~38 운영 적용 범위는 `sql/EXECUTION_GUIDE.md`).
`200 []`은 RLS가 걸러낸 것, `401`은 권한 없음, `404`는 테이블 없음. 운영 규모는 바뀌므로 판단 전에 다시 잰다.
11-03 실측: 학교 6,302 · 돌봄 공시 6,266 · 돌봄센터 1,502 · 돌봄 시간 2,014(공시 1,435 · 확인 필요 579) · 하교 예상 서울 284 · 경기 1,021 ·
방과후 683(서울 561 · 경기 122, 다른 시·도 0).

## ETL 운영

- 정기 실행: `.github/workflows/etl-recurring.yml` 매월 2일 03:15 KST(수동 실행 기본 `rehearse`), 입력 묶음 `etl/recurring_inputs_manifest.json`.
  실패하면 GitHub 이슈(라벨 `etl-failure`). 상세 `docs/operations/ETL_SCHEDULING.md`
- 학원: `etl/run_academy_refresh.py`(NEIS·체육도장 → 새 주소만 VWorld → 마커 → 근접도 → 운영 3테이블 전체 교체), 기관 키는 복합키
  (`교육청코드+지정번호`, `지자체코드+관리번호`)
- 신축 단지: 보충 파일 808곳을 월간 실행이 복원, 키 발급 `publish_apartment_public_keys.py`(`docs/operations/NEW_COMPLEX_INTAKE_PLAN.md`)
- 이식성: `etl/portable_inputs_manifest.json`, 기준선 `etl/portable_readonly_baseline.json`(행 수·SHA-256), 검사 워크플로 `.github/workflows/etl-portability-check.yml`
- 역 검색 P4는 KRIC 공식 원본 확보 전까지 보류(`docs/reference/STATION_SEARCH_SOURCE_PLAN.md`)

## Verification

```powershell
cd F:\sm\vibe\elementary\pjt_250826\elementary-v2
npm run lint; npm run typecheck; npm run build; npm run test:unit
npm run browser:smoke:public -- http://127.0.0.1:3001     # 운영은 https://wherecho.co.kr
python -m unittest etl.tests.test_afterschool_rules etl.tests.test_afterschool_slots etl.tests.test_load_school_afterschool etl.tests.test_afterschool_checks_sheet
python -m unittest etl.tests.test_portable_inputs etl.tests.test_station_profile
```

`npm test`는 없다. 마지막 기록(11-02): test:unit 140, 운영 public smoke 168 PASS(UX-13 배포 후), 방과후 ETL 테스트 43개 통과.

## 지난 기록 색인 (전문은 `git show db6e90f:CLAUDE.md`)

- 10-30 경기 우선 방과후 추출 83/83(`8c5bd2c`), 검사기 확장(교시 머리글·병합 시각 칸·요일 참조) · 10-29 추출 18→40, `merge_blocks`는 50분 이하 같은 학년만
- 10-28 시간표 smoke 정리, `activeSchoolId` 폐기(`8f207c4`) · 10-24 배움·돌봄 메뉴명, 네이버 SEO 감사(`docs/seo/`, 수정은 release `82657aa`)
- 10-23 Supabase 한도 실측·실거래가 `raw_payload` 비우기(`8b53857`) · 10-21~23 앞마당 1차본(`b2b31ce`)·관심 학원(`60ad9e7`)·시간표 탭 개편(`8e58b25`)
- 10-20 2.0 컨셉(`d1c9278`), 시간표 카드 정리(`e529774`) · 10-19 시간표 독립 화면(`e13633b`) · 10-18 파비콘·로고(`560faaf`) · 10-17 배정 0개·주차 이상치(`6eb2862`)
- 10-15 SEO·가이드 시즌(`00b9021`), 방과후 누락 보완·종류별 등급(`f8e3638`, 서울 536곳 첫 공개)
- 10-10~11 학교 홈페이지 링크·인스타 1단계(`c8da548`), 시·도 시트·허브 링크(`a269d25`), 광역시 학교명 접두(`ee90595`)
- 10-09 입학 준비 P1-04~06·학습 콘텐츠 틀 · 10-08 시간표 엔진 S01·S02, `/learn`(`129f87c`), 뒤로 가기로 시트 닫기(`e27c142`)
- 10-06~08 Audit 2(학교알리미 15-라·2-가, NEIS 교시, SQL 26 카드 `c27530f`, 파일럿 확대 `813aff3`)
- 10-07 SEO 허브·동별 등록 단지 묶음(`4e766df`), ETL 점검(실패 알림·학교알리미 연도 대체·신축 유입 `88528ef`)
- 10-06 학원 기관 키(`92e0b2e`), 학원 월간 갱신(`f905ac7`), 가이드 취소선·굵게 정리, 커리큘럼 화면 폐기
- 10-05 데스크톱 왼쪽 패널(`2418dc7`), 단지 일러스트, 학원 직업기술 제외·팝업 X(`d30bc8f`)
- 10-04 돌봄·방과후 공시와 돌봄센터(SQL 23, `9cf7ae5`)·후속, 모바일 위아래 띠(`6f96125`), 즐겨찾기 → MY(`2d036f0`), ETL 월 1회·Actions 이전
- 10-03 줌아웃 시·도 마커 복구(`1453663`), 학원 과목 분류(`5e588e9`)

## Documentation Map

진행 `docs/PROJECT_PROGRESS.html` · ETL 기준 `docs/operations/OPERATION_PLAN.md` · UX `docs/ux/FRONTEND_UX_SYSTEM_PLAN.md` ·
파일럿 ETL `docs/operations/PIVOT_PILOT_ETL.md` · 시간대 기준 `docs/operations/PIVOT_SLOT_STANDARD.md` · 릴리스 `docs/RELEASES.md` ·
배포 `docs/operations/DEPLOYMENT.md`. `F:\sm\vibe\elementary\archive`는 참고 전용(아파트 ETL 입력 2개는 예외 — 루트 CLAUDE.md).

## Security

- `.env` 실제 값을 출력·문서화·커밋하지 않는다. frontend는 anon key만, service role key는 ETL·Actions·관리 작업만
- Storage 원천 스냅숏은 비공개. 커밋 전 JWT 형태 문자열과 `etl/runtime/` 경로를 확인한다

## End Of Session

종료 전에 갱신한다: ① `git status --short`·최신 push·배포 여부 ② 끝낸 일과 다음 첫 작업 ③ 실행한 검증과 실패
④ SQL·외부 설정 변경 ⑤ 해당 기준 계획 문서. **새 기록은 '진행 중 작업'의 해당 절을 고쳐 쓰고**, 끝난 절은 색인 한 줄로 옮긴다 —
날짜별 절을 계속 쌓지 않는다(이 파일이 935줄까지 늘었다).
