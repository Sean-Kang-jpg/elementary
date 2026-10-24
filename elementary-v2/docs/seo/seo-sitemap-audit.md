# Track A. 사이트맵 정밀 감사

측정일 2026-10-24 (KST 오전), 대상 `https://wherecho.co.kr`, 운영 배포 `dpl_GmJCZK9hBULvxq79Ys2ThJXXKf27`.
읽기 전용. 요청 UA는 `Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)`(로컬 망에서 보낸 것, 실제 네이버 IP 아님).
재현 스크립트는 [evidence/](evidence/).

## 요약

| 항목 | 결과 | 판정 |
| --- | --- | --- |
| 인덱스 → 하위 8개 참조 | 8/8 HTTP 200, `application/xml`, XML 파싱 정상 | 정상 |
| URL 수 | 52,292 (pages 21 · areas 270 · schools 6,302 · apartments 45,699) | 정상 |
| 중복 URL | 0 | 정상 |
| 다른 호스트·http URL | 0 (전부 `https://wherecho.co.kr/`) | 정상 |
| 파일 크기·건수 | 최대 1.68 MB, 최대 10,000건 (표준 한도 50 MB·50,000건) | 정상 |
| HTTP 상태 (표본 633건) | 633/633 200, 리디렉션 0 | 정상 |
| canonical = 사이트맵 URL | 표본 633/633 일치, 학교는 **전수 6,302/6,302** 오프라인 일치 | 정상 |
| noindex·robots 차단 URL | 0 (`meta robots`·`X-Robots-Tag` 없음, `/admin`·`/frontyard` 포함 0건) | 정상 |
| `lastmod` | 인덱스 8개 전부 **빌드 날짜**, 상세 URL에는 없음 | **개선 필요 (P2)** |
| 동적 생성 오류·타임아웃 | 해당 없음 — 빌드 시 정적 파일로 생성 | 정상 |

**결론: 사이트맵의 형식·유효성·URL 품질에서는 수집을 막을 결함을 찾지 못했다.** 유일한 결함은 `lastmod`의
의미이며, 이것이 수집 저조의 원인이라는 증거는 없다.

## 1. 파일별 측정

| 파일 | HTTP | 크기 | 응답 | URL | `<lastmod>` |
| --- | --- | --- | --- | --- | --- |
| `sitemap.xml` (인덱스) | 200 | 981 B | — | 8 sitemap | 8 (모두 2026-10-23) |
| `sitemap-pages-1.xml` | 200 | 2,033 B | 0.34 s | 21 | 18 |
| `sitemap-areas-1.xml` | 200 | 27,226 B | 0.31 s | 270 | 0 |
| `sitemap-schools-1.xml` | 200 | 1,129,065 B | 0.13 s | 6,302 | 0 |
| `sitemap-apartments-1.xml` | 200 | 1,603,807 B | 1.25 s | 10,000 | 0 |
| `sitemap-apartments-2.xml` | 200 | 1,609,800 B | 0.60 s | 10,000 | 0 |
| `sitemap-apartments-3.xml` | 200 | 1,576,899 B | 1.20 s | 10,000 | 0 |
| `sitemap-apartments-4.xml` | 200 | 1,682,387 B | 0.84 s | 10,000 | 0 |
| `sitemap-apartments-5.xml` | 200 | 922,300 B | 0.65 s | 5,699 | 0 |

- 모든 파일이 Python `xml.etree`로 파싱된다. 루트는 인덱스 `sitemapindex`, 나머지 `urlset`, 네임스페이스 `sitemaps.org/schemas/sitemap/0.9`.
- `<loc>`는 `encodeURI`로 퍼센트 인코딩된 한글 경로다. `&` 등은 `xmlEscape`를 거친다(`scripts/build-seo-files.mjs`).
- 아파트 45,699건은 serving의 공개 키 단지에서 **동 단위 등록 단지를 대표 1건으로 묶은 수**다(ADR-007, `buildingGroupKey`).
  묶여 빠진 동 페이지는 대표를 canonical로 가리키므로 사이트맵에 없는 것이 맞다.

## 2. HTTP 상태와 canonical

표본 (전부 사이트맵에서 무작위, 시드 고정):

| 유형 | 표본 | 200 | 리디렉션 | canonical 자기 자신 | 본문 없는 셸(fail-open) |
| --- | --- | --- | --- | --- | --- |
| pages | 8 | 8 | 0 | 8 | 0 |
| areas | **270 (전수)** | 270 | 0 | 270 | 0 |
| schools | 125 | 125 | 0 | 125 | 0 |
| apartments | 230 | 230 | 0 | 230 | 0 |

