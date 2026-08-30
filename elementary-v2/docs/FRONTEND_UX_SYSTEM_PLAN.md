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
- Class count or students per class
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

## Current Gaps

- Search currently queries only `school_name`, despite the address placeholder.
- `SearchResult` anticipates apartments, but no apartment search path exists.
- Apartment filters currently affect only the selected school's apartment query.
- `selected_districts` is not applied to the school viewport query.
- Station entities and station-to-school distance data do not exist yet.
- `building_count` exists in the Serving schema but is not mapped into the frontend apartment type.
