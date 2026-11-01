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
| 2 (12월) | C-07 학교로 일정 만들기, C-08 내 일정에 넣기, C-09 퍼널 정의 | UX-26 우리집 일정 탭, UX-06, UX-08c, UX-10 완료 표시 | 완료 표시·미뤄도 되는 것 내용 |
| 3 (1~2월) | UX-15, UX-16, UX-17 | UX-13 기본안, UX-14 칸 의도, UX-18 | 여백 이름 |

차수 2 카드(C-07~C-09)는 UX-K0·UX-03 병합 뒤인 2026-11-01에 추가했다. UX-10(완료 표시)은 입학까지 카드가 UX-26에서 옮겨 간 뒤 Claude가 한다 — 지금 `RoadmapCard.tsx`가 체크와 D-day를 이미 갖고 있어 Codex 카드로 나누면 같은 파일을 두 번 고치게 된다.

### 우리집 일정 API (`src/utils/familyPlan.ts`, UX-K0)

화면은 저장 키를 직접 읽거나 쓰지 않고 아래 함수만 부른다. 이 파일은 Claude 몫이라 Codex는 고치지 않는다 — 필요한 함수가 없으면 결과 칸에 적는다.

| 함수 | 쓰는 곳 |
| --- | --- |
| `hasFamilyPlan()` | 홈 두 갈래(UX-08c), CTA 문구 분기 |
| `startFamilyPlan({ from, face, contentId })` | 일정을 여는 CTA. 처음일 때만 `plan_start` |
| `addToPlan({ id, title, href, when }, { from, contentId })` → `boolean` | "내 일정에 넣기"(UX-09). 실패하면 false — 담겼다고 보이지 말 것. 처음 담을 때만 `plan_item_add` |
| `isInPlan(id)`, `removeFromPlan(id)` | 담기 버튼의 ✓ 상태 |
| `readTimeline(now?, profile?)` → `TimelineEntry[]` | 입학까지 면, 완료 표시(UX-10). 로드맵 + 담은 항목, 날짜순. 시행령 날짜가 있는 할 일(`roadmap.json`의 `due`)은 날짜 항목 |
| `groupTimeline(entries)`, `daysUntil(when)` | 달별 묶음(지난 날짜는 이번 달에), D-day. 입학까지 면의 `RoadmapCard`가 쓰는 모양(UX-03) |
| `setTimelineDone(id, done)` | 완료 체크. 체크리스트와 같은 저장값. 체크할 때 `check_checklist_item`(`category: 'roadmap'`) |
| `notePlanVisit()` | 우리집 일정·홈 일정 카드가 열릴 때. `plan_return` |
| `subscribeFamilyPlan(listener)` | 담은 항목·프로필·시간표 초안이 바뀔 때 |
| `nextDateOf('MM-DD')` | 홈 선반의 `deadline`을 `when: { kind: 'date' }`로 바꿀 때 |
| `dueBadge(when)`, `describeProgress(entries, planning?)` | D-day 배지, "이번 달 챙길 것 N개 중 M개 ✓"(UX-10). 같은 말을 새로 짓지 말 것 |
| `planCoverage(entries)`, `describeCoverage(c)` (`schedule/coverage.ts`) | 한 주의 빈 시간(하교~19시). "평일 19시까지 빈 시간 없음 ✓"은 엔진 공백이 0일 때만. 하교를 모르면 판단하지 않는다 |

`when`은 `{ kind: 'date', date: 'YYYY-MM-DD' }` · `{ kind: 'month', month }` · `{ kind: 'anytime' }`. `from`은 C-01 표의 값에 `home`·`timetable`·`my`가 더해진다(입학연도를 처음 고른 화면, UX-03). 체크리스트 저장값에 로드맵 할 일의 완료도 들어가므로, 체크리스트 진행률은 `checklist.json`의 id만 센다.
`plan_start`·`plan_item_add`·`plan_return`은 C-01의 타입 있는 함수로 보낸다(2026-11-01 병합).

**우리집 일정으로 가는 주소 (UX-26, 2026-11-01).** 화면은 `/timetable` 하나에 두 면이다. 주소는 `urlState.ts`의 함수로만 만든다.

| 주소 | 함수 | 열리는 것 |
| --- | --- | --- |
| `/timetable?face=timeline` | `planPath('timeline')` | 입학까지: 입학연도 → 로드맵·D-day·완료 체크 |
| `/timetable?face=week` | `planPath('week')` | 우리 아이 한 주: 가장 최근 초안 → 첫 관심 학교 → 학교 고르기 |
| `/timetable?school=B…` | `timetablePath(id)` | 그 학교의 한 주. 학교가 있으면 언제나 한 주 면 |
| `/timetable` | — | 입학까지. 입학연도 없이 시간표만 있으면 한 주. CTA에는 쓰지 말 것 |

