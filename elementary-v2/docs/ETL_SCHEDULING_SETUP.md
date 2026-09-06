# Recurring ETL Scheduling

## Execution Model

The current builders depend on local reviewed assignment files and archived apartment inputs. `etl/portable_inputs_manifest.json` defines the five-file portability contract, and `etl/prepare_portable_inputs.py --package` validates checksums and creates the ignored local ZIP/lock pair. Continue running ETL on this Windows workstation until a remote runner can restore that bundle and reproduce the full build.

Validate or package the reviewed baseline without contacting Supabase:

```powershell
python etl/prepare_portable_inputs.py
python etl/prepare_portable_inputs.py --package
```

Do not commit the generated ZIP. The current bundle is stored at `etl-source-snapshots/portable-inputs/elementary-reviewed-inputs-v1/2026-09-06/bundle.zip`; service-role restore and anonymous-access blocking were verified on 2026-09-06.

The repository-root workflow `.github/workflows/etl-portability-check.yml` is intentionally manual and read-only. Before its first run, configure repository Actions secrets named `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. The workflow restores the private bundle and verifies every file but does not update database tables or Serving rows.

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
