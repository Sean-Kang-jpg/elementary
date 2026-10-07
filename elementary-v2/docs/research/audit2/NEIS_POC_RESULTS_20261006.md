# NEIS 공개 자료 PoC — 코드 연결과 실제 응답

후속 현재 상태: [기존 ETL 재사용 결과](NEIS_RECONCILIATION_20261006.md)에서 Schoolinfo까지 대조하여 59학교 연결/청산초 1개 보류, 5학교 API 표본 및 문서 registry 조사로 진척했다. 아래 47/13과 4학교는 최초 엄격 비교 이력이다.

2026-10-06: [고정 60학교](poc_school_manifest_20261006.json)에 대한 공개 GET 조회를 수행했다. 운영 DB/Storage/학교 master/배포/Auth 설정은 변경하지 않았다. API 키와 키 포함 URL은 결과에 저장하지 않았다. [수집 결과](neis_poc_evidence_20261006.json), [주소 불일치 검토 큐](neis_crosswalk_review_20261006.json).

## 학교 식별 연결

서울·부산·인천·경기·전남 office의 NEIS schoolInfo 초등학교 3,039행을 6페이지로 조회했다. office + 학교 종류 + 공백/NFC 정규화한 정확한 학교명 + 도로명주소(괄호/쉼표/공백만 제거, 숫자/하이픈 유지) + 7자리 NEIS code로 비교했다. 주소 행정구역을 자동 치환하거나 유사 이름만으로 승인하지 않았다.

| 고정 그룹 | 선정 | 정확 연결 | 보류 |
| --- | ---: | ---: | ---: |
| 분당 development | 20 | 20 | 0 |
| 서울 holdout | 10 | 10 | 0 |
| 인천 holdout | 10 | 7 | 3 |
| 부산 coverage | 10 | 10 | 0 |
| 전남 coverage | 10 | 0 | 10 |
| 전체 | 60 | 47 (78.3%) | 13 |

47개 연결의 office/code 조합은 서로 다르다. **schoolinfo_code는 기존 manifest에서 보존한 값이며 Schoolinfo 원천과 이번에 독립 대조한 것은 아니다.** NEIS code와 동일시하지 않는다. 최초 선정 manifest는 당시의 unverified 상태를 그대로 보존하고 새 결과를 별도 파일로 기록했다.

13개는 모두 이름 후보가 존재하지만 주소 표기가 다르다. 인천 3개는 기존 중구/서구와 NEIS 영종구/검단구, 전남 10개는 기존 전라남도와 NEIS 전남광주통합특별시로 나타났다. 뒤의 도로·건물번호는 같은 것으로 관찰되지만 **이번 조회만으로 행정변경의 공식 효력이나 원천 주소 수정 필요성을 확정하지 않는다.** 변경 근거를 별도로 대조한 뒤 명시적 alias/검수 결정으로 승인해야 한다. 자동 연결·master 수정·표본 교체 없음. 분교장도 정확한 전체 이름으로 비교했고 별도 본교로 합치지 않았다.

## 시간표·학사일정 sample

검증된 그룹별 첫 학교 1개씩, 총 4학교에서 `elsTimetable` 4응답과 `SchoolSchedule` 4응답을 확보했다. 전남은 검증 code가 없어 조회를 보류했다. 60학교 전체 응답 coverage 또는 무작위 정확도 평가로 해석하지 않는다.

| 그룹 | 1학년 시간표 행 | 학사일정 행 |
| --- | ---: | ---: |
| 부산 | 23 | 26 |
| 분당 | 23 | 15 |
| 인천 | 24 | 13 |
| 서울 | 115 | 31 |

시간표 조회는 2026-09-14~18 / AY=2026 / GRADE=1, 학사일정은 2026-09-01~10-31. 시간표 185행과 학사일정 85행을 모두 페이지 단위로 수신하고 총 건수를 대조했다. **학교별/응답별 최대 12행만 공개 필드 sample로 보존**하여 저장 fixture는 96행이다. 총 건수와 `sample_is_truncated`를 함께 기록했다. 나머지 행 및 원본 response bytes는 보존하지 않아 저장된 SHA256을 fixture만으로 재계산할 수 없다. 각 해시는 조회 당시 원본 응답을 식별하기 위한 provenance이며 재현 가능한 원문 archive를 대신하지 않는다.

실제 시간표에는 학년·반·교시·날짜·과목·원천 갱신일이 있었지만 시작/종료 시각은 이번 수집 항목에 없다. `start_time/end_time=null`, `absolute_clock_source=not_collected` 유지. 23행을 주간 23교시로 요약해 학생 전체의 시간표로 사용하지 않는다. 반별/날짜별 행과 교시를 보존하며 반 미선택 시 개인 확정 시간표가 아니다.

학사일정의 휴업일·공휴일·행사와 1학년 적용 표시를 보존했지만 행사를 임의의 수업 취소나 단축 시각으로 변환하지 않는다. 원천 데이터의 최신성/정확성, 실제 학생 참여/방과후·돌봄 이동 허용 여부는 별도 검증 사항이다. 대상 입학년 2027에는 2026 참고 자료로만 사용하며 2027 확정 상태나 publication 승인으로 올리지 않는다.

공식 API 안내: [초등학교 시간표](https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN15020190408160341416743&infSeq=2), [학사일정](https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17220190722175038389180&infSeq=2). 현재 `elsTimetable`를 사용했고 과거 연도 별도 endpoint와 혼용하지 않았다.

## 검증과 다음 순서

- `node --test scripts/collect-neis-poc.test.mjs`: 12개 PASS. 정확 매칭/동명 충돌/잘못된 code/페이지 오류/필드 whitelist 단위 검사, 네트워크 없음.
- `python -m unittest etl.tests.test_neis_poc_evidence etl.tests.test_poc_manifest`: 12개 PASS. 저장된 60학교 분모/47 code 유일성/13 미승인 보류/페이지 합계/96 sample/시각 미추정/자격증명 미저장 검사. 자료 추출 정확도나 실제 일과표 검증은 아님.
- E02 부분 완료: 47 연결 + 13 검토 큐. 행정명 변경 근거와 별도 Schoolinfo 대조는 잔여 업무.
- E03 부분 완료: 4학교 공개 실제 응답 확보. 학교 일과표의 절대시각과 전남 sample은 미확보.
- 이어서 E04의 공개 문서 registry와 제한된 개발학교 일과표/방과후/돌봄 문서 수집. 위 13 보류는 유지하고 검증된 분당 개발학교부터 문서 수집을 시작할 수 있다. 수집 실패·학년도 불명·접근 제한도 기록하며 승인 전 운영 publish 없음.
