# 측정 계획

Status: **Draft**
Last updated: 2026-09-27
Owner: Product
Parent: [`PRODUCT_CONCEPT.md`](PRODUCT_CONCEPT.md) 14절

컨셉 14절이 정의한 북극성 지표와 선행 지표 4개를 실제로 계산하기 위해
무엇을 설치하고 무엇을 기록할지 정한다.

현재 상태: **애널리틱스 없음, 개인정보처리방침 없음, `public/` 디렉터리
자체가 없어 `robots.txt`와 `sitemap.xml`도 없음.** 지표 5개 중 계산 가능한
것은 0개다.

## 1. 도구

세 가지가 각각 다른 질문에 답한다. 셋 다 이 규모에서 무료다.

| 도구 | 답하는 질문 | 없을 때 |
| --- | --- | --- |
| Google Search Console | 구글이 색인했는가, 어떤 질의로 노출되는가 | [ADR-006](../decisions/ADR-006-detail-page-rendering.md)의 성패를 알 수 없다 |
| 네이버 서치어드바이저 | 네이버가 색인했는가 | ADR-006의 핵심 논거가 네이버였는데 검증 불가 |
| GA4 | 들어온 사람이 무엇을 했는가 | 북극성 지표 계산 불가 |

**Search Console과 서치어드바이저가 GA4보다 먼저다.** SEO 작업의 성패는
색인 여부에서 갈리는데 GA4는 그것을 알려주지 못한다. 특히 서치어드바이저는
사이트 등록과 사이트맵 제출을 능동적으로 해야 네이버가 사이트의 존재를
인지한다.

### GA4를 선택한 이유

- 무료이고 이 규모에서 비용이 발생하지 않는다
- 세션 스코프 세그먼트로 북극성 지표를 별도 분석 도구 없이 계산할 수 있다
- 봇 트래픽을 기본 필터링한다. ADR-006의 프리렌더 경로는 서버 측이므로
  크롤러가 GA4 히트를 만들지 않는다

### 검토했으나 채택하지 않은 것

- **Vercel Web Analytics** — 설치가 가장 쉽고 광고 차단에 덜 막히지만,
  커스텀 이벤트가 유료 요금제 기능이다. 필요한 것이 바로 커스텀 이벤트다
- **Plausible / Umami** — 유료이거나 자체 운영이 필요하고, 세션 단위 복합
  조건 분석이 GA4보다 약하다

### GA4의 알려진 한계

1. **광고 차단기에 막힌다.** 방문자 일부가 집계에서 빠지므로 절대값은 실제보다
   작다. **지표는 추세로만 해석한다.** 절대 방문자 수로 의사결정하지 않는다
2. **SPA에서 그냥 설치하면 오작동한다.** 아래 3절 참조
3. 개인정보처리방침 고지 의무가 발생한다. 5절 참조

## 2. 이벤트

아래 7개로 지표 5개가 모두 계산된다. 이보다 늘리지 않는다.

| 이벤트 | 시점 | 파라미터 |
| --- | --- | --- |
| `search` | 검색 실행 | `search_term`, `search_scope` (school/apartment/region), `result_count` |
| `select_search_result` | 검색 결과 선택 | `result_type`, `result_rank` |
| `view_school_detail` | 학교 상세 표시 | `school_id`, `region`, `entry_source` |
| `view_apartment_detail` | 아파트 상세 표시 | `complex_public_id`, `school_id`, `region`, `entry_source` |
| `save_candidate` | 후보 저장 | `item_type`, `item_id` |
| `share_item` | 공유 실행 | `item_type`, `share_method` (copy/web_share) |
| `create_comparison` | 비교 생성 (2단계) | `item_type`, `item_count` |

### `entry_source`가 가장 중요하다

값: `map` / `search` / `link` / `related` / `favorites`

**ADR-006 전체가 이 한 파라미터로 평가된다.** `link`로 진입한 상세 조회가
늘어나지 않으면 프리렌더 작업은 실패한 것이다. 이 값을 빠뜨리면 2단계
투자의 성과를 판정할 방법이 없다.

### 식별자 주의

`complex_public_id`는 [착수 전 검증 2.4절](../reference/REPORT_CONCEPT_PREFLIGHT_20260926.md)이
도입을 권고한 **불변 공개 슬러그**다. `canonical_complex_id`를 기록하면
재빌드 때 식별자가 이동해 과거 데이터와 연결이 끊긴다. 측정에서도 같은
이유로 공개 슬러그를 쓴다.

### GA4 커스텀 측정기준 등록

`entry_source`, `item_type`, `region`, `search_scope`, `share_method`,
`result_type`을 이벤트 범위 커스텀 측정기준으로, `result_count`,
`result_rank`, `item_count`를 커스텀 측정항목으로 등록한다. 등록하지 않으면
보고서에서 쪼개 볼 수 없다.