MY(`/my`)에는 프로필·관심 후보·저장 학원만 남았다(UX-06). 입학까지 카드와 체크리스트 진행률을 MY로 보내는 링크는 만들지 않는다.

## 5. 작업 카드

상태: `ready`(바로 시작) · `blocked`(조건 대기) · `in-progress` · `review` · `merged`

---

### C-01 퍼널 이벤트 (UX-01) — `merged`, S

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

**결과** (Codex, 2026-11-01)

- 브랜치 `codex/ux-C-01`, 독립 worktree `F:/sm/vibe/elementary/.worktrees/codex-ux-C-01`. Claude가 커밋한 문서 기준점 `75dd2e7` 위에서 작업했다.
- 변경 파일: `src/utils/analytics.ts` — 객체 입력의 타입 있는 함수 5개, 명시한 필드만 전송, 정수 범위 검사. `docs/product/MEASUREMENT_PLAN.md` — 10절 이벤트·호출 책임·검증 범위. `scripts/public-smoke.mjs` — 로컬 Vite 디버그 기록의 정확한 payload와 숫자 경계 검사(운영/preview에서는 소스 모듈 검증 생략). 이 문서 — C-01 결과와 별도 C-03 사전 검토 기록.
- `npm run lint`: exit 0, 경고 없음.
- `npm run typecheck`: exit 0, 콘텐츠 14 guides / 31 FAQ 검증 후 타입 검사 통과.
- `npm run test:unit`: exit 0, tests 113 / suites 25 / pass 113 / fail 0.
- `npm run build`: 네트워크 제한 환경에서는 sitemap fetch 실패(exit 1), 네트워크 접근 가능한 환경의 재실행은 exit 0. Vite 1,800 modules, 가이드 14편, 학교 6,302 / 아파트 45,699 URL, sitemap 8개 생성. 기존 브라우저 데이터 갱신 안내와 500 kB 초과 청크 경고 있음.
- 추가 Node 직접 검증: `node --input-type=module -e ...`로 실제 analytics.ts의 타입을 제거해 읽고 debug 초기화 후 5개 이벤트 전체 payload를 deepEqual 검증. 추가 필드 제외, count=0 허용, 음수·소수·NaN·Infinity 및 days_since=0 거부 확인, PASS. `node --check scripts/public-smoke.mjs`와 `git diff --check` 통과.
- `npm run browser:smoke:public -- http://127.0.0.1:3010`: exit 1. 정적 HTML·이미지·주소 origin·지도 마운트·390px 레이아웃·지역 데이터 로드 검사는 통과했으나 기존 지도 축소 검사에서 `zooming out replaces the district markers with province markers — still not true after 15000ms and 35 checks`로 중단됐다(`scripts/public-smoke.mjs:408`). C-01 검증 블록까지 도달하지 못했으며 이 지도 동작은 수정 범위 밖이다. 최초 3000 연결은 EACCES/ETIMEDOUT이었고 별도 3010 서버를 사용했다. 전체 smoke 통과는 통합 전 남은 검증 블로커다.
- 분리한 브라우저 검증: 임시 실행기 `node .c01-debug-check.mjs`가 public smoke의 C-01 검증 블록을 그대로 읽어 로컬 학습 페이지에서 실행, exit 0. 출력 `PASS: C-01 helpers record exact debug payloads and reject invalid numbers (not UI wiring)`, `PASS: no GA transmission; debug flag removed`. `home_worry_click` 포함 5개 기록을 확인했고 브라우저도 닫았다. 첫 시도에서 Vite HMR의 별도 모듈 인스턴스가 초기화되지 않은 문제를 확인해 검증 블록에 `initAnalytics()`를 추가한 뒤 통과했다. 임시 실행기는 삭제하며 검증 코드는 public smoke에 남긴다.
- 통합 대기: `plan_start`·`plan_item_add`·`plan_return` 호출 및 중복 방지는 Claude의 `familyPlan.ts`, 내보내기는 C-02, 실제 홈 고민 클릭은 C-04에서 연결한다. 이번 검증은 함수 계약 검증이며 실제 UI 퍼널 완료를 뜻하지 않는다. 카드가 허용한 대로 실제 `home_worry_click` 클릭 smoke는 C-04 뒤 추가한다.
- Claude 소유 파일, 저장 형식·키·`familyPlan.ts` 계약은 변경하지 않았다. master 병합·release 푸시·운영 DB 쓰기는 수행하지 않는다. C-03 초안은 아래 사전 검토만 기록했으며 문구 확정·구현은 하지 않았다.

