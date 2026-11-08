-- 42: 월간 apply가 부풀린 공간을 apply 끝에 돌려받기 (2026-11-08)
--
-- 11-06 apply 한 번으로 DB가 약 75 MB 커져 무료 요금제 한도(500 MB)를 넘었다. 행 수는 그대로였고
-- 늘어난 것은 지우고 다시 쓴 자리였다. 11-08 손으로 TRUNCATE와 VACUUM FULL을 돌려 539 → 449 MB:
--   etl_staging_rows (0행, 색인만 25 MB) -25, academy_address_serving -27,
--   apartment_academy_origin_points -11, apartment_name_history -11, apartment_assignment_units -16
--
-- VACUUM은 함수 안에서 돌지 않으므로 같은 재작성을 하는 CLUSTER(기본키 순서)를 쓴다. 한 번에 표
-- 하나 — etl/run_due_etl.py의 run_maintenance가 표마다 부르고, 실패한 표는 건너뛴다.
--
-- 잠금: CLUSTER는 그 표를 수 초 잠근다(11-08 VACUUM FULL 2~17초). 공개 표는 그동안 읽기가 기다린다.
-- 잠금을 15초 안에 못 얻으면 그 표만 실패한다.
-- etl_staging_rows: 'started' 상태 실행이 6시간 안에 있으면 TRUNCATE하지 않는다(다른 실행의 staging).
--
-- 실행: SQL 편집기에서 한 번. 되돌리기: DROP FUNCTION public.reclaim_etl_table_space(TEXT);

BEGIN;

CREATE OR REPLACE FUNCTION public.reclaim_etl_table_space(p_table TEXT)
RETURNS TABLE (table_name TEXT, bytes_before BIGINT, bytes_after BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '3min'
SET lock_timeout = '15s'
AS $$
DECLARE
    target REGCLASS;
    pk_name TEXT;
BEGIN
    IF NOT p_table = ANY (ARRAY[
        'etl_staging_rows',
        'school_apartment_serving',
        'academy_address_serving',
        'apartment_academy_origin_points',
        'apartment_academy_summary',
        'apartment_complex_master',
        'apartment_assignment_units',
        'apartment_assignment_schools',
        'apartment_name_history',
        'apartment_property_history',
        'school_master'
    ]) THEN
        RAISE EXCEPTION 'table % is not reclaimed by ETL', p_table USING ERRCODE = '42501';
    END IF;

    target := format('public.%I', p_table)::REGCLASS;
    table_name := p_table;
    bytes_before := pg_total_relation_size(target);

    IF p_table = 'etl_staging_rows' THEN
        IF EXISTS (
            SELECT 1 FROM etl_runs
            WHERE status = 'started' AND started_at > NOW() - INTERVAL '6 hours'
        ) THEN
            RAISE EXCEPTION 'an ETL run is in progress; staging left as it is' USING ERRCODE = '55006';
        END IF;
        TRUNCATE public.etl_staging_rows;
    ELSE
        SELECT i.relname INTO pk_name
        FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
        WHERE x.indrelid = target AND x.indisprimary;
        EXECUTE format('CLUSTER %s USING %I', target, pk_name);
    END IF;

    bytes_after := pg_total_relation_size(target);
    RETURN NEXT;
END $$;

COMMENT ON FUNCTION public.reclaim_etl_table_space(TEXT) IS
    'Rewrites one ETL-written table (CLUSTER on its primary key, or TRUNCATE of empty staging) to return the space a monthly apply left behind. Service role only.';

REVOKE ALL ON FUNCTION public.reclaim_etl_table_space(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_etl_table_space(TEXT) TO service_role;

COMMIT;

-- 확인
-- select * from public.reclaim_etl_table_space('apartment_property_history');
-- select pg_size_pretty(pg_database_size(current_database()));
