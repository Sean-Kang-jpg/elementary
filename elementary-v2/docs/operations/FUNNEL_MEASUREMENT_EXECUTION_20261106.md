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
| FNL-01 | in_progress | 이벤트 계약 확정 중 |
| FNL-02 | todo | 화면·학교 쿼리 전환 계측 |
| FNL-03 | todo | 실제 저장 성공/실패 계측 |
| FNL-04 | todo | GA4 설정 확인과 배포 후 기준선 |

계측 변경의 운영 배포·GA4 데이터 검증은 로컬 구현 완료와 별도로 기록한다.
