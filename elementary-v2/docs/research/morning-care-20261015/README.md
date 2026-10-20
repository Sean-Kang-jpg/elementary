# Track A — 아침돌봄 데이터 조사 및 ETL 명세

조사 확인일: **2026-10-15, Asia/Seoul**. 조사 단계에서는 운영 DB를 SELECT로만 확인했다.
**2026-10-16 후속 완료:** 비공개 스키마 구축·40개교 시험 적재·검증 결과는 [구축 기록](SCHEMA_PILOT_20261016.md)에 정리했다.

## 결과

- 서울 **25개 자치구 40개교**, 기존 학교알리미 15-라 첨부 **72개**를 재사용하고 원문 SHA-256을 전부 대조했다.
- **29개교에서 아침돌봄 계획 근거**를 확인했다: 일반 계획 27, 조건부 계획 2. 시작·종료가 모두 명확한 학교는 **26개교**다.
- 11개교는 선정한 첨부에 아침돌봄 근거가 없다. 이 중 상당수는 방과후·맞춤형 계획만 공시되어 있다. **미운영을 뜻하지 않는다.**
- 공식 연간계획은 현재 실제 운영의 증거와 구분한다. 표본의 실제 운영 상태는 **운영 확인 0 / 미운영 확인 0 / 정보 미확인 40**이다. 운영 중인 학교가 없다는 뜻이 아니다.
- 서울시 아침돌봄 키움센터는 [현재 공식 예약목록](https://umppa.seoul.go.kr/icare/user/kiumCareResve/kiumResveManage/BD_selectMornCareResveList.do)의 **전체 30건**과 [2026 안내의 명단 30개](https://umppa.seoul.go.kr/icare/user/bbs/BD_selectBbs.do?q_bbsCode=1001&q_bbscttSn=20251224104409615)를 대조했다. 개별 센터 당일 운영·공석·특정 학교까지의 동행 가능 여부는 별도 확인 사항이다.
- **2027학년도 서울 학교별 확정 운영 및 시각, 2027 아침돌봄 키움센터 확정 수는 미확인**이다. 2026 계획에 적힌 2027년 1~2월은 2026학년도이며 2027학년도 확인 자료로 세지 않는다.

## 산출물

|파일|용도|
|---|---|
|[POLICY_RESEARCH.md](POLICY_RESEARCH.md)|2026·2027 정책, 기관 수 검증 범위, 공식 출처와 한계|
|[school_sample.csv](school_sample.csv)|40개교 조사표. UTF-8 BOM으로 스프레드시트에서 열 수 있음|
|[school_sample.json](school_sample.json)|필드별 근거 ID, 원문 URL·해시·추출 텍스트 줄, 기존 정규식 후보 포함|
|[SCHOOL_REVIEW.md](SCHOOL_REVIEW.md)|학교별 계획 시각·학년·정원·예외를 읽기 쉽게 정리|
|[DATA_DICTIONARY.md](DATA_DICTIONARY.md)|상태·연도·시각·출처 정의 및 확보율|
|[PIPELINE_DESIGN.md](PIPELINE_DESIGN.md)|기존 코드·운영 DB 진단, 새 저장 단위·조회 계약·갱신 설계|
|[SCHEMA_PILOT_20261016.md](SCHEMA_PILOT_20261016.md)|실제 비공개 스키마·시험 적재·재실행·권한 검증 및 후속 전수 확대 절차|
|[schema_pilot_verification_20261016.json](schema_pilot_verification_20261016.json)|실제 DB 계수·migration 이력·검사 결과|
|[QA_CHECKLIST.md](QA_CHECKLIST.md)|검증 결과와 운영 반영 전 남은 게이트|
|[policy_sources.json](policy_sources.json)|공식 출처 등록부, 키움센터 명단 30개, 첫 페이지 정원 사례, 동행 정책|
|[coverage.json](coverage.json)|분모를 고정한 필드 확보율 집계 원수치|
|[sample_review.json](sample_review.json)|아침 전용 수기 검토값. 원문 재검토 시 이 파일을 수정|
|[sample_source_manifest.json](sample_source_manifest.json)|선정 학교·공시 첨부·원문/추출 텍스트 해시|
|[school_sampling_frame.json](school_sampling_frame.json)|선정 기준에 사용한 서울 school_master 606행 읽기 전용 스냅샷|
|[db_readonly_audit.json](db_readonly_audit.json), [서울 집계](db_seoul_readonly_audit.json)|2026-10-15 운영 DB 확인 기록|

## 기존 조사와 중복 방지

기존 [서울 확대 조사](../audit2/WAVE2_SEOUL_EXTRACTION_20261010.md)는 500개교 연간계획을 수집·추출했고,
[기존 돌봄 검수](../audit2/care_review_wave2_seoul_20261010.json)는 주로 오후·연장시간과 공통 대상학년을 정리했다.
별도 채팅 **「검증 산출물 작성」**의 최근 기록도 읽어 후보 30개교 첨부 61개가 이미 해시 검증됐음을 확인했다.
그 조사와 풍납·신천·방산 기준 3개를 합친 후보 33개교는 이번 표본에서 제외했다. 명단은 manifest의 `excluded_short_names`다.
해당 채팅에 새 요청을 보내거나 기존 조사 파일을 수정하지 않았다.

선정은 서울 `school_master` 606행과 기존 3개 probe를 조인한 뒤, 제외학교를 빼고 **구 이름 순으로 구별 school_id 첫 학교 1개씩(25), 앞 15개 구에서 두 번째 학교 1개씩(15)**을 취했다.
따라서 25개 구를 모두 포함하지만 무작위·학생수 비례 표본이 아니다. 사립·국립·공립을 별도로 층화하지도 않았다.
운영률 추정이나 서울 전체 확산 추계에 쓰지 않는다. 신규 전수수집 없이 기존 해시 저장소를 공유하고 아침 전용 검토만 추가했다.

## 재현

`elementary-v2/`에서:

```powershell
python -m etl.build_morning_care_research
python -m unittest etl.tests.test_morning_care_research etl.tests.test_schoolinfo_care_plans etl.tests.test_collect_care_data
```

빌더는 기존 `etl/runtime/audit2-documents/`의 원문·추출 텍스트를 읽고 연구 산출물만 만든다. 다운로드나 DB 적재 옵션이 없다.
원문 해시 불일치, 추출 텍스트 해시 변경, 잘못된 근거 줄은 실패시킨다. 원문은 git 제외 파일이므로 다른 작업환경에서는
기존 조사팀의 원문 저장소를 먼저 확보해야 한다. 최종 JSON·CSV·검수표는 원문 저장소 없이도 열람 가능하다.

## 다음 데이터 작업의 기준

신규 학교별 현재 안내·추가 모집·학기 변경 공지 또는 기관의 명시적 답변을 확보하면 `operation_status`를 재검토한다.
신청서 접수 가능과 실제 입급·공석은 별개다. 정원·동행 대상 학교가 없으면 가까운 센터라는 이유로 이용 가능 판정을 내리지 않는다.
2027 확정 자료가 나오기 전에는 **2026 계획 참고값**만 제공할 수 있다. 화면·SEO 적용은 별도 트랙이 이 구분을 유지해 진행한다.
