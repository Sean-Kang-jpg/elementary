# 퍼널 계측 1차 실행 기록

## FNL-00 — 기준 확인 완료 (2026-11-06)

- 운영: `wherecho.co.kr`, Vercel 프로젝트 `elementary`, 팀 `seankangs-projects`.
- 운영 배포: `dpl_9rRdug4did7wU3ApqdHMmgzYqFPT`, 2026-11-06 17:56 KST, Ready.
- Vercel `gitSource`: `release`, 커밋 `87668db5edfdd72a3d1e6f2c23e0960f659c1cdc`.
- `git fetch origin` 후 원격 master/release가 같은 커밋이다. 원래 작업 폴더의 로컬 master는 `3b1b34a`로 뒤처졌으며 여러 별도 미커밋 변경이 있다. 이번 구현은 이를 가져오지 않고 원격 master에서 별도 worktree로 시작한다.
- 4문항 시작 흐름은 `e4f2688`(UX-13)에서 도입됐다. 실제 파일은 `MySchedule.tsx`, `PlanStarter.tsx`, `schedule/starter.ts`. 첫 답변의 `start()`가 초안을 저장하고 이후 답변·편집은 `updatePlan()`으로 저장한다. 단순 버튼 클릭은 저장 성공이 아니다.
- 학교 선택·자동 복원은 `SchoolSelection.tsx`, 실제 표시할 face/학교는 `TimetablePage.tsx`가 정한다. 페이지 조회는 `App.tsx`에서 pathname만 비교하고 있었다.
- UX-07의 학교 지정 링크와 UX-13의 질문 흐름은 유지한다. 이번 1차 묶음은 UI 재설계 없이 계측을 추가한다.
- Vercel 플러그인은 해당 팀 접근이 거절됐으나 기존 CLI 로그인으로 같은 팀/프로젝트의 배포 정보를 읽어 위 내용을 확인했다. 신규 권한을 부여하지 않았다.

## 실행 상태

| 카드 | 상태 | 결과 |
| --- | --- | --- |
| FNL-00 | done | 위 기준 배포·원격 소스·실제 저장 경계 확인 |
| FNL-01 | done | MEASUREMENT_PLAN 10절에 이벤트 경계·중복·실패·개인정보 계약 기록 |
| FNL-02 | review | 화면·학교 쿼리 전환 구현 및 개별 검증 완료. 전체 공개 화면 검증 미통과 |
| FNL-03 | review | 실제 저장 성공/실패 계측 구현 및 개별 검증 완료. 전체 공개 화면 검증 미통과 |
| FNL-04 | in_progress | 맞춤 측정기준 5개 등록, 나머지 설정·실제 수신·기준선 대기 |

계측 변경의 운영 배포·GA4 데이터 검증은 로컬 구현 완료와 별도로 기록한다.

## 구현·검증 결과 (2026-11-07 KST)

카드별 브랜치는 앞 카드 위에 순서대로 쌓았다. 통합 검토는 마지막 브랜치의 기준 커밋 대비 전체 diff로 하며, 중복 cherry-pick하지 않는다.

| 카드 | 브랜치 / 커밋 | 변경 파일·결과 |
| --- | --- | --- |
| FNL-00 | `codex/fnl-00-baseline` / `69dd59a` | 이 실행 기록과 퍼널 백로그. 운영 기준·원래 작업 폴더 차이 확인 |
| FNL-01 | `codex/fnl-01-event-contract` / `388b26b` | analytics.ts, funnelMeasurement.ts, MEASUREMENT_PLAN.md. 공통 이벤트 계약과 순수 관찰자 |
| FNL-02 | `codex/fnl-02-screen-measurement` / `e914959` | App.tsx, TimetablePage.tsx, SchoolSelection.tsx, funnelMeasurement.test.ts. 실제 표시 face·학교 기준, 재렌더/추적 쿼리 중복 방지 |
| FNL-03 | `codex/fnl-03-save-measurement` / `f0fbaa3` | MySchedule.tsx, AcademyTimetableForm.tsx, frontyard/PostCard.tsx, 관찰자/단위검증, scripts/funnel-measurement-smoke.mjs 및 로컬 fixture, package.json. 실제 쓰기 뒤 성공, 쓰기 예외만 실패, 내용 같은 저장 제외 |
| FNL-04 | `codex/fnl-04-ga4-setup` | 설정 확인·분석 명세·미완료 항목 및 검증 결과 문서 |

