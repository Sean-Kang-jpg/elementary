# Release Baselines

## v2.0 - Operational Baseline

Status: complete and ready to preserve in Git.

v2.0 establishes the current production foundation:

- Official 2026 school-zone polygon assignments for the capital region
- Operational school and canonical apartment masters
- Grade 1-6 student, class, and students-per-class statistics
- Supabase migrations `06` through `12`
- Public `school_master` and `school_apartment_serving` frontend contract
- Private normalized masters, source snapshots, staging, and ETL run history
- Recurring ETL runner, Windows fallback schedule, and administrator dashboard
- Map-first frontend with nearby-school discovery, v1-style markers, search, filters, and school/apartment detail
- School detail prioritizes grade statistics, then lists assigned apartments by household count with ground/underground parking
- Predictable map hierarchy: district summaries, neighborhood summaries, then individual schools
- Click-through map drilldown queries the selected district, then resolves neighborhood schools by the marker's exact school IDs; school selection preserves the current zoom
- Clicking a visible school changes only selection, details, and apartment markers; the map center and zoom remain unchanged while apartment data loads
- Administrative markers show only blue/orange school counts with a map legend; school details open with three selectable first-grade metrics, a persistent favorite star, and swipe-down dismissal
- District and neighborhood marker counts are calculated from every school in each administrative area and cached independently of the viewport, so map panning changes visibility but never changes the displayed totals
- Selected schools use a solid-blue top-layer marker, nearby schools remain readable at 62% opacity, and assigned apartments retain teal identity
- Shared assigned-apartment results: selecting a school displays exact household-count callouts scaled by complex size, reduces sub-100-household complexes to low-priority dots, and opens exact apartment detail on selection
- Passing frontend lint, typecheck, production build, and operational backend audits
- Versioned visual report snapshot, now retained in `../../../archive/elementary-v2-analysis-20260916/docs/JOINMAP_V2_0.html`

Local ETL outputs, browser captures, PDFs, secrets, dependencies, and build artifacts are not part of the Git baseline. They remain reproducible local or private-Storage evidence.

## v2.1 - Frontend Discovery Upgrade

Status: complete; deployed and verified in production on 2026-09-03.

Production: `https://elementary-lovat.vercel.app` from release commit `670b350`.

v2.1 will focus on user discovery without changing the verified v2.0 ETL source of truth:

1. Applied shared color, spacing, surface, interaction, and layer tokens.
2. Added a rounded search surface and horizontal quick-filter row with a full-filter icon entry point.
3. Reused the SQL `13` filter contract and preserved one combined school/apartment request.
4. Removed mobile zoom buttons and added a safe-area-aware `지도 / 소식 / 즐겨찾기` GNB.
5. Sorted district neighborhoods by selected-grade students and used marker-style numeric count circles.
6. Built local-first school/apartment favorites and defined the news content contract.
7. Reduced mobile school targeting to zoom `14` and aligned individual-school rendering to that level.
8. Deferred deduplicated apartment search, address geocoding, station discovery, and published news content.

The detailed UX contract is maintained in [`ux/FRONTEND_UX_SYSTEM_PLAN.md`](ux/FRONTEND_UX_SYSTEM_PLAN.md).

## v2.1.1 - Stability And Automated QA

Status: complete; release commit `f81efab` deployed and verified in production on 2026-09-03.

- Added recoverable map and assigned-apartment loading, empty, and error states.
- Added in-browser request timing for map and apartment Serving reads.
- Prevented stale wide bounds from issuing an unnecessary 1,000-row query after school search.
- Hardened Naver map and marker cleanup during filter changes and React development remounts.
- Added a repeatable public-map smoke command with mobile/desktop overflow and performance budgets.

## v2.2 - Interaction Foundation

Status: closed out. P0 through P3 are deployed and production-verified (`cafe111`, 2026-09-06); P4 is deferred until an official station/address source is validated; P5 is complete; P6 was assessed and only the academy domain was recommended. One item remains open and carries into v2.3: allowed-domain mobile QA.

