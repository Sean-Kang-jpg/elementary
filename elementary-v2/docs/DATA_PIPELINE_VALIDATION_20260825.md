# Data Pipeline Validation Notes

Date: 2026-08-25  
Scope: Seoul, Gyeonggi, Incheon elementary-school assignment pipeline

## Decision

Geomarket 2024 is no longer treated as the source of truth. It is retained only as a historical comparison and regression-check dataset. The current assignment source of truth is:

1. Official elementary hakgudo polygon SHP: `etl/data/hakgudo/elem_hakgudo_20250922.shp`
2. Apartment source coordinates from `apt_mst_info_202410.csv`
3. VWorld `LT_C_SPBD` building polygons for edge cases and large complexes

The target ETL shape is a two-stage pipeline:

1. Assign every apartment by representative point and official hakgudo polygon.
2. Refine only ambiguous candidates with VWorld building-level polygons.

## Local ETL Outputs

Generated under `etl/local_outputs/`:

- `apartment_point_assignments.csv/json`: all representative-point assignments.
- `building_check_candidates.csv/json`: apartments requiring VWorld building-level refinement.
- `building_refined_assignments.csv/json`: per-apartment building refinement summary.
- `building_refined_dongs.csv/json`: per-building/dong assignment rows.
- `building_match_failures.csv`: VWorld candidate cases not matched by current rules.
- `high_confidence_geomarket_compare.csv`: high-confidence assignments compared to Geomarket.
- `high_confidence_geomarket_difference_analysis.csv/json`: detailed reason classification for differences.

## Representative-Point Assignment Results

Input apartments: `20,422`

| Metric | Count |
|---|---:|
| Point assigned | 20,385 |
| Point no-hit | 37 |
| High-confidence point assignment | 19,338 |
| Needs building check | 1,084 |

Candidate reasons are not mutually exclusive:

| Reason | Count |
|---|---:|
| Nearby multiple hakgudo | 515 |
| Within estimated radius to boundary | 613 |
| Large complex near boundary | 529 |
| Point no-hit | 37 |

## VWorld Building Refinement Results

Refinement input: `1,084` building-check candidates.

| Result | Count | Interpretation |
|---|---:|---|
| `split_by_building` | 89 | Actual dong-level split; store building/dong assignments. |
| `single_by_building` | 740 | Candidate resolved to a single hakgudo. |
| `building_match_failed` | 255 | Needs better name/address matching or manual review. |

Current VWorld matching uses road name/building number and normalized building name matching. Failures are concentrated in small complexes, officetels, mixed-use buildings, legacy names, and cases where VWorld building names differ from apartment source names.

## Geomarket Difference Analysis

For the `19,338` high-confidence point assignments, comparison with Geomarket 2024 found `1,107` differences or missing elementary assignments. Geomarket `apt_cd` duplicates were checked and counted as `0`, so the differences are not caused by duplicate keys.

| Reason | Count | Interpretation |
|---|---:|---|
| Geomarket multiple, new primary included | 514 | Not a hard conflict; official polygon narrowed a multi-school Geomarket assignment to one primary hakgudo. |
| Geomarket row exists but elementary assignment missing | 309 | Source row exists, but `hakgudo_info.초등학교` is empty/missing. |
| Geomarket hakgudo obsolete or renamed | 95 | Geomarket hakgudo name does not exist in current official polygons. |
| Joint hakgudo expression changed | 93 | Difference appears to be single/joint hakgudo expression drift. |
| Hard conflict needing sample review | 86 | New official primary hakgudo and Geomarket single assignment differ. |
| Partly obsolete multi-assignment | 10 | Some Geomarket candidate names are no longer present in current polygons. |

Priority manual review target: `different_current_hakgudo_needs_sample_review` (`86` rows), mostly in Gyeonggi.

## Scripts Added

- `etl/build_local_assignment_etl.py`: builds official-polygon point assignments and building-check candidates.
- `etl/refine_building_assignments_vworld.py`: refines building-check candidates through VWorld `LT_C_SPBD`.
- `etl/compare_high_confidence_geomarket.py`: compares high-confidence new assignments against Geomarket.
- `etl/analyze_geomarket_differences.py`: classifies Geomarket differences by likely cause.

## DB Loading Direction

Recommended base tables:

- `apartments`: one row per internal apartment ID, preserving `geomarket_apt_cd`, source address, coordinates, and source metadata.
- `hakgudo_areas`: official polygon metadata keyed by `hakgudo_id`.
- `apartment_assignments`: final apartment-level assignment with `assignment_method` (`point`, `building_polygon`, `manual_review`) and confidence.
- `apartment_building_assignments`: dong-level rows for `split_by_building` apartments.
- `assignment_review_queue`: `building_match_failed`, point no-hit, and the 86 hard Geomarket conflicts.

Do not make Geomarket assignments authoritative in DB. Store them as `geomarket_reference` fields or a separate comparison table.

## Next Steps

1. Review the 86 hard Geomarket conflicts with official lookup/map samples.
2. Improve VWorld matching for the 255 building-match failures.
3. Generate final merged assignment output: point high-confidence + VWorld refined + review queue.
4. Create Supabase/PostGIS schema and load local CSV/JSON outputs.
