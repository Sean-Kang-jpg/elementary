# Track D. 네이버 로봇·서버 접근 진단

측정일 2026-10-24. 읽기 전용(Vercel CLI `logs`·`api` GET, DNS 조회, HTTP 요청). 설정은 바꾸지 않았다.

## 요약

| 항목 | 결과 | 판정 |
| --- | --- | --- |
| 1. Yeti 요청 여부 | **확인 불가** — Vercel 요청 기록에 User-Agent가 없고 보존이 약 1시간 | 미확인 |
| 2. Yeti 요청별 상태·응답 시간 | 확인 불가 (같은 이유) | 미확인 |
| 3. 403/404/429/5xx 비율 | 과거 기록 없음. 이번 감사 요청 1,000여 건에서 5xx·429·403 **0건** | 현재 시점 정상 |
| 4. Cloudflare WAF·Bot Protection | **경로에 Cloudflare 없음** (DNS 가비아, A 레코드가 Vercel로 직접) | 해당 없음 |
| 4'. Vercel 방화벽·보호 | 방화벽 설정 없음(API `Config not found`), 비밀번호 보호 없음, 배포 보호는 커스텀 도메인 제외 | 차단 요인 없음 |
| 5. robots.txt의 Yeti 허용 | `User-agent: *` / `Allow: /` / `Disallow: /admin/`, `/frontyard` | 허용 |
| 6. 사이트맵 요청 기록 | 정적 파일 요청은 기록에 나오지 않음 | 미확인 |
| 7. rate limit·보안 미들웨어 | 미들웨어 파일 없음, rate limit 설정 없음. Yeti UA 연속 요청 수백 건에 429 0건 | 차단 요인 없음 |
| 8. www/http 리디렉션 | 일관됨 (아래 표). `308` 사용 | 정상, 한 가지 확인 필요 |

**결론: 설정에서는 네이버 로봇을 막을 요인을 찾지 못했다. 그러나 로그가 없어 "로봇이 오지 않았는지", "왔는데 실패했는지"를 가릴 수 없다.**
H6은 *약화*되었을 뿐 *기각*되지 않았다. 관찰 수단을 만드는 것이 이 트랙의 가장 중요한 결과물이다.

## 1. 경로와 인프라

- `nslookup`: NS `ns.gabia.co.kr`, `ns1.gabia.co.kr`, `ns.gabia.net`. A `216.198.79.1`(Vercel).
- 응답 헤더: `Server: Vercel`, `X-Vercel-Id: icn1::…`(서울 리전 엣지), `cf-ray` 등 Cloudflare 헤더 없음.
- 따라서 지시서의 Cloudflare 점검 항목은 이 사이트에 해당하지 않는다. 앞으로 Cloudflare 프록시를 켤 계획이 있다면 그때 Bot Fight Mode가 Yeti를 막지 않는지 다시 본다.
- Vercel 프로젝트(`prj_1H2V…`): `ssoProtection.deploymentType = all_except_custom_domains`(프리뷰만 보호), `passwordProtection` 없음, 방화벽 구성 조회 결과 없음.
- 로컬 망에서 Yeti UA로 요청한 `robots.txt`·사이트맵 9개·페이지 900여 건이 모두 200/404(의도된 404)였다. **실제 네이버 IP 대역에서 같은지는 확인하지 못했다** — Vercel의 기본 DDoS 완화는 IP 기반이라 로컬 시험으로 대신할 수 없다.

## 2. 리디렉션

| 요청 | 응답 |
| --- | --- |
| `http://wherecho.co.kr/` | 308 → `https://wherecho.co.kr/` |
| `https://www.wherecho.co.kr/` | 308 → `https://wherecho.co.kr/` |
| `http://www.wherecho.co.kr/` | 308 → `https://www.wherecho.co.kr/` → 308 → apex (2단계) |
| `https://elementary-lovat.vercel.app/` | 301 → `https://wherecho.co.kr/` |
| `/index.html` | 200, canonical `/` |
| `/guide/` | 200, canonical `/guide` |
| 상세 끝 슬래시 `/school/…/` | 404 |

- 사이트맵·canonical이 모두 `https://wherecho.co.kr` 형식이라 로봇이 리디렉션을 탈 일은 거의 없다.
- **확인 필요**: 네이버 문서가 영구 이동으로 `301`을 안내하는지, `308`도 같게 처리하는지 공개 자료로 확인하지 못했다. `http://`나 `www`로 들어온 외부 링크가 있을 때만 의미가 있다. Vercel 도메인 설정에서 리디렉션 코드를 301로 바꿀 수 있다(운영 설정 변경이라 별도 승인).

