# Frontend UX and Design System Plan

## Product Direction

The product is a map-first neighborhood school explorer. The first screen should answer three questions quickly: which schools are nearby, how large the incoming grade is, and which apartment complexes are assigned. The interface should feel trustworthy, calm, and data-focused rather than promotional.

Primary journeys:

1. Use the current location to inspect nearby schools.
2. Search a school and review grade statistics and assigned apartments.
3. Search an apartment and identify its assigned school or schools.
4. Search a station or address and inspect schools within that area.

## Visual Theme

Use a neutral map canvas with color reserved for entity identity and state.

| Token | Value | Use |
| --- | --- | --- |
| `brand-600` | `#2563EB` | selected state, primary action, school identity |
| `apartment-700` | `#0F766E` | apartment markers and labels |
| `text-strong` | `#202124` | headings and important values |
| `text-muted` | `#667085` | metadata and secondary labels |
| `surface` | `#FFFFFF` | controls, sheets, markers |
| `surface-subtle` | `#F7F8FA` | grouped metrics and inactive areas |
| `border` | `#DADCE0` | control and section boundaries |
| `warning` | `#B45309` | stale or incomplete data |
| `danger` | `#B42318` | errors only |

Do not use red and green to imply that a school is good or bad. Student counts, apartment age, and parking should be shown as factual values; any bands must display their threshold. Subway entities should retain official line colors.

Use Pretendard or the system Korean sans-serif stack. Base text is 14px, controls are 40-44px high, spacing follows 4/8/12/16/24px, and radii stay at 6-8px. Use Lucide icons and one restrained elevation level for floating map controls.

## Information Architecture

Keep the full-screen map as the base. The top area contains unified search and a filter command. Map controls contain current location, zoom, and optional layers. School or apartment selection opens the existing bottom detail sheet. A separate comparison mode may use a desktop side inspector later; it should not complicate the default flow.

On mobile, provide a clear `지도` / `목록` switch after search. The list is an alternate representation of the same viewport results, not a separate page.

## Unified Search

The search box should support grouped results for `학교`, `아파트`, `지하철`, and `주소`. Show entity icons, entity type, district, and one useful fact. Rank exact current names first, then aliases, prefixes, partial matches, and finally nearby matches.

- School selection: center the map, show school detail, and retain nearby school markers.
- Apartment selection: center the complex and show all assigned schools, including split assignments.
- Station selection: center the station and show nearby schools using an explicit radius.
- Address selection: geocode the address and show nearby schools without creating a permanent entity.

Apartment search must use `apartment_name_history` so names such as old reconstruction names remain searchable. Avoid querying `school_apartment_serving` directly for search because one complex can appear once per assigned school. Build a deduplicated `location_search_index` or a search RPC with `entity_type`, `entity_id`, current name, aliases, address, coordinates, and compact metadata. Subway support requires a station master source before implementation.

## Filter Model

Separate filters by what they affect. Apartment filters must not silently look like school-map filters.

### School Map Filters

- Grade selector
- Student count range, not only a minimum
- Establishment type
- Statistics year and data availability
- Region and district

### Assigned Apartment Filters

- Household range
- Approval year or age range
- Parking per household
- Building count
- Sale and rental composition
- Public rental ratio

By default, apartment filters affect only the apartment list in school detail. Add an explicit option, `조건에 맞는 배정 단지가 있는 학교만`, before allowing apartment conditions to hide school markers. This option will require a server-side query or derived Serving field.

### Location Filters

- Current map area
- Distance from current location, address, or station
- Subway line after station data is available

Use staged filters with `결과 보기` on mobile to avoid a query on every slider movement. Show active conditions as removable chips and always provide `초기화`. Display the resulting school or apartment count before applying when practical.

## Component Rules

