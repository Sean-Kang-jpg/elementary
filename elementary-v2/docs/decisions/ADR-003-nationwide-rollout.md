# ADR-003: Nationwide expansion uses bounded regional waves

Status: Accepted  
Date: 2026-09-16

## Decision

Generalize the pipeline first, then expand through independently auditable regional waves: metropolitan pilots, remaining high-density scopes, rural completion, and nationwide steady state.

## Rationale

A single nationwide replacement would combine source, matching, capacity, and performance risk. Scoped waves provide measurable quality gates and rollback units.

## Consequences

All active region allowlists must move to one versioned registry. ETL runs, snapshots, checks, uploads, and rollback evidence must record exact region/city scope. The capital-region snapshot remains available until each new wave passes release gates.
