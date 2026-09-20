# ADR-005: Apartment transaction linkage

- Status: API authorized, linkage refinement required
- Date: 2026-09-20
- Source owner: Ministry of Land, Infrastructure and Transport
- Candidate API: apartment sale transaction detail data (`15126468`)

## Decision

Apartment sale transactions can be connected to the operational apartment master, but the relationship is derived rather than identifier-based. Keep raw transactions private and publish only complex-level aggregates after linkage quality and cancellation handling pass their gates.

Use the following ordered match contract:

1. `sggCd + umdNm + jibun + normalized aptNm/alias`
2. unique `sggCd + umdNm + jibun`
3. unique `sggCd + normalized aptNm/alias` as a reviewable fallback
4. ambiguous and unmatched rows remain unlinked

The current apartment master supports this contract with `legal_dong_code`, `legal_address`, `name_aliases`, and `canonical_complex_id`. The API does not expose the K-apt code or this project's canonical ID.

## Source behavior

- Requests are partitioned by five-digit legal-dong district code and contract month.
- Transaction history is contract-date based and may later receive cancellation or correction data.
- The source may provide apartment sequence, road-name, registration-date, and cancellation fields; their actual population must be profiled before the schema is fixed.
- Bulk collection must use the data.go.kr API rather than scraping the RTMS website.

## Pilot status

`etl/profile_apartment_transaction_source.py` fetches private monthly samples and reports field population plus match tiers. API authorization was confirmed on 2026-09-20. The August 2026 pilot covered Jongno, Gangnam, Bundang, and Yeonsu: 647 of 683 transactions linked (94.73%). Regional rates were 100.0%, 95.4%, 96.1%, and 93.9%, respectively. The result is close to but below the 95% production gate.

`aptSeq`, road-name fields, cancellation date/type, and registration date are present in the detailed response. Before production ingestion, persist an audited `aptSeq -> canonical_complex_id` crosswalk from high-confidence matches, add road-name address matching, and refresh newly completed complexes missing from the apartment master. Do not force ambiguous or unmatched trades into an existing complex.

## Production gates

- [x] Approve API `15126468` for the operational data.go.kr account and rerun the pilot.
- [x] Measure Seoul, Gyeonggi, and Incheon samples, including renamed and multi-building complexes.
- Add an audited `aptSeq` crosswalk and road-name match tier, then rerun the multi-region pilot.
- Require at least 95% deterministic linkage for publication; route ambiguous rows to review.
- Retain transaction identity, registration date, and cancellation/correction state so aggregates are reproducible.
- Store raw monthly snapshots privately and expose only complex-level monthly statistics.
- Estimate request volume and retention before adding the source to recurring ETL.

## Proposed serving shape

Do not append individual trades to `school_apartment_serving`. Prefer a separate `apartment_transaction_monthly_summary` keyed by `canonical_complex_id` and month, with transaction count, median/mean price, median price per square meter, area-band summaries, latest contract date, and source-as-of timestamp.
