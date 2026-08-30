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
- Click-through map drilldown queries the selected administrative area at each level, while school selection preserves the current zoom
- Selected schools use a solid-blue top-layer marker, nearby schools remain readable at 62% opacity, and assigned apartments retain teal identity
- Shared assigned-apartment results: selecting a school displays exact household-count callouts scaled by complex size, reduces sub-100-household complexes to low-priority dots, and opens exact apartment detail on selection
- Passing frontend lint, typecheck, production build, and operational backend audits
- Versioned visual report snapshot in `JOINMAP_V2_0.html`

Local ETL outputs, browser captures, PDFs, secrets, dependencies, and build artifacts are not part of the Git baseline. They remain reproducible local or private-Storage evidence.

## v2.1 - Frontend Discovery Upgrade

Status: planned; implementation begins after the v2.0 baseline is tagged.

v2.1 will focus on user discovery without changing the verified v2.0 ETL source of truth:

1. Apply shared color, typography, spacing, surface, and interaction tokens.
2. Add a deduplicated search contract for schools and apartment complexes.
3. Group unified-search results by school, apartment, address, and later station.
4. Separate school-map, assigned-apartment, and location filter scopes.
5. Add applied-filter chips, staged mobile apply, and map/list result views.
6. Add address geocoding.
7. Select and ingest a station master before adding subway discovery.

The detailed UX contract is maintained in `FRONTEND_UX_SYSTEM_PLAN.md`.

## Versioning Rule

- Patch (`2.0.x`): fixes that preserve the current data and UI contracts.
- Minor (`2.1.0`): compatible frontend discovery or ETL capability additions.
- Major (`3.0.0`): breaking public data-contract or assignment-model changes.