- `npm run lint`: 통과(경고 0).
- `npm run typecheck`: 통과. ES2020에서 지원하지 않는 Object.hasOwn 사용은 호환 호출로 수정했다.
- `npm run test:unit`: 173개 통과, 실패 0. 11/7 재확인 포함.
- `npm run build`: 통과, SEO 8개 sitemap 생성. 기존 큰 번들 경고와 공개 키 없는 serving 781행 경고가 있다. 원천 데이터는 이번에 변경하지 않았다.
- `npm run browser:smoke:funnel -- http://127.0.0.1:3010`: 23개 검증 통과. StrictMode 최초 조회, face/학교 전환, UTM, 학교 재선택, 생성·편집 실패/재시도, 재마운트, 재열기·뒤로가기를 확인했다. 별도 브라우저의 합성 학교·로컬 저장·debug 기록만 사용하며 GA4와 운영 DB에 테스트 데이터를 쓰지 않았다.
- `npm run browser:smoke:public -- http://127.0.0.1:3010`: 실패. 지도 축소 시 district → province 표시 전환 대기에서 멈췄다(`public-smoke.mjs:599`). 계측 앞부분 및 기존 일정 질문·저장 검증은 통과했으나 전체 검증 통과로 간주하지 않는다. 기존 인계 문서에도 다른 로컬 포트의 같은 단계 실패가 기록되어 있다. 이번 변경은 지도 코드를 수정하지 않았다.
- `npm run browser:smoke:public -- https://wherecho.co.kr`: 11/7 실패. `C-04 static home and app show the same ordered worries` 비교(`public-smoke.mjs:454`)에서 멈췄다. 로컬 지도 실패와 동일 원인임은 확인되지 않았다. 이 실행은 미배포 계측 코드의 운영 검증이 아니다.
- `git diff --check`, 새 검증 스크립트 구문 검사: 통과.

React 검토: 새 UI·이벤트용 상태·저장 키는 추가하지 않았다. 렌더 중 전송 없이 표시 후 effect/성공한 사용자 저장 경계에서 계측한다. 관찰자는 컴포넌트 재마운트와 분리돼 중복을 막고, 전송 실패가 제품 저장 성공을 실패로 바꾸지 않는다.

명세 조정: `first_edit` 중복 방지는 학교별 **문서 실행 단위**다. 새로고침하면 같은 GA4 세션에서도 재발화할 수 있다. 실제 GA4 세션 수와 순서는 보고서에서 별도로 중복 제거해야 한다. 정확한 세션당 1회 전송을 달성했다고 보고하지 않는다. 저장 형식·키, 질문 흐름, URL은 유지했다.

## FNL-04 — GA4 반영 상태

속성 `557166556`, 계정 `375631039`, wherecho. 기존 로그인 권한으로 설정했으며 새 계정 권한·연결은 만들지 않았다.

| 이벤트 범위 측정기준 | 매개변수 | 확인 상태 |
| --- | --- | --- |
| 일정 화면 | face | 11/6 생성 후 목록 확인 |
| 시간표 진입 위치 | entry_point | 11/6 생성 후 목록 확인 |
| 시간표 학교 선택 방식 | selection_method | 11/6 생성 후 목록 확인 |
| 계측 버전 | measurement_version | 11/6 생성 후 목록 확인 |
| 시간표 저장 작업 | operation | 11/6 저장 클릭. 11/7 전체 목록이 기존 9개에서 14개로 증가한 것을 확인했으나 행 세부 내용 재확인 필요 |
| 시간표 저장 오류 코드 | error_code | 미등록 |

브라우저 연결이 끊겨 행 세부 재확인·증빙 화면 저장·추가 설정을 완료하지 못했다. 11/7 재연결에서도 브라우저 제어 연결 오류가 발생했다. 위의 직접 확인 범위 이상을 완료로 표시하지 않는다.

