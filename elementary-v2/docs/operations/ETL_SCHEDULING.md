# Recurring ETL Scheduling

## Execution Model

The current builders depend on reviewed assignment files plus apartment, K-apt, and Schoolinfo inputs. `etl/portable_inputs_manifest.json` defines the eight-file build-complete portability contract, and `etl/prepare_portable_inputs.py --package` validates checksums and creates the ignored local ZIP/lock pair. Continue running ETL on this Windows workstation until a remote runner restores bundle v2 and reproduces the locked build results.

Validate or package the reviewed baseline without contacting Supabase:

```powershell
python etl/prepare_portable_inputs.py
python etl/prepare_portable_inputs.py --package
```

Do not commit the generated ZIP. Bundle v1 remains at `etl-source-snapshots/portable-inputs/elementary-reviewed-inputs-v1/2026-09-06/bundle.zip`. Build-complete bundle v2 was uploaded to `etl-source-snapshots/portable-inputs/elementary-reviewed-inputs-v2/2026-09-07/bundle.zip` on 2026-09-07; remote archive/member checksums and anonymous-access blocking were verified.

The repository-root workflow `.github/workflows/etl-portability-check.yml` is intentionally manual and read-only. Before its first run, configure repository Actions secrets named `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. The workflow restores bundle v2, reproduces all seven operational outputs, requires 52/52 backend checks, compares row counts and SHA-256 values with `etl/portable_readonly_baseline.json`, and uploads the comparison report. It does not update database tables or Serving rows.

`etl/run_due_etl.py` reads enabled rows from `etl_schedules`. A daily check only collects source groups whose `next_due_at` is missing or past due:

- `apartment`: latest K-apt weekly attachment
- `school`: current-year Schoolinfo basic and grade datasets
- `school_zone`: disabled until polygon collection is automated

The runner creates an untracked runtime manifest, rebuilds and audits all operational outputs, updates Supabase, retries at most three times, and calls staging cleanup after success. Serving rows are refreshed only after all master upserts and validations succeed.

## GitHub Actions (monthly, from 2026-10)

`.github/workflows/etl-recurring.yml` at the repository root runs the same `run_due_etl.py`
on a GitHub runner, **once a month** (18:15 UTC on the 1st = 03:15 KST on the 2nd; the owner
decided on 2026-10-04 that monthly is enough). `etl_schedules` still decides what is due:
`kapt-basic` was moved from weekly to **monthly** the same day, and Schoolinfo stays annual
because the source itself is published once a year.

- **Inputs.** The runner starts from a bare checkout. The reviewed inputs the builders read but
  never fetch - each scope's school baseline, point assignments, the capital's review queue and
  resolved cases, and the 2024-10 apartment base from `archive/` - are bundled by
  `etl/recurring_inputs_manifest.json` (29 files, 37 MB, 6 MB zipped) and kept in the private
  bucket at `portable-inputs/elementary-recurring-inputs-v1/2026-10-04.2/bundle.zip`.
  `prepare_portable_inputs.py --restore-dir … --materialize` verifies every checksum and puts
  each file at its `source_path`. K-apt and Schoolinfo are fetched fresh by each run.
  **Rebuild and re-upload the bundle whenever a region is promoted or a reviewed input changes**:
  `python etl/prepare_portable_inputs.py --manifest etl/recurring_inputs_manifest.json --package --upload --verify-anon-blocked`
  after regenerating the manifest entries.
- **Secrets.** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `KERIS_SCHOOLINFO_API_KEY`. The last
  is needed **every** month on a runner: the school build reads a Schoolinfo snapshot even when only
  apartments are due, and a runner has none, so `run_due_etl.ensure_schoolinfo()` fetches one per
  scope. It is never bundled - a bundled copy would roll statistics back after each annual refresh.
  The first Actions rehearsal (2026-10-04) confirmed K-apt is reachable from a GitHub runner. Nothing else in the chain reads the environment. A failed scheduled
  run is reported by GitHub's own failed-workflow email; `ETL_ALERT_WEBHOOK_URL` is optional.
- **Rehearsal.** A manual run defaults to `mode: rehearse`, which is `run_due_etl.py --rehearse`:
  every scope is collected, built and validated exactly as in a real run, and nothing is written.
  Use `force` to rehearse a group that is not due. Only the monthly schedule and a manual
  `mode: apply` write.
- **Cut-over.** Keep the Windows task until one scheduled Actions run has completed and its
  `etl_runs` rows and serving counts match; then disable the task
  (`Disable-ScheduledTask -TaskName "Elementary ETL Daily Check"`).

### What broke the Windows runs (2026-09-27 to 2026-10-04)

Three defects, all found by the first full rehearsals:

1. `run_recurring_etl.build_outputs()` called the builders with no scope, so they defaulted to
   every production region. That was the capital until other regions were promoted; afterwards no
   base master existed for the combined slug and every run stopped in `build_school_master_v2`.
   The scope is now always passed explicitly. No data was written by the failed runs.
2. K-apt has published 광주 and 전남 as `전남광주통합특별시` since its 2026-09-22 file. The
   registry already resolved the region, but `build_apartment_master_v1` compared addresses raw,
   so **no 광주·전남 complex matched K-apt** (전남 0 of 1,415). Addresses are now passed through
   `canonicalize_address` and the name index is keyed by the resolved region: 전남 705 and
   광주 884 matched. It surfaced only because `build_operational_masters.write_csv` skipped
   writing an empty result and left the previous run's file behind, which the audit then failed
   on; an empty result now truncates the file.
3. `run_due_etl` ran every non-capital region alone, but 세종 was promoted together with 충북
   and 충남 because its joint zones name schools across both borders
   (`미르초공주봉황초공동통학구역`). Built alone, three 세종 units matched no school and the
   audit failed. `run_due_etl.JOINT_SCOPES` now keeps that trio as one scope (`i10-m10-n10`),
   and `production_scopes()` is the single list of scopes that both the runner and the input
   bundle use. Schoolinfo for a multi-region scope is fetched for all of its regions.

### District reorganizations (인천, 2026-07-01)

School addresses come from the national school-location standard data, which still carried
인천's old districts (중구·동구·서구) on 2026-10-04 while Schoolinfo already had 제물포구·영종구·
서해구·검단구. `build_school_master_v2.current_district()` adopts Schoolinfo's district for a
matched school in a metropolitan region when the street part of both addresses is the same
(spacing and anything after a comma ignored), and the build report counts the changes under
`district_updates_from_schoolinfo` - 80 for the capital. A one-off database backfill was
considered and rejected: every monthly run upserts `school_master` from the build, so it would
have been reverted. The portability baseline was relocked for this change; only
`school_master_operational_v1` moved. Follow-up: `build_academy_marker_snapshot.py` still maps
the new names back to the old (`INCHEON_DISTRICT_MAP`); academy districts are not joined to
school districts anywhere, so it is cosmetic, but it should be inverted on the next academy upload.

## Academy Data in the Monthly Run

From 2026-10-06 the academy layer is a monthly group of its own, `academy` (schedule
`neis-academy`, `sql/25`). `run_due_etl.py` runs it once, nationwide, after the per-scope groups:
`etl/run_academy_refresh.py` collects NEIS academies and sports-dojo permits, geocodes only new
addresses (VWorld), rebuilds markers and proximity region by region, and **replaces** the three
academy serving tables, deleting what the build no longer has. The plan and its decisions are
`docs/operations/ACADEMY_REFRESH_PLAN.md`.

- Inputs the runner cannot fetch - the geocode cache and the two building-origin files - live in
  the private bucket under `etl-source-snapshots/academy-refresh/`. The run restores them first,
  and an apply run writes the cache back.
- It writes nothing if NEIS returns under 90% of the last completed run's rows for any region,
  if the sports-dojo source shrank by more than 15%, or if any region would lose more than 15% of
  its addresses or institutions. Last month's data then stays and the job fails.
- **Geocoding does not run on GitHub.** VWorld refuses foreign IPs (2026-10-06: every retry from
  the runner was a `transport_error`), and Kakao's Local API forbids storing results, so it is no
  substitute. The Windows task `Elementary Academy Geocode` (`etl/install_academy_geocode_task.ps1`,
  1st of each month 21:00 KST, StartWhenAvailable) runs `run_academy_refresh.py --geocode-only`:
  collect NEIS, geocode new and failed addresses, write the cache to Storage. The runner skips
  geocoding and uses that cache, so an address that opens after the task ran waits a month. The
  task refuses to upload if more than 5% of its lookups fail to connect. Logs:
  `etl/logs/academy-geocode-*.log`.
- A failure there does not stop maintenance or the realm guard; the job still fails afterwards.
- Every run, due or not, still ends with `etl/apply_academy_realm_exclusion.py`, which keeps NEIS
  realm `직업기술` out of the serving tables. After a refresh it reports zero.
- The report is `runtime/recurring_academy_refresh.json`; `etl_runs.pipeline_name` is
  `elementary-academy-refresh`.

First applied by hand 2026-10-06 (run `34ebb91f`): addresses 78,820 -> 76,300 (+202, -2,722),
origin points 80,641 -> 80,220, summaries 46,927 -> 46,929; every region within -1.7% to -4.2%.

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
