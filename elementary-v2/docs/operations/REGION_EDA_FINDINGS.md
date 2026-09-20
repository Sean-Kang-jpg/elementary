# Region EDA Findings

Last updated: 2026-09-21

Accumulated results of the per-region EDA gate defined in `OPERATION_PLAN.md`. One section per scope, newest first. Findings here are the reason the registry holds the values it does; they are not a task list.

Reproduce any section with:

```bash
python -m etl.profile_region_schools <region> [--cities ...] [--compare ...] --json etl/runtime/region_eda/<name>.json
```

Source: `etl/data/schoolzone/school_location_20260320.csv`, the nationwide school standard-data snapshot (6,303 elementary schools). Generated profiles live in `etl/runtime/region_eda/` and are not committed.

## Nationwide baseline (all 17 regions, 2026-09-20)

Measured while profiling Daejeon, because the registry's approximate values needed replacing anyway.

- The 17 registry regions account for **all 6,303** nationwide elementary schools with no unresolved address. The `address_prefixes` rule works nationwide.
- Every region's coordinate envelope is now measured from this snapshot and widened by 0.05°. The previous approximate envelope for 경상북도 was already wrong: 울릉군 schools reach 130.90°E, outside the guessed bound.
- Nationwide elementary schools are **2.8× the current capital-region 2,260**, which is what forces the frontend's one-shot school load to become scoped.

### School-name region prefix is not a rule anywhere

The capital pipeline strips a `서울`/`인천` prefix when matching school-zone labels. Measured coverage shows this cannot generalize:

| Region | Prefix coverage | Region | Prefix coverage |
| --- | --- | --- | --- |
| 대구광역시 | 96.6% | 광주광역시 | 27.7% |
| 서울특별시 | 93.9% | 제주특별자치도 | 5.0% |
| 인천광역시 | 88.8% | 울산광역시 | 4.0% |
| 대전광역시 | 80.6% | 세종특별자치시 | 1.8% |
| | | 부산광역시 | 1.3% |
| | | 9 provinces | 0.0% |

**No region reaches 100%**, including the two the pipeline already treats as prefixed. 부산 and 울산 have effectively no prefix, so the `assumed` prefixes first written into the registry for them were wrong. The registry now stores measured coverage instead of an assumption, and matching must accept the prefixed and unprefixed form of every label (`Region.name_variants`).

## Source-wide finding: K-apt reports a 광주-전남 merger the other sources do not

Found while profiling Daejeon apartments, and it affects the later N1 scopes rather than Daejeon itself.

The K-apt snapshot dated 2026-09-04 has **16 distinct `시도` values, not 17**. 광주광역시 and 전라남도 are both absent; in their place is `전남광주통합특별시` with 1,710 complexes, covering 광주's five 구 (북구 266, 광산구 263, 서구 181, 남구 164, 동구 58) together with 전남's cities and counties (목포시 149, 순천시 147, 여수시 126, …).

No other source agrees, and K-apt does not even agree with itself:

| Source | Date | 광주 / 전남 representation |
| --- | --- | --- |
| K-apt `시도` column and 법정동주소 | 2026-09-04 | `전남광주통합특별시` (merged) |
| K-apt 도로명주소, same rows | 2026-09-04 | `전라남도`, `광주광역시` (separate) |
| School standard data | 2026-03-20 | separate |
| 학구도 polygons (`SD_CD` 29, 46; `EDU_UP_NM`) | 2026-03-20 | separate, with 광주광역시교육청 and 전라남도교육청 intact |

1,554 of 21,712 K-apt rows have a `시도` value that disagrees with their own road address.

The merger is real and confirmed: 광주시 and 전라남도 merged into **전라남도광주특별시** on **2026-07-01**, and their education offices merge as well. K-apt writes the merged value as `전남광주통합특별시`; the registry records the official name and the K-apt spelling together and resolves either identically.

**The merged region has two different address depths inside it**, which is why it cannot be one region:

| Area | 법정동주소 shape | Example |
| --- | --- | --- |
| 광주 (932 complexes) | region → 구, no city level | `전남광주통합특별시 동구 금남로5가 154-1` |
| 전남 (778 complexes) | region → 시/군 → 읍면동 | `전남광주통합특별시 목포시 용당동 1214` |

### How it is handled

Both halves stay separate registry regions, matching the school standard data, the 학구도 polygons, and K-apt's own road addresses — every source that feeds the assignment backbone. `merged_source_regions` in the registry translates the source value instead, and `resolve_source_region()` splits it by 시군구 (the five 광주 구) or by the row's own road address. `get()` deliberately refuses `전남광주통합특별시` so it can never be mistaken for an alias of either half.

Validated against the full K-apt file: all 21,712 rows resolve into exactly 17 regions, with 광주광역시 932 and 전라남도 778 summing to the 1,710 merged rows. Only 2 rows anywhere disagree with their own road address, and both are unrelated source errors (a 마포구 row addressed in 고양시, a 정읍시 row addressed in 부산).

This is a source-translation layer, deliberately not the final model. Collapsing the two halves into one region is blocked on the sources, not on the decision: the school standard data and the 학구도 polygons still carry 광주광역시교육청 and 전라남도교육청 as separate offices with separate `SD_CD` values. When they migrate, three things change together — one region with a **per-area address depth** (the 광주 half has no city level, the 전남 half does), one merged education office, and the displayed region name. Tracked as I-20.

Because the education offices merge, the 광주 and 목포 EDA passes must re-check the school-zone label format against the post-merger office rather than reusing anything measured here. Both scopes stay in the N1 queue with EDA first.

Daejeon is unaffected: its 588 K-apt rows carry `대전광역시` and its five districts.

