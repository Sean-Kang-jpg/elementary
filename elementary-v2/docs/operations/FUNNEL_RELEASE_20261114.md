# 주간 시간표 계측 운영 배포 — 2026-11-14

사용자 승인: 이 대화에서 “운영배포합니다”. 별도 worktree의 검토 브랜치를 최신 원격 master에 통합하고, 원격 master와 같은 커밋을 release로 올리는 기존 절차를 따른다. 원래 master 작업 폴더의 미커밋 변경은 가져오거나 덮어쓰지 않는다.

## 배포 전 기준

- 팀/프로젝트: `seankangs-projects/elementary`, `prj_1H2Vx4Ye38UvGpz8yu67GRc63piZ`.
- 운영 주소: https://wherecho.co.kr
- 이전 운영 배포: `dpl_8jqg7xSfij6fjSdW5B1Szk48oDzS`, READY, production, release `b9106237138287243f6956d51b7ea90822cf4e18`.
- 이전 운영의 고유 주소: https://elementary-px6wom19e-seankangs-projects.vercel.app
- 통합 원본: `codex/fnl-public-smoke-target` (`143ddfb`), 통합 브랜치 `codex/fnl-release-20261114`.
- 원격 master의 ETL·학교 자료 및 연구 스냅샷은 유지한다. ETL 실행·운영 DB 업로드·스키마·환경변수·도메인 설정 변경은 이 배포에 포함하지 않는다.
- 배포 방식: git 루트 vercel.json, release push의 Vercel git 빌드. CLI 사본 배포는 사용하지 않는다.

## 변경 내용

- 표시된 입학 일정/주간 시간표와 실제 해석된 학교를 기준으로 page_view·timetable_view·학교 선택을 계측한다. 추적 쿼리·재마운트·동일 학교 재선택은 중복 집계하지 않는다.
- 실제 저장 호출 경계에서 초안 생성·첫 편집·저장 성공·실패를 구분한다. 생성 쓰기와 일반 저장 성공을 중복 기록하지 않는다. 저장 형식·키·4문항 흐름은 유지한다.
- 저장 오류 원문·질문 답변·일정 내용은 새 계측 이벤트에 싣지 않는다. 전송 실패는 제품 저장 성공을 실패로 바꾸지 않는다.
- 공개 화면 검증은 검증 대상의 정적 홈과 앱을 비교하도록 수정한다. 과거 로컬 빌드와 운영 화면을 비교하지 않는다.

## 배포 전 검증

- lint: 통과(경고 0).
- typecheck: 통과.
- test:unit: 173개 통과, 실패 0.
- build: 통과. sitemap 8개 생성. 기존 큰 번들·브라우저 호환 자료 갱신 경고는 남아 있다.
- browser:smoke:funnel — http://localhost:3010: 23개 통과. 합성 자료·별도 브라우저의 로컬 저장과 debug 기록만 사용한다.
- browser:smoke:public — http://localhost:3010: 지도 데이터 로딩/성능 표본 대기에서 실패했다(15초). 앞부분의 시간표·저장·학교 링크 검사는 통과했다. 지도 코드는 기존 운영과 동일하다.
- browser:smoke:public — http://127.0.0.1:3000: 전체 통과(종료 0). 지도 축소·검색·딥링크·학교→시간표·저장·복원·화면 폭을 확인했다. 지도 5표본 최댓값 1093.7ms, 아파트 3표본 최댓값 1223.1ms로 성능 기준도 통과했다. 3010 실패는 이 주소에서 재현되지 않았다. 개발 서버에서 정적 페이지/서버리스 프리렌더 검사는 제한되며 운영 배포 후 같은 검증을 다시 실행한다.
- Vercel 미리보기 `dpl_3jPb8mbMExth5Wy9UsarfQ4urmVc` (`fde6516`): READY. 이 이후 배포 전 추가한 변경은 이 검증 기록뿐이다.

## 운영 반영 결과

