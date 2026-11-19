# Claude · Codex 협업 R&R (R2)

작성·적용 2026-11-19 · 대체: `CODEX_UX_HANDOFF.md` 1~4절(2026-11-01 R1, 보관 `archive/CARDS_2026-11.md`)
이 문서가 역할·진행·기록의 기준이다. 상태판은 [CODEX_UX_HANDOFF.md](CODEX_UX_HANDOFF.md), 아이디어 `F:\sm\vibe\elementary\INBOX.md`(git 밖), 결정 [DECISIONS.md](DECISIONS.md).
Codex가 자동으로 읽는 요약은 git 루트와 작업 폴더 루트의 `AGENTS.md`(부록 A) — 이 문서와 함께 고친다.
저장소 규칙은 루트 `AGENTS.md`·`CLAUDE.md`가 우선한다.

## 0. 사용자 결정 (2026-11-19)

1. 배포 경로는 **Claude 하나**. Codex는 master·release에 push하지 않는다.
2. 교차 검토는 **되돌리기 어려운 변경에만, 5건 시험 운영** 뒤 유지 여부를 정한다(5절).
3. 결과 5줄 양식, 상태판 하나, 진행·보관 규칙(7·8절).
4. 역할별 에이전트(PO·UX·UI)는 두지 않는다. 작업 유형별로 "누가 정하고 누가 하는지"만 정한다(3절).

## 1. 왜 고쳤나 — R1과 실제의 차이

R1(11-01)은 "Claude = 상태·구조·검토·병합·배포, Codex = 명세가 닫힌 S·M 카드"였다. 11-05~18 실제로는 Codex가 프런트 UX를
트랙 단위로 기획→구현→배포했고(FNL-00~10, 가이드 연결, 일정 진입, 학교 확인 목록), Claude는 데이터·ETL(방과후 적재, 학원 갱신,
SQL 42·43·44, 학교 정리)을 맡았다. 문서에는 반영되지 않았다.

반복된 비용: ① Codex smoke가 3001 밖 포트에서 지도 축소 검사에 매번 실패(Naver 허용 호스트) ② Codex 토큰 만료로 중단(C-03)
③ 카드당 15~20줄 결과 기록(문서 438줄) ④ 배포 권한 모호(11-18 자동 승인 검토가 Codex push 거부, `plan-checks` 대기)
⑤ worktree 12개·미병합 브랜치 3개 ⑥ 결정과 아이디어가 CLAUDE.md·백로그·메모리·카드에 흩어짐.

## 2. 원칙 — 토큰 비대칭

지금은 Claude 토큰이 여유 있고 Codex가 빠듯하다.

- **토큰을 많이 먹는 일은 Claude**: 대량 읽기·LLM 추출(하위 에이전트), 통합·충돌 해결, 전체·운영 smoke, 문서 갱신, ETL.
- **Codex는 한 세션에 끝나는 판단 밀도 높은 일**: 프런트 구현 카드, 교차 검토.
- **검증은 한 번만**: Codex는 lint·typecheck·test:unit·자기 카드 smoke 블록까지. 전체 smoke(3001)·운영 smoke는 Claude가 병합·배포 때.
- **배포 경로는 하나**: 병합·release는 Claude, 사용자 승인은 배포 묶음 단위로 한 번.

## 3. 누가 정하고 누가 하나

역할별 에이전트는 두지 않는다. 사람 1명·에이전트 2개에서 PO·UX·UI 에이전트를 나누면 넘겨주는 단계만 늘고 맥락이 끊긴다.
지금까지의 사고도 역할이 섞여서가 아니라 넘겨주는 지점(worktree·배포·오래된 작업 트리)에서 났다.
전문 관점이 필요하면 Claude가 그 작업 안에서 하위 에이전트로 부른다(추출에 소네트를 쓰는 것과 같은 방식).

