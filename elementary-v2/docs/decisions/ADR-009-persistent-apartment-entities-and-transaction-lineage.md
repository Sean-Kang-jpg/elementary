# ADR-009: 영속 아파트 실체 UUID와 원천 식별자 이력을 분리한다

- Status: Accepted for implementation; transaction publication remains gated
- Date: 2026-10-07
- Supersedes: ADR-005의 임시 `canonical_complex_id` 직접 연결 부분
- Complements: ADR-007 공개 URL 불변 키

## 결정

`canonical_complex_id`는 빌드 결과이고 `complex_public_key`는 공개 URL 계약이다.
둘 중 어느 것도 물리적 아파트 실체와 원천 식별자의 변경 이력을 모두 표현하지
못하므로 내부 `apartment_entity.entity_id UUID`를 추가한다.

- `entity_id`: 내부 물리/관리 실체의 영속 키. 공개하지 않는다.
- `complex_public_key`: 계속 URL의 권위 있는 키다. UUID로 URL을 바꾸지 않는다.
- `apt_cd`, `kapt_code`, `aptSeq`: `apartment_source_identity`에 출처별 crosswalk로
  저장한다. 확정 연결은 주소·공식 ID 충돌을 감시하되 자동 재배정하지 않는다.
- 모든 자동·수동 판정은 matcher version, 근거, 기준일, 판정자를 남긴다.
- 재건축·재개발·관리단지 병합·분할과 단순 데이터 정정은
  `apartment_entity_lineage.event_type`으로 구분한다. 근거 없는 효력일은 NULL이다.

초기 UUID는 `apt_base` 원자에 대한 고정 namespace UUIDv5로 발급한다. 이는 공개
식별자가 아니라 첫 적재 전 dry-run을 재현하기 위한 방식이다. 이후에는 DB의 확정
crosswalk가 항상 우선하며 canonical ID나 이름이 바뀌어도 UUID를 다시 계산하지
않는다. 여러 기존 UUID가 하나의 현재 그룹에 나타나면 자동 병합하지 않고 충돌
큐로 보낸다.

## 학구도 관계

학교는 공식 `school_id`를 유지한다. 배정은 `apt_cd`/건물/필지 최소 원자와
`school_id`, source 기준일을 기록한다. 공식 자료가 효력일을 주지 않으면
`effective_from`을 추정하지 않는다. 실거래의 동 정보로 학교를 추정하지 않는다.

## 국토부 실거래

`aptSeq`는 단지 ID이지 거래 ID가 아니다. 원본 행은 월·시군구 snapshot과 원천
행 순번으로 보존한다. 날짜·면적·층·금액이 같은 행도 occurrence ordinal만 달리해
모두 유지한다. 비교 fingerprint에는 UNIQUE 제약을 두지 않는다.

자동 확정 순서는 다음과 같다.

1. 이미 확정된 `aptSeq` crosswalk 재사용. 단, 공식 지번 충돌 시 검토 전환
2. 공식 법정동 코드 + 본번/부번 + 명칭
3. 유일한 공식 지번
4. 도로명 + 건물번호 + 명칭
5. 시군구 내 유일 명칭은 **검토 근거일 뿐 자동 확정하지 않음**

취소 행은 원본과 링크에는 남기고 집계에서 제외한다. 집계는 단지·월·정밀 면적대
(`under_60`, `60_to_84_9999`, `85_to_101_9999`, `102_plus`)별로 계산한다.
면적은 `Decimal` 원값을 사용하며 표시 단계에서만 반올림한다.

## 실제 표본 검증

2026-08 종로·강남·연수·분당 683건을 재평가했다.

| 지표 | 건수 | 비율 |
| --- | ---: | ---: |
| 공식 지번+명칭 | 353 | 51.68% |
| 도로명+명칭 | 261 | 38.21% |
| 유일 공식 지번 | 30 | 4.39% |
| **결정적 자동 연결** | **644** | **94.29%** |
| 검토/미연결 | 39 | 5.71% |

기존 94.73%는 이름-only fallback을 확정으로 포함한 값이었다. 새 결정적 지표는
95% 공개 gate 미달이므로 수집·비공개 적재·검수는 진행하되 공개 serving과 UI는
보류한다. gate는 crosswalk 검수 후 같은 표본과 신규/개명/재건축 표본에서 다시
측정한다.

2026-09 동일 4지역 최신 표본도 547/585(93.50%)였다. 8월의 충돌 없는
`aptSeq` 후보 279개를 전부 승인했다고 가정해 승계해도 549/585(93.85%)로,
crosswalk 자체만으로 gate를 넘지 못했다. 최신 master 보강과 ambiguous/unmatched
34건 검수가 선행돼야 한다. 집계 원문은
`etl/apartment_transaction_linkage_audit_20261009.json`에 보존한다.

전국 지역 master를 단독 사용한 회귀 검사에서는 최신 K-apt 보강 원자 2개가
누락되어 9월 거래 3건이 `road_address_name`에서 `unmatched`로 퇴행했다. 따라서
거래 ETL은 전국 master를 권위 소스로 두되 기존 보강 파일에서 **없는 `apt_cd`
원자만** overlay한다. 전체 파일을 단순 합치면 과거 grouping을 되살릴 수 있으므로
금지한다. overlay 후 8월·9월 결정적 퇴행은 모두 0건이었다.

## 롤백

SQL 26 적용은 기존 테이블과 공개 URL을 변경하지 않는 추가형 migration이다.
스케줄은 기본 disabled다. 문제가 있으면 serving refresh를 중단하고 신규 테이블의
권한을 유지한 채 데이터를 비공개 보존한다. 이미 확정한 crosswalk나 lineage를
삭제해 되돌리지 않고 후속 decision으로 정정한다.
