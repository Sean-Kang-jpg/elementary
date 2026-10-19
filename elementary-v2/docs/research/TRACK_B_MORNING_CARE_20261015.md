# Track B — 아침돌봄 서비스·UX

작성일: 2026-10-15 (Asia/Seoul)
범위: 제품 화면·UX·기존 시간표 연결. 자료 검증은 Track A, 편집 콘텐츠는 Track C.
상태: 기존 DB 호환 구현. 신규 스키마·ETL·운영 데이터 변경 없음. 운영 배포 전.

2026-10-19 후속: 아래 최초 검증 표의 브라우저 미완료 항목은 [로컬 통합 검증](../operations/LOCAL_INTEGRATION_20261019.md)에서 해소했다. 학교·센터·선택·재방문·모바일 터치·공개 회귀 검사가 통과했다. 연구 DB 연결과 아침돌봄 UI 운영 배포 완료를 뜻하지 않는다.

## 현재 구조와 재사용

| 진입 | 기존 구조 | 이번 연결 |
| --- | --- | --- |
| 학교 상세 `/school/*` → 방과후·돌봄 | `SchoolDetail` → `SchoolDayEstimateCard`, `AfterschoolSummary`, `SchoolCarePanel` | 하루 카드 위쪽 `MorningCarePanel`. 기존 오후·저녁 공시와 별도 표시 |
| 학교 주변 센터 | `CareCenterList` → `getCareCentersNear(..., 1000)` | 센터별 아침돌봄·등교 동행 확인 상태 추가 |
| 지도 | `MapContainer` → `CareCenterMarkerManager` → `MapPlaceDetail` | 센터 상세에서 같은 `CareCenterMorningInfo` 재사용. 학교 중심·직선거리 1km·기존 마커 유지 |
| MY `/my` | `MySchedule` → `MyAfterschoolPicker`, `MyScheduleWeek` | 기존 선택 영역 안에 요일 선택, 오후 시간표 앞에 짧은 아침 계획 |
| 저장 | `ScheduleEntry`의 `care`, `elementary-schedule-plans-v1` | 동일 종류·저장 키 사용. 기존 초안·방과후·맞춤형·오후돌봄 유지 |

현재 `school_care_hours`에는 `morning_hours`, `source_year`, `source`가 있다.
`status`와 `grades`는 돌봄 전체 필드라 아침 운영·대상학년의 확정 근거로 쓰지 않는다.
현재 `SchoolDayEstimate`에는 등교시각이 없다. 엔진의 가정 시작 시각을 등교시각으로 표시하지 않는다.
현재 센터 응답에는 학기/방학 운영시간만 있고 아침 제공·등교 동행은 없다.

## 학교 상세 표시 규칙

등교시각, 아침 운영 상태, 시작/종료, 아침 대상학년, 신청 정보, 출처, 기준 학년도를 항상 구분한다.
원문 URL과 확인일은 자료가 있을 때 추가한다. 신청 기간·신청 방법·선정 조건은 없으면 학교 확인 필요로 표시한다.

| 상태 | 화면 | 시간표 |
| --- | --- | --- |
| `operating` | 운영 확인 | 읽을 수 있는 아침 시각과 명시 선택 요일이 있을 때 계획으로 추가 |
| `reported` | 운영시간 기재 | 위와 같으며 시간 근거는 예상으로 저장 |
| `not_operating` | 미운영 확인 | 자동 일정 추가 없음. A의 명시 근거를 받은 경우만 사용 |
| `unknown` | 미확인 | 자동 일정 추가 없음. 미확인과 미운영이 다르다고 안내 |

현행 어댑터는 정상적인 아침 시간 구간만 `reported`로 바꾼다.
빈 행·빈 시간·‘미운영’ 같은 자유문장은 `unknown`으로 둔다. 텍스트만으로 검증 상태를 확정하지 않는다.
시각은 전체 문자열이 맞고 시작 < 종료 ≤ 12:00인 경우만 배치 가능하다.
읽지 못한 원문은 학교 상세에 그대로 표시하되 자동 시각 배치에 쓰지 않는다.
이전 학년도는 실제 연도 그대로 표시하며 현재 학년도로 바꾸지 않는다.
조회 중·조회 실패·자료 없음도 구분한다.

## 기존 DB와 A의 확정 스키마 사이

`src/types/morningCare.ts`는 **프론트 표시 모델**이며 확정 DB 스키마 제안이 아니다.
`src/utils/morningCare.ts`의 `morningCareFromLegacy`가 기존 자료를 이 모델로 옮긴다.
새 테이블/컬럼을 조회하지 않으므로 기존 DB에 그대로 연결할 수 있다.

