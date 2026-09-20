# System Architecture

Status: **Current**  
Last updated: 2026-09-17

## Components

```text
Official/public source files and APIs
        ↓
Local/CI Python ETL and reviewed inputs
        ↓
Private Supabase Storage snapshots + transient staging
        ↓
Normalized operational master tables
        ↓ atomic refresh
school_apartment_serving + school_master
        ↓ Supabase Data API / RPC
React 18 + TypeScript + Vite application
```

## Runtime boundary

- The browser uses the Supabase public client and approved public read contracts only.
- Service-role credentials are restricted to local/CI ETL environments.
- The authenticated administrator page reads monitoring tables through RLS policies backed by `etl_admin_users`.
- Naver Maps renders geographic state but is not the source of school assignments.

## Deployment boundary

- Frontend builds from `src/` and deploys independently from ETL execution.
- SQL migrations in `sql/` define the database contract and are applied in order.
- The Windows scheduled task remains the production-write fallback.
- GitHub Actions currently verifies portable read-only reproduction; scheduled database writes require separate approval.

## Change rule

Schema, Serving fields, TypeScript types, service projections, ETL outputs, audits, and documentation must change together. Nationwide expansion must be released in bounded scopes rather than replacing the entire dataset at once.
