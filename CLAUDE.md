# Session Init: Elementary Map

새 작업 세션에서 프로젝트 상태를 빠르게 복원하기 위한 인수인계 문서다.
세부 상태는 이 파일보다 `elementary-v2/docs/operations/OPERATION_PLAN.md`와
`elementary-v2/docs/ux/FRONTEND_UX_SYSTEM_PLAN.md`를 우선한다.

## Start Here

- Git root: `F:\sm\vibe\elementary\pjt_250826`
- Active app: `F:\sm\vibe\elementary\pjt_250826\elementary-v2`
- Stack: React 18, TypeScript, Vite, Tailwind CSS, Supabase, Naver Maps
- Branch: `master` (작업), `release` (운영 배포. push가 곧 운영 배포다)
- Last pushed baseline (2026-10-04): 운영 `release` `f75f3cf` = master `9cf7ae5`의 트리.
  돌봄(SQL `23`)과 데이터 기준일 표시(SQL `22`)가 함께 나갔다. 두 SQL 모두 운영 적용 확인
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

### 2026-10-05: 1학년 미리보기 (master, 플래그 뒤 — 운영 노출 안 됨)

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
