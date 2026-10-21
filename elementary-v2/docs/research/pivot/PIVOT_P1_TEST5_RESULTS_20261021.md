# P1 경기 5개교 시험 — 최초 v3 13칸 검수

기준 `252a427`, 전용 브랜치 `codex/pivot-p1-v3-20261021`. 2026년 학교알리미 15-라 원문 전체를 번호 붙인 입력으로 읽고 298행을 직렬화했다. Codex가 순차 추출하고 같은 에이전트가 원문을 대조했다. 독립 맹검이나 외부 모델 실행 결과가 아니다. 아래 정확도는 미확인 행을 오답에 포함한 보수적 비율이며 독립 정확도 추정치가 아니다.

| 학교 | 전체 행 | 화면 대상 행 | 원문 일치 | 비율 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| 늘푸른 | 65 | 52 | 52 | 100% | 통과 |
| 낙생 | 95 | 65 | 63 | 96.92% | 폐강 표기 2행 확인 필요 |
| 성남매송 | 37 | 32 | 32 | 100% | 통과 |
| 당촌 | 44 | 34 | 30 | 88.24% | 요일·학기 본문과 표 충돌 |
| 위례고운 | 57 | 45 | 35 | 77.78% | 초1 맞춤형 10행 조건부 시각 미배정 |
| 합계 | 298 | 228 | 212 | 92.98% | **미통과** |

학교별 90% 이상 및 초1 맞춤형 요일·시각 누락 없음 조건을 충족하지 못했다. 39개교 본 추출과 83개교 추출은 실행하지 않았다. 운영 적재도 하지 않았다. 적재기 dry-run의 A등급 5곳은 방과후·맞춤형 중 더 좋은 비율을 사용하는 기존 표시 등급이므로 이 시험 게이트의 통과와 다르다. dry-run의 `confirmed: true`도 기존 서울 승인 상수이며 경기 적재 승인이 아니다.

## 원인과 후속 확인

- 위례고운: 서로 다른 돌봄 HWP 때문에 강좌 PDF가 통째로 제외되던 입력기 문제를 수정했다. 원문 L348에 초1 A·B반 요일별 실제 프로그램은 있으나 시각은 2·4·5교시 후 조건으로만 제시된다. 이 최초 추출은 요일별 교시 수를 외부에서 추정하지 않고 10행 시각을 비웠다. 이후 master의 `period_slots` 규칙은 별도 재검수 대상이다.
- 성남매송: HWPX 글상자 안 중첩표를 텍스트로 합치면서 A반 요일이 사라지던 오류를 수정했다. L46 격자를 복구해 A·B반 초1 맞춤형 10행을 대조했다.
- 당촌: L59·64 본문의 `화목토`, 2학기 `수금`과 L72~78 초1 표의 `월수/화목금`이 다르다. 바둑도 L119 월요일과 L226~228 화요일이 다르다. 오타라고 가정해 고치지 않았다.
- 낙생: 해금 A·합창 B의 `1분기 폐강`을 보존했다. 해당 기수의 제공 여부 확인이 필요하다. 평상시 표를 추출했으며 3월 적응기 별도 행은 포함하지 않았다.
- 늘푸른: 학기 중 초1 맞춤형 월수 13:00~14:30, 화목금 13:50~15:20을 표와 대조했다. 방학·고학년 행도 원시 결과에는 남겼으며 화면에서는 제외된다.

## 재현과 공유

고정 원시 결과는 [p1_test5_outputs_20261021](p1_test5_outputs_20261021/), 행별 판정·원문 입력 해시는 [p1_review_test5_20261021.json](p1_review_test5_20261021.json), 실행 판정은 [p1_gate_test5_20261021.json](p1_gate_test5_20261021.json)에 있다. 원문 전체와 번호 입력은 gitignored runtime에 보관했다. 같은 원시 결과 5개를 기본 checkout의 지정 공유 runtime에도 복사했다. `pivot_review_status.json`에 미승인을 표시했다.

