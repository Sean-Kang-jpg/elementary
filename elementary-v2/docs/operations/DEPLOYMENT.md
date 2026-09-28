# 배포 절차

Status: **Current — 전환 진행 중**
Last updated: 2026-09-28
Owner: Operations

이 문서가 생기기 전까지 저장소에 배포 절차가 **전혀 없었다.** 배포 스크립트도
없고, 아키텍처 문서에는 "프론트엔드는 독립적으로 배포된다"는 한 줄뿐이었다.
그 결과 절차가 한 사람의 터미널 기록에만 존재했고, 실제로
[I-27](OPERATION_PLAN.md) 장애로 이어졌다.

## 한눈에

| | 현재 방식 | 목표 방식 |
| --- | --- | --- |
| 운영 배포 실행 | 손으로 복사 후 CLI 배포 | `release`에 `git push` |
| 무엇이 올라갔는지 | 추적 불가 | 커밋 단위로 추적 |
| 설정 파일 | 저장소 밖 사본의 것 | 저장소에서 관리되는 것 |
| 되돌리기 | 예전 폴더를 찾아 재배포 | 대시보드에서 이전 배포 승격 |

`master` 푸시는 지금도 미리보기 배포를 만든다. 달라지는 것은 **운영 배포를
사람이 손으로 하느냐, `release` 브랜치가 하느냐**다.

**남은 작업은 Vercel 설정값 하나다**(5절). 저장소 쪽 준비는 끝났다.

---

## 1. 배포 후 반드시 실행하는 검증

