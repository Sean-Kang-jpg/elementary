# UX Scenarios

Status: **Current**  
Last updated: 2026-09-17

## Map loading

- Show a compact loading state without blocking navigation or search.
- Preserve existing markers when a refresh fails and expose a retry action.
- Ignore stale responses after the viewport or filters change.

## Entity selection

- Selecting a visible school changes selection and detail state without forcing map recentering.
- Assigned apartments appear as a separate visual entity class.
- Closing or minimizing a sheet must not unexpectedly clear the selected map entity.

## Search

- Debounce user input and search schools and apartments in parallel.
- Group results by entity type and support keyboard selection.
- Disclose when an apartment is connected to more than one school.

## Filters

- School filters affect school discovery.
- Apartment filters apply to the selected school's assigned apartments.
- Mobile filters stage changes until Apply; direct quick filters remain immediately understandable.

## Empty and error states

- Distinguish no results from network/query failures.
- Offer reset actions when filters produce no result.
- Hide unavailable attributes rather than displaying fabricated values.
