# Cron Setup — Station Status Data Collection

Operator runbook for the `/api/cron/poll-station-status` and `/api/cron/aggregate-popularity` endpoints introduced by [`docs/specs/2026-05-03-station-status-data-collection-design.md`](../specs/2026-05-03-station-status-data-collection-design.md).

**Architecture (v2, 2026-05-03)**: Both endpoints are invoked by GitHub Actions workflows (`poll-station-status.yml` and `aggregate-popularity.yml`) using authenticated curl — keeping the whole pipeline inside infrastructure we already operate. This replaces the original spec's external `cron-job.org` dependency to remove operator-setup burden.

Production cadence:
- Cookie refresh: every 2 hours (`refresh-vinfast-cookies.yml`)
- Polling: every 2 hours, offset by 5 minutes (`poll-station-status.yml`)
- Aggregation: daily at 02:00 AM Vietnam (`aggregate-popularity.yml`)

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

### 3. GitHub Actions workflows (auto-configured)

The polling and aggregation are invoked by three workflows that live alongside the cookie-refresh job:

| Workflow file | Schedule | Purpose |
|---|---|---|
| `refresh-vinfast-cookies.yml` | every 2 hours | Playwright refreshes CF cookies into `VinfastApiCookies` |
| `poll-station-status.yml` | every 2 hours, +5 min offset | curl `/api/cron/poll-station-status` |
| `aggregate-popularity.yml` | daily 19:00 UTC (02:00 AM VN) | curl `/api/cron/aggregate-popularity` |

The polling and aggregation workflows authenticate via `${{ secrets.CRON_SECRET }}`. Set this in **GitHub repo settings → Secrets and variables → Actions** with the same value used in Vercel env vars.

### 4. Smoke test

After workflows merge to main, manually trigger each via `workflow_dispatch`:

- **Poll job** (`Poll Station Status`): Should run for ~30-60 seconds. The response logged in the action run should look like `{"ok":true,"stationsPolled":36943,"observationsInserted":N,...}`. First-time runs insert ~18k rows; subsequent runs only the changed ones.
- **Aggregate job** (`Aggregate Station Popularity`): Should run for ~5-10 seconds. Response: `{"ok":true,"popularityRowsUpserted":N,"observationsPruned":M,...}`.

## Ongoing monitoring

### What to check weekly

| Metric | Where | Healthy range |
|---|---|---|
| Hourly poll success rate | GitHub Actions → "Poll Station Status" runs | ≥ 95% (occasional V-GREEN timeouts are OK) |
| Daily aggregate success rate | GitHub Actions → "Aggregate Station Popularity" runs | 100% (this should never fail in normal operation) |
| Cookie refresh success | GitHub Actions → workflow runs | 100% hourly (if a single hour fails, polling tolerates a 1-hour gap; if multiple consecutive hours fail, run `workflow_dispatch` and investigate) |
| Observation row growth | Supabase → SQL `SELECT COUNT(*) FROM "StationStatusObservation"` | ~3000-5000 new rows/day after dedup |
| Popularity table size | Supabase → SQL `SELECT COUNT(*) FROM "StationPopularity"` | Stabilizes at ~station_count × 168 cells |

### Failure modes and recovery

| Symptom | Likely cause | Recovery |
|---|---|---|
| Poll endpoint returns `{ ok: false, reason: "cookies_expired" }` | Weekly refresh hasn't run or expired early | Trigger `workflow_dispatch` on **Refresh VinFast Cookies** |
| Poll endpoint returns `{ ok: false, reason: "cookies_missing" }` | Database row missing entirely | Same as above — trigger workflow |
| Poll endpoint returns `{ ok: false, reason: "upstream_failed", errors: ["cloudflare_blocked: ..."] }` | Cookies invalidated by V-GREEN-side change | Trigger workflow; if still blocked, investigate `scripts/refresh-vinfast-cookies.ts` against current vinfastauto.com behavior |
| GHA workflow shows 401 errors | `CRON_SECRET` rotated in Vercel without updating GHA secret | Update `gh secret set CRON_SECRET` to match Vercel value |
| Observation table growing too fast | A station's status flapping every hour (broken sensor) | Inspect with `SELECT "stationId", COUNT(*) FROM "StationStatusObservation" WHERE "observedAt" > NOW() - INTERVAL '1 day' GROUP BY 1 ORDER BY 2 DESC LIMIT 10;` |

## Secret rotation

When rotating `CRON_SECRET`:

1. Generate a new 64+ char random string: `openssl rand -hex 32`
2. Update Vercel project env var (Settings → Environment Variables → `CRON_SECRET`)
3. Update GHA secret: `echo "$NEW_SECRET" | gh secret set CRON_SECRET`
4. Trigger a Vercel deployment so the new value takes effect
5. Test each workflow manually via `workflow_dispatch`
6. The old secret is immediately invalid — no rolling window. If you can't update both Vercel and GHA atomically, accept up to one polling cycle of failed requests during the rotation.

## Cost accounting

All zero-cost as of 2026-05-03. Verify quarterly:

| Resource | Tier | Headroom |
|---|---|---|
| Vercel functions | Hobby | Polling ~10s × 360/month = ~60 min; aggregation ~5s × 30 = 2.5 min. Well under 100 GB-hours/month |
| Supabase Postgres | Free tier | ~63 MB steady-state for both tables — < 13% of 500 MB free quota |
| GitHub Actions | Free tier (public repo unlimited; private 2000 min/month) | Cookie refresh ~2 min × 360/month ≈ 720 min · poll-station-status ~1 min × 360 ≈ 360 min · aggregate-popularity ~1 min × 30 ≈ 30 min · existing crawl-stations.yml ~600 min/month. **Total ~1710 min/month**, comfortable headroom under 2000. |

If any tier is approached: see decisions log in the design spec for upgrade paths.
