# 기존 ETL 규칙 재사용과 문서 수집 착수

2026-10-06 후속 작업. 앞선 [NEIS 47/60 결과](NEIS_POC_RESULTS_20261006.md)는 엄격한 원문 주소 비교의 이력으로 보존한다. 최신 연결 결과는 [59/60 재검증](neis_reconciled_crosswalk_20261006.json), 최신 API 표본은 [5학교 응답](neis_reconciled_samples_20261006.json)이다. 운영 수정·적재·배포 없음.

## 운영 주소와 기존 ETL

[READ ONLY SQL](verify_poc_live_addresses.sql)로 `public.school_master`의 고정 60학교를 다시 조회했다. [조회 결과](poc_live_addresses_20261006.json)는 최초 manifest와 주소가 모두 같았다. 인천 3학교는 현재 조회한 공개 `road_address`에서 중구/서구로 나타난다. 이는 해당 필드의 현재 관찰이며, 전체 DB에 행정개편이 전혀 반영되지 않았다는 뜻이나 ETL 미실행 원인 확정은 아니다. 이번 작업에서 운영 주소를 갱신하지 않았다.

기존 ETL에는 이미 두 처리가 있다.

- `region_registry.canonicalize_address`: 통합 광주·전남 명칭을 시군구에 따라 기존 지역 키와 연결. 기존 학구도·학교 source와 호환하는 전환 체계이며 통합 명칭을 무조건 전남으로 치환하지 않음.
- `build_school_master_v2.current_district/with_district`: 일치된 학교의 Schoolinfo 주소에서 새 구명을 읽고, 같은 지역·같은 도로/건물번호일 때 반영. 구 분할을 일괄 old→new 치환하지 않음.

새 `python -m etl.audit_neis_crosswalk`는 위 함수를 직접 호출한다. 원문 NEIS 후보, 현재 공개 주소, 기존 **Schoolinfo snapshot의 schoolinfo_code/이름/주소**를 함께 대조했다. NEIS와 Schoolinfo의 정규화 주소가 일치해야 하며 모호한 code·다른 도로·원천 상충은 승인하지 않는다. 저장된 Schoolinfo는 이번에 live 재조회한 데이터가 아니며 입력 파일과 사용 규칙 SHA256을 기록했다. 최초 school_id/schoolinfo_code, 고정 60학교 분모와 holdout을 바꾸지 않았다.

## 결과: 59 연결, 1 원천 불일치

정확 연결 47개에 통합 지역 정규화 9개와 인천 Schoolinfo 구명 대조 3개를 더해 59개를 검증했다. 59개의 office/code 조합은 모두 유일하다. 연결 검증은 publication 승인이 아니다.

청산초등학교 `B000006819` / `S140001874`는 단순 행정명 차이 외에 다음 불일치가 있다.

| 원천 | 도로·건물번호 |
| --- | --- |
| 공개 학교 master 및 NEIS 후보 `8702030` | 청산로 1602-1 |
| 저장된 Schoolinfo 기본정보 | 청산로 1579-74 |

학교 이전·갱신 지연·원천 오류 중 어느 원인인지 미확정이다. Schoolinfo와 NEIS의 현재 공식 학교 위치/이전 안내를 대조해야 한다. 자동 치환·잘못된 code 승인·학교 표본 교체 없이 이 1개만 보류한다. 기존 13개 검토 큐는 과거 이력으로 보존하며 최신 큐는 새 결과의 null code 행이다.

## NEIS 표본 보완

수집기에 `--reconciled-samples`를 추가해 검증된 code 파일을 명시적으로 사용한다. 원문 strict 조회 모드와 후속 ETL 재검증 단계를 구분한다. 전남은 검증된 영광중앙초를 표본으로 조회했고 시간표 92행·학사일정 14행을 수신했다. 최신 표본은 5학교/10응답, 전체 376행 수신/120행 한정 fixture. 기존 4학교 결과를 덮어쓰지 않았다.

교시·반·날짜와 절대시각은 계속 분리하며 시작/종료 null이다. 전체 학교 coverage나 2027 확정 운영계획은 아님. 개인 참여·돌봄↔방과후 이동 허용 여부 추정 없음.

## E04 문서 source registry 1차 구현

[source registry](document_source_registry_20261006.json)는 분당 개발학교 첫 2개(한솔초·양영초) × 일과표/방과후/돌봄 3종, 총 6슬롯을 고정했다. 전체 PoC 분모는 여전히 60이며 개발 2학교의 조사만 시작했다. 문서 URL/형식/학년도/SHA256/version/current/last_checked/evidence/review/publish 필드를 분리했고 미확인 값은 null/unknown, publication 미승인 유지.

공식 [한솔초 방과후](https://hs-e.goesn.kr/hs-e/na/ntt/selectNttList.do?bbsId=12782&mi=15066), [한솔초 돌봄](https://hs-e.goesn.kr/hs-e/na/ntt/selectNttList.do?bbsId=12790&mi=15079), [양영초 방과후](https://yy-e.goesn.kr/yy-e/na/ntt/selectNttList.do?bbsId=13266&mi=15932) 3게시판을 공개 GET으로 확인했다. [probe 결과](document_source_probe_20261006.json)는 모두 HTTP 200, 응답 bytes/SHA256/checked_at 및 상세 게시글 후보 31개를 기록한다. 일반 href가 아닌 버튼은 응답 안의 `selectNttInfo` action과 숫자 post ID가 모두 관찰될 때만 주소로 해석한다. 임의 주소 생성·로그인·POST·무차별 학교 crawl 없음. 검색 캐시와 실조회 목록이 달라 제목만으로 최신 버전을 확정하지 않았다.

**게시판 응답 hash는 첨부 문서 hash가 아니다.** 첨부 HWP/HWPX/PDF bytes/발행일/실제 시각/최신 버전/이용조건은 아직 미확보·미검수다. 일과표 2슬롯과 양영 돌봄 source도 미발견이며 전체 6슬롯을 유지한다. 다음 순서는 2026 운영계획/수강안내 상세 글과 첨부를 제한 수집하고 학교 일과표의 절대시각을 검증하는 것. 2026 참고 자료를 2027 확정 자료로 올리지 않는다.

## 재현·검증

`python -m unittest etl.tests.test_neis_reconciliation`: 9개 PASS(구명 변경/통합 지역/잘못된 도로/Schoolinfo 상충/동명이교·중복/60학교 보존/5학교 표본). `node --test scripts/probe-school-document-sources.test.mjs`: 5개 PASS(HTTPS allowlist, 외부/스크립트 링크 차단, 관찰된 action 해석, 중복 제거). 기존 PoC/ETL 규칙 검사까지 합친 최종 실행은 Python 56개 + Node 17개 PASS. 실제 자료의 추출 정확도/원문 archive/최신성 평가 완료는 아니다.
