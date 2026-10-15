# MY 시간표 운영 배포 — 2026-10-16

## 결과

- URL: https://wherecho.co.kr/my
- Target / status: production / READY
- Project: `elementary` (`prj_1H2Vx4Ye38UvGpz8yu67GRc63piZ`), team `team_BwevgkWVS8CQ8ETHgE6xSxip`
- Deployment: `dpl_FDjuXsNAsht2vGVX6QqS1wyvu93B`
- Deployment URL: https://elementary-pdmj0dggq-seankangs-projects.vercel.app
- Release commit: `c2e99eabe5e12717dd673c91601486262ad65ca3`
- Master implementation commit: `83f9b8f7b5bb5e667c85c0175349e91830b1e25d`
- Framework: React / TypeScript / Vite. 운영 빌드 구간 137.3초.
- `wherecho.co.kr`, `www.wherecho.co.kr` 도메인 연결 확인.

## 배포 범위

개별 과목·돌봄 선택, 요일 가로 보기, 왼쪽 시간축, 5분 직접 생성·이동, 파스텔·SVG 분야 아이콘·두 줄 카드·장식 테두리 제거, 아침돌봄 → 정규수업 축약 → 오후 표시를 배포했다. 아침 선택에 필요한 기존 운영시간 문자열 호환 어댑터와 명시적 요일 선택 UI를 포함한다.

운영 `origin/release`의 `00b9021`을 기준으로 기능 커밋만 cherry-pick했다. 미완료 데이터 ETL·SQL·센터/지도 상세 변경, 다른 작업의 파일·스테이징은 포함하지 않았다. master에만 있던 후속 SEO/인수인계 커밋도 이번 release에 섞지 않았다. 환경변수·프로젝트 설정·운영 브랜치 추적·DB는 변경하지 않았다.

## 검증

- 정확한 release 코드의 별도 체크아웃에서 lint, typecheck, unit 82개, build(사이트맵 포함) 통과. package.json/lock이 같음을 확인해 설치 의존성을 재사용했고 프런트엔드 공개 설정만 빌드에 전달했다.
- 로컬 릴리스 빌드에서 `my-calendar-appearance-smoke.mjs`, `my-morning-calendar-smoke.mjs`, `my-calendar-touch-smoke.mjs` 모두 통과. QA 응답은 localhost에만 사용했다.
- `npm run browser:smoke:public -- https://wherecho.co.kr` **배포 전·후 모두 통과**. 실제 rewrite·딥링크·SEO origin·공유 메타데이터·학교/아파트 검색·지도 확대/축소·시트·관심 저장·MY·가이드·체크리스트·개인정보·관리자 보호·360/430/1280px를 확인했다.
- 배포 후 지도 요청 최대 1605.5ms(기준 5초), 아파트 요청 최대 848.7ms(기준 3초). 주요 사용자 흐름의 예기치 않은 브라우저 오류 없음.
- 별도 익명 브라우저에서 실제 서울대현초를 MY에 저장하고 초안을 생성했다. 실데이터 강좌와 돌봄 동시 선택·출처 저장·5분 단위 개인 일정(화 16:05~16:35, 후보 상태)·두 줄 SVG 카드·장식 테두리 없음·모바일 넘침 없음을 확인했다.
- 해당 학교의 일부 강좌·돌봄 종료 시각은 원천에서 미확인이라 시간축에 임의 배치하지 않고 안내한다. 선택 가능한 아침 운영시간은 없어 실학교 아침 선택 검사는 SKIP했으며, 시간을 만들어 넣지 않았다. 아침 축약 UI는 앞선 격리 브라우저 검사로 검증했다.
- 위 실제 MY 검증의 저장은 폐기되는 테스트 브라우저 로컬 저장소에만 수행했다. DB나 사용자 브라우저 상태를 변경하지 않았다. `../research/audit2/my-schedule-production-20261016.png`는 그 검증 상태이다.

## 운영 관찰과 주의

- 새 deployment ID를 지정해 최근 10분 error 로그 조회: 0건. 배포 직후의 제한된 관찰이며 상시 무오류 보장은 아니다. 추가 drains/상시 모니터링 구성은 이번 범위에서 변경·점검하지 않았다.
- 기존 잠금 파일에서 Node 22 대비 개발용 agent-browser의 Node 24 권장 경고, npm audit 경고, 오래된 브라우저 매핑과 번들 크기 경고가 출력됐다. 배포 빌드는 성공했으며 무관한 의존성 업그레이드는 하지 않았다.
- Vercel 연결 도구는 팀 권한 403을 반환해 동일 팀·프로젝트의 인증된 CLI 읽기 전용 조회로 대체했다. 배포 자체는 문서의 정상 Git release push 경로를 사용했다.

## 되돌릴 기준

- 직전 운영 commit: `00b902180056afbb6717da027305d41cdbdf0109`
- 직전 deployment: `dpl_GT5LbArLXJnAFJz8ArjwvX4Kjv6u`
- 필요할 경우 기존 배포 절차의 이전 배포 승격을 사용한다. 이번 작업에서는 rollback하지 않았다.