- master와 동일한 release 커밋: `29d77f57d3ae36f11e70a639627a505ba7435650`.
- 운영 배포: `dpl_4SwVs2cvnka4DaJk7tsAX9ngYWE3`, READY, production.
- 고유 주소: https://elementary-7osskuwxz-seankangs-projects.vercel.app
- 배포 생성: 2026-11-14 20:24:10 KST, 빌드 완료: 20:27:54 KST. 실제 빌드 약 106초(대기 포함 약 224초).
- wherecho.co.kr 조회 결과 새 배포 ID·release SHA 일치, `aliasAssigned=true`, `aliasError=null` 확인.
- 운영 `/assets/index-DxR31itA.js`에 `fnl-1`, timetable_view, timetable_school_pick, timetable_draft_create, timetable_save_success, timetable_save_failure가 포함돼 제공되는 것을 확인했다. 이는 GA4 서버 수신 증거와는 다르다.
- `/admin/etl` 딥링크 HTTP 200 확인.
- 배포 후 첫 운영 전체 검증은 홈에서 은마 아파트 검색 결과를 기다리다 15초 제한으로 실패했다(`public-smoke.mjs`의 home search 단계). 그 앞의 시간표 생성/복원, 학교→시간표 재진입, 지도 축소·검색·학교/아파트 딥링크 검사는 통과했다. 원인을 새 계측 코드 또는 네트워크로 단정하지 않는다.
- 새 브라우저 세션에서 `npm run browser:smoke:public -- https://wherecho.co.kr` 전체 재실행 통과(종료 0). 홈 아파트 검색은 2회 확인 안에 결과를 찾았으며 상세 진입·홈 복귀·MY 재열기까지 통과했다. 첫 실패 원인은 재실행에서 재현되지 않아 미확정으로 남긴다.
- 실패 시 화면의 검색 결과/안내 상태를 남기는 진단만 검증 스크립트에 추가했고, 기존 제한 시간과 통과 조건은 유지했다. 이 진단 변경은 운영 앱 코드 변경이 아니며 배포 후 master에 기록한다.
- 운영 전체 검증에서 예기치 않은 페이지 오류 없음, 360/430/1280px 가로 넘침 없음, 지도 5표본 최댓값 593.3ms 및 아파트 3표본 최댓값 682.9ms로 성능 기준 통과. canonical·공유 메타·404·서버리스 프리렌더·사이트맵·자동화 GA4 제외도 통과했다.
- 새 운영 배포에 한정한 오류 로그 조회(`vercel logs ... --project elementary --level error --since 15m --no-follow --json`): 전체 운영 검증 후 최종 조회 성공, 0건(조회 시점 한정). 클라이언트 오류·GA4 수신·향후 장애까지 없다는 의미는 아니다.
- 기존 외부 로그 drain 연결: 0개. 관측 설정을 새로 만들거나 변경하지 않았다.
- 중복 생성된 대기 미리보기 `dpl_HMuSVNTK4DkUSm56Xz2qnjMdmTqs`만 취소했다. READY였던 사전 검증 미리보기와 이전 운영 배포는 보존했다.

GA4 관리 화면의 보고서 수신 확인은 배포 상태와 별개다. 이 채팅의 브라우저 연결이 없어 실제 GA4 수신·처리 완료 보고서를 확인하지 못한 상태이며, 코드 배포만으로 전환 데이터가 검증됐다고 판정하지 않는다.

## 완료와 후속 작업

- 운영 배포 및 배포 후 전체 검증 완료. 최종 도메인 조회에서도 release `29d77f5`와 같은 배포 ID가 유지되는 것을 확인했다. 되돌리기는 필요하지 않았다.
- FNL-04: 브라우저 연결 복구 후 맞춤 정의·주요 이벤트·자동 page_view 설정을 확인하고 실제 GA4 수신/처리 완료 보고서를 조회한다. 미등록·처리 대기와 0건을 구분한다.
- FNL-QA-01(P1): 홈 검색 15초 제한 초과가 다시 발생하면 새 진단 결과로 검색 목록 닫힘/오류 안내/로딩 상태를 구분하고 네트워크 기록과 대조한다. 재현된 결함을 수정하거나 환경 원인을 확인한 뒤 처리한다. 이번 1회 실패를 원인 확인 없이 해결 완료로 간주하지 않는다.
- 이 배포 기록 및 검증 진단의 후속 커밋은 master에만 올리고 release를 다시 배포하지 않는다. 운영 앱 코드는 검증한 `29d77f5`로 유지한다.
