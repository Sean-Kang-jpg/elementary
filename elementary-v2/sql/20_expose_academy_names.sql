-- Expose academy names and public classifications in marker popups.
-- Run after 15. Raw addresses, phone numbers, fees, and course details remain
-- outside the public contract. Safe to rerun.

BEGIN;

ALTER TABLE academy_address_serving
    ADD COLUMN IF NOT EXISTS institutions JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE academy_address_serving
    DROP CONSTRAINT IF EXISTS academy_address_serving_institutions_array;
ALTER TABLE academy_address_serving
    ADD CONSTRAINT academy_address_serving_institutions_array
    CHECK (jsonb_typeof(institutions) = 'array');

COMMENT ON COLUMN academy_address_serving.institutions IS
    'Public academy name, institution type, and realm rows for one address marker. Contact, fee, and raw-address details are excluded.';

-- PostgreSQL cannot replace a function when its TABLE return shape changes.
DROP FUNCTION IF EXISTS nearby_academy_addresses(TEXT, INTEGER);

CREATE FUNCTION nearby_academy_addresses(
    p_canonical_complex_id TEXT,
    p_max_distance_m INTEGER DEFAULT 800
)
RETURNS TABLE (
    address_id TEXT,
    region TEXT,
    district TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    institution_count INTEGER,
    institution_type_counts JSONB,
    realm_counts JSONB,
    institutions JSONB,
    top_subjects TEXT,
    straight_distance_m INTEGER,
    distance_band TEXT,
    distance_origin_type TEXT,
    total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH parameters AS (
        SELECT LEAST(GREATEST(COALESCE(p_max_distance_m, 800), 1), 800)::DOUBLE PRECISION AS radius_m
    ), origins AS (
        SELECT origin.location, origin.distance_origin_type
        FROM public.apartment_academy_origin_points AS origin
        WHERE origin.canonical_complex_id = p_canonical_complex_id
    ), matched AS (
        SELECT
            academy.address_id,
            academy.region,
            academy.district,
            academy.latitude,
            academy.longitude,
            academy.institution_count,
            academy.institution_type_counts,
            academy.realm_counts,
            academy.institutions,
            academy.top_subjects,
            ROUND(MIN(public.ST_Distance(academy.location, origins.location)))::INTEGER AS straight_distance_m,
            MIN(origins.distance_origin_type) AS distance_origin_type
        FROM public.academy_address_serving AS academy
        CROSS JOIN origins
        CROSS JOIN parameters
        WHERE public.ST_DWithin(academy.location, origins.location, parameters.radius_m)
        GROUP BY
            academy.address_id,
            academy.region,
            academy.district,
            academy.latitude,
            academy.longitude,
            academy.institution_count,
            academy.institution_type_counts,
            academy.realm_counts,
            academy.institutions,
            academy.top_subjects
    )
    SELECT
        matched.address_id,
        matched.region,
        matched.district,
        matched.latitude,
        matched.longitude,
        matched.institution_count,
        matched.institution_type_counts,
        matched.realm_counts,
        matched.institutions,
        matched.top_subjects,
        matched.straight_distance_m,
        CASE WHEN matched.straight_distance_m <= 600 THEN 'core' ELSE 'extended' END,
        matched.distance_origin_type,
        COUNT(*) OVER()
    FROM matched
    ORDER BY matched.straight_distance_m, matched.address_id
    LIMIT 600;
$$;

DROP FUNCTION IF EXISTS nearby_academy_addresses_for_school(TEXT, INTEGER);

CREATE FUNCTION nearby_academy_addresses_for_school(
    p_school_id TEXT,
    p_max_distance_m INTEGER DEFAULT 800
)
RETURNS TABLE (
    address_id TEXT,
    region TEXT,
    district TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    institution_count INTEGER,
    institution_type_counts JSONB,
    realm_counts JSONB,
    institutions JSONB,
    top_subjects TEXT,
    straight_distance_m INTEGER,
    distance_band TEXT,
    distance_origin_type TEXT,
    total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH parameters AS (
        SELECT LEAST(GREATEST(COALESCE(p_max_distance_m, 800), 1), 800)::DOUBLE PRECISION AS radius_m
    ), assigned_complexes AS (
        SELECT DISTINCT serving.canonical_complex_id
        FROM public.school_apartment_serving AS serving
        WHERE serving.school_id = p_school_id
    ), origins AS (
        SELECT origin.canonical_complex_id, origin.location, origin.distance_origin_type
        FROM public.apartment_academy_origin_points AS origin
        JOIN assigned_complexes
          ON assigned_complexes.canonical_complex_id = origin.canonical_complex_id
    ), matched AS (
        SELECT
            academy.address_id,
            academy.region,
            academy.district,
            academy.latitude,
            academy.longitude,
            academy.institution_count,
            academy.institution_type_counts,
            academy.realm_counts,
            academy.institutions,
            academy.top_subjects,
            ROUND(MIN(public.ST_Distance(academy.location, origins.location)))::INTEGER AS straight_distance_m,
            CASE
                WHEN BOOL_OR(origins.distance_origin_type = 'nearest_building_centroid')
                THEN 'nearest_building_centroid'
                ELSE 'complex_centroid'
            END AS distance_origin_type
        FROM public.academy_address_serving AS academy
        CROSS JOIN origins
        CROSS JOIN parameters
        WHERE public.ST_DWithin(academy.location, origins.location, parameters.radius_m)
        GROUP BY
            academy.address_id,
            academy.region,
            academy.district,
            academy.latitude,
            academy.longitude,
            academy.institution_count,
            academy.institution_type_counts,
            academy.realm_counts,
            academy.institutions,
            academy.top_subjects
    )
    SELECT
        matched.address_id,
        matched.region,
        matched.district,
        matched.latitude,
        matched.longitude,
        matched.institution_count,
        matched.institution_type_counts,
        matched.realm_counts,
        matched.institutions,
        matched.top_subjects,
        matched.straight_distance_m,
        CASE WHEN matched.straight_distance_m <= 600 THEN 'core' ELSE 'extended' END,
        matched.distance_origin_type,
        COUNT(*) OVER()
    FROM matched
    ORDER BY matched.straight_distance_m, matched.address_id
    LIMIT 1000;
$$;

REVOKE ALL ON FUNCTION nearby_academy_addresses(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION nearby_academy_addresses_for_school(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nearby_academy_addresses(TEXT, INTEGER)
    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION nearby_academy_addresses_for_school(TEXT, INTEGER)
    TO anon, authenticated, service_role;

COMMENT ON FUNCTION nearby_academy_addresses(TEXT, INTEGER) IS
    'Returns academy address aggregates and public academy names near one apartment complex.';
COMMENT ON FUNCTION nearby_academy_addresses_for_school(TEXT, INTEGER) IS
    'Returns deduplicated academy address aggregates and public academy names near apartments assigned to one school.';

COMMIT;

-- Verification after reloading serving rows:
--
--   SELECT COUNT(*) FROM academy_address_serving
--    WHERE institutions = '[]'::JSONB;
--
-- This should be 0 after the academy serving snapshots are rebuilt and
-- uploaded. Anonymous calls to both RPCs must return an `institutions` array.
