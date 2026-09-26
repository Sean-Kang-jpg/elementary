-- Make staging retention work on a table that has already grown.
--
-- `cleanup_recurring_etl` deleted staging rows with
--   DELETE FROM etl_staging_rows WHERE staged_at < staging_before
-- and `staged_at` has no index, so once the table grew the delete had to scan
-- every row and was cancelled by the statement timeout. Nothing was ever
-- reclaimed, each run added about 92,000 rows, and the table reached 3.3M rows
-- and 3.1 GB, which is 95% of the database.
--
-- The rewrite deletes per run through the primary key instead, which is an
-- index scan and needs no new index on the bloated table, and it bounds the
-- work per call so a call cannot time out. Repeat until it reports zero.
--
-- Idempotent: safe to run more than once.

BEGIN;

DROP FUNCTION IF EXISTS cleanup_recurring_etl(TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION cleanup_recurring_etl(
    staging_before TIMESTAMPTZ DEFAULT NOW() - INTERVAL '2 days',
    max_runs INTEGER DEFAULT 5
)
RETURNS TABLE (staging_rows_deleted BIGINT, snapshots_marked_expired BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_run UUID;
    deleted_now BIGINT;
    deleted_total BIGINT := 0;
    expired_total BIGINT := 0;
BEGIN
    -- Oldest runs first, one DELETE per run against the primary key.
    FOR target_run IN
        SELECT run_id
        FROM etl_runs
        WHERE started_at < staging_before
        ORDER BY started_at
        LIMIT GREATEST(max_runs, 1)
    LOOP
        DELETE FROM etl_staging_rows WHERE run_id = target_run;
        GET DIAGNOSTICS deleted_now = ROW_COUNT;
        deleted_total := deleted_total + deleted_now;
    END LOOP;

    UPDATE etl_source_snapshots
    SET status = 'expired'
    WHERE retain_until < CURRENT_DATE
      AND status <> 'expired';
    GET DIAGNOSTICS expired_total = ROW_COUNT;

    staging_rows_deleted := deleted_total;
    snapshots_marked_expired := expired_total;
    RETURN NEXT;
END $$;

COMMENT ON FUNCTION cleanup_recurring_etl(TIMESTAMPTZ, INTEGER) IS
    'Deletes staging rows for completed runs older than staging_before, at most max_runs per call, using the primary key. Call repeatedly until staging_rows_deleted is 0.';

-- Report staging depth without scanning the table, so monitoring cannot be the
-- thing that times out.
CREATE OR REPLACE FUNCTION etl_staging_depth()
RETURNS TABLE (estimated_rows BIGINT, total_bytes BIGINT, runs_with_rows BIGINT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        GREATEST(c.reltuples, 0)::BIGINT AS estimated_rows,
        pg_total_relation_size('public.etl_staging_rows')::BIGINT AS total_bytes,
        (SELECT COUNT(DISTINCT run_id) FROM etl_staging_rows)::BIGINT AS runs_with_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'etl_staging_rows';
$$;

COMMENT ON FUNCTION etl_staging_depth() IS
    'Planner row estimate and on-disk size for etl_staging_rows; used by the capacity check.';

-- Table sizes for the capacity gate, which until now could only be read by
-- hand in the SQL editor.
CREATE OR REPLACE FUNCTION public_table_sizes()
RETURNS TABLE (table_name TEXT, total_bytes BIGINT, heap_bytes BIGINT, index_bytes BIGINT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        c.relname::TEXT,
        pg_total_relation_size(c.oid)::BIGINT,
        pg_relation_size(c.oid)::BIGINT,
        pg_indexes_size(c.oid)::BIGINT
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC;
$$;

COMMENT ON FUNCTION public_table_sizes() IS
    'Per-table size in the public schema, for the pre-upload capacity gate.';

-- Same privileges as the rest of the control plane: service role only.
REVOKE ALL ON FUNCTION cleanup_recurring_etl(TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_recurring_etl(TIMESTAMPTZ, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION etl_staging_depth() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION etl_staging_depth() TO service_role, authenticated;
REVOKE ALL ON FUNCTION public_table_sizes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public_table_sizes() TO service_role, authenticated;

COMMIT;
