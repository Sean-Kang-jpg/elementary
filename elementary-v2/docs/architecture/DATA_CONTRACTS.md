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
| `school_day_estimates`, `school_day_estimate_weekdays`, `school_care_hours` | tables (SQL `26`, 2026-10-08; reviewed grade-1 day estimate and school care hours, pilot 35/60 schools) |
| `curriculum_like_counts(...)`, `curriculum_item_ranking(...)`, `curriculum_likes` | SQL `24` — **운영 미적용, 프런트 호출 없음**(2026-10-06 화면 삭제). 개편 P3·P4 결정 전까지 보류 |

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

### `school_day_estimates`, `school_day_estimate_weekdays`, `school_care_hours` (SQL `26`)

Purpose: the school detail's "초1 하루 예상" card (Audit 2 A2-R04). Loaded by
`etl/load_school_day_estimates.py` (dry-run by default, `--apply` to write) from three reviewed,
user-confirmed files under `docs/research/audit2/`. Not part of the recurring ETL yet; a refresh
repeats the review (next: the February 1기 가정통신문 and the 2027 학교알리미 disclosure).

- `school_day_estimates` — per school: grade-1 4교시 end, lunch window and whether lunch comes
  before or after 4교시, 5교시 end (and whether it is inferred), sources, `reviewed_on`. From the
  학교알리미 2-가 curriculum plan's 시정표.
- `school_day_estimate_weekdays` — Mon–Fri grade-1 periods (NEIS timetable mode) and the estimated
  end of the day. `note = 'inferred'` is shown as 추정, `note = 'school_check_needed'` has no time
  and is shown as 학교 확인. A gap is never filled in.
- `school_care_hours` — term-time afternoon care end, evening/extension end with its condition,
  morning hours and grades as written in the 15-라 plan; `status = 'school_check_needed'` when the
  plan states no hours. Admission is limited and selective, which the card says.

Every value is a `source_year` figure shown to the following entry year as an **estimate**
(2025→2026: weekday patterns 94% and clocks 96% unchanged). The tables revoke Supabase's default
anon/authenticated write grants and grant SELECT only; on 2026-10-08 anon POST/PATCH/DELETE all
returned `42501`. **Degrades gracefully**: without SQL `26` the card renders nothing.

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