## 3. 로그로 확인할 수 있는 것과 없는 것

`vercel logs --environment production --since 30d -j`로 조회한 결과:

- 반환된 기록은 조회 직전 약 1시간 것뿐이었다(30일을 요청해도). 관찰된 보존 기간은 약 1시간이다.
- 필드: 시각, 경로, 상태 코드, 캐시 HIT/MISS, source(serverless 등). **User-Agent·IP 필드가 없다.**
- 정적 파일(`robots.txt`, 사이트맵, 홈, 가이드) 요청은 나오지 않았다. 함수(`api/detail.js`) 요청만 보인다.

따라서 10/6~10/24의 Yeti 방문, 사이트맵 읽기, 실패 응답 여부는 **어떤 방법으로도 이제 복원할 수 없다.**

### 서치어드바이저 수치와의 대조 (추정)

- 10/6 "6페이지 · 128 KB · 98 ms": 정적 페이지는 HTML 7~32 KB(gzip 2~6 KB), 허브는 최대 102 KB. 6페이지 합계 128 KB는 정적 페이지 묶음이나 허브 포함 묶음 모두로 설명된다. 98 ms는 함수 페이지(첫 응답 0.8 s 이상)보다 정적 페이지와 맞는다.
- 10/9 "1페이지 · 1 KB · 45 ms": 빈 셸은 gzip 1,557 B, 리디렉션 응답은 수백 B다. **셸 페이지(`/map` 등) 또는 리디렉션 한 건이었을 가능성**이 있으나 확인할 수 없다.
- 두 수치가 전송량인지 압축 해제 크기인지, 요청 총량인지 "수집 완료"만인지 서치어드바이저 정의를 확인하지 못했다.

## 4. 앞으로 관찰하기 위한 최소 로깅 (제안, 미구현)

원칙: IP와 전체 UA 문자열은 저장하지 않는다. 로봇 계열·경로 유형·상태·응답 시간만 일 단위로 센다.

| 안 | 범위 | 장점 | 단점·전제 |
| --- | --- | --- | --- |
| **A. 프리렌더 함수에서 집계** | `/school`·`/apt`·`/area` | 기존 파일 한 곳 수정, 요청 경로 영향 없음(응답 뒤 비동기 기록) | 정적 페이지·사이트맵·robots는 못 봄 |
| B. Edge Middleware | 모든 요청 | 사이트맵·robots 요청까지 보임 | 모든 요청에 미들웨어가 끼어 라우팅 변경에 해당 — 별도 승인 |
| C. Vercel Log Drain | 모든 요청 | 코드 변경 없음 | Pro 요금제 필요, 외부 저장소 필요 |

A안 구체: `api/detail.js`에서 UA를 `yeti`/`googlebot`/`bingbot`/`other-bot`/`browser`로만 분류해, `{date, bot, route_type, status_class, ms_bucket}`
단위 카운터를 Supabase RPC 한 번으로 올린다. 하루 수십 행이라 DB 용량(현재 491.97/500 MB, 무료 한도 근접)에 영향이 거의 없다.
새 테이블·RPC는 SQL 마이그레이션이므로 **별도 승인 대상**이다.

Yeti 진위 확인: UA만으로 판정하지 않는다. 의심 요청이 생기면 그 순간의 IP로 역방향 DNS → 정방향 DNS 일치를 확인하는 네이버 공식 안내 절차를 따르고(서치어드바이저 도움말 "검색 로봇" 항목에서 호스트 이름 규칙을 확인), IP는 저장하지 않는다.

## 5. 서치어드바이저에서 운영자가 볼 것 (코드 밖)

- **리포트 → 수집 현황**의 날짜별 상세에서 10/6의 6페이지와 10/9의 1페이지가 **어느 URL이었는지**. 이것이 가장 값싼 증거다.
- **검증 → robots.txt**로 Yeti 기준 허용 판정.
- **요청 → 사이트맵 제출** 화면의 처리 상태, **요청 → RSS 제출**에 `https://wherecho.co.kr/guide/rss.xml`이 들어가 있는지(운영 문서는 넣으라고만 적혀 있고 제출 완료 기록이 없다).
- **사이트 진단**의 "진단 정보가 없습니다"는 수집량이 적을 때 나오는 상태로 보인다. 수집 오류 신호로 읽지 않는다.