- School markers use white labels with blue names and a selected-grade count.
- Apartment markers use parking/Airbnb-style exact-count callouts (`4,424세대`) sized by household tier. Complexes below 100 households use low-priority dots so larger complexes stay visible; selected callouts invert to solid teal and exact names remain in the bottom detail.
- School map levels never mix representations at one zoom: district summary, neighborhood summary, then individual school.
- District and neighborhood summaries use blue and amber count circles rather than inequality symbols; a compact legend explains the 80-student threshold.
- District and neighborhood count circles always represent the complete administrative area, not the current viewport. Panning may reveal or hide a marker but must not change its counts.
- School details begin with selectable first-grade students, classes, and students-per-class metrics plus a persistent favorite action. School and apartment sheets dismiss on a deliberate downward swipe while retaining the close button.
- Clicking a district or neighborhood queries only that administrative scope and advances exactly one level; selecting a school pans without changing zoom.
- Mobility-map conventions inform layering rather than branding: larger complexes receive higher z-order, while dense low-value points stay visually quiet.
- School selection uses a solid-blue top-layer marker; other schools stay clickable and readable at 62% opacity, while assigned apartments remain teal.
- Do not draw an approximate school-zone shape. Polygon emphasis requires an explicit public geometry contract and should use the official school-zone geometry when added.
- Hover only raises emphasis; it does not open a separate popup.
- Selection has one clear blue outline and opens one detail surface.
- Empty, loading, stale, and error states use the same compact inline pattern.
- Status badges describe data state such as `2026년 기준` or `확인 필요`, not subjective quality.

## Delivery Order

1. Define Tailwind design tokens and replace ad hoc colors, SVGs, radii, and status labels.
2. Build unified school/apartment search and the deduplicated search contract.
3. Redesign filters by scope and add applied-filter chips plus staged apply.
4. Add address geocoding and a map/list result switch.
5. Add station master ETL, station search, line colors, and radius-based discovery.
6. Add comparison, saved places, and shareable map state only after core discovery metrics are measured.

## v2.1 Map Discovery Implementation Plan

Status: **complete** (2026-09-03). The v2.0 Supabase read contracts remain unchanged.

### Interaction Contract

- Replace the current split filter/search header with a softer, rounded search surface and a horizontally scrollable quick-filter row directly below it.
- Put a `SlidersHorizontal` icon button at the far left of the quick-filter row. It opens the complete filter sheet; each following chip opens only its own selector.
- Initial quick filters are `설립 유형`, `학년`, `학생 수`, `세대 수`, and `주차`. Active chips use the relevant entity color and show a compact selected value.
- Keep draft values inside each selector and apply once on confirmation. This prevents repeated RPC and viewport requests while a slider is moving.
- Hide the Naver `+/-` zoom control below the `sm` breakpoint. Touch pinch and double-tap remain available.
- Establish explicit layers: map < markers < GNB < header/quick filters < bottom sheets < open filter/search overlays. An open filter must always be the top interactive surface.
- Add a fixed, safe-area-aware three-item GNB: `지도`, `소식`, `즐겨찾기`. The map remains mounted only on the map tab so returning does not discard its viewport.

### Data Contract Gate

- Keep students per class as a derived school-detail metric, not a v2.1 filter condition.
- Reuse the current SQL `13` establishment-type, selected-grade student-count, and apartment parameters without another database migration.
- Update `FilterState`, `dataService`, cache keys, and filter count logic only when the existing parameters need a new UI representation.
- Search styling, mobile zoom visibility, district sorting, count circles, and GNB layout require no database migration.
- Keep favorites local-first for v2.1 (`school` and `apartment` IDs with schema version). Account sync and comparison remain later decisions.
- Define a separate content contract before activating `소식`; do not mix editorial content into `school_master` or the Serving table.

### Delivery Checklist

#### P1. Navigation And Layer Foundation

- [x] Add shared radius, elevation, layer, header-height, and GNB-height tokens.
- [x] Add the three-item GNB and preserve map viewport/state across tab changes.
- [x] Hide Naver zoom controls on mobile and offset map controls, legends, and sheets above the GNB.
- [x] Raise open filters and search results above all map and navigation surfaces.

#### P2. Search And Quick Filters

- [x] Redesign search as a rounded, high-contrast surface using Lucide search/clear icons and compact entity-result visuals.
- [x] Add the horizontal quick-filter row and full-filter icon entry point.
- [x] Implement compact direct selectors, removable active states, and reset behavior; retain staged apply in the full filter sheet.
- [x] Verify combined school and apartment filters still use one `filter_school_ids` request and stable cache keys.

#### P3. District Sheet Refinement

