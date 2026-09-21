# Region Scope Inventory

Last updated: 2026-09-21

Every place the codebase assumes Seoul, Gyeonggi, and Incheon. This is the N0 work list: each row is classified so the generalization pass changes production scope without disturbing historical baselines or archived research.

Classification:

- **Production scope** — decides which rows are collected, built, validated, or published. Must move to `etl/region_registry.json`.
- **Validation rule** — an assertion about the data. Must become registry-driven and scope-aware.
- **Historical baseline** — a recorded past result. Must not change; changing it would invalidate the portability baseline.
- **Naming artifact** — a `_capital` file or bundle name. Rename only together with the manifest and baseline that reference it.
- **Research or report only** — outside the production ETL. Leave alone.

## ETL collection

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `etl/fetch_schoolinfo_2026.py:20-24` | Three education-office names and three address prefixes filter the nationwide Schoolinfo response | Production scope | Accept scopes; filter through `registry.by_education_office()` and `region_for_address()`. `sidoCode=00` already fetches nationwide, so this is a filter change, not a new request pattern |
| `etl/fetch_kapt_current.py:25,50` | `REGIONS` set filters K-apt complexes by the `시도` column | Production scope | Filter by scope; resolve `시도` values through registry aliases, since K-apt spellings vary and renamed regions appear |
| `etl/universal_etl_template.py` (16 references) | Older per-region fetch path | Research or report only | Leave; it is not part of the operational pipeline |

## ETL build

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `etl/build_operational_masters.py:79-81,171-178` | School and apartment region derived from three address prefixes | Production scope | Replace both with `registry.region_for_address()` |
| `etl/build_operational_masters.py:104-141` | `region_prefix` stripping is defined only for 서울/인천 | Production scope | Drive from `region.school_name_prefix`, and only when `has_verified_school_name_prefix` is true. An unverified region must not have labels stripped |
| `etl/build_operational_masters.py:370` | `대원초` special case in the match-method label | Validation rule | Review during the first non-capital EDA; a per-school exception list does not scale |
| `etl/build_apartment_master_v1.py:35,45` | `TARGET_CODES` maps three legal-dong prefixes; `서울시`/`인천시` normalized by hand | Production scope | Take codes from the registry, including legacy codes 42 and 45; replace hand normalization with alias resolution |
| `etl/build_school_master_v1.py:17-24,78` | Three legacy per-region input files and `CAPITAL_EDUCATION_OFFICES` | Historical baseline | Legacy v1 builder; generalize only if it re-enters the pipeline |
| `etl/build_school_master_v2.py:25-30,61` | `*_capital.json` inputs and a three-region loop | Production scope | **Done 2026-09-21**: the region comes from the registry and the input glob treats the scope slug as opaque, so a new wave needs no change here |

## ETL validation

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `etl/audit_operational_backend.py:21,215` | `REGIONS` set rejects any other region value | Validation rule | Validate against registry production scopes for the run |
| `etl/audit_operational_backend.py:202-209` | One hardcoded box `36.7-38.7N, 124.0-128.3E` for every table | Validation rule | Check each row against its own region's registry bounds. The current box is capital-only and would reject Busan, Jeju, and Ulleung |
| `etl/audit_apartment_etl.py:20,29,170-180` | `TARGET_CODES`, hand normalization, `capital_rows` metrics | Validation rule | **Done 2026-09-21**: legal-dong prefixes come from the registry, K-apt rows resolve through `resolve_source_region()` so merged values split correctly, and the report counts per region under `rows_in_scope` |
| `etl/audit_school_etl.py:22-24,239,258` | Per-region prefixes, `capital_region_schools`, the recorded 2,240-school universe | Historical only | **Closed 2026-09-21 without generalizing**: this audits the v1 per-region snapshots, which are no longer present locally, and nothing calls it. Annotated as historical; `audit_operational_backend.py` is the operational audit |

## ETL scheduling and portability

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `etl/recurring_etl_manifest.json:5-8` | `scope.regions` lists the three capital regions | Production scope | Already the right shape. `registry.scopes_from_manifest()` now also accepts `{"region": ..., "cities": [...]}` for the Mokpo pilot |
| `etl/run_due_etl.py:114-115`, `etl/run_portable_readonly_build.py:26-27`, `etl/portable_inputs_manifest.json:32-40` | `schoolinfo_YYYY_*_capital.json` file names | Naming artifact | **Closed 2026-09-21 by keeping the names**: `capital` is simply the collector's slug for the production scope, and other scopes get their own slug. Renaming would churn the bundle paths and the locked baseline for no gain |

## SQL

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `sql/06_create_operational_master_tables.sql:90,113` | `region IN ('서울특별시','경기도','인천광역시')` on complexes and assignments | Production scope | **Written 2026-09-21** as `sql/16_create_region_registry_contract.sql`: a private `region_registry` table plus foreign keys. Not applied yet |
| `sql/07_add_school_grade_statistics.sql:31-33` | School region derived from three address prefixes | Production scope | **Written 2026-09-21**: migration 16 adds `region_from_address()`, which resolves all 17 regions including pre-rename prefixes |
| `sql/12_create_etl_monitoring_dashboard.sql:58-64` | Four schedule rows store a fixed three-region scope | Production scope | **Done 2026-09-21**: each run records its resolved scope, and migration 16 repoints the seeded schedule scopes at the production regions |

## Frontend

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `src/contexts/AppContext.tsx:12` | Default `selected_cities` is the three capital regions | Production scope | Default to the registry's production regions |
| `src/services/dataService.ts:193` | Only `경기도` has a city level between province and district | Production scope | Drive from `region.has_city_level`. Every province has a city level; Jeju and Sejong differ again |
| `src/services/dataService.ts:655-657`, `src/utils/mapUtils.ts:158-160` | Region map centers for three regions; `ALL` is the capital-region center | Production scope | Registry-derived centers; `ALL` must follow the loaded scope, not a fixed point |
| `src/types/index.ts:11` | Comment lists the three regions as the domain of `region` | Naming artifact | Update the comment with the schema change |
| `src/components/navigation/NewsPage.tsx:14` | `REGION_OPTIONS` hardcodes the three regions | Production scope | Build from the registry |
| `src/services/dataService.ts` full-table school read | All schools are paged once and cached for 30 minutes (2,260 rows today) | Production scope | Must become region- or viewport-scoped before roughly 6,300 national schools reach the map |

## Completed in N0 so far

Done on 2026-09-20 and 2026-09-21, all verified against the locked portability baseline or the frontend gate:

- **ETL collection**: both collectors take `--regions`/`--cities` and resolve regions through the registry.
- **ETL build**: region derivation, the school-name prefix, and legal-dong prefixes come from the registry.
- **ETL validation**: the audit checks each row against its own region's bounds, still 52/52.
- **ETL scheduling**: every run records its resolved scope and per-region row counts.
- **Frontend**: default regions, the news filter, map centers, and the address parser's city level now come from the generated `src/constants/regionRegistry.ts`; `etl/export_region_registry_ts.py --check` guards drift.

- **Frontend map read**: the school read is scoped to the regions whose registry envelope overlaps the viewport, measured at 0.89 s against 2.21 s before.

Still open: applying migration `16` to Supabase. Everything else in this inventory is either done or deliberately closed.

## Out of scope

`etl/academy_*`, `etl/geocode_academy_addresses.py`, `etl/verify_building_level.py`, `etl/profile_station_source.py`, and the station tests are research or candidate-domain code. They carry capital-region assumptions by design and are not part of N0.
