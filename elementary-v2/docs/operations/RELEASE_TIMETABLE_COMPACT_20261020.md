# 시간표 카드·입력 메뉴 정리 배포

- 날짜: 2026-10-20
- 운영 커밋: `e529774` (`Compact timetable course metadata and unify schedule entry`)
- Vercel: `dpl_EeBgc1N7Zkznpajpgaohk2RT1Cgd`, READY
- 운영 주소: https://wherecho.co.kr/timetable

## 변경

- 강좌 카드 위 분류·요일·대상을 한 줄로 합침. 예: `음악 · 월 · 1~2학년`.
- 하단의 `방과후/맞춤형/돌봄 선택하기`와 `추가 일정 입력하기`를 제거하고 상단 일정 추가의 학교 프로그램·학원·직접 입력으로 통합.
- 참여 상태 변경·삭제를 위한 `선택한 일정 관리`는 독립적으로 유지.
- 미커밋 ETL·SQL·데이터 변경은 배포에서 제외.

## 검증

- 배포할 파일만 모은 별도 사본에서 lint·typecheck·전체 build, 단위 테스트 92개 통과.
- `my-inline-selection-smoke.mjs`, `my-calendar-appearance-smoke.mjs` 통과. 한 줄 정보와 중복 메뉴 제거, 요일별 프로그램·돌봄 선택, 외부 학원 입력, 360/390/768/1280px 표시 확인.
- `my-ux-smoke.mjs`는 상단 직접 입력 양식에 맞춘 시간 입력 선택자와 초안 화면 로딩 대기를 보완해 통과.
- 운영에서 `B000002263` 학교로 초안을 만들고, 한 줄 정보·중복 메뉴 없음·일정 관리 유지·상단 직접 입력 저장 및 새로고침 복원을 확인. 실행 오류와 가로 넘침 없음.
- `browser:smoke:public -- https://wherecho.co.kr` 전체 통과. 지도 조회 최장 549.2ms, 아파트 조회 최장 252ms. 이전 로컬 지도 로딩 실패는 운영에서 재현되지 않음.

운영 확인은 별도 브라우저 저장소에서 수행했으며 서버 데이터는 변경하지 않았다.
