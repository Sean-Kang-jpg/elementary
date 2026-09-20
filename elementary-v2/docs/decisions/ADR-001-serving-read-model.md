# ADR-001: Two-table public read model

Status: Accepted  
Date: 2026-08-29

## Decision

The public frontend reads schools from `school_master` and assigned housing from `school_apartment_serving`. Browser-side joins against normalized apartment and assignment masters are not allowed.

## Rationale

The bounded read model reduces request count, keeps filtering indexable, and allows normalized operational tables and review evidence to remain private.

## Consequences

Serving refresh becomes an explicit ETL step. Any public field change must update SQL, ETL, audits, TypeScript, query projections, and UI together.