Production: `https://elementary-lovat.vercel.app`.

- Replaced handle-only bottom-sheet gestures with content-aware drag and scroll handoff.
- Added default, middle, and 88% expanded snap states without changing the Supabase frontend contract.
- Preserved native content scrolling at maximum expansion and returned downward gestures to the sheet only at the content's top edge.
- Applied stepwise collapse and dismissal to district, neighborhood, school, and apartment sheets.
- Extended public browser smoke coverage to the complete mobile sheet gesture flow.
- Added grouped school/apartment name search over the existing two-table public contract without a schema change.
- Deduplicated apartment assignments by canonical complex, surfaced multi-school assignments, and linked results to the existing map and bottom-sheet detail flow.
- Verified keyboard selection and 360, 390, 430, and 1280 pixel layouts against live Supabase data.
- Production smoke verified the primary mobile flow, quick filters, school/apartment detail opening, three-stage sheet gestures, and zero unexpected page errors. The initial 2,260-school map read completed in 2.39 seconds and apartment reads completed in 0.32 seconds.
- Aligned selected-district filtering across result counts and viewport school markers, including a client fallback when the cross-filter RPC is unavailable.
- Grouped quick filters under explicit school and apartment scope labels without adding another row to the mobile header.
- P2 production smoke completed with a 1.23-second initial map read and 0.32-0.43-second apartment reads.
- P3 maps the existing Serving `building_count` into apartment lists and details, hides missing values, and fixes a stray zero rendered for zero-percent public rental data.
- P3 local QA passed with 93.4% live Serving coverage and a 4,424-household/28-building verification for 은마.
- P3 (`cafe111`) was deployed and production-verified on 2026-09-06; the public smoke suite passed with a 1.20-second initial map read and 0.28-0.35-second apartment reads.

## v2.3.0 - Nationwide Coverage And A Deployment That Works

Status: complete; released and production-verified on 2026-09-28.

Production: `https://elementary-lovat.vercel.app`, deployed from the `release` branch.

v2.3.0 takes the product from the capital region to the whole country, and fixes
two things that were quietly preventing anyone from seeing it.

### Coverage

- All seventeen first-level regions are in production, up from three: 6,302 schools and 48,189 serving rows, with per-region totals summing exactly to the table totals.
- `etl/region_registry.json` is the single source of truth for which regions are published. ETL collectors, builders, audits, SQL and the frontend all read it, so promoting a region is a status change rather than a code change.
- Regions were released as bounded waves with a per-region EDA gate, per [`decisions/ADR-003-nationwide-rollout.md`](decisions/ADR-003-nationwide-rollout.md). School-zone label formats differ by region, which is where each wave spent its effort.
- One-way joint zones (`공동(일방)`) are recorded as assignments but excluded from the published serving model, so a single 경주 zone no longer places one apartment in seventeen schools' lists.
- Capacity measured rather than projected: 183.6 MB of the 500 MB limit (36.7%).

### Migrations

- `14` academy proximity serving, `15` school-scoped academy proximity, `16` region registry contract replacing literal three-region CHECK constraints, `17` staging retention fix.
- `17` addressed `etl_staging_rows` reaching 3.3 GB — 95% of the database — because retention deleted on an unindexed column and timed out once the table grew.

### Public read contract

- A third anonymously readable table joins the two: `apartment_academy_summary`, counts only, with academy addresses and institution names staying private. Two academy RPCs accompany it.
- Verified live: every other operational table returns no rows or is refused outright.

### Academy surfaces

- Apartment and school detail show nearby academy counts at 600 m core and 800 m extended, with an opt-in map layer.
- Figures cover nine regions; the other eight render `학원 데이터 준비 중` rather than an empty panel.
- The education-environment display is still a design mockup ([`operations/EDUCATION_ENVIRONMENT_UX_MOCKUP.html`](operations/EDUCATION_ENVIRONMENT_UX_MOCKUP.html)) and is not implemented in this release.

