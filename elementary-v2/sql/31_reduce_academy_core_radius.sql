-- Change the education-environment core band from 600 m to 400 m while
-- retaining the existing 800 m outer boundary. Run after 21. Safe to rerun.

BEGIN;

DO $migration$
DECLARE
    function_signature REGPROCEDURE;
    definition TEXT;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'public.nearby_academy_addresses(text,integer)'::REGPROCEDURE,
        'public.nearby_academy_addresses_for_school(text,integer)'::REGPROCEDURE
    ]
    LOOP
        SELECT pg_get_functiondef(function_signature) INTO definition;
        definition := replace(definition, '<= 600', '<= 400');
        EXECUTE definition;
    END LOOP;
END
$migration$;

-- Apartment cards use this precomputed table, so rebuild the split from the
-- same origin points and straight-line distance contract used by the RPCs.
CREATE TEMP TABLE academy_summary_400 ON COMMIT DROP AS
WITH nearest AS (
    SELECT
        origin.canonical_complex_id,
        academy.address_id,
        ROUND(MIN(public.ST_Distance(academy.location, origin.location)))::INTEGER AS distance_m,
        MAX(academy.institution_count)::INTEGER AS institution_count
    FROM public.apartment_academy_origin_points AS origin
    CROSS JOIN LATERAL (
        SELECT serving.address_id, serving.location, serving.institution_count
        FROM public.academy_address_serving AS serving
        WHERE public.ST_DWithin(serving.location, origin.location, 800)
    ) AS academy
    GROUP BY origin.canonical_complex_id, academy.address_id
)
SELECT
    canonical_complex_id,
    COUNT(*) FILTER (WHERE distance_m <= 400)::INTEGER AS core_address_count,
    COUNT(*) FILTER (WHERE distance_m > 400)::INTEGER AS extended_address_count,
    COALESCE(SUM(institution_count) FILTER (WHERE distance_m <= 400), 0)::INTEGER AS core_institution_count,
    COALESCE(SUM(institution_count) FILTER (WHERE distance_m > 400), 0)::INTEGER AS extended_institution_count
FROM nearest
GROUP BY canonical_complex_id;

UPDATE public.apartment_academy_summary AS summary
SET core_address_count = rebuilt.core_address_count,
    extended_address_count = rebuilt.extended_address_count,
    core_institution_count = rebuilt.core_institution_count,
    extended_institution_count = rebuilt.extended_institution_count,
    updated_at = NOW()
FROM academy_summary_400 AS rebuilt
WHERE rebuilt.canonical_complex_id = summary.canonical_complex_id;

UPDATE public.apartment_academy_summary AS summary
SET core_address_count = 0,
    extended_address_count = 0,
    core_institution_count = 0,
    extended_institution_count = 0,
    updated_at = NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM academy_summary_400 AS rebuilt
    WHERE rebuilt.canonical_complex_id = summary.canonical_complex_id
);

COMMENT ON TABLE public.apartment_academy_summary IS
    'Precomputed 0-400 m core and 400-800 m extended education-environment counts by apartment complex.';
COMMENT ON FUNCTION public.nearby_academy_addresses(TEXT, INTEGER) IS
    'Returns education-environment address aggregates within 800 m; core is 0-400 m and extended is 400-800 m.';
COMMENT ON FUNCTION public.nearby_academy_addresses_for_school(TEXT, INTEGER) IS
    'Returns deduplicated education-environment addresses near a school catchment; core is 0-400 m and extended is 400-800 m.';

COMMIT;

-- Verification:
-- SELECT bool_and((straight_distance_m <= 400) = (distance_band = 'core'))
-- FROM nearby_academy_addresses('<canonical complex id>', 800);
