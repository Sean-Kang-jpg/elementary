# Station Search Source Plan

Last updated: 2026-09-06

Status: **Deferred after v2.2 P4 discovery; resume when the official source file can be archived and profiled. Production schema is not approved.**

## Decision

Use the [Korea National Railway facility station dataset](https://www.data.go.kr/data/15093755/fileData.do) as the canonical station/location source. The official KRIC detail page currently publishes `전체_도시철도역사정보_20260630`; the public-data catalog still describes the preceding 1,073-row annual contract. It includes station number, station name, line number/name, transfer information, WGS84 latitude/longitude, operator, road address, and source date, and the catalog marks it free with no usage restriction.

Use the [Rail Data Portal operator/line/station code list](https://openapi.kric.go.kr/rips/M_04_02/intro.do) as a change feed and validation source. The portal publishes dated code-list revisions more frequently than the annual location file, including additions and station renames. It does not replace the coordinate-bearing annual file.

Do not use the Seoul Metro station-name API as the canonical source. It is useful for operator-specific validation, but its 1-9 line coverage cannot represent the full Seoul/Gyeonggi/Incheon product area.

## Pilot Contract

Keep source rows private during the pilot. Do not add fields to `school_master` or `school_apartment_serving`.

- `station_master`: canonical physical station ID, current display name, normalized name, latitude, longitude, road address, transfer flag, source date, and review status.
- `station_lines`: station FK, operator code/name, line code/name, source station number, and source date. One physical transfer station may have several rows.
- `station_aliases`: station FK, previous name, parenthetical/secondary name, normalized search alias, source, valid dates, and review status.
- Optional `station_search_serving`: one compact public row per physical station after the pilot passes. This would be an explicit third frontend read contract.

Canonical IDs must be built from official operator, line, and station codes. Name plus coordinate proximity may suggest a transfer grouping but must not silently create the physical-station identity. Ambiguous transfer groups and renamed stations enter a review queue.

Normalize search aliases by removing spacing, punctuation, a trailing `역`, and parenthetical line labels. Preserve the original text as a display alias. Rows with the same normalized name are search candidates, not automatic identity matches. A physical transfer grouping is accepted only when official transfer metadata agrees and coordinates are within 150 meters; every disagreement remains a separate station until reviewed.

## Search And Map Behavior

- Search station names and reviewed aliases; show the station name once with all served lines.
- Selecting a station should preserve a useful neighborhood scale and show nearby schools, rather than zooming to a single point.
- Start the mobile pilot with a 1.5 km school radius and a maximum zoom of 14; measure whether at least several nearby schools remain visible.
- Compute proximity through a bounded PostGIS RPC using `ST_DWithin` and `ST_Distance`. Do not materialize every station-to-school or station-to-apartment pair.
- Return only station metadata, matching school IDs, and distance required by the current map flow. Apartment information remains loaded through the selected school's existing Serving query.

Address search remains separate. It needs a geocoding-provider, credential, quota, caching, and accuracy decision and must not be folded into station-name search during this pilot.

## Pilot Checks

- [ ] Download the latest annual history XLSX and latest dated code list into private source snapshots with checksums.
- [x] Add `etl/profile_station_source.py` to read XLSX/CSV without a new Python dependency and generate `station_profile.json` plus `station_review_candidates.csv`.
- [ ] Limit the first profile to Seoul, Gyeonggi, and Incheon and measure row count, coordinate completeness, duplicate codes, duplicate normalized names, transfer groups, and renamed stations.
- [ ] Verify WGS84 coordinates against at least 30 representative stations, including transfer, boundary, newly opened, and renamed stations.
- [ ] Confirm stable operator/line/station code composition and manually review every ambiguous physical-station group.
- [ ] Estimate database and Storage use; the public serving projection should remain a small lookup table rather than a large proximity matrix.
- [ ] Prototype station/alias search and the 1.5 km RPC locally, then measure response time and mobile map framing.
- [ ] Approve the third public read contract, RLS/GRANT policy, refresh cadence, and browser smoke coverage before production migration.

Run the profile after placing the official source in the private/local ETL input area:

```powershell
python etl/profile_station_source.py <official-file.xlsx> --output-dir etl/local_outputs/station_profile
```

The automated browser reached the official `download.file?type=filedata&id=32&operation=1` endpoint on 2026-09-06, but the managed browser blocked the file response and the terminal could not resolve the institution domain. The source-download checklist therefore remains open; no placeholder data is treated as official.

## Go/No-Go Gate

Proceed to schema design only when capital-region coverage and coordinates are complete enough for map search, official codes are stable, transfer grouping is reviewed, the license record is archived, and the bounded proximity query meets the frontend latency budget. Otherwise retain the files as private discovery snapshots and keep station search out of production.
