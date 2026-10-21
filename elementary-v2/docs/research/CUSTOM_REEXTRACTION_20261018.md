# 맞춤형 누락 재추출 결과 — 2026-10-18

상태: **2026-10-18 사용자 승인 후 운영 DB 적재 및 공개 조회·운영 스모크 검증 완료.**

## 범위

- 기존 운영 서울 536개교 중 맞춤형이 비어 있던 학교 269개교가 출발점이다.
- 원문에 맞춤형 관련 표현이 있는 249개교 가운데 요일별 표 후보 154개교와 이름 목록 후보 84개교, 합계 **238개교**를 확인했다. 초기 시험 12개교도 포함한다.
- 총칭만 있는 것으로 분류한 11개교는 보류했다. 맞춤형 표현 자체를 찾지 못한 20개교도 이번 재추출 대상 밖이다.
- 입력: `etl/runtime/llm_extraction/inputs_custom_noc/`.
- 결과: `etl/runtime/llm_extraction/outputs_custom/seoul_noc/batch_01.json`, `batch_02.json`, `batch_03.json`, `batch_worker_1.json`~`batch_worker_4.json`.
- 네 작업의 대상 학교 목록은 서로 겹치지 않으며, 최종 출력의 학교 집합이 대상 238개교와 정확히 일치함을 검사했다.

## 결과

| 항목 | 수치 |
| --- | ---: |
| 검토 학교 | 238 |
| 실제 프로그램명 확보 학교 | 160 |
| 이번 원문에서 적합한 프로그램명을 확보하지 못한 학교 | 78 |
| 확보 행 | 1,393 |
| 요일과 시작·종료 시각 모두 확인된 행 | 725 |
| 실제 이름은 있으나 요일 미확인인 행 | 155 |

78개교의 빈 결과는 미운영 판정이 아니다. 총칭·자리표시만 있는 경우, 돌봄 내부 활동만 있는 경우, 고학년/2학년 전용 또는 이전 학년도·방학 자료인 경우 등을 학교별 `note`에 남겼다.

역삼초(`B000002298`)는 음악놀이·블럭놀이·신체놀이·미술놀이·수학놀이 5개를 확보했다. 초1~2학년 대상은 확인되나 요일·시각이 없어 모두 null로 보존했다.

## 보수적 추출 규칙

- 실제 이름이 확인되면 요일이 없어도 목록에 남긴다. `etl/llm_extraction_spec_custom.md`에 null 요일 규칙을 명시했다. 번호 목록을 월~금으로 옮기지 않는다.
- 요일 병합 셀이 깨져 대응이 불명확한 경우 해당 이름의 요일과 시간을 null로 둔다.
- 준비·정리·관리시간을 포함한 운영구간만 있고 실제 수업시각을 알 수 없으면 시간을 만들지 않는다.
- 프로그램명이 확인되지 않은 총칭은 실제 강좌명으로 생성하지 않는다.
- 이전 학년도, 방학 시간, 2학년 전용 표, 돌봄 내부 활동을 구분했다.
- 기존 시험분의 `B000002373`은 L87의 셀 3개를 월·화·수로 배치한 근거가 부족해 수정했다. 해당 이름은 null 요일로 보존하고, L86에서 확인되는 월·수 배치는 유지했다.

## 기존 적재 규칙으로 합친 로컬 미리보기

| 항목 | 기존 기준선 | 재추출 포함 |
| --- | ---: | ---: |
| 공개 학교 | 536 | 536 |
| 맞춤형이 있는 학교 | 267 | 427 |
| 맞춤형이 없는 학교 | 269 | 109 |
| 전체 강좌 행 | 18,438 | 19,831 |
| A / B / C | 449 / 19 / 68 | 461 / 13 / 62 |

- 방과후 행은 seq를 제외하고 전체 비교해 동일하다.
- 요일별 방과후 종료 시각은 동일하다.
- 등급 하락은 없고, B→A 6개교·C→A 6개교다.
- 검증 스크립트의 학교 중복·행 형식·시각 범위·강좌명 출처·L번호 검사 오류 및 경고는 0이다. 이 자동 검사가 사람 검수 완료를 의미하지는 않으며, 공개 시 기존 `review_state='auto'`를 유지한다.
- 기존 적재기 단위 테스트 13개 통과. null 요일 강좌가 목록에 남고 막대에는 들어가지 않는 것도 확인했다.

별도 검토 파일(공유 preview를 덮어쓰지 않음):

- `etl/runtime/custom_noc_review_20261018.json`
- `etl/runtime/custom_noc_comparison_20261018.json`
- `etl/runtime/validate_custom_noc.py`
- `etl/runtime/compare_custom_noc.py`

## 적재 담당 인수인계

아래 출력 폴더를 **모두** 포함해 검토했다. 2026-10-18 사용자의 운영 배포 요청 후 같은 명령에 `--apply`를 붙여 적재했으며 정상 종료했다. `--write-fixture`는 실행하지 않았다.

```powershell
python -m etl.load_school_afterschool `
  --outputs etl/runtime/llm_extraction/outputs_afterschool/seoul `
  --outputs etl/runtime/llm_extraction/outputs_afterschool/seoul_retry `
  --afterschool-outputs etl/runtime/llm_extraction/outputs_afterschool/seoul_noas `
  --custom-outputs etl/runtime/llm_extraction/outputs_custom/seoul `
  --custom-outputs etl/runtime/llm_extraction/outputs_custom/seoul_noc
```

총칭 후보 11개교, 근거 미발견 20개교, 빈 결과 78개교는 후속 원문 보강 대상으로 남는다.

## 운영 반영 검증

- 대상 프로젝트: `vsgeksumgvcrkzjwvlgs`.
- 적재 전 공개 테이블이 기존 기준선과 동일함을 확인하고 `etl/runtime/custom_noc_live_backup_20261018.json`에 백업했다.
- `--apply` 결과: snapshot_date `2026-10-18`, 공개 536개교, 19,831행, A 461 / B 13 / C 62.
- 공개 키로 전체 테이블을 재조회한 결과 적재 preview와 요약·강좌 모두 차이 0건이다. 역삼초 맞춤형 5개도 조회 확인했다.
- 검증 기록: `etl/runtime/custom_noc_live_verify_20261018.json`.
- 운영 `npm run browser:smoke:public -- https://wherecho.co.kr` 통과. 지도 최대 1,823.5ms, 아파트 최대 435.9ms. 예상 밖 페이지 오류와 모바일·데스크톱 가로 넘침 없음.
- 프론트 코드나 `release` 변경 없이 운영 데이터만 반영했다. 다른 팀원의 작업 중 파일은 포함하지 않았다.
