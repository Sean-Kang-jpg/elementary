# ETL Operation Plan

Last updated: 2026-09-26

Release status: **v2.0 operational baseline complete; v2.1 released; v2.2 interaction work in progress; nationwide expansion N0 underway with Daejeon as the first N1 scope.**

This document is the single checklist for the school-zone, school, apartment, Supabase, frontend, and candidate data-domain pipeline. Update it whenever a task is completed, deferred, or blocked. Dated analysis reports and their reproduction code are archived outside the active application tree.

## Status Rules

- `[x]`: completed and verified
- `[ ]`: pending work
- **Deferred**: intentionally postponed; not a current blocker
- **Issue**: requires monitoring, review, or a later correction

## Current UX Milestone: School, Apartment, and Academy Integration

- [x] Replace text-heavy assigned-apartment rows with reusable visual cards showing scale, age, parking composition, and nearby-academy context.
- [x] Add apartment-detail academy summaries with 600 m core and 600-800 m extended counts plus an opt-in map layer.
- [x] Add a school-detail education tab and a school-scoped academy map-layer trigger.
- [x] Keep school-scoped academy access on the public serving boundary by deriving assigned complexes from `school_apartment_serving`.
- [x] Pass frontend lint, typecheck, and production build for the local integration.
- [ ] Apply `15_create_school_academy_proximity.sql` to Supabase and verify the anonymous RPC result and representative latency.
- [ ] Run allowed-domain mobile QA for school detail, apartment detail, academy markers, sheet gestures, and 360/390/430 px layouts.
- [ ] Commit and deploy only after SQL 15 and the allowed-domain smoke pass; retain the existing production deployment until then.

## Completed Baseline

- [x] Establish official 2026 school-zone polygons as the assignment source of truth; retain Geomarket only for comparison.
- [x] Build school-zone assignments for 20,421 apartment units and preserve method, confidence, and review status.
- [x] Build `school_master` for 2,260 schools, including grade 1-6 student and class statistics.
- [x] Build 20,164 canonical apartment complexes, name history, property history, and school assignments.
- [x] Pass the local backend audit: 49/49 checks.
- [x] Apply `06_create_operational_master_tables.sql` and `07_add_school_grade_statistics.sql`.
- [x] Create and load `school_apartment_serving` through migration `06`; migration `08` is only an idempotent incremental fallback.
- [x] Load seven operational data tables: 112,997 rows across eight operational tables.
- [x] Verify public/private RLS boundaries and anonymous serving-table reads.
- [x] Move frontend school/apartment reads to the operational schema and pass lint, typecheck, and build.
- [x] Archive superseded 2024-2025 docs, SQL, frontend copies, ETL experiments, and outputs outside the active app tree.

## Current Milestone: Frontend Data Contract

Finalize the read model and UX before expanding the recurring ETL. The frontend should read schools from `school_master` and apartments from `school_apartment_serving` without browser-side joins.

- [x] Remove the nested `AppProvider` that split search, map, and detail state.
- [x] Synchronize initial map bounds and replace overlapping map events with a single debounced `idle` request.
- [x] Include school type and region filters in map cache keys and ignore stale viewport responses.
- [x] Verify current frontend changes with `npm run lint`, `npm run typecheck`, and `npm run build`.
- [x] Finalize explicit frontend fields for `school_master` and `school_apartment_serving`; remove frontend `select('*')` reads.
- [x] Add K-apt ground/underground parking and public/private rental counts to the local apartment master and serving contract.
- [x] Apply the public-rental-ratio filter to the Supabase query instead of returning placeholder zero values.
- [x] Add an unrestricted apartment-age option so pre-1986 complexes remain discoverable.
- [x] Prepare matching indexes for school-name partial search and latitude/longitude viewport filtering.
- [x] Rebuild local outputs and pass the expanded backend audit: 52/52 checks.
- [x] Validate the selected-table upload dry-run: 20,164 complex rows and 20,891 serving rows.
- [x] Apply `10_finalize_frontend_data_contract.sql` to the existing Supabase database.
- [x] Upload the rebuilt `apartment_complex_master` and `school_apartment_serving` rows.
- [x] Confirm least-privilege RLS: anonymous frontend access only to the two read tables.
- [x] Run remote count/RLS checks and desktop/mobile browser smoke tests against the migrated schema.
- [x] Record the finalized read contract in SQL, frontend types/services, and the now-archived `joinmap.html` visual snapshot.
- [x] Re-run the idempotent SQL `10` migration and install the 0-100 public-rental-ratio constraints.

## Next Milestone: Recurring ETL

- [x] Define the private `etl-source-snapshots/{source}/{date}/` path and 45-day metadata retention rule.
- [x] Add SQL `11` contracts for source metadata, transient staging rows, cleanup, and service-role-only access.
- [x] Implement `run_recurring_etl.py` for archive, staging, validated master upserts, and Serving refresh; pass local dry-run.
- [x] Apply `11_create_recurring_etl_contract.sql` in Supabase.
- [x] Execute a controlled recurring ETL pilot: three validated snapshots, zero retained staging rows, completed run log, and 20,891 Serving rows.
- [x] Re-apply the corrected `09_create_serving_refresh_function.sql` with the Supabase-safe explicit delete predicate.
- [x] Test `refresh_school_apartment_serving()`: 20,891 rows before, inserted, and after; RLS remained valid.
- [x] Verify row counts, foreign keys, RLS, grade statistics, and frontend query latency after refresh; sample reads completed in about 210 ms and 191 ms.
- [x] Select the local Windows workstation as the initial recurring-run host; keep its Supabase service-role secret in the ignored `.env` file.
- [x] Add a due-source runner for latest K-apt and current-year Schoolinfo collection, dynamic manifests, and daily schedule evaluation.
- [x] Register the Windows daily task and verify its no-op and maintenance execution paths with `LastTaskResult=0`.
- [ ] Verify the first unattended due-source production run when a schedule becomes due.
- [x] Add bounded retry behavior, overlap prevention, logs, and optional webhook failure notification.
- [x] Verify with a controlled pre-refresh failure that the previous Serving snapshot is not replaced.
- [x] Run staging cleanup and expired Storage-object deletion on every daily task, including no-op days.
- [ ] Monitor PostgreSQL and Storage free-tier usage after the first retention window.
- [x] Record each production run in `etl_runs` with source dates, counts, status, and pipeline version.

## Current Milestone: Nationwide Data Expansion

Expand the production database from Seoul, Gyeonggi, and Incheon in bounded regional waves. Each wave must complete a read-only build, regional quality audit, capacity check, controlled Supabase upload, Serving refresh, and frontend smoke test before the next wave begins. Do not replace the current capital-region snapshot until the new regional rows pass the same gates.

### Expansion order

