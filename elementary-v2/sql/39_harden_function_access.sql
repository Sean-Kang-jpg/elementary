-- Harden monitoring RPCs, legacy writes and application function search paths.
-- 2026-10-25. Public/extensions CREATE is denied to anon/authenticated.
BEGIN;
CREATE OR REPLACE FUNCTION public.etl_staging_depth()
RETURNS TABLE (estimated_rows BIGINT, total_bytes BIGINT, runs_with_rows BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
  IF NOT (
    current_setting('role') IN ('none', 'postgres', 'supabase_admin')
    OR COALESCE(auth.role(), '') = 'service_role'
    OR public.is_etl_admin()
  ) THEN
    RAISE EXCEPTION 'ETL administrator required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT GREATEST(c.reltuples, 0)::BIGINT,
    pg_total_relation_size('public.etl_staging_rows')::BIGINT,
    (SELECT COUNT(DISTINCT run_id) FROM public.etl_staging_rows)::BIGINT
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'etl_staging_rows';
END;
$$;
CREATE OR REPLACE FUNCTION public.public_table_sizes()
RETURNS TABLE (table_name TEXT, total_bytes BIGINT, heap_bytes BIGINT, index_bytes BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
  IF NOT (
    current_setting('role') IN ('none', 'postgres', 'supabase_admin')
    OR COALESCE(auth.role(), '') = 'service_role'
    OR public.is_etl_admin()
  ) THEN
    RAISE EXCEPTION 'ETL administrator required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.relname::TEXT, pg_total_relation_size(c.oid)::BIGINT,
    pg_relation_size(c.oid)::BIGINT, pg_indexes_size(c.oid)::BIGINT
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.etl_staging_depth(), public.public_table_sizes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.etl_staging_depth(), public.public_table_sizes() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_apartment_school_mapping(integer,integer,integer,boolean,numeric,character varying,boolean),
  public.update_all_school_normalized_data(), public.update_all_apartment_normalized_data()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_apartment_school_mapping(integer,integer,integer,boolean,numeric,character varying,boolean),
  public.update_all_school_normalized_data(), public.update_all_apartment_normalized_data() TO service_role;
ALTER FUNCTION public.update_school_location() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.update_apartment_location() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.update_school_calculated_fields() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.update_apartment_calculated_fields() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.parse_region_korean(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.parse_region_code(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.extract_city_from_address(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.extract_district_from_address(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.is_large_school(integer,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.classify_school_size(integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.update_school_coordinates() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.update_school_aggregates() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.update_apartment_coordinates() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.classify_grade1_size(integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.calculate_school_data_quality(schools) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.validate_coordinates(numeric,numeric) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.calculate_distance(numeric,numeric,numeric,numeric) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.count_nearby_schools(numeric,numeric,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.normalize_school_name(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.normalize_apartment_name(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.parse_city_from_address(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.parse_district_from_address(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.parse_region_from_address(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.is_valid_korean_coordinates(numeric,numeric) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.calculate_school_quality_score(text,text,numeric,numeric,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.calculate_apartment_quality_score(text,text,numeric,numeric,integer,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.update_all_school_normalized_data() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.update_all_apartment_normalized_data() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.calculate_address_similarity(text,text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.calculate_school_name_similarity(text,text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.normalize_address(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.calculate_region_stats(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_schools_by_city(text[]) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_schools_by_district(character varying,text[]) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_schools_for_map(character varying,character varying,integer,integer,character varying,numeric,numeric,numeric,numeric) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_apartments_by_school(character varying,numeric,numeric,integer,integer,numeric,integer,integer,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_apartments_by_region(character varying,character varying,numeric,numeric,integer,integer,numeric,integer,character varying,integer,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.search_schools_and_apartments(text,character varying,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_grade_students_array(schools) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_dashboard_stats(character varying) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_current_school_year() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.is_keris_data_fresh(schools,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_schools_by_region(text,integer,integer,text[],boolean,boolean) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_schools_within_radius(numeric,numeric,integer,integer,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_schools_in_bounds(numeric,numeric,numeric,numeric,integer,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_school_detail(integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.search_schools_by_name(text,text,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_enhanced_region_stats(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_all_regions_summary() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_data_quality_issues(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_apartments_near_school(integer,integer,integer,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_schools_for_apartment(integer,boolean) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_apartments_for_school(integer,boolean,numeric) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.create_apartment_school_mapping(integer,integer,integer,boolean,numeric,character varying,boolean) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.get_mapping_statistics(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.set_master_location_and_timestamp() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.frontyard_has_contact(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.frontyard_retention_cutoff() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.frontyard_post_ended_at(text,timestamp with time zone,timestamp with time zone) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.frontyard_is_anonymous() SET search_path = pg_catalog, public, extensions, pg_temp;
COMMIT;

