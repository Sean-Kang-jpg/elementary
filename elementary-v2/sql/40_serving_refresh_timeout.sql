-- Give the Serving refresh its own statement timeout.
-- 2026-11-03, applied by the owner in the SQL editor before this file existed.
--
-- refresh_school_apartment_serving() rebuilds every region with DELETE + INSERT
-- in one statement. On 2026-11-03 (run 41523931995) all three attempts were
-- cancelled with 57014 after the capital tables had been rewritten six times in
-- two days; the rollback left Serving as it was. The role default is too short
-- for a nationwide rebuild, so the function carries a longer one.
--
-- Run alone: the SQL editor wraps several statements in one transaction, and the
-- VACUUM ANALYZE that went with it cannot run inside one (25001).
--
-- Verify:
--   SELECT proname, proconfig FROM pg_proc WHERE proname = 'refresh_school_apartment_serving';
--   -- proconfig = {statement_timeout=5min}
-- Rollback:
--   ALTER FUNCTION public.refresh_school_apartment_serving() RESET statement_timeout;

ALTER FUNCTION public.refresh_school_apartment_serving() SET statement_timeout = '5min';