```powershell
python -m unittest etl.tests.test_load_school_afterschool etl.tests.test_pivot_p1_v3_inputs etl.tests.test_pivot_p1_review_gate
python -m etl.pivot_p1_review_gate --outputs docs/research/pivot/p1_test5_outputs_20261021 --review docs/research/pivot/p1_review_test5_20261021.json --out etl/runtime/pivot_p1_gate_recheck.json
python -m etl.load_school_afterschool --outputs docs/research/pivot/p1_test5_outputs_20261021
```

23개 테스트 통과. 게이트 실행 결과 미통과. 적재기 실제 dry-run은 요약 5행·프로그램 228행을 생성했다. DB 호출 및 `--apply`는 실행하지 않았다. 다음 작업은 master의 14칸·운영장소·교시 조건 규칙을 통합하고, 변경된 결과를 원문과 다시 대조하는 것이다.

## 후속: 14칸 적재 호환성과 조건부 시각 미리보기

동시 작업을 확인하고 `master` `3547bfd`를 전용 브랜치에 병합했다. 10·11·13·14칸을 명시적으로 구분하고 알 수 없는 길이는 거부한다. `afterschool_rules`의 기수 중복 합치기와 교시 조건 배정을 적재기에 연결했다. 초1 단독 학년의 학기 중 맞춤형만 초1 교시 수로 배정하며, 방과후·2학년·혼합 학년·방학 강좌에는 적용하지 않는다. 운영장소와 시각 출처를 section·로컬 fixture에 보존한다.

SQL32는 운영 미적용이므로 기존 적재 payload에 새 열을 자동 추가하지 않는다. `--sql32-fields`로 새 열을 포함한 로컬 payload를 볼 수 있다. 운영장소 또는 조건부 추정값이 있을 때 해당 옵션 없이 apply하면 DB 접속 전에 중단한다. 기존 학교가 빠지는 전체 교체 적재 중단 장치도 유지했다. 이 옵션은 사용자 승인이나 SQL 적용을 대신하지 않는다.

위례고운 L348의 2·4·5교시 조건과 기존 로컬 검수 자료 [grade1_dismissal_estimates_expansion_20261008.json](../audit2/grade1_dismissal_estimates_expansion_20261008.json)의 NEIS 1학기 평상시 교시 수를 조합했다. 초1 A·B반 10행 모두 월화목 13:50~15:10, 수금 13:00~14:20으로 배정됐다. 원문이 요일별 시각을 직접 명시한 것은 아니므로 `time_source=period_slot`로 남긴다. 상세 파생 10행·입력 해시는 [p1_v14_preview_20261021.json](p1_v14_preview_20261021.json)에 고정했다.

이 미리보기는 13칸 고정본을 14칸으로 이행하고 위례고운 조건만 연결한 것으로, 새 원문 추출이나 검수 통과 결과가 아니다. `place=None`은 아직 장소를 재검수하지 않았다는 뜻으로 보고서에 표시했다. 기존 원시 결과·행별 판정·미통과 게이트를 덮어쓰지 않았다. 공유 `pivot_gyeonggi/`에도 기존 미승인 5개만 유지하며 후보는 별도 runtime 폴더에 있다.

```powershell
# --out은 아직 없는 폴더를 지정한다.
python -m etl.pivot_p1_v14_preview --source docs/research/pivot/p1_test5_outputs_20261021 --period-estimates docs/research/audit2/grade1_dismissal_estimates_expansion_20261008.json --out etl/runtime/pivot_p1_v14_fresh
python -m etl.load_school_afterschool --outputs etl/runtime/pivot_p1_v14_fresh --period-estimates docs/research/audit2/grade1_dismissal_estimates_expansion_20261008.json --sql32-fields
```

위 명령을 실제 실행해 프로그램 228행·조건부 파생 10행을 확인했다. 관련 회귀 테스트 33개와 기존 적재 안전장치·portable 입력 테스트를 합쳐 총 44개를 통과했다. 당촌의 요일/학기 충돌과 낙생 폐강 표기를 해소한 14칸 재추출·운영장소 대조 및 새 게이트 판정이 남았다. 따라서 39개교 본 추출은 아직 시작할 조건을 충족하지 못했다.