**검토** (Claude, 2026-11-01): 병합.

- 고친 것: `analytics.ts`가 `PlanSource`를 따로 정의해 UX-03의 `home`·`my`·`timetable`이 빠져 있었다 — `familyPlanCore.ts`의 정의를 가져다 쓰게 바꿨다(한 곳에서만 정한다). `content_id`는 선택값으로(입학연도 선택은 콘텐츠가 없다).
- `familyPlan.ts`의 `track()` 직접 호출 셋을 `trackPlanStart`·`trackPlanItemAdd`·`trackPlanReturn`으로 교체. `days_since >= 1` 거르기는 `trackPlanReturn`이 맡는다.
- smoke의 지도 축소 실패는 포트 문제로 본다: 같은 검사가 3001에서는 통과한다(Naver Maps 허용 호스트). 로컬 smoke는 3001(기본값)에서 돌릴 것.


---

### C-02 캘린더 파일 생성 (UX-04) — `merged`, S

**목표**: 일정 목록을 .ics 문자열로 만드는 순수 함수와 내려받기 버튼 컴포넌트.

**바꿀 파일**: `src/utils/ics.ts`(신규), `src/utils/ics.test.ts`(신규), `src/components/content/IcsButton.tsx`(신규)

**명세**

- 입력: `{ id: string; title: string; date: 'YYYY-MM-DD'; url: string; note?: string }[]`
- 하루 종일 일정(`DTSTART;VALUE=DATE`), `UID`는 `${id}@wherecho.co.kr`, `URL`과 설명 끝에 어디초 주소. 주소는 `SITE_ORIGIN` 규칙을 따른다(빌드 상수가 없으면 `https://wherecho.co.kr`).
- RFC 5545: CRLF 줄바꿈, 75옥텟 줄 접기, `,` `;` `\` 이스케이프. 한글 제목에서 접기가 UTF-8 바이트 중간을 자르지 않아야 한다.
- 버튼은 Blob으로 내려받고 `trackIcsExport`(C-01)를 부른다. C-01이 아직 없으면 `track('ics_export', …)`로 두고 결과 칸에 적는다.
- 어디에 붙일지는 이 카드의 범위 밖이다(UX-03에서 Claude가 붙인다).

**완료 기준**: `npm run test:unit`에 이스케이프·줄 접기·한글 접기·날짜 형식 테스트. 생성 파일을 구글 캘린더 가져오기로 열어 본 결과(스크린샷 또는 문장)를 결과 칸에.

**결과** (Codex, 2026-11-01)

- 독립 worktree `F:/sm/vibe/elementary/.worktrees/codex-ux-C-02`, 브랜치 `codex/ux-C-02`, 기준 커밋 `043a73d`(master의 UX-K0). master 작업 폴더는 수정하지 않았다.
- 변경 파일: `src/utils/ics.ts` — 순수 함수 `createIcs(items, { generatedAt: Date, siteOrigin?: string })`, `IcsItem`·`IcsOptions` 타입. 시각은 호출자가 넘겨 동일 입력에 같은 출력을 만든다. 종일 날짜·고정 UID·UTC DTSTAMP·CRLF·75옥텟 UTF-8 접기·TEXT 이스케이프를 지원한다. 잘못된 날짜·중복 ID·외부 URL은 오류로 처리한다.
- `src/utils/ics.test.ts` — 신규 테스트 9개. 이스케이프, 속성 주입 방지, ASCII 경계·한글·이모지 접기, 윤년·실제 날짜·형식, 타임존 독립성, URL·origin, 빈 입력·중복 ID·불변성을 검증한다.
- `src/components/content/IcsButton.tsx` — `items`, 선택 `className`·`siteOrigin`을 받는 미연결 버튼. Blob 다운로드, 빈 일정 비활성화, 실패 안내, 임시 링크 제거·Object URL 지연 해제. 공개 origin은 명시한 prop → 빌드에서 찍은 canonical → `VITE_SITE_ORIGIN` → `https://wherecho.co.kr` 순이다. `SITE_ORIGIN`만 지정한 빌드도 canonical을 통해 반영된다.
- C-01은 이 브랜치의 master 기준에 아직 없으므로 카드가 허용한 `track('ics_export', { count: items.length })`를 사용했다. C-01 병합 뒤 Claude가 `trackIcsExport({ count })`로 바꾸면 된다. 이 브랜치에 C-01 변경은 섞지 않았다.
- `node --test src/utils/ics.test.ts`: exit 0, tests 9 / pass 9 / fail 0.
- `npm run test:unit`: exit 0, tests 130 / suites 28 / pass 130 / fail 0(기준 master의 UX-K0 테스트 포함).
- `npm run lint`: exit 0, 경고 없음. 임시 검증 화면 제거 후 최종 파일로 재검증했다. `git diff --check`도 통과했다.
- `npm run typecheck`: exit 0. 처음 드러난 `ImportMeta.env` 타입 오류는 저장소의 기존 타입 단언 패턴으로 수정한 뒤 재검증했다.
- `npm run build`: exit 0. Vite 1,800 modules, 정적 가이드 14편, 학교 6,302·아파트 45,699 URL, sitemap 8개 생성. 기존 브라우저 데이터 갱신 안내와 500 kB 초과 청크 경고가 있다.
- 실제 다운로드: 임시 로컬 화면 `http://127.0.0.1:3042/.c02-harness.html`에서 버튼을 눌러 `wherecho-plan.ics`(929 bytes)를 내려받았다. 브라우저의 다운로드 완료 대기 도구는 응답이 멈췄으나, 이후 실제 내려받은 파일의 전체 내용을 DTSTAMP를 제외하고 `createIcs` 예상 출력과 비교해 일치함을 확인했다. 2020-01-02 종일 날짜·한글·이스케이프·각 행 75옥텟 제한도 통과했다. 참고 파일 `F:/sm/vibe/elementary/.artifacts/ux-C-02/wherecho-downloaded.ics`(커밋 제외).
- 버튼 추가 검증: 임시 실행기로 실제 컴포넌트를 변환해 DOM·hook·analytics를 대역으로 두고 실행, exit 0. Blob MIME/내용·파일명·클릭·`count=1`·링크 제거·URL 지연 해제·빈 목록 disabled·잘못된 날짜/클릭 실패 시 이벤트 미기록을 확인했다. 이는 모의 환경 검증이며 실제 GA 전송 검증은 아니다. 임시 화면·실행기는 제거했다.
- Google 캘린더 가져오기: **미수행**. 생성한 검증 파일을 실제 계정에 가져오는 단계에 대해 사용자가 “외부 계정 변경 없이 검증”을 선택했다. 가져오기 화면까지 확인했으며 Google에는 파일 업로드·일정 생성·삭제를 하지 않았다. Google/Apple 가져오기 성공으로 보고하지 않는다. 이 수동 호환성 검증은 Claude 인수 후 필요하면 별도로 진행한다.
- `npm run browser:smoke:public -- http://127.0.0.1:3042`: exit 1. 정적 홈·이미지·origin·지도 마운트·390px 레이아웃·지역 데이터 로드 검사는 통과했으나 `scripts/public-smoke.mjs:408`의 `zooming out replaces the district markers with province markers — still not true after 15000ms and 37 checks`로 중단됐다. C-01에서 본 것과 같은 검사 실패이며, 이 카드에서 지도·smoke 코드를 고치지 않았다. 전체 smoke 통과는 남은 검증 블로커다.
- 화면 연결·저장 형식·Claude 소유 파일·`familyPlan.ts` 계약은 변경하지 않았다. master 병합·release 배포·운영 DB 쓰기는 하지 않는다.

