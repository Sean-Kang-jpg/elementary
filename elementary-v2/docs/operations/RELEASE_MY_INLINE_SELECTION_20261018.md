# MY 하루 보기·카드 내 선택 운영 배포

배포일: 2026-10-18 KST. 후속 확인: 2026-10-19 KST.

## 배포 결과

- URL: https://wherecho.co.kr/my
- Target / status: production / READY
- Framework: React / TypeScript / Vite
- Source commit: `4c421be3af8942d727337589271c35e50557736a`
- Implementation commit: `fb4ca36` (day UI and inline selection), `4c421be` (accurate distance origin)
- Deployment: `dpl_8wPqYUKZ2bE68aktfC7PoByXnsQ8`
- Deployment URL: https://elementary-ing3eobrr-seankangs-projects.vercel.app
- Build interval: 132.0 seconds, excluding the queue behind the master preview build.
- Project: `elementary` / `prj_1H2Vx4Ye38UvGpz8yu67GRc63piZ`
- Team: `team_BwevgkWVS8CQ8ETHgE6xSxip`
- `wherecho.co.kr` / `www.wherecho.co.kr` assignment verified.

Normal Git flow: pushed master, then `git push origin master:release`. Both refs pointed to the same tested source commit at release time. No cherry-pick, force push, branch/config/env changes, DB writes, schema migrations or ETL uploads were performed.

The later favicon release `560faaf9022168d784f765041ff133028faff92d` includes the timetable commit as an ancestor. On 2026-10-19 the latest production was READY at `dpl_7U9zEttanqFM7oFnvSwjmv1uBRdY`; its changes are limited to icon assets, icon generation, shell references and their public smoke assertions. No timetable code was replaced or reverted.

## User-facing scope

- Reference image 2 day view: weekday pills, left time rail, borderless pastel two-line cards and decorative subject SVGs. Morning care precedes compressed school lessons.
- Adding from the day view or clicking/dragging a weekly blank opens an inline choice card for the selected weekday.
- School courses are filtered by their published weekday. Selection toggles **only that weekday**, preserving other days, source times, provenance and participation status. Care and courses remain independently selectable.
- Academy topic selection uses the existing public school-catchment RPC. Distance is from a **nearby assigned apartment**, not the school building; the UI explicitly says so. Each institution is filtered individually, even when multiple institutions share an address.
- Academy hours are never inferred. The user enters confirmed five-minute times to save an editable personal candidate, not enrollment or confirmed participation.
- The existing all-program menu remains as a secondary path. Unknown weekdays are not silently treated as operating on the chosen day.

## Verification evidence

- Exact clean checkout: lint, typecheck, all 92 unit tests, full content/shell/SEO build passed. Only existing frontend public configuration was passed in process memory; no secret file was copied or printed.
- Exact deployed frontend: inline-selection, day-timeline, calendar-appearance, calendar-touch and morning-calendar browser checks passed. Includes per-day select/deselect, simultaneous care, uncertainty, source protection, responsive layouts, 5-minute editing, keyboard operation, real touch scrolling/movement and persistence failure.
- Additional calendar-edit CLI smoke passed after centering the inline submit button before clicking. The earlier nearest-edge automated scroll could click behind the fixed GNB; this correction changes only the test harness and is recorded with this handoff, not production application code.
- An extra legacy `my-schedule-smoke.mjs` attempt ended at its initial `MY opens` wait. It is **not recorded as passed**. The fresh Playwright checks and real production MY flow below independently passed.
- Full public smoke passed before release (map maximum 1612.4 ms, apartment maximum 633.5 ms). Its interrupted post-release output was not assumed successful. The full current-production gate was re-run and **passed on 2026-10-19**, including deep links, canonical/share metadata, map/search/filters, sheet gestures, favorites/MY, guides/checklist/privacy/admin protection and 360/430/1280 px overflow checks. Map maximum: 1097 ms; apartment maximum: 183.2 ms; no unexpected browser errors.
- Live public RPC returned 603 addresses / 1737 institution records for Seoul Daehyeon school, within its published 800 m catchment-origin range. This is not a count of schools or a school-building distance.
- Real production browser at school `B000002292`: one Monday course selected for Monday only; independent care selected for Monday; Tuesday list limited to Tuesday courses; math topic returned 373 individual institutions via HTTP 200; a selected academy saved as Tuesday 16:05–16:40, personal/considering, with no invented source hours. Browser runtime errors: 0.
- These selections existed only in a disposable browser context's localStorage. No user browser, actual enrollment or database was changed. Screenshot: `../research/audit2/my-inline-production-20261018.png`.

## Observability and cleanup

- Original deployment error scan: 0 rows in the bounded first 10-minute window. This is not a continuous monitoring guarantee. Drains / continuous monitoring were not inspected or changed.
- Pre-existing build warnings remain: development-only agent-browser recommends Node 24 while Vercel uses Node 22; npm audit reported 16 issues; browser metadata and large-bundle warnings. No unrelated dependency updates were made.
- The 2026-10-18 cleanup was not executed because approval review hit a usage limit. On 2026-10-19 the exact clean temporary checkout was validated and removed, after validating/removing only its node_modules junction. Primary code/dependencies, other worktrees and unrelated uncommitted changes were preserved.

## Rollback reference

- Previous production source: `6eb2862970349816ce7b95271e522ef50a8a2eb3`
- Previous deployment: `dpl_9LWpfGcX8S1UhYdVu5YkSTH6ZgAq`
- Previous URL: https://elementary-ck5gs42wz-seankangs-projects.vercel.app

No rollback was performed. The later favicon deployment is the current production baseline; do not overwrite it with an older source merely to reproduce this historical timetable deployment.
