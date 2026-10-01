-- Keep school-scoped education-facility lookup within the API statement timeout.
--
-- The previous function joined every serving address to every origin before
-- applying ST_DWithin. As nationwide sports facilities increased the serving
-- table, PostgreSQL could choose a plan that timed out for schools assigned to
-- many apartment origins. LATERAL makes each origin drive an indexed GiST
-- lookup on academy_address_serving.location, then deduplicates addresses.
-- Run after 20. Safe to rerun.

BEGIN;

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
    ), origins AS MATERIALIZED (
        SELECT origin.location, origin.distance_origin_type
        FROM public.apartment_academy_origin_points AS origin
        JOIN assigned_complexes
          ON assigned_complexes.canonical_complex_id = origin.canonical_complex_id
    ), candidates AS (
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
            public.ST_Distance(academy.location, origins.location) AS distance_m,
            origins.distance_origin_type
        FROM origins
        CROSS JOIN parameters
        CROSS JOIN LATERAL (
            SELECT serving.*
            FROM public.academy_address_serving AS serving
            WHERE public.ST_DWithin(serving.location, origins.location, parameters.radius_m)
        ) AS academy
    ), matched AS (
        SELECT
            candidates.address_id,
            candidates.region,
            candidates.district,
            candidates.latitude,
            candidates.longitude,
            candidates.institution_count,
            candidates.institution_type_counts,
            candidates.realm_counts,
            candidates.institutions,
            candidates.top_subjects,
            ROUND(MIN(candidates.distance_m))::INTEGER AS straight_distance_m,
            CASE
                WHEN BOOL_OR(candidates.distance_origin_type = 'nearest_building_centroid')
                THEN 'nearest_building_centroid'
                ELSE 'complex_centroid'
            END AS distance_origin_type
        FROM candidates
        GROUP BY
            candidates.address_id,
            candidates.region,
            candidates.district,
            candidates.latitude,
            candidates.longitude,
            candidates.institution_count,
            candidates.institution_type_counts,
            candidates.realm_counts,
            candidates.institutions,
            candidates.top_subjects
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

REVOKE ALL ON FUNCTION nearby_academy_addresses_for_school(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nearby_academy_addresses_for_school(TEXT, INTEGER)
    TO anon, authenticated, service_role;

COMMENT ON FUNCTION nearby_academy_addresses_for_school(TEXT, INTEGER) IS
    'Returns deduplicated education-facility addresses near a school apartment catchment, using per-origin indexed spatial lookups.';

COMMIT;

-- Verification after applying:
--
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM nearby_academy_addresses_for_school('B000005134', 800);
--
-- The plan should use academy_address_serving_location_idx and complete below
-- the API statement timeout. Also call the RPC as anon for a school with many
-- assigned complexes before resuming regional uploads.
