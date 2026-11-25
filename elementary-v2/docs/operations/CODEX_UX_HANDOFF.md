# 작업 상태판 · Codex 카드

역할·규칙·진행·보관은 [AGENT_COLLAB_RR.md](AGENT_COLLAB_RR.md)(R2, 2026-11-19). 이 문서는 **상태판, 진행 중 카드, Codex가 부르는 API**만 둔다.
지난 카드(C-01~C-11)와 R1 역할 정의는 [archive/CARDS_2026-11.md](archive/CARDS_2026-11.md). 아이디어는 `F:\sm\vibe\elementary\INBOX.md`(git 밖), 결정은 [DECISIONS.md](DECISIONS.md).

## 상태판

상태: `ready` · `in-progress` · `blocked`(이유) · `review` · `merged` · `released`. 담당 K = Claude, C = Codex, U = 사용자.
상태가 바뀐 쪽이 그 자리에서 고친다. 카드 본문은 `released` 14일 뒤 보관 파일로.

| ID | 제목 | 담당 | 브랜치 | 상태 | 갱신일 |
| --- | --- | --- | --- | --- | --- |
| PLAN-CHECKS | 완성한 한 주에 '학교에 확인할 것' | C → K | `codex/plan-checks-20261118` | released — 운영 release `b6c92c4`(11-22, 오후 미리보기와 한 묶음). 운영 번들 포함 확인(11-24) | 11-24 |
| 오후 미리보기·진입 | PR #4 보완과 학교·가이드 연결 | C → K | `codex/afternoon-preview-20261122` | released — PR #5 병합, 운영 release `b6c92c4` (11-22). 운영 HTTP smoke 16 PASS(11-24), 브라우저 단계는 이 PC에서 agent-browser 실행 불가(spawn UNKNOWN)로 미실행 | 11-24 |
| TT-01 | 한 주 입력 덜어내기·하교 질문·측정 | C(저장·엔진, 소유자 승인) → C(화면) | `codex/TT-01-timetable-screen` | review — 화면 구현·로컬 검증 완료 | 11-25 |
| HOME-TT | 홈에서 하교 후 일정 시작 | C → K | `codex/HOME-TT-timetable-start` | review — 구현·모바일 검증 완료 | 11-26 |
| TT-02 | 3번 질문을 요일×시간대 표로 + '채워 보기' | C → K | — | blocked — TT-01 측정 배포 뒤 | 11-24 |
| TT-03 | 요일 카드를 시간대 축으로(빈 칸 → 맞는 선택지 한 목록) | C → K | — | blocked — TT-02 뒤, 1~2월 | 11-24 |
| FNL-04 | GA4 맞춤 정의 등록 기록 | C → K | `codex/ga4-registration-20261112` | review — 문서 1커밋 미병합 | 11-12 |
| FNL-09 | 랜딩 `(not set)`·초기 조회 품질 진단 | C | — | ready | 11-19 |
| FNL-10 | 전체 동선 검증·효과 재점검 | K + U | — | blocked — 관찰 기간 | 11-19 |
| UX-19·20 | 고민 카드 첫 3장 | K + U | master | released — 운영 release `708303e`. 보류 W08·W15·W18 | 11-22 |
| UX-11 | 지금 정하지 않아도 되는 것 | U → C | — | blocked — 내용(U) | 11-19 |
| UX-23 | 일정 기기 간 동기화 | K | — | blocked — D1 재결정(U 보류) | 11-19 |
| UX-21·22 | 저도 궁금해요 · 학기 회고 | C | — | ready(P3, 3월 이후) | 11-19 |
| — | `codex/ux-16-time-sort`(배움·돌봄 글 시간 정렬) | — | 원격 브랜치 | 폐기 후보 — 사용자 범위와 달라 병합 안 함(11-06), 월말 정리 때 삭제 | 11-19 |

