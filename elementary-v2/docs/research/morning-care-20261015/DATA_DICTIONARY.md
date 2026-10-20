# 아침돌봄 데이터 정의서 v1

2026-10-15. 연구 JSON의 단위는 **학교 × 학년도 × 조사 시간대 범위**다. 센터·노선 서비스는 별도 데이터다.

## 실제 운영 상태와 계획 상태

|필드·값|의미|필요 근거|
|---|---|---|
|`operation_status=confirmed_operating`|해당 기간·시간대의 운영 확인|학교/운영기관이 해당 서비스를 현재 제공한다고 명시한 적용기간 있는 안내 또는 확인 기록. 연간계획만으로 승격 금지|
|`operation_status=confirmed_not_operating`|해당 범위의 미운영 확인|아침 서비스·기간·학교를 특정한 명시적 미운영/중단 안내. 미기재·검색 실패·돌봄교실 0개는 근거 아님|
|`operation_status=unknown`|실제 운영 여부 미확인|근거 없음·계획만 있음·범위 불명·자료 충돌·오래된 자료|
|`plan_status=planned`|해당 학교 연간계획에서 아침 서비스 확인|학교별 운영표/별도 아침 운영항목|
|`plan_status=conditional`|수요·여건·운영 시 등의 조건을 명시한 계획|조건 문구를 보존. 이 표본은 홍릉·영일|
|`plan_status=not_found`|검토한 첨부에서 근거 미확인|미운영이나 해당 학교 전체 문서의 부재로 해석 금지|

이 표본은 40개 전부 실제 운영 `unknown`, 계획은 `planned` 27 / `conditional` 2 / `not_found` 11이다.
`planned`도 시간 변경 가능성이 없는 확정 운영을 뜻하지 않는다. 검토 방법은 assistant의 보관 원문 추출 텍스트 대조이며 학교 관계자 확인은 하지 않았다.

## 조사표 필드

|필드|타입 / 허용값|정의·금지되는 해석|
|---|---|---|
|`school_id`|text, 기존 NEIS ID|`school_master.school_id`와 조인. 이름만으로 동일학교 판정 금지|
|`school_name`, `district`|text|표본 선정 시 school_master 명칭·도로명주소의 자치구|
|`academic_year`|integer|서비스 적용 학년도. 이번 값 2026. 2027-02 종료라도 2027학년도 아님|
|`source_year`|integer|이번 문서가 가리키는 학년도 2026. 기존 `statistics_year`(공시연도)와 구분|
|`calendar_scope`|`term_weekday`|이번 조사의 대상 범위인 학기 중 수업일 아침. 방학·자율휴업일은 본문 비고로 분리. 전 요일 운영 확인을 자동으로 뜻하지 않음|
|`service_type`|`school_morning_care`|학교 내 아침돌봄. `kium_morning_care`, `walking_school_bus`는 별도 서비스|
|`start_time`, `end_time`|`HH:MM` 또는 null|원문에서 명확히 읽은 계획상 시각. KST, 시작 < 종료. 빈칸을 07:00/09:00으로 채우지 않음|
|`end_time_raw`|text/null|‘수업전’처럼 시각이 아닌 종료 경계 보존. 1교시 시작과 등교 권장시각을 혼동 금지|
|`time_status`|`stated`, `open_end`, `source_conflict`, `not_found`|시각의 확보 상태. 운영 여부와 독립|
|`start_time_candidates`|string[] / 생략|화일초의 07:00·07:30 충돌. 시작시각 확정값은 null|
|`target_grades`|1~6 정수 배열/null|아침돌봄에 직접 연결된 대상학년. 전학년은 1~6으로 정규화. 오후·맞춤형·전체 돌봄 학년을 전이하지 않음|
|`eligibility_raw`|text/null|아침 항목 원문에 근거한 대상·신청 조건의 발췌/요약. 공백·띄어쓰기와 서술은 정리했으므로 축자 인용용 필드가 아님. 축자 근거는 `evidence.excerpt`|
|`application_window`|text/null|아침 서비스의 학생 신청 접수기간. 봉사자/강사 채용기간과 구분. 이번 표본은 모두 미확인|
|`capacity`|positive integer/null|아침 항목의 수용/모집 정원. 참여 학생 현황·담당 인력·교실 수·전체 돌봄 정원은 제외|
|`capacity_qualifier`|text/null|‘명 내외’ 등 수식 보존. 숫자만 읽고 확정 정원으로 고정하지 않음|
|`escort_to_school`|`confirmed_available`, `confirmed_unavailable`, `unknown`|학교 내 아침돌봄에 직접 귀속된 동행 여부. 학교 안 서비스이므로 자동 ‘불필요/미제공’ 처리하지 않음. 이번 전부 unknown|
|`operation_evidence`, `escort_evidence`|object/null|해당 상태를 지지하는 직접 근거. 이번 학교 표본 전부 null|
|`checked_on`|date|**보관된 문서 내용을 이번에 검토한 날** 2026-10-15. 원문 사이트를 이날 재다운로드했다는 뜻이 아님|
|`source_list_checked_at`|ISO timestamp|기존 probe의 학교알리미 첨부목록 확인일. 이번 원문은 주로 2026-10-06~09 수집본|
|`source_live_rechecked_on`|date/null|원문 사이트의 최신 버전을 직접 다시 확인한 날. 이번 학교 표본 전부 null|
|`source_kind`|`annual_plan`|자료의 성격. 승인 전 ‘안’ 제목도 포함하며 실제 집행 확인과 구분|
|`review_state`|`assistant_source_text_review`|assistant가 추출 텍스트의 관련 표·문맥을 대조. 학교 확인·독립 2차 검수·PDF 전 페이지 육안 검증 아님|
|`publication_state`|`research_only`|이번 데이터는 연구 산출물. 운영 테이블 자동 적재 금지|
|`schoolinfo_url`, `homepage`|http(s) URL|원문 접근 경로. 학교 홈페이지 수집/접근 성공을 뜻하지 않음|
|`sources[]`|object[]|문서명, FILE_SEQ, 2026 공시 첨부 URL, 원문 SHA-256, 추출 텍스트 SHA-256·경로·줄 수. 다른 환경의 원문 위치는 별도 materialization 필요|
|`evidence[]`|object[]|해시+줄 범위 ID, 발췌. 긴 PDF 추출 줄은 아침 언급 주변을 제한하고 마스킹 인명은 제거. 쪽번호와 텍스트 줄은 다름|
|`field_evidence`|field → evidence ID[]|채워진 필드의 근거 묶음. 자료 갱신으로 텍스트 해시가 달라지면 줄 번호만 재사용 금지|
|`legacy_regex_candidates`|range → count|기존 탐지기의 후보. 검토값/운영 확인 아님|