### Deployment

- Production deployments now come from pushing `release`. They previously came from Vercel CLI runs against an unversioned copy of the app folder, because Vercel tracked `main` — a two-commit stub from repository creation that nobody pushed.
- That is the whole of I-27: every path but `/` returned a Vercel `NOT_FOUND`, so `/admin/etl` was unreachable and no detail URL could resolve. A git build runs from the repository root, where `vercel.json` had carried the rewrite since August, and deep links answer 200.
- Deleted the `main` stub, preserved as tag `archive/netlify-prototype-20250729`; a single push to it would have replaced the live site with that prototype.
- Procedure and the post-deploy check: [`operations/DEPLOYMENT.md`](operations/DEPLOYMENT.md).

### Regression fixed before release

- I-28: school detail gated its assignment features on a flag meaning "public elementary school", negated — true for 983 of a 1,000-school sample. Assigned-apartment browsing was off almost everywhere: no apartment detail, no tabs, and the loading effect cleared `apartments` on entry.
- `establishment_type` is the discriminator the code needed. Only 공립 elementary schools are assigned by zone; 국립 and 사립 are applied to and carry no complexes — 22 of 25 공립 against 1 of 17 국립 and 1 of 25 사립, measured against production. Those schools now state why they have no assignment instead of rendering empty.

### Verification the gate was not doing

Three ways the smoke had stopped meaning anything, all closed:

- It only opened the base URL, so it could not see that every other path 404ed.
- It asserted labels deleted two releases earlier, failing on stale copy before reaching the broken flow it should have caught.
- Its waits were fixed durations: long enough locally, intermittently short over the network, which teaches re-running instead of reading. Waits now poll for conditions, and the title check matches a version shape rather than a pinned string.

### Measured at release

- lint, typecheck, build, 100 ETL tests, backend audit 52/52, and 29 public smoke assertions pass against production.
- Map read 1,985 schools in 606-1,247 ms against a 5 s budget; assigned-apartment reads 182-309 ms against 3 s.
- The map read is scoped to the regions whose registry envelope overlaps the viewport, which is what keeps a nationwide dataset inside that budget.

### Documentation

- [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) explains the whole system for a non-developer reader.
- [`product/PRODUCT_CONCEPT.md`](product/PRODUCT_CONCEPT.md) and [`product/MEASUREMENT_PLAN.md`](product/MEASUREMENT_PLAN.md) define where the product is going and how it will be measured.
- [`decisions/ADR-006-detail-page-rendering.md`](decisions/ADR-006-detail-page-rendering.md) chooses serverless prerender for detail routes.

### Known open items

- Allowed-domain mobile QA, carried over from v2.2.
- The pooled manual review stands at 182 cases, 13 of them tracked upstream source gaps.
- `/vite.svg` 404s because no `public/` directory exists; folded into the ADR-006 sitemap work.
- Apartment identifiers are not stable across rebuilds, which blocks the shareable-URL work. See the preflight report in [`reference/`](reference/).

## Post-v2.1 Data Candidates

Academy/tutoring-center, elementary-timetable, and playground data are not part of the v2.1 release contract. The current decisions and remaining production gates are maintained in [`operations/OPERATION_PLAN.md`](operations/OPERATION_PLAN.md); the superseded standalone plan and discovery evidence are archived outside the active application tree.

## v2.2 Remaining Order

1. P3 completes the existing apartment frontend contract by displaying `building_count`; it does not require a database migration.
2. P4 separately evaluates station and address-search source contracts before implementation.
3. P5 packages local ETL inputs, migrates scheduling to GitHub Actions, and adds authenticated monitoring QA.
4. P6 runs gated academy, timetable, and playground discovery pilots.

## Versioning Rule

- Patch (`2.0.x`): fixes that preserve the current data and UI contracts.
- Minor (`2.1.0`): compatible frontend discovery or ETL capability additions.
- Major (`3.0.0`): breaking public data-contract or assignment-model changes.
