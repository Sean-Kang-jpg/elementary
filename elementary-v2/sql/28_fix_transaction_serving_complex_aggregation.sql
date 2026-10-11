-- Publish one transaction summary per immutable apartment public key.
--
-- One public apartment complex can contain several apt_base atoms, and each
-- atom can currently belong to a separate transaction entity. Migration 27
-- grouped by entity before inserting into a table keyed by public key, so a
-- multi-atom complex raised a duplicate-key error during nationwide publish.
--
-- Rebuild the public rows from the latest private raw snapshots so medians are
-- calculated across the whole public complex (not as a median-of-medians).
-- Approved monthly summaries remain the publication allow-list.
-- Run after 27. Safe to rerun.

BEGIN;

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

    WITH approved_entity_keys AS (
        SELECT
            summary.entity_id,
            summary.deal_month,
            summary.area_band,
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
        GROUP BY summary.entity_id, summary.deal_month, summary.area_band
    )
    SELECT COUNT(*) INTO mapped_rows FROM approved_entity_keys;

    IF mapped_rows <> approved_rows THEN
        RAISE EXCEPTION
            'transaction serving has % approved summaries but only % public-key mappings',
            approved_rows, mapped_rows;
    END IF;

    WITH approved_entity_keys AS (
        SELECT
            summary.entity_id,
            summary.deal_month,
            summary.area_band,
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
        GROUP BY summary.entity_id, summary.deal_month, summary.area_band
    )
    SELECT COUNT(*) INTO expected_rows
      FROM (
          SELECT complex_public_key, deal_month, area_band
          FROM approved_entity_keys
          GROUP BY complex_public_key, deal_month, area_band
      ) AS public_groups;

    DELETE FROM public.apartment_transaction_monthly_serving WHERE TRUE;

    WITH latest_snapshots AS (
        SELECT DISTINCT ON (snapshot.source_month, snapshot.lawd_cd)
            snapshot.transaction_snapshot_id
        FROM public.apartment_transaction_source_snapshot AS snapshot
        ORDER BY
            snapshot.source_month,
            snapshot.lawd_cd,
            snapshot.source_as_of DESC,
            snapshot.collected_at DESC,
            snapshot.transaction_snapshot_id DESC
    ), approved_entity_keys AS (
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
            summary.source_as_of
    ), approved_transactions AS (
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
        JOIN public.apartment_transaction_link AS link
          ON link.transaction_snapshot_id = raw.transaction_snapshot_id
         AND link.source_row_ordinal = raw.source_row_ordinal
         AND link.link_status = 'confirmed'
        JOIN approved_entity_keys AS scope
          ON scope.entity_id = link.entity_id
         AND scope.deal_month = date_trunc('month', raw.contract_date)::DATE
         AND scope.area_band = CASE
             WHEN raw.exclusive_area_m2 < 60 THEN 'under_60'
             WHEN raw.exclusive_area_m2 < 85 THEN '60_to_84_9999'
             WHEN raw.exclusive_area_m2 < 102 THEN '85_to_101_9999'
             ELSE '102_plus'
         END
        WHERE raw.cancellation_date IS NULL
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
    'Rebuilds approved public transaction summaries at immutable complex-key grain, combining all component apartment atoms with exact raw-row medians.';

COMMIT;

-- Verification after applying:
--
--   SELECT refresh_apartment_transaction_monthly_serving();
--
--   SELECT COUNT(*) AS serving_rows,
--          SUM(transaction_count) AS published_transactions
--     FROM apartment_transaction_monthly_serving;
--
-- The refresh must complete without duplicate keys or count exceptions.
