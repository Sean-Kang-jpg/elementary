# ETL Monitoring Setup

## Database Migration

Apply `sql/12_create_etl_monitoring_dashboard.sql` after migrations `09`-`11`. It adds schedule, scope, run-check, and administrator access contracts without exposing operational tables to anonymous users.

## Administrator Account

1. In Supabase, open **Authentication > Users** and create a password-based user.
2. Copy the user's UUID.
3. Register that UUID in the SQL Editor:

```sql
INSERT INTO etl_admin_users (user_id, display_name)
VALUES ('<auth-user-uuid>', 'ETL Administrator')
ON CONFLICT (user_id) DO UPDATE
SET display_name = EXCLUDED.display_name;
```

Open `/admin/etl` and sign in with that account. The dashboard never uses `SUPABASE_SERVICE_KEY`; authenticated RLS permits only registered administrator UUIDs to read monitoring data.

To revoke access:

```sql
DELETE FROM etl_admin_users WHERE user_id = '<auth-user-uuid>';
```

## Monitored Status

- Schedule: weekly K-apt, annual school basics and grade statistics, and the disabled school-zone automation placeholder.
- Scope: data domain plus Seoul, Gyeonggi, and Incheon coverage.
- Runs: trigger type, attempts, row counts, duration, completion, and errors.
- Sources: reference date, archive size, validation state, and retention deadline.
- Quality: per-table row counts, Serving rows, and staging cleanup.

The page refreshes every 60 seconds. Successful runs update `etl_schedules`; `--trigger-type scheduled` and `--attempt-number N` distinguish scheduled attempts and retries.

`next_due_at` follows the configured cadence: seven days for weekly sources and 365 days for annual sources. `max_age_hours` is retained as the separate stale-data tolerance.