배포된 것(카드 본문은 보관 파일·각 릴리스 기록): C-01~C-11, UX-03·06·08c·10·13·14·16·17·18·26·27,
FNL-00~03(`FUNNEL_RELEASE_20261114.md`), FNL-07(`GUIDE_PLAN_UX_RELEASE_20261115.md`), FNL-05·06·08(`PLAN_ENTRY_UX_RELEASE_20261116.md`). UX-15는 제외(11-06 사용자).


## 진행 중 카드

### TT-01 · 한 주 입력 덜어내기·하교 질문·측정 — S~M

배경: 11-22 UX·PO 검토(사용자 결정은 [DECISIONS.md](DECISIONS.md) 11-22 세 줄). 질문 카드는 짧지만 3번 '예' 뒤 화면이
고정 문단 11개(약 310자)·아침돌봄 폼·필터 4·검색·이미 답한 돌봄 재등장으로 무겁고, 하교·방과후 자료가 없는 학교는 완료 ✓에 못 간다.
완성률을 잴 이벤트가 없다.

**K 몫(먼저, master)** — `src/utils/schedule/starter.ts`, 저장 경로
- `StarterStep`에 `'dismissal'` 추가: 1번 답 뒤, 그 학교 하교 예상이 한 요일도 없을 때만. 답은 저장하고(`readStarter` 하위 호환 — 필드 없으면 묻지 않은 것으로) 정규수업 칸 끝으로 쓴다. 고른 값은 `evidence: 'estimated'`, '잘 몰라요'는 13:40 + `timeAssumption`
- 방과후 시간대 자료 유무를 화면에 넘길 값(`hasSlots`)과 3번 건너뛰기 규칙: 없으면 `courses: false`로 두고 다음 단계로
- 이벤트 함수 `timetable_step {step, answer}`·`timetable_complete {coverage_state, has_slots?, has_dismissal}` — `funnelMeasurement.ts`와 `MEASUREMENT_PLAN.md` 같이. answer는 고른 버튼 값(`yes`·`no`·`back`·`skip`·귀가·하교 구간)만, 자유 입력 없음

**C 몫(K 몫 병합 뒤)** — `PlanStarter.tsx`, `MySchedule.tsx`, `MyAfterschoolPicker.tsx`
1. 하교 질문 카드: `[12:50] [13:40] [14:30] [잘 몰라요]`, '요일마다 달라요' → 요일별 칩. 도움말 한 줄
2. 3번 '예' 뒤 고르기 화면에서 오후·저녁 돌봄(2번에서 답함)·아침돌봄 블록·필터 4개를 뺀다. 검색은 강좌 20개 넘을 때만
3. '신청·참여와 별개'·'학교에 확인' 안내는 화면당 한 번. 나머지는 완성 뒤 '학교에 확인할 것'(`SchoolChecks`)이 맡는다
4. 질문 카드가 열려 있는 동안 아래 편집기·저장 알림을 접는다(시간표 미리보기는 남김)
5. 방과후 자료 없는 학교의 3번: "이 학교 강좌 시간은 아직 없어요" + [다음] 한 개
6. 단계 이벤트 연결, `public-smoke` 블록 추가(질문 5단계 통과·자료 없는 학교 완료 ✓ 도달)

완료 기준: 자료 없는 학교에서 1→하교→2→3(건너뜀)→4→완료 ✓ 도달. 3번 '예' 뒤 고정 문구 120자 이하(공백 제외).
lint·typecheck·test:unit·smoke 블록 통과, 390px 확인.
문구는 초안 — 화면 문구는 사용자 확정(R2 3절).

#### TT-01 저장·엔진 결과

- 브랜치/커밋 — `codex/TT-01-timetable-input`, 구현 `b51b349`·`5b5fb5e`·`ae379f0` (push 완료, 기준 master `01b34a9`).
- 바꾼 파일 — `starter.ts`, `funnelMeasurement.ts`, 저장·엔진·계측 단위 검사와 측정 문서.
- 검증 — lint·typecheck·unit 202/202 통과. Vite 번들·정적 셸 생성 성공. 전체 build의 sitemap은 로컬 Supabase URL/anon key 부재로 중단.
- 다른 점 — 화면 호출부와 390px·브라우저 smoke 블록은 후속 화면 카드에서 확인. 브랜치로 전달.
- Claude 몫 — 저장·엔진 먼저 검토 및 병합, 화면 연동 검토 뒤 승인된 출시 묶음 배포와 운영 smoke.