| 작업 유형 | 정한다 | 한다 | 확인한다 |
| --- | --- | --- | --- |
| 기획(방향·우선순위·범위) | U | K가 정리(백로그·카드·결정 기록) | U |
| UX·화면 문구 | U(문구 확정) | K 초안 · C 구현 카드 | K 검토 |
| 사실 문구(날짜·제도·기관) | U(출처 확인) | K·C는 주어진 것만 씀 | K |
| 프런트 개발 | K(카드 명세) | C 카드 / K 구조·저장·라우팅 | K(병합 게이트) |
| 데이터·ETL·SQL | U(운영 쓰기 승인) | K | C 교차 검토(5절 대상만) |
| 검증·배포 | U(배포 묶음 승인) | K | K 운영 smoke |
| 운영(정기 ETL·감시·복구) | U(쓰기 승인) | K | — |
| 브랜딩·마케팅(릴스 구성·카피·SEO·GA4) | U | K | U |
| 개별 이미지 생성(릴스 소재·썸네일·일러스트) | U(톤·채택) | C(이미지 생성, K가 호출) | K(규격) · U(채택) |

Codex가 하지 않는 것: master·release push, 운영 DB 쓰기, SQL 적용, 저장 형식 변경, 사실 문구 창작, 카피·브랜딩 결정.

### 이미지 생성 — Claude가 Codex를 호출 (4-1)

Codex CLI의 `image_generation`(stable)을 Claude가 Bash에서 비대화형으로 부른다. 사람이 두 세션 사이를 옮길 필요가 없다.

```bash
# 이미지 전용 폴더에서, 그 폴더만 쓰기 허용 (저장소 AGENTS.md가 읽히지 않게)
codex exec --skip-git-repo-check -C "F:/sm/vibe/elementary/reels/briefs/<묶음>" \
  --sandbox workspace-write -o result.txt - < brief.md
# 고치기: 같은 세션 이어서
codex exec resume --last "2번 컷만 배경을 더 밝게"
```

- **브리프 한 파일에 여러 장**(Codex 사용량 절약): 장마다 용도·크기(예 1080×1920)·색(코랄 웜 톤)·구도·금지 사항, 저장 파일명. Codex가 되물을 수 없으니 모두 적는다.
- **이미지에 글자·사실을 넣지 않는다**: 한글이 깨지고 학교명·숫자·날짜를 검증할 수 없다. 글자는 Remotion·HTML에서 얹는다. 실존 학교·아파트 외관, 실제 아동 얼굴 사진풍, 타 서비스 로고·화면도 금지.
- 산출물은 `~/.codex/generated_images/<세션>/`에 생기고 브리프 폴더로 복사하게 한다. 채택본만 `reels/public/`으로. 실행마다 사용자 허락(외부 에이전트 호출).
- 기록: 브리프와 채택 여부는 `reels/briefs/<묶음>/`에 남긴다. 생성 원본 전체는 커밋하지 않는다.
- 이 경로는 사용자가 Codex 세션을 따로 띄울 필요가 없지만 **Codex 한도를 쓴다** — 묶음 단위로, 하루 1~2회.

## 4. 파일 소유 (상시)

| 구분 | 파일 | 규칙 |
| --- | --- | --- |
| Claude 단독 | `src/utils/familyPlan.ts`·`familyPlanCore.ts`·`profile.ts`·`urlState.ts`, `BottomNavigation.tsx`, `sql/**`, `etl/**`, `api/**`, `vercel.json`, `scripts/build-seo-files.mjs`, 두 `CLAUDE.md`, 이 문서 | Codex는 필요한 함수를 결과 칸에 요청 |
| 공유(카드에 적힐 때만 Codex) | `src/utils/schedule/**`(새 순수 함수는 가능, 기존 엔진 동작 변경은 Claude), `src/components/**`, `src/content/**`, `scripts/build-shell-pages.mjs` | 쌍 파일 규칙(`homeShelves.ts` ↔ `seasonCards()`, 새 이벤트 ↔ `MEASUREMENT_PLAN.md`) 유지 |
| 추가만 | `scripts/public-smoke.mjs` | 자기 카드 검사 블록 추가만, 기존 조건 변경 금지 |
| 누구나 한 줄 추가 | `F:\sm\vibe\elementary\INBOX.md`(작업 폴더 루트, git 밖) | 6절. 두 세션이 늘 같은 파일을 보게 git 밖에 둔다 |

