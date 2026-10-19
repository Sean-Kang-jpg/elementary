# 시간표·아침돌봄 로컬 통합 검증 — 2026-10-19

상태: 로컬 검증 완료. 아침돌봄 표시 변경의 운영 배포는 별도다.

## 확인한 흐름

- `/timetable`에서 관심학교 저장 없이 학교 검색 → 공개 운영 자료 확인 → 초안 생성.
- 요일별 과목·돌봄 선택과 개별 해제, 학원 후보 선택 후 5분 단위 시간 입력.
- MY는 기기 저장 초안을 요약하고 편집 화면으로 연결한다. 관심학교 삭제 후에도 초안을 보존한다.
- 기존 `school_care_hours`의 아침 시간은 계획 기재로 표시한다. 대상학년·등교시각·현재 운영·센터 동행은 근거 없이 채우지 않는다.
- 아침돌봄은 이용자가 명시적으로 고른 요일만 저장한다. 재방문 복원, 선택 해제, 미확인·자료 없음·조회 실패를 구별한다.
- 학교 상세·주변 센터·지도 상세에 아침돌봄과 등교 동행 확인 수준을 표시한다. 연구 DB 40개교를 공개 데이터로 연결한 것은 아니다.

## 수정

- 학교 검색어 변경 시 이전 결과를 지우고, 종료된 요청의 응답을 무시한다. 같은 검색어로 돌아오더라도 과거 응답이 최신 결과를 덮지 않는다. 수정은 시간표 담당 세션의 `e13633b`에도 포함됐다.
- `morning-care-smoke.mjs`를 MY 내 편집기에서 `/timetable`과 명시적인 주간 편집 흐름으로 옮겼다.
- `timetable-search-smoke.mjs`로 지연 응답 순서를 바꿔 검색 회귀를 재현·검증했다. 모의 자료는 localhost의 별도 브라우저에만 적용한다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| `npm run lint` / `npm run typecheck` | 통과 |
| `npm run test:unit` | 92/92 통과 |
| `npm run build` | 전체 통과. 정적 홈·가이드·RSS·8개 사이트맵 생성 |
| `node scripts/morning-care-render-smoke.mjs` | 통과 |
| `node scripts/morning-care-smoke.mjs http://localhost:3000` | 선택·저장·재방문·학교/센터·네트워크 실패·모바일/데스크톱 통과 |
| `node scripts/my-morning-calendar-smoke.mjs http://localhost:3000` | 선택 요일·정규수업 축약·5분 이동·미확인·취소 복원 통과 |
| `node scripts/my-inline-selection-smoke.mjs http://localhost:3000` | 요일별 독립 선택·학원 후보·시간 입력·저장 실패 통과 |
| `node scripts/my-calendar-touch-smoke.mjs http://localhost:3000` | 실제 터치 생성·입력·이동·스크롤 통과 |
| `node scripts/my-ux-smoke.mjs http://localhost:3000` | MY 요약·초안 보존·용량 실패·실제 학교 검색/생성 통과 |
| `node scripts/my-schedule-smoke.mjs http://localhost:3000` | 강좌·돌봄 선택·미확인·조회/저장 실패·실제 운영 데이터 경로 통과 |
| `node scripts/timetable-search-smoke.mjs http://localhost:3000` | 결과 초기화·과거 응답 무시·짧은 검색어 통과 |
| `npm run browser:smoke:public -- http://localhost:3000` | 전체 통과. 지도 최대 756.7ms, 아파트 최대 200.8ms. 예상 밖 페이지 오류 없음 |

브라우저는 설치된 Chrome을 명시했다. 최초 샌드박스 실행의 로컬 네트워크/소켓 제한은 권한을 받은 실행으로 해소했다. 최초 빌드의 사이트맵 네트워크 제한도 권한을 받은 전체 재실행에서 통과했다. 기존 번들 크기 및 브라우저 데이터 갱신 경고는 남아 있다.

로컬 개발 서버는 운영 prerender rewrite를 제공하지 않는다. public smoke는 이 구간을 건너뛰므로, 배포 후 실제 도메인의 deep link·canonical·OG·sitemap 검사도 실행해야 한다. 검증 중 운영 DB 쓰기는 하지 않았다.

화면 증거: [아침 시간표](../research/track-b-morning-care/my-mobile.png), [학교 모바일](../research/track-b-morning-care/school-mobile.png), [센터 상세](../research/track-b-morning-care/center-mobile.png), [학교 데스크톱](../research/track-b-morning-care/school-desktop.png).

## 다음 순서

1. 시간표 담당 세션이 별도로 배포 중이므로 같은 `release` push를 중복 실행하지 않는다. 아침돌봄 UI의 커밋·운영 반영과 실제 도메인 검증은 따로 기록한다.
2. 서울 공개 자료 공백 45개교(추가 조사 보류 12 + 기존 공개 제외 33) 및 맞춤형 미확인 178개교를 사유별로 보강한다. 두 집합은 겹치므로 더하지 않는다.
3. 아침돌봄 잔여 566개교 조사와 기존 40개교의 실제 운영·신청 조건 확인을 진행한다. 연구값의 공개 연결은 데이터 계약·권한·근거 검증 후 진행한다.

기준 수치는 [전체 현황](../research/morning-care-20261015/ALL_CARE_STATUS_20261019.md)을 따른다. 자료 없음은 미운영을 뜻하지 않는다.