**검토** (Claude, 2026-11-01): 병합.

- `ics.ts`·테스트는 그대로 받았다(75옥텟 줄 접기, 이스케이프, 실제 날짜 검증, 같은 출처 URL).
- `IcsButton`의 `track()` 대체 호출을 `trackIcsExport`로 바꿨다(C-01 병합됨).
- MY 입학까지 카드(`RoadmapCard`)에 붙였다. 내보내는 것은 날짜가 정해진, 지나지 않고 끝내지 않은 일정만 — 달만 아는 할 일을 1일로 적으면 틀린 날짜가 된다. 링크가 없는 항목은 `/my`. 디버그 기록으로 `ics_export { count: 3 }` 확인.
- 안내 문구에 "알림을 받을 수 있어요"를 쓰지 않았다: 파일에 VALARM이 없어 알림은 캘린더 앱 설정에 달려 있다.
- 남은 것: 구글·애플 캘린더 실제 가져오기는 아직 아무도 하지 않았다. 사용자가 휴대폰에서 한 번 열어 보면 끝난다.
- smoke 지도 축소 실패는 C-01과 같은 포트 문제다(3001에서 전체 115개 통과).

---

### C-03 가이드별 다음 한 걸음 (UX-02, UX-08b 일부) — `merged`, M

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

**C-03 별도 사전 검토 (Codex, 2026-11-01 — 문구 미승인, 구현 없음)**

