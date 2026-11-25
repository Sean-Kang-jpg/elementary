# 단일 학교 방과후·맞춤형 dry-run

강비서 #10 / SW 개발 #11. 검수한 학교 한 곳의 후보와 로컬 기준 스냅샷을 비교한다. Python 표준 라이브러리만 사용하는 명령이며 두 JSON을 읽어 결과를 표준 출력에 쓴다.

```sh
cd elementary-v2
python3 scripts/school_afterschool_dry_run.py \
  --school-id B000026106 --baseline /path/to/baseline.json \
  --candidate /path/to/candidate.json > /tmp/school-dry-run.json
jq '.counts' /tmp/school-dry-run.json
jq '.proposed_baseline' /tmp/school-dry-run.json > /tmp/school-next-baseline.json
python3 scripts/school_afterschool_dry_run.py \
  --school-id B000026106 --baseline /tmp/school-next-baseline.json \
  --candidate /path/to/candidate.json | jq '.counts'
```

기준 JSON은 `school_afterschool_summary`, `school_afterschool_programs`, `school_afterschool_slots`, `school_afterschool_checks`의 행 배열을 가진 객체다. 대상 밖 학교도 포함할 수 있다. 후보는 SQL 30·32·38의 컬럼 이름을 사용하는 변환 후 행이다. 아래 입력은 한 표가 읽기 실패한 사례다. 생략한 표는 `no_data`로 처리한다.

```json
{
  "school_id": "B000026106",
  "tables": {
    "school_afterschool_programs": {
      "state": "failed",
      "rows": [],
      "evidence": "첨부 읽기 실패"
    }
  }
}
```

| 상태 | 동작 |
| --- | --- |
| `complete_reviewed` | 한 학교·한 표의 **전체 키 범위**를 검수한 경우에만 사용한다. 후보에 있는 키는 추가·수정, 빠진 키는 삭제 제안으로 기록한다. 빈 배열은 의도적인 전체 삭제 범위다. |
| `partial_reviewed` | 기준에 학교가 없으면 확인된 일부 행을 모의 추가한다. 학교가 있으면 표 전체를 보존하고 차이가 있는 후보를 `held_candidates`에 표시한다. |
| `no_data`, `failed` | 빈 배열을 받고 기존 행을 보존한다. |

검수 상태에는 원문과 검수 범위를 추적할 수 있는 `evidence` 문자열이 필수다. 동일 표에 연간·기수·종류 일부만 확인했다면 `partial_reviewed`로 제출한다. `complete_reviewed` 표시는 검수자가 입력한다. 비교기는 원문을 열거나 검수의 완전성을 판정하지 않는다. 실제 행을 만들 때는 전체 SQL 컬럼과 제약을 입력 생성 단계에서 검증한다.

- PK 순서로 표별 추가·수정·삭제를 출력한다. 강좌와 확인 항목의 `seq`가 바뀌면 SQL PK를 기준으로 표시한다. 시간대 키의 `HH:MM`과 `HH:MM:00`은 같은 값으로 비교한다. 비대상 행의 값과 비대상 행 사이의 순서는 유지한다.
- 같은 키를 수정할 때 후보에 명시한 값만 덮어쓰고 요약의 기존 `review_state`를 승계한다. 확인 항목은 학교·사유·요일·상세가 일치할 때 `seq`가 달라도 기존 `resolved_on`을 승계한다. 일치하지 않는 완료 행은 보존하며, 그 자리의 `seq`를 후보가 재사용하면 입력을 거부한다.
- 요약 삭제에는 자식 세 표의 완전한 검수와 자식 행 0건이 필요하다. 후보에 비대상 행이 섞이거나 PK가 중복되거나 검수 상태·근거가 부적합하면 전체 입력을 종료 코드 2로 거부한다. 결과 JSON은 출력하지 않는다.
- `proposed_baseline`을 같은 후보의 후속 기준으로 쓸 수 있다. 검수 메타데이터와 기존 스냅샷이 필요한 경우 승인 담당자가 제공한 로컬 내보내기를 입력으로 사용한다.

