-- Read-only operational probes. Not a migration. No writes, no real JWTs.
-- FIRST confirm the synthetic subject is not an ETL admin. Stop if true.
select exists(select 1 from public.etl_admin_users where user_id='00000000-0000-4000-8000-000000000000'::uuid) as fixture_is_admin;
-- Source existence is checked separately: hidden rows are not empty tables.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='500ms';
SELECT jsonb_build_object(
'read_only',current_setting('transaction_read_only'),
'etl_admin_users_have_rows',exists(select 1 from public.etl_admin_users limit 1),
'etl_runs_have_rows',exists(select 1 from public.etl_runs limit 1),
'etl_schedules_have_rows',exists(select 1 from public.etl_schedules limit 1),
'etl_checks_have_rows',exists(select 1 from public.etl_run_checks limit 1),
'etl_sources_have_rows',exists(select 1 from public.etl_source_snapshots limit 1),
'private_master_has_rows',exists(select 1 from public.apartment_complex_master limit 1)
) as baseline;
ROLLBACK;
-- anon public/private boundary
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '500ms';
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
SELECT jsonb_build_object(
'role',current_user,'read_only',current_setting('transaction_read_only'),'uid_is_null',auth.uid() is null,
'public_school_visible',exists(select 1 from public.school_master limit 1),
'public_apartment_visible',exists(select 1 from public.school_apartment_serving limit 1),
'public_academy_visible',exists(select 1 from public.academy_address_serving limit 1),
'public_care_visible',exists(select 1 from public.school_care_statistics limit 1),
'private_master_visible',exists(select 1 from public.apartment_complex_master limit 1),
'admin_table_select_granted',has_table_privilege(current_user,'public.etl_admin_users','SELECT'),
'staging_table_select_granted',has_table_privilege(current_user,'public.etl_staging_rows','SELECT'),
'refresh_execute_granted',has_function_privilege(current_user,'public.refresh_school_apartment_serving()','EXECUTE'),
'cleanup_execute_granted',has_function_privilege(current_user,'public.cleanup_recurring_etl(timestamp with time zone,integer)','EXECUTE')
) as checks;
ROLLBACK;
-- simulated ordinary authenticated non-admin
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '500ms';
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000000","is_anonymous":false}',true);
SET LOCAL ROLE authenticated;
SELECT jsonb_build_object(
'role',current_user,'read_only',current_setting('transaction_read_only'),
'fixture_uid_matches',auth.uid()='00000000-0000-4000-8000-000000000000'::uuid,
'is_etl_admin',public.is_etl_admin(),
'public_school_visible',exists(select 1 from public.school_master limit 1),
'public_apartment_visible',exists(select 1 from public.school_apartment_serving limit 1),
'private_master_visible',exists(select 1 from public.apartment_complex_master limit 1),
'admin_role_row_visible',exists(select 1 from public.etl_admin_users limit 1),
'etl_runs_visible',exists(select 1 from public.etl_runs limit 1),
'etl_schedules_visible',exists(select 1 from public.etl_schedules limit 1),
'etl_checks_visible',exists(select 1 from public.etl_run_checks limit 1),
'etl_sources_visible',exists(select 1 from public.etl_source_snapshots limit 1),
'staging_table_select_granted',has_table_privilege(current_user,'public.etl_staging_rows','SELECT'),
'monitoring_sizes_execute_granted',has_function_privilege(current_user,'public.public_table_sizes()','EXECUTE'),
'monitoring_staging_execute_granted',has_function_privilege(current_user,'public.etl_staging_depth()','EXECUTE'),
'region_lookup_execute_granted',has_function_privilege(current_user,'public.region_from_address(text)','EXECUTE'),
'refresh_execute_granted',has_function_privilege(current_user,'public.refresh_school_apartment_serving()','EXECUTE'),
'cleanup_execute_granted',has_function_privilege(current_user,'public.cleanup_recurring_etl(timestamp with time zone,integer)','EXECUTE')
) as checks;
ROLLBACK;
-- simulated anonymous Auth user: also uses authenticated DB role
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '500ms';
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000000","is_anonymous":true}',true);
SET LOCAL ROLE authenticated;
SELECT jsonb_build_object(
'role',current_user,'read_only',current_setting('transaction_read_only'),
'fixture_uid_matches',auth.uid()='00000000-0000-4000-8000-000000000000'::uuid,
'is_etl_admin',public.is_etl_admin(),
'public_school_visible',exists(select 1 from public.school_master limit 1),
'public_apartment_visible',exists(select 1 from public.school_apartment_serving limit 1),
'private_master_visible',exists(select 1 from public.apartment_complex_master limit 1),
'admin_role_row_visible',exists(select 1 from public.etl_admin_users limit 1),
'etl_runs_visible',exists(select 1 from public.etl_runs limit 1),
'etl_schedules_visible',exists(select 1 from public.etl_schedules limit 1),
'etl_checks_visible',exists(select 1 from public.etl_run_checks limit 1),
'etl_sources_visible',exists(select 1 from public.etl_source_snapshots limit 1),
'staging_table_select_granted',has_table_privilege(current_user,'public.etl_staging_rows','SELECT'),
'monitoring_sizes_execute_granted',has_function_privilege(current_user,'public.public_table_sizes()','EXECUTE'),
'monitoring_staging_execute_granted',has_function_privilege(current_user,'public.etl_staging_depth()','EXECUTE'),
'region_lookup_execute_granted',has_function_privilege(current_user,'public.region_from_address(text)','EXECUTE'),
'refresh_execute_granted',has_function_privilege(current_user,'public.refresh_school_apartment_serving()','EXECUTE'),
'cleanup_execute_granted',has_function_privilege(current_user,'public.cleanup_recurring_etl(timestamp with time zone,integer)','EXECUTE')
) as checks;
ROLLBACK;
