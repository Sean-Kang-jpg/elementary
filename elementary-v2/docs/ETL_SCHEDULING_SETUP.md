# Recurring ETL Scheduling

## Execution Model

The current builders depend on local reviewed assignment files and archived apartment inputs. Run recurring ETL on this Windows workstation until those inputs are packaged into a portable source bundle. GitHub Actions remains deferred because a remote checkout cannot yet reproduce the full build.

`etl/run_due_etl.py` reads enabled rows from `etl_schedules`. A daily check only collects source groups whose `next_due_at` is missing or past due:

- `apartment`: latest K-apt weekly attachment
- `school`: current-year Schoolinfo basic and grade datasets
- `school_zone`: disabled until polygon collection is automated

The runner creates an untracked runtime manifest, rebuilds and audits all operational outputs, updates Supabase, retries at most three times, and calls staging cleanup after success. Serving rows are refreshed only after all master upserts and validations succeed.

## Manual Checks

Run from `elementary-v2/`:

```powershell
python etl/run_due_etl.py
python etl/run_due_etl.py --force apartment
```

Both commands are read-only due checks. A production execution requires explicit `--apply`:

```powershell
python etl/run_due_etl.py --force apartment --apply
```

Set `ETL_ALERT_WEBHOOK_URL` in `.env` for Slack-compatible failure notifications. The service-role key must remain in `.env` and must never use a `VITE_` prefix.

## Windows Task Scheduler

Register the daily 03:15 task:

```powershell
powershell -ExecutionPolicy Bypass -File etl/install_windows_etl_task.ps1
```

The default task runs only while the current Windows user is logged in, avoids overlapping instances, starts a missed run when possible, and limits execution to four hours. Logs are written under `etl/logs/`.

Verify registration without running ETL:

```powershell
Get-ScheduledTask -TaskName "Elementary ETL Daily Check"
```
