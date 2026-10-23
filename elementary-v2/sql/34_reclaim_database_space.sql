-- 34: 무료 요금제 DB 한도(500 MB) 안으로 되돌리기 (2026-10-23)
--
-- 2026-10-23 실측 491.97 MB. 지울 수 있는 것만 지운다 — 화면이 읽는 데이터는 건드리지 않는다.
--
-- 1. apartment_transaction_raw.raw_payload 비우기 (약 35~40 MB)
--    국토부 원문 레코드 전체가 행마다 JSONB로 들어 있었다(행 크기의 62%). 같은 원문이 비공개 Storage
--    etl-source-snapshots/molit-apartment-trade/에 280개 파일 전부 있고(1.4 MB 압축, 2026-10-23 확인),
--    각 행은 apartment_transaction_source_snapshot.object_path로 그 파일을 가리킨다. DB에서 원문을 다시
--    읽는 코드는 없다(서빙 갱신은 monthly_summary만 읽는다). 적재기(etl/upload_apartment_transactions.py)는
--    이제 빈 객체를 보낸다. 계약일·면적·금액·층·연결(link)은 그대로다.
-- 2. (뺌) 레거시 schools 테이블 — 행 0개·인덱스 5 MB지만 2026-10-23 실행에서 2BP01로 거부됐다. 레거시
--    함수 calculate_school_data_quality·get_grade_students_array·is_keris_data_fresh와 레거시 테이블
--    apartments·apartment_school_mappings의 FK가 기댄다. 01~05 레거시 묶음 정리는 따로 한다.
-- 3. school_apartment_serving_school_idx 삭제 (약 3 MB)
--    (school_id) 하나짜리. school_id로 시작하는 filter_idx·query_idx가 같은 조회를 받는다.
--
-- 실행: 사용자가 SQL 편집기에서. 1부를 먼저 한 번에, 2부의 VACUUM은 한 줄씩 따로 실행한다(VACUUM은
-- 트랜잭션 안에서 돌지 않는다). VACUUM FULL은 그 테이블을 몇 초~수십 초 잠그므로 새벽에 한다.
-- 되돌리기: 1은 Storage 원문으로 다시 채울 수 있다. 3은 06의 정의로 다시 만들 수 있다.

-- 1부 ------------------------------------------------------------------------
BEGIN;

UPDATE public.apartment_transaction_raw
SET raw_payload = '{}'::jsonb
WHERE raw_payload <> '{}'::jsonb;

DROP INDEX IF EXISTS public.school_apartment_serving_school_idx;

COMMIT;

-- 2부: 한 줄씩 따로 실행 ----------------------------------------------------------
-- VACUUM FULL public.apartment_transaction_raw;
-- VACUUM FULL public.academy_address_serving;
-- VACUUM FULL public.apartment_academy_origin_points;

-- 확인: 실행 전후로 비교한다.
-- select pg_size_pretty(pg_database_size(current_database()));
