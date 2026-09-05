# Future Data Domains Plan

Last updated: 2026-09-06

Status: **v2.2 P6 discovery queue; no production schema change approved.**

This plan covers NEIS academy/tutoring-center data, elementary timetable data, and Ministry of the Interior and Safety playground data. All three domains stay separate from `school_master` and `school_apartment_serving` until their product use, volume, licensing, and quality gates are verified.

## 1. Academy And Tutoring Centers

Source: [NEIS 학원교습소정보](https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN19220231012134453534385&infSeq=1)

The official dataset is updated weekly and includes institution name, registration status, capacity, field, series, course, address, and disclosed tuition information. A live sample confirmed `ACA_ASNUM`, `REALM_SC_NM`, `LE_ORD_NM`, `LE_CRSE_LIST_NM`, `LE_CRSE_NM`, and `PSNBY_THCC_CNTNT`, but no dedicated target-grade field. It covers middle/high-school offerings as well as elementary offerings, so an academy must not be labeled `초등 대상` from its name alone.

### Classification Pilot

- [ ] Collect one complete weekly capital-region snapshot and profile field/value distributions.
- [ ] Determine whether rows represent institutions, courses, or institution-course combinations and establish a stable source key.
- [ ] Classify each course as `explicit_elementary`, `likely_elementary`, `mixed`, `excluded`, or `unknown` using course/series/target text.
- [ ] Manually review at least 200 stratified rows, including mixed `초중고`, arts/sports, language, and tutoring-center cases.
- [ ] Publish only `explicit_elementary` initially. Admit `likely_elementary` only after precision reaches the agreed threshold; never promote `mixed` or `unknown` automatically.
- [ ] Confirm address completeness and geocode match rate before adding map markers or school-distance features.

### Candidate Model

- `academy_institution_master`: canonical institution, type, status, address, coordinates, education-office identifiers, and current source date.
- `academy_course_offerings`: institution FK, field/series/course, capacity, tuition disclosure, elementary classification, confidence, evidence, and review flag.
- `academy_name_history` and `academy_property_history`: add only if weekly snapshots show meaningful rename or attribute changes.

Keep source snapshots private. Normalized tables remain service-role-only during the pilot; expose a reviewed serving table or RPC only after classification and geocoding pass.

## 2. Elementary Timetables

Source: [NEIS 초등학교시간표](https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN15020190408160341416743&infSeq=1)

The official dataset is updated daily and provides academic year, semester, school, grade, class, date, period, and lesson content. A 서울대곡초 sample confirmed `AY`, `SEM`, `ALL_TI_YMD`, `GRADE`, `CLASS_NM`, `PERIO`, and `ITRT_CNTNT`. NEIS notes that 2025 onward is available through the current API, while August 2023 through 2024 is not available through the normal API path.

### Volume And Product Pilot

- [ ] Verify `school_master.neis_school_code` and education-office-code coverage before collection.
- [ ] Collect four weeks for 10 schools across small/large and Seoul/Gyeonggi/Incheon samples.
- [ ] Measure rows per school-day, missing days/classes, subject normalization, corrections, API limits, and compressed snapshot size.
- [ ] Decide the user feature before production storage: today's timetable, weekly class view, or school-level curriculum summary.
- [ ] Keep immutable raw responses in private Storage; do not retain nationwide row-level history in PostgreSQL by default.
- [ ] Select a bounded database policy after measurement, such as current term or a rolling 35-day window, and purge superseded rows automatically.

### Candidate Model

- `school_timetable_entries`: `school_id` FK, NEIS codes, academic year, semester, date, grade, class, period, lesson content, source date, and loaded timestamp.
- Natural uniqueness: school, academic year, semester, timetable date, grade, class, and period.
- Optional `school_timetable_summary`: derived school/grade subject counts only if a report feature needs aggregation.

Anonymous access should use a narrow serving RPC or view with RLS, never the raw table or NEIS key. The frontend must request a specific school/date/grade rather than downloading a whole term.

## 3. Children's Playgrounds

Source: [생활안전지도 어린이놀이시설정보](https://www.safemap.go.kr/opna/data/dataViewRenew.do?objtId=159)

The annual nationwide dataset provides source IDs, address, X/Y coordinates, installation date, accident-related flags, installation-place type, public/private type, indoor/outdoor type, and operating status. Installation-place codes distinguish parks, apartment complexes, schools, academies, childcare facilities, and other venues.

### Legal And Spatial Pilot

- [ ] Confirm whether the planned service is compatible with the stated Korea Open Government License Type 4 conditions: attribution, non-commercial use, and no derivatives.
- [ ] Confirm whether the location-information business registration or notification described in the API application notice applies to this product. Treat this as a release blocker, not an ETL detail.
- [ ] Obtain an approved API key only after the licensing and location-service checks are resolved.
- [ ] Identify the X/Y coordinate reference system and validate transformed coordinates against at least 100 addresses across the capital region.
- [ ] Profile source-ID stability, duplicate IDs, colocated facilities, missing coordinates, operating-status values, and annual changes.
- [ ] Keep separate source records when one apartment, park, or school contains multiple registered play facilities; do not deduplicate by name/address alone.

### Candidate Model

- `playground_master`: source object/facility IDs, facility name, address, administrative codes, source X/Y and CRS, transformed PostGIS point, installation date, place/public/private/indoor/outdoor/operation codes, accident flags, source year, and review status.
- `playground_place_types`: versioned lookup for the official installation-place codes rather than hard-coded frontend labels.
- Optional `place_playground_serving`: only after product approval, provide viewport and nearest-facility reads with operating facilities as the default.

School/apartment proximity should be calculated spatially from canonical coordinates and a declared radius. Do not store a playground as assigned to a school or apartment unless an official relationship exists.

## 4. ETL And Monitoring Changes

- [ ] Add dedicated collectors with pagination, retry, checksum, schema-drift detection, and source snapshots.
- [ ] Extend the monitoring-domain constraint for `academy`, `timetable`, and `playground` only when the pilot migrations are approved.
- [ ] Register expected cadence as weekly for academy data, daily for timetable data, and annual for playground data.
- [ ] Add quality checks for source-key duplicates, classification coverage, school-code linkage, missing timetable periods, playground coordinate/operation-code validity, freshness, and retention cleanup.
- [ ] Estimate PostgreSQL and Storage usage against the Supabase free-tier budget before enabling recurring production runs.
- [ ] Keep all three sources out of the two-table public map contract until a frontend feature explicitly requires them.

## Go/No-Go Gates

Academy production ingestion requires a stable key, acceptable elementary-classification precision, and adequate geocoding coverage. Timetable production ingestion requires a defined user feature, verified school-code linkage, measured volume, and an approved retention limit. Playground ingestion additionally requires confirmed license compatibility, location-service compliance, coordinate-system validation, and stable source identifiers. Failure of any gate leaves the source as a reproducible private snapshot rather than a public database table.
