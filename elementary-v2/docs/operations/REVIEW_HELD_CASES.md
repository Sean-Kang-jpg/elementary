# 보류 검수 건 — 통학구역 폴리곤 미포함 단지

상태: **20건 보류**  
기록: 2026-09-29

풀링 검수 182건 중 162건은 일괄 정상으로 판정했고, 아래 20건만 사람이 지도에서 확인해야 합니다.
판정은 `etl/review_verdicts.csv`에 기록되어 검수표를 다시 만들어도 유지됩니다.

## 왜 이 20건만 남았나

세 가지를 실측해 나머지를 걸러냈습니다.

- 1순위 `unassigned_apartment` 23건과 3순위 `review_required_unit` 23건은 **같은 23개 단지**입니다. 한 단지가 두 줄로 계상돼 있었습니다.
- 4순위 `unmatched_zone_label` 23건 중 17개 라벨은 **걸린 단지가 0개**이고, 나머지 6개는 이미 등재된 상류 결함(I-26)과 세종 국경 공동학구입니다.
- 2순위 `named_zone_without_school` 6건(목포)은 `canonical_complex_id`로 운영 DB를 조회해 **6건 모두 정상 노출**됨을 확인했습니다.

남은 23개 단지 중 3개는 운영에 노출되고 있어, 실제로 지도에서 사라진 것은 **20개**입니다.

## 확인해야 할 것

모두 `assignment_method = unassigned_point_nohit` — 단지 대표점이 어느 통학구역 폴리곤에도 들어가지 않았습니다.
학구 밖에 실제로 있는 단지인지, 아니면 좌표가 틀렸는지가 갈립니다. 배정이 없으면 `school_apartment_serving`에 행이 생기지 않아
단지가 지도에 **표시되지 않습니다** — 잘못 배정되는 것이 아니라 조용히 빠집니다.