1. **N0 — pipeline generalization:** remove capital-region allowlists from active school, apartment, assignment, audit, monitoring, and upload paths; replace them with one versioned region registry. Keep report-only regional assumptions outside the production ETL.
2. **N1 — metropolitan pilot, one region at a time:** Daejeon, Daegu, Busan, Gwangju, and Ulsan as full metropolitan-city scopes, plus Mokpo as a bounded `전라남도 / 목포시` city pilot rather than a province-wide load. 광주 and Mokpo stay in this queue and run their EDA like every other scope; their build work follows the EDA, and their scope names resolve through the registry while the sources still carry pre-merger values (I-20). These regions are a queue, not a batch. Each one starts with its own EDA pass and finishes its release gates before the next one begins, because school-zone records are organized differently by education office and sometimes differently by district inside a single office.
3. **N2 — remaining high-density scopes:** add Sejong and Jeju, then provincial capitals and major cities in Gangwon, Chungcheong, Jeolla, and Gyeongsang provinces.
4. **N3 — rural completion:** expand county-by-county, prioritizing source coverage and manual validation for wide school zones, sparse apartments, islands, and address/geocoding exceptions.
5. **N4 — nationwide steady state:** enable nationwide recurring collection only after every regional wave has an accepted baseline and storage/database growth remains within the approved operating budget.

### N0 implementation backlog

- [x] Define a canonical registry for all 17 first-level administrative regions, NEIS/KERIS office codes, legal-dong prefixes, aliases, coordinate bounds, and optional city filters. `etl/region_registry.json` plus the `etl/region_registry.py` loader; 15 tests in `etl/tests/test_region_registry.py`. The registry separates verified values from assumed ones (`school_name_prefix_status`, `bounds_source`), and only a `verified` school-name prefix may be stripped during matching. Capital-region bounds are measured and contain all 2,260 production schools; every other region carries an approximate envelope that its EDA pass must replace.
- [x] Inventory every capital-region constant and classify it as production scope, validation rule, historical baseline, naming artifact, or research-only code: `REGION_SCOPE_INVENTORY.md`. The two that change behavior most are the single hardcoded coordinate box in `audit_operational_backend.py`, which would reject Busan, Jeju, and Ulleung outright, and the `경기도`-only city-level branch in the frontend address parser.
- [ ] Generalize `fetch_schoolinfo_2026.py`, K-apt collection, school/apartment builders, `build_operational_masters.py`, and upload manifests to accept explicit region/city scopes. **Collectors and builders done**: both take `--regions`/`--cities`, default to the registry's production regions, and were checked for parity — the capital filter keeps all 2,313 Schoolinfo rows and selects the identical 9,645 K-apt codes. The default output slug stays `capital`. **Builders, the backend audit, the recurring runner, and the frontend** now read region scope from the registry. The audit checks each row against its own region's envelope instead of one capital-region box and still reports 52/52; each run records its resolved scope and per-region row counts; the frontend reads a generated `src/constants/regionRegistry.ts`, with a drift test that fails when the registry changes without regeneration. Remaining: applying migration `16` to Supabase.
- [ ] Replace the three-region database checks on apartment tables with nationwide-valid region validation without weakening `NOT NULL`, foreign-key, RLS, or source-traceability guarantees.
- [ ] Parameterize backend audits by selected scope and add per-region counts, coordinate bounds, duplicate keys, unmatched schools, unassigned apartments, and review-required rates.
- [ ] Extend ETL schedule and run metadata so each execution records the exact region/city scope and can be retried or rolled back independently.
- [ ] Establish pre-upload capacity budgets for PostgreSQL rows, indexes, Storage snapshots, Serving refresh time, and public map query latency.
- [ ] Add automated tests for one metropolitan region and the Mokpo city-filter case before collecting production-sized inputs.

### Per-region EDA gate

Every region and city scope passes an EDA pass before any build or upload work for it starts, and no region is collected in parallel with another. The capital-region pipeline encodes assumptions that hold for three education offices and must not be assumed to hold anywhere else: school-zone labels are written per office, and districts inside one office can differ from each other.

The EDA output for a scope is a dated profile that answers, with counts and examples rather than prose:

- [ ] School-zone label format per district: naming pattern, whether the school name carries a region prefix, and how the label relates to the official school name.
- [ ] Which label-to-school matching method the scope needs, and whether the capital-region segmentation approach applies unchanged.
- [ ] Shared and joint school zones (`공동통학구역`), one-way zones, and how many apartments they affect.
- [ ] Branch schools (`분교장`), small schools, and schools whose zone record is missing entirely.
- [ ] Address shape: whether the scope has a city level, general-purpose districts, or 읍/면/리, and what the neighborhood level is.
- [ ] Source field values for this scope: K-apt `시도`/`시군구` spellings, education-office name, legal-dong code prefix, and whether renamed or merged region values appear. Sources migrate at different times, so record which spelling each source uses at the scope's collection date rather than assuming one.
- [ ] Measured coordinate bounds, replacing the registry's approximate envelope.
- [ ] Anything that differs from the capital-region assumptions, stated explicitly as a required code change.

A scope whose EDA reveals a matching method the pipeline does not support is paused, not forced through with similarity matching. The registry records unverified assumptions as `assumed`; the EDA pass is what promotes them to `verified`.

### Per-wave release gates

These thresholds were set on 2026-09-17 from the capital-region baseline: 52/52 backend checks, 247 of 20,421 assignment units (1.2%) marked `review_required`, 98.4% agreement between the polygon spatial join and Geomarket, a 1.2-2.4 second initial map read, and 0.26-0.43 second apartment reads. Change a threshold only through an Update Log entry that states the reason; never relax one to let a failing wave pass.

| Area | Pass criteria |
| --- | --- |
| Source completeness | Every input for the scope has a dated manifest entry and SHA-256 checksum. The NEIS school count for the scope matches `school_master` within ±1%, and every difference is listed with a reason (closure, branch school, new opening). |
| Data quality | The scoped backend audit passes 100% of its checks. 0 orphaned assignments, 0 duplicate canonical keys, 0 school coordinates outside the registry bounds. Apartment assignment coverage is ≥ 98%. `review_required` is ≤ 3% for metropolitan and city scopes and ≤ 10% for county scopes. Where Geomarket is available, spatial-join agreement is ≥ 97%. Unresolved records stay reviewable and are never silently matched. |
| Manual QA | A stratified sample of at least 50 apartments per metropolitan region and 30 per city or county scope, covering urban core, suburban edge, new town, shared zone, and no-hit cases. 0 wrong-school assignments in the sample; one stops the wave. |
| Supabase / RLS | The migration is idempotent and passes a second run. The anonymous role reads only `school_master` and `school_apartment_serving` and cannot read any control, staging, snapshot, or normalized table, verified explicitly rather than assumed. No new public table or RPC. Writes use the service role only. |
| Capacity | PostgreSQL (tables plus indexes) stays ≤ 70% of the plan limit after the wave, and Storage snapshots stay ≤ 70% under 45-day retention. Measured growth is within ±25% of the pre-wave projection; a larger miss stops the next wave until the projection is redone. |
| Performance | Public smoke passes at 360/390/430/1280 px. Initial map read ≤ 2.5 s, apartment read ≤ 0.5 s, school search ≤ 1.0 s, measured in production. The 5 s and 3 s smoke budgets remain hard failure limits. `refresh_school_apartment_serving()` completes with at least 50% headroom under the statement timeout. |
| Rollback | Per-region row counts for every operational table are recorded **immediately before** the upload and compared against that snapshot afterwards, not against the reviewed-inputs baseline: production moves ahead whenever a scheduled run loads a newer source. Uploads are scoped so one wave can be deleted by region/city scope and a Serving refresh restores the pre-load counts exactly. Capital-region counts are unchanged after every wave. A gate that fails after upload triggers rollback before investigation. |
| Operations | `/admin/etl` shows the wave's scope, source dates, row deltas, and quality checks, and the run is recorded in `etl_runs` with its exact scope. |

