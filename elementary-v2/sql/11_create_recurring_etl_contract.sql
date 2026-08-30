-- Recurring ETL control plane: private source archives and transient staging.
-- Run after 06, 09, and 10. Service-role access only.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('etl-source-snapshots', 'etl-source-snapshots', FALSE, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit;

CREATE TABLE IF NOT EXISTS etl_source_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES etl_runs(run_id) ON DELETE SET NULL,
    source_name TEXT NOT NULL,
    source_as_of DATE NOT NULL,
    bucket_id TEXT NOT NULL DEFAULT 'etl-source-snapshots',
    object_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    row_count INTEGER CHECK (row_count IS NULL OR row_count >= 0),
    schema_version TEXT NOT NULL,
    compression TEXT,
    status TEXT NOT NULL DEFAULT 'archived'
        CHECK (status IN ('archived', 'validated', 'rejected', 'expired')),
    retain_until DATE NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_id, source_name)
);

-- Rows are replayable during a run but disposable afterward. UNLOGGED limits
-- write amplification and is appropriate because source archives are durable.
CREATE UNLOGGED TABLE IF NOT EXISTS etl_staging_rows (
    run_id UUID NOT NULL REFERENCES etl_runs(run_id) ON DELETE CASCADE,
    target_table TEXT NOT NULL CHECK (target_table IN (
        'school_master',
        'apartment_complex_master',
        'apartment_assignment_units',
        'apartment_assignment_schools',
        'apartment_name_history',
        'apartment_property_history'
    )),
    row_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
    staged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, target_table, row_key)
);

CREATE INDEX IF NOT EXISTS etl_source_snapshots_retention_idx
    ON etl_source_snapshots (retain_until, status);
CREATE INDEX IF NOT EXISTS etl_staging_rows_run_idx
    ON etl_staging_rows (run_id, target_table);

ALTER TABLE etl_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE etl_staging_rows ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION cleanup_recurring_etl(
    staging_before TIMESTAMPTZ DEFAULT NOW() - INTERVAL '2 days'
)
RETURNS TABLE (staging_rows_deleted BIGINT, snapshots_marked_expired BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    staged_count BIGINT;
    snapshot_count BIGINT;
BEGIN
    DELETE FROM etl_staging_rows
    WHERE staged_at < staging_before;
    GET DIAGNOSTICS staged_count = ROW_COUNT;

    UPDATE etl_source_snapshots
    SET status = 'expired'
    WHERE retain_until < CURRENT_DATE
      AND status IN ('archived', 'validated', 'rejected');
    GET DIAGNOSTICS snapshot_count = ROW_COUNT;

    RETURN QUERY SELECT staged_count, snapshot_count;
END;
$$;

REVOKE ALL ON TABLE etl_source_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE etl_staging_rows FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE etl_source_snapshots TO service_role;
GRANT ALL ON TABLE etl_staging_rows TO service_role;
REVOKE ALL ON FUNCTION cleanup_recurring_etl(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_recurring_etl(TIMESTAMPTZ) TO service_role;

COMMENT ON TABLE etl_source_snapshots IS
    'Private metadata for immutable source files archived in Supabase Storage.';
COMMENT ON TABLE etl_staging_rows IS
    'Transient audited rows awaiting normalized-master upsert; purge after each run.';
