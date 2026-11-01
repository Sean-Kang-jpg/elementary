# 우리집 일정 UX — Codex 분담과 주고받는 방식

작성 2026-11-01. 백로그 원본: `docs/product/UX_BACKLOG_PLAN_CENTERED.md`(ID는 그 문서와 같다).
저장소 규칙은 루트 `AGENTS.md`를 따른다. 이 문서는 그 위에 이번 작업의 분담만 더한다.

## 1. 역할

| 주체 | 맡는 것 | 하지 않는 것 |
| --- | --- | --- |
| 사용자(U) | 방향·문구 결정, 사실 확인(일정·발표일), 배포 승인 | — |
| Claude(K) | 상태·저장 형식을 바꾸는 일, 여러 화면에 걸친 구조(GNB·우리집 일정 탭), 기본안 규칙, Codex 작업 검토와 `master` 병합, `release` 배포 | 명세가 끝난 짧은 작업 |
| Codex(C) | 명세가 닫힌 짧은 작업(S·M): 이벤트, 순수 함수, 콘텐츠 스키마·빌드 검증, 단일 화면의 CTA·표시 | 저장 형식 변경, GNB·라우팅, `release` 푸시, 운영 DB 쓰기, 사실 문구 창작 |

## 2. Codex에 주는 작업의 기준

다음을 모두 만족할 때만 Codex로 보낸다.

1. 바꿀 파일이 카드에 적혀 있고, 그 밖의 파일은 거의 건드리지 않는다.
2. 완료 기준이 명령 실행이나 화면 한 곳에서 확인된다.
3. 저장 형식(`localStorage` 키와 그 구조)을 새로 만들거나 바꾸지 않는다. 필요하면 `src/utils/familyPlan.ts`의 함수를 부른다.
4. 화면 문구 중 사실(날짜·기관·제도)은 카드에 주어진 것만 쓴다. 없으면 `TODO(사실 확인)`으로 두고 멈춘다.

## 3. 주고받는 방식

### 브랜치와 작업 폴더

- `master` 작업 폴더에는 다른 세션의 미커밋 작업이 자주 있다. Codex는 **별도 worktree**에서 일한다.
  `git worktree add ../.worktrees/codex-ux-<ID> -b codex/ux-<ID>-<짧은이름> master`
- 한 카드 = 한 브랜치. 여러 카드를 한 브랜치에 섞지 않는다.
- 원격에 푸시한다(`origin codex/ux-…`). 과거에 Codex 브랜치가 미푸시로 남아 찾지 못한 일이 있었다.

### 넘겨줄 때 (Codex → Claude)

카드 아래 "결과" 칸을 채우고 커밋에 포함한다.

- 바꾼 파일 목록과 한 줄 요약
- 검증 명령의 실제 출력 요약: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, 화면이 있으면 `npm run browser:smoke:public -- http://127.0.0.1:3000`
- 확인 못 한 것, 막힌 것, 카드와 다르게 한 것과 그 이유

### 받을 때 (Claude)

1. 브랜치를 읽고 `/code-review`로 검토한다.
2. 고칠 것이 있으면 카드의 "검토" 칸에 적어 돌려보낸다. 작은 것은 Claude가 직접 고친다.
3. 통과하면 `master`에 병합하고 카드 상태를 `merged`로 바꾼다. 배포(`release`)는 사용자 승인 뒤 Claude가 묶어서 한다.

### 함께 고쳐야 하는 파일 쌍 (어기면 크롤러와 사람이 다른 화면을 본다)

- `src/utils/homeShelves.ts` ↔ `scripts/build-shell-pages.mjs`의 `seasonCards()`
- `src/content/home.json`·`home-shelves.json` → 둘 다 위 두 파일이 읽는다
- 새 이벤트 → `docs/product/MEASUREMENT_PLAN.md` 10절에 같이 등록. 기존 이벤트로 되는 것은 새로 만들지 않는다(9절 규칙)

### 동시에 건드리지 않을 파일

Claude가 UX-K0·UX-03·UX-26을 하는 동안 Codex는 아래를 바꾸지 않는다.
`src/utils/schedule/**`, `src/utils/familyPlan.ts`, `src/utils/profile.ts`, `src/utils/roadmap.ts`,
`src/components/navigation/MyPage.tsx`, `TimetablePage.tsx`, `BottomNavigation.tsx`, `src/utils/urlState.ts`.

## 4. 순서

