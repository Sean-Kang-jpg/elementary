-- Public data freshness: when each source the map shows was last refreshed.
--
-- The detail screens say "학교 정보 2026-08-29 · 아파트 정보 2026-10-02 기준" so a
-- parent can tell how current the numbers are. The dates live in private ETL
-- tables (etl_schedules, etl_source_snapshots), which stay private: this function
-- returns only the source name, its as-of date and when it was last loaded -
-- no file names, paths, run ids or row counts.
--
-- Same contract shape as 13-15: a SECURITY DEFINER function granted to anon,
-- not a readable table. The frontend treats a missing function (PGRST202 /
-- 42883) as "no date to show", so the app is safe to deploy before this runs.
--
-- Run after 11. Safe to rerun.

BEGIN;

CREATE OR REPLACE FUNCTION public_data_freshness()
RETURNS TABLE (
    source_name TEXT,
    source_as_of DATE,
    refreshed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        schedules.source_name,
        (
            SELECT max(snapshots.source_as_of)
            FROM etl_source_snapshots AS snapshots
            WHERE snapshots.source_name = schedules.source_name
              -- expired rows keep their metadata after the object is deleted
              AND snapshots.status IN ('validated', 'expired')
        ) AS source_as_of,
        schedules.last_success_at AS refreshed_at
    FROM etl_schedules AS schedules
    WHERE schedules.enabled
      AND schedules.source_name IN ('kapt-basic', 'schoolinfo-basic', 'schoolinfo-grade-students');
$$;

REVOKE ALL ON FUNCTION public_data_freshness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_data_freshness() TO anon, authenticated;

COMMIT;

-- Verify as the browser would (anon key):
--   POST /rest/v1/rpc/public_data_freshness  ->  three rows, dates only
