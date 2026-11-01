# Bug note: cron jobs report success while doing nothing, and nothing alerts

Date: 2026-11-01 · Code reference: `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main) · Branch: `bug/p2-cron-silent-noops-and-observability`

## Summary

The station-trust pipeline (poll station status, then aggregate popularity and reliability) collected no new observations from about 2026-09-30 until a manual run on 2026-11-01. Before that, the poller had already spent weeks "succeeding" while inserting nothing. During all of this the daily aggregate jobs stayed green, because they report `ok:true` when they upsert 0 rows. Their tables are frozen at 2026-08-19 (reliability) and 2026-09-18 (popularity) (per one verifier's read-only query, not re-checked). The readers never check row age, and no health endpoint, error tracker or workflow failure alert exists. Users do not see a broken flow today. They lose the reliability ranking and busy-hour signals without any notice, and nobody gets alerted.

## Severity & priority

- Group priority: **P2**, severity **medium**.
- Finding 1 was filed as high. Both verifiers lowered it to medium because PR #83 (the switch to the CDN locator feed, merged 2026-11-01T09:31Z) already fixed the poller outage. The gap that remains at the code reference is in monitoring, not in the data path.
- Core trip planning still works. Only the Phase 3 trust signals (ADR-0006/0007) are stale or missing.

## Affected features

- Poll Station Status (`.github/workflows/poll-station-status.yml`, `scripts/poll-vinfast-station-status.ts`)
- Aggregate Station Popularity / Reliability (crons, `src/lib/station/aggregate-*.ts`, `src/app/api/cron/aggregate-*/route.ts`)
- Popularity verdict and reliability ranking in `POST /api/route` (`src/lib/station/popularity-query.ts`, `src/app/api/route/route.ts`)
- Operations: health checks, alerting, deploy rollback (`.github/workflows/*.yml`, `docs/RECOVERY.md`)

The audit's findings 1 and 3 describe the same defect, `ok` meaning only "no SQL error", from two angles. They are merged below as Finding A.

---

## Finding A: Aggregate crons report `ok:true` on 0 upserts, so a dead pipeline stays green

**Severity:** medium (both verifiers of audit finding 1 rated it medium; audit finding 3 got one medium vote and one low).

### Symptom
`Aggregate Station Popularity` and `Aggregate Station Reliability` have concluded `success` every day for weeks while upserting 0 rows. Meanwhile the upstream poller failed on every scheduled run.

### Evidence
Re-run on 2026-11-01 (read-only):

```
$ gh run list --workflow poll-station-status.yml --limit 6
41293669200 workflow_dispatch success 2026-11-01T09:33:48Z
41293512184 workflow_dispatch success 2026-11-01T09:31:38Z
41291085586 schedule failure 2026-11-01T09:58:50Z
41258622472 schedule failure 2026-11-01T00:52:07Z
41242906056 schedule failure 2026-10-31T21:17:41Z
41223228485 schedule failure 2026-10-31T17:10:27Z

$ gh run list --workflow aggregate-reliability.yml --limit 6   # all: schedule success
$ gh run view 41249447460 --log | grep 'Response: {'            # reliability, 2026-10-31
Response: {"ok":true,"stationsUpserted":0,"errors":[],"durationMs":2649}
$ gh run view 41246530442 --log | grep 'Response: {'            # popularity, 2026-10-31
Response: {"ok":true,"popularityRowsUpserted":0,"observationsPruned":0,"errors":[],"routeCachePruned":0,"vinfastDetailPruned":24866,...}
```

`vinfastDetailPruned: 24866` shows the endpoint and DB work. Only the observation-driven aggregates come back empty.

From the audit, not re-run here:
- Popularity runs returned `popularityRowsUpserted: 11772` on 2026-09-07, 3855 on 09-17, then 0 on every sampled run from 09-19 to 10-31.
- Read-only prod SQL by a verifier found `StationReliability` max(`computedAt`) = 2026-08-19T19:50Z (17,036 rows) and `StationPopularity` max(`updatedAt`) = 2026-09-18T21:21Z (629,551 rows).
- The last scheduled poll success was 2026-09-30T12:19Z. Its failure message is `VinfastApiError: Upstream returned 200 with an empty station list`.

Code at `64db6f9`:
- `src/lib/station/aggregate-reliability.ts:45` uses a 30-day window, and `:52` returns `{ ok: true, stationsUpserted, errors: [] }` whatever the count is. `ok:false` appears only in the catch block (`:54`).
- `src/lib/station/aggregate-popularity.ts:47` uses a 60-day window, and `:77-82` returns `ok: true` whatever the count is.
- `src/app/api/cron/aggregate-popularity/route.ts:44` builds `ok` from step errors only.
- `.github/workflows/aggregate-popularity.yml:32` and `.github/workflows/aggregate-reliability.yml:33` fail the job only on `grep -q '"ok":false'`.

### Root cause
- **Established:** `ok` means "the SQL did not throw", not "useful work was done". An empty input window returns `ok:true` with 0 rows, and the workflow gate checks only for `"ok":false`.
- **Established:** the empty window comes from upstream. VinFast's locator endpoint started returning an empty list. The poller first reported success with 0 rows (a silent no-op), then failed loudly once the empty-result guard landed. PR #83 moved it to the CDN feed (`scripts/poll-vinfast-station-status.ts:20,57` at the code reference). The code reference `64db6f9` already contains #83 (merge `f0f5d5a`).
- **Hypothesis:** scheduled poll runs on post-#83 code will succeed. At audit time only two manual `workflow_dispatch` runs had succeeded on the new code. The 09:58Z scheduled failure ran on an older head.

### Repro
```
for id in $(gh run list --workflow aggregate-reliability.yml --limit 10 --json databaseId -q '.[].databaseId'); do
  gh run view "$id" --log | grep -o 'Response: {.*'
done
# expect "ok":true with "stationsUpserted":0 on every run, all concluded success
```

### Regression tests
- `src/lib/station/aggregate-reliability.test.ts` :: `reports an unhealthy run when the 30-day window upserts zero stations` (`it.fails`)
- `src/lib/station/aggregate-popularity.test.ts` :: `reports an unhealthy run when the 60-day window upserts zero heatmap rows` (`it.fails`)

Both tests assert `ok === false` and a non-empty `errors` when the upsert returns 0. Flipped to `it(...)`, each fails with `expected true to be false`. If the fix uses a different contract, for example a `warnings` field plus a workflow check, rewrite these assertions to match that contract. Do not delete them.

### Fix direction
- Choose the health contract first. The options are: (a) the lib returns `ok:false` when the upsert count is 0; (b) the route adds a freshness check, `max("observedAt")` on `StationStatusObservation` older than N hours means `ok:false`; or (c) the workflow also fails on `"stationsUpserted":0` or `"popularityRowsUpserted":0`. Option (b) is the most robust signal, because it catches a stall even when a trickle of rows exists.
- Popularity note: `ok:false` from `aggregatePopularity` already means "the aggregation SQL threw", and the library deliberately keeps `ok:true` for other problems (see `still records aggregation success when prune fails`, `aggregate-popularity.test.ts:48-60`). At route level, a non-empty `popularity.errors` alone already makes the job `ok:false` (`src/app/api/cron/aggregate-popularity/route.ts:44`). So pushing a "0 rows upserted" string into `errors` is enough to turn the popularity job red. The `ok === false` assertion in the popularity library test is then optional; loosen it if contract (b) or (c) is chosen.
- Gotcha: the workflow greps for the literal `"ok":false`. The popularity route test (`src/app/api/cron/aggregate-popularity/route.test.ts`, around line 177) already pins that serialisation. Keep it.
- Gotcha: existing tests mock `$executeRaw` to return `0` to inspect the SQL (`uses a 30-day window`, `uses Asia/Ho_Chi_Minh timezone`, and others). They do not assert `ok`, so they stay green, but check them after the change.
- Do **not** change the `prune-stale-caches.ts` derived-aggregate prune to compare against `NOW()`. See "Dropped / narrowed" below.

---

## Finding B: Readers serve stale popularity and reliability rows without checking their age (contested)

**Severity:** medium per one verifier, low and "refuted" per the other. The verifiers split on whether users see it today.

### Symptom
Neither reader checks how old a row is. The heatmap is frozen at 2026-09-18 and reliability at 2026-08-19, yet `/api/route` would use either as current once a row clears its sample threshold.

### Evidence
- The aggregates are pure UPSERT, so cells that drop out of the window are never refreshed or deleted (`aggregate-popularity.ts:34-53`, `aggregate-reliability.ts:32-51`).
- `src/lib/station/popularity-query.ts:84` returns `insufficient-data` only when `!row || row.sampleCount < POPULARITY_SAMPLE_THRESHOLD` (20). It never reads `updatedAt`.
- The reliability gate that ranking uses is `reliabilityMultiplier()` in `src/lib/routing/reliability-score.ts:16-21`. It returns 1.0 only when `observationCount < RELIABILITY_THRESHOLD` (100, `:14`) and never looks at row age. `route.ts:503` and `:526` pass `reliabilityMap.get(station.id)` into scoring.
- `src/app/api/route/route.ts:440-447` loads `prisma.stationReliability.findMany(...)` and builds the map from `reliability` and `observationCount` only, dropping `computedAt`. `ReliabilityRecord` (`reliability-score.ts:9-12`) has no `computedAt` field either, so a freshness gate needs `computedAt` carried through both.
- `route.ts:455-463` is ADR-0007 calibration telemetry only (it counts candidates past the threshold and their mean reliability). It is not the ranking gate; do not patch only that loop.
- Not reproduced live. One verifier ran three read-only `POST /api/route` plans (HCMC to Nha Trang, Hanoi to Vinh, HCMC to Da Lat), and every stop returned `popularity: {kind: 'insufficient-data'}`. Another verifier found that no prod row currently meets the thresholds (max popularity `sampleCount` = 1, and 0 reliability rows with `observationCount >= 100`).

### Root cause
- **Established:** the readers have no freshness gate, and the aggregations never expire rows.
- **Established:** the issue is latent today, because no row clears the thresholds. It becomes live once a station builds up enough samples and its feed then stops.

### Repro
Read `src/lib/station/popularity-query.ts:84` and `src/lib/routing/reliability-score.ts:16-21`. Then run the regression test below with `it.fails` changed to `it`.

### Regression tests
- `src/lib/station/popularity-query.test.ts` :: `treats a heatmap row not refreshed for a year as insufficient-data` (`it.fails`). With `it(...)` it fails with `expected 'ready' to be 'insufficient-data'`. The test uses a row one year old so that any reasonable cutoff passes it.
- `src/lib/routing/reliability-score.test.ts` :: `returns 1.0 (no penalty) when the reliability row was computed a year ago` (`it.fails`). The record has `observationCount` 500, `reliability` 0.2 and a `computedAt` one year old; with `it(...)` it fails with `expected 1.8 to be 1`. `computedAt` is passed via a spread so the test compiles while `ReliabilityRecord` lacks the field.

### Fix direction
- Treat a row whose `updatedAt` or `computedAt` is older than a cutoff as insufficient data. A reasonable cutoff is the aggregation window plus a grace period: popularity 60 + 30 days, reliability 30 + 30 days. This is a product decision and should be confirmed.
- Gotcha: `queryStationPopularity` mocks pass `updatedAt: new Date()`, so existing tests stay green under a freshness gate.
- Do this in the readers, not with a wall-clock prune. A reader gate stops stale rows from being served, and it does not delete data during an outage.

---

## Finding C: No health check, no error tracker, no failure notification

**Severity:** medium (both verifiers).

### Symptom
The status poller failed 4-6 times a day from 2026-09-30 to 2026-11-01. Nothing in the repo escalates a failure, and nothing reports how fresh the data is. GitHub's default email to the last editor of a cron workflow probably fired, so the signal was weak but not zero.

### Evidence
```
$ curl -s -o /dev/null -w '%{http_code}\n' https://evoyage.duypham.me/api/health
404
$ ls src/app/api
admin cron evi feedback route share-card short-url stations transcribe vehicles
$ grep -rniE "sentry|captureException" src package.json   # no matches
$ ls src/instrumentation*                                  # no such file
$ grep -rn "failure()" .github/workflows
.github/workflows/deploy.yml:113   (uploads E2E artifacts)
.github/workflows/deploy.yml:234   (marks the deployment failed)
```
`.github/workflows/poll-station-status.yml:70-71` ends at the `Poll station status` step and has no step that runs on failure. A post-mortem draft (`docs/POST-MORTEM-2026-10-01.md`) is in the main checkout and is not committed at the code reference. A verifier read lines 101-102 and 112 of that draft: it already recorded "Zero alerting" on 2026-10-01, and it notes 294 green poll runs over 46 days that inserted nothing.

### Root cause
- **Established:** observability relies on someone opening the Actions tab. There is no failure step, no health route and no error tracker.
- **Established:** a failure-only alert would not have caught the earlier stretch in which the poller succeeded while doing nothing. A freshness check is needed as well as a failure notification.

### Repro
```
curl -s -o /dev/null -w '%{http_code}\n' https://evoyage.duypham.me/api/health    # 404
gh run list --workflow poll-station-status.yml --limit 100                         # long run of schedule failures
```

### Regression test
**Not unit-testable.** The gap is a missing workflow step and a missing route, and any vitest assertion would dictate one specific mechanism. Verify the fix with the manual commands above: `/api/health` returns 200 with freshness fields, and a failing scheduled run opens or updates an issue (or sends another notification).

### Fix direction
- Add a failure-notification step (`if: failure()`) to each scheduled workflow. For example, open or update a GitHub issue with `gh issue` using the default `GITHUB_TOKEN`. The scheduled workflows are `poll-station-status.yml`, `aggregate-popularity.yml`, `aggregate-reliability.yml`, `crawl-stations.yml`, `crawl-energy-prices.yml`, `refresh-vinfast-cookies.yml` and `warm-station-pois.yml`. Add `issues: write` next to the permissions each one already has (`contents: read` in most; `contents: write` + `pull-requests: write` in the two crawl workflows).
- Add a lightweight `GET /api/health`. It should run `SELECT 1` and report the age of the newest `StationStatusObservation.observedAt` and of the last crawl. It must not expose secrets or row contents.
- Optionally, run a scheduled freshness check that fails when the newest observation is more than about 4 hours old (the poll runs every 2 hours). This catches the case where the job succeeds but does nothing.

---

## Finding D: No documented rollback path; the drift gate blocks git-revert of schema changes

**Severity:** low (both verifiers lowered it from medium: a process and docs gap with no user-visible failure).

### Symptom
No runbook says how to roll back a bad release, and the one existing line is wrong. A `git revert` of a commit that added a column (already pushed to prod with `db push`) would fail the drift check, so Vercel's instant rollback is the only working path, and it is not documented. No step smoke-tests prod after a deploy.

### Evidence
- `.github/workflows/deploy.yml:40-57` runs `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --exit-code` on PRs and on pushes to main.
- `.github/workflows/deploy.yml:196-220` checks only that `vercel deploy` printed an `https://` URL. It never requests the live site.
- `vercel.json` sets `"git": { "deploymentEnabled": false }`, so this workflow is the only deploy path.
- `grep -rniE 'rollback|instant rollback' docs README.md` finds no release-rollback procedure. `docs/RECOVERY.md` covers database loss only.
- `docs/plans/project-blueprint.md:1122` says "Vercel deployment failure | Automatic rollback to previous deployment (Vercel built-in)". That is misleading: Vercel never promotes a failed build, but it does not automatically roll back a deploy that succeeds and then breaks the app.

### Root cause
- **Established:** no code or schema rollback is documented, and no smoke check runs after deploy.
- **Hypothesis (reasoned, not executed, because running it needs the prod `DIRECT_URL`):** a revert that removes a column which prod still has makes `migrate diff --exit-code` exit non-zero, which blocks the revert PR.

### Repro
Read `.github/workflows/deploy.yml` (the `Check Prisma schema vs production DB` and `Deploy` steps), then run `grep -rniE 'rollback' docs README.md`.

### Regression test
**Not unit-testable.** This is documentation and CI process.

### Fix direction
- Add a rollback section to `docs/RECOVERY.md`. Code-only rollback: `vercel rollback <deployment-url>` or promote the previous deployment in the dashboard. Rule: schema changes must be additive, so the previous build keeps working against the new schema.
- Correct `docs/plans/project-blueprint.md:1122`.
- Add a post-deploy `curl` smoke check to `deploy.yml`, for example against `/api/health` from Finding C.

---

## Dropped / narrowed

- **Audit finding 3, second half ("prune against `now()`").** Dropped as a defect. `src/lib/maintenance/prune-stale-caches.ts:32-37` documents why the `StationReliability` and `StationPopularity` prunes (`:141-143`, `:158-160`) compare against `MAX(computedAt/updatedAt)` and not `NOW()`: a wall-clock window would empty both tables during an outage. A frozen table that never ages out is the intended fail-safe. The real gap is alerting (Finding A) and the reader age gate (Finding B). Switching the prune to `NOW()` would undo that safeguard and introduce a regression.
- Every other finding still holds at `64db6f9`. Line numbers were re-read at this commit.

## Related low-severity items

- **`docs/RECOVERY.md` smoke test is wrong.** Line 138 says to `GET /api/stations/nearby?lat=..&lng=..`, but the route answers 405 to GET, so a healthy rebuild looks broken. The station count "~18,276" (line 58) is out of date.
- **Env vars are not validated at startup.** Missing secrets show up only at request time: the cron routes return 401 with a `console.error`, and the Mapbox token is read on each request. `PRECAUTIONARY_STOPS_ENABLED` is missing from `.env.example`.
- **Observability nit, noticed while re-reading:** `src/app/api/cron/aggregate-popularity/route.ts:46-55` drops `reliabilityPruned` and `popularityPruned` (returned by `pruneStaleCaches`) from the response, so the cron log cannot show those counts.

## Open questions / what to verify first

1. Do scheduled `poll-station-status.yml` runs on post-#83 code succeed? Run `gh run list --workflow poll-station-status.yml --limit 10` and look for `schedule success` after 2026-11-01T10:00Z. If they do not, the data outage itself is still open, and it outranks everything in this note.
2. After a day of successful polls, does the next aggregate run return `stationsUpserted > 0`? That shows the observations reach the window.
3. Which health contract should the jobs use (Finding A options a, b or c)? This sets how the tests above should be rewritten.
4. What freshness cutoffs should the readers use (Finding B)? This is a product decision.
5. Production row ages come from a single verifier's read-only query. Re-check them (read-only) before quoting them:
   `SELECT max("computedAt"), count(*) FROM "StationReliability"; SELECT max("updatedAt"), count(*) FROM "StationPopularity"; SELECT min("observedAt"), max("observedAt") FROM "StationStatusObservation";`

## Verification provenance

- Each audit finding was checked by **2 adversarial verifier agents** on 2026-11-01 against HEAD `bfa3a3b` and live prod `https://evoyage.duypham.me`. These were Claude agents (same vendor, same priors; no external verifier ran).
- The author session re-read the cited code at `64db6f92e0792aa4643b2ba76958ff0843b80567` and re-ran the `gh run list` / `gh run view` / `curl /api/health` evidence on 2026-11-01. It did not touch the production DB.
- Verifier votes per audit finding: finding 1 had 2 confirmations, both lowering it to medium. Finding 2 (B) was contested, 1 refuted/low and 1 medium. Finding 3 was confirmed, 1 medium and 1 low with the prune half refuted. Finding 4 (C) had 2 confirmations at medium. Finding 5 (D) had 2 confirmations, both lowering it to low.