## 5. 교차 검토 (시험 운영 5건)

- **대상**: 되돌리기 어려운 변경만 — 운영 SQL 적용, 표 전체 교체 ETL(serving·학원·하교 예상 적재), 공개 주소·키 규칙. UI는 대상 아님.
- **근거**: 비쌌던 사고가 모두 이 종류였다 — serving 함수의 선택형 배정 누락(11-04, 경북 6곳+), 오래된 작업 트리 업로드(11-15→17 복구), 키 업로더의 합침·분할 거부(11-05).
- **방식**: Claude가 커밋 범위와 고정 질문 3개를 넘긴다 — ① 다른 행·지역·키를 의도치 않게 바꾸는가 ② 실패하면 부분 쓰기가 남는가 ③ 되돌리는 방법이 실제로 동작하는가. Codex는 코드를 고치지 않고 텍스트 의견만 돌려준다. 사용자가 Codex 세션에 붙여 넣는다.
- **기록**: 결정 기록(6절)에 `교차검토 n/5 — 대상 · 발견 있음/없음` 한 줄.
- **종료 조건**: 5건 동안 실질 발견이 0이면 그만둔다. 1건이라도 있으면 유지.

## 6. 진행 중 들어오는 기획·아이디어·결정

사용자가 어느 세션에서든 새 기획이나 아이디어를 말하면:

1. **바로 구현하지 않는다.** 예외: 사용자가 "지금 해"라고 하거나, 진행 중 카드의 범위 안에서 끝나는 수정.
2. **`F:\sm\vibe\elementary\INBOX.md`에 한 줄 추가**(받은 세션이 직접. git 밖이라 커밋하지 않는다 — 작업 트리가 뒤처져도 두 세션이 같은 파일을 본다):
   `- 2026-11-19 · Codex · "사용자 말 그대로" · 관련: UX-20`
3. **Claude가 정리**: 세션 시작 때 INBOX를 읽고 항목마다 `카드로`(백로그 ID) · `결정 필요`(사용자에게 질문) · `보류`(다시 볼 시기) · `폐기`(이유) 중 하나로 분류한다.
   우선순위는 사용자에게 묻는다. 정리된 줄은 INBOX에서 지우고 행선지에 옮긴다.
4. **진행 중 작업과 부딪히면**(이미 만든 것을 뒤집는 기획): 해당 카드를 `blocked`로 두고 사용자에게 계속/중단을 묻는다. 두 세션이 각자 해석해 진행하지 않는다.

**결정**은 아이디어와 따로 `docs/operations/DECISIONS.md`에만 적는다(날짜 · 결정 · 이유 · 영향 받는 카드). 양쪽 세션 모두 시작할 때 읽는다.
백로그 2절·메모리·CLAUDE.md는 이 파일을 가리키기만 한다. 사용자 결정이 대화에만 있고 이 파일에 없으면 없는 것으로 본다.

## 7. 카드 흐름과 진행 상황

**카드** — Claude가 쓴다: 바꿀 파일, 명세, 완료 기준, 주어진 사실 문구, 크기. Codex 한 세션에 안 끝날 크기면 쪼갠다.

**Codex 실행**
- worktree `../.worktrees/codex-<ID>`, 브랜치 `codex/<ID>-<이름>`, 한 카드 한 브랜치.
- smoke는 `http://localhost:3001`(또는 3000)에서만.

**중간 상황을 보이게 하기 (세션 한도 대비)** — 진행 상황은 대화가 아니라 git에 남긴다. 그래야 세션이 끊겨도 다른 쪽이 읽는다.

| 때 | 하는 일 |
| --- | --- |
| 시작 | 상태판 줄을 `in-progress`로, 빈 커밋 `WIP 0/m: 계획 — 단계1, 단계2, …` push(단계 수 m을 먼저 정함) |
| 단계마다 | 커밋 `WIP n/m: 한 일` + 본문 `다음: …` 한 줄 → push. 검증 전이어도 push |
| 무거운 일 직전 | 전체 build·smoke·대량 읽기 전에 먼저 체크포인트 push(한도는 주로 여기서 걸린다) |
| 끝 | 결과 5줄 → 상태판 `review` → push |

