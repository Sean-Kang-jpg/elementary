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
- Versioned visual report snapshot in `JOINMAP_V2_0.html`

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

The detailed UX contract is maintained in `FRONTEND_UX_SYSTEM_PLAN.md`.

## v2.1.1 - Stability And Automated QA

Status: complete; release commit `f81efab` deployed and verified in production on 2026-09-03.

- Added recoverable map and assigned-apartment loading, empty, and error states.
- Added in-browser request timing for map and apartment Serving reads.
- Prevented stale wide bounds from issuing an unnecessary 1,000-row query after school search.
- Hardened Naver map and marker cleanup during filter changes and React development remounts.
- Added a repeatable public-map smoke command with mobile/desktop overflow and performance budgets.

## v2.2 - Interaction Foundation

Status: in progress; the first deployable increment was completed on 2026-09-03.

- Replaced handle-only bottom-sheet gestures with content-aware drag and scroll handoff.
- Added default, middle, and 88% expanded snap states without changing the Supabase frontend contract.
- Preserved native content scrolling at maximum expansion and returned downward gestures to the sheet only at the content's top edge.
- Applied stepwise collapse and dismissal to district, neighborhood, school, and apartment sheets.
- Extended public browser smoke coverage to the complete mobile sheet gesture flow.

## Post-v2.1 Data Candidates

Academy/tutoring-center, elementary-timetable, and playground data are discovery items, not part of the v2.1 release contract. Academy data requires course-level elementary-audience validation because mixed middle/high-school offerings are present. Timetable data requires a feature and retention decision before daily class/period rows are stored at scale. Playground data requires license/location-service review and coordinate-system validation before ingestion. The detailed gates are maintained in `FUTURE_DATA_DOMAINS_PLAN.md`.

## Versioning Rule

- Patch (`2.0.x`): fixes that preserve the current data and UI contracts.
- Minor (`2.1.0`): compatible frontend discovery or ETL capability additions.
- Major (`3.0.0`): breaking public data-contract or assignment-model changes.
