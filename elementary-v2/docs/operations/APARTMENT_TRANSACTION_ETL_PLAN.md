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
- [ ] 39건 표본 검수 후 `aptSeq` crosswalk 승인
- [x] 2026-09 최신 4지역 표본 재수집 및 crosswalk 승계 효과 측정
- [ ] 대표 표본 결정적 연결률 95% 이상 재검증
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

4지역 683건에서 결정적 자동 연결이 644건(94.29%)으로 gate보다 0.71%p 낮다.
이름-only 1건을 강제 연결해 숫자를 맞추지 않는다. 미연결/모호 39건의 `aptSeq`
crosswalk를 실제 단지와 검수한 뒤 재측정해야 한다.

2026-10-09 missing-atom overlay를 포함한 전국 master dry-run은 46,843 `apt_cd`
원자를 46,157 entity로 계획했고 기존 crosswalk가 없는 최초 적재 기준 충돌은
0건이었다. K-apt 17,866건은
관리단지 코드라는 이유만으로 물리 실체를 자동 확정하지 않고 review 상태로
계획했다. 운영 DB backfill은 SQL 26 적용 후 기존 crosswalk export를 넣어 다시
실행해야 하며, 그 결과가 최종 gate다.

2026-10-09 최신 표본은 585건 중 547건(93.50%)이 결정적으로 연결됐다. 8월의
충돌 없는 `aptSeq` 후보 279개를 전부 승인한 시뮬레이션도 549건(93.85%)에
그쳤다. 9월 검토 대상은 ambiguous 17, unmatched 17, name-only 4건이며, 우선
신축/K-apt 미등록/개명/재건축 여부를 master와 대조한다.

전국 master 단독 실행은 최신 K-apt 보강 원자 2개를 누락하여 9월 거래 3건을
추가로 미연결 처리했다. 기존 보강 파일 전체를 단순 합치지 않고, 전국 master에
없는 `apt_cd`만 overlay하면 8월과 9월 모두 기존 결정적 연결의 퇴행이 0건이다.
