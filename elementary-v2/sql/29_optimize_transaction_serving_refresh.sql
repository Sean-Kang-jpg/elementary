-- Keep nationwide transaction publication within the Data API timeout.
--
-- Migration 28 fixed the public-key grain but recalculated the entity-to-key
-- mapping several times. Materialize that small approved scope once per refresh
-- and add the partial indexes used by the raw-row aggregation.
-- Run after 28. Safe to rerun.

BEGIN;

CREATE INDEX IF NOT EXISTS apartment_transaction_summary_approved_idx
    ON apartment_transaction_monthly_summary (entity_id, deal_month, area_band)
    INCLUDE (transaction_count, source_as_of)
    WHERE quality_status = 'approved';

CREATE INDEX IF NOT EXISTS apartment_transaction_snapshot_latest_idx
    ON apartment_transaction_source_snapshot (
        source_month, lawd_cd, source_as_of DESC, collected_at DESC
    );

CREATE INDEX IF NOT EXISTS apartment_transaction_raw_active_contract_idx
    ON apartment_transaction_raw (
        transaction_snapshot_id, contract_date, source_row_ordinal
    )
    INCLUDE (exclusive_area_m2, deal_amount_10k_krw)
    WHERE cancellation_date IS NULL;

CREATE INDEX IF NOT EXISTS apartment_transaction_link_confirmed_entity_idx
    ON apartment_transaction_link (
        entity_id, transaction_snapshot_id, source_row_ordinal
    )
    WHERE link_status = 'confirmed';

