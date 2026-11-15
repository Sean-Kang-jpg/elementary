# 가이드에서 우리집 일정으로 연결 개선 — 2026-11-15

사용자가 코드·문구 변경과 운영 배포를 승인한 후 수행했다. 독립 worktree `guide-plan-ux-20261115`, 브랜치 `codex/guide-plan-ux-20261115`, 기준 `origin/master` 5888ef7.

## 변경

- morning-care / care-afterschool / first-weeks: ‘우리 학교로 한 주 짜보기’를 명시적인 `/timetable?face=week`로 연결한다. 학교 선택·기존 초안 복원은 기존 화면이 처리한다.
- 위 3편과 private-national / admission-timeline / preliminary-call / delay-or-early-entry / school-notice: 요약 다음에 주제별 다음 행동을 설명하고, 본문 끝의 기존 진입 버튼도 유지한다. 취학통지는 지도 진입을 유지한다.
- 입학 준비 4편: 구체적인 확인 할 일을 기존 `addToPlan` API로 저장한다. 기존 저장 계약의 `anytime`만 사용하고 확정 날짜를 만들지 않는다. 저장 확인 후 완료 표시, 이미 담았으면 중복 방지, 실패 시 재시도 안내를 제공한다. 기존 프로필·관심 학교·입학연도는 변경하지 않는다.
- 콘텐츠 메타데이터의 선택 필드 description / planItem을 검증한다. 정적 가이드에도 같은 설명·주소를 렌더링하되, 기기 저장이 필요한 버튼은 앱에서만 표시한다.
- 기존 familyPlan·프로필·시간표 저장 형식과 API, 기본안 규칙, GNB, 라우팅 계약을 변경하지 않는다.

## 측정

`guide_next_step_click`은 일반 클릭의 화면 이동에만 발생한다. content_id=가이드 slug, face=timeline/week(지도는 생략). 기존 `timetable_view`는 실제 도착, `plan_item_add`는 실제 담기 성공, `check_checklist_item`은 완료 체크다. 클릭·도착·신규 시작·활용을 구분하고 기존 사용자에게 plan_start가 다시 발생하지 않는 계약을 유지한다. 새 이벤트는 기존 맞춤 기준 content_id / face를 사용한다.

## 검증

- npm run lint: 통과.
- npm run typecheck: 통과. 최종 npm run build도 TypeScript 검사를 포함한다.
- npm run build: 통과. 가이드 16편, 사이트맵 8개 생성. 기존 번들 크기·브라우저 데이터 갱신 경고가 있다.
- node scripts/guide-plan-smoke.mjs http://127.0.0.1:3056: 저장 실패·재시도·신규 시작 1회·중복 방지·입학연도 없는 담기 표시·기존 프로필 보존·3편의 명시적 week 이동 통과. 최종 실행 exit 0. 390px 가로 넘침 없음·본문 앞 행동 배치까지 통과.
- npm run browser:smoke:public -- http://127.0.0.1:3057: 신규 변경에 앞선 기존 기능 검사 통과 후 지도 지역 데이터 대기에서 실패. localhost 재실행에서는 지역 데이터 로딩은 통과했고, 이어지는 기존 지도 축소 검사에서 15초/40회 후 실패했다. 변경 전 운영 기준선과 배포 후 운영 전체 검사로 대조한다.
- Vite preview는 운영 rewrite를 흉내 내지 않아 /map 정적 셸 분리 검사를 통과하지 못한다. 이 검사를 우회하지 않고 개발 서버와 운영 환경에서 각각 확인한다.
- 최초 제한 환경의 빌드는 사이트맵 조회 네트워크 제한으로 실패했고, 허용된 실행에서 전체 빌드가 통과했다.

## 배포 및 후속 결과

검증 완료 후 master와 release에 동일 커밋을 반영한다. 기존 원격 master와 release 사이의 차이는 문서·ETL·공개 검증 스크립트이며 기존 앱 소스 변경은 없다. 배포 상태와 운영 전체 스모크 결과를 후속 기록한다.

### 배포 전 최종 확인

- 변경 전 운영 전체 스모크 exit 0 / Public map smoke test passed. 로컬에서 실패한 지도 축소 검사도 운영에서는 통과했다. 페이지 오류 0, 지도 요청 최대 606ms, 아파트 요청 최대 254.9ms.
- 최종 가이드 전용 스모크 exit 0. 390px 배치·저장 실패/재시도·중복 방지·기존 가족 설정 보존·세 가이드의 week 도착 통과.
- 정적 가이드 8편의 설명·주소가 앱 콘텐츠와 일치하고, 동작하지 않는 저장 버튼을 정적 HTML에 넣지 않았음을 확인했다.
- React 검토: 저장 상태는 기존 구독 API에서 읽고 성공을 추측하지 않는다. 버튼과 링크는 형제이며 요청·effect·저장 키를 추가하지 않았다.
