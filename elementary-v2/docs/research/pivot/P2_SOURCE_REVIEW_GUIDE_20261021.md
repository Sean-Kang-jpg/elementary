# P2 하교 시정표 재검수 실행 지침 (2026-10-21)

범위: `docs/research/pivot/p2_triage_20261021.json`의 17개교만. P1 방과후 ETL 및 운영 DB 변경 금지.

## 확인된 사실
- 16개교는 과거 학교알리미 2-가 첨부파일 텍스트 검사에서 `no_clock_detected`. 원문에 시정표가 없다는 뜻은 아님.
- 위례초(B000023087)는 접근 가능한 세 감사 파일에서 확인되지 않음. 경기 wave3 대형 감사 파일은 로컬 재검토 필요.
- 검수 완료 하교시간 데이터 4개 묶음에서는 17개교 모두 미발견.

## 재검수 순서
1. 로컬의 `etl/runtime/audit2-documents/text/<sha256>.txt`가 존재하면 먼저 읽는다. 해당 해시는 `p2_triage_20261021.json`에 기록돼 있다.
2. `시정표`, `일과운영`, `일과 시간`, `학교생활 시간`, `교육활동 시간`, `학년별 일과`, `1학년`, `4교시`, `5교시`, `급식` 및 표의 시간 패턴을 검색한다. 행과 열이 깨진 표는 PDF/HWPX 원문으로 시각 확인한다.
3. 원문에 1학년 시간표가 없으면 `schoolinfo_disclosure_probe_*.json`에서 첨부파일 메타데이터를 확인하고, 학교 홈페이지의 2026학년도 1학년 주간 시간표·학사운영 안내·가정통신문을 별도 조사한다.
4. 위례초는 `schoolinfo_daily_clock_audit_wave3_gyeonggi_20261010.json`에서 ID 검색 후 해당 학교의 원문 첨부파일과 추출 상태를 확인한다.
5. 원문 근거가 있는 경우에만 요일별 4/5/6교시, 점심 위치, 마지막 교시 종료시각을 기록한다. 2026 자료로 2027 입학생을 추정한다는 문구를 유지한다.
6. 1차 검수와 별도 원문 대조가 완료되기 전에는 `load_school_day_estimates.py --apply`를 실행하지 않는다.

## 검수 결과 기록 스키마 (학교별)
```json
{
  "school_id": "B000003745",
  "source_url": null,
  "source_file_sha256": null,
  "source_year": 2026,
  "grade": 1,
  "weekday_periods": {"월": null, "화": null, "수": null, "목": null, "금": null},
  "p4_end": null,
  "p5_end": null,
  "p6_end": null,
  "lunch_start": null,
  "lunch_end": null,
  "lunch_position": null,
  "evidence_excerpt": null,
  "review_status": "pending_source_review",
  "publish_status": "not_approved"
}
```

검수 완료의 최소 조건: 학교 ID·학년도·1학년 대상 여부·요일별 교시 수·마지막 교시 종료·급식 후 하교 여부를 각각 근거와 함께 확인. 불명확한 요일은 `school_check_needed`로 남긴다.

## 충돌 방지
- 다른 팀원 소유: 방과후 v3 추출기, `sql/30_create_school_afterschool.sql`, 운영 적재 경로.
- 본 브랜치 소유: `docs/research/pivot/p2_*` 및 P2 전용 검수 문서.
- 원문 재수집 및 OCR은 로컬 런타임에서 수행하고, 원문 전체나 개인정보는 커밋하지 않는다.
