-- Frontend serving table: one row per school and canonical apartment complex.
-- The ETL builds these rows locally, avoiding runtime joins in the browser.

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
    public_rental_ratio NUMERIC(6, 3),
    assignment_rank INTEGER NOT NULL DEFAULT 1,
    assignment_roles JSONB NOT NULL DEFAULT '[]'::JSONB,
    confidence TEXT,
    review_required BOOLEAN NOT NULL DEFAULT FALSE,
    pipeline_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (school_id, canonical_complex_id)
);

ALTER TABLE school_apartment_serving
    ADD COLUMN IF NOT EXISTS parking_per_household NUMERIC(6, 3);
ALTER TABLE school_apartment_serving
    ADD COLUMN IF NOT EXISTS parking_ground INTEGER,
    ADD COLUMN IF NOT EXISTS parking_underground INTEGER,
    ADD COLUMN IF NOT EXISTS sale_households INTEGER,
    ADD COLUMN IF NOT EXISTS rental_units_total INTEGER,
    ADD COLUMN IF NOT EXISTS public_rental_units INTEGER,
    ADD COLUMN IF NOT EXISTS private_rental_units INTEGER,
    ADD COLUMN IF NOT EXISTS public_rental_ratio NUMERIC(6, 3);

CREATE INDEX IF NOT EXISTS school_apartment_serving_school_idx
    ON school_apartment_serving (school_id);
CREATE INDEX IF NOT EXISTS school_apartment_serving_complex_idx
    ON school_apartment_serving (canonical_complex_id);
CREATE INDEX IF NOT EXISTS school_apartment_serving_filter_idx
    ON school_apartment_serving (school_id, households, use_approval_year);
CREATE INDEX IF NOT EXISTS school_apartment_serving_query_idx
    ON school_apartment_serving (school_id, households, parking_per_household, use_approval_year, public_rental_ratio);

ALTER TABLE school_apartment_serving ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read school apartment serving" ON school_apartment_serving;
CREATE POLICY "public read school apartment serving"
    ON school_apartment_serving FOR SELECT USING (TRUE);

COMMENT ON TABLE school_apartment_serving IS
    'Denormalized school-to-complex rows for single-query frontend reads.';