## 대전광역시 (2026-09-20)

First N1 scope. Chosen as the pilot because it is small, has one education office, five districts, no islands, and no annexation history.

### Measured

- 155 elementary schools, all `운영` status, 151 본교 and 4 분교.
- One 시도교육청 (대전광역시교육청) split into **two** 교육지원청: 서부 84 schools, 동부 71.
- Districts: 서구 42, 유성구 42, 중구 27, 동구 23, 대덕구 21.
- No city level; addresses are 대전광역시 → 구 → 동. The frontend's province → city → district branch does not apply.
- Coordinates complete for all 155 schools; measured bounds 36.2292-36.4542N, 127.2642-127.4938E — the most compact region in the country.
- Name prefix `대전` covers 125 of 155 (80.6%). The 30 without it are not random: 신탄진, 가수원, 산내, 유성, 회덕, 진잠 and other established place-name schools, plus both pre-merger 분교 parents (기성초등학교길헌분교장, 대덕초등학교도룡분교장).
- Branch-school naming uses two forms: `기성초등학교길헌분교장` (unprefixed parent) and `대전원신흥초등학교복용분교장` (prefixed parent). Matching must handle both.

### Implications for the build

- Prefix stripping must be variant-based; a rule that requires `대전` would miss 30 schools and one that forbids it would miss 125.
- Two support offices in one region is the first concrete case of the "organized differently inside one office" risk. The school-zone EDA must compare 동부 and 서부 label formats before any build.
- The compact bounds make Daejeon a good rollback rehearsal scope: a wrong assignment is easy to spot geographically.

### School zones

The source was never lost. The 2026-08-28 archiving pass moved it to `archive/elementary-v2-pre-operational-20260828/etl/data/hakgudo/` and left the empty directories behind; on 2026-09-20 all 13 files were moved back to `etl/data/hakgudo/`. It covers all 17 regions, so no other region's EDA is blocked either.

**Two snapshots are present, and the production script uses the older one:**

| File | `BASE_DT` | Zones nationwide | 대전 zones |
| --- | --- | --- | --- |
| `data/hakgudo/elem_hakgudo_20250922.shp` (used by `verify_hakgudo_spatial_join.py`) | 2025-09-22 | 7,123 | 167 (단독 139, 공동 28) |
| `data/hakgudo/20260320/extracted/초등학교통학구역.shp` | 2026-03-20 | 7,140 | 170 (단독 138, 공동 32) |

The newer snapshot matches the 2026-03-20 school standard data already used elsewhere in the pipeline, so Daejeon should build from it rather than from the 2025 file.

- Split by support office as 서부 90 / 동부 77 (2025 snapshot), matching the school-side split.
- Zones outnumber schools because a 공동통학구역 names two schools in one record. One-way zones are written as `공동(일방)`.

**Joint-zone labels mix prefixed and unprefixed school names in a single string**: `구즉초대전송강초공동통학구역` joins an unprefixed and a prefixed name, while `동명초신탄진용정초공동통학구역` joins two unprefixed ones. This is the concrete reason the prefix must be a variant rather than a rule.

### The capital matching method works here unchanged

Running the existing `match_school_zone` from `build_operational_masters.py`, with candidate labels expanded through `Region.name_variants`, against all 167 Daejeon zones:

- **100% on both snapshots: 167 of 167 zones (2025-09-22) and 170 of 170 (2026-03-20).**
- 153 of 155 schools are covered in both. The 2 without a zone are 대전삼육초등학교 and 대전성모초등학교, both 사립 — private schools have no 통학구역, so this is correct, not a gap.
- With plain candidates and no variants the result drops to 166/167; the one failure is `대덕초도룡분교통학구역`, which the existing 분교장 suffix handling recovers.

No new matching method is required for Daejeon. The change needed is in the registry-driven candidate generation, not in the matching algorithm.

### Apartments

Sources: the nationwide apartment base master (`archive/GAS/GAS/임시/apt_mst_info_202410.csv`, 46,493 complexes, **CP949 encoded**) and K-apt (`kapt_basic_20260904.csv`, 21,712 complexes nationwide).

- 1,063 Daejeon complexes in the base master (`legal_dong_cd` prefix 30), **0 missing coordinates**.
- Spatial join against the 170 Daejeon polygons of the 2026-03-20 snapshot: **1,063 of 1,063 (100%) fall inside exactly one school zone.** No unmatched complex and no complex in two zones, so Daejeon needs no representative-point fallback and no ambiguity queue at this stage. The capital baseline by contrast carries 247 building-match failures (I-02).
- 588 Daejeon complexes in K-apt, cleanly labelled `대전광역시` with the five districts.
- K-apt to base-master linkage by normalized road address: **481 of 588 (81.8%) match exactly.** Of the remainder, 80 have no road address in K-apt at all and must fall back to 법정동주소, and only 27 have a road address that fails to match — most of those store two comma-separated addresses in one field (`대전광역시 동구 대전로448번길 11,...번길 16`), which splitting resolves.

Both figures above are for the 2026-03-20 school-zone snapshot, per I-19.

### Method note

The base master is CP949, as `build_apartment_master_v1.py:123` already assumes. Reading it as UTF-8 silently mangles every Korean field and produces a 0% address match rate that looks like a data problem rather than an encoding one. Any new script that touches this file must set the encoding explicitly.

### Still open for Daejeon

- Comparison of 동부 and 서부 label conventions beyond the aggregate result above (the 100% segmentation rate suggests no divergence, but the joint-zone subset should be checked per office).
- Running the actual scoped build, which requires the N0 collector and builder scope parameters.
