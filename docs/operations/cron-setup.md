# Cron Setup — Station Status Data Collection

Operator runbook for the `/api/cron/poll-station-status` and `/api/cron/aggregate-popularity` endpoints introduced by [`docs/specs/2026-05-03-station-status-data-collection-design.md`](../specs/2026-05-03-station-status-data-collection-design.md).

These two endpoints are scheduled by an external service (cron-job.org free tier) because Vercel Hobby caps cron jobs at 2 executions per day, which doesn't cover the hourly polling cadence we need.

## Prerequisites

| Item | Where | Notes |
|---|---|---|
| `CRON_SECRET` env var | Vercel project settings | Must be a 64+ char random string. Already used by `src/lib/cron-auth.ts`. |
| `DATABASE_URL` + `DIRECT_URL` | Vercel + GitHub Actions secrets | Needed by both Vercel functions and the cookie-refresh workflow. |
| Schema synced | `npm run db:push` | Adds `StationStatusObservation`, `StationPopularity`, `VinfastApiCookies` tables. Safe — additive only. |
| First cookie row seeded | GitHub Actions → "Refresh VinFast Cookies" workflow → `workflow_dispatch` | Required before the hourly poller can succeed. |

## One-time setup

### 1. Sync schema

```bash
npm run db:push
```

Verify the three new tables exist in Supabase Studio. Should return rows from:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('StationStatusObservation', 'StationPopularity', 'VinfastApiCookies');
```

### 2. Seed the first cookie row

Trigger the workflow manually so the polling endpoint has something to read:

1. Go to GitHub → Actions → **Refresh VinFast Cookies**
2. Click **Run workflow** → branch `main` → **Run workflow**
3. Wait for completion (~1–2 min). The job log should end with `Done.`

Verify in Supabase:

```sql
SELECT id, "refreshedAt", "expiresAt", LENGTH("cookieJson") AS cookie_size
FROM "VinfastApiCookies"
ORDER BY "refreshedAt" DESC
LIMIT 1;
```

You should see one row with `expiresAt` ~7 days in the future and a non-trivial `cookie_size` (typically 500–2000 bytes).

### 3. Configure cron-job.org

Sign up at [cron-job.org](https://cron-job.org) (free tier supports unlimited 1-minute-resolution jobs). Create two jobs:

#### Job A — `evoyage-poll-station-status`

| Field | Value |
|---|---|
| Title | `evoyage-poll-station-status` |
| URL | `https://evoyage.app/api/cron/poll-station-status` |
| Schedule | Every hour, at minute 0 (`0 * * * *`) |
| Request method | POST |
| Headers | `Authorization: Bearer <CRON_SECRET>` |
| Treat as failure | HTTP status > 299 |
| Notifications | Email on failure |

#### Job B — `evoyage-aggregate-popularity`

| Field | Value |
|---|---|
| Title | `evoyage-aggregate-popularity` |
| URL | `https://evoyage.app/api/cron/aggregate-popularity` |
| Schedule | Daily at 19:00 UTC (= 02:00 AM Vietnam) |
| Request method | POST |
| Headers | `Authorization: Bearer <CRON_SECRET>` |
| Treat as failure | HTTP status > 299 |
| Notifications | Email on failure |

### 4. Smoke test

After both jobs are configured, manually run each one from the cron-job.org dashboard:

- **Poll job**: Should return 200 with body like `{ "ok": true, "stationsPolled": 1500, "observationsInserted": 1500, "errors": [], "durationMs": 4200 }` on first run (every station is "new" so all get inserted). Subsequent runs in the same hour should show low `observationsInserted` (only changed stations).

- **Aggregate job**: Should return 200 with `{ "ok": true, "popularityRowsUpserted": 0, ... }` initially (no observations yet), then increasing numbers as data accumulates.

## Ongoing monitoring

### What to check weekly

| Metric | Where | Healthy range |
|---|---|---|
| Hourly poll success rate | cron-job.org execution history | ≥ 95% (occasional V-GREEN timeouts are OK) |
| Daily aggregate success rate | cron-job.org execution history | 100% (this should never fail in normal operation) |
| Cookie refresh success | GitHub Actions → workflow runs | 100% hourly (if a single hour fails, polling tolerates a 1-hour gap; if multiple consecutive hours fail, run `workflow_dispatch` and investigate) |
| Observation row growth | Supabase → SQL `SELECT COUNT(*) FROM "StationStatusObservation"` | ~3000-5000 new rows/day after dedup |
| Popularity table size | Supabase → SQL `SELECT COUNT(*) FROM "StationPopularity"` | Stabilizes at ~station_count × 168 cells |

### Failure modes and recovery

| Symptom | Likely cause | Recovery |
|---|---|---|
| Poll endpoint returns `{ ok: false, reason: "cookies_expired" }` | Weekly refresh hasn't run or expired early | Trigger `workflow_dispatch` on **Refresh VinFast Cookies** |
| Poll endpoint returns `{ ok: false, reason: "cookies_missing" }` | Database row missing entirely | Same as above — trigger workflow |
| Poll endpoint returns `{ ok: false, reason: "upstream_failed", errors: ["cloudflare_blocked: ..."] }` | Cookies invalidated by V-GREEN-side change | Trigger workflow; if still blocked, investigate `scripts/refresh-vinfast-cookies.ts` against current vinfastauto.com behavior |
| Cron-job.org shows 401 errors | `CRON_SECRET` rotated in Vercel without updating cron-job.org headers | Sync the new secret to both places |
| Observation table growing too fast | A station's status flapping every hour (broken sensor) | Inspect with `SELECT "stationId", COUNT(*) FROM "StationStatusObservation" WHERE "observedAt" > NOW() - INTERVAL '1 day' GROUP BY 1 ORDER BY 2 DESC LIMIT 10;` |

## Secret rotation

When rotating `CRON_SECRET`:

1. Generate a new 64+ char random string: `openssl rand -hex 32`
2. Update Vercel project env var (Settings → Environment Variables → `CRON_SECRET`)
3. Trigger a deployment so the new value takes effect
4. Update both cron-job.org jobs' `Authorization` header
5. Test each job manually from the cron-job.org dashboard
6. The old secret is immediately invalid — no rolling window. If you can't update both atomically, accept ~1 hour of failed polls during the rotation.

## Cost accounting

All zero-cost as of 2026-05-03. Verify quarterly:

| Resource | Tier | Headroom |
|---|---|---|
| cron-job.org | Free tier | 2 jobs of ~744+30 = 774 invocations/month total — well within free limits |
| Vercel functions | Hobby | Hourly poll: ~5s × 744/month = ~62 min compute; daily aggregate: ~10s × 30 = 5 min. Well under 100 GB-hours/month |
| Supabase Postgres | Free tier | ~63 MB steady-state for both tables — < 13% of 500 MB free quota |
| GitHub Actions | Free tier (public repo unlimited; private 2000 min/month) | Cookie refresh ~2 min × 720/month = ~1440 min/month + existing crawl-stations.yml ~600 min/month = ~2040 min/month — tight against the 2000-minute limit. If exceeded, options: (a) make repo public (unlimited GHA), (b) reduce crawl-stations.yml to every 2 days, (c) refresh cookies every 90 min instead of hourly. |

If any tier is approached: see decisions log in the design spec for upgrade paths.