A와 합의할 필드 의미:

| 표시 모델 | A에 필요한 확정 의미 |
| --- | --- |
| `status` | 명시 운영·명시 미운영·미확인, 검증 방식. 시간 문자열과 운영 여부 분리 |
| `arrivalTime` | 1교시 시작과 구분되는 등교시각, 적용 학년·요일 |
| `startTime`, `endTime`, `weekdays` | 학기/방학·요일별 변형 여부. 현재 버전은 학기 중 한 구간만 지원 |
| `grades` | 아침돌봄에 직접 적용되는 학년 |
| `application`, `applicationUrl` | 신청 기간·방법·선정/대기 조건, 원문 경로 |
| `schoolYear`, `source`, `sourceUrl`, `checkedOn` | 학년도·원문·확인일. 학교별 데이터와 센터별 데이터는 구분 |
| 센터 `SchoolEscortInfo` | 제공/미제공/미확인, 대상 학교·학년·요일·인계·비용, 별도 출처·학년도 |

스키마 확정 후 `dataService.ts`의 조회 결과를 어댑터에서 변환하고, 호출부에 표시 모델을 전달한다.
그때 DB 타입·조회·SQL을 함께 반영한다. 현재는 신규 DB 필드를 타입에 가정해 넣지 않았다.
다중 시간 구간·학년별 등교시각이 들어오면 단일 값으로 축약하지 말고 표시 모델부터 확장한다.

## 지도·등교 동행

기존 학교 중심 1km 반경과 거리 계산·센터 목록·마커·상세 시트를 유지한다.
목록에는 두 확인 상태만 짧게, 상세에는 인계 조건과 각각의 출처·학년도를 표시할 수 있게 구성했다.
센터의 이른 개장시간이나 짧은 거리로 아침돌봄/동행을 추론하지 않는다.
현재 두 속성은 모두 미확인이다. A의 센터 단위 확정 데이터가 연결되기 전에는 ‘아침 제공만’ 필터나 별도 마커를 만들지 않는다.
이후 필터를 추가할 경우 ‘미확인 포함’ 기본값을 유지하고 미확인을 결과에서 숨기지 않는다.

## 시간표 연결

1. 기존 ‘방과후/맞춤형/돌봄 선택하기’에서 아침 운영 시각·출처·학년도·대상 확인 상태를 읽는다.
2. 부모가 이용 요일을 골라 ‘아침돌봄 시간표에 넣기’를 누른다. 요일 자동 월~금 채움 없음.
3. 기존 `care` 종류, 별도 `care-{schoolId}-morning` 식별자로 저장한다. 신청·참여 확정은 기존 상태 선택에서 관리한다.
4. 기존 오후 캘린더 위에 요일·시각·참여 상태를 짧게 표시한다. 오후 시간축은 12~19시 유지.
5. 아침 항목은 오후 엔진 입력에서 제외한다. 알려지지 않은 실제 등교시각 대신 가정 09시와 비교해 충돌/공백을 만들지 않는다.
6. 선택 해제 시 아침 항목만 삭제한다. 자료 재조회는 저장한 요일·시간·참여 상태를 자동 갱신하지 않는다.

추가 일정관리 서비스·새 캘린더·알림·예약/신청 기능은 만들지 않았다.
실제 등교 전 공백·동행 가능 판정은 이번 구현에 포함하지 않는다.

## 기존 세션의 미커밋 작업과 충돌

작업 시작 시 git 루트는 `pjt_250826/`, 작업 브랜치는 `master`다.
이미 수정된 파일: `etl/academy_geocode_profile.json`, `scripts/my-ux-smoke.mjs`,
`MyAfterschoolPicker.tsx`, `MySchedule.tsx`, `src/styles/content.css`,
`fromSchoolData.ts`, `fromSchoolData.test.ts`.
미추적 작업: `MyScheduleWeek.tsx`, `CalendarEntryDialog.tsx`, `useCalendarInteraction.ts`,
`calendar.ts/test`, `editing.ts/test`, 시간표 QA 스크립트·모의 자료, audit2 문서·스크린샷.

