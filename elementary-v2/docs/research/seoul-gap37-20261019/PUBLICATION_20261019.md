# 서울 추가 조사분 운영 DB 반영 기록

2026-10-19 KST. 사용자 승인 범위에 따라 Supabase `vsgeksumgvcrkzjwvlgs`에 데이터만 추가했다. 스키마·공개 권한·프론트 배포 변경은 없다.

## 반영 결과

| 항목 | 이전 | 반영 후 | 추가 |
|---|---:|---:|---:|
| 공개 학교 | 536 | 561 | 25 |
| 강좌 저장 행 | 19,831 | 20,567 | 736 |
| 방과후 학교 / 행 | 514 / 16,428 | 539 / 17,154 | 25 / 726 |
| 맞춤형 학교 / 행 | 427 / 3,403 | 428 / 3,413 | 1 / 10 |
| A / B / C 등급 | 461 / 13 / 62 | 461 / 13 / 87 | C 25 |

강좌 행은 저장 단위이며 고유 프로그램 수·학생 정원이 아니다. 추가 25개교는 모두 **목록만 제공하는 C등급**이다. 요일·시작·종료·요일별 종료·시간표 기준을 모두 null로 보존했다. 시간표나 하교 시각의 근거로 쓰지 않는다. 학년 미확인은 unknown이며, 학교 전체 안내와 강좌별 대상을 구분했다. 맞춤형 추가는 충암초의 직접 초1 근거가 있는 10행에 한정했다.

37개교 연구 후보 1,595행 전체를 공개한 것이 아니다. 12개교는 해석 보류 또는 초1 대상 행 미확보로 이번 반영에서 제외했다. [학교별 결정](publication_decisions.json), [736행 출처·원문 줄·해시](publication_provenance.json), [배치·해시](publication_plan.json)를 보존했다. 실제 개설·현재 운영·신청 가능 여부는 미확인이다. 출처 URL은 저장된 공식 첨부 메타데이터에서 복원했으며 이번 반영 때 원문 URL의 접속 가능성을 새로 확인한 것은 아니다.

## 보존 및 검증

- 원본 공개 요약 536행·강좌 19,831행을 모든 필드 포함 백업했다. 반영 후 공개 키로 전수 재조회하여 **기존 모든 행과 updated_at까지 동일**, 추가분도 준비 데이터와 동일함을 확인했다. [기계 검증 결과](publication_verification.json).
- 백업 전후 SQL 전체 행 지문이 동일했다. summary `69e478cb2a9749fa02b7e0476ee69ae1`, programs `e187d1afd27afa8d92234d94ee5ee09e`.
- 7개 배치 모두 실제 트랜잭션 안에서 시험 삽입 후 ROLLBACK을 통과했다. 실제 반영은 2개교부터 시작해 4·4·4·4·4·3개교 순으로 COMMIT했다. 매 배치에서 기존 행 지문을 검사하고 달라지면 중단하도록 했다.
- 최초 배치 2개교·65행을 COMMIT 후 재실행해 총 538개교·19,896행이 유지되는 것도 확인했다. 일부 충돌·내용 차이가 있으면 덮어쓰지 않고 중단한다.
- 독립 SQL 재조회: A/B/C 461/13/87, 방과후 539개교·17,154행, 맞춤형 428개교·3,413행. 신규 시간 필드 유입 0행, 아침돌봄 연구 관찰 40행 유지.
- 관련 Python 단위 검사 28개 통과. 기존 전체 입력과 이번 승인 출력 폴더를 함께 읽는 오프라인 재빌드도 561개교·20,567행으로 일치했다. 이 검사는 적재·공유 preview 변경 없이 수행했다.
- 운영 `npm run browser:smoke:public -- https://wherecho.co.kr` 통과. 학교 딥링크·공개 자료 조회·지도·모바일 화면·공유 주소 검사에 예상 밖 페이지 오류 없음. 지도 요청 최장 1,338.6ms, 아파트 436.7ms. 일반 서비스 흐름 점검이며 신규 25개교 화면을 각각 모두 열었다는 의미는 아니다.

## 백업과 복구

다음 파일은 공개 데이터만 포함하는 로컬 운영 산출물이며 Git 제외 경로다.

- `etl/runtime/seoul-gap37-publish-20261019/live_before.json`: 반영 전 전체 백업. SHA256 `01a44bc2a65b7f31e0277328cc9599e122a5cbb8bfe28253addae4a40b28228b`.
- 같은 폴더 `live_after.json`, `payload.json`, `01_apply.sql`~`07_apply.sql`.
- 같은 폴더 `01_rollback_manual.sql`~`07_rollback_manual.sql`, `all_rollback_manual.sql`: 수동 복구용. 기존 전체 행 지문 및 신규 대상 내용이 일치할 때만 해당 신규 학교의 강좌·요약을 삭제한다. 기존 학교는 대상에 포함하지 않는다. 파일 생성과 단위 검사는 완료했으며 복구 실행은 하지 않았다. 복구 ROLLBACK 시험 호출은 도구의 `Invalid or expired requestState` 오류로 실행 결과를 확인하지 못했다. 완료로 간주하지 않는다.

백업은 덮어쓰지 않으며, DB가 이후 갱신되어 보존 조건이 어긋나면 이 날짜 전용 복구 SQL도 중단된다. 이후 변경분을 무시하고 강제 복원하지 않는다.

## 다음 전체 갱신의 필수 입력

이번 승인분은 `etl/runtime/llm_extraction/outputs_afterschool/seoul_gap37_reviewed/batch_20261019_list_only.json`에 기존 적재기 형식으로도 보존했다. 전체 갱신 시 아래 입력을 모두 포함해야 한다. 예시는 **읽기 전용 재빌드**이며 `--apply`를 붙이지 않았다.

```powershell
python -m etl.load_school_afterschool `
  --outputs etl/runtime/llm_extraction/outputs_afterschool/seoul `
  --outputs etl/runtime/llm_extraction/outputs_afterschool/seoul_retry `
  --outputs etl/runtime/llm_extraction/outputs_afterschool/seoul_gap37_reviewed `
  --afterschool-outputs etl/runtime/llm_extraction/outputs_afterschool/seoul_noas `
  --custom-outputs etl/runtime/llm_extraction/outputs_custom/seoul `
  --custom-outputs etl/runtime/llm_extraction/outputs_custom/seoul_noc
```

기존 적재기에 기존 학교 누락 방지 검사를 추가했다. 실제 적재 시작 전 공개 학교 ID 전체를 읽고 입력에서 빠진 학교가 있으면 첫 쓰기 전에 중단한다. 이 변경은 로컬 코드에 있으며 이후 실행 환경에도 전달해야 한다. 기존 적재기 전체 갱신은 여러 API 요청으로 구성되므로 이번 배치 트랜잭션과 같은 원자성을 보장하지 않는다.

아침돌봄 관찰값 2건은 별도 연구 후보로 유지했다. 전용 연구 DB 40개교와 공개 morning_hours는 이번에 수정하지 않았다. 다음 단계는 보류 12개교·기존 공개 제외 33개교·맞춤형 미확인 학교의 원문 보강 및 아침돌봄 잔여 학교 조사다. 자료 없음은 미운영으로 해석하지 않는다.