- 초안 표는 현재 가이드 14편을 모두 포함한다. 제안 label은 모두 30자 이하다. front matter·화면 문구는 변경하지 않았다.
- `school-notice`의 초안은 학교 찾기까지, 백로그 4절은 학교 상세의 하교·돌봄 확인까지 약속한다. 사용자에게 어느 단계를 CTA에 담을지 확인한 뒤 확정해야 한다.
- `/map` 자체에는 검색 열림을 표현하는 경로 계약이 없다(`src/utils/urlState.ts`). 특히 `school-notice`의 “검색 열림”은 이동만으로 보장되는지 C-03에서 확인이 필요하다. 이 카드에서 라우팅을 바꾸지 않는다.
- `care-afterschool`·`morning-care`의 “돌봄 공백 계산”, `first-weeks`의 “첫 주”는 모두 일반 `/timetable`로 향한다. 현재 `TimetablePage.tsx`는 학교 선택 → 공개 운영 자료 → 초안 흐름이므로, 자동 계산·첫 주 모드를 약속할 수 있는지 Claude 통합 작업과 대조해야 한다.
- `face=timeline`은 현재 무시되도록 허용된 과도기다. 일정 만들기 CTA를 공개할 때 UX-03 준비 여부를 확인해야 한다. 문구 확정과 C-03 구현은 사용자 승인 후 별도 브랜치에서 수행한다.

- `face=timeline` 파라미터는 UX-03 전까지 `/timetable`이 무시해도 된다. `urlState.ts`는 건드리지 않는다.

**완료 기준**: 빌드 검증이 누락 가이드를 잡는지 한 번 일부러 깨 보고 결과 칸에 적기. 앱 가이드와 정적 가이드 HTML 둘 다에 블록이 보임.

**결과** (진행 중, Codex, 2026-11-01)

- 독립 worktree `F:/sm/vibe/elementary/.worktrees/codex-ux-C-03`, 브랜치 `codex/ux-C-03`, 기준 `414382a`.
- 준비한 파일: `scripts/build-content.mjs`(필수 nextStep·label 30자·kind·내부 경로·가이드 존재 검증), `scripts/build-shell-pages.mjs`(같은 CTA와 하단 체크리스트 링크), `src/components/content/NextStep.tsx`(신규), `GuidePage.tsx`(체크리스트 앞에 연결). 추가 타입 선언만 `src/content/index.ts`에 반영했다. 저장 형식과 Claude 소유 파일은 변경하지 않았다.
- `npm run lint`: exit 0, 경고 없음. `node --check scripts/build-content.mjs`, `node --check scripts/build-shell-pages.mjs`, `git diff --check` 통과. `npm run test:unit`: tests 123 / suites 27 / pass 123 / fail 0.
- `npm run content`: 예상한 exit 1, 가이드 14편의 `front matter needs nextStep with label, href and kind`를 모두 확인했다. 문구 미승인 상태라 front matter를 추가하지 않았으며, 전체 typecheck·build·화면 검증은 승인 뒤 수행해야 한다.
- 최초 사용자 요청의 “승인 전에는 문구를 독자적으로 확정하지 않는다”와 카드의 “초안, 사용자 확인 전”을 따라 CTA 문구·도착지 승인을 요청했다. 현재 `/timetable`의 입학까지·첫 주 전용 동작, `/map` 검색 열림, 돌봄 공백 계산 약속은 승인 전에 검토할 사항이다.
- 아직 완료 또는 검토 요청 상태가 아니며 커밋·push하지 않았다. 승인 뒤 가이드 14편 front matter 적용, 누락·잘못된 링크·길이 검증, 앱/정적 HTML 확인, 전체 필수 검증과 결과 갱신 후 push한다.

**검토** (Claude, 2026-11-01): Codex가 토큰 만료로 멈춘 상태(front matter까지 적용, 미커밋)를 이어받아 병합.

- 도착지 수정: "우리 집 입학 일정 만들기" 4편의 `/timetable?face=timeline` → `/my`. `face`는 아직 무시되어 한 주 시간표가 열렸다 — 입학까지 카드는 UX-26 전까지 MY에 있다. UX-26에서 다시 바꾼다. → 2026-11-01 UX-26에서 `/timetable?face=timeline`으로 되돌렸다.
- 문구 수정(없는 기능을 약속하지 않게): "우리 학교 돌봄 공백 계산하기" → "우리 학교 하교·돌봄 시간으로 한 주 짜보기"(care-afterschool, morning-care), "첫 주 하교 시각, 우리 학교로 보기" → "우리 학교 하교 시각으로 한 주 짜보기"(first-weeks). 시간표에는 공백 계산·첫 주 모드가 없다.
- 확인: 앱에서 private-national CTA → `/my`(입학연도 칩 3개), school-notice CTA → `/map` 검색창 포커스. 정적 `dist/guide/*/index.html`에 같은 CTA. lint·typecheck·build·test:unit 132·public smoke 115(3001) 통과.
- 문구 14개는 사용자 확인 대상으로 남긴다(handoff 초안 표 + 위 수정). 바꾸려면 front matter의 `nextStep.label`만 고치면 된다.
- Codex 임시 실행기 `.c03-check.mjs`·`.c03-interaction.mjs`는 커밋하지 않았다(worktree에 미추적으로 남음).

