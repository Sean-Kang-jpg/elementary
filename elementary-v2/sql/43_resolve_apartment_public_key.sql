-- What a public apartment key points at when serving has no row for it.
--
-- Serving carries one key per complex. Two kinds of published keys are not in it
-- (measured 2026-11-11, 40 of 46,650):
--   * 7 keys whose atoms were merged into a complex published under another key
--     (ADR-007: a merge supersedes nothing). The old address should go to the
--     new one, not to an empty map.
--   * 33 keys of complexes with no school link at all (new or rebuilt complexes
--     whose buildings did not match the 학구도 data). Their pages should say the
--     assignment is not ready yet, instead of showing nothing.
--
-- The key tables stay private (SQL 18). This answers for one key at a time and
-- returns only what a detail page shows anyway: the current key, or the
-- complex's name, address and position.
--
--   status = 'served'   the key is in serving; nothing else is returned
--   status = 'moved'    current_key is the key serving uses for these atoms now
--   status = 'pending'  no school assignment yet; name, address and position
--   no row              the key was never issued
--
-- Same contract shape as 13-15 and 22. The frontend and the prerender treat a
-- missing function (PGRST202 / 42883) as "no row", so they can ship first.
--
-- Run after 19. Safe to rerun.

BEGIN;

CREATE OR REPLACE FUNCTION resolve_apartment_public_key(p_key TEXT)
RETURNS TABLE (
    status TEXT,
    current_key TEXT,
    complex_name TEXT,
    road_address TEXT,
    region TEXT,
    households INTEGER,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_key TEXT := upper(btrim(p_key));
    v_current TEXT;
BEGIN
    -- Crockford Base32, 8 characters (etl/issue_apartment_public_keys.py).
    IF v_key IS NULL OR v_key !~ '^[0-9A-HJKMNP-TV-Z]{8}$' THEN
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM school_apartment_serving s WHERE s.complex_public_key = v_key) THEN
        RETURN QUERY SELECT 'served'::TEXT, v_key, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::INTEGER, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION;
        RETURN;
    END IF;

    SELECT s.complex_public_key INTO v_current
    FROM apartment_public_key_atom a
    JOIN apartment_assignment_units u ON u.apt_cd = a.apt_cd
    JOIN school_apartment_serving s ON s.canonical_complex_id = u.canonical_complex_id
    WHERE a.public_key = v_key AND s.complex_public_key IS NOT NULL
    ORDER BY s.complex_public_key
    LIMIT 1;

    IF v_current IS NOT NULL THEN
        RETURN QUERY SELECT 'moved'::TEXT, v_current, NULL::TEXT, NULL::TEXT, NULL::TEXT,
            NULL::INTEGER, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 'pending'::TEXT, v_key,
        COALESCE(m.complex_name, u.apt_name)::TEXT,
        COALESCE(m.road_address, u.road_address)::TEXT,
        COALESCE(m.region, u.region)::TEXT,
        m.households::INTEGER,
        COALESCE(m.latitude, u.latitude)::DOUBLE PRECISION,
        COALESCE(m.longitude, u.longitude)::DOUBLE PRECISION
    FROM apartment_public_key_atom a
    JOIN apartment_assignment_units u ON u.apt_cd = a.apt_cd
    LEFT JOIN apartment_complex_master m ON m.canonical_complex_id = u.canonical_complex_id
    WHERE a.public_key = v_key
    ORDER BY m.households DESC NULLS LAST, a.apt_cd
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION resolve_apartment_public_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_apartment_public_key(TEXT) TO anon, authenticated, service_role;

COMMIT;

-- Verify as the browser would (anon key), POST /rest/v1/rpc/resolve_apartment_public_key:
--   {"p_key": "28SEBP7H"}  ->  served
--   {"p_key": "KSQMMEG4"}  ->  moved, current_key 0WZRPQNR (신반포 한신 25,26,27차)
--   {"p_key": "36F5G7B3"}  ->  pending, 제일풍경채 옥정
--   {"p_key": "ZZZZZZZZ"}  ->  []
-- Rollback: DROP FUNCTION resolve_apartment_public_key(TEXT);
