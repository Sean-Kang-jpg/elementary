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
| `public_data_freshness()` | function (SQL `22`, 2026-10-04; source name, as-of date and load time only) |
| `school_care_statistics` | table (SQL `23`, 2026-10-04; per-school care and after-school disclosure) |
| `care_centers` | table (SQL `23`; community care centers, public-page fields only) |
| `nearby_care_centers(...)` | function (SQL `23`) |
| `curriculum_like_counts(...)`, `curriculum_item_ranking(...)` | functions (SQL `24`; counts only) |
| `curriculum_likes` | table (SQL `24`) — **`authenticated` only, own rows only**. Anonymous voters are Supabase anonymous users |

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

### `school_care_statistics`, `care_centers` and `nearby_care_centers(...)` (SQL `23`)

Purpose: the school detail's 돌봄·방과후 block and the "주변 돌봄센터" list on school
and apartment detail. Loaded by `etl/collect_care_data.py` (dry-run by default,
`--apply` to write; monthly). Kept out of `school_master` so the recurring master
ETL and its portable baseline are untouched.

- `school_care_statistics` — Schoolinfo `apiType=59`, joined through
  `school_master.schoolinfo_code`. Afternoon/evening/linked care rooms and
  participants, after-school program counts and participants. **The disclosure
  has no applicant, waitlist or rejection counts**, so the frontend shows
  participants per 100 grade-1–2 students and per room as a proxy, never a score.
  `statistics_year` is the publication year (`pbanYr`), not a verified school year.
- `care_centers` — the 다함께돌봄 support team's public center list
  (`dadol.or.kr/board/center/list`), approved centers only; Seoul's
  우리동네키움센터 are in it. Only the fields its own public center page shows:
  name, capacity, term and vacation hours, address, phone. The source JSON also
  returns staff names and e-mails; the collector drops them on read. Fees and
  current enrollment are not loaded — the public page does not show them and
  their units are unclear. Entries are self-reported; `source_updated_on` says
  when the center last edited its own entry.
- `nearby_care_centers(p_latitude, p_longitude, p_max_distance_m)` — straight-line,
  radius capped at 2,000 m, nearest 30.

**Both degrade gracefully**: a database without SQL `23` makes the frontend render
nothing for these blocks (`PGRST202`/`PGRST205`/`42883`/`42P01`), so the app can
ship before the migration.

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
