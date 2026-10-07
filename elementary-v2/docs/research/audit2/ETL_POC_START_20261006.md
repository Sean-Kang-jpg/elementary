# 서비스 개편 자료 PoC 착수 — 학교 60개

2026-10-06: 최소 보호 기준선 이후 서비스 확장을 위한 실제 자료 조사 단계에 착수했다. 첫 산출물은 [고정 학교 manifest](poc_school_manifest_20261006.json)와 [읽기 전용 선정 SQL](select_poc_schools.sql)이다. 운영 school_master/region_registry를 READ ONLY로 읽었으며 업데이트/적재/배포는 하지 않았다.

후속 진행: [NEIS 실제 조회 결과](NEIS_POC_RESULTS_20261006.md)에 47개 정확 연결/13개 보류와 4학교 응답 sample을 별도 기록했다. 아래의 미수집 상태 및 최초 manifest는 선정 당시 기준선으로 보존하며, 현재 진척은 후속 결과와 OPERATION_PLAN 체크리스트를 따른다.

## 선정·평가 분모

| 그룹 | 선정 | 후보 모집단 | 용도 |
| --- | --- | --- | --- |
| 성남 분당 | 20 | 38 | development 및 밀집 사용자 모집 후보 |
| 서울 | 10 | 606 | holdout |
| 인천 | 10 | 275 | holdout |
| 부산 | 10 | 302 | coverage |
| 전남 | 10 | 444 | coverage |

전체 60개, development/holdout/coverage 각 20개, 학교 ID 중복 없음. `초등학교`/`운영` 학교를 대상으로 각 그룹에서 `MD5(school_id + 'audit2-poc-20261006')` 및 school_id 순으로 고정 선정했다. 홈페이지나 문서 확보 여부로 미리 제외하지 않아 자료 접근 실패도 coverage 분모에 포함된다. 이 층화 표본은 전국 대표 표본이나 모집 성공 증거가 아니다.

개발 20개에서 추출·검수 규칙을 조정한 뒤 holdout 20개는 고정 규칙으로 평가한다. coverage 20개는 지역/문서 형식 차이를 확인한다. 각 그룹의 원본 pool 수는 이 조회 시점의 기준선이다. 학교 통폐합·원천 ID 오류가 입증된 경우만 replacement/version 사유를 남긴다. 문서를 못 구했다는 이유로 학교를 조용히 빼거나 성공률 분모를 바꾸지 않는다.

분당 20개는 **10~20학교 집중 모집 후보**이며 모집 대상 확정/접촉/사용자 확보는 아직 하지 않았다. 기존 grade1 통계는 참고만 하고 시간표·프로그램 운영시각 또는 가정 수요로 추정하지 않는다.

## 현재 확인된 것과 아직 없는 것

각 학교 school_id/schoolinfo_code/이름/주소/홈페이지/지역/1학년 통계·연도 및 지역 registry의 NEIS office code를 기록했다. office code는 지역 단위 정보이며 **NEIS 학교 code crosswalk가 검증된 것은 아니다**. `neis_school_code=null`, `crosswalk_status=unverified`로 유지했다.

5개 source 항목(NEIS timetable, school calendar, 일과표 절대시각, 방과후 계획, 돌봄 계획)은 모두 `not_fetched`; currentness=unknown, publish=not_approved. 이 60학교가 실제 자료 확보/검수/서비스 공개 완료라고 표시하지 않는다.

대상 입학년 2027, prior-year 참고 2026. 2027 운영계획이 아직 없으면 2026 자료를 planning 추정 참고로만 기록하고 2027 확정 일정으로 전환하지 않는다. 교시를 일률적으로 40분 간격으로 바꾸거나 돌봄↔방과후 이동 허용 여부를 추정하지 않는다.

## 바로 이어지는 작업

1. A2-E02: NEIS schoolInfo와 이름+주소/교육지원청 대조로 school_id↔office/school code crosswalk 검증. 동명이교/분교/불일치는 보류 큐; schoolinfo_code와 NEIS code를 동일시하지 않음.
2. A2-E03: 검증된 개발 학교부터 실제 시간표/학사일정 응답 sample 수집. 교시 정보와 학교 일과표 절대시각은 별도 source contract.
3. A2-E04: 학교/교육청의 공개 첨부 URL, format, hash, 발행 학년도, current version, checked_at registry. 접근 불가도 그대로 기록. 학교 전체 웹을 무차별 수집하지 않음.
4. A2-E05~06: 필드별 evidence·검수 gate와 gold set; 승인 전 운영 publish 없음. development 규칙 조정과 holdout 평가를 구분.

검증: `python -m unittest etl.tests.test_poc_manifest` — 6개 검사. 분모/중복/그룹/선정 rank/NEIS 미추정/미수집·미공개 상태만 검증하며 ETL 추출 정확도 테스트는 아니다. 후속 ETL은 기존 학구/학교/단지 master와 별도 출력에서 시작한다.
