# 배포 절차

Status: **Current**
Last updated: 2026-09-28
Owner: Operations

**2026-09-28 전환 완료.** 운영 배포는 이제 `release` 브랜치 push로 일어난다.
같은 전환으로 I-27의 딥링크 404가 해소됐다 — git 빌드는 저장소 루트의
`pjt_250826/vercel.json`을 쓰고 그 파일에는 처음부터 rewrite가 있었다.
코드 수정이 아니라 **배포 경로 변경이 해결책이었다.**

이 문서가 생기기 전까지 저장소에 배포 절차가 **전혀 없었다.** 배포 스크립트도
없고, 아키텍처 문서에는 "프론트엔드는 독립적으로 배포된다"는 한 줄뿐이었다.
그 결과 절차가 한 사람의 터미널 기록에만 존재했고, 실제로
[I-27](OPERATION_PLAN.md) 장애로 이어졌다.

## 한눈에

| | 2026-09-28 이전 | 현재 |
| --- | --- | --- |
| 운영 배포 실행 | 손으로 복사 후 CLI 배포 | `release`에 `git push` |
| 무엇이 올라갔는지 | 추적 불가 | 커밋 단위로 추적 |
| 설정 파일 | 저장소 밖 사본의 것 | 저장소에서 관리되는 것 |
| 되돌리기 | 예전 폴더를 찾아 재배포 | 대시보드에서 이전 배포 승격 |

`master` 푸시는 지금도 미리보기 배포를 만든다. 달라지는 것은 **운영 배포를
사람이 손으로 하느냐, `release` 브랜치가 하느냐**다.

전환은 끝났다. 남은 것은 무엇을 언제 `release`에 머지할지 정하는 일뿐이다.

---

## 1. 배포 후 반드시 실행하는 검증

방식과 무관하게 **배포할 때마다** 이것부터 확인한다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://wherecho.co.kr/admin/etl
```

- `200` → 정상
- `404` → **SPA rewrite가 빠진 배포다.** 첫 화면은 멀쩡해 보여도 모든 깊은
  경로가 죽어 있다. 2절을 확인한다

전체 검증은 다음 한 줄이며, 위 검사를 포함한다.

```bash
npm run browser:smoke:public -- https://wherecho.co.kr
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
| `pjt_250826/vercel.json` | **git 빌드 — 현재 운영 경로** | 있음 |
| `elementary-v2/vercel.json` | CLI 배포에서 앱 폴더가 루트일 때 | 있음 |

**둘 다 `rewrites`를 갖고 있어야 한다.** 하나라도 빠지면 그 경로로 나간 배포가
조용히 깨진다. 설정을 고칠 때는 둘을 함께 본다.

지금 운영에 실제로 적용되는 것은 **저장소 루트의 것**이다. 앱 폴더의 것은
CLI 배포용으로 남겨 둔다 — 둘 다 rewrite를 갖고 있어야 한다.

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

### ⚠️ 이것이 실제 위험이었다 (해소됨)

발견 당시 `main`에 push가 한 번만 들어가도 사이트가 그 프로토타입으로 교체될
수 있었다. 운영 브랜치로 지정돼 있고 자동 배포가 살아 있었기 때문이다.
GitHub UI에서 `main`을 대상으로 PR을 머지하는 것만으로도 발생한다. 아무도
그 브랜치를 건드리지 않아 사고가 나지 않았을 뿐이다.

**2026-09-28에 해소했다.** 운영 브랜치를 `release`로 옮기고 `main`을 삭제했다.

### `rootDirectory`는 `null`로 둔다

`elementary-v2`로 바꿔봤다가 되돌렸다. 그 값을 설정하면 CLI 배포가
`elementary-v2/elementary-v2`를 찾다가 실패한다. `null`이면 git 빌드가
저장소 루트를 쓰고, 그곳의 `vercel.json`이 rewrite를 갖고 있다. **현재
운영을 성립시키는 값이므로 바꾸지 않는다.**

### CLI 배포는 절반이 차단된다

`gitForkProtection`이 켜져 있어 CLI 배포는 `the commit author doesn't have
permission to create deployments`로 거부된다. 09-21 이후 기록을 보면 CLI
배포 10건 중 7건이 BLOCKED이고, **git 빌드는 한 번도 실패하지 않았다.**
`.deploy/` 사본이 10분 사이에 네 개 생긴 것은 재시도한 흔적이다.

주의할 점은 **CLI가 이 사유를 알려주지 않는다**는 것이다. 터미널에는
`Error: Not authorized`만 찍히고, 실제 사유는 배포 레코드에만 남는다.

```bash
npx vercel api "/v6/deployments?projectId=<id>&limit=5" --raw
# readyState: BLOCKED, errorMessage: the commit author doesn't have permission…
```

`Not authorized`를 로그인 문제로 오해하면 원인을 찾을 수 없다. 이 문구가
보이면 CLI 배포를 재시도하는 대신 `release`에 push한다.

