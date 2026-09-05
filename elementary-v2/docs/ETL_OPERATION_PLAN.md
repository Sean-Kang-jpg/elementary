# ETL Operation Plan

Last updated: 2026-09-03

Release status: **v2.0 operational baseline complete; v2.1 released; v2.2 interaction work in progress.**

This document is the single checklist for the school-zone, school, apartment, Supabase, and frontend data pipeline. Update it whenever a task is completed, deferred, or blocked. `joinmap.html` remains the detailed visual report; this file controls the next work.

## Status Rules

- `[x]`: completed and verified
- `[ ]`: pending work
- **Deferred**: intentionally postponed; not a current blocker
- **Issue**: requires monitoring, review, or a later correction

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
- [x] Record the finalized read contract in SQL, frontend types/services, and `joinmap.html`.
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
- [ ] Add a deduplicated school/apartment search contract and grouped unified-search results.
- [ ] Separate school-map, assigned-apartment, and location filters; add applied chips and staged mobile apply.
- [ ] Select a station master source before adding station search, line filters, and radius-based discovery.
- [x] Add explicit loading, empty, and recoverable error states for school-map and assigned-apartment reads.
- [ ] Add source-freshness and stale-data indicators after the public Serving contracts expose source timestamps.
- [x] Measure map and assigned-apartment reads against 5-second and 3-second smoke budgets.
- [x] Improve mobile filter and detail-panel ergonomics without changing the finalized two-table data contract.
- [x] Add a repeatable `agent-browser` smoke scenario for public map load, filters, search, school detail, apartment reads, responsive widths, and request budgets.
- [ ] Extend the repeatable smoke suite to the authenticated ETL dashboard with a non-personal test account.
- [ ] **Deferred until after v2.2 frontend work:** Package reviewed local assignment inputs as a versioned portable bundle, then migrate recurring execution from the logged-in Windows task to GitHub Actions.

### v2.1 Map Discovery Sprint

Detailed behavior and acceptance checks are maintained in `FRONTEND_UX_SYSTEM_PLAN.md`.

- [x] P1: add shared layout/layer tokens, safe-area-aware `지도 / 소식 / 즐겨찾기` GNB, and mobile zoom-control removal.
- [x] P2: redesign the rounded search surface and add a horizontally scrollable quick-filter bar below it.
- [x] P2: keep SQL `13` as the filter contract and verify frontend cache keys and combined-filter requests against its existing parameters.
- [x] P2: keep the equalizer icon as the full-filter entry and expose establishment type, grade, students, households, and parking as direct chips.
- [x] P3: sort district-sheet neighborhoods by selected-grade students and replace threshold text with accessible blue/amber count circles.
- [x] P4: build local-first school/apartment favorites and define the editorial contract before enabling the published news feed.
- [x] Verify mobile/desktop layering, navigation-state preservation, filter equivalence, district drilldown, favorites, and all frontend quality commands in production.

## Future Milestone: Additional Data Domains

This work starts after the v2.1 map-discovery sprint and requires pilot approval before any production migration. See `FUTURE_DATA_DOMAINS_PLAN.md` for academy, timetable, playground, storage, licensing, and go/no-go details.

- [ ] Profile one complete capital-region `학원교습소정보` snapshot; confirm source keys and whether records are institution- or course-level.
- [ ] Test course-level elementary classification as explicit, likely, mixed, excluded, or unknown; manually review a stratified 200-row sample.
- [ ] Approve academy ingestion only after elementary precision and address/geocoding coverage meet thresholds.
- [ ] Verify NEIS school-code linkage and run a four-week timetable pilot for 10 representative elementary schools.
- [ ] Define the timetable user feature and bounded retention policy before creating production row-level tables.
- [ ] Confirm playground-data license and location-service requirements before requesting or using the API key.
- [ ] Validate the playground coordinate reference system and source-ID stability on at least 100 capital-region records.
- [ ] Profile annual playground records by place type, public/private, indoor/outdoor, operation status, coordinate completeness, and duplicates.
- [ ] Extend ETL monitoring domains/cadences and free-tier capacity checks only with approved academy/timetable/playground migrations.
- [ ] Keep raw pilot snapshots private and keep all three domains outside the current two-table public frontend contract.

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
| I-04 | Future | Nationwide expansion requires Building HUB/GIS/address-building source integration and regional validation samples. |
| I-05 | Monitor | Track PostgreSQL and Storage usage before retaining additional raw snapshots on the Supabase free tier. |
| I-06 | Resolved | SQL `10`, the two-table upload, remote RLS verification, and rental-ratio range constraints are complete. |
| I-07 | Resolved | Apartment age offers an unrestricted option; an old-complex sample passed the browser smoke test. |
| I-08 | Monitor | Naver Maps local authorization is configured for `localhost`; `127.0.0.1` is not an equivalent authorized origin. |
| I-09 | Review queue | Four K-apt rows report public-rental units above total households. Their rental breakdown and ratio are stored as null, `review_required=true`, rather than publishing impossible values. |
| I-10 | Resolved | SQL `11` and the first recurring pilot completed. Three source objects use about 12.2 MB, staging was purged, and the run is recorded as completed. |
| I-11 | Resolved | SQL `12`, one administrator UUID, the post-migration pilot, anonymous blocking, and authenticated monitoring reads are verified. |
| I-12 | Accepted v1 | The Windows task uses interactive logon and runs only while the ETL workstation user is logged in; `StartWhenAvailable` catches a missed run after login. |
| I-13 | Deferred | Move scheduling to GitHub Actions after v2.2 frontend work and after reviewed assignment and apartment base inputs are packaged into a portable source bundle; keep the Windows task as fallback through the first successful remote production run. |
| I-14 | Discovery | NEIS academy data includes middle/high-school and mixed offerings. Elementary eligibility must be classified per course and manually validated before publication. |
| I-15 | Discovery | Daily class/period timetable rows can exceed the free-tier budget if nationwide history is retained. Define the feature and retention window from a 10-school pilot first. |
| I-16 | Blocked pending review | Playground data states Korea Open Government License Type 4 and location-information business requirements. Confirm commercial-use and location-service eligibility before API ingestion or publication. |

## Update Log

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
- 2026-09-02: Added playgrounds as the third future data domain. Annual ingestion remains blocked until license/location-service eligibility, coordinate CRS, source IDs, and duplicate behavior are verified.
- 2026-09-03: Verified the Windows ETL task is Ready and completed its 03:15 no-op maintenance run with result 0; no source group was due. Deferred GitHub Actions migration until after v2.2 frontend work.
- 2026-09-03: Started v2.2 with content-aware bottom-sheet gestures, three-stage expansion up to 88% of the viewport, nested scroll handoff, and automated mobile gesture smoke coverage.
- 2026-09-03: Added v2.2 school/apartment name search using the existing public Serving contract; canonical complexes are deduplicated and multi-school assignments remain visible in search results.
- 2026-09-05: Promoted v2.2 P1 (`507e3a8`) to production and passed the public browser smoke suite at 360, 390, 430, and 1280 pixels. The 2,260-school initial map read completed in 2.39 seconds and apartment reads completed in 0.32 seconds.
- 2026-09-05: Completed v2.2 P2 by applying the same selected-district ID contract to viewport markers and result counts, with explicit school/apartment quick-filter scope labels. A live `서울특별시/강남구` RPC check returned 34 schools with zero address-scope mismatches.
