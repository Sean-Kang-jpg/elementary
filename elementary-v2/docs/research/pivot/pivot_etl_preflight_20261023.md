# ETL 선행 점검과 작업 경계 — 2026-10-23

## 인계 안내

이번 변경은 입력을 검사하는 독립 명령이다. 앱 디렉터리에서 `python -m etl.pivot_input_preflight --all`을 실행하면 된다. 성공은 종료 코드 0, 입력 문제는 1, 목록 오류는 2이며 JSON 결과를 표준 출력으로 제공한다. 명령 자체는 보고서 파일을 만들지 않는다.

인계 파일은 `etl/pivot_input_preflight.py`, `etl/pivot_input_baseline_20261023.json`, `etl/tests/test_pivot_input_preflight.py`, 이 문서와 `pivot_input_preflight_full_20261023.json` 다섯 개다. 기존 `etl/prepare_portable_inputs.py`가 필요하며 해당 파일은 이번에 변경하지 않았다. 결과 JSON의 절대 경로는 검사한 컴퓨터의 위치이고 배포 경로 설정이 아니다.

운영 연결은 별도 작업이다. 지역·파이프라인 담당이 필요한 입력 목록을 정한 뒤 `--manifest`로 그 목록만 검사한다. 전체 로컬 자료를 갖추지 않은 runner에 `--all`을 일괄 연결하면 해당 실행에 불필요한 입력 때문에 중단될 수 있다. 기존 recurring 복원·검증 단계와 중복 여부도 확인한다. 기준 해시 변경은 원본 검수 이후 담당자가 수행하며, 자동 기준 갱신 기능은 없다.

P1/P2 추출·적재, 프런트엔드, 운영 DB, 자동 실행 설정 변경은 포함하지 않는다. 다른 채팅이나 팀원에게 메시지를 발송하지 않았다. 아래 담당 확인은 2026-10-23 점검 시점 기록이므로 이후의 실시간 담당 현황으로 해석하지 않는다.

이 채팅의 선행 작업은 **공통 입력 보존 점검과 작업 충돌 확인**이다. 담당을 새로 배정하거나 기존 담당을 변경한 기록은 아니다. 학교별 진행 상황은 `docs/operations/PIVOT_PILOT_ETL.md`에서 계속 관리한다.

## 확인한 작업 경계

| 영역 | 확인 근거 | 이 채팅의 경계 |
| --- | --- | --- |
| P1 방과후 추출·적재 | 기존 담당 문서 및 현재 다른 채팅의 실제 작업: `pivot-p1-v3-20261021`에서 39개교 입력·추출 진행 | 추출기, 적재기, 입력·결과 및 검수 파일 편집 제외 |
| P2 하교 예상 | 담당 문서상 파일럿 브랜치 담당. `pivot-p2-review-20261021`와 `pivot-pilot-etl` worktree 존재 | P2 실행기·적재기·학교별 검수 결과 편집 제외 |
| 학원 지오코딩 | master의 `etl/academy_geocode_profile.json`에 기존 미커밋 변경 존재 | 기존 변경 보존 |
| 아파트 거래 ETL | `transaction-identity-etl` worktree 존재 | 담당 확인 전 편집 제외. 소유권 검사로 상태 조회 실패하여 미커밋 여부는 미확인 |
| 수요·학원 홍보 메뉴 | 별도 활성 채팅에서 계획 수립 중 | 기능·스키마 설계 중복 착수 제외 |

주의: 다른 ETL 채팅의 제목에는 P2가 남아 있으나, 최신 실행 내용은 P1 39개교 작업이다. 채팅 제목만으로 작업을 나누지 않는다. 다른 채팅에 메시지를 보내거나 담당 변경을 요청하지 않았다.

## 이번에 완료한 점검

원본 세 파일을 읽어서 존재·크기·SHA256을 기록했다. 원본 내용과 운영 DB는 변경하지 않았다. 아래 값은 현재 로컬 기준선이며, 승인된 원본 버전과의 일치나 데이터 정확성을 증명하지 않는다.

경로는 workspace `F:\sm\vibe\elementary` 기준이다.

| 입력 | 바이트 | SHA256 |
| --- | ---: | --- |
| `archive/GAS/GAS/임시/apt_mst_info_202410.csv` | 13060240 | `9092F884B008D701349E6652D2E1F8453034302D95378D600A22442225A51853` |
| `archive/legacy-v1/etl/data/kapt/20250801_apt_data.csv` | 16056434 | `8987CB940B2548FB8C732FA4B354DC3A52C3F4D97BA89365431F2A0356D77D61` |
| `archive/elementary-v2-pre-operational-20260828/etl/local_outputs/building_refined_dongs.csv` | 2684528 | `85F1EB36CE9ACDF67008BC9A2BE33594CA798EEAE3875AA8574CE3B828AF8AA7` |

`python -m unittest etl.tests.test_portable_inputs`는 4개 모두 통과했다. 임시 fixture의 패키징·체크섬 불일치 거부·원본 없는 환경 복원·익명 공개 번들 거부를 검증한다. 실제 Storage 접근이나 운영 파이프라인 전체 실행을 검증한 것은 아니다.

## 사전검사 구현·검증 완료

`etl/pivot_input_preflight.py`를 추가했다. 기존 `prepare_portable_inputs.py`의 매니페스트 로더와 스트리밍 SHA256 함수를 재사용하며 기존 도구는 수정하지 않았다. 모든 파일의 누락·디렉터리·크기/해시 불일치·읽기 실패를 모아 JSON으로 출력한다. 환경 파일 로드, 네트워크 요청, 복원, 원본 쓰기는 수행하지 않는다.

앱 디렉터리에서 실행:

