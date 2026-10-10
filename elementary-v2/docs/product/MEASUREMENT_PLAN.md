# 측정 계획

Status: **Implemented (2026-10-03)** — 구현과 이 문서가 다른 곳은 [8절](#8-구현-기록-2026-10-03)이 우선한다
Last updated: 2026-10-03
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

## 8. 구현 기록 (2026-10-03)

측정 ID `G-NQT4XV9R00`. 코드는 `src/utils/analytics.ts`, 페이지 조회와 상세 조회는
`src/App.tsx`에서 보낸다.

### 위 계획과 달라진 것

| 항목 | 계획 | 구현 | 이유 |
| --- | --- | --- | --- |
| 아파트 식별자 파라미터 | `complex_public_id` | **`complex_public_key`** | 실제 컬럼명(ADR-007, SQL `19`). 값은 같은 불변 공개 키 |
| `search_scope` | school/apartment/region | **`unified`** 하나 | 검색이 학교·아파트를 한 번에 찾는 통합 검색으로 바뀌었다 |
| `create_comparison` | 7종에 포함 | **미구현** | 비교 기능이 없다(PRD v2 부록 A-3, MVP 2 조건부) |
| `save_candidate` | 후보 저장 | 즐겨찾기 **추가**에만. `item_id`는 학교 `school_id`, 아파트 공개 키 | 즐겨찾기 기록 자체는 `canonical_complex_id`를 들고 있어 호출 지점에서 공개 키로 보낸다 |
| PRD v2 1a 이벤트 | `click_start_module`·`view_guide`·`view_faq` | **`view_guide`·`view_faq` 구현(W3), `click_start_module` 구현(W4).** | `view_guide`는 가이드를 열 때(`guide_id`=slug), `view_faq`는 **질문을 펼칠 때마다**(`faq_id`=질문 문구, 페이지 진입 경로를 함께) 보낸다. 어느 질문이 열리는지가 PRD v2 11절의 고객 리서치 신호다. 보고서에서 쪼개 보려면 `guide_id`·`faq_id`를 맞춤 측정기준으로 등록한다 |

### MVP 1b 이벤트 (2026-10-03 구현)

| 이벤트 | 파라미터 | 시점 |
| --- | --- | --- |
| `start_profile_created` | `entry_year`, `school_type_interest`(`public`·`private`, 쉼표 연결), `moving_plan` | 이 기기에서 처음 프로필이 저장될 때 한 번 |
| `view_roadmap` | `days_to_admission`, `entry_year`, `stage`, `entry_source`(`home`·`guides`·`my`) | 홈의 요약 카드 또는 전체 로드맵이 보일 때, 입학연도마다 한 번. 전체 로드맵은 2026-10-04부터 MY(`my`)에만 있다 — 그 전의 `guides`는 입학 준비 허브다 |
| `check_checklist_item` | `category`, `item_id` | 체크할 때만(해제는 보내지 않는다) |

### 콘텐츠 공유 (2026-10-04 추가)

가이드·FAQ·체크리스트에도 `share_item`을 보낸다. `item_type`은 `guide`(`item_id` = slug),
`faq`, `checklist`이다. 체크리스트는 **주소만** 공유된다 — 체크 상태는 각 기기에 남고, 받은
사람은 자기 기기에서 따로 체크한다(공유 체크리스트는 사용자 결정으로 보류). 공유율 분모(상세
조회 세션)에는 콘텐츠 조회가 들어 있지 않으므로, 콘텐츠 공유는 `item_type`으로 나눠 본다.

### 돌봄 이벤트 (2026-10-04 추가)

SQL `23`의 돌봄·방과후 블록과 주변 돌봄센터. "봤다"는 렌더가 아니라 블록의 절반이 화면에 들어온
때다(`useSeenOnce`) — 바텀시트 아래쪽이라 렌더로 세면 상세를 연 모든 세션이 잡힌다.

| 이벤트 | 파라미터 | 시점 |
| --- | --- | --- |
| `view_care` | `item_type`(`school`·`apartment`), `item_id`(학교 ID·단지 공개 키), `block`(`school_care`·`care_centers`), `has_evening_care`(`yes`·`no`, 학교 블록만), `center_count`(센터 목록만) | 대상마다 한 번 |
| `view_school_day_estimate` | `item_type`(`school`), `item_id`(학교 ID), `has_day`(`yes`·`no`, 요일별 예상 하교 유무), `care_status`(`stated`·`school_check_needed`·`none`) | 학교마다 한 번, 카드 절반이 화면에 들어올 때 (Audit 2 A2-R04, SQL 26 적용 후 발생) |
| `call_care_center` | `item_type`, `item_id`, `center_id`, `distance_m` | 센터 전화 버튼 |
| `show_care_map` | `item_type`, `item_id`, `center_count` | '지도에서 돌봄센터 보기' |
| `filter_evening_care` | `result_count` | 필터에서 '저녁 돌봄 운영 학교만'을 켜고 적용할 때(끌 때는 보내지 않는다) |
| `click_care_guide` | `school_id`, `guide_id`(`care-afterschool`), `entry_source` | 학교 돌봄 블록의 가이드 링크. `click_start_module`과 같은 모양 |

### 커리큘럼 이벤트 (2026-10-05 추가, 2026-10-06 화면과 함께 삭제 — 운영 발화 이력 없음)

| 이벤트 | 파라미터 | 시점 |
| --- | --- | --- |
| `view_plan` | `plan_key`, `age_band` | 카드 상세가 열릴 때 |
| `view_item` | `item_key` | 아이템 상세가 열릴 때 |
| `view_ranking` | — | 순위 화면 |
| `like_plan` | `plan_key`, `age_band`, `region` | 카드 따봉이 저장됐을 때(취소는 보내지 않는다) |
| `like_item` | `item_key`, `plan_key`(아이템 상세에서 누르면 `none`), `age_band`, `region`, `domain` | 아이템 따봉이 저장됐을 때 |

### `select_entry_year` (2026-10-03 추가)

홈·가이드·FAQ의 입학연도 칩을 고를 때 `entry_year`와 함께 보낸다. 어떤 입학연도가
선택되는지가 곧 **방문 가족의 아이 연령 분포**다 — 5~6세 가족이 실제로 오는지가 PRD v2
개정 2(단계 분리)의 전제이므로, 이 값이 그 가설을 판정한다. 보고서에서 보려면
`entry_year`를 맞춤 측정기준으로 등록한다.

### `entry_source`를 정하는 규칙

선택을 시작한 쪽이 디스패치 직전에 `markEntry()`로 표시하고, 상세가 열릴 때 App이
`takeEntry()`로 읽는다. 표시는 15초가 지나면 버린다 — 쓰이지 않은 표시가 다음의 무관한
선택에 붙지 않게 한다.

| 값 | 표시하는 곳 |
| --- | --- |
| `link` | 처음 열린 주소가 상세일 때 (검색엔진·공유 링크·북마크) |
| `search` | 검색 결과 선택 (지도 위 검색창과 홈 검색창 모두) |
| `related` | 학교 상세의 배정 아파트 목록에서 아파트 선택 |
| `favorites` | MY의 저장 목록에서 열기 (2026-10-04 전에는 즐겨찾기 탭. 값은 그대로 둔다) |
| `map` | 표시 없음 — 지도 마커 클릭이 유일하게 표시하는 쪽이 없는 경로다 |
| `home` | 홈의 가이드·FAQ 링크 (2026-10-03, W3) |
| `guides` | 가이드 목록에서 선택 (W3) |
| `nav` | 하단 메뉴. 가이드·FAQ 진입에 표시가 없을 때의 기본값이기도 하다 (W3) |
| `detail` | 학교 상세의 "이 학교 입학을 준비한다면" 모듈에서 가이드로 (W4) |

`click_start_module`은 `school_id`·`guide_id`와 함께, **그 학교 상세에 어떻게 들어왔는지**를
`entry_source`로 보낸다(상세 조회 때 기억해 둔 값). "검색엔진으로 학교를 찾아온 부모가 가이드로
넘어가는가"가 PRD v2 12절 선행 지표 2(상세 → 입학 준비 진입률)이고, 그 분자가 이 이벤트다.

상세 조회 이벤트를 **보내지 않는** 경우: 뒤로·앞으로 가기로 되돌아온 상세, 아파트를 닫고
같은 학교로 돌아온 것. 둘 다 새로 본 상세가 아니다.

### 페이지 조회

`send_page_view: false`로 자동 전송을 끄고, 주소가 바뀔 때마다 App이 보낸다. 주소에서
선택을 복원하는 동안에는 보내지 않는다 — 공유 링크 방문이 복원 전 주소와 정규 주소로
두 번 집계되던 것을 구현 중 확인하고 막았다. 문서 제목도 이때 화면별로 바뀐다
(`○○초등학교 배정 아파트 | 어디초` 등).

### 보내지 않는 곳

- 운영 호스트(`wherecho.co.kr`)가 아닌 곳: 로컬, 미리보기 배포
- **자동화 브라우저**(`navigator.webdriver`): 공개 smoke가 매 릴리스마다 운영에서 돈다.
  막지 않으면 아무것도 하지 않은 세션이 릴리스마다 쌓여 모든 비율이 흐려진다. smoke가
  "GA 스크립트를 읽지 않았다"를 검사한다

본인 방문은 GA4 관리 화면의 내부 트래픽 필터로 거른다(코드로 막지 않는다).

### 이벤트 배선 확인 방법

`localStorage['wherecho:analytics-debug'] = '1'`을 두면 어느 호스트에서든, 자동화
브라우저에서도 이벤트를 보내지 않고 `window.__ANALYTICS_LOG__`에 쌓는다. 이 방법으로
link·search·related·favorites 진입, 뒤로 가기 무시, 같은 학교 복귀 무시, 저장 이벤트를
확인했다. 지도 마커 클릭과 공유는 헤드리스 환경에서 끝까지 재현하지 못해 코드 수준으로만
확인했다.

### 개인정보처리방침

`/privacy`. 운영자가 정하는 값(시행일·보호책임자·보관 기간)은
`src/content/privacy.json`에 있고, 비어 있으면 공개 smoke가 실패해 배포를 막는다.
**GA4와 처리방침은 같은 릴리스로만 나간다.** 법률 자문을 거친 문서가 아니다.


## 9. 개편 이벤트 매핑 (2026-10-10, 개편 TODO A-01·A-02)

개편 계획(PLATFORM_EXPANSION_PLAN §5)이 쓴 이름은 **새로 만들지 않고 운영 중인 이벤트에 맞춘다**. 이름을 바꾸면
2026-10-03부터 쌓인 데이터와 끊긴다. 계획 이름 → 실제 이벤트:

| 계획 이름 | 실제 이벤트 | 상태 |
| --- | --- | --- |
| `school_search` | `search` + `select_search_result` | 운영 중 |
| `school_view` | `view_school_detail` | 운영 중 |
| `school_save` | `save_candidate`(`item_type=school`) | 운영 중 |
| `admin_content_view` | `view_guide`, `view_faq`(질문 펼침) | 운영 중 |
| `admin_content_complete` | **`admin_content_complete`** `content_id`(가이드 slug) — 근거 자료 상자의 절반이 화면에 들어올 때 가이드마다 한 번 | 2026-10-10 추가 |
| `prep_content_view` | **`prep_content_view`** `content_id`, `category`, `entry_source` — 학습 글을 열 때 | 2026-10-09 추가 |
| `prep_content_complete` | **`prep_content_complete`** `content_id`, `category` — 학습 글의 근거 자료 상자에 닿을 때 | 2026-10-10 추가 |
| `checklist_update` | `check_checklist_item`(체크만, 해제 없음) | 운영 중 |
| `my_view` | `/my`의 `page_view` | 운영 중 |
| `content_save`, `login_start/complete`, `poll_vote`, `experience_create`, `comment_create` | — | 해당 기능(P3·P4)과 함께 |
| `recommendation_impression/click` | — | P5와 함께 |

규칙: 조회와 완료는 다른 이벤트이고, 완료는 화면에 실제로 닿은 경우만(`useSeenOnce`) 센다. 같은 글을 열어 둔 채 다시
내려와도 한 번이다. 자유 입력·주소·개인 식별 값은 싣지 않는다. 학습 글 공유는 `share_item`의 `item_type=learn`
(`item_id`=slug)로 보낸다. 배선은 public smoke가 디버그 기록 모드로 `prep_content_view`·`prep_content_complete`를 확인한다.

`open_school_homepage`(`school_id`) — 학교 상세의 '학교 홈페이지' 링크를 누를 때(2026-10-10). 공지사항·가정통신문을 사이트 안에
보이지 않고 학교 홈페이지로 보내므로, 이 클릭이 그 수요의 크기다.
