# Product Brief

Status: **Current**  
Last updated: 2026-09-17  
Owner: Product

## Product

Elementary helps families understand the relationship between elementary schools, official school zones, and assigned apartment complexes. It turns fragmented public data into a map-first decision aid while preserving source dates, uncertainty, and review status.

## Primary users

- Families comparing neighborhoods before moving.
- Parents checking school size and assigned housing context.
- Operators reviewing data freshness, exceptions, and regional coverage.

## Core problem

School, school-zone, apartment, and housing-property data use different identifiers and update cycles. Raw proximity is not the same as official assignment, and silent fuzzy matching can mislead users. The service must provide a useful joined view without hiding uncertainty.

## Value proposition

- Official school-zone evidence rather than proximity guesses.
- School and assigned-apartment discovery in one map flow.
- Comparable school-grade and housing indicators with source-aware null handling.
- Auditable ETL, review queues, and bounded regional expansion.

## Current product boundary

The public product exposes schools and school-apartment serving rows. Normalized masters, source snapshots, review evidence, ETL runs, and administrator monitoring remain private. Academy, timetable, playground, station, and address-search domains are not part of the current public contract.

## Success measures

- Correct school and apartment identity with traceable assignment evidence.
- Stable map, search, filter, and detail flows on mobile and desktop.
- Data refreshes that preserve the previous complete Serving snapshot on failure.
- Regional expansion without weakening quality, security, or latency budgets.
