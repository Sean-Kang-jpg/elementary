-- Academy proximity serving contract. Run after 10.
-- Raw academy rows and road addresses remain private. Public reads expose only
-- address-level aggregates, apartment summaries, and proximity origin points.

CREATE TABLE IF NOT EXISTS academy_address_serving (
    address_id TEXT PRIMARY KEY,
    region TEXT NOT NULL,
    district TEXT,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN 33 AND 39),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN 124 AND 132),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    institution_count INTEGER NOT NULL CHECK (institution_count >= 1),
    institution_type_counts JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(institution_type_counts) = 'object'),
    realm_counts JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(realm_counts) = 'object'),
    top_subjects TEXT,
    source_as_of DATE NOT NULL,
    pipeline_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apartment_academy_origin_points (
    canonical_complex_id TEXT NOT NULL
        REFERENCES apartment_complex_master(canonical_complex_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    origin_sequence INTEGER NOT NULL CHECK (origin_sequence >= 1),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN 33 AND 39),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN 124 AND 132),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    distance_origin_type TEXT NOT NULL
        CHECK (distance_origin_type IN ('nearest_building_centroid', 'complex_centroid')),
    pipeline_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (canonical_complex_id, origin_sequence)
);

CREATE TABLE IF NOT EXISTS apartment_academy_summary (
    canonical_complex_id TEXT PRIMARY KEY
        REFERENCES apartment_complex_master(canonical_complex_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    core_address_count INTEGER NOT NULL CHECK (core_address_count >= 0),
    extended_address_count INTEGER NOT NULL CHECK (extended_address_count >= 0),
    core_institution_count INTEGER NOT NULL CHECK (core_institution_count >= 0),
    extended_institution_count INTEGER NOT NULL CHECK (extended_institution_count >= 0),
    distance_origin_type TEXT NOT NULL
        CHECK (distance_origin_type IN ('nearest_building_centroid', 'complex_centroid')),
    pipeline_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS academy_address_serving_location_idx
    ON academy_address_serving USING GIST (location);
CREATE INDEX IF NOT EXISTS academy_address_serving_region_idx
    ON academy_address_serving (region, district);

CREATE OR REPLACE FUNCTION set_academy_proximity_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::GEOGRAPHY;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS academy_address_serving_location_trigger
    ON academy_address_serving;
CREATE TRIGGER academy_address_serving_location_trigger
    BEFORE INSERT OR UPDATE OF latitude, longitude ON academy_address_serving
    FOR EACH ROW EXECUTE FUNCTION set_academy_proximity_location();

DROP TRIGGER IF EXISTS apartment_academy_origin_location_trigger
    ON apartment_academy_origin_points;
CREATE TRIGGER apartment_academy_origin_location_trigger
    BEFORE INSERT OR UPDATE OF latitude, longitude ON apartment_academy_origin_points
    FOR EACH ROW EXECUTE FUNCTION set_academy_proximity_location();

CREATE OR REPLACE FUNCTION nearby_academy_addresses(
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
    LIMIT 600;
$$;

ALTER TABLE academy_address_serving ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_academy_origin_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_academy_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read academy address serving" ON academy_address_serving;
CREATE POLICY "public read academy address serving"
    ON academy_address_serving FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "public read apartment academy origins" ON apartment_academy_origin_points;
CREATE POLICY "public read apartment academy origins"
    ON apartment_academy_origin_points FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "public read apartment academy summary" ON apartment_academy_summary;
CREATE POLICY "public read apartment academy summary"
    ON apartment_academy_summary FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE ALL ON TABLE academy_address_serving FROM PUBLIC;
REVOKE ALL ON TABLE apartment_academy_origin_points FROM PUBLIC;
REVOKE ALL ON TABLE apartment_academy_summary FROM PUBLIC;
GRANT SELECT ON TABLE academy_address_serving TO anon, authenticated;
GRANT SELECT ON TABLE apartment_academy_origin_points TO anon, authenticated;
GRANT SELECT ON TABLE apartment_academy_summary TO anon, authenticated;
GRANT ALL ON TABLE academy_address_serving TO service_role;
GRANT ALL ON TABLE apartment_academy_origin_points TO service_role;
GRANT ALL ON TABLE apartment_academy_summary TO service_role;

REVOKE ALL ON FUNCTION nearby_academy_addresses(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nearby_academy_addresses(TEXT, INTEGER)
    TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION set_academy_proximity_location() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE academy_address_serving IS
    'Privacy-minimized address-level academy aggregates; excludes raw addresses and institution names.';
COMMENT ON TABLE apartment_academy_origin_points IS
    'Straight-line proximity origins: trusted building centroids for large complexes, otherwise one complex point.';
COMMENT ON TABLE apartment_academy_summary IS
    'Precomputed 0-600 m core and 600-800 m extended academy counts by apartment complex.';
COMMENT ON FUNCTION nearby_academy_addresses(TEXT, INTEGER) IS
    'Returns address-level academy markers within at most 800 m using the approved apartment origin points.';
