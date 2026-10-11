# 아파트 영속 식별자·실거래 ETL 실행 계획

Status: **Nationwide September snapshot published; recurring schedule activation pending**
Last updated: 2026-10-11

## 체크리스트

- [x] 기존 dirty work 보호를 위해 별도 worktree에서 작업
- [x] `apt_cd` 원자, K-apt 코드, 공개 키 계약과 기존 스케줄 확인
- [x] canonical 후보를 단지 기준으로 중복 제거
- [x] 공식 법정동 코드·본번·부번과 도로명 키를 우선하는 matcher v2 구현
- [x] 이름-only fallback을 자동 확정에서 제외
- [x] 확정 `aptSeq` 재사용 시 주소 충돌을 검토 큐로 전환
- [x] 동일 fingerprint 정상 중복 거래 보존 및 취소 거래 집계 제외 테스트
- [x] 영속 UUID/crosswalk/판정/계보/private raw/public summary SQL 27 작성
- [x] 재현 가능한 UUID backfill planner와 충돌 보류 테스트 작성
- [x] SQL 27 운영 적용
- [x] 최신 전국 로컬 master entity backfill dry-run 및 충돌 0 확인
- [x] 전국 master의 K-apt 보강 누락 회귀 탐지 및 missing-atom overlay 구현
- [x] 도로명 단일 후보의 형식·지역 접두어 차이 검수 및 matcher v3 반영
- [x] 2026-09 최신 4지역 표본 재수집 및 crosswalk 승계 효과 측정
- [x] 2026-08/09 네 지역 표본 결정적 연결률 95% 이상 재검증
- [x] 지방·군 지역 확장 표본에서 95% 이상 재검증
- [x] 확장 표본 `aptSeq` 2건을 공식 도로명 범위 identity로 분리
- [x] 광주·전남 통합 MOLIT 시군구 코드 확인 및 6개 지역 리허설(96.02%, 충돌 0)
- [ ] 조건 통과 시 `molit-apartment-trade` schedule 활성화

### 2026-07 행정구역 코드 전환

실거래 API의 `LAWD_CD`는 행정표준코드 법정동 앞 5자리를 사용한다. 2026-07-01
전남광주통합특별시 출범으로 광주·전남 27개 시군구 코드가 바뀌었다. 수집기는
2026-07부터 신코드를 요청하고, 연결기는 기존 아파트 마스터와 비교할 때만 구코드로
정규화한다. 예: 목포 `46110 → 12110`, 광주 북구 `29170 → 12300`, 광산구
`29200 → 12330`. 원천 응답의 신코드는 `source_lawd_cd`에 그대로 보존한다.

연결은 공식 지번과 단지명을 우선하고, 공식 지번이 없거나 바뀐 경우 전국 마스터에서
정확한 도로명과 건물번호가 단 하나의 단지에만 대응할 때 `unique_road_address`로
확정한다. 같은 도로명주소를 공유하는 두 단지 이상은 자동 연결하지 않는다.
- [x] 최초 전국 월 snapshot private Storage 보존 및 월별 재처리 리허설
- [x] approved summary만 serving refresh 후 frontend 계약 활성화
- [x] private 적재와 명시적 public publish를 분리한 idempotent uploader 구현

## 판정 상태

| 상태 | 의미 | 다음 실행에서의 처리 |
| --- | --- | --- |
| confirmed | 공식 ID와 근거가 확정됨 | 그대로 승계, 공식 주소 충돌만 감지 |
| review | 후보는 있으나 불충분 | 자동 확정 금지, 큐 유지 |
| conflict | 기존 확정 ID끼리 충돌 | lineage 결론 전 병합 금지 |
| rejected | 잘못된 후보로 확인 | 같은 matcher version의 재제안 방지 |

검수 결정은 `apartment_source_identity`와 append-only
`apartment_identity_decision`에 남으므로 재실행해도 사라지지 않는다. 신규·변경·충돌만
검수 대상으로 만들고 기존 confirmed 행은 다시 사람이 보지 않는다.

## 운영 순서

1. SQL 27을 SQL editor에서 적용한다. 기존 계약을 바꾸지 않는 추가형이다.
2. 최신 operational master에 보강 파일의 누락 `apt_cd`만 overlay하고 DB crosswalk export로
   `plan_apartment_entity_crosswalk.py`를 두 번 실행해 byte-equivalent 결과를 확인한다.
3. entity와 `apt_base` identity를 service role로 upsert한다. conflict가 1건이라도
   있으면 그 그룹은 제외한다.
4. 월별 API 원본을 `법정동 시군구 5자리 × 계약월`로 수집하고 source date/hash를
   pin해 private Storage에 보존한다.
5. raw row ordinal과 occurrence ordinal을 유지한 채 링크한다. 취소/정정된 원본도
   삭제하지 않는다.
6. 결정적 연결률과 false-positive 표본을 검사한다. 95% 미만이면 summary를
   `hold`로 적재하고 public serving을 갱신하지 않는다.
7. 통과 시 approved summary만 공개 키로 변환해 serving을 갱신한다.

