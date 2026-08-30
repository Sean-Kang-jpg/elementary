# Operational Database Setup

This guide applies to the `operational-v1` school, apartment, and assignment masters. Legacy SQL files `01` through `05` are not required for this load and must not be used to replace the operational tables.

Current completion status and pending work are tracked in [`docs/ETL_OPERATION_PLAN.md`](../docs/ETL_OPERATION_PLAN.md). Update that checklist after each migration or production ETL run.

## 1. Prepare Supabase

Create or select the target Supabase project, then rotate and store fresh keys in `.env`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
```

Never place the service-role key in frontend variables or source files. Confirm DNS and credentials before applying SQL:

```bash
python etl/check_supabase_schema.py
```

It is expected to report unavailable tables before the migration, but the project host itself must resolve.

## 2. Build and Audit Locally

Run from `pjt_250826/elementary-v2/`:

```bash
python etl/build_apartment_master_v1.py
python etl/build_operational_masters.py
python etl/audit_operational_backend.py
python etl/upload_operational_masters.py
```

The audit must report `status=pass`. The uploader defaults to dry-run and validates seven load tables before any remote write.

## 3. Apply the Migration

For a fresh database, run `sql/06_create_operational_master_tables.sql`. It is non-destructive and creates eight tables, PostGIS location triggers, indexes, foreign keys, and RLS policies.

For a database where `06` was already applied, run these incremental migrations in order:

```text
sql/07_add_school_grade_statistics.sql
sql/10_finalize_frontend_data_contract.sql
```

Migration `07` adds 1st-6th grade students, classes, students per class, statistics year, and indexed region fields. Migration `10` adds detailed K-apt parking/rental fields, 0-100 ratio constraints, search and viewport indexes, and limits anonymous reads to `school_master` and `school_apartment_serving`. It is idempotent and may be re-run when its incremental guards change. Migration `08` is only an idempotent fallback for databases that do not yet have the serving table.

Apply `sql/09_create_serving_refresh_function.sql` for recurring production loads. It creates a service-role-only function that rebuilds serving rows inside one database transaction after normalized masters are updated.

After SQL `09` has been tested, apply `sql/11_create_recurring_etl_contract.sql`. It creates a private 50 MB-per-object Storage bucket, immutable source metadata, transient unlogged staging rows, and a service-role-only cleanup function. Source metadata defaults to the 45-day retention configured in `etl/recurring_etl_manifest.json`; expired Storage objects are removed by the later scheduled-cleanup step.

Apply `sql/12_create_etl_monitoring_dashboard.sql` to add authenticated administrator access, source schedules, regional/domain scopes, and run checks. Register an Auth user in `etl_admin_users` before opening `/admin/etl`; no service-role key is used by the browser.

Public read policies apply only to the two frontend tables. Normalized apartment masters, assignment links, history, and `etl_runs` remain service-role-only.

## 4. Load and Verify

After `check_supabase_schema.py` confirms all tables are available, run:

```bash
python etl/upload_operational_masters.py --apply
python etl/check_supabase_schema.py
```

The loader records the run in `etl_runs`, uploads in foreign-key order, and compares each remote count with the local snapshot. A count mismatch stops the run because it indicates stale rows; do not delete or truncate tables manually without a reviewed reconciliation plan.

For the incremental frontend transition, upload only the changed tables:

```bash
python etl/upload_operational_masters.py --apply \
  --table apartment_complex_master \
  --table school_apartment_serving
```

For recurring source-to-Supabase operation, load the normalized master tables and rebuild serving data in the database instead of uploading the local serving snapshot:

```bash
python etl/upload_operational_masters.py --apply --refresh-serving \
  --table school_master \
  --table apartment_complex_master \
  --table apartment_assignment_units \
  --table apartment_assignment_schools
```

The local serving JSON remains useful for initial bootstrap, audit comparison, and disaster recovery.

For a recurring run, validate the manifest and audited outputs first, then apply:

```bash
python etl/run_recurring_etl.py
python etl/run_recurring_etl.py --apply
```

Add `--build` after collecting newer source files. Successful runs archive the configured sources, stage six normalized datasets, verify exact remote counts, rebuild Serving, remove staging rows, and complete the `etl_runs` record. Failed runs retain staging for diagnosis and mark snapshots rejected.

## Stop Conditions

- Project hostname does not resolve or keys belong to another project.
- Local backend audit fails.
- Migration reports an existing incompatible column or constraint.
- Anonymous users can read history or ETL-run tables.
- Remote row counts differ from the audited local snapshot.
