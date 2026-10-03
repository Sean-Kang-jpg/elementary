# Data Contracts

Status: **Current through SQL 17**  
Last updated: 2026-09-27

## Public read contracts

Anonymous browser access reaches **three tables and three functions**, verified
live against production on 2026-09-27 with the deployed anon key. Every other
operational table returns an empty result under RLS rather than rows.

| Reachable anonymously | Kind |
| --- | --- |
| `school_master` | table |
| `school_apartment_serving` | table |
| `apartment_academy_summary` | table |
| `filter_school_ids(...)` | function |
| `nearby_academy_addresses(...)` | function |
| `nearby_academy_addresses_for_school(...)` | function |

Verified blocked in the same pass: `apartment_complex_master`,
`apartment_name_history`, `apartment_property_history`, `etl_runs` return
`200 []`, and `region_registry`, `etl_schedules`, `etl_staging_rows`,
`etl_source_snapshots` return `401`.

### `school_master`

Purpose: school search, map markers, region/district summaries, and school detail.

Stable identity: `school_id`. Important groups include official names and addresses, region, coordinates, establishment metadata, grade 1–6 students/classes/per-class values, totals, statistics year/status, and pipeline timestamps.

### `school_apartment_serving`

Purpose: selected-school apartment list, apartment search, apartment detail, and apartment-filter RPC results.

Stable relationship: `school_id + canonical_complex_id`. Important fields include complex identity, address/region/district, coordinates, households, building count, approval year, parking, rental counts/ratio, assignment rank/roles/confidence, review status, and pipeline timestamps.

### `apartment_academy_summary`

Purpose: per-complex academy counts shown on apartment cards and apartment detail.

Stable identity: `canonical_complex_id`. Fields are core/extended address and institution counts, `distance_origin_type`, and `updated_at`. Defined by SQL `14`.

This is a **counts-only** surface. Raw academy addresses and institution names stay private; the sibling tables `academy_address_serving` and `apartment_academy_origin_points` are not anonymously reachable.

### `filter_school_ids(...)`

Purpose: apply school and apartment criteria without browser-side joins. SQL `13` is the authoritative definition. Region, establishment, grade/student, household, age, parking, and public-rental parameters must remain aligned with frontend filter types and cache keys.

The frontend degrades gracefully when this function is missing (`PGRST202`/`42883` set `crossFilterRpcAvailable = false` and unfiltered results are returned).

> Earlier revisions of this document named this function `filter_schools_with_apartments`. No such function exists; the name has never matched the SQL or the frontend call.

### `nearby_academy_addresses(...)` and `nearby_academy_addresses_for_school(...)`

Purpose: privacy-minimized academy address markers within a radius of a complex (SQL `14`) or of a school's assigned complexes (SQL `15`). Both return per-address counts and, since SQL `20`, an `institutions` array of public name, institution type and NEIS realm per academy. Contact, fee and raw-address details stay private.

Each `institutions` item also carries `subjects` (2026-10-03): name-derived categories (`english`, `math`, `writing`, `science`, `coding`, `study`, `language`, `arts`, `sports`, `other`) from `etl/academy_subjects.py`, written in place by `etl/backfill_academy_subjects.py` and by the marker builder on rebuild. It lives inside the existing JSONB, so it needed no migration. An item may have several subjects. The frontend falls back to the realm when an item has none.

Measured latency on 2026-09-27, five samples each: 0.193-0.316 s and 0.235-0.316 s.

**Neither call degrades gracefully** — both `throw` on error, unlike `filter_school_ids`. If either migration is ever rolled back, the academy surfaces will error rather than disappear quietly.

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
