-- Serving publishes only assignments, not optional one-way choices.
-- 2026-11-04. Apply in the SQL editor, alone, after SQL 40.
--
-- build_school_apartment_serving() (etl/build_operational_masters.py) has always
-- left `optional_one_way` links out of serving: they answer "may also choose",
-- not "is assigned to". refresh_school_apartment_serving() (SQL 19) never did.
-- Until 2026-11 the non-capital regions' serving was uploaded from the build, so
-- the function's version never reached them. The 2026-11-03/04 monthly applies
-- (runs 41725400085, 41725625956) rebuilt every region with the function:
-- serving went 48,189 -> 61,437 rows, 경상북도 3,057 -> 10,332, and 556 경북
-- apartments showed six or more assigned schools. The capital check then
-- stopped both runs on its 40 one-way pairs (21,267 != 21,227).
--
-- CREATE OR REPLACE resets the function's settings, so SQL 40's
-- statement_timeout is restated here.
--
-- Verify:
--   SELECT refresh_school_apartment_serving();        -- 48,525 rows on 2026-11-04 (was 61,437)
--   SELECT COUNT(*) FROM school_apartment_serving
--    WHERE assignment_roles ? 'optional_one_way'
--      AND jsonb_array_length(assignment_roles) = 1;   -- 0
--   SELECT proconfig FROM pg_proc WHERE proname = 'refresh_school_apartment_serving';
--   -- {search_path=public, pg_temp,statement_timeout=5min}
-- Rollback: re-run the function body from SQL 19, then SQL 40.

BEGIN;

CREATE OR REPLACE FUNCTION refresh_school_apartment_serving()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
-- Kept from SQL 40: a nationwide rebuild outlasts the role default.
SET statement_timeout = '5min'
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
    -- Optional one-way choices stay in the assignment tables but are not an
    -- assignment, the same rule build_school_apartment_serving() applies.
    WHERE links.assignment_role <> 'optional_one_way'
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
    'Atomically rebuilds frontend serving rows from normalized operational masters, including the public slug each complex is addressed by. Optional one-way choices are not published.';

COMMIT;
