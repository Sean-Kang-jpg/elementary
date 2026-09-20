# Elementary Documentation

Status: **Active documentation index**  
Last updated: 2026-09-17

This directory contains the maintained product, architecture, UX, operations, decision, and reference documents for the active application. Pending work is authoritative only in the Operation Plan.

## Start here

- [Product Brief](product/PRODUCT_BRIEF.md): users, problem, value, and current boundary.
- [Product Requirements](product/PRD.md): functional and non-functional requirements.
- [Data Architecture](architecture/DATA_ARCHITECTURE.html): current DRD and preserved v2.0 measured baseline.
- [System Architecture](architecture/SYSTEM_ARCHITECTURE.md): runtime, ETL, database, and deployment boundaries.
- [Operation Plan](operations/OPERATION_PLAN.md): the single current backlog, status log, issues, and release gates.

## Product

- [Product Brief](product/PRODUCT_BRIEF.md)
- [Product Requirements](product/PRD.md)
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
- [ETL Scheduling](operations/ETL_SCHEDULING.md)
- [Monitoring](operations/MONITORING.md)
- [Region Scope Inventory](operations/REGION_SCOPE_INVENTORY.md): every capital-region assumption in the codebase, classified for the N0 generalization pass.
- [Region EDA Findings](operations/REGION_EDA_FINDINGS.md): measured results of the per-region EDA gate, newest first.
- [Project Progress](PROJECT_PROGRESS.html): summary dashboard; it is not the authoritative backlog.

## Decisions

- [ADR-001: Two-table public read model](decisions/ADR-001-serving-read-model.md)
- [ADR-002: Official school-zone source](decisions/ADR-002-official-school-zone-source.md)
- [ADR-003: Nationwide rollout](decisions/ADR-003-nationwide-rollout.md)

## Reference

- [Pipeline validation evidence](reference/DATA_PIPELINE_VALIDATION_20260825.md)
- [Station search source plan](reference/STATION_SEARCH_SOURCE_PLAN.md)
- [Release history](RELEASES.md)

## Document rules

- `operations/OPERATION_PLAN.md` is the only active task checklist.
- Architecture and UX documents describe accepted behavior, not work status.
- ADRs preserve why consequential decisions were made.
- Dated reports and reproducibility scripts remain outside the active tree under `../../../archive/elementary-v2-analysis-20260916/`.
- Compatibility pointer files at the previous document paths remain for one release and must not receive new content.
