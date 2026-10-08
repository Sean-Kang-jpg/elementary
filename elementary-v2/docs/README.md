# Elementary Documentation

Status: **Active documentation index**  
Last updated: 2026-09-27

This directory contains the maintained product, architecture, UX, operations, decision, and reference documents for the active application. Pending work is authoritative only in the Operation Plan.

## Start here

- [Project Overview](PROJECT_OVERVIEW.md): the whole system in one read — sources, ETL, the two database layers, deployment, branch rules, verification gates, and the traps that have actually bitten. Written for a non-developer; start here if the project is new to you. Korean.
- [Product Brief](product/PRODUCT_BRIEF.md): users, problem, value, and current boundary.
- [Product Requirements](product/PRD.md): functional and non-functional requirements.
- [Data Architecture](architecture/DATA_ARCHITECTURE.html): current DRD and preserved v2.0 measured baseline.
- [System Architecture](architecture/SYSTEM_ARCHITECTURE.md): runtime, ETL, database, and deployment boundaries.
- [Operation Plan](operations/OPERATION_PLAN.md): the single current backlog, status log, issues, and release gates.

## Product

- [Audit 2: 입학 전 시간표·익명 수요 확장](product/PLATFORM_EXPANSION_AUDIT2_20261006.md): Audit1 보존 mapping, 11개 설계 산출물, 공식 경쟁사 비교, ETL/시간표/집계/migration 계획.
- [Audit 2 실행 TODO](operations/OPERATION_PLAN.md#audit2-expansion): Phase1 자료 가능성 → Phase2 시간표 MVP → Phase3 수요 공개/밀집 검증.
- [Audit 2 운영 DB 기준선](research/audit2/SCHEMA_BASELINE_20261006.md): SQL06~24 선언 존재 비교, live catalog 증거와 보안 조치 영향. 보안 변경은 미적용.
- [Audit 2 실제 정의 대조](research/audit2/DEFINITION_DIFF_20261006.md): 컬럼·외래키·인덱스·함수·정책 차이 및 격리 권한 테스트 미실시 범위.
- [Audit 2 Docker 없는 읽기 검증](research/audit2/READ_ONLY_VERIFICATION_20261006.md): 운영 READ ONLY 역할 검증, 공개 Auth 설정과 public smoke 최종 PASS, 쓰기 검증과 미확인 범위 구분.
- [최소 보호 기준선](research/audit2/MINIMUM_PROTECTION_BASELINE_20261006.md): 기존 URL·영구 ID·기기 저장·체크리스트 보호, 개편 착수 gate 완료.
- [학교 자료 PoC 착수](research/audit2/ETL_POC_START_20261006.md): 60학교 manifest, 개발/평가/지역 coverage 분모와 밀집 모집 후보 구분.
- [NEIS PoC 실제 응답](research/audit2/NEIS_POC_RESULTS_20261006.md): 47학교 코드 정확 연결/13 주소 검토 큐, 4학교 시간표·학사일정 sample과 미확보 절대시각 구분.
- [NEIS 기존 ETL 재검증·문서 조사](research/audit2/NEIS_RECONCILIATION_20261006.md): 최신 59학교 연결/청산초 1보류, 5학교 API 표본, 개발2학교 문서 source registry와 공개 게시판 조사.
- [어디초 개편 실행 계획](product/PLATFORM_EXPANSION_PLAN.md): 첨부 실행 가이드 기준 Phase 0~7, 목표 IA와 단계별 완료 조건.
- [어디초 개편 실행 TODO](operations/OPERATION_PLAN.md#platform-expansion): 개편 진행상태와 검증 근거를 관리하는 단일 체크리스트.
- [어디초 1차 감사](product/PLATFORM_EXPANSION_AUDIT_20261005.md): 코드/SQL 기준 자산·Reuse Map·schema 초안 및 운영 확인 한계.
- [Product Brief](product/PRODUCT_BRIEF.md)
- [Product Requirements](product/PRD.md)
- [Product Concept v1.1](product/PRODUCT_CONCEPT.md): where the product is going — decision-tool framing, screen model, staged scope, brand. Korean. Forward-looking; the Brief and PRD govern what ships today.
- [Measurement Plan](product/MEASUREMENT_PLAN.md): tooling, the seven events, and how the north-star metric is computed. Korean.
- [User Journeys](product/USER_JOURNEYS.md)
- [Information Architecture](product/INFORMATION_ARCHITECTURE.md)
- [News Content Contract](product/NEWS_CONTENT_CONTRACT.md)

## Architecture

- [Data Architecture / DRD](architecture/DATA_ARCHITECTURE.html)
- [System Architecture](architecture/SYSTEM_ARCHITECTURE.md)
- [Data Contracts](architecture/DATA_CONTRACTS.md)
- [Security Model](architecture/SECURITY_MODEL.md)
- [SQL Execution Guide](../sql/EXECUTION_GUIDE.md)

## UX

- [UX Scenarios](ux/UX_SCENARIOS.md)
- [Map Interaction Specification](ux/MAP_INTERACTION_SPEC.md)
- [Frontend UX System Plan](ux/FRONTEND_UX_SYSTEM_PLAN.md)

## Operations

- [Operation Plan](operations/OPERATION_PLAN.md)
- [Deployment](operations/DEPLOYMENT.md): how the site actually ships, the check to run after every deploy, and the move to git-connected builds. Korean.
- [ETL Scheduling](operations/ETL_SCHEDULING.md)
- [Monitoring](operations/MONITORING.md)
- [Region Scope Inventory](operations/REGION_SCOPE_INVENTORY.md): every capital-region assumption in the codebase, classified for the N0 generalization pass.
- [Region EDA Findings](operations/REGION_EDA_FINDINGS.md): measured results of the per-region EDA gate, newest first.
- [Held Review Cases](operations/REVIEW_HELD_CASES.md): the 20 complexes that fall in no school zone, the only pooled review cases still open.
- [Manual QA Review](operations/MANUAL_QA_REVIEW.html): browser checklist for the current regional assignment samples; verdicts stay in this browser until exported as CSV.
- [Project Progress](PROJECT_PROGRESS.html): summary dashboard; it is not the authoritative backlog.

## Decisions

- [ADR-001: Two-table public read model](decisions/ADR-001-serving-read-model.md)
- [ADR-002: Official school-zone source](decisions/ADR-002-official-school-zone-source.md)
- [ADR-003: Nationwide rollout](decisions/ADR-003-nationwide-rollout.md)
- [ADR-004: Academy proximity distance](decisions/ADR-004-academy-proximity-distance.md)
- [ADR-005: Apartment transaction linkage](decisions/ADR-005-apartment-transaction-linkage.md)
- [ADR-006: Detail-page rendering](decisions/ADR-006-detail-page-rendering.md): serverless prerender for detail routes so Naver and Google can index them. Korean.
- [ADR-007: Immutable public identifiers](decisions/ADR-007-immutable-public-identifiers.md): why public URLs cannot carry `canonical_complex_id`, and the slug anchored to component atoms that replaces it. Korean.

## Reference

- [Pipeline validation evidence](reference/DATA_PIPELINE_VALIDATION_20260825.md)
- [Concept preflight verification](reference/REPORT_CONCEPT_PREFLIGHT_20260926.md): measured region scope, identifier stability, and apartment source-date gaps behind the concept's phase 0. Korean.
- [Station search source plan](reference/STATION_SEARCH_SOURCE_PLAN.md)
- [Release history](RELEASES.md)

## Document rules

- `operations/OPERATION_PLAN.md` is the only active task checklist.
- Architecture and UX documents describe accepted behavior, not work status.
- ADRs preserve why consequential decisions were made.
- Dated reports and reproducibility scripts remain outside the active tree under `../../../archive/elementary-v2-analysis-20260916/`.
- Compatibility pointer files at the previous document paths remain for one release and must not receive new content.