방식과 무관하게 **배포할 때마다** 이것부터 확인한다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://elementary-lovat.vercel.app/admin/etl
```

- `200` → 정상
- `404` → **SPA rewrite가 빠진 배포다.** 첫 화면은 멀쩡해 보여도 모든 깊은
  경로가 죽어 있다. 2절을 확인한다

전체 검증은 다음 한 줄이며, 위 검사를 포함한다.

```bash
npm run browser:smoke:public -- https://elementary-lovat.vercel.app
```

> 이 검사가 왜 필요한가: I-27 당시 첫 화면은 정상이었고 아무도 이상을 느끼지
> 못했다. smoke가 첫 화면만 열었기 때문이다. 2026-09-27에 깊은 경로 검사를
> 추가했고, 운영에 대해 404로 실패하고 정상 서버에 대해 통과하는 것을 양방향
> 확인했다.

---

## 2. 설정 파일 — 어느 것이 실제로 쓰이는가

두 개가 존재하며 **배포 방식에 따라 쓰이는 것이 다르다.** I-27의 원인이 정확히
이 지점이었다.

| 파일 | 언제 쓰이나 | `rewrites` |
| --- | --- | --- |
| `elementary-v2/vercel.json` | 앱 폴더가 배포 루트일 때 (현재 방식, 그리고 목표 방식) | 있음 |
| `pjt_250826/vercel.json` | git 루트가 배포 루트일 때 (지금은 쓰이지 않음) | 있음 |

**둘 다 `rewrites`를 갖고 있어야 한다.** 하나라도 빠지면 그 경로로 나간 배포가
조용히 깨진다. 설정을 고칠 때는 둘을 함께 본다.

전환이 끝나면 `pjt_250826/vercel.json`은 불필요해지지만, 배포 루트를 되돌릴
경우를 대비해 남겨둔다.

---

## 3. 왜 수동 배포를 하게 됐는가 — 운영 브랜치가 엉뚱한 곳을 가리킨다

2026-09-28에 Vercel 프로젝트 설정을 직접 조회해 원인을 확인했다.

```
link.productionBranch : "main"     ← 작업 브랜치는 "master"
rootDirectory         : null
link.type             : "github"   ← GitHub는 이미 연결돼 있다
```

**GitHub 연결은 처음부터 되어 있었다.** 다만 Vercel이 운영 브랜치로 지정한
`main`이 실제 작업 브랜치가 아니다. `master`가 트렁크이고, `main`은 프로젝트
생성 직후의 스텁 그대로 남아 있다.

```
main    9fe491a  "Add files via upload"   커밋 2개, 2025년 생성 시점 그대로
master  0d42ca1  main보다 77커밋 앞섬      실제 작업 브랜치
```

그래서 `master`에 아무리 push해도 운영 배포가 일어나지 않고 미리보기만 쌓인다.
`.deploy/` 수동 절차는 **이 불일치를 우회하려고 생긴 것**이다.

### ⚠️ 방치하면 안 되는 위험

**`main`에 push가 한 번 들어가면 사이트가 초기 커밋 상태로 교체된다.** 운영
브랜치로 지정돼 있고 자동 배포가 살아 있기 때문이다. GitHub UI에서 실수로
`main`을 대상으로 PR을 머지하는 것만으로도 발생한다. 지금까지 아무도 `main`을
건드리지 않아 사고가 나지 않았을 뿐이다.

해소는 아래 두 가지를 함께 하는 것이다.

1. 운영 브랜치를 `release`로 바꾼다 (5절)
2. 쓰지 않는 `main` 스텁을 삭제한다

1번만 해도 위험은 사라진다. 2번은 혼란을 줄이기 위한 정리다.

### `rootDirectory`는 건드리지 않는다

`elementary-v2`로 바꿔봤다가 되돌렸다. 그 값을 설정하면 CLI 배포가
`elementary-v2/elementary-v2`를 찾다가 실패한다 — 즉 **수동 배포 경로가
끊긴다.** `null`인 상태에서는 git 빌드가 저장소 루트의 `pjt_250826/vercel.json`을
쓰고, CLI 배포는 업로드한 폴더의 `elementary-v2/vercel.json`을 쓴다. 두 파일
모두 rewrite를 갖고 있으므로 **어느 경로로 나가든 안전하다.** 이것이 2절에서
둘 다 유지하라고 한 이유다.

## 4. 현재 방식의 실제 절차

> **주의: 아래는 남아 있는 산출물에서 역추적한 것이다.** 이 절차를 만든
> 사람에게 확인받기 전까지 정확하다고 가정하지 않는다. 자동화 스크립트는
> 저장소 어디에도 없다.

관찰된 사실:

- 배포는 git 연동 빌드가 아니라 **Vercel CLI 배포**다
- 배포 루트는 워크스페이스 밖의 `.deploy/<커밋해시>/app/` — `elementary-v2/`
  전체를 복사한 사본
- `.vercel/project.json`의 `rootDirectory`는 `null`이고, 모든 사본이 같은
  Vercel 프로젝트(`elementary`)를 가리킨다
- 현재 운영본은 `.deploy/f13a896/app/`에서 나갔다 (2026-09-27 12:07)

재구성한 절차:

```bash
# 1) 배포할 커밋의 앱 폴더를 사본으로 만든다
#    (.vercelignore가 .env, node_modules, 대용량 데이터를 제외한다)
# 2) 그 사본에서 배포한다
cd .deploy/<커밋해시>/app
npx vercel deploy --prod
# 3) 1절의 검증을 실행한다
```

**이 방식의 함정**: 사본에 들어가는 `vercel.json`이 저장소의 것과 달라질 수
있다. I-27이 바로 그 경우였다 — 저장소에는 올바른 설정이 있었지만 사본의
설정에는 `rewrites`가 없었다. 사본을 만들 때 `elementary-v2/vercel.json`을
**그대로** 가져가는지 확인한다.

### 안전한 점

`.vercelignore`(저장소에서 관리됨)가 `.env`와 `.env.*`를 제외하므로
**비밀키는 업로드되지 않는다.** 남아 있는 사본들을 확인한 결과 실제 `.env`는
없었고 빈 템플릿 `.env.example`만 있었다.

---

## 5. 목표 방식으로 전환하기

운영 브랜치를 `release`로 두고, `master`는 미리보기로만 쓴다. 하루 열 몇 번씩
`master`에 push하는 작업 속도에서 push마다 운영이 바뀌는 것은 맞지 않고,
`OPERATION_PLAN`의 웨이브 릴리스 게이트와도 어긋난다.

```
master  → 미리보기        (지금도 이미 그렇게 동작한다)
release → 운영
```

### 준비 — 완료됨

- `elementary-v2/vercel.json`이 추적 대상이 되었고 `rewrites`를 갖췄다
- public smoke가 깊은 경로를 검사한다
- 환경변수 3종(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_NAVER_MAPS_CLIENT_ID`)이 production·preview 양쪽에 등록돼 있다
- GitHub 연결도 이미 되어 있다
- `release` 브랜치를 현재 운영본 커밋 `f13a896`에서 만들어 push했다. 운영에
  올라가 있는 내용과 브랜치가 일치한 상태로 시작한다

