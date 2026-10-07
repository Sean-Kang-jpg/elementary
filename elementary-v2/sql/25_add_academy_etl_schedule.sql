-- Academy refresh joins the monthly ETL (docs/operations/ACADEMY_REFRESH_PLAN.md).
--
-- etl_schedules.data_domain allowed only school, apartment and school_zone; the
-- academy layer gets its own domain and a monthly 'neis-academy' schedule, which
-- run_due_etl.py maps to etl/run_academy_refresh.py. next_due_at starts NULL, so the
-- next monthly run picks it up. public_data_freshness() lists the source too, so a
-- screen can say how current the academy counts are.
--
-- Run after 12 and 22. Safe to rerun. Applying it before the code that knows the
-- source is harmless: run_due_etl ignores schedules it has no group for.

BEGIN;

ALTER TABLE etl_schedules DROP CONSTRAINT IF EXISTS etl_schedules_data_domain_check;
ALTER TABLE etl_schedules ADD CONSTRAINT etl_schedules_data_domain_check
    CHECK (data_domain IN ('school', 'apartment', 'school_zone', 'academy'));

INSERT INTO etl_schedules (
    schedule_id, source_name, display_name, data_domain, cadence_unit,
    cadence_value, max_age_hours, scope_regions, enabled, owner_note
)
VALUES
    ('neis-academy-monthly', 'neis-academy', '학원·교습소·체육도장', 'academy', 'monthly', 1, 1080,
     '[]'::JSONB, TRUE, 'NEIS 학원교습소정보 + 체육도장업 인허가, 전국 전체 교체')
ON CONFLICT (schedule_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    data_domain = EXCLUDED.data_domain,
    cadence_unit = EXCLUDED.cadence_unit,
    cadence_value = EXCLUDED.cadence_value,
    max_age_hours = EXCLUDED.max_age_hours,
    owner_note = EXCLUDED.owner_note,
    updated_at = NOW();

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
      AND schedules.source_name IN ('kapt-basic', 'schoolinfo-basic', 'schoolinfo-grade-students', 'neis-academy');
$$;

REVOKE ALL ON FUNCTION public_data_freshness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_data_freshness() TO anon, authenticated;

COMMIT;

-- Verify:
--   SELECT source_name, data_domain, next_due_at FROM etl_schedules WHERE source_name = 'neis-academy';
--   POST /rest/v1/rpc/public_data_freshness (anon)  ->  'neis-academy' appears once a run has validated a snapshot