이번 설계에서 신청 **조건**과 신청 **방법·접수기간**을 분리한다. ‘희망자’는 맞벌이 증빙서류가 필요 없다는 뜻이 아니다.
신학·신은처럼 아침에 증빙 불요라고 직접 명시한 곳만 그 문구를 남겼다.

## 센터·동행 출처 등록부

`policy_sources.json.seoul_morning_centers`는 2026 공식 공지의 명단 30개다. `research_key`는 이 조사 내부 키이며 `care_centers.center_id`가 아니다.
공통 정책의 `escort_to_school=policy_supported`는 프로그램에 동행 기능이 있다는 뜻이다. 특정 학교·아동에게 `confirmed_available`로 전환하지 않는다.
`school_ids=null`은 학교별 매칭 미확인이다. `capacity=null`도 0이 아니다.

`current_listing_capacity_examples`는 별도 현행 예약목록 첫 페이지 8개 센터의 ‘아침 돌봄’ 정원이다.
공지 명단과 정원 사례를 이름으로 자동 조인하지 않았다. 시설 ID·주소 대조 후 매칭해야 한다. `available_slots=null`은 공석을 조회하지 않았다는 뜻이다.

## 필드 확보율

분모는 **표본 전체 40개교**, 학기 중 2026 계획 값이다. 서울 운영률·2027 확정률과 무관하다.

|항목|확보 학교|확보율|
|---|---:|---:|
|아침 계획 근거(조건부 포함)|29|72.5%|
|시작 시각|28|70.0%|
|종료 시각|27|67.5%|
|시작·종료 모두 명확|26|65.0%|
|아침 대상학년|24|60.0%|
|아침 대상/조건 문구|26|65.0%|
|정원(내외 수식 포함)|7|17.5%|
|아침 학생 신청 접수기간|0|0.0%|
|학교 내 서비스의 등교 동행 명시|0|0.0%|
|학교별 실제 운영 확인|0|0.0%|
|2027학년도 확정 근거|0|0.0%|
|공식 첨부·확인일·해시|40|100.0%|

기존 정규식은 26/40개교에서 오전 구간을 탐지했다. 검토에서 계획 근거를 찾은 29개교 중 두산(표 제목과 시각이 다른 줄),
초당·방이(종료가 ‘수업전’)를 놓쳤다. 화일은 후보 시각이 있어도 서로 충돌하는 시작시각을 해소하지 못한다.
이 탐지율로 자동 추출 정확도·전국 성능을 주장하지 않는다.
