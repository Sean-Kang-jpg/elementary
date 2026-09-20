# Security Model

Status: **Current through SQL 13**  
Last updated: 2026-09-17

## Roles

| Role | Intended access |
|---|---|
| `anon` | Approved public school and Serving reads plus public filter RPC |
| `authenticated` | Public reads; monitoring reads only when `is_etl_admin()` succeeds |
| `service_role` | ETL staging, operational writes, cleanup, Serving refresh, and monitoring writes |

## Controls

- RLS remains enabled on every table in the exposed `public` schema.
- Data API table grants and RLS policies are both required; one does not replace the other.
- The browser must never receive service-role or secret keys.
- `SECURITY DEFINER` maintenance functions revoke default PUBLIC execution and grant only the required role.
- Private Storage holds source snapshots; anonymous download remains blocked.
- Administrator authorization is based on `etl_admin_users`, not user-editable metadata.

## Migration checklist

1. Review grants and RLS for every new or changed exposed object.
2. Verify privileged functions have fixed `search_path` and explicit execution revokes/grants.
3. Run database security/performance advisors when available.
4. Test anonymous, ordinary authenticated, administrator, and service-role behavior separately.
5. Record rollback counts and retain the previous complete Serving snapshot until verification passes.