---

### C-04 홈을 고민 목록으로 (UX-08, UX-08a, UX-08b) — `blocked`(사용자 문구), M

**목표**: 홈 첫 화면을 질문형 제목 + 시기별 고민 4~6개로 바꾼다. 검색창은 고민 목록 아래로.

**바꿀 파일**: `src/content/home.json`, `src/content/home-shelves.json`, `src/utils/homeShelves.ts`, `homeShelves.test.ts`, `scripts/build-shell-pages.mjs`, `src/components/navigation/HomePage.tsx`, `HomeShelves.tsx`, `src/styles/home-shelves.css`

**명세**

- `home-shelves.json`의 `season` → `worries`. 항목에 `question`(부모의 말투), `href`, 기존 `from`·`to`·`deadline`·`newUntil` 유지, `title`·`body`는 `question`·`hint`로.
- 첫 항목은 항상 "우리 아이 배정 학교가 궁금해요" → 검색창 포커스(날짜 창 없음).
- 누르면 `trackHomeWorryClick`(C-01), `markEntry('home')`.
- 빌드 검증(UX-08b): 고민의 `href`가 있는 경로인지, 가이드면 `nextStep`이 있는지(C-03 병합 뒤).
- 일정이 있는 사용자 카드(UX-08c)는 2026-11-01에 들어갔다: `PlanSummary`(옛 `RoadmapSummary`)가 `HomeShelves` 바로 위에 있다. 고민 목록으로 바꿔도 이 카드는 목록 위에 둔다. 담은 고민의 ✓는 C-08의 `AddToPlanButton`이 맡는다.
- C-08에서 추가한 `planId`와 `AddToPlanButton`은 `season`을 `worries`로 바꿀 때 그대로 옮긴다. notice·delay의 로드맵 ID를 유지하고, 버튼을 링크 안에 넣지 않는다.

**막힌 이유**: 홈 제목·설명, 11~12월 고민 문구를 사용자가 정해야 한다.

**완료 기준**: `homeShelves.test.ts` 갱신 통과, 정적 `dist/index.html`과 앱 홈이 같은 고민 목록, 390px에서 첫 화면에 제목과 고민 3개 이상.

**결과**: 

**검토**: 

---

### C-05 홈 하단 정리 (UX-12) — `blocked`(C-04), S

**목표**: 지도·지역·학습 카드를 한 줄 보조 링크로 내리고 예시 학교 영역 제목을 "일정 예시"로. 일정이 있는 가족에게는 `HomeShelves`의 `.timetable-banner`(시간표 미리 짜보기)를 숨긴다 — 위의 `PlanSummary`에 같은 길("우리 아이 한 주")이 있다(`hasFamilyPlan()`).

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

---

### C-07 이 학교로 일정 만들기 (UX-07) — `ready`, S

**목표**: 학교·아파트 상세에서 한 번 눌러 그 학교의 한 주 초안으로 간다. 초안 채우기(하교·돌봄·방과후)는 `TimetablePage.tsx`가 `?school=`로 이미 한다 — 이 카드는 입구와 이벤트만.

**바꿀 파일**: `src/components/school/SchoolDayEstimateCard.tsx`, `src/components/apartment/ApartmentDetail.tsx`, `scripts/public-smoke.mjs`

**명세**

- 학교 상세: `data-testid="school-day-plan-link"` 링크의 문구를 "이 학교로 우리 아이 한 주 만들기"로. testid·`timetablePath(school_id)`는 그대로.
- 누를 때 이동 전에 `startFamilyPlan({ from: 'school_detail', face: 'week', contentId: school_id })`.
- 아파트 상세: 배정 학교 영역 아래 같은 모양의 링크 하나(`timetable-cta`). `apartment.assigned_school_id`가 있을 때만. `from: 'apartment_detail'`, `contentId`는 그 학교 id. 배정이 둘 이상(`assigned_schools`)이면 `assignment_rank`가 가장 작은 학교.
- 주소·단지명은 `contentId`에 넣지 않는다.