남은 설정: error_code 등록, operation 행 확인, `timetable_draft_create`/`timetable_save_success` 주요 이벤트 설정 확인·필요 시 등록, 데이터 스트림 자동 history page_view 여부 확인. 주요 이벤트 설정일을 기록하고 그 전후 참여율·이탈률을 단순 비교하지 않는다. 지금까지 주요 이벤트 설정을 변경했다고 보고하지 않는다.

## 조회 명세와 배포 후 완료 조건

1. 처리 완료된 일자로 최근 28일과 그 전 28일을 고정한다. 최초 감사의 10/8~11/4, 9/10~10/7 수치와 새 기간을 혼용하지 않는다. 계측 배포 이전 이벤트는 0 대신 '계측 이전/확인 불가'로 표시한다.
2. 랜딩 페이지+쿼리 문자열별 세션, 참여 세션, 참여율, 이탈률을 조회하고 실제 같은 경로의 face/학교 파라미터를 분리한다. 합산할 때 경로별 사용자를 더하지 않는다.
3. 입학 일정은 `timetable_view(face=timeline)`로 별도 조회한다. 주간은 `timetable_view(face=week)` → `timetable_school_pick` → `timetable_draft_create` / 기존 초안의 `timetable_first_edit` → `timetable_save_success`로 나누며 신규 생성과 기존 편집을 강제 직렬 단계로 묶지 않는다. 저장 실패는 별도 진단이다.
4. GA4 탐색의 사용자 수를 세션 수로 부르지 않는다. 단순 이벤트 횟수 비율도 전환율로 부르지 않는다. 같은 세션의 순서 보장이 확인되지 않았으므로 현재 세션 퍼널은 미확정이다.
5. BigQuery 내보내기 연결 여부는 아직 확인하지 못했다. 이미 내보내기가 있고 접근 가능한 경우 `user_pseudo_id + ga_session_id`로 세션을 묶고 event_timestamp 순서로 각 단계 최초 도달을 비교한다. 누락 식별자 세션은 별도 표기하며 새 연결/권한을 임의 생성하지 않는다. 동일 timestamp 사건 순서가 불명확하면 확정 순차 전환에서 제외하거나 불확실 집계로 명시한다.
6. 세션의 첫 page_view 랜딩, 세션 채널(source/medium 또는 session_traffic_source_last_click), 기기별로 분모·각 단계 도달 세션·전환율·저장 실패 세션을 함께 제시한다. `entry_point`는 앱 내부 출처이며 검색 채널을 대신하지 않는다.
7. 승인된 배포에서 측정 버전·배포 SHA·시각을 기록하고 실제 브라우저 DebugView 수신을 확인한다. debug 로컬 검증 통과와 운영 수신 확인을 구분한다. 처리 완료 보고서 확인 뒤 FNL-04를 완료 처리한다.

## 다음 실행 백로그

| 우선순위 | 작업 | 완료 기준 |
| --- | --- | --- |
| P0 | 공개 화면 검증 실패 원인 확인 | 홈 정적/앱 비교 실패와 로컬 지도 실패를 각각 재현·원인 분리. 검증을 완화해 통과시키지 않음 |
| P0 | GA4 연결 복구 후 남은 설정 | 위 미확인 항목을 실제 화면으로 확인하고 적용일·증빙 기록 |
| P0 | 계측 변경 검토·통합 | 마지막 브랜치 전체 diff 검토, 최신 master와 충돌 확인 및 필수 공개 화면 검증 통과 |
| P0 | 승인 후 계측 배포·수신 확인 | DebugView 실제 이벤트 및 처리 완료 보고서 확인. 여기까지 FNL-04 미완료 |
| P1 | FNL-05·06 학교 → 첫 질문 동선 | 기존 학교 ID·초안 보존, 모바일 첫 화면에서 시간표 행동 확인 |
| P1/P2 | FNL-07·08 랜딩·미선택 화면 | 계측 수신 확인 이후 별도 변경으로 배포하여 효과 분리 |

운영 배포·release 푸시는 수행하지 않았다. 이 문서는 전체 QA 통과나 개선 효과 입증을 뜻하지 않는다.