CREATE OR REPLACE FUNCTION refresh_apartment_transaction_monthly_serving()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    approved_rows INTEGER;
    mapped_rows INTEGER;
    expected_rows INTEGER;
    inserted_rows INTEGER;
    expected_transactions BIGINT;
    inserted_transactions BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('refresh_apartment_transaction_monthly_serving'));

    SELECT COUNT(*), COALESCE(SUM(transaction_count), 0)
      INTO approved_rows, expected_transactions
      FROM public.apartment_transaction_monthly_summary
     WHERE quality_status = 'approved';

    DROP TABLE IF EXISTS pg_temp.apartment_transaction_publish_scope;
    CREATE TEMP TABLE apartment_transaction_publish_scope
    ON COMMIT DROP
    AS
    SELECT
        summary.entity_id,
        summary.deal_month,
        summary.area_band,
        summary.source_as_of,
        MIN(COALESCE(keys.superseded_by, keys.public_key)) AS complex_public_key
    FROM public.apartment_transaction_monthly_summary AS summary
    JOIN public.apartment_source_identity AS identity
      ON identity.entity_id = summary.entity_id
     AND identity.source_system = 'apt_base'
     AND identity.decision_status = 'confirmed'
    JOIN public.apartment_public_key_atom AS atoms
      ON atoms.apt_cd = identity.source_id
    JOIN public.apartment_public_key AS keys
      ON keys.public_key = atoms.public_key
    WHERE summary.quality_status = 'approved'
    GROUP BY
        summary.entity_id,
        summary.deal_month,
        summary.area_band,
        summary.source_as_of;

    CREATE INDEX ON apartment_transaction_publish_scope (
        entity_id, deal_month, area_band
    );

    SELECT COUNT(*) INTO mapped_rows
      FROM apartment_transaction_publish_scope;
    SELECT COUNT(*) INTO expected_rows
      FROM (
          SELECT complex_public_key, deal_month, area_band
          FROM apartment_transaction_publish_scope
          GROUP BY complex_public_key, deal_month, area_band
      ) AS public_groups;

    IF mapped_rows <> approved_rows THEN
        RAISE EXCEPTION
            'transaction serving has % approved summaries but only % public-key mappings',
            approved_rows, mapped_rows;
    END IF;

    DELETE FROM public.apartment_transaction_monthly_serving WHERE TRUE;

    WITH latest_snapshots AS MATERIALIZED (
        SELECT DISTINCT ON (snapshot.source_month, snapshot.lawd_cd)
            snapshot.transaction_snapshot_id
        FROM public.apartment_transaction_source_snapshot AS snapshot
        ORDER BY
            snapshot.source_month,
            snapshot.lawd_cd,
            snapshot.source_as_of DESC,
            snapshot.collected_at DESC,
            snapshot.transaction_snapshot_id DESC
    ), approved_transactions AS MATERIALIZED (
        SELECT
            scope.complex_public_key,
            scope.deal_month,
            scope.area_band,
            raw.contract_date,
            raw.deal_amount_10k_krw,
            raw.exclusive_area_m2,
            scope.source_as_of
        FROM latest_snapshots AS latest
        JOIN public.apartment_transaction_raw AS raw
          ON raw.transaction_snapshot_id = latest.transaction_snapshot_id
         AND raw.cancellation_date IS NULL
        JOIN public.apartment_transaction_link AS link
          ON link.transaction_snapshot_id = raw.transaction_snapshot_id
         AND link.source_row_ordinal = raw.source_row_ordinal
         AND link.link_status = 'confirmed'
        JOIN apartment_transaction_publish_scope AS scope
          ON scope.entity_id = link.entity_id
         AND scope.deal_month = date_trunc('month', raw.contract_date)::DATE
         AND scope.area_band = CASE
             WHEN raw.exclusive_area_m2 < 60 THEN 'under_60'
             WHEN raw.exclusive_area_m2 < 85 THEN '60_to_84_9999'
             WHEN raw.exclusive_area_m2 < 102 THEN '85_to_101_9999'
             ELSE '102_plus'
         END
    )
    INSERT INTO public.apartment_transaction_monthly_serving (
        complex_public_key,
        deal_month,
        area_band,
        transaction_count,
        median_amount_10k_krw,
        mean_amount_10k_krw,
        median_amount_per_m2_10k_krw,
        latest_contract_date,
        source_as_of,
        updated_at
    )
    SELECT
        transactions.complex_public_key,
        transactions.deal_month,
        transactions.area_band,
        COUNT(*)::INTEGER,
        percentile_cont(0.5) WITHIN GROUP (
            ORDER BY transactions.deal_amount_10k_krw
        )::NUMERIC(16,2),
        AVG(transactions.deal_amount_10k_krw)::NUMERIC(16,2),
        percentile_cont(0.5) WITHIN GROUP (
            ORDER BY transactions.deal_amount_10k_krw / transactions.exclusive_area_m2
        )::NUMERIC(16,4),
        MAX(transactions.contract_date),
        MAX(transactions.source_as_of),
        NOW()
    FROM approved_transactions AS transactions
    GROUP BY
        transactions.complex_public_key,
        transactions.deal_month,
        transactions.area_band;

    GET DIAGNOSTICS inserted_rows = ROW_COUNT;

    SELECT COALESCE(SUM(transaction_count), 0)
      INTO inserted_transactions
      FROM public.apartment_transaction_monthly_serving;

    IF inserted_rows <> expected_rows THEN
        RAISE EXCEPTION
            'transaction serving refresh produced % rows, expected % public groups',
            inserted_rows, expected_rows;
    END IF;
    IF inserted_transactions <> expected_transactions THEN
        RAISE EXCEPTION
            'transaction serving refresh published % transactions, expected % approved transactions',
            inserted_transactions, expected_transactions;
    END IF;

    RETURN inserted_rows;
END;
$$;

REVOKE ALL ON FUNCTION refresh_apartment_transaction_monthly_serving() FROM PUBLIC;
REVOKE ALL ON FUNCTION refresh_apartment_transaction_monthly_serving() FROM anon;
REVOKE ALL ON FUNCTION refresh_apartment_transaction_monthly_serving() FROM authenticated;
GRANT EXECUTE ON FUNCTION refresh_apartment_transaction_monthly_serving() TO service_role;

COMMENT ON FUNCTION refresh_apartment_transaction_monthly_serving() IS
    'Rebuilds approved public transaction summaries at complex-key grain using one materialized publication scope and indexed raw-row aggregation.';

COMMIT;

-- Verification after applying:
--
--   SELECT refresh_apartment_transaction_monthly_serving();
--
-- The function must complete within the API statement timeout and return the
-- number of distinct public-key/month/area-band rows.
