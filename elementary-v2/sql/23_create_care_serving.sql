-- Care serving contract. Run after 14 (reuses set_academy_proximity_location()).
-- Two public tables and one function:
--   school_care_statistics  per-school after-school and care-classroom disclosure
--                           (Schoolinfo apiType=59). No applicant or waitlist counts
--                           exist in the disclosure, so none are stored.
--   care_centers            community care centers (다함께돌봄센터, incl. Seoul's
--                           우리동네키움센터) with only the fields the operator's own
--                           public center page shows: capacity, term/vacation hours,
--                           address, phone. Staff names and e-mails are never loaded.
--   nearby_care_centers()   straight-line proximity from a point.
-- Loaded by etl/collect_care_data.py. Safe to rerun.

CREATE TABLE IF NOT EXISTS school_care_statistics (
    school_id TEXT PRIMARY KEY
        REFERENCES school_master(school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    statistics_year INTEGER NOT NULL CHECK (statistics_year BETWEEN 2000 AND 2100),
    afternoon_care_rooms INTEGER CHECK (afternoon_care_rooms >= 0),
    afternoon_care_students INTEGER CHECK (afternoon_care_students >= 0),
    evening_care_rooms INTEGER CHECK (evening_care_rooms >= 0),
    evening_care_students INTEGER CHECK (evening_care_students >= 0),
    linked_care_rooms INTEGER CHECK (linked_care_rooms >= 0),
    linked_care_students INTEGER CHECK (linked_care_students >= 0),
    afterschool_aptitude_programs INTEGER CHECK (afterschool_aptitude_programs >= 0),
    afterschool_curriculum_programs INTEGER CHECK (afterschool_curriculum_programs >= 0),
    afterschool_participants INTEGER CHECK (afterschool_participants >= 0),
    snapshot_date DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS care_centers (
    center_id TEXT PRIMARY KEY,
    center_kind TEXT NOT NULL CHECK (center_kind IN ('다함께돌봄센터', '우리동네키움센터')),
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    district TEXT,
    address TEXT NOT NULL,
    address_detail TEXT,
    phone TEXT,
    capacity INTEGER CHECK (capacity >= 0),
    term_hours TEXT CHECK (term_hours IS NULL OR term_hours ~ '^\d{2}:\d{2}~\d{2}:\d{2}$'),
    vacation_hours TEXT CHECK (vacation_hours IS NULL OR vacation_hours ~ '^\d{2}:\d{2}~\d{2}:\d{2}$'),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN 33 AND 39),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN 124 AND 132),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    source_updated_on DATE,
    snapshot_date DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS care_centers_location_idx ON care_centers USING GIST (location);

DROP TRIGGER IF EXISTS care_centers_location_trigger ON care_centers;
CREATE TRIGGER care_centers_location_trigger
    BEFORE INSERT OR UPDATE OF latitude, longitude ON care_centers
    FOR EACH ROW EXECUTE FUNCTION set_academy_proximity_location();

CREATE OR REPLACE FUNCTION nearby_care_centers(
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_max_distance_m INTEGER DEFAULT 1000
)
RETURNS TABLE (
    center_id TEXT,
    center_kind TEXT,
    name TEXT,
    address TEXT,
    address_detail TEXT,
    phone TEXT,
    capacity INTEGER,
    term_hours TEXT,
    vacation_hours TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    source_updated_on DATE,
    straight_distance_m INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH origin AS (
        SELECT
            public.ST_SetSRID(public.ST_MakePoint(p_longitude, p_latitude), 4326)::public.GEOGRAPHY AS location,
            LEAST(GREATEST(COALESCE(p_max_distance_m, 1000), 1), 2000)::DOUBLE PRECISION AS radius_m
    )
    SELECT
        center.center_id,
        center.center_kind,
        center.name,
        center.address,
        center.address_detail,
        center.phone,
        center.capacity,
        center.term_hours,
        center.vacation_hours,
        center.latitude,
        center.longitude,
        center.source_updated_on,
        ROUND(public.ST_Distance(center.location, origin.location))::INTEGER
    FROM public.care_centers AS center
    CROSS JOIN origin
    WHERE public.ST_DWithin(center.location, origin.location, origin.radius_m)
    ORDER BY 13, center.center_id
    LIMIT 30;
$$;

ALTER TABLE school_care_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read school care statistics" ON school_care_statistics;
CREATE POLICY "public read school care statistics"
    ON school_care_statistics FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "public read care centers" ON care_centers;
CREATE POLICY "public read care centers"
    ON care_centers FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE ALL ON TABLE school_care_statistics FROM PUBLIC;
REVOKE ALL ON TABLE care_centers FROM PUBLIC;
GRANT SELECT ON TABLE school_care_statistics TO anon, authenticated;
GRANT SELECT ON TABLE care_centers TO anon, authenticated;
GRANT ALL ON TABLE school_care_statistics TO service_role;
GRANT ALL ON TABLE care_centers TO service_role;

REVOKE ALL ON FUNCTION nearby_care_centers(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nearby_care_centers(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER)
    TO anon, authenticated, service_role;

COMMENT ON TABLE school_care_statistics IS
    'Schoolinfo apiType=59 after-school and care-classroom disclosure per school; no applicant or waitlist counts.';
COMMENT ON COLUMN school_care_statistics.statistics_year IS
    'Schoolinfo publication year (pbanYr), not necessarily the school year the figures describe.';
COMMENT ON TABLE care_centers IS
    'Community care centers from the 다함께돌봄 support-team center list; only fields its public center page shows.';
COMMENT ON COLUMN care_centers.source_updated_on IS
    'When the center last edited its own entry; entries are self-reported and age unevenly.';
COMMENT ON FUNCTION nearby_care_centers(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) IS
    'Care centers within at most 2,000 m of a point, nearest first, at most 30.';
