-- Persistent apartment entities, audited source-ID crosswalks, and private
-- MOLIT transaction storage. Run after 18, 19, and 22.
--
-- This migration does not infer merges.  The ETL may insert a new entity or
-- append a review decision, but a confirmed source identity is never silently
-- reassigned.  Raw trades remain service-role only; browsers see approved
-- monthly aggregates addressed by the existing immutable public key.

BEGIN;

CREATE TABLE IF NOT EXISTS apartment_entity (
    entity_id UUID PRIMARY KEY,
    entity_status TEXT NOT NULL DEFAULT 'active'
        CHECK (entity_status IN ('active', 'superseded', 'retired', 'review_hold')),
    successor_entity_id UUID REFERENCES apartment_entity(entity_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (successor_entity_id IS DISTINCT FROM entity_id),
    CHECK ((entity_status = 'superseded') = (successor_entity_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS apartment_source_identity (
    source_system TEXT NOT NULL
        CHECK (source_system IN ('apt_base', 'kapt', 'molit_apt_seq', 'molit_apt_seq_address')),
    source_id TEXT NOT NULL,
    entity_id UUID NOT NULL REFERENCES apartment_entity(entity_id),
    decision_status TEXT NOT NULL
        CHECK (decision_status IN ('confirmed', 'review', 'rejected', 'superseded')),
    confidence NUMERIC(5,4) CHECK (confidence BETWEEN 0 AND 1),
    matcher_version TEXT NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
    first_seen_as_of DATE NOT NULL,
    last_seen_as_of DATE NOT NULL,
    confirmed_at TIMESTAMPTZ,
    confirmed_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_system, source_id),
    CHECK (last_seen_as_of >= first_seen_as_of),
    CHECK (decision_status <> 'confirmed' OR confirmed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS apartment_source_identity_entity_idx
    ON apartment_source_identity (entity_id, source_system);

CREATE TABLE IF NOT EXISTS apartment_identity_decision (
    decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system TEXT NOT NULL,
    source_id TEXT NOT NULL,
    candidate_entity_id UUID REFERENCES apartment_entity(entity_id),
    decision_status TEXT NOT NULL
        CHECK (decision_status IN ('confirmed', 'review', 'rejected', 'conflict')),
    decision_reason TEXT NOT NULL,
    matcher_version TEXT NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
    decided_by TEXT NOT NULL,
    source_as_of DATE NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apartment_identity_decision_queue_idx
    ON apartment_identity_decision (decision_status, source_system, source_as_of DESC);
CREATE UNIQUE INDEX IF NOT EXISTS apartment_identity_decision_idempotency_idx
    ON apartment_identity_decision (
        source_system, source_id, matcher_version, source_as_of, decision_status
    );

CREATE TABLE IF NOT EXISTS apartment_entity_lineage (
    lineage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    predecessor_entity_id UUID NOT NULL REFERENCES apartment_entity(entity_id),
    successor_entity_id UUID NOT NULL REFERENCES apartment_entity(entity_id),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'data_correction_merge', 'physical_redevelopment', 'physical_split',
        'management_merge', 'management_split'
    )),
    effective_date DATE,
    source_as_of DATE NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
    decision_id UUID REFERENCES apartment_identity_decision(decision_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (predecessor_entity_id, successor_entity_id, event_type),
    CHECK (predecessor_entity_id <> successor_entity_id)
);

CREATE TABLE IF NOT EXISTS apartment_transaction_source_snapshot (
    transaction_snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_month DATE NOT NULL CHECK (date_trunc('month', source_month)::DATE = source_month),
    lawd_cd TEXT NOT NULL CHECK (lawd_cd ~ '^[0-9]{5}$'),
    source_as_of DATE NOT NULL,
    content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
    object_path TEXT NOT NULL,
    row_count INTEGER NOT NULL CHECK (row_count >= 0),
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_month, lawd_cd, content_sha256)
);

CREATE TABLE IF NOT EXISTS apartment_transaction_raw (
    transaction_snapshot_id UUID NOT NULL
        REFERENCES apartment_transaction_source_snapshot(transaction_snapshot_id) ON DELETE CASCADE,
    source_row_ordinal INTEGER NOT NULL CHECK (source_row_ordinal > 0),
    comparison_fingerprint TEXT NOT NULL,
    occurrence_ordinal INTEGER NOT NULL CHECK (occurrence_ordinal > 0),
    apt_seq TEXT,
    contract_date DATE NOT NULL,
    exclusive_area_m2 NUMERIC(10,4) NOT NULL CHECK (exclusive_area_m2 > 0),
    floor INTEGER,
    deal_amount_10k_krw BIGINT NOT NULL CHECK (deal_amount_10k_krw > 0),
    registration_date DATE,
    cancellation_date DATE,
    cancellation_type TEXT,
    raw_payload JSONB NOT NULL,
    PRIMARY KEY (transaction_snapshot_id, source_row_ordinal)
);

-- Fingerprints are intentionally non-unique. Two legitimate trades may share
-- date, area, floor, and amount; occurrence_ordinal records multiplicity.
CREATE INDEX IF NOT EXISTS apartment_transaction_raw_fingerprint_idx
    ON apartment_transaction_raw (comparison_fingerprint, occurrence_ordinal);
CREATE INDEX IF NOT EXISTS apartment_transaction_raw_apt_seq_idx
    ON apartment_transaction_raw (apt_seq) WHERE apt_seq IS NOT NULL;

CREATE TABLE IF NOT EXISTS apartment_transaction_link (
    transaction_snapshot_id UUID NOT NULL,
    source_row_ordinal INTEGER NOT NULL,
    entity_id UUID REFERENCES apartment_entity(entity_id),
    link_status TEXT NOT NULL CHECK (link_status IN ('confirmed', 'review', 'unmatched', 'conflict')),
    match_tier TEXT NOT NULL,
    matcher_version TEXT NOT NULL,
    candidate_entity_ids UUID[] NOT NULL DEFAULT '{}',
    evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (transaction_snapshot_id, source_row_ordinal),
    FOREIGN KEY (transaction_snapshot_id, source_row_ordinal)
        REFERENCES apartment_transaction_raw(transaction_snapshot_id, source_row_ordinal) ON DELETE CASCADE,
    CHECK ((link_status = 'confirmed') = (entity_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS apartment_transaction_link_review_idx
    ON apartment_transaction_link (link_status, match_tier);
CREATE INDEX IF NOT EXISTS apartment_transaction_link_entity_idx
    ON apartment_transaction_link (entity_id) WHERE entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS apartment_transaction_monthly_summary (
    entity_id UUID NOT NULL REFERENCES apartment_entity(entity_id),
    deal_month DATE NOT NULL CHECK (date_trunc('month', deal_month)::DATE = deal_month),
    area_band TEXT NOT NULL CHECK (area_band IN (
        'under_60', '60_to_84_9999', '85_to_101_9999', '102_plus'
    )),
    transaction_count INTEGER NOT NULL CHECK (transaction_count > 0),
    median_amount_10k_krw NUMERIC(16,2) NOT NULL,
    mean_amount_10k_krw NUMERIC(16,2) NOT NULL,
    median_amount_per_m2_10k_krw NUMERIC(16,4) NOT NULL,
    latest_contract_date DATE NOT NULL,
    source_as_of DATE NOT NULL,
    quality_status TEXT NOT NULL CHECK (quality_status IN ('approved', 'hold', 'rejected')),
    matcher_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entity_id, deal_month, area_band)
);

CREATE TABLE IF NOT EXISTS apartment_transaction_monthly_serving (
    complex_public_key TEXT NOT NULL,
    deal_month DATE NOT NULL,
    area_band TEXT NOT NULL,
    transaction_count INTEGER NOT NULL,
    median_amount_10k_krw NUMERIC(16,2) NOT NULL,
    mean_amount_10k_krw NUMERIC(16,2) NOT NULL,
    median_amount_per_m2_10k_krw NUMERIC(16,4) NOT NULL,
    latest_contract_date DATE NOT NULL,
    source_as_of DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (complex_public_key, deal_month, area_band)
);

CREATE INDEX IF NOT EXISTS apartment_transaction_monthly_serving_lookup_idx
    ON apartment_transaction_monthly_serving (complex_public_key, deal_month DESC);

CREATE OR REPLACE FUNCTION refresh_apartment_transaction_monthly_serving()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    inserted_rows INTEGER;
    expected_rows INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('refresh_apartment_transaction_monthly_serving'));
    SELECT COUNT(*) INTO expected_rows
      FROM public.apartment_transaction_monthly_summary
     WHERE quality_status = 'approved';
    DELETE FROM public.apartment_transaction_monthly_serving WHERE TRUE;
    INSERT INTO public.apartment_transaction_monthly_serving (
        complex_public_key, deal_month, area_band, transaction_count,
        median_amount_10k_krw, mean_amount_10k_krw,
        median_amount_per_m2_10k_krw, latest_contract_date, source_as_of, updated_at
    )
    SELECT
        MIN(COALESCE(keys.superseded_by, keys.public_key)), summary.deal_month,
        summary.area_band, summary.transaction_count, summary.median_amount_10k_krw,
        summary.mean_amount_10k_krw, summary.median_amount_per_m2_10k_krw,
        summary.latest_contract_date, summary.source_as_of, NOW()
    FROM public.apartment_transaction_monthly_summary AS summary
    JOIN public.apartment_source_identity AS identity
      ON identity.entity_id = summary.entity_id
     AND identity.source_system = 'apt_base'
     AND identity.decision_status = 'confirmed'
    JOIN public.apartment_public_key_atom AS atoms ON atoms.apt_cd = identity.source_id
    JOIN public.apartment_public_key AS keys ON keys.public_key = atoms.public_key
    WHERE summary.quality_status = 'approved'
    GROUP BY summary.entity_id, summary.deal_month, summary.area_band,
        summary.transaction_count, summary.median_amount_10k_krw,
        summary.mean_amount_10k_krw, summary.median_amount_per_m2_10k_krw,
        summary.latest_contract_date, summary.source_as_of;
    GET DIAGNOSTICS inserted_rows = ROW_COUNT;
    IF inserted_rows <> expected_rows THEN
        RAISE EXCEPTION
            'transaction serving refresh produced % rows, expected % approved summaries; public keys are missing',
            inserted_rows, expected_rows;
    END IF;
    RETURN inserted_rows;
END;
$$;

ALTER TABLE apartment_entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_source_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_identity_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_entity_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_transaction_source_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_transaction_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_transaction_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_transaction_monthly_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_transaction_monthly_serving ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE apartment_entity, apartment_source_identity,
    apartment_identity_decision, apartment_entity_lineage,
    apartment_transaction_source_snapshot, apartment_transaction_raw,
    apartment_transaction_link, apartment_transaction_monthly_summary
    FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE apartment_entity, apartment_source_identity,
    apartment_identity_decision, apartment_entity_lineage,
    apartment_transaction_source_snapshot, apartment_transaction_raw,
    apartment_transaction_link, apartment_transaction_monthly_summary
    TO service_role;

REVOKE ALL ON TABLE apartment_transaction_monthly_serving FROM PUBLIC;
GRANT SELECT ON TABLE apartment_transaction_monthly_serving TO anon, authenticated, service_role;
DROP POLICY IF EXISTS apartment_transaction_monthly_serving_public_read
    ON apartment_transaction_monthly_serving;
CREATE POLICY apartment_transaction_monthly_serving_public_read
    ON apartment_transaction_monthly_serving FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE ALL ON FUNCTION refresh_apartment_transaction_monthly_serving()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_apartment_transaction_monthly_serving() TO service_role;

ALTER TABLE etl_schedules DROP CONSTRAINT IF EXISTS etl_schedules_data_domain_check;
ALTER TABLE etl_schedules ADD CONSTRAINT etl_schedules_data_domain_check
    CHECK (data_domain IN ('school', 'apartment', 'school_zone', 'academy', 'transaction'));

INSERT INTO etl_schedules (
    schedule_id, source_name, display_name, data_domain, cadence_unit,
    cadence_value, max_age_hours, scope_regions, enabled, owner_note
)
VALUES (
    'molit-apartment-trade-monthly', 'molit-apartment-trade', '국토부 아파트 매매 실거래',
    'transaction', 'monthly', 1, 1080, '[]'::JSONB, FALSE,
    '결정적 연결률 95% gate와 private backfill audit 통과 후 활성화'
)
ON CONFLICT (schedule_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    data_domain = EXCLUDED.data_domain,
    cadence_unit = EXCLUDED.cadence_unit,
    cadence_value = EXCLUDED.cadence_value,
    max_age_hours = EXCLUDED.max_age_hours,
    scope_regions = EXCLUDED.scope_regions,
    owner_note = EXCLUDED.owner_note,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public_data_freshness()
RETURNS TABLE (source_name TEXT, source_as_of DATE, refreshed_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT schedules.source_name,
        (SELECT max(snapshots.source_as_of)
           FROM public.etl_source_snapshots AS snapshots
          WHERE snapshots.source_name = schedules.source_name
            AND snapshots.status IN ('validated', 'expired')),
        schedules.last_success_at
      FROM public.etl_schedules AS schedules
     WHERE schedules.enabled
       AND schedules.source_name IN (
           'kapt-basic', 'schoolinfo-basic', 'schoolinfo-grade-students',
           'neis-academy', 'molit-apartment-trade'
       );
$$;
REVOKE ALL ON FUNCTION public_data_freshness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_data_freshness() TO anon, authenticated;

COMMIT;

-- Keep the schedule disabled until the deterministic linkage gate reaches 95%
-- on the approved representative sample and the first private backfill audit
-- passes. Enabling collection is a separate, reversible data change.
