-- Authenticated ETL monitoring contract. Run after 11.

ALTER TABLE etl_runs
    ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'manual'
        CHECK (trigger_type IN ('manual', 'scheduled', 'retry')),
    ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1
        CHECK (attempt_number >= 1);

CREATE TABLE IF NOT EXISTS etl_admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS etl_schedules (
    schedule_id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    data_domain TEXT NOT NULL CHECK (data_domain IN ('school', 'apartment', 'school_zone')),
    cadence_unit TEXT NOT NULL CHECK (cadence_unit IN ('daily', 'weekly', 'monthly', 'annual', 'manual')),
    cadence_value INTEGER NOT NULL DEFAULT 1 CHECK (cadence_value >= 1),
    max_age_hours INTEGER NOT NULL CHECK (max_age_hours >= 1),
    scope_regions JSONB NOT NULL DEFAULT '[]'::JSONB,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_id UUID REFERENCES etl_runs(run_id) ON DELETE SET NULL,
    last_success_at TIMESTAMPTZ,
    next_due_at TIMESTAMPTZ,
    owner_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS etl_run_checks (
    run_id UUID NOT NULL REFERENCES etl_runs(run_id) ON DELETE CASCADE,
    check_name TEXT NOT NULL,
    scope_name TEXT NOT NULL DEFAULT 'global',
    status TEXT NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
    metric_value NUMERIC,
    metric_unit TEXT,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, check_name, scope_name)
);

CREATE INDEX IF NOT EXISTS etl_runs_monitoring_idx
    ON etl_runs (started_at DESC, status);
CREATE INDEX IF NOT EXISTS etl_schedules_due_idx
    ON etl_schedules (enabled, next_due_at);
CREATE INDEX IF NOT EXISTS etl_run_checks_status_idx
    ON etl_run_checks (status, checked_at DESC);

INSERT INTO etl_schedules (
    schedule_id, source_name, display_name, data_domain, cadence_unit,
    cadence_value, max_age_hours, scope_regions, enabled, owner_note
)
VALUES
    ('kapt-weekly', 'kapt-basic', 'K-apt 단지 기본정보', 'apartment', 'weekly', 1, 192,
     '["서울특별시", "경기도", "인천광역시"]'::JSONB, TRUE, '공식 자료실 주간 XLSX'),
    ('schoolinfo-basic-annual', 'schoolinfo-basic', '학교 기본정보', 'school', 'annual', 1, 9600,
     '["서울특별시", "경기도", "인천광역시"]'::JSONB, TRUE, '학교알리미 공시 기준'),
    ('schoolinfo-grade-annual', 'schoolinfo-grade-students', '학년별 학생·학급', 'school', 'annual', 1, 9600,
     '["서울특별시", "경기도", "인천광역시"]'::JSONB, TRUE, '1학년 학생수·학급수 우선 점검'),
    ('hakgudo-annual', 'hakgudo-polygons', '초등학교 통학구역', 'school_zone', 'annual', 1, 9600,
     '["서울특별시", "경기도", "인천광역시"]'::JSONB, FALSE, '전국 확장 전 수도권 수집 자동화 필요')
ON CONFLICT (schedule_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    data_domain = EXCLUDED.data_domain,
    cadence_unit = EXCLUDED.cadence_unit,
    cadence_value = EXCLUDED.cadence_value,
    max_age_hours = EXCLUDED.max_age_hours,
    scope_regions = EXCLUDED.scope_regions,
    owner_note = EXCLUDED.owner_note,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION is_etl_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM etl_admin_users
        WHERE user_id = auth.uid()
    );
$$;

ALTER TABLE etl_admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE etl_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE etl_run_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read own etl role" ON etl_admin_users;
CREATE POLICY "admin read own etl role"
    ON etl_admin_users FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin read etl schedules" ON etl_schedules;
CREATE POLICY "admin read etl schedules"
    ON etl_schedules FOR SELECT TO authenticated
    USING ((SELECT is_etl_admin()));

DROP POLICY IF EXISTS "admin read etl run checks" ON etl_run_checks;
CREATE POLICY "admin read etl run checks"
    ON etl_run_checks FOR SELECT TO authenticated
    USING ((SELECT is_etl_admin()));

DROP POLICY IF EXISTS "admin read etl runs" ON etl_runs;
CREATE POLICY "admin read etl runs"
    ON etl_runs FOR SELECT TO authenticated
    USING ((SELECT is_etl_admin()));

DROP POLICY IF EXISTS "admin read etl snapshots" ON etl_source_snapshots;
CREATE POLICY "admin read etl snapshots"
    ON etl_source_snapshots FOR SELECT TO authenticated
    USING ((SELECT is_etl_admin()));

REVOKE ALL ON TABLE etl_admin_users FROM PUBLIC, anon;
REVOKE ALL ON TABLE etl_schedules FROM PUBLIC, anon;
REVOKE ALL ON TABLE etl_run_checks FROM PUBLIC, anon;
GRANT SELECT ON TABLE etl_admin_users TO authenticated;
GRANT SELECT ON TABLE etl_schedules TO authenticated;
GRANT SELECT ON TABLE etl_run_checks TO authenticated;
GRANT SELECT ON TABLE etl_runs TO authenticated;
GRANT SELECT ON TABLE etl_source_snapshots TO authenticated;
GRANT ALL ON TABLE etl_admin_users TO service_role;
GRANT ALL ON TABLE etl_schedules TO service_role;
GRANT ALL ON TABLE etl_run_checks TO service_role;
REVOKE ALL ON FUNCTION is_etl_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_etl_admin() TO authenticated, service_role;

COMMENT ON TABLE etl_schedules IS
    'Expected ETL cadence and regional scope used by the admin monitoring dashboard.';
COMMENT ON TABLE etl_run_checks IS
    'Run-level row-count, Serving, staging, latency, and data-quality metrics.';
