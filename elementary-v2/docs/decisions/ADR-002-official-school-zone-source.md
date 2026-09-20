# ADR-002: Official school-zone polygons are authoritative

Status: Accepted  
Date: 2026-08-28

## Decision

Use the dated official elementary school-zone polygon dataset as the assignment source of truth. Retain Geomarket assignment data only for comparison and historical evidence.

## Rationale

The official source is current, reproducible, and contains stable zone identifiers. Proximity and legacy names must not override official assignment evidence.

## Consequences

Point and building-level spatial joins require CRS validation, review queues, and explicit confidence/method fields. Ambiguous or no-hit cases remain reviewable instead of being silently matched.