- [x] Sort neighborhood rows by total students in the selected grade, descending; break ties by school count and Korean name.
- [x] Replace `80명부터/79명까지` row text with blue and amber numeric circles matching map markers.
- [x] Keep one compact legend in the sheet header and preserve full accessible labels for screen readers.

#### P4. New GNB Destinations

- [x] Build a favorites list from the existing school star plus apartment favorites; support jump-to-map and removal.
- [x] Define the news taxonomy and content source for district/neighborhood reports, school news, and book reviews.
- [x] Ship the news destination as an explicit empty state; keep the published feed, detail, and share flow disabled until content exists.
- [x] Defer cross-school/apartment comparison until favorite usage and required comparison fields are measured.

#### P5. Release QA

- [x] Lower school-search and current-location targets to zoom `14`, and render individual schools from zoom `14` so nearby schools remain visible on mobile.
- [x] Isolate Naver Maps SDK failures with a recoverable map boundary so search, details, and navigation remain usable.
- [x] Verify `360`, `390`, and `430` pixel mobile layouts without horizontal overflow or filter/GNB overlap.
- [x] Verify desktop layouts, production Naver Maps authorization, district drilldown, and school/apartment favorites on the deployed URL.
- [x] Run final `lint`, `typecheck`, and production `build`; deploy commit `670b350` to `https://elementary-lovat.vercel.app`.

### Acceptance Checks

- Mobile widths `360`, `390`, and `430`; desktop widths `1280` and `1440` have no overlap among search, filters, Naver controls, sheets, and GNB.
- Keyboard focus order is search, quick filters, map controls, map entities, then GNB; every icon-only control has an accessible name.
- Combined filters return the same school IDs in the quick-filter and full-filter paths for every supported SQL `13` condition.
- District rows remain stable while panning and reorder only when the target grade or filters change.
- `lint`, `typecheck`, `build`, and agent-browser flows pass for map navigation, filter apply/reset, district drilldown, favorites, and tab return.

## v2.1.1 Stability Patch

Status: **complete and deployed** (2026-09-03), release commit `f81efab`.

- [x] Record the latest 50 map and assigned-apartment request timings in `window.__ELEMENTARY_PERFORMANCE__`.
- [x] Add compact loading, empty-result, retry, and filter-reset states without covering the search or GNB.
- [x] Preserve existing markers when a refresh fails and make Naver map/marker cleanup idempotent.
- [x] Query with the live Naver map bounds to avoid a stale 1,000-row school request after search zoom.
- [x] Add `npm run browser:smoke:public` for filter, search, school detail, apartment read, responsive-width, error, and performance checks.
- [x] Verify induced Supabase failure renders a retry action without horizontal overflow at 390 pixels.

Production baseline: the initial capital-region map read completed in 1.18 seconds, the school-level 11-row read in 0.17 seconds, and the 24-row apartment read in 0.19 seconds. Smoke budgets are 5 seconds and 3 seconds respectively.

## v2.2 Interaction Foundation

Status: **in progress; P0 deployed** (2026-09-03), implementation commit `20ac24a`. Start with shared mobile interaction quality before adding another data or navigation surface.

- [x] P0: replace handle-only sheet gestures with content-aware drag and scroll handoff.
- [x] P0: support default, middle, and 88% expanded snaps without the previous 70vh ceiling.
- [x] P0: keep scrolling inside expanded content, then hand a downward gesture back to the sheet only at the content's top edge.
- [x] P0: collapse one snap at a time before dismissal and retain the explicit close action.
- [x] P0: add repeatable public smoke checks for content swipe expansion, scroll ownership, and top-edge collapse.
- [x] P0: verify the production flow at 360, 390, 430, and 1280 pixels; initial map and apartment reads completed in 1.21 seconds and 0.28 seconds.
- [ ] Define the remaining v2.2 scope after bottom-sheet behavior is reviewed on a physical mobile device.

## Current Gaps

- Search currently queries only `school_name`, despite the address placeholder.
- `SearchResult` anticipates apartments, but no apartment search path exists.
- Apartment filters currently affect only the selected school's apartment query.
- `selected_districts` is not applied to the school viewport query.
- Station entities and station-to-school distance data do not exist yet.
- `building_count` exists in the Serving schema but is not mapped into the frontend apartment type.
