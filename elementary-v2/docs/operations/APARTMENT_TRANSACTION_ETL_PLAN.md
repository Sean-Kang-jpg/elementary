# 아파트 영속 식별자·실거래 ETL 실행 계획

Status: **Implementation complete locally; production publication on hold**  
Last updated: 2026-10-09

## 체크리스트

- [x] 기존 dirty work 보호를 위해 별도 worktree에서 작업
- [x] `apt_cd` 원자, K-apt 코드, 공개 키 계약과 기존 스케줄 확인
- [x] canonical 후보를 단지 기준으로 중복 제거
- [x] 공식 법정동 코드·본번·부번과 도로명 키를 우선하는 matcher v2 구현
- [x] 이름-only fallback을 자동 확정에서 제외
- [x] 확정 `aptSeq` 재사용 시 주소 충돌을 검토 큐로 전환
- [x] 동일 fingerprint 정상 중복 거래 보존 및 취소 거래 집계 제외 테스트
- [x] 영속 UUID/crosswalk/판정/계보/private raw/public summary SQL 26 작성
- [x] 재현 가능한 UUID backfill planner와 충돌 보류 테스트 작성
- [ ] SQL 26 운영 적용
- [x] 최신 전국 로컬 master entity backfill dry-run 및 충돌 0 확인
- [x] 전국 master의 K-apt 보강 누락 회귀 탐지 및 missing-atom overlay 구현
- [x] 도로명 단일 후보의 형식·지역 접두어 차이 검수 및 matcher v3 반영
- [x] 2026-09 최신 4지역 표본 재수집 및 crosswalk 승계 효과 측정
- [x] 2026-08/09 네 지역 표본 결정적 연결률 95% 이상 재검증
- [ ] 지방·군 지역 확장 표본에서 95% 이상 재검증
- [ ] 확장 표본 `aptSeq` conflict 2건 검수 및 광주·전남 통합 코드 확인
- [ ] 조건 통과 시 `molit-apartment-trade` schedule 활성화
- [ ] 최초 전국 월 snapshot private Storage 보존 및 월별 재처리 리허설
- [ ] approved summary만 serving refresh 후 frontend 계약/UI 활성화

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

1. SQL 26을 SQL editor에서 적용한다. 기존 계약을 바꾸지 않는 추가형이다.
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

## 현재 보류 사유

matcher v3 재측정에서 2026-08은 654/683(95.75%), 2026-09는
557/585(95.21%)로 네 지역 표본 gate를 통과했다. 새 확정은 도로명·건물번호가
유일한 후보만 대상으로 했고, 이름의 숫자열 일치 및 최소 길이를 강제했다.
운영 DB와 K-apt를 대조한 신규 확정 단지 4개는 지번과 도로명이 모두 일치했다.

2026-10-09 missing-atom overlay를 포함한 전국 master dry-run은 46,843 `apt_cd`
원자를 46,157 entity로 계획했고 기존 crosswalk가 없는 최초 적재 기준 충돌은
0건이었다. K-apt 17,866건은
관리단지 코드라는 이유만으로 물리 실체를 자동 확정하지 않고 review 상태로
계획했다. 운영 DB backfill은 SQL 26 적용 후 기존 crosswalk export를 넣어 다시
실행해야 하며, 그 결과가 최종 gate다.

8월의 충돌 없는 `aptSeq` 후보 282개를 승인한 승계 시뮬레이션은 9월
559/585(95.56%)다. 남은 9월 검토 대상은 ambiguous 7, unmatched 17,
name-only 2건이다. 지방·군 표본과 신축/K-apt 미등록 단지는 별도 검수를 계속한다.

2026-10-09 확장 리허설은 대전 서구·대구 수성구·부산 해운대구·울산 남구·
제주시 1,280건 중 1,235건(96.48%)을 연결했다. 그러나 대구 `27260-1422`와
울산 `31140-1522`가 각각 복수 canonical 후보를 만들어 공개 gate는 보류한다.
강원 신규 코드 `51720`(홍천)·`51760`(평창)은 58/58 연결, conflict 0이었다.
광주·전남의 기존 코드 요청은 통합 이후 0건이므로 모수에서 제외하고 새 MOLIT
시군구 코드 계약을 확인해야 한다.

전국 master 단독 실행은 최신 K-apt 보강 원자 2개를 누락하여 9월 거래 3건을
추가로 미연결 처리했다. 기존 보강 파일 전체를 단순 합치지 않고, 전국 master에
없는 `apt_cd`만 overlay하면 8월과 9월 모두 기존 결정적 연결의 퇴행이 0건이다.