| 차수 | Codex | Claude | 사용자 |
| --- | --- | --- | --- |
| 0 (지금) | C-01 이벤트, C-02 .ics, C-03 가이드 nextStep | UX-K0 API, UX-03 입학까지 v0 | 홈 제목·고민 문구, 추첨 결과 사실 |
| 1 | C-04 홈 고민 목록, C-05 홈 하단 정리, C-06 결과 이후 페이지 | 차수 0 검토·병합, 배포 | 배포 승인 |
| 2 (12월) | UX-07, UX-09, UX-10, UX-08d | UX-26 우리집 일정 탭, UX-06, UX-08c | 완료 표시·미뤄도 되는 것 내용 |
| 3 (1~2월) | UX-15, UX-16, UX-17 | UX-13 기본안, UX-14 칸 의도, UX-18 | 여백 이름 |

차수 2의 Codex 카드는 UX-K0 병합 뒤에 이 문서에 추가한다.

## 5. 작업 카드

상태: `ready`(바로 시작) · `blocked`(조건 대기) · `in-progress` · `review` · `merged`

---

### C-01 퍼널 이벤트 (UX-01) — `ready`, S

**목표**: 우리집 일정 퍼널을 셀 수 있게 이벤트를 더한다. 화면 배선은 이 카드에서 이벤트가 생길 자리에만 한다.

**바꿀 파일**: `src/utils/analytics.ts`, `docs/product/MEASUREMENT_PLAN.md`(10절 신설), `scripts/public-smoke.mjs`(디버그 기록 확인)

**명세**

| 이벤트 | 파라미터 | 보내는 때 |
| --- | --- | --- |
| `plan_start` | `from`(`guide`·`home_worry`·`school_detail`·`apartment_detail`·`result_page`), `content_id`(slug 또는 고민 id), `face`(`timeline`·`week`) | 일정을 처음 만들 때 (기기에 일정이 없다가 생길 때 한 번) |
| `plan_item_add` | `item_id`, `from` | 일정에 항목을 담을 때 |
| `ics_export` | `count` | .ics를 내려받을 때 |
| `plan_return` | `days_since`(정수) | 일정이 있는 사용자가 1일 이상 지나 다시 열 때, 세션당 한 번 |
| `home_worry_click` | `worry_id` | 홈 고민 항목을 누를 때 |

- `track()`을 감싼 타입 있는 함수로 둔다(예: `trackPlanStart(params)`). 자유 입력·주소는 싣지 않는다.
- `plan_start`·`plan_item_add`·`plan_return`의 실제 호출은 `familyPlan.ts`(Claude)가 한다. 이 카드는 함수만 만든다.

**완료 기준**: lint·typecheck·build 통과, MEASUREMENT_PLAN 10절에 표 추가, 디버그 모드(`wherecho:analytics-debug`)에서 `home_worry_click`이 기록된다(C-04 병합 뒤 smoke에 추가해도 됨).

**결과**: (Codex 작성)

**검토**: (Claude 작성)

---

### C-02 캘린더 파일 생성 (UX-04) — `ready`, S

**목표**: 일정 목록을 .ics 문자열로 만드는 순수 함수와 내려받기 버튼 컴포넌트.

**바꿀 파일**: `src/utils/ics.ts`(신규), `src/utils/ics.test.ts`(신규), `src/components/content/IcsButton.tsx`(신규)

**명세**

