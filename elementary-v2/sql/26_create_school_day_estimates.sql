-- "초1 하루 예상" card serving contract (A2-R03). Applied to production 2026-10-08; see EXECUTION_GUIDE.
-- Run after 06 (school_master). Safe to rerun. Changes no existing table, function or grant.
--
-- Three public tables, loaded only by etl/load_school_day_estimates.py from reviewed files:
--   school_day_estimates          per-school grade-1 clock used for the estimate
--   school_day_estimate_weekdays  Mon-Fri: grade-1 periods and the estimated end of the school day
--   school_care_hours             term-time school care hours as written in the 15-라 plan
-- Every row is a previous-school-year figure shown to next year's entrants as an estimate.
-- Only reviewed rows are loaded; a weekday or school the review could not settle is stored as
-- `school_check_needed` (shown as 학교 확인 필요), never filled in.

BEGIN;

CREATE TABLE IF NOT EXISTS school_day_estimates (
    school_id TEXT PRIMARY KEY
        REFERENCES school_master(school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    source_year INTEGER NOT NULL CHECK (source_year BETWEEN 2000 AND 2100),
    applies_to_entry_year INTEGER NOT NULL CHECK (applies_to_entry_year > source_year),
    -- after_p4: a 4-period day ends after lunch; before_p4: grade 1 eats first and leaves after 4교시
    lunch_position TEXT NOT NULL CHECK (lunch_position IN ('after_p4', 'before_p4')),
    p4_end TIME,
    lunch_start TIME,
    lunch_end TIME,
    p5_end TIME,
    p5_end_inferred BOOLEAN NOT NULL DEFAULT FALSE,
    clock_source TEXT NOT NULL,
    periods_source TEXT NOT NULL,
    reviewed_on DATE NOT NULL,
    snapshot_date DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (lunch_start IS NULL OR lunch_end IS NULL OR lunch_start < lunch_end)
);

CREATE TABLE IF NOT EXISTS school_day_estimate_weekdays (
    school_id TEXT NOT NULL
        REFERENCES school_day_estimates(school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 5),  -- 1 = Monday
    periods SMALLINT CHECK (periods BETWEEN 1 AND 7),
    dismissal TIME,
    -- inferred: the time is derived (e.g. 5교시 inside a block) and carries 추정
    -- school_check_needed: the sources do not settle this day
    note TEXT CHECK (note IN ('inferred', 'school_check_needed')),
    PRIMARY KEY (school_id, weekday),
    CHECK (dismissal IS NOT NULL OR note = 'school_check_needed'),
    CHECK (note IS DISTINCT FROM 'school_check_needed' OR dismissal IS NULL)
);

CREATE TABLE IF NOT EXISTS school_care_hours (
    school_id TEXT PRIMARY KEY
        REFERENCES school_master(school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    source_year INTEGER NOT NULL CHECK (source_year BETWEEN 2000 AND 2100),
    status TEXT NOT NULL CHECK (status IN ('stated', 'school_check_needed')),
    afternoon_end TIME,              -- basic term-time afternoon care
    extended_end TIME,               -- evening / extension class, when offered
    extended_condition TEXT,         -- e.g. '희망자 있을 시', shown next to extended_end
    morning_hours TEXT,              -- as written, e.g. '07:40-08:40'
    grades TEXT,                     -- as written, e.g. '1~2'
    source TEXT NOT NULL,
    reviewed_on DATE NOT NULL,
    snapshot_date DATE NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status = 'school_check_needed' OR afternoon_end IS NOT NULL),
    CHECK (status = 'stated' OR (afternoon_end IS NULL AND extended_end IS NULL)),
    CHECK (extended_end IS NULL OR afternoon_end IS NULL OR extended_end > afternoon_end)
);

ALTER TABLE school_day_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_day_estimate_weekdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_care_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read school day estimates" ON school_day_estimates;
CREATE POLICY "public read school day estimates"
    ON school_day_estimates FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "public read school day estimate weekdays" ON school_day_estimate_weekdays;
CREATE POLICY "public read school day estimate weekdays"
    ON school_day_estimate_weekdays FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS "public read school care hours" ON school_care_hours;
CREATE POLICY "public read school care hours"
    ON school_care_hours FOR SELECT TO anon, authenticated USING (TRUE);

REVOKE ALL ON TABLE school_day_estimates FROM PUBLIC;
REVOKE ALL ON TABLE school_day_estimate_weekdays FROM PUBLIC;
REVOKE ALL ON TABLE school_care_hours FROM PUBLIC;
-- Revoke first: Supabase's default privileges grant write access to anon/authenticated on new tables.
REVOKE ALL ON TABLE school_day_estimates FROM anon, authenticated;
REVOKE ALL ON TABLE school_day_estimate_weekdays FROM anon, authenticated;
REVOKE ALL ON TABLE school_care_hours FROM anon, authenticated;
GRANT SELECT ON TABLE school_day_estimates TO anon, authenticated;
GRANT SELECT ON TABLE school_day_estimate_weekdays TO anon, authenticated;
GRANT SELECT ON TABLE school_care_hours TO anon, authenticated;
GRANT ALL ON TABLE school_day_estimates TO service_role;
GRANT ALL ON TABLE school_day_estimate_weekdays TO service_role;
GRANT ALL ON TABLE school_care_hours TO service_role;

COMMENT ON TABLE school_day_estimates IS
    'Grade-1 school-day clock from a reviewed 학교알리미 2-가 plan; previous-year estimate for next entrants.';
COMMENT ON TABLE school_day_estimate_weekdays IS
    'Grade-1 periods (NEIS) and estimated end of day per weekday; note marks inferred or unsettled days.';
COMMENT ON TABLE school_care_hours IS
    'Term-time school care hours from a reviewed 학교알리미 15-라 plan; admission is limited and selective.';

COMMIT;

-- Verify after applying (anon key):
--   GET /rest/v1/school_day_estimate_weekdays?school_id=eq.B000003741&order=weekday  -> 5 rows
--   POST /rest/v1/school_care_hours (anon)                                           -> 401/403, never 201