## 4. 폐기된 수동 방식 (2026-09-28 제거)

운영이 `release` push로 나가기 시작하면서 다음은 모두 사라졌다. 왜 그런
방식이 존재했는지는 3절에 남겨 둔다.

- 워크스페이스 밖 `.deploy/<커밋해시>/app/` 사본 4개 — 삭제했다 (250MB)
- 그중 `school-switch-fix`는 등록된 git 워크트리였다 — 해제했다
- `npx vercel deploy --prod`를 손으로 실행하는 절차 — 더 쓰지 않는다
- `main` 브랜치 — 삭제했다. 내용은
  `archive/netlify-prototype-20250729` 태그로 보존했다

**되돌릴 일이 생기면 7절을 따른다.** 예전 폴더를 찾을 필요가 없다.

---

## 5. 릴리스하는 방법

운영 브랜치는 `release`이고 `master`는 미리보기다. 하루 열 몇 번씩 `master`에
push하는 속도에서 push마다 운영이 바뀌는 것은 맞지 않고,
`OPERATION_PLAN`의 웨이브 릴리스 게이트와도 어긋난다.

```
master  → 미리보기        (지금도 이미 그렇게 동작한다)
release → 운영
```

### 설정 (2026-09-28 적용 완료, 바꾸지 말 것)

| 항목 | 값 |
| --- | --- |
| Production Branch | `release` |
| Root Directory | (비움) |
| 환경변수 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_NAVER_MAPS_CLIENT_ID` — production·preview 양쪽 |

Production Branch는 `Settings → Environments → Production → Branch Tracking`
에 있다. `Settings → Git`이 아니다.

> 공개 Vercel API로는 이 값을 바꿀 수 없다. `PATCH /v9/projects/{id}`가 `link`도
> `productionBranch`도 거부하고(`should NOT have additional property`), CLI에는
> `git connect`/`disconnect`만 있다. **대시보드가 유일한 경로다.**

> Vercel은 해당 브랜치로 만들어진 배포가 없으면 Branch Tracking 설정을 거부한다
> (`No deployments found for ...`). 새 브랜치를 운영으로 지정하려면 먼저 그
> 브랜치에 push해 빌드를 한 번 돌려야 한다.

### 릴리스 절차

```bash
git checkout release
git merge master          # 올릴 범위를 정해서 머지한다
git push                  # 이 push가 곧 운영 배포다
```

배포가 끝나면 1절의 검증을 실행한다.

### 2026-09-28 전환 기록

| 한 일 | 결과 |
| --- | --- |
| Production Branch를 `release`로 변경 | 적용 |
| `release`에 push | git 빌드가 운영으로 나감 (READY) |
| 1절 검증 | `/admin/etl` 등 딥링크 200, I-27 해소 |
| `main` 삭제 | 완료. 내용은 `archive/netlify-prototype-20250729` 태그 |
| `.deploy/` 삭제 | 완료 (250MB) |

첫 운영 배포는 `release`를 당시 운영본 커밋에서 만들고 빈 커밋 하나만 올린
것이어서, **배포 내용이 이전과 완전히 동일했다.** 404만 사라졌다.

---

## 6. 미리보기를 쓸 것인가 — 네이버 지도와 SSO

네이버 지도 API는 **등록된 도메인에서만 동작한다.** 자동 배포를 켜면 브랜치마다
`elementary-xxxxx-….vercel.app` 형태의 **무작위 미리보기 주소**가 생기는데, 그
주소는 등록돼 있지 않아 **미리보기에서 지도가 뜨지 않는다.**

- 운영 주소 `wherecho.co.kr`(과 www)은 등록돼 있으므로 실제 사이트는
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

## 7. 도메인을 바꿀 때

> **2026-10-02 이전 완료. 운영 주소는 `https://wherecho.co.kr`이다.** 아래 순서 1~7을
> 모두 마쳤고, 무엇이 어디에 설정돼 있는지는 7.1절에 적었다.
> 아래 순서에서 **3번(`SITE_ORIGIN`)은 도메인이 Vercel에 연결되고 HTTPS로 응답한 뒤에만**
> 한다. 먼저 바꾸면 모든 canonical·사이트맵이 응답하지 않는 주소를 가리킨다.
> 공유 이미지(`public/og-image.jpg`)에도 이 도메인이 찍혀 있으므로, 도메인이 다시
> 바뀌면 이미지도 바꿔야 한다.

**색인이 쌓이기 전에 하는 편이 압도적으로 싸다.** 지금 사이트맵에 52,155개 주소가
있고, 등록·색인 후에 옮기면 전부에 301 리다이렉트를 걸고 재색인을 기다려야 한다.
슬러그를 URL 공개 전에 먼저 만든 것과 같은 이유다.

### 순서

1. **네이버 클라우드에 새 도메인을 먼저 등록한다.** 지도 키는 허용 도메인으로
   보호되므로, 등록 전에 새 주소로 들어가면 페이지는 뜨고 지도만 죽는다.
   [`index.html`](../../index.html)의 `navermap_authFailure` 핸들러가 이 경우
   원인을 말해주므로, 증상이 아니라 원인을 보게 된다.