| 지역 | 단지 | 주소 | 좌표 | 지도 |
|---|---|---|---|---|
| 경상남도 | 그린힐빌라Ⅱ | 경상남도 김해시 가야로405번길 148 | 35.23535, 128.89243 | [열기](https://map.naver.com/p/search/%EA%B2%BD%EC%83%81%EB%82%A8%EB%8F%84%20%EA%B9%80%ED%95%B4%EC%8B%9C%20%EA%B0%80%EC%95%BC%EB%A1%9C405%EB%B2%88%EA%B8%B8%20148) |
| 경상남도 | 쌍용사원 | 경상남도 창원시 성산구 정동로162번길 70 | 35.20103, 128.69755 | [열기](https://map.naver.com/p/search/%EA%B2%BD%EC%83%81%EB%82%A8%EB%8F%84%20%EC%B0%BD%EC%9B%90%EC%8B%9C%20%EC%84%B1%EC%82%B0%EA%B5%AC%20%EC%A0%95%EB%8F%99%EB%A1%9C162%EB%B2%88%EA%B8%B8%2070) |
| 경상남도 | 양산 유탑 유블레스 하늘리에 | 경상남도 양산시 명곡로 141 | 35.34832, 129.05033 | [열기](https://map.naver.com/p/search/%EA%B2%BD%EC%83%81%EB%82%A8%EB%8F%84%20%EC%96%91%EC%82%B0%EC%8B%9C%20%EB%AA%85%EA%B3%A1%EB%A1%9C%20141) |
| 경상남도 | 진풍아트빌 | 경상남도 김해시 분성로172번길 64 | 35.22793, 128.87092 | [열기](https://map.naver.com/p/search/%EA%B2%BD%EC%83%81%EB%82%A8%EB%8F%84%20%EA%B9%80%ED%95%B4%EC%8B%9C%20%EB%B6%84%EC%84%B1%EB%A1%9C172%EB%B2%88%EA%B8%B8%2064) |
| 경상남도 | 창원반계엘에이치아파트 | 경상남도 창원시 의창구 소계로 13 | 35.25342, 128.60388 | [열기](https://map.naver.com/p/search/%EA%B2%BD%EC%83%81%EB%82%A8%EB%8F%84%20%EC%B0%BD%EC%9B%90%EC%8B%9C%20%EC%9D%98%EC%B0%BD%EA%B5%AC%20%EC%86%8C%EA%B3%84%EB%A1%9C%2013) |
| 경상북도 | 상주함창엘에이치천년나무1단지 | 경상북도 상주시 함령길 138 | 36.57215, 128.18261 | [열기](https://map.naver.com/p/search/%EA%B2%BD%EC%83%81%EB%B6%81%EB%8F%84%20%EC%83%81%EC%A3%BC%EC%8B%9C%20%ED%95%A8%EB%A0%B9%EA%B8%B8%20138) |
| 경상북도 | 상주함창엘에이치천년나무2단지 | 경상북도 상주시 구향4길 15 | 36.57225, 128.18341 | [열기](https://map.naver.com/p/search/%EA%B2%BD%EC%83%81%EB%B6%81%EB%8F%84%20%EC%83%81%EC%A3%BC%EC%8B%9C%20%EA%B5%AC%ED%96%A54%EA%B8%B8%2015) |
| 경상북도 | 선재하이츠빌라 | 경상북도 울진군 후포로 121 | 36.68182, 129.45407 | [열기](https://map.naver.com/p/search/%EA%B2%BD%EC%83%81%EB%B6%81%EB%8F%84%20%EC%9A%B8%EC%A7%84%EA%B5%B0%20%ED%9B%84%ED%8F%AC%EB%A1%9C%20121) |
| 부산광역시 | (75-0) | 부산광역시 기장군 여락송정로 363 | 35.29986, 129.13471 | [열기](https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C%20%EA%B8%B0%EC%9E%A5%EA%B5%B0%20%EC%97%AC%EB%9D%BD%EC%86%A1%EC%A0%95%EB%A1%9C%20363) |
| 부산광역시 | 글로벌빌라트 | 부산광역시 동래구 쇠미로31번길 1 | 35.19702, 129.05329 | [열기](https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C%20%EB%8F%99%EB%9E%98%EA%B5%AC%20%EC%87%A0%EB%AF%B8%EB%A1%9C31%EB%B2%88%EA%B8%B8%201) |
| 부산광역시 | 동남주상복합 | 부산광역시 부산진구 백양순환로 9 | 35.16549, 129.03302 | [열기](https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C%20%EB%B6%80%EC%82%B0%EC%A7%84%EA%B5%AC%20%EB%B0%B1%EC%96%91%EC%88%9C%ED%99%98%EB%A1%9C%209) |
| 부산광역시 | 문화파크 | 부산광역시 금정구 삼어로 237 | 35.21465, 129.11400 | [열기](https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C%20%EA%B8%88%EC%A0%95%EA%B5%AC%20%EC%82%BC%EC%96%B4%EB%A1%9C%20237) |
| 부산광역시 | 세원하우스 | 부산광역시 부산진구 동천로107번길 12-21 | 35.15868, 129.06150 | [열기](https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C%20%EB%B6%80%EC%82%B0%EC%A7%84%EA%B5%AC%20%EB%8F%99%EC%B2%9C%EB%A1%9C107%EB%B2%88%EA%B8%B8%2012-21) |
| 부산광역시 | 은하수빌 A동 | 부산광역시 부산진구 중앙대로756번길 18-7 | 35.15900, 129.06178 | [열기](https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C%20%EB%B6%80%EC%82%B0%EC%A7%84%EA%B5%AC%20%EC%A4%91%EC%95%99%EB%8C%80%EB%A1%9C756%EB%B2%88%EA%B8%B8%2018-7) |
| 부산광역시 | 은하수빌 B동 | 부산광역시 부산진구 중앙대로756번길 18-9 | 35.15891, 129.06178 | [열기](https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C%20%EB%B6%80%EC%82%B0%EC%A7%84%EA%B5%AC%20%EC%A4%91%EC%95%99%EB%8C%80%EB%A1%9C756%EB%B2%88%EA%B8%B8%2018-9) |
| 부산광역시 | 주례우진 | 부산광역시 사상구 주례로 79 | 35.14624, 129.00820 | [열기](https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C%20%EC%82%AC%EC%83%81%EA%B5%AC%20%EC%A3%BC%EB%A1%80%EB%A1%9C%2079) |
| 부산광역시 | 청안에버빌 | 부산광역시 부산진구 중앙대로756번길 18-6 | 35.15918, 129.06147 | [열기](https://map.naver.com/p/search/%EB%B6%80%EC%82%B0%EA%B4%91%EC%97%AD%EC%8B%9C%20%EB%B6%80%EC%82%B0%EC%A7%84%EA%B5%AC%20%EC%A4%91%EC%95%99%EB%8C%80%EB%A1%9C756%EB%B2%88%EA%B8%B8%2018-6) |
| 전라남도 | 힐스테이트죽림젠트리스 | 전라남도 여수시 덕양로 21-18 | 34.76362, 127.63264 | [열기](https://map.naver.com/p/search/%EC%A0%84%EB%9D%BC%EB%82%A8%EB%8F%84%20%EC%97%AC%EC%88%98%EC%8B%9C%20%EB%8D%95%EC%96%91%EB%A1%9C%2021-18) |
| 전북특별자치도 | 에코시티 데시앙 네스트 3블럭 | 전북특별자치도 전주시 덕진구 세병로 90 | 35.87146, 127.13456 | [열기](https://map.naver.com/p/search/%EC%A0%84%EB%B6%81%ED%8A%B9%EB%B3%84%EC%9E%90%EC%B9%98%EB%8F%84%20%EC%A0%84%EC%A3%BC%EC%8B%9C%20%EB%8D%95%EC%A7%84%EA%B5%AC%20%EC%84%B8%EB%B3%91%EB%A1%9C%2090) |
| 충청북도 | 청주산단2 행복주택 | 충청북도 청주시 흥덕구 공단로 58 | 36.63795, 127.44236 | [열기](https://map.naver.com/p/search/%EC%B6%A9%EC%B2%AD%EB%B6%81%EB%8F%84%20%EC%B2%AD%EC%A3%BC%EC%8B%9C%20%ED%9D%A5%EB%8D%95%EA%B5%AC%20%EA%B3%B5%EB%8B%A8%EB%A1%9C%2058) |

## 판정 기록 방법

`etl/review_verdicts.csv`가 `region,case_type,subject,verdict,note`를 담고,
`etl/collect_review_cases.py`가 검수표를 만들 때 이를 다시 붙입니다.
판정을 바꾸려면 그 파일을 고치고 검수표를 다시 생성하세요. 아직 판정되지 않은 건은 항상 목록 맨 위에 옵니다.