### Stage exit criteria

| Stage | Scope | Additional exit criteria |
| --- | --- | --- |
| **N0** | No new data | Capital-region behavior is unchanged: the portable read-only build still matches all seven row counts and canonical checksums in `portable_readonly_baseline.json`, and 52/52 checks plus public smoke pass. The registry-backed region migration is applied and the anonymous-access check passes. A scoped rollback rehearsal restores exact counts. The N1-N4 capacity projection is recorded. |
| **N1** | Daejeon, Daegu, Busan, Gwangju, Ulsan; `전라남도 / 목포시` | Every shared gate passes for each of the six scopes separately. The Mokpo scope publishes 0 rows outside `목포시`, and no other Jeollanam-do city appears in any public read. District drilldown works in all five metropolitan cities. |
| **N2** | Sejong, Jeju, then provincial capitals and major cities | Sejong's fast-changing new-town zones are validated against the latest school-zone file date. Jeju and Sejong address parsing produces correct district and neighborhood grouping. Province → city → district drilldown works for cities with general-purpose districts such as Cheongju and Jeonju. Renamed-region aliases resolve to one canonical name. |
| **N3** | Remaining counties, rural and island areas | County-scope `review_required` ≤ 10%. Branch schools and shared school zones are represented without duplicate schools. Every island school zone is checked manually. Apartments with no assignment stay visibly unassigned rather than being attached to the nearest school. |
| **N4** | Nationwide recurring collection | Every regional baseline is accepted. Two consecutive scheduled nationwide runs complete with all checks passing. Run time fits the schedule window, capacity stays within the 70% budgets after one full retention window, and failure alerts are verified. A plan upgrade or a shorter retention period is a user decision, not an automatic fallback. |

### Deferred report backlog

- [ ] **Deferred — owner will resume manually:** continue the archived school/housing quadrant report generation and its analysis inputs.
- [ ] Regenerate snapshot-bound report figures only after the relevant nationwide expansion wave is accepted; report work is not a blocker for N0 or N1.

## Current Milestone: ETL Monitoring

- [x] Add SQL `12` schedule, scope, run-check, and Supabase Auth administrator contracts.
- [x] Record run scope, trigger type, attempt number, row-count checks, Serving rows, and staging cleanup in the recurring runner.
- [x] Build the authenticated `/admin/etl` dashboard with cadence, regional scope, runs, snapshots, and quality gates.
- [x] Keep the dashboard out of the public map bundle through lazy loading; pass lint, typecheck, and production build.
- [x] Verify the administrator login layout on desktop and mobile.
- [x] Apply `12_create_etl_monitoring_dashboard.sql` in Supabase.
- [x] Create a Supabase Auth user and register its UUID in `etl_admin_users`.
- [x] Run a post-SQL-12 recurring pilot and verify authenticated dashboard reads: four schedules, six runs, six snapshot records, and eight passing checks.
- [x] Install project-pinned `agent-browser` and Chrome for Testing; add a repeatable admin-dashboard smoke command.

## Next Milestone: Frontend UX

- [x] Audit the current school search, map, filter, and school-detail workflows on desktop and mobile.
- [x] Add mobile filter accessibility, inert closed-drawer behavior, stable marker refresh, and viewport-aware clustering.
- [x] Add a nearby-school entry point: restore previously granted geolocation automatically and provide an explicit `내 주변` control without prompting on first visit.
- [x] Reorder school detail around grade-1 students/classes/per-class, then show key assigned-apartment fields from the existing two-table contract.
- [x] Reuse the apartment query result between the school summary and full apartment list; verify 서울대곡초 on desktop and mobile.
- [x] Restore the legacy v1 map language: full-screen map, white school-name markers, district summary pills, restrained hover, and a non-dimming bottom detail sheet.
- [x] Show assigned apartment name and household-count markers after school selection; share one Serving query with school detail and open apartment detail from the marker.
- [x] Define the frontend theme, entity colors, unified-search behavior, scoped filter model, and phased UX delivery plan.
- [x] Implement shared design tokens and replace the primary map/search/filter/navigation colors, icons, radii, and layer values.
- [x] Add a deduplicated school/apartment search contract and grouped unified-search results.
- [x] Separate school and assigned-apartment filter scopes, add direct chips, and keep staged mobile apply in the full panel.
- [ ] Add location filters only after the P4 station/address source contract is approved.
- [x] Select KRIC's nationwide urban-rail station file as the station master source and add a local XLSX/CSV profiler before station schema approval.
- [x] Add explicit loading, empty, and recoverable error states for school-map and assigned-apartment reads.
- [ ] Add source-freshness and stale-data indicators after the public Serving contracts expose source timestamps.
- [x] Measure map and assigned-apartment reads against 5-second and 3-second smoke budgets.
- [x] Improve mobile filter and detail-panel ergonomics without changing the finalized two-table data contract.
- [x] Add a repeatable `agent-browser` smoke scenario for public map load, filters, search, school detail, apartment reads, responsive widths, and request budgets.
- [ ] Extend the repeatable smoke suite to the authenticated ETL dashboard with a non-personal test account.
- [ ] **Deferred until after v2.2 frontend work:** Package reviewed local assignment inputs as a versioned portable bundle, then migrate recurring execution from the logged-in Windows task to GitHub Actions.
- [x] Replace the incomplete five-file portability bundle with build-complete v2 inputs: eight files, 50,553,797 input bytes, and an 8,383,649-byte local ZIP.
- [x] Reproduce all seven operational outputs from the local v2 bundle without database writes; pass 52/52 backend checks and lock Windows row counts plus SHA-256 values as the remote comparison baseline.
- [x] Make the comparison baseline platform-independent: hash JSON outputs by canonical content rather than raw bytes, so a Linux Actions run can match the Windows baseline.
- [x] Upload portability bundle v2 to its versioned private Storage path, verify its remote archive and eight member checksums, and confirm anonymous download is blocked.
- [x] Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as GitHub Actions secrets and pass read-only GitHub Actions run `34242752216`; all seven output row counts and canonical checksums match the locked Windows baseline.
- [ ] Keep the Windows task as fallback and require separate approval before enabling scheduled GitHub Actions database writes.

### v2.2 P3 And Follow-up Order

1. **P3 frontend contract completion:** expose the already-stored `building_count` value through the apartment TypeScript model and the list/detail UI. No SQL or Serving refresh is required unless live completeness checks reveal missing uploads.
2. **P3 verification:** check null handling, representative complex values, school/apartment navigation, 360/390/430/1280 layouts, public smoke tests, and map/apartment request budgets before commit and deployment.
3. **P4 location discovery:** choose station and address-search sources, then document identifiers, aliases, coordinates, licensing, API cost, refresh cadence, and proximity semantics. Do not add public tables before this contract is approved.
4. **P5 ETL portability:** the reviewed-input bundle now reproduces successfully in read-only GitHub Actions. Retain Windows scheduling as fallback and enable remote database writes only after separate approval and a monitored production run.
5. **P5 admin QA:** create a non-personal authenticated test account and automate monitoring-dashboard checks without placing credentials in the repository.
6. **P6 future data pilots:** run academy, timetable, and playground pilots independently; production schema work begins only after each domain's quality, legal, product, and free-tier gates pass.

