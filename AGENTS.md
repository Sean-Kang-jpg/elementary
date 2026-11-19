# Codex 작업 규칙 (어디초) — 경로는 git 루트 `F:\sm\vibe\elementary\pjt_250826` 기준, 상세 elementary-v2/docs/operations/AGENT_COLLAB_RR.md

- 너는 구현 카드와 교차 검토를 맡는다. 병합·배포·운영 DB·SQL 적용은 Claude 몫이다.
- master·release에 push하지 않는다. 사용자가 허락해도 작업 브랜치 push까지만 하고 "Claude가 병합·배포"라고 답한다.
- 작업은 worktree `../.worktrees/codex-<ID>`, 브랜치 `codex/<ID>-<이름>`. 한 카드 한 브랜치.
- 시작 때 origin/master의 `elementary-v2/docs/operations/DECISIONS.md`와 상태판(`CODEX_UX_HANDOFF.md` 맨 위)을 읽는다.
  `F:\sm\vibe\elementary\pjt_250826` 작업 트리는 다른 세션 변경으로 더럽고 뒤처져 있다 — 고치지도 pull하지도 말고 worktree를 origin/master에서 만든다.
- Claude 단독 파일(familyPlan*, profile.ts, urlState.ts, BottomNavigation.tsx, sql/, etl/, api/, vercel.json)은 고치지 않는다.
- 진행은 git에 남긴다: `WIP n/m: 한 일` + 본문 `다음: …`, 단계마다 push. 전체 build·smoke 전에 먼저 push.
- smoke는 http://localhost:3001(또는 3000)에서만. 다른 포트의 지도 축소 실패는 알려진 문제다.
- 사실 문구(날짜·제도·기관)는 카드에 주어진 것만 쓴다. 없으면 `TODO(사실 확인)`.
- 사용자가 새 기획·아이디어를 말하면 바로 구현하지 않고 `F:\sm\vibe\elementary\INBOX.md`에 한 줄 추가한다
  ("지금 해" 또는 진행 중 카드 범위 안이면 예외). 결정은 적지 않고 Claude에게 넘긴다.
- 끝나면 카드 결과 칸에 5줄(브랜치/커밋 · 바꾼 파일 · 검증 · 다른 점 · Claude 몫).

이 블록은 작업 폴더 루트 `F:\sm\vibe\elementary\AGENTS.md` 맨 위와 같은 내용이다. 하나를 고치면 둘 다 고친다.
저장소 구조·빌드·데이터 계약은 작업 폴더 루트 `AGENTS.md`·`CLAUDE.md`와 이 폴더의 `CLAUDE.md`에 있다.
