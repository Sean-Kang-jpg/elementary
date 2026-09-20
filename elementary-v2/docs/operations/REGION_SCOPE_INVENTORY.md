# Region Scope Inventory

Last updated: 2026-09-20

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
| `etl/build_school_master_v2.py:25-30,61` | `*_capital.json` inputs and a three-region loop | Production scope and naming artifact | Loop over scopes; rename inputs with the manifest and baseline in one change |

## ETL validation

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `etl/audit_operational_backend.py:21,215` | `REGIONS` set rejects any other region value | Validation rule | Validate against registry production scopes for the run |
| `etl/audit_operational_backend.py:202-209` | One hardcoded box `36.7-38.7N, 124.0-128.3E` for every table | Validation rule | Check each row against its own region's registry bounds. The current box is capital-only and would reject Busan, Jeju, and Ulleung |
| `etl/audit_apartment_etl.py:20,29,170-180` | `TARGET_CODES`, hand normalization, `capital_rows` metrics | Validation rule | Registry-driven; report per-region counts instead of one capital total |
| `etl/audit_school_etl.py:22-24,239,258` | Per-region prefixes, `capital_region_schools`, the recorded 2,240-school universe | Validation rule and historical baseline | Generalize the counts; keep the 2,240 sentence as a dated historical note |

## ETL scheduling and portability

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `etl/recurring_etl_manifest.json:5-8` | `scope.regions` lists the three capital regions | Production scope | Already the right shape. `registry.scopes_from_manifest()` now also accepts `{"region": ..., "cities": [...]}` for the Mokpo pilot |
| `etl/run_due_etl.py:114-115`, `etl/run_portable_readonly_build.py:26-27`, `etl/portable_inputs_manifest.json:32-40` | `schoolinfo_YYYY_*_capital.json` file names | Naming artifact | Rename only as one change across runner, manifest, bundle, and `portable_readonly_baseline.json`, or keep the names and document them as opaque. Renaming changes bundle paths and therefore the locked baseline |

## SQL

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `sql/06_create_operational_master_tables.sql:90,113` | `region IN ('서울특별시','경기도','인천광역시')` on complexes and assignments | Production scope | New idempotent migration `14` replaces both with registry-backed validation, keeping `NOT NULL`, foreign keys, RLS, and source traceability |
| `sql/07_add_school_grade_statistics.sql:31-33` | School region derived from three address prefixes | Production scope | Extend to all 17 regions, including renamed prefixes, in the same migration |
| `sql/12_create_etl_monitoring_dashboard.sql:58-64` | Four schedule rows store a fixed three-region scope | Production scope | Make scope a per-run value so each wave's runs are attributable and separately rollback-able |

## Frontend

| Location | What it assumes | Class | N0 action |
| --- | --- | --- | --- |
| `src/contexts/AppContext.tsx:12` | Default `selected_cities` is the three capital regions | Production scope | Default to the registry's production regions |
| `src/services/dataService.ts:193` | Only `경기도` has a city level between province and district | Production scope | Drive from `region.has_city_level`. Every province has a city level; Jeju and Sejong differ again |
| `src/services/dataService.ts:655-657`, `src/utils/mapUtils.ts:158-160` | Region map centers for three regions; `ALL` is the capital-region center | Production scope | Registry-derived centers; `ALL` must follow the loaded scope, not a fixed point |
| `src/types/index.ts:11` | Comment lists the three regions as the domain of `region` | Naming artifact | Update the comment with the schema change |
| `src/components/navigation/NewsPage.tsx:14` | `REGION_OPTIONS` hardcodes the three regions | Production scope | Build from the registry |
| `src/services/dataService.ts` full-table school read | All schools are paged once and cached for 30 minutes (2,260 rows today) | Production scope | Must become region- or viewport-scoped before roughly 6,300 national schools reach the map |

## Out of scope

`etl/academy_*`, `etl/geocode_academy_addresses.py`, `etl/verify_building_level.py`, `etl/profile_station_source.py`, and the station tests are research or candidate-domain code. They carry capital-region assumptions by design and are not part of N0.