**완료 기준**: lint·typecheck·build·public smoke(3001) 통과. smoke의 학교 상세 단계에서 링크를 누르면 `/timetable?school=`로 가고, 디버그 기록에 `plan_start`가 `from: 'school_detail'`로 한 번 남는다(이미 일정이 있는 세션이면 남지 않는 게 맞다 — smoke는 저장값을 비운 뒤 확인).

**결과**: 

**검토**: 

---

### C-08 내 일정에 넣기 (UX-09) — `review`, S

**목표**: 홈 "지금 챙길 것" 카드마다 "내 일정에 넣기". 담은 항목은 우리집 일정 입학까지 면(`/timetable?face=timeline`)의 해당 달에 보인다(UX-03, UX-26).

**바꿀 파일**: 신규 `src/components/content/AddToPlanButton.tsx`, `src/components/navigation/HomeShelves.tsx`, `src/content/home-shelves.json`, `src/styles/home-shelves.css`, `scripts/public-smoke.mjs`

**명세**

- `AddToPlanButton({ item: { id, title, href, when }, from, contentId })`: `isInPlan(id)`면 "일정에 있어요 ✓"(누르면 `removeFromPlan`), 아니면 "내 일정에 넣기"(누르면 `addToPlan`). `addToPlan`이 false면 상태를 바꾸지 않고 "저장하지 못했어요"를 `role="status"`로. `subscribeFamilyPlan`으로 다른 곳의 변경을 따라간다.
- 시즌 카드는 지금 통째로 `<a>`다. 버튼을 링크 안에 넣지 말고 카드 안의 형제로 둔다(중첩 인터랙티브 금지).
- `when`: `deadline`이 있으면 `{ kind: 'date', date: nextDateOf(deadline) }`, 없으면 `{ kind: 'month', month: 오늘 달 }`.
- **id**: 로드맵에 같은 할 일이 있는 카드는 로드맵 id를 써서 일정에 두 번 나오지 않게 한다. `home-shelves.json` 항목에 `planId`를 더한다: `notice` → `adm-12-notice`, `delay` → `adm-12-defer`. 나머지는 `season-<id>`.
- `from: 'home_worry'`, `contentId`는 카드 id.
- 정적 홈(`build-shell-pages.mjs`)에는 버튼을 넣지 않는다 — 기기 저장값을 읽어야 해서 앱에서만 뜬다. `seasonCards()`의 선택 규칙은 바꾸지 않으므로 두 파일 동기화 규칙에 걸리지 않는다.
- C-04가 `season`을 `worries`로 바꿀 때 `planId`와 이 버튼을 그대로 옮긴다(C-04 명세에 반영할 것).

**완료 기준**: lint·typecheck·build·public smoke 통과. smoke: 홈에서 첫 시즌 카드의 버튼 → "일정에 있어요" → `/timetable?face=timeline`의 `.roadmap`에 그 제목이 보임(2026-11-01 UX-26으로 `/my`에서 옮김)(입학연도가 있는 상태에서) → 디버그 기록에 `plan_item_add` 한 번. 다시 누르면 빠짐.

**결과** (Codex, 2026-11-01)