#### 화면 연동 계약

1. 학교별 조회 완료 후 `hasScheduleDismissal(schoolEntriesFromEstimate(day))`로 학교 하교 자료 유무를 판정한다(자료 없음은 빈 배열). 이 값의 반대로 `{ needsDismissal }`을 만들어 `answerReturn(value, context)`와 `starterStep(answers, context)`에 동일하게 전달한다. 기존 답을 수정할 때는 저장된 `dismissal`도 이어받는다. `starter` 없는 과거 저장 초안은 기존대로 완료 상태로 복원한다.
2. 하교 답은 `{ default, weekdays? }` 형태. 값은 `770 | 820 | 870 | 'unknown'`이고 `weekdays`의 키는 월~금 1~5다. 최신 저장 초안에 `answerStarterDismissal(schoolId, starter, entries, answer)`를 적용하고 반환된 `starter`와 `entries`를 한 번에 저장한다. 뒤로 이동할 때는 기존 칸과 답을 보존하고, 하교 답을 다시 편집할 때는 이 함수로 갱신한다. 돌봄 선택을 다시 적용할 때 시간이나 요일을 직접 고친 칸도 보존한다.
3. 학교별 `getSchoolAfterschool(schoolId, { allowDevFixture: false })` 결과를 `starterHasSlots`에 넘긴다. 로딩·조회 실패인 `undefined`와 확인된 자료 없음인 `false`를 구분한다. 3번에서 자료 없음 [다음]을 누르면 `skipStarterCourses(starter, hasSlots)`가 `courses: false`를 만든다. 기존 일정 항목은 그대로 저장한다.
4. 실제 1번 표시에서 `funnelMeasurement.timetableStep(schoolId, { step: 'return', answer: 'start' })`. 버튼 값은 측정 문서의 목록을 사용하고, 요일별 하교는 `by_weekday`, 자료 없음 [다음]은 `courses/skip`, 4번 완료 버튼은 `fill/yes`다. 첫 저장 성공은 기존 `write('create')`가 보내는 `timetable_draft_create`를 사용한다.
5. 저장 직전 최신 초안의 `done`과 저장할 초안의 `done`을 비교해 최초 완료 전환(초안이 없던 경우 포함)을 확인하고, 실제 쓰기에 성공한 직후 `timetableComplete(schoolId, { coverageState, hasSlots, hasDismissal })`를 한 번 호출한다. 시간대 조회 대기·실패의 `undefined`는 `has_slots`만 생략하며 이벤트는 즉시 보낸다. 자료 없음이 확인된 `false`는 `0`으로 보낸다. 실패한 쓰기에서는 완료 이벤트를 보내지 않으며, 재시도가 성공하면 한 번 보낸다. 조회 결과가 뒤늦게 도착하거나 완료 초안을 복원·재저장할 때는 다시 보내지 않는다. `coverageState`는 저장에 성공한 일정의 엔진 결과를 사용하고 하교 직후 귀가는 `covered`로 기록한다. `hasDismissal`은 학교 자료 여부로, 부모가 답한 시각과 구분한다. 하교 직후 귀가 분기도 완료가 저장되는 시점에 같은 계약을 적용한다.

#### TT-01 화면 결과