```bash
python -m etl.pivot_input_preflight
python -m etl.pivot_input_preflight --manifest etl/portable_inputs_manifest.json
```

기본 기준은 `etl/pivot_input_baseline_20261023.json`의 로컬 관측값이다. 다른 매니페스트는 기존 portable 입력 형식(`files`와 `bundle_version`)을 사용한다. `--manifest` 상대 경로는 실행 디렉터리 기준이며, 각 `source_path`는 기존 도구와 동일하게 앱 디렉터리 기준이다. 기본 기준 파일을 자동 갱신하지 않는다. 종료 코드는 전체 일치 0, 입력 누락·변경·읽기 실패 1, 매니페스트 오류 2다. 이 검사는 독립 명령이며 운영 실행기에 자동 연결하지 않았다.

검증: `python -m unittest etl.tests.test_pivot_input_preflight etl.tests.test_portable_inputs` 8개 통과. 동일 크기 변조, 크기 변경, 누락, 디렉터리, 읽기 실패 후 계속 검사, 종료 코드, 빈 매니페스트 거부를 확인했다. 실제 기본 사전검사는 원본 3개 모두 일치하여 종료 코드 0. 지역별 ETL 변환·운영 데이터의 정확성 검증은 이 범위에 포함하지 않는다.

## 후속 작업 경계

### 기존 입력 목록 전체 검사 완료

`python -m etl.pivot_input_preflight --all`을 추가했다. 기본 로컬 기준 3항목, portable 8항목, recurring 29항목을 각각 검사한다. 40개 참조 중 중복 경로를 제외한 입력은 **34개**, 전부 일치했으며 목록 사이의 크기·해시 기준 충돌은 0개다. 실행 결과는 `pivot_input_preflight_full_20261023.json`에 보존했다. 경로 중복 수는 실제 경로를 기준으로 계산하며, 각 목록의 검사 결과는 별도로 남긴다.

기존 `recurring_inputs_manifest.json`은 `.github/workflows/etl-recurring.yml`의 복원 단계에서 사용하는 13개 운영 scope의 입력 목록이다. `portable_inputs_manifest.json`은 기존 읽기 전용 빌드 도구의 기본 목록이다. 이 두 목록에 앞서 확인한 legacy K-apt와 prior dongs를 기본 로컬 목록으로 보완했다. 기존 목록의 크기·해시는 변경하지 않았다.

**범위 한계:** 34개는 위 목록에 등록된 고정 입력이다. 저장소의 모든 ETL 의존성이나 최신 데이터 여부를 보증하지 않는다. `run_academy_refresh.py`의 `STORAGE_INPUTS`에는 prior dongs 외에도 `academy_geocodes_all.csv`와 `trusted_large_complex_buildings.csv`가 있다. 이들은 갱신 가능한 캐시·원천으로, 이번 고정 기준 검사에 임의 해시를 추가하지 않았다. 실시간 수집 API 응답, 비밀키 설정, 지역별 변환 정확성, 운영 DB와 Storage 접근도 검사하지 않았다.

검증은 기존 8개에 목록 중복 집계·기준 충돌 탐지·잘못된 목록이 있어도 나머지 목록 검사·전체 모드 오류 종료를 추가하여 **10개 통과**했다. 실제 전체 검사 종료 코드는 0이다.

### 실행과 오류 대응

앱 디렉터리 `pjt_250826/elementary-v2`에서 실행한다.

```bash
python -m etl.pivot_input_preflight --all
python -m unittest etl.tests.test_pivot_input_preflight etl.tests.test_portable_inputs
```

표준 출력은 JSON이며 원하면 실행자가 별도 파일에 저장할 수 있다. `--all`과 `--manifest`는 함께 사용할 수 없다. 잘못된 목록이 하나 있어도 나머지 목록을 검사하며, 전체 모드는 목록 오류가 있으면 종료 코드 2를 우선 반환한다.

| 결과 | 의미 | 대응 |
| --- | --- | --- |
| `missing` | 등록된 경로에 파일 없음 | 앱·archive 배치와 복원 담당의 준비 상태 확인. 비슷한 이름의 파일로 대체하지 않음 |
| `not_file` | 파일 경로에 디렉터리 존재 | 경로 설정 확인. 자동 삭제·이동하지 않음 |
| `changed` | 크기 또는 SHA256 불일치 | 예정된 갱신인지 담당에게 확인하고 검수된 버전과 비교. 통과시키기 위해 기준값만 바꾸지 않음 |
| `unreadable` | 권한 등으로 읽기 실패 | 해당 파일의 접근 권한·잠금 상태 확인 후 재실행 |
| `baseline_conflicts` | 같은 경로에 목록별 기대값이 다름 | 각 목록 담당이 의도한 버전을 확인한 뒤 기준을 정렬 |
| `invalid_manifest` | 목록 누락·형식·필수 필드 오류 | 지정한 목록 경로와 portable 입력 형식을 확인 |

종료 코드 1 또는 2이면 해당 입력에 의존하는 빌드를 시작하기 전에 원인을 확인한다. 현재 운영 실행기는 수정하지 않았으므로 이 명령의 실패가 기존 자동 실행을 중단시키지는 않는다.

공통 입력 사전검사는 위 범위로 완료했다. 운영 실행기에 연결하려면 해당 실행기 담당과 적용 범위를 맞춘다. 원본 이동·복원·업로드는 이번 도구의 범위에 포함하지 않는다.

P1 원문 재추출, P2 학교별 재검수, 거래 ETL은 기존 작업 범위와 겹치므로 이 문서를 근거로 추가 착수하지 않는다. P3 전화 질문지는 기술 충돌은 적지만 사용자 조사 업무이므로 ETL 구현과 별도로 다룬다.
