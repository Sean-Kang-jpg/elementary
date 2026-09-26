-- School-scoped academy proximity serving contract. Run after 14.
-- A school inherits the union of academy catchments around its assigned
-- apartment complexes. Address aggregates are deduplicated across complexes.

CREATE OR REPLACE FUNCTION nearby_academy_addresses_for_school(
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
        SELECT
            origin.canonical_complex_id,
            origin.location,
            origin.distance_origin_type
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
    'Returns deduplicated academy address aggregates near apartments assigned to one school.';