- 브랜치/커밋 — `codex/TT-01-timetable-screen`, 화면·검사 `2d95dab`·`f91faad`, 선행 PR #7 병합 `99d6684`.
- 바꾼 파일 — 질문·시간표·강좌 선택 컴포넌트, 학교 미선택 초안과 기존 이어보기 연결, TT-01 smoke 및 로컬 응답 fixture.
- 검증 — lint·typecheck·unit 203/203, 390×844 로컬 TT-01 smoke 50/50, funnel smoke 23/23. 시작·방과후 건너뛰기·첫 수동 저장·완료를 검증했고, 저장 실패 후 재시도·완료 복원·늦은 응답에도 완료 이벤트는 중복되지 않았다.
- 다른 점·미검증 — 학교 미선택 진입과 기존 초안의 첫 수동 추가에는 전용 이벤트가 없다. Vite 번들과 정적 셸은 성공했고 전체 빌드는 로컬 Supabase 설정이 없어 사이트맵에서 중단됐다. 전체 공개 smoke·운영 GA4 수신은 미검증.
- Claude 몫 — 화면 PR 승인·검토 및 병합 후 선행 PR #7과 화면 변경을 승인된 운영 출시 묶음에 함께 반영하고 운영 smoke를 실행한다.

### HOME-TT · 홈에서 하교 후 일정 시작

- 브랜치/커밋 — `codex/HOME-TT-timetable-start`, 구현 `0d92608`, 기준 master `fa28331`.
- 바꾼 파일 — 홈·한 주 화면과 홈 문구·시기 데이터, 학교 예시와 정적 홈 생성기, 브라우저·단위 검사.
- 검증 — Chromium 모바일 터치 360×800·390×844에서 두 경로, 첫 픽업 저장, 배정 검색 진입, 입학 준비 및 입학 전 일정, 시기 카드 표시·생략 통과. lint·typecheck·unit 205/205, TT-01 57/57, funnel 23/23. 공개 읽기 구성으로 전체 빌드·사이트맵 생성 성공.
- 다른 점·미확인 — 운영 release 공개 smoke는 테스트 학교 `B000002292`의 강좌가 없어 UX-13에서 중단. 새 경로는 강좌 요청 없이 검증. 운영 GA 요청 HTTP 204 관찰, 속성 내 수신 미확인. 홈·시간표 스크롤 영역을 고정 메뉴 위로 조정.
- Claude 몫 — master 병합·운영 배포 결정, 운영 강좌 의존 smoke 갱신 및 GA4 속성 수신 확인.

### TT-02 · 3번 질문을 요일×시간대 표로 + '채워 보기' — M

TT-01 이벤트가 운영에 나간 뒤 시작(전후 비교를 위해).
- 3번 '예' 다음을 요일별 줄로: `[월] 하교 13:00 │ 맞춤형 13:10–13:50 ○ │ 방과후 14:00–14:40 · 미술 외 3 ○`. 강좌명은 칸을 누르면 펼치는 참고층
- 칸 id는 기존 시간대 id(`afterschool-…-slot-…`, `courses: true`) — 저장 형식 변경 없음. 열리는 요일은 `offeredWeekdays` 그대로
- '같은 시간대 모든 요일에' 토글
- 표 위 '하교 뒤 들을 수 있는 시간대 채워 보기' 버튼: 누를 때만 `pickupProgramOptions` 규칙(하교 뒤 시작·맞춤형/저학년·돌봄내 제외)으로 `considering` 후보를 채우고 칸마다 '빼기'. 기본으로 미리 채우지 않는다(11-22 결정)
- 이벤트: `timetable_fill_suggest {added}`, `timetable_complete`에 `filled_by_suggest` 추가
- 판단(사용자): 배포 2주 뒤 버튼 사용률과, 버튼 사용·직접 선택 두 집단의 완성률

### TT-03 · 요일 카드를 시간대 축으로 — M~L (1~2월)

- `ScheduleAddCard`의 탭 3개·필터를 없애고, 빈 칸을 누르면 그 시각에 맞는 선택지만 한 목록: 학교 시간대(TT-02 줄 재사용) · 저장한 학원 · 직접 입력
- 선택 규칙 통일: 요일 카드에서 반을 고르면 그 요일만 켜고, '이 반이 여는 요일: 월·수 · 모두 켜기' 칩. 한 주 목록과 같은 함수
- 카드 머리의 고정 '선택한 구간' 문구 대신 누른 칸의 실제 시각. 출처·앞마당 링크는 ⓘ 안으로

