# ADR-004: Academy proximity distance contract

## Status

Accepted on 2026-09-20 for the private academy pilot. Production tables and public access remain pending.

## Context

Apartment representative points undercount nearby academy addresses for large complexes. VWorld building data is available for part of the inventory, but it does not provide verified pedestrian entrances or routes. Building matches can also include unrelated or ancillary structures.

## Decision

- Define `0-600 m` as the core proximity band.
- Define `600-800 m` as a separate extended band; do not merge it into the core count.
- Continue to exclude distances above 800 m from default discovery.
- Describe both bands as straight-line estimates, not walking times.
- For complexes with at least 500 households, use the minimum distance from an academy address marker to any trusted apartment-building centroid.
- Trust a building match only when its matched-point count is 75-125% of the official building count.
- Use the complex representative point when a trusted building match is unavailable.
- Keep one apartment-to-address result by deduplicating `address_id` after evaluating all building points.
- Record `distance_origin_type` as `nearest_building_centroid` or `complex_centroid`.
- Never describe proximity as an official academy-to-school or academy-to-apartment assignment.

## Evidence

The capital-region inventory contains 4,285 complexes with at least 500 households. Trusted building points are available for 3,057 complexes (71.3%); 1,228 remain representative-point fallbacks.

At the 600 m threshold, the trusted cohort produced 91,037 apartment-to-academy-address links versus 70,054 from representative points, a net increase of 20,983 links. Results changed for 2,668 of 3,057 trusted complexes. The comparison uses 29,274 geocoded academy addresses and straight-line Haversine distance.

## Consequences

- Large-complex coverage improves without imposing VWorld collection on all 20,172 complexes.
- Users see core and extended proximity separately, avoiding an artificial large-complex advantage.
- The contract remains reproducible when entrances or pedestrian routing become available because raw distance and origin type are retained.
- Public schema, RLS, refresh cadence, and frontend markers require separate approval.
