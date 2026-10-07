# 최소 보호 기준선 — 개편 착수 gate 완료

2026-10-06: 기준선 범위를 URL/영구 ID/기기 저장/기존 QA 재사용으로 고정했다. 검증 범위를 계속 추가하여 서비스 개편을 대기시키지 않는다. [운영 사이트 최종 smoke](READ_ONLY_VERIFICATION_20261006.md)는 이미 exit 0/PASS. 이번에는 production 코드/데이터/권한/배포를 변경하지 않았다.

## 보존 계약과 검증

[고정 fixture](protected_contract_20261006.json), [재검증 도구](../../../scripts/verify-protected-contract.mjs). 앱 폴더에서 `node scripts/verify-protected-contract.mjs` — **28개 확인 통과**. 실제 TS helper를 임시 메모리에서 변환하여 실행하며, 브라우저/네트워크/실사용자의 localStorage에 접근하거나 파일을 쓰지 않는다. 새 JS 테스트 runner 의존성을 설치하지 않았다.

- 기존 HOME/map/my/favorites/guide/FAQ/checklist/news/privacy/admin route 및 admin query 진입 보존.
- school 표준 ID `B…`, apartment Crockford public key 8자, 마지막 `--` 이후 ID가 권위값. 앞 이름이 달라도 복원하고 canonical로 정리하는 운영 smoke 결과 유지.
- canonical/share origin `https://wherecho.co.kr`. root `vercel.json`의 school/apt prerender rewrite 유지. source snapshot 자체가 미래 배포 검증을 대체하지 않음.
- profile `wherecho:profile-v1`: entryYear/interest/moving. checklist `wherecho:checklist-v1`: 17개 고정 item ID → boolean. 문구 수정/신규 ID 추가는 허용하되 기존 ID를 삭제·재사용하지 않음.
- 읽음 `wherecho:read-guides-v1`: guide slug 배열, 중복 방지. guide 10개 현재 slug 보존.
- favorites `elementary-favorites-v1`: school/apartment discriminated record. 단지 publicKey 없는 이전 기록도 읽기 가능. `favorite-school-ids`의 기기 내 중복 없는 import 계약 유지. 향후 서버 이전은 별도 동의·실패 복원·계정 충돌 테스트 후 적용.
- 이번 다른 작업에서 정리된 실험용 `/plans`, `/ranking`, `/grade1`, `/items/*`는 현재 HOME fallback. 삭제된 기능을 테스트를 맞추기 위해 다시 넣지 않음. Audit1의 과거 재사용 후보 설명과 현재 코드 상태를 구분.

검증 한계: 실제 기기/기기간 동기화·차단 storage에서 모든 쓰기 동작·Auth import/계정 충돌·신규 가족 RLS는 이 gate의 완료 범위가 아니다. 현재 공유 링크·배정 결과·저장 ID를 보호할 최소 호환 계약만 고정한다.

## 지역 QA 및 별도 작업 보존

기존 `docs/operations/MANUAL_QA_REVIEW.html`의 912행을 변경하지 않고 source로 참조했다. 이 파일에 존재하는 scope 15개에서 각 1개씩 원래 표본 ID/배정학교를 fixture에 기록했다. **전국 17지역을 새로 수동 재검수했다고 주장하지 않는다.** 15 scope는 기존 파일 범위이며 미포함 지역/미해결 표본은 기존 운영 backlog에서 관리한다. 실사용자 QA 메모를 수집하거나 verdict를 변경하지 않았다.

별도 학원 refresh 및 실험 기능 정리 변경과 겹치는 runtime/ETL 파일은 수정하지 않았다. 위 local test에 쓰인 favorites/학교/단지 데이터는 합성값이며 실제 사용자의 저장 기록이 아니다. archive의 운영 CSV 두 입력도 수정하지 않았다.

## 완료 후 다음 업무

A2-B06 최소 기준선 완료. 이어 [학교 자료 PoC manifest](ETL_POC_START_20261006.md) 작성에 착수했다. 새 route/UI/로그인·DB 적용 직전에 이 fixture와 기존 frontend/public smoke gate를 다시 검증한다. 그때 필요한 검증을 지금 전부 선행조건으로 추가하지 않는다.