### 남은 단 하나 — 대시보드에서만 가능하다

```
Vercel → elementary → Settings → Git → Production Branch
  main  →  release
```

`Root Directory`는 `null` 그대로 둔다(3절 참조).

설정을 바꿔도 **그 순간 배포가 일어나지는 않는다.** 다음에 `release`에 push할
때부터 적용된다. 바꾼 뒤 `main` 스텁을 삭제하면 3절의 위험도 함께 없어진다.

> **왜 자동화하지 않았나**: 공개 Vercel API에 운영 브랜치를 바꾸는 경로가 없다.
> `PATCH /v9/projects/{id}`는 `link`도 `productionBranch`도 받지 않고
> (`should NOT have additional property`), CLI에는 `git connect`/`disconnect`만
> 있다. `git connect`는 GitHub 기본 브랜치인 `master`를 운영 브랜치로 잡으므로
> 원하는 결과가 아니다. 대시보드가 유일한 경로다.

### 전환 후 릴리스 방법

```bash
git checkout release
git merge master          # 올릴 범위를 정해서 머지한다
git push                  # 이 push가 곧 운영 배포다
```

배포가 끝나면 1절의 검증을 실행한다.

### 전환 순서

| # | 할 일 | 실행 주체 |
| --- | --- | --- |
| 1 | Production Branch를 `release`로 변경 | 대시보드 권한자 |
| 2 | `release`에 push해 운영 배포가 도는지 확인 | — |
| 3 | 1절 검증으로 I-27의 404가 사라졌는지 확인 | — |
| 4 | 미리보기를 쓸지 결정 (6절) | — |
| 5 | `.deploy/` 삭제, 이 문서의 4절 제거 | — |

---

## 6. 미리보기를 쓸 것인가 — 네이버 지도와 SSO

네이버 지도 API는 **등록된 도메인에서만 동작한다.** 자동 배포를 켜면 브랜치마다
`elementary-xxxxx-….vercel.app` 형태의 **무작위 미리보기 주소**가 생기는데, 그
주소는 등록돼 있지 않아 **미리보기에서 지도가 뜨지 않는다.**

- 운영 주소 `elementary-lovat.vercel.app`은 등록돼 있으므로 실제 사이트는
  영향 없다
- 같은 성격의 제약이 이미 [I-08](OPERATION_PLAN.md)로 기록돼 있다
  (`localhost`는 허용, `127.0.0.1`은 아님)
- **미리보기 배포는 Vercel SSO로 보호돼 있다.** 로그인 없이 열면
  `vercel.com/sso-api`로 리다이렉트된다. 즉 네이버에 주소를 등록해도 링크를
  공유해 남에게 보여줄 수는 없다. 보호를 끄는 것은 공개 URL을 만드는 별개
  결정이다

선택지:

- 네이버 클라우드 콘솔에 미리보기 도메인을 추가 등록한다
- 미리보기에서는 지도 외의 것만 확인하고, 지도는 운영 배포 후 확인한다
- **또는 미리보기를 쓰지 않는다.** 일상 확인은 `npm run build && npm run preview`로
  하면 localhost가 이미 네이버에 허용돼 있어 지도까지 그대로 보인다. 현재
  선택한 방식이다

---

## 7. 되돌리기

전환 전에는 이전 `.deploy/<해시>/app/`에서 다시 배포한다. 전환 후에는 Vercel
대시보드의 이전 배포에서 승격(Promote)한다.

어느 쪽이든 되돌린 뒤 1절의 검증을 다시 실행한다.
