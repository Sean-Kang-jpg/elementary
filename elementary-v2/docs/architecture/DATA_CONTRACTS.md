# Data Contracts

Status: **Current through SQL 13**  
Last updated: 2026-09-17

## Public read contracts

### `school_master`

Purpose: school search, map markers, region/district summaries, and school detail.

Stable identity: `school_id`. Important groups include official names and addresses, region, coordinates, establishment metadata, grade 1–6 students/classes/per-class values, totals, statistics year/status, and pipeline timestamps.

### `school_apartment_serving`

Purpose: selected-school apartment list, apartment search, apartment detail, and apartment-filter RPC results.

Stable relationship: `school_id + canonical_complex_id`. Important fields include complex identity, address/region/district, coordinates, households, building count, approval year, parking, rental counts/ratio, assignment rank/roles/confidence, review status, and pipeline timestamps.

### `filter_schools_with_apartments(...)`

Purpose: apply school and apartment criteria without browser-side joins. SQL 13 is the authoritative definition. Region, establishment, grade/student, household, age, parking, and public-rental parameters must remain aligned with frontend filter types and cache keys.

## Private operational contracts

- `apartment_complex_master`
- `apartment_assignment_units`
- `apartment_assignment_schools`
- `apartment_name_history`
- `apartment_property_history`
- `etl_runs`
- `etl_source_snapshots`
- `etl_staging_rows`
- `etl_schedules`
- `etl_run_checks`
- `etl_admin_users`

These tables are not general browser read models. Their access is limited to the service role or registered administrators as explicitly granted.

## Refresh contract

`refresh_school_apartment_serving()` performs delete and insert inside one transaction while holding an advisory transaction lock. PUBLIC, `anon`, and `authenticated` execution is revoked; only `service_role` may execute it.

## Compatibility rules

- Never reuse an identifier for a different source entity.
- Do not publish impossible rental ratios; preserve review status instead.
- Do not coerce missing numeric source values to zero.
- Additive fields require matching SQL, ETL, audit, TypeScript, query projection, and UI handling.
- Region expansion requires a versioned canonical registry and scoped audit evidence.