- 확인하는 쪽: `git fetch && git log --oneline origin/master..origin/codex/<브랜치>`. 마지막 `WIP n/m`과 `다음:`이 곧 진행률이다.
- 끊긴 뒤 커밋하지 못한 변경은 worktree에 남는다 — Claude가 `git -C ../.worktrees/<이름> status`·`diff`로 읽고 잇는다(C-03 선례). 지우지 않는다.
- 남지 않는 것은 **판단의 이유**뿐이다. 그래서 `다음:` 줄과, 카드와 다르게 한 결정은 그 단계 커밋 본문에 바로 적는다.
- Claude도 같은 규칙: 긴 작업은 단계 커밋, 세션 끝에 `CLAUDE.md` 진행 절. 사용자가 진행을 물으면 상태판과 브랜치 로그로 답한다.

**결과 칸 — 5줄 이내**
```
브랜치/커밋: codex/…  abc1234 (push 완료)
바꾼 파일: a.tsx, b.ts (+ 카드 밖: 없음 | 이유)
검증: lint ✓ typecheck ✓ unit N/N ✓ smoke 블록 ✓
카드와 다른 점·막힌 점: …
Claude 몫으로 남긴 것: …
```

**Claude 받기**: 브랜치 읽기 → `/code-review` → 작은 수정은 직접 → master 병합 → 상태판 `merged` → 배포 묶음 → 사용자 승인 → release → 운영 smoke → `released`.

**상태판** — `CODEX_UX_HANDOFF.md` 맨 위 표 하나. C·FNL·UX·데이터 작업 모두 한 줄씩.

| ID | 제목 | 담당 | 브랜치 | 상태 | 갱신일 |
| --- | --- | --- | --- | --- | --- |

상태: `ready` · `in-progress` · `blocked`(이유) · `review` · `merged` · `released`. 상태가 바뀐 쪽이 그 자리에서 고친다(Codex는 자기 브랜치에서, 병합 때 반영).
`CLAUDE.md`의 '진행 중 작업'은 상태판을 다시 적지 않고 맥락·대기 중인 사용자 몫만 적는다.

## 8. 보관(아카이빙) 규칙

| 대상 | 언제 | 어디로 |
| --- | --- | --- |
| 카드 본문 | `released` 뒤 14일 | `docs/operations/archive/CARDS_YYYY-MM.md`(배포 달 기준), 상태판 줄은 `released`로 남겼다가 월말에 함께 이동 |
| INBOX 줄 | 분류 즉시 | 행선지(백로그·카드·DECISIONS)로 옮기고 삭제. `보류`는 INBOX 아래 '다시 볼 것' 절에 시기와 함께. INBOX는 git 밖이라 월말에 보류 목록을 `CLAUDE.md` 사용자 몫 절과 대조 |
| DECISIONS | 지우지 않는다 | 뒤집힌 결정은 줄을 남기고 `→ YYYY-MM-DD 대체` 표시 |
| worktree | 병합 후, 미커밋 파일이 없을 때 | 삭제(`git worktree remove`). 미커밋 파일이 있으면 지우지 않고 상태판에 적어 사용자에게 |
| 브랜치 | `released` 뒤 | 로컬 삭제, 원격은 월말에 정리(병합된 것만) |
| `CLAUDE.md` 진행 절 | 끝난 절 | 색인 한 줄로(기존 End Of Session 규칙) |
| 날짜 붙은 REPORT·research 파일 | 보관 안 함 | 분석 결과로 그대로 둔다 |

정리 주기: 세션 시작마다 INBOX, 매월 마지막 세션에 카드·상태판·브랜치·worktree.

## 9. 적용 정리 (Claude)

