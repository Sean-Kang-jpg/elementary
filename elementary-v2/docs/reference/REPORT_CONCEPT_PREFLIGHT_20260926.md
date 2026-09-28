# 제품 컨셉 v1.1 착수 전 검증

Date: 2026-09-26
Scope: [`../product/PRODUCT_CONCEPT.md`](../product/PRODUCT_CONCEPT.md) 12절 0단계 항목 1~3
Method: 로컬 ETL 산출물(`etl/local_outputs_20260320/`), 레지스트리, SQL 정의 대조.
Supabase 직접 조회는 `.env` 접근 제한으로 수행하지 않음.

## 요약

| # | 항목 | 결과 | 1단계 차단 여부 |
| --- | --- | --- | --- |
| 1 | 공개 지역 범위 | 6개 광역 운영 공개 / 17개 등록 | 차단 아님. 지역 페이지 범위만 제한 |
| 2 | `school_id` 안정성 | **안정** | 차단 아님 |
| 2 | `canonical_complex_id` 안정성 | **조건부 — 58.8%가 이동 위험군** | **부분 차단. 완화책 필요** |
| 3 | 아파트 기준일 | 데이터는 존재, 공개 계약에만 없음 | 차단 아님. 2단계 저비용 작업 |

---

## 1. 공개 지역 범위

`etl/region_registry.json` (registry-version `region-registry-v1`, **updated
2026-09-27**) 기준.

> 이 항목은 2026-09-26에 4개 광역으로 확인했으나, 2026-09-27 레지스트리 갱신으로
> 울산·제주가 승격되어 **6개**가 되었다. 아래는 갱신 후 값이다. 공개 범위는
> 웨이브마다 움직이므로 어떤 문서에도 숫자를 고정하지 않는다.

| status | wave | 지역 | 초등학교 수 |
| --- | --- | --- | --- |
| production | capital | 서울특별시 | 606 |
| production | capital | 경기도 | 1,379 |
| production | capital | 인천광역시 | 276 |
| production | N1 | 대전광역시 | 155 |
| production | N1 | 울산광역시 | 124 |
| production | N2 | 제주특별자치도 | 119 |
| planned | N1 | 부산, 대구, 광주, 전라남도 | 1,138 |
| planned | N2 | 세종, 강원, 충북, 충남, 전북, 경북, 경남 | 2,506 |

- 운영 공개: **6개 광역 / 초등학교 2,659교** (2026-03-20 표준데이터 기준)
- 등록 전체: 17개 광역, 전국 6,303교
- 로컬 수도권 빌드 산출물(측정치): 2,260교 / 아파트 단지 20,164 / serving
  20,891행. 대전·울산·제주 적재 후의 실제 행 수는 `.env` 접근 제한으로
  확인하지 않았다

**해석.** 빌드는 공개보다 앞서 간다. 광주·세종·목포 작업은 빌드와 파일럿이며
아직 `planned`이다. 정상 상태이고 ADR-003의 웨이브 정책과 일치한다.

**결론.** 컨셉 문서의 지역 페이지·지역 콘텐츠는 `status=production`인 지역만
대상으로 하며, 그 목록을 **레지스트리에서 읽는다.** 공개 범위는 하루 만에도
바뀐다 — 이 검증 자체가 4개에서 6개로 바뀌는 것을 겪었다. 어떤 코드나 문서에도
지역 수를 고정하지 않는다.

---

## 2. 식별자 안정성

### 2.1 `school_id` — 안정

- 형태: `B##########` (예: `B000003875`), 2,260개 전부 이 형태, 중복 없음
- 출처: 교육부 학교 표준데이터의 학교ID. **외부에서 부여된 코드**이며 파이프라인이
  생성하지 않는다
- [`../architecture/DATA_CONTRACTS.md`](../architecture/DATA_CONTRACTS.md)가
  "Stable identity: `school_id`"로 이미 계약하고 있고, 실제 생성 로직도 이를
  지킨다

**판정: `/school/B000003875` 형태의 영구 URL을 안전하게 쓸 수 있다.**

### 2.2 `canonical_complex_id` — 조건부

생성 규칙 ([`etl/build_apartment_master_v1.py:468`](../../etl/build_apartment_master_v1.py)):

```python
"canonical_complex_id": f"KAPT:{match['kapt_code']}" if match else f"APT:{apt_id}"
```

즉 **K-apt 매칭 성공 여부가 식별자의 접두사 자체를 바꾼다.**

현재 분포 (20,164 단지):

| 접두사 | 수 | 비율 | 출처 |
| --- | --- | --- | --- |
| `KAPT:` | 8,301 | 41.2% | K-apt 단지코드 (외부 부여) |
| `APT:` | 11,863 | **58.8%** | `apt_cd` (2024-10 아파트 기준자료) |

K-apt 매칭 상태별 (20,421 단위 기준):

| 상태 | 수 | 재빌드 시 접두사 이동 위험 |
| --- | --- | --- |
| `matched_high` | 7,414 | 낮음 |
| `matched_supported` | 673 | 낮음 |
| `matched_shared_complex_validated` | 471 | 낮음 |
| `not_in_kapt_scope_likely` | 10,579 | 낮음 (K-apt 관리대상 아님) |
| `kapt_coverage_gap` | 691 | **높음** — K-apt가 나중에 수록하면 이동 |
| `kapt_scope_unknown` | 232 | **높음** |
| `matched_shared_complex_review` | 187 | **높음** — 검토 종결 시 병합 |
| `ambiguous_or_weak_candidate` | 174 | **높음** — 매칭 튜닝에 반응 |