P3 exit criteria are: `building_count` is visible where available, absent values render cleanly, no schema migration is introduced, frontend quality commands and browser QA pass, and the deployed production alias is verified. Station search, address search, GitHub Actions migration, and new data domains are explicitly not part of P3.

P3 implementation status: production verification passed on 2026-09-06 (`cafe111`). Serving coverage is 19,502 of 20,891 rows (93.4%); 은마 renders as 4,424 households and 28 buildings, while missing values remain hidden. The production smoke measured a 1.20-second initial map read and 0.28-0.35-second apartment reads.

### v2.1 Map Discovery Sprint

Detailed behavior and acceptance checks are maintained in [`../ux/FRONTEND_UX_SYSTEM_PLAN.md`](../ux/FRONTEND_UX_SYSTEM_PLAN.md).

- [x] P1: add shared layout/layer tokens, safe-area-aware `지도 / 소식 / 즐겨찾기` GNB, and mobile zoom-control removal.
- [x] P2: redesign the rounded search surface and add a horizontally scrollable quick-filter bar below it.
- [x] P2: keep SQL `13` as the filter contract and verify frontend cache keys and combined-filter requests against its existing parameters.
- [x] P2: keep the equalizer icon as the full-filter entry and expose establishment type, grade, students, households, and parking as direct chips.
- [x] P3: sort district-sheet neighborhoods by selected-grade students and replace threshold text with accessible blue/amber count circles.
- [x] P4: build local-first school/apartment favorites and define the editorial contract before enabling the published news feed.
- [x] Verify mobile/desktop layering, navigation-state preservation, filter equivalence, district drilldown, favorites, and all frontend quality commands in production.

## Future Milestone: Additional Data Domains

This section incorporates the final decisions previously maintained in `FUTURE_DATA_DOMAINS_PLAN.md`. No candidate domain may change the production schema until its remaining product, quality, legal, security, and capacity gates pass. Raw snapshots stay private and candidate data stays outside the current two-table public frontend contract.

### Academy and tutoring centers — proceed after geocoding gate

Discovery established that `acaInsTiInfo` returns 71,690 capital-region institutions, `ACA_ASNUM` is a stable one-row-per-institution key, and school-district joins cover 100%. Elementary-course classification is not viable because only 14.7% explicitly identify an elementary audience; use density and subject composition instead of claiming elementary eligibility.

- [x] Renew the VWORLD credential outside the repository and verify address geocoding (2026-09-16 to 2026-09-18).
- [x] Geocode a stratified 300-address sample: 291/300 matched (97.0%); all nine failures were `NOT_FOUND`, not authentication errors.
- [x] Refresh the NEIS capital-region snapshot to 71,692 institutions and geocode 29,664 unique road addresses: 29,274 matched (98.69%).
- [x] Build one private address-level marker candidate with institution count and subject composition; keep raw addresses and coordinates outside Git.
- [x] Fix proximity semantics: use a 600 m straight-line core and a separate 600-800 m extended band; model `academy -> nearby apartment -> assigned school` as derived proximity, never as an official school assignment.
- [x] Collect VWorld building polygons for the 3,632 complexes with at least 500 households that lacked prior building points. All requests succeeded; 2,498 passed the 75-125% official-building-count gate and 1,134 remain representative-point fallbacks.
- [x] Validate the hybrid origin rule across 4,285 large complexes: 3,057 have trusted building-centroid coverage, while 1,228 use the complex representative point. At 600 m, trusted building origins add 20,983 deduplicated academy-address links versus representative points.
- [x] Design one privacy-minimized map marker per address with institution count and subject composition; exclude raw addresses and institution names from the public candidate.
- [x] Reject the 1,075,094-row materialized link candidate in favor of 29,274 address markers, 53,373 proximity origins, 20,172 apartment summaries, and an indexed on-demand RPC (`sql/14`, not yet applied).
- [x] Review and apply SQL `14`, upload the three serving candidates, and verify exact service-role/anonymous counts plus the anonymous proximity RPC.
- [x] Benchmark the anonymous RPC across sparse, median, dense, and maximum-density complexes: median latency was 182-346 ms and all returned counts matched the precomputed summaries.
- [x] Connect an apartment-scoped, default-off frontend academy layer. Address markers expose only institution counts, distinguish 0-600 m core from 600-800 m extended results, and reset whenever the selected apartment changes.
- [ ] Verify marker rendering on an allowed Naver Maps domain and decide whether address-marker selection should open a compact subject-composition sheet.
- [ ] Add a weekly collector, private snapshots, schema-drift checks, monitoring, storage estimates, and an RLS-protected serving contract only after product approval.

### Elementary timetables — deferred on product value

The technical pilot passed: school-code linkage reached 99.91%, weekly repetition was 97%, and a pattern-plus-exception nationwide annual estimate was 126 MB. The domain remains deferred because national curriculum hours provide little school-selection differentiation and the likely audience does not match the product. If resumed, limit discovery to school-specific creative-experience program tags collected once per semester; creating `school_master.neis_school_code` remains a prerequisite because current production coverage is 0%.

### Apartment sale transactions - linkage refinement in progress

The MOLIT transaction source can be linked to `canonical_complex_id` through legal-dong district, legal-dong name, lot number, and normalized apartment aliases. It does not provide the K-apt code, so linkage must remain tiered and auditable. See [`../decisions/ADR-005-apartment-transaction-linkage.md`](../decisions/ADR-005-apartment-transaction-linkage.md).

- [x] Add a private-source profiler that records API field population and apartment-master match tiers without committing raw transactions.
- [x] Confirm that the current apartment master contains the legal code, lot address, aliases, and canonical ID required by the proposed match contract.
- [x] Obtain data.go.kr authorization for detailed apartment sale API `15126468` and confirm the detailed endpoint works.
- [x] Run August 2026 samples for Jongno, Gangnam, Bundang, and Yeonsu: 647/683 transactions linked (94.73%).
- [ ] Add an audited `aptSeq` crosswalk, road-name matching, and newly completed complex refresh; then require at least 95% deterministic linkage before designing production tables.
- [ ] Model cancellations and corrections, then publish only complex-level monthly aggregates; keep individual transaction rows private.

### Children's playgrounds — blocked pending legal review

- [ ] Confirm commercial-use and derivative-work compatibility with the stated Korea Open Government License Type 4 conditions.
- [ ] Confirm whether location-information business registration or notification applies to this product.
- [ ] Request an API key only after both legal gates pass.
- [ ] Then validate the source CRS and coordinates against at least 100 addresses, profile stable IDs and duplicates, and estimate annual storage before any schema work.
- [ ] Preserve separate source records for colocated facilities; do not infer school or apartment assignment from proximity.

### Shared production gates

- [ ] Extend monitoring domain constraints and cadences only through an approved migration.
- [ ] Add source-key, geocoding, linkage, coordinate, freshness, and retention checks appropriate to the approved domain.
- [ ] Estimate PostgreSQL, index, and Storage growth before recurring collection.
- [ ] For any exposed serving table or RPC, retain least-privilege grants and RLS and verify anonymous access explicitly.

## Refresh Runbook

