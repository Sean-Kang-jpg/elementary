-- Cross-domain frontend filter: school criteria plus at least one qualifying
-- assigned apartment. Run after 10. Safe to rerun.

CREATE INDEX IF NOT EXISTS school_master_region_grade2_idx
    ON school_master (region, grade2_students);
CREATE INDEX IF NOT EXISTS school_master_region_grade3_idx
    ON school_master (region, grade3_students);
CREATE INDEX IF NOT EXISTS school_master_region_grade4_idx
    ON school_master (region, grade4_students);
CREATE INDEX IF NOT EXISTS school_master_region_grade5_idx
    ON school_master (region, grade5_students);
CREATE INDEX IF NOT EXISTS school_master_region_grade6_idx
    ON school_master (region, grade6_students);

CREATE INDEX IF NOT EXISTS school_apartment_serving_households_idx
    ON school_apartment_serving (households, school_id);
CREATE INDEX IF NOT EXISTS school_apartment_serving_parking_ratio_idx
    ON school_apartment_serving (parking_per_household, school_id);
CREATE INDEX IF NOT EXISTS school_apartment_serving_approval_year_idx
    ON school_apartment_serving (use_approval_year, school_id);
CREATE INDEX IF NOT EXISTS school_apartment_serving_rental_ratio_idx
    ON school_apartment_serving (public_rental_ratio, school_id);

CREATE OR REPLACE FUNCTION public.filter_school_ids(
    p_target_grade INTEGER DEFAULT 1,
    p_min_students INTEGER DEFAULT 0,
    p_school_types TEXT[] DEFAULT NULL,
    p_regions TEXT[] DEFAULT NULL,
    p_districts TEXT[] DEFAULT NULL,
    p_apply_apartment_filters BOOLEAN DEFAULT FALSE,
    p_min_households INTEGER DEFAULT 0,
    p_min_parking_ratio NUMERIC DEFAULT 0,
    p_min_use_approval_year INTEGER DEFAULT NULL,
    p_max_public_rental_ratio NUMERIC DEFAULT 100
)
RETURNS TABLE (school_id TEXT, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH matched AS (
        SELECT schools.school_id
        FROM public.school_master AS schools
        WHERE CASE p_target_grade
                WHEN 1 THEN COALESCE(schools.grade1_students, 0)
                WHEN 2 THEN COALESCE(schools.grade2_students, 0)
                WHEN 3 THEN COALESCE(schools.grade3_students, 0)
                WHEN 4 THEN COALESCE(schools.grade4_students, 0)
                WHEN 5 THEN COALESCE(schools.grade5_students, 0)
                WHEN 6 THEN COALESCE(schools.grade6_students, 0)
                ELSE 0
              END >= GREATEST(COALESCE(p_min_students, 0), 0)
          AND (p_school_types IS NULL OR schools.establishment_type = ANY(p_school_types))
          AND (p_regions IS NULL OR schools.region = ANY(p_regions))
          AND (
              p_districts IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM unnest(p_districts) AS district_name
                  WHERE COALESCE(schools.road_address, schools.legal_address, '')
                      ILIKE '%' || district_name || '%'
              )
          )
          AND (
              NOT COALESCE(p_apply_apartment_filters, FALSE)
              OR EXISTS (
                  SELECT 1
                  FROM public.school_apartment_serving AS apartments
                  WHERE apartments.school_id = schools.school_id
                    AND (
                        COALESCE(p_min_households, 0) <= 0
                        OR apartments.households >= p_min_households
                    )
                    AND (
                        COALESCE(p_min_parking_ratio, 0) <= 0
                        OR apartments.parking_per_household >= p_min_parking_ratio
                    )
                    AND (
                        p_min_use_approval_year IS NULL
                        OR apartments.use_approval_year >= p_min_use_approval_year
                    )
                    AND (
                        COALESCE(p_max_public_rental_ratio, 100) >= 100
                        OR apartments.public_rental_ratio <= LEAST(
                            GREATEST(p_max_public_rental_ratio, 0),
                            100
                        )
                    )
              )
          )
    )
    SELECT matched.school_id, COUNT(*) OVER() AS total_count
    FROM matched
    ORDER BY matched.school_id;
$$;

REVOKE ALL ON FUNCTION public.filter_school_ids(
    INTEGER, INTEGER, TEXT[], TEXT[], TEXT[], BOOLEAN, INTEGER, NUMERIC, INTEGER, NUMERIC
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_school_ids(
    INTEGER, INTEGER, TEXT[], TEXT[], TEXT[], BOOLEAN, INTEGER, NUMERIC, INTEGER, NUMERIC
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.filter_school_ids(
    INTEGER, INTEGER, TEXT[], TEXT[], TEXT[], BOOLEAN, INTEGER, NUMERIC, INTEGER, NUMERIC
) IS 'Returns schools matching school criteria and at least one qualifying assigned apartment.';
