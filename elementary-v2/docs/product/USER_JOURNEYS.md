# User Journeys

Status: **Current**  
Last updated: 2026-09-17

## Journey 1: Discover schools in an area

1. The user opens the map and sees regional or district summaries appropriate to the zoom level.
2. The user pans, zooms, or selects a district/neighborhood.
3. The app loads schools for the exact visible or selected administrative scope.
4. The user selects a school marker without losing the current map context.
5. The school sheet shows grade statistics and source-aware missing states.

## Journey 2: Search for a school or apartment

1. The user enters a name in unified search.
2. School and apartment results are grouped by entity type.
3. Selecting a school opens its school detail and assigned apartments.
4. Selecting an apartment opens its detail while preserving representative and additional school context.

## Journey 3: Compare assigned housing

1. From a school, the user opens assigned apartment results.
2. The user filters by household count, building age, parking, or public-rental ratio.
3. The map and list use the same filtered result set.
4. Selecting an apartment opens exact source-backed details; unavailable attributes remain hidden.

## Journey 4: Return to saved candidates

1. The user favorites a school or apartment.
2. Favorites persist locally without an account.
3. Returning from Favorites restores the relevant map/detail context.

## Journey 5: Monitor ETL health

1. A registered administrator signs in.
2. The dashboard shows source cadence, regional scope, latest runs, snapshots, and checks.
3. The administrator identifies stale, warning, or failed runs.
4. Corrective execution follows the operations runbook; the browser never receives a service-role key.
