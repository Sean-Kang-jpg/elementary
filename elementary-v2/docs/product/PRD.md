# Product Requirements

Status: **Current product contract**  
Last updated: 2026-09-17  
Owner: Product and Engineering

## In scope

1. Search schools and assigned apartment complexes.
2. Explore schools through regional, district, neighborhood, and viewport map states.
3. Filter schools by establishment and grade/student conditions.
4. Filter a selected school's assigned apartments by households, age, parking, and public-rental ratio.
5. Inspect school grade statistics and apartment attributes.
6. Preserve favorites locally.
7. Provide authenticated ETL monitoring to registered administrators.
8. Expand coverage from the capital region to nationwide regions in approved waves.

## Out of scope until separately approved

- Address geocoding search and station-radius search.
- Public academy, timetable, or playground data.
- Browser access to normalized operational masters or raw source snapshots.
- Automatic resolution of ambiguous assignments or entity matches.

## Functional requirements

- The map must not imply that geographic proximity is official school assignment.
- Search results must distinguish schools from apartment complexes and disclose multi-school assignments.
- Missing source values must remain missing; the UI must not replace them with synthetic zeroes.
- A failed refresh must not replace the previous complete Serving snapshot.
- Every production ETL run must record scope, source dates, row counts, checks, and pipeline version.

## Non-functional requirements

- Public reads use only approved Supabase read contracts with RLS and least-privilege grants.
- Initial map requests target the established 5-second smoke budget; apartment detail requests target 3 seconds.
- Desktop and 360/390/430-pixel mobile layouts must remain usable.
- Regional releases require a reproducible read-only build and rollback evidence before database writes.

## Acceptance source

Delivery status and pending work live only in [`../operations/OPERATION_PLAN.md`](../operations/OPERATION_PLAN.md). Detailed interaction behavior lives in [`../ux/FRONTEND_UX_SYSTEM_PLAN.md`](../ux/FRONTEND_UX_SYSTEM_PLAN.md).