- 독립 worktree `F:/sm/vibe/elementary/.worktrees/codex-ux-C-08`, 브랜치 `codex/ux-C-08`, 기준 master `7747ada`. 다른 카드 변경은 포함하지 않는다.
- `src/components/content/AddToPlanButton.tsx`(신규): 기존 API만 사용한 담기·제거 버튼. `useSyncExternalStore(subscribeFamilyPlan, ...)`로 확인된 기기 저장 상태를 읽고, 성공을 추측해 표시하지 않는다. 담기·제거 실패 시 현재 선택 상태를 유지하고 `role="status"`로 “저장하지 못했어요”를 표시한다. `aria-pressed`와 카드 제목을 포함한 접근성 이름을 제공한다.
- `src/components/navigation/HomeShelves.tsx`: 기존 링크와 형제 위치에 버튼 연결. 카드 deadline은 `nextDateOf`로 날짜로, deadline이 없으면 현재 달로 전달한다. `from: 'home_worry'`, `contentId: card.id`를 API에 전달한다.
- `src/content/home-shelves.json`: 8개 항목에 planId만 추가. notice=`adm-12-notice`, delay=`adm-12-defer`, 나머지=`season-<id>`. 로드맵과 같은 ID는 기존 API가 하나로 합치며, 그 경우 로드맵의 원래 제목·기본 항목은 유지된다. 제거는 담은 항목만 해제한다.
- `src/styles/home-shelves.css`: 링크·버튼 형제 배치의 높이·간격, 44px 버튼, 선택·키보드 초점·실패 안내 스타일. 정적 홈에는 버튼을 추가하지 않았으며 `seasonCards()`나 날짜 창·정렬 규칙도 바꾸지 않았다.
- `scripts/public-smoke.mjs`: 지도 검사 전 홈 담기 → MY에 한 번 표시 → 추가 이벤트 1회 → 홈 복귀·제거 → 저장 실패 시 미선택·안내·추가 이벤트 없음 검증. 로드맵과 ID가 같을 때 원래 제목을 사용해 월별 콘텐츠 변화에도 검사할 수 있게 했다. C-07도 같은 smoke 진입부에 검증을 추가하므로 Claude가 두 브랜치를 병합할 때 양쪽 검증을 유지해야 한다.
- 이 문서: 결과 기록과 C-04에서 planId·버튼을 worries로 옮기라는 명세 추가. 저장 형식·키·`familyPlan.ts`·Claude 소유 파일은 변경하지 않았다.
- `npm run lint`: exit 0, 경고 없음. `npm run typecheck`: exit 0. `npm run test:unit`: exit 0, tests 132 / suites 28 / pass 132 / fail 0.
- `npm run build`: exit 0. Vite 1,806 modules, 정적 가이드 14편, 학교 6,302·아파트 45,699 URL, sitemap 8개 생성. 기존 청크 크기·브라우저 데이터 갱신 경고가 있다.
- 추가 검증: metadata에서 planId를 제외하면 이전 JSON과 동일함, ID 8개가 고유함, 12개월의 카드 선택·정렬 동일함을 확인(PASS). 실제 dist 홈에 현재 카드 제목·링크는 있고 담기 버튼은 없음(PASS). `node --check scripts/public-smoke.mjs`, `git diff --check` 통과.
- 버튼 격리 검증: 실제 컴포넌트를 변환해 hook/API 대역으로 실행, exit 0. API 인자, 확인된 상태 표시, 담기/제거 실패 시 기존 선택 유지·status, 성공 시 오류 해제, 구독 함수 전달·서버 snapshot을 확인했다. 임시 실행기는 삭제했다. 실제 API·기기 저장·이벤트는 smoke로 확인한다.
- `npm run browser:smoke:public -- http://127.0.0.1:3048`: C-08 검증은 모두 PASS. 링크 안에 버튼이 없음을 확인했고, 입학연도 선택 → 실제 담기 → MY의 한 번 표시 → home_worry/해당 ID의 plan_item_add 1회 → 홈 재진입 상태 유지 → 제거·추가 이벤트 없음 → 실제 Storage 쓰기 실패 시 미선택·status·이벤트 없음까지 통과했다. 이후 기존 지도 축소 검사에서 `zooming out replaces the district markers with province markers — still not true after 15000ms and 32 checks`로 exit 1(`scripts/public-smoke.mjs:450`). 전체 smoke 통과는 남은 검증 블로커다. 지도 검사 조건은 변경하지 않았다.
- 임시 실행기는 정리했으며 master 병합·release 배포·운영 DB 쓰기는 수행하지 않는다.

**검토**: 

---

### C-09 퍼널 정의 (UX-08d) — `ready`, S (문서만)

**목표**: "고민 클릭 → 도착 → 일정 시작"을 GA4에서 바로 볼 수 있게 탐색 정의를 문서로 고정한다.

**바꿀 파일**: `docs/product/MEASUREMENT_PLAN.md`(10절 아래 "우리집 일정 퍼널" 소절)

**명세**

- 단계: `home_worry_click` → `page_view`(가이드·상세) → `plan_start` → `plan_item_add` 또는 `ics_export` → `plan_return`. 각 단계의 이벤트·조건·기간(세션 / 7일 / 30일)을 표로.
- `plan_start.from`별 분해(`home`·`guide`·`home_worry`·`school_detail`·`apartment_detail`·`result_page`·`timetable`·`my`), 맞춤 측정기준 등록 목록(`from`, `face`, `content_id`, `worry_id`, `item_id`)과 등록 여부 칸.
- 기존 사용자 판정: 이 기기에 입학연도나 시간표 초안이 이미 있으면 `plan_start`가 오지 않는다(`hasFamilyPlan`). 퍼널의 분모가 신규 일정만이라는 점을 적는다.
- 운영 데이터 조회·GA4 설정 변경은 하지 않는다(사용자 몫).

**완료 기준**: 문서 표가 C-01 이벤트 표와 이름·매개변수가 일치. 맞춤 측정기준 등록 단계는 사용자 확인 항목으로 표시.

**결과**: 

**검토**: 