## 3. SPA 대응 — 설치 순서가 중요하다

GA4는 문서가 새로 로드될 때 `page_view`를 보낸다. 현재 앱은 화면이 바뀌어도
문서를 다시 로드하지 않으므로, **그냥 설치하면 한 사람이 학교 10곳을 봐도
1페이지 조회로 기록된다.** 북극성 지표가 통째로 무의미해진다.

대응:

1. GA4 설정에서 `send_page_view: false`로 자동 전송을 끈다
2. 라우트 전환이 끝나고 문서 제목이 갱신된 **다음에** `page_view`를 수동
   전송한다. `page_location`과 `page_title`을 명시적으로 넘긴다
3. 향상된 측정의 히스토리 기반 페이지 조회에 의존하지 않는다. 제목이 갱신되기
   전에 발생해 잘못된 제목이 기록된다

**따라서 GA4 설치는 라우팅 도입 이후다.** 먼저 붙이면 잘못된 데이터가
쌓이고, 나중에 그 구간을 버려야 한다.

## 4. 지표 계산식

| 지표 | 계산 |
| --- | --- |
| 검색 결과 → 상세 도달률 | `select_search_result` ÷ `search` |
| 세션당 상세 페이지 수 | (`view_school_detail` + `view_apartment_detail`) ÷ 세션 수 |
| 공유율 | `share_item`이 발생한 세션 ÷ 상세 조회가 발생한 세션 |
| 7일 재방문율 | GA4 유지율 보고서 |

### 북극성 지표 — 주간 유효 후보 탐색 세션 수

GA4 탐색 보고서에서 **세션 세그먼트**로 정의한다. 아래 중 하나 이상:

- `view_school_detail` + `view_apartment_detail` 합계 ≥ 2
- `create_comparison` ≥ 1
- `save_candidate` ≥ 1
- `share_item` ≥ 1

주 단위로 이 세그먼트의 세션 수를 본다. BigQuery 연동 없이 GA4 UI만으로
계산된다.

## 5. 개인정보

GA4는 방문자 정보를 외부(Google)로 전송하므로 개인정보처리방침 고지가
필요하다. 현재 사이트에는 처리방침 페이지가 없다.

- 처리방침 페이지를 만들고 푸터에서 상시 접근 가능하게 한다
- 수집 항목, 목적, 보유 기간, 처리 위탁(Google), 거부 방법을 기재한다
- `search_term`에는 학교명·아파트명·지역명만 들어간다. 개인을 식별하는 값이
  이벤트 파라미터에 들어가지 않도록 한다
- 구체적 법적 요건은 공개 전 별도로 확인한다. 이 문서는 법률 자문이 아니다

## 6. 검색엔진 제출

[ADR-006](../decisions/ADR-006-detail-page-rendering.md) 구현 범위 5·6과
같은 작업이다.

- `public/robots.txt`, `public/sitemap.xml` 생성. `public/` 디렉터리부터
  만들어야 한다
- 사이트맵은 **학교 / 아파트 / 지역 3개로 분리**하고 인덱스 사이트맵으로
  묶는다. 현재 규모는 단일 사이트맵 상한(5만 URL) 안에 들어가지만, 분리하면
  **타입별 색인률을 따로 볼 수 있다.** 어느 종류가 색인되지 않는지 아는 것이
  진단의 전부다
- Google Search Console: 사이트 등록 → 사이트맵 제출
- 네이버 서치어드바이저: 사이트 등록 → 사이트맵 제출 → 필요 시 웹페이지
  수집 요청
- IndexNow는 Bing 계열 대상이다. 네이버는 IndexNow 참여사가 아니므로
  서치어드바이저 자체 제출 경로를 쓴다
- 다음(Daum)은 별도 등록 절차가 있으나 우선순위는 낮다

> `index.html`이 참조하는 `/vite.svg`는 `public/`이 없어 실제로 404다.
> `public/` 생성 시 파비콘도 함께 정리한다. 브랜드 확정과 맞물리는 작업이다.

## 7. 작업 순서

| # | 작업 | 선행 조건 |
| --- | --- | --- |
| 1 | `public/` + `robots.txt` + `sitemap.xml` | 라우팅으로 URL이 확정된 뒤 |
| 2 | Google Search Console 등록·제출 | 1 |
| 3 | 네이버 서치어드바이저 등록·제출 | 1 |
| 4 | GA4 설치 + 이벤트 7종 | **라우팅 도입 이후** (3절) |
| 5 | 개인정보처리방침 페이지 | 4와 동시 배포 |

1~3은 개발보다 등록 절차에 가깝고 하루면 끝난다. 이것을 하지 않으면
[ADR-006](../decisions/ADR-006-detail-page-rendering.md)의 작업 전체가
검증되지 않은 채로 남는다.