### 오후 미리보기·진입 결과 — 2026-11-22

- 브랜치/PR: `codex/afternoon-preview-20261122` · [PR #5](https://github.com/Sean-Kang-jpg/elementary/pull/5). #4의 홈 진입을 포함해 보완.
- 바꾼 파일: 픽업 계산·컴포넌트, 홈 정적·앱 링크, 학교 상세·가이드 3편, 주간 일정 요일 이동, 계측 계약과 모바일 검증.
- 검증: 계산 함수 8개 조건 실행 통과. 390px 브라우저 검증을 갱신했으며 실행 결과는 별도 확인.
- 다른 점: 보수적인 예상 하교를 먼저 표시하고, 선택한 프로그램 전후 공백을 조건부로 구분. 픽업 시각은 화면 맥락으로 전달.
- Claude 몫: 사용자 11/22 운영 배포 승인. PLAN-CHECKS와 PR #5 운영 통합 및 모바일 확인. PR #4의 목적은 #5에 포함.

### PLAN-CHECKS 결과 — 2026-11-19

- 브랜치/커밋: `codex/plan-checks-20261118` · 구현 `eacdd99` / UI `5840851` / 최신 master 통합 `3c14ff0` (push 완료).
- 바꾼 파일: SchoolChecks·MySchedule·MyScheduleWeek·schoolChecks(순수 함수/검사)·content.css·public-smoke·검증 기록.
- 검증: lint·typecheck·build 통과, unit 189/189. 카드 표시·접힘·편집 연결 검사와 390px 직접 검증 통과(이전 실행).
- 다른 점·막힌 점: 사용자 11-19 ‘배포합니다’ 승인. 3000/3001은 다른 팀원 서버 사용 중이라 유지. 과거 다른 포트 전체 smoke의 지도 축소 실패는 기록 유지.
- Claude 몫: R2의 검토·병합·배포 경로 및 운영 전체 smoke 확인. 최신 운영 변경은 모두 보존함.

## Codex가 부르는 API

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
| `planCoverage(entries, until)`, `describeCoverage(c)` (`schedule/coverage.ts`) | 한 주의 빈 시간(하교~`until`). "평일 19시까지 빈 시간 없음 ✓"은 엔진 공백이 0일 때만. 하교를 모르면 판단하지 않는다 |
| `removeFromPlan`·`restoreToPlan`·`readPinned`, `setTimelineHidden`·`readHiddenTimeline` (`familyPlan.ts`) | 넣은 것은 어디서든 뺄 수 있어야 한다(UX-27). 담은 항목은 빼고, 로드맵 항목은 숨긴다. 되돌리기는 `restoreToPlan`(이벤트 없음). 새 입구를 만들면 빼는 길도 같이 만들 것 |
| `readPlanChanges()` (`familyPlan.ts`), `planChangesSince` (`familyPlanCore.ts`) | 지난 방문 뒤 달라진 것(UX-18). 방문 시각은 `notePlanVisit`이 덮기 전에 붙잡아 두므로, 화면은 저장값을 직접 읽지 말고 이 함수를 쓴다 |
| `entryIntent(entry)`, `INTENT_LABELS` (`schedule/intent.ts`) | 칸의 의도(UX-14). 화면 문구는 이 표만 쓴다(`free`의 화면 이름은 "휴식", 11-03 확정). 저장값(`safety`·`basics`·`interest`·`free`·`undecided`)은 바뀌지 않는다 |
| `coverageUntil(plan.starter)` (`schedule/starter.ts`) | 빈 시간을 세는 끝 = 출발 계획의 보호자 귀가 시각(UX-13). 답이 없으면 19시, 정규수업 직후 귀가면 `null`(세지 않음). `planCoverage`를 부를 때 늘 이걸 넘길 것 |

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