**고위험군 합계 1,284단지 (6.4%).** 이들은 다음 빌드에서 `APT:x` → `KAPT:y`로
바뀔 수 있고, 그 순간 공유 링크와 검색엔진 색인이 끊긴다.

`matched_shared_complex_validated` 471건은 여러 `apt_cd`가 하나의 K-apt 코드로
**병합**된 경우다. 병합은 두 URL이 하나로 합쳐지는 것이므로 리다이렉트로 처리
가능하지만, 처리하지 않으면 한쪽이 사라진다.

### 2.3 더 큰 위험 — 아파트 기준자료가 고정 파일이다

```python
APT_SOURCE = ROOT_DIR / "archive" / "GAS" / "GAS" / "임시" / "apt_mst_info_202410.csv"
APARTMENT_BASE_AS_OF = "2024-10-01"
```

`APT:` 식별자 11,863개의 뿌리인 `apt_cd`는 **`archive/` 아래의 2024년 10월자
고정 CSV**에서 온다. 이 파일이 교체되는 날 `APT:` 식별자 전체가 바뀔 수 있다.

두 가지가 따라온다.

1. **운영 ETL이 `archive/`를 읽고 있다.** 루트 `CLAUDE.md`는 `archive/`를
   "편집해도 라이브 앱에 영향 없음"으로 설명한다. 사실이 아니다. 문서를
   정정하거나 이 파일을 `etl/` 아래 입력 자산으로 옮겨야 한다.
2. 이 기준자료를 갱신 가능한 원천으로 교체하는 작업은 **URL 영속성을 깨는
   마이그레이션**으로 계획해야 한다. 조용히 할 수 있는 일이 아니다.

### 2.4 권고 — URL은 파생 식별자에 걸지 않는다

`canonical_complex_id`를 URL에 직접 쓰지 말고, **불변 공개 슬러그**를 하나 둔다.

- `apartment_public_id`를 마스터에 추가한다. 최초 부여 후 절대 변경하지 않는다.
- `canonical_complex_id`는 내부 조인 키로만 쓴다.
- 병합·분할이 발생하면 공개 슬러그에 리다이렉트 매핑을 남긴다.
- 최초 부여는 지금 한다. 나중에 소급하면 이미 색인된 URL을 잃는다.

`school_id`는 외부 부여 코드이므로 이 처리가 필요 없다.

**이것이 이 검증에서 나온 유일한 신규 작업 항목이며, 1단계 라우팅 착수 전에
결정돼야 한다.**

---

## 3. 아파트 데이터 기준일

`school_apartment_serving` ([`../../sql/06_create_operational_master_tables.sql:127`](../../sql/06_create_operational_master_tables.sql))에는
`pipeline_version`과 `updated_at`만 있고 **원천 기준일이 없다**.
`updated_at`은 ETL이 돌아간 시각이지 데이터의 기준일이 아니므로,
[컨셉 11절 원칙 4](../product/PRODUCT_CONCEPT.md#11-신뢰-원칙)를 만족하지 못한다.

학교 쪽은 이미 갖춰져 있다: `reference_date`, `student_statistics_year`,
`student_data_status`.

**좋은 소식: 데이터는 이미 존재한다.** ETL 산출물에 다음이 있다.

- `apartment_complex_master.source_as_of`
- `apartment_base_as_of` = `2024-10-01`
- `kapt_as_of` = K-apt 스냅샷 일자 (매칭된 단지만)

공개 계약까지 전달되지 않았을 뿐이다.

**작업 범위 (2단계):**

1. `school_apartment_serving`에 `apartment_source_as_of DATE`, `kapt_as_of DATE`
   추가 — 신규 마이그레이션
2. `sql/09_create_serving_refresh_function.sql`에서 두 컬럼 채우기
3. `dataService.ts`의 `APARTMENT_SELECT_FIELDS`에 추가
4. `types/index.ts`의 `Apartment`에 추가
5. 아파트 상세 상단 요약에 표시

네 파일이 함께 움직이는, 스키마 변경 치고는 작은 작업이다.

> **부수 발견**: `assignment_rank`는 이미 serving에 있다. 복수 배정 표시는
> 추가 데이터 없이 지금 구현 가능하다. 아파트 20,164개 중 620개
> (`review_required=True`)가 검토 필요 상태로 표시돼 있어, 11절 원칙 2의
> "검토 필요" 노출도 기존 데이터로 가능하다.

---

## 결론

0단계 항목 1과 3은 1단계를 차단하지 않는다. 항목 2는 부분 차단이며, 해소책은
**공개 슬러그 도입**이다. 이것을 1단계 라우팅 작업의 첫 번째 항목으로 넣는다.

SEO 렌더링 방식(0단계 항목 3)은
[`../decisions/ADR-006-detail-page-rendering.md`](../decisions/ADR-006-detail-page-rendering.md)에서
별도로 다룬다.