SQL 27 적용 후 첫 실행은 공개 갱신 없이 진행한다.

```bash
python etl/run_apartment_transaction_etl.py --apply --month YYYYMM ...
```

원본 Storage 보존, entity/identity, raw/link 및 `hold` summary의 원격 건수를 검수한
뒤에만 같은 입력으로 `--apply --publish`를 실행한다. `--publish`는 단독으로 사용할
수 없고, 연결률 95% 또는 conflict gate가 실패하면 serving RPC를 호출하지 않는다.

2026-10-11 운영 pilot은 2026-08의 11110·11680·28185·41135 원본 683건으로 수행했다.
결정적 연결은 668건(97.80%), conflict는 0건이었다. private raw/link 683/683과
`hold` summary 335건을 먼저 확인한 후 공개했으며 serving은 승인 summary와 같은
335건이다. 신규 원자 3건에는 불변 공개키를 발급했고, 현재 entity가 여러 과거
키를 포함한 경우 ADR-007 canonical 순위로 redirect를 만든 뒤 공개했다. 월간
schedule은 전국 월 데이터 검수 전까지 계속 비활성으로 둔다.

2026-10-11 전국 2026-09 실행은 276개 시군구 snapshot에서 원천 29,380건을
수집했고 28,027건(95.39%)을 결정적으로 연결했다. conflict 0건으로 gate를
통과했으며 14,298개 entity·면적구간 summary를 승인했다. 2026-08 pilot을 포함한
운영 누적은 raw/link 30,063/30,063, 승인 summary 14,633건이다. 여러 transaction
entity가 같은 불변 공개키로 합쳐지는 9개 구간은 SQL 28에서 단지 전체 원천을 다시
집계하고 SQL 29에서 이를 API timeout 안으로 최적화했다. 최종 public serving은
2026-08 335건과 2026-09 14,289건, 합계 14,624건이며 갱신은 4.27초에 완료됐다.
비공개 raw/link/summary 익명 조회는 401, serving 조회는 206으로 확인했다.

월간 runner는 각 운영 scope에서 만든 apartment master를 모두 명시적으로 전달하고,
어느 하나라도 없으면 전국 수집을 시작하지 않는다. 운영 `--apply`는 95% gate 통과
후에만 `--publish`까지 수행한다. schedule은 이 변경의 배포 확인 전까지 비활성이다.

## 남은 운영 전환 항목

matcher v3 재측정에서 2026-08은 654/683(95.75%), 2026-09는
557/585(95.21%)로 네 지역 표본 gate를 통과했다. 새 확정은 도로명·건물번호가
유일한 후보만 대상으로 했고, 이름의 숫자열 일치 및 최소 길이를 강제했다.
운영 DB와 K-apt를 대조한 신규 확정 단지 4개는 지번과 도로명이 모두 일치했다.

2026-10-09 missing-atom overlay를 포함한 전국 master dry-run은 46,843 `apt_cd`
원자를 46,157 entity로 계획했고 기존 crosswalk가 없는 최초 적재 기준 충돌은
0건이었다. K-apt 17,866건은
관리단지 코드라는 이유만으로 물리 실체를 자동 확정하지 않고 review 상태로
계획했다. 운영 DB backfill과 전국 9월 publication은 완료됐다. 남은 항목은 이번
runner 변경을 배포한 뒤 `molit-apartment-trade` schedule을 활성화하고 첫 자동
실행을 관찰하는 것이다.

8월의 충돌 없는 `aptSeq` 후보 282개를 승인한 승계 시뮬레이션은 9월
559/585(95.56%)다. 남은 9월 검토 대상은 ambiguous 7, unmatched 17,
name-only 2건이다. 지방·군 표본과 신축/K-apt 미등록 단지는 별도 검수를 계속한다.

2026-10-09 확장 리허설은 대전 서구·대구 수성구·부산 해운대구·울산 남구·
제주시·강원 홍천/평창 1,338건 중 1,293건(96.64%)을 연결했다. 대구
`27260-1422`와 울산 `31140-1522`는 하나의 `aptSeq`가 공식 도로명이 다른
복수 단지를 포괄한 사례라 address-scoped identity로 분리했고 conflict는 0건이다.
광주·전남은 행정안전부 2026-07-01 법정동 변경표의 신코드로 다시 수집했다.
목포·광주 남구·북구·광산구·해남·무안 1,005건 중 965건(96.02%)이 결정적으로
연결됐고 conflict는 0건이었다. 전국 마스터에서 정확한 도로명과 건물번호가 하나의
단지에만 대응하는 37건을 `unique_road_address`로 확정했으며, 공유 주소 3건과
미연결 37건은 계속 검수 대상으로 남겼다.

전국 master 단독 실행은 최신 K-apt 보강 원자 2개를 누락하여 9월 거래 3건을
추가로 미연결 처리했다. 기존 보강 파일 전체를 단순 합치지 않고, 전국 master에
없는 `apt_cd`만 overlay하면 8월과 9월 모두 기존 결정적 연결의 퇴행이 0건이다.