- 오류 0건이므로 표본 기준 실패율의 95% 상한은 학교 약 2.4%, 아파트 약 1.3% (3/n 규칙). 전체에 0%라고 단정하지 않는다.
- 학교는 별도로 **6,302건 전수**를 `api/detail.js`의 `readable`·`districtFromAddress`로 다시 계산해 사이트맵 경로와 비교했다: 불일치 0.
  (`build-seo-files.mjs`의 `districtOf`는 지역 레지스트리의 `hasCityLevel`, 프리렌더는 `/(도|자치도)$/`를 쓴다. 규칙은 달라도 현재 데이터에서 결과는 같다.)
- 아파트 canonical은 프리렌더가 요청마다 계산한다(동명 단지 조회 `limit 500`, 3초 예산). 전수 비교는 하지 않았다.

## 3. `lastmod`가 전부 2026-10-23인 이유 (확인)

`scripts/build-seo-files.mjs`:

```js
const lastmod = new Date().toISOString().slice(0, 10)          // 빌드 시각(UTC)
...
sitemapIndex(files, origin, lastmod)                          // 인덱스의 8개 하위 항목에 같은 값
```

- 인덱스의 `<lastmod>`는 **콘텐츠 변경일이 아니라 빌드 날짜(UTC)**다. 배포 때마다 8개 하위 사이트맵 전부가 "오늘 바뀜"으로 표시된다.
- 2026-10-01~10-23 운영 배포는 **74회**(Vercel API, READY 72·CANCELED 2). 그중 상당수는 화면·ETL 문서 변경으로, 상세 페이지 데이터와 무관하다.
- UTC 기준이라 한국 오전 9시 이전 배포는 전날 날짜가 찍힌다.
- 하위 `urlset`은 의도대로 되어 있다: 가이드·FAQ·학습 글 18건에만 front matter의 확인일(`verifiedAt`)을 넣고,
  상세 52,271건에는 넣지 않는다(코드 주석: "a build date on every URL would tell crawlers that 52,000 pages changed on each deploy").
  즉 **URL 수준은 정직하고, 인덱스 수준만 빌드 날짜다.**
- `/`, `/guide`, `/checklist`에는 `lastmod`가 없다.

**개선안 (P2, 승인 필요 없음 수준의 소규모 변경)**: 인덱스의 각 항목 `lastmod`를
- `pages` → 그 파일 URL들의 `lastmod` 최댓값,
- `areas`·`schools`·`apartments` → 데이터 기준일(예: `school_master.reference_date` 최댓값 또는 serving 갱신일)로,
- 값을 정할 수 없으면 생략.

효과는 작게 본다. 구글은 `lastmod`가 일관되게 정확할 때만 쓴다고 밝히고 있고, 네이버가 인덱스 `lastmod`를 어떻게 쓰는지는 공개 자료로 확인하지 못했다.
**이것을 수집 저조의 원인으로 보지 않는다** — 정확한 신호를 주는 위생 개선이다.

## 4. 동적 생성·타임아웃 가능성

- 사이트맵·`robots.txt`는 `npm run build`의 마지막 단계(`npm run seo`)가 `dist/`에 쓰는 **정적 파일**이다. 요청 시 DB를 읽지 않으므로 타임아웃이 없다.
- 빌드 중 Supabase 읽기가 실패하면 스크립트가 예외로 끝나 **배포 자체가 실패**한다(부분 사이트맵이 나가지 않음).
- 단, 사이트맵이 가리키는 상세 페이지는 함수(`api/detail.js`)가 그린다. 그 응답 시간은 [Track B](seo-rendering-audit.md) 참조.

## 5. 사이트맵 품질에서 본 콘텐츠 문제 (Track E로 넘김)

- `sitemap-schools-1.xml` 6,302건 중 **1,613건(25.6%)이 배정 아파트 0곳**인 학교다(공립 1,528 · 사립 69 · 국립 16).
  제목이 `OO초등학교 배정 아파트 0곳 · …`으로 나간다. 표본 125건 중 19건(15%)이 이 경우였다.
  사립·국립은 원래 통학구역이 없지만 공립 1,528곳은 데이터 공백인지 실제(농어촌 등)인지 확인하지 않았다.
- 아파트 제목 중복: 대표 45,699건의 예상 제목 45,317종. **332개 제목을 714페이지(1.6%)가 공유**한다(같은 구·같은 이름·같은 도로명).

## 6. 확인하지 못한 것

- 네이버가 사이트맵을 실제로 몇 번, 언제 읽었는지. Vercel 요청 기록에 정적 파일 요청이 남지 않고 보존도 짧다([Track D](seo-crawler-access-audit.md)).
- 서치어드바이저가 사이트맵 처리 결과(발견 URL 수 등)를 보여 주는지 — 운영자 화면 확인 필요.
