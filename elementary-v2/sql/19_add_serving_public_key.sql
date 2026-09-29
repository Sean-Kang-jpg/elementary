-- Carry the immutable public slug into the browser's read model.
--
-- Migration 18 created the private registry and the ETL filled it. The frontend
-- cannot see it, so URLs still have nothing to be built from. This adds the key
-- to `school_apartment_serving`, which is already the browser's contract.
--
-- The refresh function is replaced in the same migration, not a later one.
-- `refresh_school_apartment_serving()` rebuilds the table with DELETE + INSERT,
-- so a column it does not populate is empty again after the next ETL run - and
-- it would be empty quietly, which is how a published URL disappears without
-- anyone noticing. Schema and the function that fills it move together.
--
-- See docs/decisions/ADR-007-immutable-public-identifiers.md.
--
-- Idempotent: safe to run more than once.

BEGIN;

ALTER TABLE school_apartment_serving
    ADD COLUMN IF NOT EXISTS complex_public_key TEXT;

COMMENT ON COLUMN school_apartment_serving.complex_public_key IS
    'Immutable public slug this complex is addressed by. Canonical form: a superseded key is resolved to its successor here, because URLs are built from this. ADR-007.';

-- Detail pages are reached by key, so that is the lookup the index has to serve.
CREATE INDEX IF NOT EXISTS school_apartment_serving_public_key_idx
    ON school_apartment_serving (complex_public_key);

CREATE OR REPLACE FUNCTION refresh_school_apartment_serving()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    inserted_rows INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('refresh_school_apartment_serving'));

    -- Supabase's safe-update guard requires an explicit predicate.
    DELETE FROM school_apartment_serving WHERE TRUE;

    INSERT INTO school_apartment_serving (
        school_id,
        school_name,
        canonical_complex_id,
        complex_public_key,
        apt_cd_list,
        complex_name,
        road_address,
        region,
        district,
        latitude,
        longitude,
        households,
        building_count,
        use_approval_year,
        parking_total,
        parking_ground,
        parking_underground,
        parking_per_household,
        sale_households,
        rental_units_total,
        public_rental_units,
        private_rental_units,
        public_rental_ratio,
        assignment_rank,
        assignment_roles,
        confidence,
        review_required,
        pipeline_version,
        updated_at
    )
    SELECT
        links.school_id,
        schools.school_name,
        units.canonical_complex_id,
        -- Every atom of a complex maps to the same key by construction, so any
        -- one of them answers. A superseded key resolves to its successor:
        -- the old key still exists to redirect, but pages are built on the
        -- canonical one.
        MIN(COALESCE(slug_keys.superseded_by, slug_keys.public_key)),
        jsonb_agg(DISTINCT links.apt_cd ORDER BY links.apt_cd),
        complexes.complex_name,
        complexes.road_address,
        complexes.region,
        complexes.district,
        complexes.latitude,
        complexes.longitude,
        complexes.households,
        complexes.building_count,
        complexes.use_approval_year,
        complexes.parking_total,
        complexes.parking_ground,
        complexes.parking_underground,
        CASE
            WHEN complexes.households > 0 AND complexes.parking_total IS NOT NULL
            THEN ROUND(complexes.parking_total::NUMERIC / complexes.households, 3)
            ELSE NULL
        END,
        complexes.sale_households,
        complexes.rental_units_total,
        complexes.public_rental_units,
        complexes.private_rental_units,
        complexes.public_rental_ratio,
        MIN(links.assignment_rank),
        jsonb_agg(DISTINCT links.assignment_role ORDER BY links.assignment_role),
        CASE MIN(
            CASE units.confidence
                WHEN 'low' THEN 0
                WHEN 'medium' THEN 1
                WHEN 'high' THEN 2
                ELSE -1
            END
        )
            WHEN 0 THEN 'low'
            WHEN 1 THEN 'medium'
            WHEN 2 THEN 'high'
            ELSE 'unknown'
        END,
        BOOL_OR(units.review_required),
        MAX(units.pipeline_version),
        NOW()
    FROM apartment_assignment_schools AS links
    JOIN apartment_assignment_units AS units
      ON units.apt_cd = links.apt_cd
    JOIN school_master AS schools
      ON schools.school_id = links.school_id
    JOIN apartment_complex_master AS complexes
      ON complexes.canonical_complex_id = units.canonical_complex_id
    -- LEFT so a complex whose key has not been issued yet still publishes its
    -- assignment. Losing an apartment from the map would be a worse failure
    -- than it temporarily having no shareable URL; the audit reports the gap.
    LEFT JOIN apartment_public_key_atom AS slug_atoms
      ON slug_atoms.apt_cd = units.apt_cd
    LEFT JOIN apartment_public_key AS slug_keys
      ON slug_keys.public_key = slug_atoms.public_key
    GROUP BY
        links.school_id,
        schools.school_name,
        units.canonical_complex_id,
        complexes.complex_name,
        complexes.road_address,
        complexes.region,
        complexes.district,
        complexes.latitude,
        complexes.longitude,
        complexes.households,
        complexes.building_count,
        complexes.use_approval_year,
        complexes.parking_total,
        complexes.parking_ground,
        complexes.parking_underground,
        complexes.sale_households,
        complexes.rental_units_total,
        complexes.public_rental_units,
        complexes.private_rental_units,
        complexes.public_rental_ratio;

    GET DIAGNOSTICS inserted_rows = ROW_COUNT;
    RETURN inserted_rows;