1. Archive source files in private Storage and record their checksums.
2. Load transient staging data and run schema/completeness checks.
3. Upsert normalized school, apartment, and assignment masters.
4. Call `refresh_school_apartment_serving()` in Supabase.
5. Run backend audit and remote count/RLS checks.
6. Run a frontend smoke test; publish the run only when all checks pass.

Current pilot commands, run from the project root:

```bash
python etl/run_recurring_etl.py
python etl/run_recurring_etl.py --apply
python etl/run_due_etl.py
npm run browser:smoke
```

The first command is read-only. Use `--build` when newly collected source files must rebuild all local outputs before the audit.

## Open Issues

| ID | Status | Issue and handling |
| --- | --- | --- |
| I-01 | Resolved | SQL `09` was re-applied with `DELETE ... WHERE TRUE`; the refresh returned 20,891 rows and preserved the frontend/RLS contract. |
| I-02 | Accepted v1 | 247 수도권 building-match failures retain official representative-point assignments with `review_required=true`. |
| I-03 | Review queue | Apartment name, shared-complex, coverage, and property conflicts remain traceable and must not be silently auto-resolved. |
| I-04 | In progress | Nationwide expansion is now the current data milestone. Execute N0 pipeline generalization, then N1 metropolitan pilots; Building HUB/GIS/address-building integration and regional validation remain release gates. |
| I-05 | Monitor | Track PostgreSQL and Storage usage before retaining additional raw snapshots on the Supabase free tier. |
| I-06 | Resolved | SQL `10`, the two-table upload, remote RLS verification, and rental-ratio range constraints are complete. |
| I-07 | Resolved | Apartment age offers an unrestricted option; an old-complex sample passed the browser smoke test. |
| I-08 | Monitor | Naver Maps local authorization is configured for `localhost`; `127.0.0.1` is not an equivalent authorized origin. |
| I-09 | Review queue | Four K-apt rows report public-rental units above total households. Their rental breakdown and ratio are stored as null, `review_required=true`, rather than publishing impossible values. |
| I-10 | Resolved | SQL `11` and the first recurring pilot completed. Three source objects use about 12.2 MB, staging was purged, and the run is recorded as completed. |
| I-11 | Resolved | SQL `12`, one administrator UUID, the post-migration pilot, anonymous blocking, and authenticated monitoring reads are verified. |
| I-12 | Accepted v1 | The Windows task uses interactive logon and runs only while the ETL workstation user is logged in; `StartWhenAvailable` catches a missed run after login. |
| I-13 | In progress | The reviewed-input bundle is stored privately and read-only Actions run `34242752216` passed remote restore, tests, 52/52 checks, and all seven Windows-baseline comparisons. Keep the Windows task as fallback and require separate approval before enabling scheduled database writes and monitoring the first production run. |
| I-14 | Product contract pending | Academy geocoding passed: 29,274/29,664 unique addresses (98.69%). Decide apartment-radius semantics, marker UX, and private/public serving boundaries before production ingestion. |
| I-15 | Deferred | Timetable linkage and volume gates passed, but product value is insufficient. Resume only as a bounded creative-experience program pilot with a defined user feature. |
| I-16 | Blocked pending review | Playground data states Korea Open Government License Type 4 and location-information business requirements. Confirm commercial-use and location-service eligibility before API ingestion or publication. |
| I-17 | Resolved | The 학구도 source was not lost. The 2026-08-28 archiving pass had moved it to `archive/elementary-v2-pre-operational-20260828/etl/data/hakgudo/`, leaving empty directories behind; all 13 files were moved back to `etl/data/hakgudo/` on 2026-09-20 and verified readable. No download was needed. |
| I-18 | Corrected before use | The registry first carried assumed school-name prefixes for 부산, 대구, 광주, 울산. Measurement showed 부산 1.3% and 울산 4.0%, so those assumptions were wrong and are replaced by measured coverage. The per-region EDA gate caught this before any matching code used it. |
| I-19 | Open | Two 학구도 snapshots are present locally and `verify_hakgudo_spatial_join.py` points at the older one: `elem_hakgudo_20250922.shp` (`BASE_DT` 2025-09-22, 7,123 zones) versus `20260320/extracted/초등학교통학구역.shp` (2026-03-20, 7,140 zones). The 2026-03-20 file matches the school standard data the pipeline already uses, and for 대전 it carries 170 zones instead of 167. Choose the snapshot explicitly per run and record it in the manifest before the Daejeon build. |
| I-20 | Source layer done; migration pending | 광주시 and 전라남도 merged into **전라남도광주특별시** on 2026-07-01, and their education offices merge too. K-apt already writes the merged value (as 전남광주통합특별시) in its 시도 column and 법정동주소, while every source feeding the assignment backbone — the school standard data, the 학구도 polygons, and K-apt's own road addresses — still writes both names separately. Both halves therefore remain separate registry regions and `resolve_source_region()` translates either spelling of the merged value by 시군구 or road address; all 21,712 K-apt rows resolve into exactly 17 regions. Remaining work, due when the school and school-zone sources publish merged naming: collapse the two regions into one with a per-area address depth (광주 has no city level, 전남 does), merge the education office entries, and decide the displayed region name. |
| I-21 | Resolved | The portable read-only build was not hermetic on the ETL workstation: `build_apartment_master_v1.latest_kapt_source()` globbed the output directory and picked that morning's scheduled snapshot (`kapt_basic_20260918.csv`) instead of the bundle's reviewed input (`kapt_basic_20260904.csv`), so the locked baseline failed locally while a clean Actions runner passed. The builder now takes `--kapt-source` (or `ELEMENTARY_KAPT_SOURCE`), rejects a file it cannot date, and prints the snapshot it used; the read-only runner pins it to the materialized bundle input. The baseline now matches on this workstation: all seven files and 52/52 checks. |
| I-22 | Monitor | Production has moved ahead of the reviewed-inputs baseline, as designed: `apartment_complex_master` holds 21,178 rows against the bundle's 20,164, with `source_as_of` values up to 2026-09-18 from the scheduled Windows runs, while `school_master` (2,260) and `school_apartment_serving` (20,891) are unchanged. Nothing is out of scope — every row is in a production region. Treat the locked portability baseline as a reproducibility contract for the reviewed inputs, never as an expectation for live row counts; wave rollback compares against a snapshot taken just before that wave. |
| I-23 | Fix written, not applied | `etl_staging_rows` reached 3,296,176 rows and 3.11 GB, 95% of the database, while the operational tables stayed small: Serving is 24.2 MB and the complex master 24.1 MB. `cleanup_recurring_etl` deleted by `staged_at`, which has no index, so once the table grew every call scanned the whole table and was cancelled by the statement timeout, and each run added about 92,000 more rows. Migration `17` rewrites the cleanup to delete per run through the primary key with a bounded batch, adds size RPCs, and the runner now fails rather than warns when staging is left behind. Apply 17, then TRUNCATE to reclaim: DELETE alone leaves the file at its current size. |

## Update Log

