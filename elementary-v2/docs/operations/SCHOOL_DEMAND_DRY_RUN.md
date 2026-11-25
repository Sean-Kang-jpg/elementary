# 학교 수요 기반 일배치 모의 실행

어디초 #12. 서울 기준 실행일의 전날까지 완료된 14일을 GA4 속성 `557166556`의 절대 날짜로 조회한다. `2026-11-26`의 조회 범위는 `2026-11-12`~`2026-11-25`다. `timetable_school_pick` 중 `customEvent:selection_method=user`인 이벤트만 GA4에서 `customEvent:school_id`별 `totalUsers`로 집계한다. 사용자 수 내림차순, 동률은 학교 ID 오름차순이다. 학교 ID가 비었거나 `(not set)`인 행은 후보 집계에서 제외한다.

운영 Supabase에서 해당 학교의 `school_afterschool_summary` 또는 `school_afterschool_slots` 행이 없으면 후보로 선정한다. 성공적으로 조회한 학교 중 순위가 높은 최대 5곳을 보고한다. SQL 38 시간대의 유무는 시간표 입력의 `starterHasSlots`와 같은 기준이다. 권한·네트워크·응답 오류 또는 GA4 집계 손실 신호는 `lookup_failed`로 보고한다.

## 실행

Python 3.9 이상과 `Asia/Seoul` 시간대 데이터가 필요하다. 아래 명령은 `elementary-v2`에서 실행한다. 배치에서 기준일을 생략하면 실행 시점의 서울 날짜를 사용한다. 같은 날짜를 다시 처리할 때는 같은 `--as-of`와 보고서 경로를 사용한다.

```sh
python3 -m scripts.school_demand_dry_run \
  --as-of 2026-11-26 \
  --inputs /path/to/reviewed-school-inputs \
  --output /path/to/reports/2026-11-26.json
```

- `GA4_ACCESS_TOKEN`은 기존 OAuth 인증에서 주입한다. Data API가 활성화된 Google Cloud 프로젝트, 속성 Viewer 또는 동등한 읽기 권한, `https://www.googleapis.com/auth/analytics.readonly` 스코프 및 이벤트 범위 두 맞춤 측정기준이 필요하다. 쿼터 프로젝트 헤더가 필요한 기존 인증은 `GA4_QUOTA_PROJECT`를 사용한다. [metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/getMetadata), [runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport), [Viewer 권한](https://support.google.com/analytics/answer/9305587)
- `SUPABASE_READ_KEY`는 운영 앱의 기존 publishable 또는 legacy anon 키다. 두 표에 대한 Data API `SELECT`와 공개 읽기 정책(SQL 30·38)이 필요하다. 학교별 `select=school_id`와 `limit=1`만 요청한다. [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys)
- 각 후보의 검수 파일은 `<inputs>/<school_id>/candidate.json`과 `baseline.json`에 둔다. 두 파일이 있으면 [PR #11 비교기](SCHOOL_AFTERSCHOOL_DRY_RUN.md)를 호출한다. 빠진 파일이나 검수 자료가 있으면 해당 학교에 `source_review_required`를 붙인다. 보고서는 학교별 모의 변경 수, 실패 표와 비대상 변경 수를 포함한다. 검수 입력과 운영 현황 조회는 각각 독립적인 자료다.
- 보고서의 상위 폴더를 미리 준비한다. `--output`은 완성된 JSON 한 파일을 같은 경로에서 원자적으로 교체한다. 교체 전 중단은 이전 보고서를 보존하며 다음 실행은 동일 날짜를 처음부터 계산한다. 조회 결과나 입력 파일이 변경되면 같은 날짜의 보고도 달라질 수 있다. `--output`을 생략하면 JSON은 표준 출력으로 나간다.

| 종료 코드 | 결과 |
| --- | --- |
| 0 | `no_demand`(집계 가능한 학교 수요 없음), `no_missing_coverage`(누락 후보 없음), `completed`(모의 결과 또는 원문 검수 대기 포함) |
| 2 | `lookup_failed`(GA4 또는 Supabase 단계와 원인 포함), 명령 인자 오류 또는 보고서 저장 실패 |
| 3 | `dry_run_failed`(후보 입력 거부, 검수 실패 상태 또는 비대상 변경 검증 실패). 다른 후보는 계속 처리 |

## 확인 결과

- 최신 `origin/master`가 PR #11 병합 `38e0891c7edc71eca438af4daee089e6fb8cb6c8`임을 확인했다.
- GA4 기존 인증을 이 세션에서 찾지 못했다. OAuth 환경 변수와 기본 ADC 파일이 없고 `gcloud`는 설치되어 있지 않았다. 인증 없는 metadata와 runReport는 각각 HTTP 401, 배치 명령은 `lookup_failed`와 코드 2를 반환했다. 속성의 두 맞춤 측정기준과 실제 14일 수요는 확인 대기다.
- 운영 앱의 기존 공개 읽기 키로 두 파일럿 학교를 직접 GET으로 확인했다. 동패초 `B000026106`는 요약과 시간대 행 모두 없고 서울윤중초 `B000002016`는 두 표에 행이 있었다. 실제 GA4 수요와의 교차 결과는 확인 대기다.
- PR #11의 로컬 기준과 검수 자료를 재사용했다. 오프라인 수요·누락 fixture는 합성 값으로 두 학교를 검증한다. 동패초는 요약 1·강좌 28·시간대 7 추가, 서울윤중초 변경 0, 두 학교 모두 대상 밖 변경 0이다. 원래 입력으로 동일 보고서, 제안 기준으로 반복 비교 시 변경 0, 파일 교체 직전 중단 후 복구, 실패 표 보고와 코드 3을 확인한다.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest \
  scripts.test_school_demand_dry_run scripts.test_school_afterschool_dry_run
PYTHONDONTWRITEBYTECODE=1 python3 -m scripts.verify_school_afterschool_dry_run_pilots
```

별도 고정 자료로 배치를 재현할 때는 `--offline /path/to/lookup.json`을 추가한다. fixture에는 `demand` 배열(학교 ID, 사용자 수 쌍)과 `missing_tables` 객체(학교 ID별 누락 표 이름 배열)를 둔다. 오프라인 실행은 네트워크 접근 없이 같은 선정·비교·보고 코드를 거친다.
