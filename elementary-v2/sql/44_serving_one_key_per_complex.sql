-- One public key per complex in serving, whichever school a row is for.
-- 2026-11-14. Apply in the SQL editor, alone, after SQL 41 (and 43).
--
-- SQL 41 took the key as MIN over the atoms of each (school, complex) row,
-- assuming every atom of a complex maps to the same key. It does not when a
-- complex merges atoms that were published separately and those atoms sit in
-- different school zones. Measured 2026-11-12, one complex in serving:
-- 신반포 한신 25,26,27차 (KAPT:A13790716) is three atoms with three keys issued
-- 2026-09-29. 25차 and 27차 are in 서울신동초's zone, 26차 in 서울반원초's, so
-- serving carried two rows with two keys - 0WZRPQNR (신동초) and KSQMMEG4
-- (반원초) - and each address showed only one of the two schools.
--
-- The key is now MIN over all of the complex's published rows. For a complex
-- whose rows already shared one key, MIN of equal values is that value, so no
-- other complex's address changes. KSQMMEG4 leaves serving and
-- resolve_apartment_public_key (SQL 43) answers it as moved -> 0WZRPQNR (301);
-- the 0WZRPQNR page shows both schools, like the 26 complexes that already
-- have two rank-1 schools under one key.
--
-- The issuer (etl/issue_apartment_public_keys.py) ranks a merge's candidates by
-- atoms covered, then issue date, then key; for this complex that is also
-- 0WZRPQNR. Serving keeps MIN rather than the issuer's ranking, because
-- switching rules could move the canonical key of other merged complexes.
--
-- The function body is SQL 41's with only the key changed; CREATE OR REPLACE
-- resets settings, so SQL 40's statement_timeout is restated.
--
-- Apply, then either run the full refresh (DELETE + INSERT of every row) or
-- leave it to the next monthly ETL and fix the one row now:
--   UPDATE school_apartment_serving SET complex_public_key = '0WZRPQNR'
--    WHERE canonical_complex_id = 'KAPT:A13790716';   -- 1 row (the 반원초 row)
--
-- Verify:
--   SELECT canonical_complex_id FROM school_apartment_serving
--    GROUP BY 1 HAVING COUNT(DISTINCT complex_public_key) > 1;   -- 0 rows
--   SELECT proconfig FROM pg_proc WHERE proname = 'refresh_school_apartment_serving';
--   -- {search_path=public, pg_temp,statement_timeout=5min}
--   anon: POST /rest/v1/rpc/resolve_apartment_public_key {"p_key":"KSQMMEG4"} -> moved, 0WZRPQNR
-- Rollback: re-run SQL 41.
--
-- Applied 2026-11-15 and serving rebuilt with the function (48,918 rows), then
-- reclaimed with SQL 42. The rebuild read the masters, which carry 신반포 한신's
-- three buildings as three APT: complexes, so 0WZRPQNR (25차), 1CY9KJAG (27차)
-- and KSQMMEG4 (26차) are each served under their own key and no complex has two
-- keys. The one-row UPDATE above was not used.

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
    -- One key per complex, not per school row (SQL 44). The MIN is taken over
    -- exactly the rows the insert below publishes, so a complex whose rows all
    -- carried the same key keeps it.
    WITH complex_keys AS (
        SELECT
            units.canonical_complex_id,
            MIN(COALESCE(slug_keys.superseded_by, slug_keys.public_key)) AS public_key
        FROM apartment_assignment_schools AS links
        JOIN apartment_assignment_units AS units
          ON units.apt_cd = links.apt_cd
        JOIN school_master AS schools
          ON schools.school_id = links.school_id
        JOIN apartment_complex_master AS complexes
          ON complexes.canonical_complex_id = units.canonical_complex_id
        JOIN apartment_public_key_atom AS slug_atoms
          ON slug_atoms.apt_cd = units.apt_cd
        JOIN apartment_public_key AS slug_keys
          ON slug_keys.public_key = slug_atoms.public_key
        WHERE links.assignment_role <> 'optional_one_way'
        GROUP BY units.canonical_complex_id
    )
    SELECT
        links.school_id,
        schools.school_name,
        units.canonical_complex_id,
        -- The complex's key, whichever school this row is for. A superseded
        -- key resolves to its successor (complex_keys above).
        complex_keys.public_key,
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
    LEFT JOIN complex_keys
      ON complex_keys.canonical_complex_id = units.canonical_complex_id
    -- Optional one-way choices stay in the assignment tables but are not an
    -- assignment, the same rule build_school_apartment_serving() applies.
    WHERE links.assignment_role <> 'optional_one_way'
    GROUP BY
        links.school_id,
        schools.school_name,
        units.canonical_complex_id,
        complex_keys.public_key,
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
    'Atomically rebuilds frontend serving rows from normalized operational masters, including the one public slug each complex is addressed by, the same on every school row. Optional one-way choices are not published.';

COMMIT;