기존 변경을 되돌리거나 재정렬하지 않았다. 접점은 `MyAfterschoolPicker.tsx`의 선택 컴포넌트와
`MySchedule.tsx`의 아침 요약/오후 입력 분리뿐이다. 이전 세션의 시간표 스타일·엔진·편집 코드는 수정하지 않았다.
두 접점 파일은 기존 변경과 함께 검토해야 한다. Track B만 파일 단위로 따로 스테이징하면 기존 변경도 포함된다.
기존 미추적 시간표 편집 컴포넌트가 빠지면 이 작업 트리와 같은 빌드가 되지 않는다.
커밋 전에 기존 세션의 시간표 선택/편집 작업을 먼저 정리하거나 함께 검토한다.
검증 중 다른 세션의 `docs/research/morning-care-20261015/`, `etl/build_morning_care_research.py`,
홈·콘텐츠·정적 페이지 생성기 변경도 나타났다. 이 파일들은 이 Track B 작업에서 수정하지 않았다.
검증 수치는 공유 작업 트리 전체 결과이므로 다른 세션의 변경도 포함한다.

## 검증과 배포 순서

모의 자료는 `scripts/fixtures/morning-care-network.js`의 localhost 브라우저 응답에만 있다.
프로덕션 앱에 import되지 않고 DB에 기록하지 않는다. 스크린샷의 QA 명칭도 실제 운영 정보가 아니다.

검증 명령:

```sh
npm run lint
npm run typecheck
npm run test:unit
node scripts/morning-care-render-smoke.mjs
npm run build
node scripts/morning-care-smoke.mjs http://127.0.0.1:3000
node scripts/my-schedule-smoke.mjs http://127.0.0.1:3000
npm run browser:smoke:public -- http://127.0.0.1:3000
```

위 주소는 개발 서버 예시다. 실행 중인 서버 주소를 명시한다.
`vite preview`는 운영의 `vercel.json` rewrite를 재현하지 않아 public smoke의
홈/앱 셸 분리 검사에서 실패할 수 있다. 개발 서버와 배포 미리보기에서 각각 검증한다.
성공한 브라우저 QA 스크린샷은 `docs/research/track-b-morning-care/`에 저장하도록 준비했다.

배포 순서:

1. 기존 시간표 세션과 두 접점 파일·미추적 컴포넌트의 커밋 범위 정리.
2. 현행 DB용 UI는 A 스키마 이전에도 배포 가능. 이때 미확인/시간 기재 범위만 공개.
3. A가 스키마·자료 검증을 확정하면 타입·조회·SQL·어댑터 연결, 원문·학년도 검증.
4. C가 화면 도움말·가이드 문구와 신청 안내 표현을 검토. 새 가이드 링크는 실제 콘텐츠가 있을 때 추가.
5. `master` 미리보기에서 전체 게이트와 모바일/데스크톱 화면 확인.
6. [운영 런북](../operations/DEPLOYMENT.md)에 따라 `release`로 반영. git 루트 `vercel.json` 사용.
7. 운영 URL을 명시해 public smoke 재실행. 신규 스키마 연결 후에는 실제 대표 학교·센터도 검증.
8. 문제 발생 시 런북의 이전 배포 승격 절차 사용. 이번 UI는 기존 저장 형식을 유지한다.

이 세션에서는 커밋·push·운영 배포를 실행하지 않는다.

## 검증 결과

| 항목 | 결과 |
| --- | --- |
| `npm run lint` | 통과 |
| `npm run typecheck` | 통과 |
| `npm run test:unit` | 77/77 통과. 새 아침돌봄 변환 테스트 5건 포함 |
| `node scripts/morning-care-render-smoke.mjs` | 통과. 4개 컴포넌트의 필드·상태·안전한 원문 링크·요일 선택·저장 항목 표시 검증 |
| `npm run build` | 통과. 사이트맵 생성의 네트워크 권한으로 재실행. 기존 번들 크기/브라우저 데이터 경고 있음 |
| `git diff --check` | 통과 |
| 아침돌봄 브라우저 smoke | 미완료. 브라우저 도구 연결 단계에서 Windows 소켓 오류 10060 및 시간 초과. 저장·재방문·화면폭 검증은 재실행 필요 |
| public smoke | 실행했으나 통과하지 못함. 기본 preview의 `/map` 셸 분리 실패, 개발 서버 재실행은 도구/HTTP 연결 지연으로 중단 |
| 기존 시간표 브라우저 회귀 | 실행 대기. 브라우저 환경 복구 후 `my-schedule-smoke`와 기존 편집/터치 검증 재실행 |

이번 세션에서 성공한 브라우저 스크린샷은 없다. 렌더링 검증은 브라우저 상호작용·실제 배치 검증을 대체하지 않는다.
별도로 띄운 검증 서버와 자식 프로세스는 종료했다. 운영 데이터·DB·배포에는 쓰기 작업을 하지 않았다.
따라서 구현은 검토 가능하지만 브라우저 게이트가 남아 있어 배포 준비 완료로 보지 않는다.
