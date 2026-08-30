-- Operational ETL v1 tables. Non-destructive: legacy tables remain untouched.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS school_master (
    school_id TEXT PRIMARY KEY,
    schoolinfo_code TEXT UNIQUE,
    school_name TEXT NOT NULL,
    school_type TEXT,
    establishment_date DATE,
    establishment_type TEXT,
    campus_type TEXT,
    operation_status TEXT,
    road_address TEXT,
    legal_address TEXT,
    region TEXT NOT NULL,
    education_office TEXT,
    education_support_office TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location GEOGRAPHY(POINT, 4326),
    grade1_students INTEGER,
    grade2_students INTEGER,
    grade3_students INTEGER,
    grade4_students INTEGER,
    grade5_students INTEGER,
    grade6_students INTEGER,
    grade1_classes INTEGER,
    grade2_classes INTEGER,
    grade3_classes INTEGER,
    grade4_classes INTEGER,
    grade5_classes INTEGER,
    grade6_classes INTEGER,
    grade1_per_class NUMERIC(5, 1),
    grade2_per_class NUMERIC(5, 1),
    grade3_per_class NUMERIC(5, 1),
    grade4_per_class NUMERIC(5, 1),
    grade5_per_class NUMERIC(5, 1),
    grade6_per_class NUMERIC(5, 1),
    grade1_6_students_sum INTEGER,
    other_students INTEGER,
    total_students INTEGER,
    teachers INTEGER,
    student_statistics_year INTEGER,
    student_data_status TEXT,
    student_data_source TEXT,
    reference_date DATE,
    homepage TEXT,
    phone TEXT,
    pipeline_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apartment_complex_master (
    canonical_complex_id TEXT PRIMARY KEY,
    kapt_code TEXT,
    complex_name TEXT NOT NULL,
    name_source TEXT NOT NULL,
    road_address TEXT,
    legal_address TEXT,
    region TEXT NOT NULL,
    district TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location GEOGRAPHY(POINT, 4326),
    households INTEGER,
    households_source TEXT,
    building_count INTEGER,
    building_count_source TEXT,
    use_approval_year INTEGER,
    use_approval_year_source TEXT,
    parking_total INTEGER,
    parking_ground INTEGER,
    parking_underground INTEGER,
    parking_source TEXT,
    sale_households INTEGER,
    rental_units_total INTEGER,
    public_rental_units INTEGER,
    private_rental_units INTEGER,
    public_rental_ratio NUMERIC(6, 3) CHECK (public_rental_ratio BETWEEN 0 AND 100),
    rental_source TEXT,
    component_count INTEGER NOT NULL DEFAULT 1,
    component_apt_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
    group_type TEXT NOT NULL,
    review_required BOOLEAN NOT NULL DEFAULT FALSE,
    source_as_of DATE,
    pipeline_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT apartment_complex_region_check CHECK (region IN ('서울특별시', '경기도', '인천광역시'))
);

CREATE TABLE IF NOT EXISTS apartment_assignment_units (
    apt_cd TEXT PRIMARY KEY,
    canonical_complex_id TEXT NOT NULL REFERENCES apartment_complex_master(canonical_complex_id) ON UPDATE CASCADE,
    apt_name TEXT NOT NULL,
    road_address TEXT,
    region TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location GEOGRAPHY(POINT, 4326),
    hakgudo_id TEXT,
    hakgudo_name TEXT,
    school_id TEXT REFERENCES school_master(school_id) ON UPDATE CASCADE,
    education_office TEXT,
    assignment_method TEXT NOT NULL,
    confidence TEXT NOT NULL,
    review_required BOOLEAN NOT NULL DEFAULT FALSE,
    review_reason TEXT,
    hakgudo_reference_date DATE NOT NULL,
    pipeline_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT apartment_assignment_region_check CHECK (region IN ('서울특별시', '경기도', '인천광역시'))
);

CREATE TABLE IF NOT EXISTS apartment_assignment_schools (
    apt_cd TEXT NOT NULL REFERENCES apartment_assignment_units(apt_cd) ON UPDATE CASCADE ON DELETE CASCADE,
    school_id TEXT NOT NULL REFERENCES school_master(school_id) ON UPDATE CASCADE,
    assignment_rank INTEGER NOT NULL DEFAULT 1,
    assignment_role TEXT NOT NULL,
    match_method TEXT NOT NULL,
    pipeline_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (apt_cd, school_id)
);

CREATE TABLE IF NOT EXISTS school_apartment_serving (
    school_id TEXT NOT NULL REFERENCES school_master(school_id) ON UPDATE CASCADE ON DELETE CASCADE,
    school_name TEXT NOT NULL,
    canonical_complex_id TEXT NOT NULL REFERENCES apartment_complex_master(canonical_complex_id) ON UPDATE CASCADE ON DELETE CASCADE,
    apt_cd_list JSONB NOT NULL DEFAULT '[]'::JSONB,
    complex_name TEXT NOT NULL,
    road_address TEXT,
    region TEXT NOT NULL,
    district TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    households INTEGER,
    building_count INTEGER,
    use_approval_year INTEGER,
    parking_total INTEGER,
    parking_ground INTEGER,
    parking_underground INTEGER,
    parking_per_household NUMERIC(6, 3),
    sale_households INTEGER,
    rental_units_total INTEGER,
    public_rental_units INTEGER,
    private_rental_units INTEGER,
    public_rental_ratio NUMERIC(6, 3) CHECK (public_rental_ratio BETWEEN 0 AND 100),
    assignment_rank INTEGER NOT NULL DEFAULT 1,
    assignment_roles JSONB NOT NULL DEFAULT '[]'::JSONB,
    confidence TEXT,
    review_required BOOLEAN NOT NULL DEFAULT FALSE,
    pipeline_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (school_id, canonical_complex_id)
);

CREATE TABLE IF NOT EXISTS apartment_name_history (
    apt_cd TEXT NOT NULL REFERENCES apartment_assignment_units(apt_cd) ON UPDATE CASCADE ON DELETE CASCADE,
    canonical_complex_id TEXT NOT NULL REFERENCES apartment_complex_master(canonical_complex_id) ON UPDATE CASCADE ON DELETE CASCADE,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    observed_as_of DATE NOT NULL,
    name_role TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (apt_cd, source, observed_as_of, name)
);

CREATE TABLE IF NOT EXISTS apartment_property_history (
    apt_cd TEXT NOT NULL REFERENCES apartment_assignment_units(apt_cd) ON UPDATE CASCADE ON DELETE CASCADE,
    canonical_complex_id TEXT NOT NULL REFERENCES apartment_complex_master(canonical_complex_id) ON UPDATE CASCADE ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    base_value TEXT,
    base_as_of DATE,
    latest_observed_value TEXT,
    latest_observed_as_of DATE,
    canonical_value TEXT,
    resolution TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (apt_cd, field_name, latest_observed_as_of)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apartment_name_history_apt_cd_fkey') THEN
        ALTER TABLE apartment_name_history ADD CONSTRAINT apartment_name_history_apt_cd_fkey
            FOREIGN KEY (apt_cd) REFERENCES apartment_assignment_units(apt_cd) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apartment_name_history_canonical_complex_id_fkey') THEN
        ALTER TABLE apartment_name_history ADD CONSTRAINT apartment_name_history_canonical_complex_id_fkey
            FOREIGN KEY (canonical_complex_id) REFERENCES apartment_complex_master(canonical_complex_id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apartment_property_history_apt_cd_fkey') THEN
        ALTER TABLE apartment_property_history ADD CONSTRAINT apartment_property_history_apt_cd_fkey
            FOREIGN KEY (apt_cd) REFERENCES apartment_assignment_units(apt_cd) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apartment_property_history_canonical_complex_id_fkey') THEN
        ALTER TABLE apartment_property_history ADD CONSTRAINT apartment_property_history_canonical_complex_id_fkey
            FOREIGN KEY (canonical_complex_id) REFERENCES apartment_complex_master(canonical_complex_id) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS etl_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_name TEXT NOT NULL,
    pipeline_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    source_as_of JSONB NOT NULL DEFAULT '{}'::JSONB,
    row_counts JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_summary JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION set_master_location_and_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::GEOGRAPHY;
    ELSE
        NEW.location = NULL;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS school_master_location_trigger ON school_master;
CREATE TRIGGER school_master_location_trigger
    BEFORE INSERT OR UPDATE ON school_master
    FOR EACH ROW EXECUTE FUNCTION set_master_location_and_timestamp();

DROP TRIGGER IF EXISTS apartment_complex_location_trigger ON apartment_complex_master;
CREATE TRIGGER apartment_complex_location_trigger
    BEFORE INSERT OR UPDATE ON apartment_complex_master
    FOR EACH ROW EXECUTE FUNCTION set_master_location_and_timestamp();

DROP TRIGGER IF EXISTS apartment_assignment_location_trigger ON apartment_assignment_units;
CREATE TRIGGER apartment_assignment_location_trigger
    BEFORE INSERT OR UPDATE ON apartment_assignment_units
    FOR EACH ROW EXECUTE FUNCTION set_master_location_and_timestamp();

CREATE INDEX IF NOT EXISTS school_master_location_idx ON school_master USING GIST (location);
CREATE INDEX IF NOT EXISTS school_master_name_idx ON school_master (school_name);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS school_master_name_trgm_idx ON school_master USING GIN (school_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS school_master_viewport_idx ON school_master (latitude, longitude);
CREATE INDEX IF NOT EXISTS school_master_region_grade1_idx ON school_master (region, grade1_students);
CREATE INDEX IF NOT EXISTS apartment_complex_location_idx ON apartment_complex_master USING GIST (location);
CREATE INDEX IF NOT EXISTS apartment_complex_kapt_idx ON apartment_complex_master (kapt_code);
CREATE INDEX IF NOT EXISTS apartment_complex_review_idx ON apartment_complex_master (review_required) WHERE review_required;
CREATE INDEX IF NOT EXISTS apartment_assignment_location_idx ON apartment_assignment_units USING GIST (location);
CREATE INDEX IF NOT EXISTS apartment_assignment_hakgudo_idx ON apartment_assignment_units (hakgudo_id);
CREATE INDEX IF NOT EXISTS apartment_assignment_school_idx ON apartment_assignment_units (school_id);
CREATE INDEX IF NOT EXISTS apartment_assignment_review_idx ON apartment_assignment_units (review_required) WHERE review_required;
CREATE INDEX IF NOT EXISTS apartment_assignment_schools_school_idx ON apartment_assignment_schools (school_id);
CREATE INDEX IF NOT EXISTS school_apartment_serving_school_idx ON school_apartment_serving (school_id);
CREATE INDEX IF NOT EXISTS school_apartment_serving_complex_idx ON school_apartment_serving (canonical_complex_id);
CREATE INDEX IF NOT EXISTS school_apartment_serving_filter_idx ON school_apartment_serving (school_id, households, use_approval_year);
CREATE INDEX IF NOT EXISTS school_apartment_serving_query_idx
    ON school_apartment_serving (school_id, households, parking_per_household, use_approval_year, public_rental_ratio);
CREATE INDEX IF NOT EXISTS apartment_name_history_complex_idx ON apartment_name_history (canonical_complex_id);
CREATE INDEX IF NOT EXISTS apartment_property_history_complex_idx ON apartment_property_history (canonical_complex_id);

ALTER TABLE school_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_complex_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_assignment_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_assignment_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_apartment_serving ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_name_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_property_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE etl_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read school master" ON school_master;
CREATE POLICY "public read school master" ON school_master FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "public read apartment complex master" ON apartment_complex_master;
DROP POLICY IF EXISTS "public read apartment assignment units" ON apartment_assignment_units;
DROP POLICY IF EXISTS "public read apartment assignment schools" ON apartment_assignment_schools;
DROP POLICY IF EXISTS "public read school apartment serving" ON school_apartment_serving;
CREATE POLICY "public read school apartment serving" ON school_apartment_serving FOR SELECT USING (TRUE);

COMMENT ON TABLE school_master IS 'Official 2026 capital-region elementary school master.';
COMMENT ON TABLE apartment_complex_master IS 'K-apt-first management-complex master with apt source fallback.';
COMMENT ON TABLE apartment_assignment_units IS 'apt_cd-level official hakgudo assignment units.';
COMMENT ON TABLE apartment_assignment_schools IS 'N:N school links for single and shared elementary school zones.';
COMMENT ON TABLE school_apartment_serving IS 'Denormalized school-to-complex rows for single-query frontend reads.';