END;
$$;

REVOKE ALL ON FUNCTION refresh_school_apartment_serving() FROM PUBLIC;
REVOKE ALL ON FUNCTION refresh_school_apartment_serving() FROM anon;
REVOKE ALL ON FUNCTION refresh_school_apartment_serving() FROM authenticated;
GRANT EXECUTE ON FUNCTION refresh_school_apartment_serving() TO service_role;

COMMENT ON FUNCTION refresh_school_apartment_serving() IS
    'Atomically rebuilds frontend serving rows from normalized operational masters, including the public slug each complex is addressed by.';

-- Fill the existing rows now rather than waiting for the next ETL run, so the
-- column is usable immediately and this migration can be verified on its own.
UPDATE school_apartment_serving AS serving
   SET complex_public_key = resolved.public_key
  FROM (
        SELECT units.canonical_complex_id,
               MIN(COALESCE(k.superseded_by, k.public_key)) AS public_key
          FROM apartment_assignment_units AS units
          JOIN apartment_public_key_atom AS a ON a.apt_cd = units.apt_cd
          JOIN apartment_public_key AS k ON k.public_key = a.public_key
         GROUP BY units.canonical_complex_id
       ) AS resolved
 WHERE serving.canonical_complex_id = resolved.canonical_complex_id
   AND serving.complex_public_key IS DISTINCT FROM resolved.public_key;

COMMIT;

-- Verification, run after applying:
--
--   -- Every serving row should carry a key. A non-zero count is a complex with
--   -- no shareable URL; issue keys for it before publishing links.
--   SELECT COUNT(*) AS rows_without_key
--     FROM school_apartment_serving
--    WHERE complex_public_key IS NULL;
--
--   -- One key per complex, and no key shared by two complexes.
--   SELECT COUNT(*) AS complexes_with_many_keys FROM (
--     SELECT canonical_complex_id
--       FROM school_apartment_serving
--      GROUP BY canonical_complex_id
--     HAVING COUNT(DISTINCT complex_public_key) > 1) AS t;
--
--   SELECT COUNT(*) AS keys_shared_by_complexes FROM (
--     SELECT complex_public_key
--       FROM school_apartment_serving
--      WHERE complex_public_key IS NOT NULL
--      GROUP BY complex_public_key
--     HAVING COUNT(DISTINCT canonical_complex_id) > 1) AS t;
--
--   -- A published page must never be built on a superseded key.
--   SELECT COUNT(*) AS serving_rows_on_superseded_keys
--     FROM school_apartment_serving AS s
--     JOIN apartment_public_key AS k ON k.public_key = s.complex_public_key
--    WHERE k.superseded_by IS NOT NULL;
--
-- All four must be 0. Anonymous reads of school_apartment_serving must keep
-- working, and the two registry tables must stay refused.