- 입력: `{ id: string; title: string; date: 'YYYY-MM-DD'; url: string; note?: string }[]`
- 하루 종일 일정(`DTSTART;VALUE=DATE`), `UID`는 `${id}@wherecho.co.kr`, `URL`과 설명 끝에 어디초 주소. 주소는 `SITE_ORIGIN` 규칙을 따른다(빌드 상수가 없으면 `https://wherecho.co.kr`).
- RFC 5545: CRLF 줄바꿈, 75옥텟 줄 접기, `,` `;` `\` 이스케이프. 한글 제목에서 접기가 UTF-8 바이트 중간을 자르지 않아야 한다.
- 버튼은 Blob으로 내려받고 `trackIcsExport`(C-01)를 부른다. C-01이 아직 없으면 `track('ics_export', …)`로 두고 결과 칸에 적는다.
- 어디에 붙일지는 이 카드의 범위 밖이다(UX-03에서 Claude가 붙인다).

**완료 기준**: `npm run test:unit`에 이스케이프·줄 접기·한글 접기·날짜 형식 테스트. 생성 파일을 구글 캘린더 가져오기로 열어 본 결과(스크린샷 또는 문장)를 결과 칸에.

**결과**: 

**검토**: 

---

### C-03 가이드별 다음 한 걸음 (UX-02, UX-08b 일부) — `ready`, M

**목표**: 모든 가이드 끝에 그 가이드에 맞는 CTA 하나를 둔다.

**바꿀 파일**: `scripts/build-content.mjs`, `src/content/guides/*.md`(front matter만), `src/components/content/NextStep.tsx`(신규), `GuidePage.tsx`, `scripts/build-shell-pages.mjs`(정적 가이드 페이지에도 같은 블록)

**명세**

- front matter: `nextStep: { label: string, href: string, kind: 'plan' | 'school' | 'guide' }`
- 빌드 검증: 없으면 실패, `href`가 `/guide/{slug}`이면 그 가이드가 있어야 함, `label` 30자 이하.
- `ChecklistBanner`는 지우지 않고 `nextStep` 아래로 내린다(체크리스트 진행률은 유지).
- 클릭 시 `markEntry('guides')` 후 이동.
- 가이드별 값(초안, 사용자 확인 전):

| 가이드 | label | href |
| --- | --- | --- |
| private-national | 우리 집 입학 일정 만들기 | `/timetable?face=timeline` |
| school-notice | 통지서에 적힌 학교 찾기 | `/map` (검색 열림) |
| move-before-notice, move-after-notice, move-after-call, when-to-move | 이사 갈 집 배정 학교 찾기 | `/map` |
| care-afterschool, morning-care | 우리 학교 돌봄 공백 계산하기 | `/timetable` |
| first-weeks | 첫 주 하교 시각, 우리 학교로 보기 | `/timetable` |
| preliminary-call, delay-or-early-entry, admission-timeline | 우리 집 입학 일정 만들기 | `/timetable?face=timeline` |
| check-school-zone, compare-schools | 학교 찾기 | `/map` |

- `face=timeline` 파라미터는 UX-03 전까지 `/timetable`이 무시해도 된다. `urlState.ts`는 건드리지 않는다.

**완료 기준**: 빌드 검증이 누락 가이드를 잡는지 한 번 일부러 깨 보고 결과 칸에 적기. 앱 가이드와 정적 가이드 HTML 둘 다에 블록이 보임.

**결과**: 

**검토**: 

---

### C-04 홈을 고민 목록으로 (UX-08, UX-08a, UX-08b) — `blocked`(사용자 문구), M

**목표**: 홈 첫 화면을 질문형 제목 + 시기별 고민 4~6개로 바꾼다. 검색창은 고민 목록 아래로.

**바꿀 파일**: `src/content/home.json`, `src/content/home-shelves.json`, `src/utils/homeShelves.ts`, `homeShelves.test.ts`, `scripts/build-shell-pages.mjs`, `src/components/navigation/HomePage.tsx`, `HomeShelves.tsx`, `src/styles/home-shelves.css`

**명세**

- `home-shelves.json`의 `season` → `worries`. 항목에 `question`(부모의 말투), `href`, 기존 `from`·`to`·`deadline`·`newUntil` 유지, `title`·`body`는 `question`·`hint`로.
- 첫 항목은 항상 "우리 아이 배정 학교가 궁금해요" → 검색창 포커스(날짜 창 없음).
- 누르면 `trackHomeWorryClick`(C-01), `markEntry('home')`.
- 빌드 검증(UX-08b): 고민의 `href`가 있는 경로인지, 가이드면 `nextStep`이 있는지(C-03 병합 뒤).
- 일정이 있는 사용자 카드(UX-08c)는 범위 밖. `RoadmapSummary` 자리는 그대로 둔다.

**막힌 이유**: 홈 제목·설명, 11~12월 고민 문구를 사용자가 정해야 한다.

**완료 기준**: `homeShelves.test.ts` 갱신 통과, 정적 `dist/index.html`과 앱 홈이 같은 고민 목록, 390px에서 첫 화면에 제목과 고민 3개 이상.

**결과**: 

**검토**: 

---

### C-05 홈 하단 정리 (UX-12) — `blocked`(C-04), S

**목표**: 지도·지역·학습 카드를 한 줄 보조 링크로 내리고 예시 학교 영역 제목을 "일정 예시"로.

**바꿀 파일**: `HomePage.tsx`, `src/content/home.json`, `build-shell-pages.mjs`, 관련 CSS

**완료 기준**: 첫 화면 스크롤 안의 큰 카드형 CTA는 고민 목록 하나. 정적 홈과 앱 홈이 같음.

**결과**: 

**검토**: 

---

### C-06 추첨 결과 이후 가이드 두 편 (UX-05) — `blocked`(사용자 사실 확인), M

**목표**: `/guide/private-result-pass`, `/guide/private-result-public` 두 편.

**바꿀 파일**: `src/content/guides/`(신규 2편), `home-shelves.json`(결과 발표일 창)

**명세**: 기존 가이드 형식(출처·`verifiedAt`·80자 이내 설명, `nextStep`). 사실 문장은 사용자가 준 메모에 있는 것만. "안 됐다면" 편의 `nextStep`은 배정 학교 찾기 → 일정.

**막힌 이유**: 2027학년도 지역별 추첨·결과 발표일과 등록 절차의 출처를 사용자가 확인해 줘야 한다.

**결과**: 

**검토**: 
