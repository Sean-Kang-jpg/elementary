# 작업 상태판 · Codex 카드

역할·규칙·진행·보관은 [AGENT_COLLAB_RR.md](AGENT_COLLAB_RR.md)(R2, 2026-11-19). 이 문서는 **상태판, 진행 중 카드, Codex가 부르는 API**만 둔다.
지난 카드(C-01~C-11)와 R1 역할 정의는 [archive/CARDS_2026-11.md](archive/CARDS_2026-11.md). 아이디어는 `F:\sm\vibe\elementary\INBOX.md`(git 밖), 결정은 [DECISIONS.md](DECISIONS.md).

## 상태판

상태: `ready` · `in-progress` · `blocked`(이유) · `review` · `merged` · `released`. 담당 K = Claude, C = Codex, U = 사용자.
상태가 바뀐 쪽이 그 자리에서 고친다. 카드 본문은 `released` 14일 뒤 보관 파일로.

| ID | 제목 | 담당 | 브랜치 | 상태 | 갱신일 |
| --- | --- | --- | --- | --- | --- |
| PLAN-CHECKS | 완성한 한 주에 '학교에 확인할 것' | C → K | `codex/plan-checks-20261118` | review — Claude 검토·병합 대기, 기록 `PLAN_SCHOOL_CHECKS_RELEASE_20261118.md`(브랜치) | 11-18 |
| FNL-04 | GA4 맞춤 정의 등록 기록 | C → K | `codex/ga4-registration-20261112` | review — 문서 1커밋 미병합 | 11-12 |
| FNL-09 | 랜딩 `(not set)`·초기 조회 품질 진단 | C | — | ready | 11-19 |
| FNL-10 | 전체 동선 검증·효과 재점검 | K + U | — | blocked — 관찰 기간 | 11-19 |
| UX-19·20 | 고민 카드 첫 3장 | K + U | master | in-progress — 3장 작성, 운영 미배포. 보류 W08·W15·W18 | 11-19 |
| UX-11 | 지금 정하지 않아도 되는 것 | U → C | — | blocked — 내용(U) | 11-19 |
| UX-23 | 일정 기기 간 동기화 | K | — | blocked — D1 재결정(U 보류) | 11-19 |
| UX-21·22 | 저도 궁금해요 · 학기 회고 | C | — | ready(P3, 3월 이후) | 11-19 |
| — | `codex/ux-16-time-sort`(배움·돌봄 글 시간 정렬) | — | 원격 브랜치 | 폐기 후보 — 사용자 범위와 달라 병합 안 함(11-06), 월말 정리 때 삭제 | 11-19 |

배포된 것(카드 본문은 보관 파일·각 릴리스 기록): C-01~C-11, UX-03·06·08c·10·13·14·16·17·18·26·27,
FNL-00~03(`FUNNEL_RELEASE_20261114.md`), FNL-07(`GUIDE_PLAN_UX_RELEASE_20261115.md`), FNL-05·06·08(`PLAN_ENTRY_UX_RELEASE_20261116.md`). UX-15는 제외(11-06 사용자).

## 진행 중 카드

(지금 없음. 새 카드는 이 아래에 `### ID 제목 — 상태, 크기`로. 양식: 목표 · 바꿀 파일 · 명세 · 완료 기준 · 결과(5줄) · 검토)

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