| # | 일 | 상태 |
| --- | --- | --- |
| 1 | 이 문서·`DECISIONS.md`·작업 폴더 루트 `INBOX.md`, 두 `AGENTS.md`(부록 A) | 완료 11-19 |
| 1b | 옛 협업 정의를 이 문서로 돌리기(부록 B) | 완료 11-19 |
| 2 | 상태판 신설, R1 카드 보관 이동 | 완료 11-19 |
| 3 | `codex/plan-checks-20261118` 검토 → 병합 → 배포 묶음 | 다음 (release는 사용자 승인) |
| 4 | `codex/ga4-registration-20261112` 검토·병합, `codex/ux-16-time-sort` 삭제 확인 | 다음 |
| 5 | 병합 끝난 worktree 정리 | 다음 (미커밋 파일 있으면 보고만) |

## 10. 다음 차수 분담 (12월 취학통지 시즌까지, 제안)

| 담당 | 일 |
| --- | --- |
| Codex | 학교 확인 목록 후속 2·3(재설정 문구, 마지막 완료 문구) · FNL-09 랜딩 `(not set)` 진단 · UX-11(내용이 오면) · 교차 검토 · 이미지 생성 |
| Claude | 카드 작성·검토·배포 · INBOX 정리 · UX-19·20 고민 카드(첫 3장 배포, 보류 3장) · 방과후 지역 확대 추출 · 12월 정기 ETL 감시 · UX-23 결정 자료 |
| 사용자 | 배포 묶음 승인 · INBOX 우선순위 · UX-11 내용 · 고민 카드 확정 · 학교 문의 |

## 부록 A. Codex가 자동으로 읽는 규칙 (두 `AGENTS.md`)

**왜 두 곳인가**: Codex는 세션이 **시작된 폴더** 기준으로, git 루트부터 그 폴더까지의 `AGENTS.md`를 시작할 때 한 번 읽는다.
VS Code의 Codex는 `F:\sm\vibe\elementary`(git 저장소 아님)에서 시작하므로 그 폴더의 `AGENTS.md`가 읽히고,
`codex exec`나 worktree 안에서 시작한 세션은 git 루트 `pjt_250826/AGENTS.md`(커밋되어 모든 브랜치·worktree에 있음)를 읽는다.
그래서 같은 블록을 두 곳 맨 위에 둔다. 사용자가 매 세션 "읽어라"고 할 필요는 없다. 이미 열려 있던 세션은 다시 읽지 않으니 새로 연다.
전역 `~/.codex/AGENTS.md`는 다른 프로젝트에도 걸리므로 쓰지 않는다. 이 문서 전체는 필요할 때만 읽게 한다(Codex 토큰).

```markdown
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
```

VS Code의 Codex를 `F:\sm\vibe\elementary`(git 저장소 아님)에서 열면 그 폴더의 `AGENTS.md`를 읽는다. 그 파일에도
"Codex 규칙은 `pjt_250826/AGENTS.md`" 한 줄을 더한다.

## 부록 B. 이 문서로 돌릴 옛 협업 정의

| 파일 | 지금 | 바꿀 것 |
| --- | --- | --- |
| `docs/operations/CODEX_UX_HANDOFF.md` 1~3절 | R1 역할·기준·주고받기 | 삭제 → "역할·규칙은 AGENT_COLLAB_RR.md" 한 줄 + 상태판 |
| `docs/product/UX_BACKLOG_PLAN_CENTERED.md` 5절 | "담당 기준은 HANDOFF 2절" | → AGENT_COLLAB_RR.md 3절 |
| `docs/product/FUNNEL_IMPROVEMENT_BACKLOG_20261105.md` 머리 | "실행 방식: Codex 작업 인계" | → AGENT_COLLAB_RR.md |
| `pjt_250826/CLAUDE.md` Current Product State | "Codex 분담 CODEX_UX_HANDOFF.md(C-01~09)" | → 이 문서 + 상태판 |
| `F:\sm\vibe\elementary\AGENTS.md`·`CLAUDE.md` | 협업 언급 없음 | 한 줄 포인터 |
| Claude 메모리 `plan-centered-ux` | "Codex는 S·M만" | R2 기준으로 갱신 |