## 검증 기록

```sh
cd elementary-v2
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v scripts.test_school_afterschool_dry_run
PYTHONDONTWRITEBYTECODE=1 python3 -m scripts.verify_school_afterschool_dry_run_pilots
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts.test_school_afterschool_dry_run \
  etl.tests.test_afterschool_rules etl.tests.test_load_school_afterschool \
  etl.tests.test_afterschool_slots etl.tests.test_afterschool_checks_sheet \
  etl.tests.test_build_pivot_priority_slots etl.tests.test_pivot_p1_slot_review
```

단위 검사 6건과 기존 관련 검사 60건이 통과했다. 결정적 출력, 추가·수정·삭제, 대상 외 후보 전체 거부, 검수·완료일 보존, 자료 없음·실패·부분 검수, 요약과 자식 표의 삭제 조건을 확인했다. 파일럿 검증기는 SW #7 선행 검토와 #8 첨부 보고서·비교 로그의 입력을 재사용한다. 기존 일반 적재기의 순수 변환 함수만 호출해 검수 입력과 지역 게이트에서 로컬 기준을 재구성하고, 각 학교를 별도로 CLI에 넣었다. SW #8 비교 로그와 기준 행 수가 일치했다.

| 학교 | 확인한 근거와 모의 결과 |
| --- | --- |
| 동패초 `B000026106` | 2학기 운영 안내의 5개 반 × 평일 5일 맞춤형 활동과 연간 방과후 계획 표본 3건. 로컬 기준에 학교가 없어 요약 1, 강좌 28, 시간대 7, 확인 항목 0 추가. 수정·삭제 0. [학교 2학기 운영 안내](https://www.goepj.kr/dongpae-e/na/ntt/selectNttInfo.do?bbsId=8473&mi=13163&nttSn=1346766) |
| 서울윤중초 `B000002016` | 연간 계획 PDF 5쪽 맞춤형 5개 시간대의 요일·시각·활동이 기준과 일치. 네 표 모두 변경 0, 로컬 `PDF원문` 확인 행 보존. PDF 2쪽 총괄 시간과의 충돌, 후속 모집·변경 공지는 SW #8의 보류 항목이다. [학교알리미 연간 계획 PDF 5쪽](https://www.schoolinfo.go.kr/servlets/EiFileDownLoad.do?SHL_IDF_CD=fcd4b30a-f339-4918-9ad1-e3fb45970fce&JG_BURYU_CD=JG150&JG_HANGMOK_CD=59&JG_GUBUN=1&JG_CHASU=2&JG_YEAR=2026&USE_YN=Y&FILE_SEQ=0#page=5) |

기준 행 수는 표 순서대로 840 / 29,713 / 13,469 / 1,508이었다. 두 학교 모두 제시한 기준으로 재실행 시 변경 0, 원래 기준으로 재실행 시 출력 동일, 비대상 행 값·순서 동일을 확인했다. #8에 보관된 원문 4개의 SHA-256이 첨부 보고서와 일치했다. 이번 검증 범위는 보관본과 로컬 재구성 기준이다.

운영 검토 전 동패초의 반별 초1 자격, 현재 유효한 기수별 확정 강좌 및 실제 요약 존재 여부가 필요하다. 서울윤중초는 최근 운영 변경과 운영 스냅샷의 `resolved_on`을 확인해야 한다. 운영 적용 범위와 삭제 근거 승인 및 병합·배포는 Claude가 맡는다.

## GitHub 인계

`.github/workflows/`의 ETL 워크플로는 수동 또는 예약 실행이다. 두 `vercel.json`에서 작업 브랜치 Preview를 막는 설정은 확인되지 않았다. PR #9의 첫 작업 브랜치 커밋 `0d92608`에는 PR 생성보다 약 5분 이른 Vercel Preview 배포 기록이 있어, 브랜치 push부터 배포가 유발될 수 있다. 사용자 지시에 따라 로컬 커밋으로 전달한다. [PR #9](https://github.com/Sean-Kang-jpg/elementary/pull/9)
