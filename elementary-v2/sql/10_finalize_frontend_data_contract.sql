-- Finalize the two-table anonymous frontend read contract.
-- Run after 06 and 07. Rebuild and upload operational outputs afterward.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE apartment_complex_master
    ADD COLUMN IF NOT EXISTS parking_ground INTEGER,
    ADD COLUMN IF NOT EXISTS parking_underground INTEGER,
    ADD COLUMN IF NOT EXISTS sale_households INTEGER,
    ADD COLUMN IF NOT EXISTS rental_units_total INTEGER,
    ADD COLUMN IF NOT EXISTS public_rental_units INTEGER,
    ADD COLUMN IF NOT EXISTS private_rental_units INTEGER,
    ADD COLUMN IF NOT EXISTS public_rental_ratio NUMERIC(6, 3),
    ADD COLUMN IF NOT EXISTS rental_source TEXT;

ALTER TABLE school_apartment_serving
    ADD COLUMN IF NOT EXISTS parking_ground INTEGER,
    ADD COLUMN IF NOT EXISTS parking_underground INTEGER,
    ADD COLUMN IF NOT EXISTS sale_households INTEGER,
    ADD COLUMN IF NOT EXISTS rental_units_total INTEGER,
    ADD COLUMN IF NOT EXISTS public_rental_units INTEGER,
    ADD COLUMN IF NOT EXISTS private_rental_units INTEGER,
    ADD COLUMN IF NOT EXISTS public_rental_ratio NUMERIC(6, 3);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'apartment_complex_public_rental_ratio_check'
    ) THEN
        ALTER TABLE apartment_complex_master
            ADD CONSTRAINT apartment_complex_public_rental_ratio_check
            CHECK (public_rental_ratio BETWEEN 0 AND 100);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'school_apartment_serving_public_rental_ratio_check'
    ) THEN
        ALTER TABLE school_apartment_serving
            ADD CONSTRAINT school_apartment_serving_public_rental_ratio_check
            CHECK (public_rental_ratio BETWEEN 0 AND 100);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS school_master_name_trgm_idx
    ON school_master USING GIN (school_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS school_master_viewport_idx
    ON school_master (latitude, longitude);
CREATE INDEX IF NOT EXISTS school_apartment_serving_query_idx
    ON school_apartment_serving (
        school_id,
        households,
        parking_per_household,
        use_approval_year,
        public_rental_ratio
    );

-- The browser reads only these two denormalized contracts.
ALTER TABLE school_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_apartment_serving ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read school master" ON school_master;
CREATE POLICY "public read school master"
    ON school_master FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "public read school apartment serving" ON school_apartment_serving;
CREATE POLICY "public read school apartment serving"
    ON school_apartment_serving FOR SELECT USING (TRUE);

-- Normalized masters and assignment links remain available to service_role only.
DROP POLICY IF EXISTS "public read apartment complex master" ON apartment_complex_master;
DROP POLICY IF EXISTS "public read apartment assignment units" ON apartment_assignment_units;
DROP POLICY IF EXISTS "public read apartment assignment schools" ON apartment_assignment_schools;

COMMENT ON TABLE school_apartment_serving IS
    'Two-table frontend contract: denormalized school-to-complex rows with filter fields.';