2. Vercel 프로젝트에 도메인을 연결한다.
3. Vercel 환경변수 `SITE_ORIGIN`을 새 origin으로 설정한다(후행 슬래시는 있어도
   무해하게 제거된다). **production과 preview 양쪽에.**
4. 재배포한다. 빌드 로그의 `origin` 줄이 새 값과 `(SITE_ORIGIN)`을 함께 찍는지
   확인한다 — `(SITE_ORIGIN 미설정 - 기본값)`이면 변수가 안 걸린 것이다.
5. `npm run browser:smoke:public -- https://<새 도메인>`을 돌린다. `published
   addresses all name ...` 검사가 다섯 곳의 origin이 일치하는지 확인해준다.
6. 옛 주소에서 새 주소로 301을 걸어둔다. 이미 공유된 링크가 있고, 검색엔진에도
   이전을 알리는 정식 신호다.
7. 그 **다음에** Search Console·네이버 서치어드바이저에 등록하고 사이트맵을 제출한다.

### 무엇을 고쳐야 하는가 — 아무것도 없다

절대 주소를 찍는 모든 곳이 한 출처를 읽는다.

| 무엇 | 어디서 origin을 얻는가 |
| --- | --- |
| `index.html`의 canonical·og:url | 빌드 시 `vite.config.ts`의 `stampHtml` 플러그인이 채운다 |
| `robots.txt`의 Sitemap 지시문 | 빌드 후 `scripts/build-seo-files.mjs`가 생성한다 |
| 사이트맵 6개의 모든 `<loc>` | 같은 스크립트 |
| 프리렌더의 canonical·og:url | `api/detail.js`가 같은 환경변수를 읽는다 |

앞의 셋은 [`scripts/site-origin.mjs`](../../scripts/site-origin.mjs)를 쓴다.
프리렌더는 저장소 루트에서 배포되어 그 파일을 import할 수 없으므로 같은 변수를
읽고 같은 기본값을 들고 있다. **그건 약속이지 보장이 아니므로**, 공개 smoke가 네
곳이 실제로 내보내는 값을 서로 비교한다. 하나만 옮겨진 상태는 배포할 수 없다.

반대로 **손댈 필요가 없는 것**도 적어둔다. 공유 버튼과 클라이언트 canonical은
`window.location.origin`을 읽으므로 도메인을 자동으로 따라간다. 관리자 로그인은
`signInWithPassword`라서 Supabase redirect 허용목록과 무관하다.

### 7.1 현재 구성 — wherecho.co.kr

**리다이렉트 두 개는 코드가 아니라 Vercel 설정에 있다.** `vercel.json`을 읽어서는
보이지 않으므로 여기 적어 둔다.

| 무엇 | 어디에 | 값 |
| --- | --- | --- |
| 도메인 등록·DNS | 가비아 (네임서버 `ns.gabia.co.kr`) | 루트 A `216.198.79.1`, `www` CNAME → Vercel이 지정한 값 |
| `www` → 루트 | Vercel Domains | 308 |
| 옛 주소 `elementary-lovat.vercel.app` → 새 주소 | Vercel Domains | 301, 경로 유지 |
| `SITE_ORIGIN` | Vercel 환경변수 (Production·Preview) | `https://wherecho.co.kr` |
| 지도 허용 도메인 | 네이버 클라우드 Maps Application | 루트와 `www` |
| 검색엔진 | Search Console(도메인 속성, 가비아 TXT 인증)·네이버 서치어드바이저(`public/`의 HTML 파일 인증) | `sitemap.xml` 제출 완료 |

`SITE_ORIGIN`이 없을 때의 기본값(`scripts/site-origin.mjs`, `api/detail.js`)도 새
주소로 바꿨다. 옛 주소는 이제 301만 돌려주므로 기본값으로 둘 이유가 없다.

**옛 주소로 검증하지 않는다.** 1절의 `curl`을 옛 주소로 돌리면 `301`이 나와서, 멀쩡한
배포를 깨진 것으로 읽게 된다.

**robots.txt에 네이버 전용 블록을 넣지 않는다.** 서치어드바이저가 `User-agent: Yeti`
블록 생성을 권하지만, 검색로봇은 자기 이름의 블록이 있으면 `*` 블록을 무시한다. 그
블록만 넣으면 네이버에게 `/admin/` 차단이 풀린다. `*`가 이미 Yeti를 포함한다.

## 8. 되돌리기

Vercel 대시보드의 Deployments에서 이전 운영 배포를 골라 **Promote to
Production**을 누른다. 저장소를 건드리지 않고 즉시 되돌아간다.

되돌린 뒤 1절의 검증을 다시 실행한다. 그리고 `release`가 되돌린 내용과
어긋난 상태로 남으므로, 다음 릴리스 전에 브랜치를 맞춰 둔다.
