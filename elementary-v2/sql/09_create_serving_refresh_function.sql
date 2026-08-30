-- Rebuild frontend serving rows from normalized operational masters.
-- DELETE + INSERT runs in one transaction, so readers keep seeing the previous
-- complete snapshot until the replacement is committed.

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
    'Atomically rebuilds frontend serving rows from normalized operational masters.';
