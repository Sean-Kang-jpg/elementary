# SEO 감사 재현 스크립트 (2026-10-24)

운영 사이트와 공개 테이블만 읽는다. 쓰기 없음. 작업 폴더를 하나 만들어 그 안에서 실행한다.

1. 사이트맵 내려받기: `curl -s https://wherecho.co.kr/sitemap-{pages-1,areas-1,schools-1,apartments-1..5}.xml`을 같은 이름으로 저장하고,
   모든 `<loc>`를 `all_urls.txt`에 한 줄씩 모은다.
2. `node data.mjs` — `school_master`·`school_apartment_serving`을 anon 키로 읽어 `schools.json`·`serving.json` 저장.
   `.env` 경로가 `F:/sm/vibe/elementary/pjt_250826/elementary-v2/.env`로 고정되어 있다. 키는 출력하지 않는다.
3. `node hubs.mjs` — 지역 허브 270개 전수(동시 3개), `hubs.json`.
4. `node graph.mjs` — 링크 깊이·고아 단지·0곳 학교, 표본과 모델 링크 비교(`sample.json` 필요).
5. 표본: URL 목록 파일을 만들고 `node analyze.mjs 목록.txt 결과.json`(`sample.json`), `node big.mjs`(`big.txt` → `big.json`).
6. `node canon.mjs` — 학교 6,302곳의 canonical을 `api/detail.js`의 함수로 다시 계산해 사이트맵과 비교.

동시 요청은 3개로 제한했다. 운영 함수 호출이 생기므로 짧은 간격으로 반복 실행하지 않는다.