- 2026-09-26: Found why the database is 3.3 GB, and it is not the expansion. `etl_staging_rows` holds 3,296,176 rows across about 36 runs' worth of staging because the retention delete filtered on an unindexed `staged_at` and timed out once the table grew, and the post-run check recorded a warning rather than a failure. Migration `17` deletes per run through the primary key in bounded batches, adds `etl_staging_depth()` and `public_table_sizes()`, and `etl/check_capacity.py` now measures the capacity gate instead of estimating it. Also corrected my own projection: measured against the real sizes, the nationwide estimate is about 230 MB rather than the 119 MB reported on 2026-09-23, because the earlier multiplier understated JSONB and index overhead by roughly half.
- 2026-09-23: Built the remaining six provinces and 전라남도 in full, completing all seventeen regions: 6,302 schools, 45,915 canonical complexes, and 60,520 serving rows against the 2,260 / 20,164 / 20,891 in production. Four more zone-suffix formats appeared, the largest being 광역통학구역, which alone held 경상남도 at 86.0%; it now reads 99.7%, and every province is above 98%. The capital outputs still match the locked baseline after each label change. 300 review cases are pooled nationwide. One question is left open for the product rather than decided in the pipeline: 경북 generates 10,308 serving rows from 2,882 assignments because a 경주 zone names 17 schools and 484 complexes nationwide are assigned to nine or more.
- 2026-09-23: Built 광주, 세종, 제주, and the 전라남도/목포시 city pilot. The Schoolinfo API already uses the merged 전남광주통합특별시 for both the education office and the address, which the registry knew only as a K-apt value, so 광주 and 목포 silently fetched 0 rows and produced school masters with no statistics. The registry now resolves merged offices and addresses by the district that follows them and canonicalizes addresses before comparison, which also restored exact-address matching for 광주 at 155/155. Added 제한적공동통학구역 to the label formats, taking 전남 from 76.6% to 99.0%, and found joint zones that name schools in a neighbouring region: 전남 names 광주 schools and 세종 names 충북 and 충남 ones, which a single-region build cannot resolve. Fixed a defect of my own making along the way: the school builder matched any scope's Schoolinfo file when the slug was omitted, so the capital build had started reading Busan's snapshot; the slug is now required and the locked baseline matches again. 49 review cases pooled across seven regions, plus 13 for 목포.
- 2026-09-22: Built 대구, 부산, and 울산 beside 대전 and parked their review cases for one batch review instead of resolving them region by region. The zone profiler caught Daegu at 94.8%: it writes joint zones as 일방향공동/양방향공동, which the matcher did not strip, and every 군위 zone failed. Widening that expression took Daegu to 100% and left the capital outputs byte-identical against the locked baseline. Also fixed a latent crash in the school builder, which sorted a counter containing None and had never seen an unmatched school before. Audits: 대전 and 울산 52/52, 대구 51/52, 부산 49/52, with the failures being exactly the parked cases. 36 review rows across the four regions, 25 distinct subjects.
- 2026-09-22: Verified migration 16 live with a new read-only checker, `etl/verify_region_registry_contract.py`: 14/14 checks pass. All 17 regions are seeded with only the three capital ones in production, the registry version matches the local file, anonymous reads of `region_registry` are refused while both public tables still read normally, the schedules follow the production regions, and every region-backed table holds only production regions. The three foreign keys are proven by asking PostgREST to embed `region_registry`, which only works through a real foreign key. The run also showed production sitting ahead of the reviewed-inputs baseline from scheduled loads, recorded as I-22, and the per-wave rollback gate now compares against a pre-upload snapshot rather than the frozen baseline numbers.
- 2026-09-21: Finished the remaining N0 code items. `audit_apartment_etl.py` now takes its legal-dong prefixes from the registry, resolves K-apt rows through `resolve_source_region()` so merged region values split instead of dropping, and reports per region. `build_school_master_v2.py` derives region from the registry and treats the collector's scope slug as opaque, so a new wave needs no change there. Closed two items deliberately rather than generalizing them: `audit_school_etl.py` audits v1 snapshots that no longer exist and nothing calls it, so it is annotated as historical, and the `_capital` file names stay because `capital` is just the slug for the production scope. Verified against the locked baseline: the portable read-only build still matches on all seven files with 52/52 checks.
- 2026-09-21: Wrote `sql/16_create_region_registry_contract.sql`, generated from the registry. It replaces migration 06's literal three-region CHECK constraints with a private `region_registry` table and foreign keys from the two apartment tables plus `school_master`, which had no region validation at all, and repoints the migration-12 schedule scopes at whatever is flagged production. Promoting a region becomes an UPDATE rather than a new migration. All 17 regions are seeded with only the three capital ones in production, so applying it changes no current behavior. The file number is 16 because 14 and 15 are the academy migrations. Not applied yet: it needs approval and a live check, and the guide carries the verification queries.
- 2026-09-21: Scoped the map's school read to the regions actually on screen. `fetchDistrictOverviewData` took no bounds and paged every school matching the filters, which is what made the initial read 2.21 s for 2,260 rows and would have paged roughly 6,300 nationwide; it now intersects the selected regions with the registry envelopes for the current viewport, and the aggregate read honors the region filter too. District and neighborhood totals stay full-area rather than viewport-clipped, because a district never spans two regions. The initial read fell to 0.89 s, and the public smoke passed at all four widths.
- 2026-09-21: Moved the frontend onto the registry through a generated `src/constants/regionRegistry.ts`: default selected regions, the news region filter, region map centers, and the address parser's city level, which was previously a `경기도`-only branch and now covers every province plus Jeju and Sejong. Capital map centers keep their existing government-office coordinates, so the map does not shift. Verified with lint, typecheck, build, and the public browser smoke at 360/390/430/1280 px: all checks passed, initial map read 2.21 s and apartment reads 0.53-0.77 s, inside the 5 s and 3 s budgets. The 2.21 s is measured on an unscoped 2,260-row read, which is why the region-scoped school read stays on the N0 list.
- 2026-09-21: Fixed I-21 and restored the local regression gate. The apartment builder now requires an explicit K-apt snapshot for a reproducible build instead of discovering the newest local one, and `run_portable_readonly_build.py` pins it to the file the bundle restored. The portable read-only build now reports `match: true` on this workstation, which also confirms the registry move in the builders and audit against the locked baseline rather than only against a before-and-after comparison.
- 2026-09-21: Moved the builders and the backend audit onto the registry: address-derived region, legal-dong prefixes including legacy codes, the school-name prefix used for zone matching, and per-region coordinate bounds replacing the single capital box. Proven output-neutral — the portable read-only build produces byte-identical output with and without the change, checked by running it both ways. That run also exposed I-21: the build is not hermetic on this workstation, because the apartment builder picks the newest local `kapt_basic_*.csv` (2026-09-18) rather than the one the bundle restored (2026-09-04), so the locked baseline fails here while a clean Actions runner passes.
- 2026-09-21: Parameterized both collectors by scope through the region registry. `fetch_schoolinfo_2026.py` filters by education office or address and `fetch_kapt_current.py` resolves the `시도` column, so merged post-2026-07-01 values split by 시군구 instead of being dropped. Verified against the real sources that the capital scope is unchanged (2,313 of 2,313 Schoolinfo rows, an identical 9,645 K-apt codes) and that new scopes work (대전 568 codes, 전라남도/목포시 146). Added a package-import bootstrap so the scheduled runner can keep invoking these by file path; 46 Python tests pass.
- 2026-09-21: Confirmed the merged region's official name (전라남도광주특별시) and that the education offices merge as well. The registry now records the official name alongside the K-apt spelling, resolves either spelling identically, and refuses both through `get()`; 23 registry tests pass. The full collapse into one region with a per-area address depth and a merged education office waits until the school and school-zone sources migrate. 광주 and 목포 remain in the N1 queue with EDA first.
- 2026-09-20: Confirmed the 광주-전남 merger of 2026-07-01 and added registry source translation for it: both halves stay separate regions, `resolve_source_region()` splits the merged source value by 시군구 or road address, and `get()` refuses the merged value outright. Validated on the full K-apt file — all 21,712 rows resolve into exactly 17 regions, 광주 932 plus 전남 778 matching the 1,710 merged rows, with the only 2 disagreements being unrelated source errors. Registry tests now number 21.
- 2026-09-20: Completed the Daejeon apartment EDA on the 2026-03-20 school-zone snapshot. All 1,063 Daejeon complexes have coordinates and fall inside exactly one school zone (100%, no duplicates and no representative-point fallback needed), and K-apt links to the base master at 81.8% by exact road address, with 80 rows carrying no road address and 27 storing two addresses in one field. Found that K-apt now reports `전남광주통합특별시` in place of 광주광역시 and 전라남도 while every other source, including K-apt's own road addresses, keeps them separate; recorded as I-20 because it redefines two N1 scopes.
- 2026-09-20: Moved the 학구도 source back from the archive to `etl/data/hakgudo/` and verified both snapshots read correctly. Daejeon segments at 100% on either one (167/167 on 2025-09-22, 170/170 on 2026-03-20), with only the two private schools lacking a zone. Recorded the snapshot-version choice as I-19.
- 2026-09-20: Completed the Daejeon school-zone EDA. All 167 Daejeon zones (139 단독, 28 공동) segment into known schools at 100% using the existing `match_school_zone` with registry-driven name variants, so the capital matching method needs no replacement for this scope; the only 2 schools without a zone are private. Located the 학구도 source in the 2026-08-28 archive rather than re-downloading it.
- 2026-09-20: Ran the school half of the Daejeon EDA with the new reusable profiler (`etl/profile_region_schools.py`) and recorded it in `REGION_EDA_FINDINGS.md`. Measured all 17 regions while doing so: they account for all 6,303 nationwide elementary schools with no unresolved address, and every registry coordinate envelope is now measured rather than approximate. The school-name region prefix turns out to be measured, not categorical — 대구 96.6%, 서울 93.9%, 대전 80.6%, but 부산 1.3% and 울산 4.0%, and no region reaches 100% — so the registry now stores coverage and matching must accept both forms of every label. Daejeon's school-zone EDA is blocked: the 학구도 source is a local artifact and is no longer present.
- 2026-09-20: Started N0. Added the canonical region registry, its loader, and 15 tests; capital-region bounds are measured from the operational school master and the alias rules keep `경기도 광주시` from resolving to 광주광역시. Changed N1 from a five-region batch to a one-region-at-a-time queue and added the per-region EDA gate, because school-zone records are organized differently by education office and by district inside one office.
- 2026-09-17: Added quantitative per-wave release gates covering source completeness, data quality, manual QA, Supabase/RLS, capacity, performance, rollback, and operations, plus stage exit criteria for N0-N4.
- 2026-09-17: Reorganized active documentation into product, architecture, UX, operations, decisions, and reference sections. Promoted the newer joinmap baseline into a current `architecture/DATA_ARCHITECTURE.html` DRD with SQL 12–13, v2.2 P3, security boundaries, and nationwide rollout context; retained compatibility pointers at prior document paths for one release.
- 2026-09-16: Consolidated the future data-domain decisions into this authoritative plan and archived the superseded plan, dated analysis reports, visual reports, and analysis/research-only ETL outside the active application tree.
- 2026-09-16: Deferred the school/housing quadrant report generation to the owner-managed backlog. Promoted nationwide database expansion to the current data milestone, with N0 pipeline generalization followed by Daejeon, Daegu, Busan, Gwangju, Ulsan, and a bounded Mokpo city pilot; later waves cover remaining major cities and rural counties.
- 2026-09-09: Registered `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as repository secrets and passed read-only GitHub Actions run `34242752216` at `d3e29f1`. Ubuntu restored all eight private inputs, passed portability tests and 52/52 backend checks, matched all seven output row counts and canonical checksums, and uploaded the comparison artifact. The workflow performed no database or Serving writes.
- 2026-09-07: Fixed the portability comparison baseline, which could never have matched a Linux Actions run. JSON outputs are written through `Path.write_text`, so Windows stored CRLF and Linux would store LF, changing the byte hash without changing the data. `run_portable_readonly_build.py` now hashes JSON by canonical content (`sort_keys`, fixed separators) and keeps byte hashes for CSV, which `csv.DictWriter` writes as CRLF on every platform. Re-locked the five JSON baseline hashes; row counts and the two CSV hashes are unchanged. 13 Python unit tests pass and all seven outputs match the baseline. Remaining P5 work is unchanged: register Actions secrets and run the workflow.
- 2026-09-07: Regenerated the two 2026-09-06 analysis reports against the current snapshot. `verify_missing_school_sample.py` reproduced byte-identical output, but `analyze_report_clusters.py` did not: the operational outputs were rebuilt at 20:01 on 2026-09-07, which shifted school and complex cluster membership (school cluster 0: 730 to 707; complex cluster 0: 2,921 to 3,420 complexes, median 788 to 594 households). Committed the regenerated reports and corrected five figures in the Instagram carousel draft that still quoted the superseded run. Analysis reports are snapshot-bound and must be regenerated whenever operational outputs are rebuilt.
- 2026-09-06: Deferred station/address search after source-contract discovery. Added a checksum-locked five-file ETL portability manifest, generated a 4.35 MB bundle from 23.04 MB of reviewed inputs, uploaded it to private Storage, passed service-role restore, and confirmed anonymous download is blocked.

- 2026-08-28: Archived 146 pre-operational files under `archive/elementary-v2-pre-operational-20260828/` and added an active documentation index.
- 2026-08-28: Consolidated the current pipeline status; marked SQL `09` and recurring source ingestion as the next milestone.
- 2026-08-28: Reordered the plan to finalize the frontend data contract before recurring ETL and recorded the current frontend fixes and remaining field/index work.
- 2026-08-28: Finalized the two-table frontend contract locally, rebuilt outputs with K-apt parking/rental fields, and passed 51/51 backend checks. Remote SQL `10` application is next.
- 2026-08-29: Applied SQL `10`, uploaded 20,164 complex and 20,891 serving rows, verified the two-table anonymous contract, and passed desktop/mobile browser smoke tests.
- 2026-08-29: Rejected four impossible K-apt rental breakdowns, expanded the audit to 52/52 checks, and prepared idempotent 0-100 ratio constraints for one SQL `10` rerun.
- 2026-08-29: Re-ran SQL `10` and completed the frontend data-contract milestone, including the public-rental-ratio constraints.
- 2026-08-29: Installed SQL `09`; the first refresh test was safely rolled back by Supabase's predicate-free DELETE guard. Prepared a `WHERE TRUE` correction for re-application.
- 2026-08-29: Re-applied SQL `09` and verified an atomic Serving refresh: 20,891 rows before, inserted, and after, with public/private RLS unchanged.
- 2026-08-29: Added SQL `11`, the versioned source manifest, and a recurring ETL runner. The read-only pilot validated 92,106 staged master rows and about 12.2 MB of compressed source snapshots.
- 2026-08-29: Completed recurring pilot `6a0dec11-db00-40df-98f4-43563ebbdf4f`: archived three sources, staged/upserted 92,106 master rows, rebuilt 20,891 Serving rows, and purged staging. Anonymous frontend samples returned in about 210 ms and 191 ms.
- 2026-08-29: Added the authenticated ETL monitoring contract and `/admin/etl` dashboard for schedule, region/domain scope, run history, source retention, and quality gates; frontend and Python checks pass.
- 2026-08-29: Applied SQL `12`, verified one administrator and RLS, and completed pilot `c4cdf11d-a3df-4855-ab92-d4200b89c842` with 92,106 master rows, 20,891 Serving rows, and 8/8 monitoring checks.
- 2026-08-29: Installed project-pinned `agent-browser` 0.35.1 with Chrome for Testing and added the repeatable `/admin/etl` smoke command.
- 2026-08-29: Chose the local Windows host for the first recurring schedule, added due-source collection and bounded retries, and separated frontend UX work into the next milestone.
- 2026-08-29: Registered and smoke-tested the daily 03:15 Windows task, including battery execution, no-op maintenance, expired-object cleanup, and Serving-preservation retry tests.
- 2026-08-29: Completed the first public-map UX pass: accessible mobile controls, a correctly scrollable/inert filter drawer, persistent markers during refresh, and mobile clusters reduced from 147 to 37 at the initial viewport.
- 2026-08-30: Reframed the public map around nearby schools, added permission-aware geolocation, removed restrictive default filters, prioritized grade-1 and assigned-apartment facts, eliminated a duplicate apartment query, and verified 서울대곡초 on desktop/mobile.
- 2026-08-30: Restored the v1 map presentation, removed hover popups and singleton circle markers, fixed Gyeonggi city/district parsing, and verified district summaries plus school-detail selection in the browser.
- 2026-08-30: Completed the v2.0 apartment-map flow: 서울대곡초 displays 은마 and 대치미도맨션 with household counts, fits both markers above the detail sheet, and opens apartment detail from marker selection.
- 2026-08-31: Finalized the v2.0 school-detail contract: grade statistics precede household-sorted apartments, chart modes are students and students per class, parking is split by ground/underground, and map levels are district, neighborhood, then individual school.
- 2026-08-31: Refined apartment marker density using the 서울방현초 sample: 22 of 24 sub-100-household complexes render as low-priority dots, while larger complexes use tier-scaled exact-count callouts above them.
- 2026-08-31: Replaced building-icon abbreviations with parking/Airbnb-style exact household callouts, selected-state color inversion, and bottom-sheet detail; verified 서울대곡초 and 서울방현초 on desktop and 390px mobile.
- 2026-08-31: Unified neighborhood grouping and drilldown fallback labels, made map-level transitions immediate, and added school-selection focus: solid blue selected marker, 62% nearby markers, and teal assigned apartments.
- 2026-08-31: Added administrative drilldown queries for district-to-neighborhood-to-school clicks and removed apartment-bound fitting so school selection preserves zoom 15; verified 강남구→도곡동→서울대도초 in Chrome.
- 2026-08-31: Removed address-string rematching from neighborhood clicks. The frontend now fetches the exact school IDs contained in the clicked neighborhood marker; verified 성남시 분당구→정자동 and 광명시→철산동 in Chrome.
- 2026-08-31: Removed school-selection `panTo`/`panBy`; clicking a visible school now opens its details and apartment markers without changing the current map center or zoom.
- 2026-09-01: Replaced inequality text on administrative markers with blue/orange numeric counts and a compact legend. Added selectable students/classes/per-class summary buttons, persistent school favorites, and swipe-down dismissal to the shared school/apartment bottom sheet.
- 2026-09-01: Changed district and neighborhood summaries from viewport counts to full administrative-area counts. Capital-region school rows are paged once and cached for 30 minutes; viewport changes only filter marker visibility. Verified 서초구 remained 15/8 before and after panning.
- 2026-09-02: Planned the v2.1 discovery sprint: rounded search, SQL-13-based quick-filter chips, mobile zoom removal, student-sorted district rows, marker-style count circles, and a map/news/favorites GNB. Students per class remains a detail metric rather than a filter.
- 2026-09-02: Added post-v2.1 NEIS academy and elementary-timetable discovery. Academy publication requires course-level elementary classification; timetable storage requires a measured volume and bounded-retention pilot.
- 2026-09-18: Refreshed 71,692 capital-region academy rows, geocoded 29,274 of 29,664 unique road addresses (98.69%), and generated a private address-level marker candidate. Production ingestion remains gated by proximity semantics and serving-contract approval.
- 2026-09-20: Approved the academy proximity contract (600 m core, 600-800 m extended), collected VWorld polygons for 3,632 additional 500+ household complexes, and validated trusted building-centroid coverage for 3,057 of 4,285 large complexes; all other complexes retain representative-point fallback.
- 2026-09-20: Authorized and profiled the detailed MOLIT apartment trade API. Four August 2026 regional samples linked 647/683 rows (94.73%); production remains gated on an `aptSeq` crosswalk, road-address matching, and the 95% threshold.
- 2026-09-20: Applied the academy proximity contract and loaded 28,952 public address aggregates, 53,373 apartment origin points, and 20,172 apartment summaries. Exact anonymous counts and a 54-row sample RPC passed; frontend exposure remains gated on representative latency QA and product integration.
- 2026-09-20: Passed academy RPC latency QA (182-346 ms median across four density tiers) and added the default-off apartment-scoped academy map layer. Local UI verified the selected-apartment flow and a 409-address Eunma result; marker rendering still requires QA on a Naver Maps allowed domain.
- 2026-09-02: Added playgrounds as the third future data domain. Annual ingestion remains blocked until license/location-service eligibility, coordinate CRS, source IDs, and duplicate behavior are verified.
- 2026-09-03: Verified the Windows ETL task is Ready and completed its 03:15 no-op maintenance run with result 0; no source group was due. Deferred GitHub Actions migration until after v2.2 frontend work.
- 2026-09-03: Started v2.2 with content-aware bottom-sheet gestures, three-stage expansion up to 88% of the viewport, nested scroll handoff, and automated mobile gesture smoke coverage.
- 2026-09-03: Added v2.2 school/apartment name search using the existing public Serving contract; canonical complexes are deduplicated and multi-school assignments remain visible in search results.
- 2026-09-05: Promoted v2.2 P1 (`507e3a8`) to production and passed the public browser smoke suite at 360, 390, 430, and 1280 pixels. The 2,260-school initial map read completed in 2.39 seconds and apartment reads completed in 0.32 seconds.
- 2026-09-05: Completed v2.2 P2 by applying the same selected-district ID contract to viewport markers and result counts, with explicit school/apartment quick-filter scope labels. A live `서울특별시/강남구` RPC check returned 34 schools with zero address-scope mismatches.
- 2026-09-05: Deployed and production-verified v2.2 P2 (`cfb8954`); the public smoke suite passed with a 1.23-second initial map read and 0.32-0.43-second apartment reads.
