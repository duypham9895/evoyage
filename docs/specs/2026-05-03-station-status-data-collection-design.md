# Station Status Data Collection — Phase 3 Foundation

**Status**: Approved 2026-05-03 — parallel workstream to Phase 1, foundation for Phase 3
**Owner**: Duy Phạm (PM) · Implementation: Claude Code
**Trigger**: Trust Intelligence Roadmap §14 of `2026-05-03-trip-overview-timeline-design.md` (Phase 3) requires ≥ 4 weeks of historical station-status observations before predictions become useful. Without parallel data collection, Phase 3 ships with cold-start unpredictability that erodes user trust.

**Project framing**: This is **infrastructure work** — no user-visible changes in this spec. Output is a continuously-updated dataset that Phase 3's UI/logic will consume. Quality bar still applies: real engineering, real error handling, $0 ongoing cost.

## 1. Problem

The eVoyage app currently fetches `chargingStatus` per station on-demand (UI viewing) but does NOT persist time-series observations. Phase 3 (Station Popularity Engine) needs:
- Per-station historical status logs to compute (day-of-week, hour) busy probability
- Continuous accumulation, not point-in-time snapshots
- Vietnamese-context awareness (holidays, weekends behave differently)

Without starting collection NOW, Phase 3 will ship → wait 4-8 weeks → only then become useful. Users will see "Chưa đủ dữ liệu" for two months. Unacceptable for a "serious, not MVP" product.

## 2. Goal

By the time Phase 3 ships (~6-8 weeks from start of Phase 1):
- ≥ 4 weeks of observation data per VinFast/V-GREEN station
- ≥ 100 samples per (station, day-of-week, hour) cell for the most-trafficked stations
- Aggregated `station_popularity` table query-ready
- $0 ongoing infrastructure cost
- Resilient to V-GREEN API failures and Cloudflare challenges

## 3. Architecture overview

```
┌──────────────────┐          ┌────────────────────────────┐
│ External cron    │  HTTPS   │ Vercel function            │
│ cron-job.org     │ ──────►  │ /api/cron/poll-station-    │
│ (free tier)      │  hourly  │   status                   │
└──────────────────┘          └─────────────┬──────────────┘
                                            │
                                            ▼
                              ┌──────────────────────────┐
                              │ V-GREEN locator API      │
                              │ (with cached CF cookies  │
                              │  refreshed via secondary │
                              │  Playwright job)         │
                              └─────────────┬────────────┘
                                            │
                                            ▼
                              ┌──────────────────────────┐
                              │ Supabase Postgres        │
                              │  ├ station_status_log    │ ← raw, dedup-on-change
                              │  └ station_popularity    │ ← aggregated heatmap
                              └──────────────────────────┘
                                            ▲
                                            │
┌──────────────────┐          ┌─────────────┴──────────────┐
│ External cron    │  HTTPS   │ Vercel function            │
│ cron-job.org     │ ──────►  │ /api/cron/aggregate-       │
│ (free tier)      │  daily   │   popularity               │
└──────────────────┘  2 AM VN └────────────────────────────┘
                              ┌─────────────────────────────┐
                              │ GitHub Actions (weekly)     │
                              │ Refresh CF cookies via      │
                              │ Playwright, store in        │
                              │ Supabase secrets table      │
                              └─────────────────────────────┘
```

**Why three jobs and not one**:
1. **Hourly poll**: fast HTTP using cached cookies, no Playwright in hot path → Vercel function (~5-10s execution)
2. **Daily aggregation**: SQL-heavy, separate concern, runs off-peak
3. **Weekly cookie refresh**: Playwright-heavy, runs on GitHub Actions (where Playwright is free)

This separation keeps the hourly-hot-path fast and within Vercel's free tier function timeout.

## 4. Data model — Prisma migrations

**Migration**: `prisma/migrations/2026XXXXXX_add_station_status_collection/migration.sql`

```prisma
model StationStatusObservation {
  id         BigInt   @id @default(autoincrement())
  stationId  String
  status     String   // ACTIVE | BUSY | INACTIVE | UNAVAILABLE | OUTOFSERVICE
  observedAt DateTime @default(now())

  station ChargingStation @relation(fields: [stationId], references: [id], onDelete: Cascade)

  @@index([stationId, observedAt(sort: Desc)])
  @@index([observedAt]) // for retention pruning
}

model StationPopularity {
  stationId       String
  dayOfWeek       Int      // 0=Sunday, 6=Saturday
  hour            Int      // 0-23
  busyProbability Decimal  @db.Decimal(3, 2) // 0.00 - 1.00
  sampleCount     Int
  updatedAt       DateTime @default(now()) @updatedAt

  station ChargingStation @relation(fields: [stationId], references: [id], onDelete: Cascade)

  @@id([stationId, dayOfWeek, hour])
  @@index([stationId])
}

model VinfastApiCookies {
  id          Int      @id @default(autoincrement())
  cookieJson  String   // serialized cookie array from Playwright
  refreshedAt DateTime @default(now())
  expiresAt   DateTime
}
```

**Naming rationale**:
- `StationStatusObservation` — distinct from existing `StationStatusReport` (which is crowdsourced WORKING/BROKEN reports — different concept, different writer)
- `BigInt` PK on observation table — at hourly cadence with dedup, ~150MB/year, but row count grows; BigInt is safe long-term
- `Decimal(3,2)` for probability — exact, no float drift in queries

**Existing model addition** — add reverse relations to `ChargingStation`:
```prisma
model ChargingStation {
  // ... existing fields ...
  statusObservations StationStatusObservation[]
  popularity         StationPopularity[]
}
```

## 5. Endpoint: `POST /api/cron/poll-station-status`

**Auth**: Reuses `verifyCronSecret(request)` from `src/lib/cron-auth.ts`. Returns 401 if invalid.

**Behavior**:
1. Validate cron secret
2. Load active CF cookies from `VinfastApiCookies` (latest non-expired). If none → return 503 with message "Cookies expired, awaiting refresh".
3. POST to V-GREEN `get-locators` endpoint with cached cookies. Timeout 25s (Vercel Hobby max 60s, leave headroom).
4. Parse response → for each station:
   - Look up last `StationStatusObservation` for this `stationId` (single batched query)
   - If `status` differs from last (or no prior observation) → INSERT
5. Return `{ stations_polled: N, observations_inserted: M, errors: [] }`
6. On any error: log, return 200 with errors array (NOT 5xx — prevents cron-job.org retry storm)

**File layout**:
- `src/app/api/cron/poll-station-status/route.ts` — handler, thin
- `src/lib/station/poll-status.ts` — pure logic, testable (takes deps as params)
- `src/lib/station/poll-status.test.ts` — unit tests with mocked V-GREEN response + Prisma client

**Critical implementation detail — batched dedup query**:
Don't do N+1 lookups. Single query:
```ts
const latestPerStation = await prisma.$queryRaw<Array<{ stationId: string; status: string }>>`
  SELECT DISTINCT ON (station_id) station_id, status
  FROM station_status_observation
  ORDER BY station_id, observed_at DESC
`;
```
Then bulk insert only changed rows via `prisma.stationStatusObservation.createMany({ data: changed })`.

## 6. Endpoint: `POST /api/cron/aggregate-popularity`

**Auth**: Same `verifyCronSecret`.

**Behavior** (runs daily at 2 AM Vietnam time = 19:00 UTC):
1. Validate cron secret
2. For each `stationId` with observations in the last 60 days:
   - Compute per-(day_of_week, hour) busy probability using window function:
     ```sql
     WITH expanded AS (
       SELECT station_id,
              EXTRACT(DOW FROM observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS dow,
              EXTRACT(HOUR FROM observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS hour,
              CASE WHEN status = 'BUSY' THEN 1 ELSE 0 END AS is_busy
       FROM station_status_observation
       WHERE observed_at > NOW() - INTERVAL '60 days'
     )
     SELECT station_id, dow, hour,
            ROUND(AVG(is_busy)::numeric, 2) AS busy_probability,
            COUNT(*) AS sample_count
     FROM expanded
     GROUP BY station_id, dow, hour
     ```
   - UPSERT into `station_popularity` (overwrites — full rebuild each day is cheap and idempotent)
3. Prune raw observations older than 90 days
4. Return `{ stations_aggregated: N, rows_pruned: M, duration_ms: T }`

**File layout**:
- `src/app/api/cron/aggregate-popularity/route.ts`
- `src/lib/station/aggregate-popularity.ts`
- `src/lib/station/aggregate-popularity.test.ts`

**Why timezone-aware**: VN drivers think in VN time. A trạm "đông lúc 5 giờ chiều" means 17:00 VN, not 17:00 UTC. Aggregation MUST convert before grouping.

## 7. Cookie refresh job (GitHub Actions)

**Why GitHub Actions, not Vercel**: Playwright requires Chromium binary (~300MB). Vercel functions are limited to 50MB unzipped. GitHub Actions Linux runners have full Chromium.

**Workflow**: `.github/workflows/refresh-vinfast-cookies.yml`

```yaml
name: Refresh VinFast Cookies
on:
  schedule:
    - cron: '0 3 * * 0' # Weekly Sunday 3 AM UTC = 10 AM VN
  workflow_dispatch: # manual trigger if cookies expire early
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx tsx scripts/refresh-vinfast-cookies.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DIRECT_URL: ${{ secrets.DIRECT_URL }}
```

**Script behavior** (`scripts/refresh-vinfast-cookies.ts`):
1. Launch Playwright Chromium
2. Navigate to VinFast locator page (existing CF challenge handler logic from `crawl-vinfast-stations.ts`)
3. Extract cookies after challenge resolved
4. Compute expiration (use min cookie expiry, conservative: 7 days)
5. INSERT into `VinfastApiCookies` (keeping last 3 for rollback)

**GitHub Actions cost**: Public repo unlimited; private repo ~5 min/week × 4 = 20 min/month → well within 2000 min/month free tier.

**Failure mode**: If cookie refresh fails, polling endpoint returns 503 until next manual `workflow_dispatch`. Set up GitHub email notification on workflow failure (free).

## 8. External cron service setup

**Service**: cron-job.org (free tier)

**Two jobs configured manually** (documented in `docs/operations/cron-setup.md`):

| Job name | Schedule | URL | Headers |
|---|---|---|---|
| `evoyage-poll-station-status` | `0 * * * *` (hourly on the hour) | `https://evoyage.app/api/cron/poll-station-status` | `Authorization: Bearer ${CRON_SECRET}` |
| `evoyage-aggregate-popularity` | `0 19 * * *` (daily 19:00 UTC = 2:00 AM VN) | `https://evoyage.app/api/cron/aggregate-popularity` | `Authorization: Bearer ${CRON_SECRET}` |

**Failure handling on cron side**: cron-job.org retries 2x with backoff. If still fails → email alert. Set `Treat as failure` for HTTP > 299.

**Why not Vercel Cron**: Hobby plan limits cron to 2 jobs/day total. We need hourly. cron-job.org free tier supports 1-min resolution unlimited.

## 9. Storage cost analysis (free-tier viability)

Assumptions:
- ~1000 V-GREEN stations in VN (verify via current crawler output)
- Real-world status changes: ~8 per day per station (peak times shift status, off-peak stable)
- Row size with indexes: ~80 bytes

**StationStatusObservation table**:
- 1000 stations × 8 changes/day × 365 days × 80 bytes ≈ **234 MB/year**
- With 90-day retention: **~58 MB steady-state** — well within Supabase free tier 500MB

**StationPopularity table**:
- 1000 stations × 168 cells × ~30 bytes ≈ **5 MB total** (overwritten daily, never grows)

**Total impact**: ~63 MB ongoing. Leaves ~437 MB headroom for other features. Comfortable.

## 10. Error handling matrix

| Failure mode | Behavior | User impact |
|---|---|---|
| Cron secret invalid | 401 + log security event | None (legitimate cron unaffected) |
| Cookies expired/missing | 503 + log; rely on weekly refresh job + manual `workflow_dispatch` | Phase 3 freshness lag during outage |
| V-GREEN API timeout | Log, return 200 with `errors: ["upstream_timeout"]` | Skip this hour's data point |
| Single station insert fails | Log, continue with others | One station has slight gap |
| Aggregation SQL error | Log full error + return 500 | Yesterday's heatmap stays valid |
| Vercel function timeout (>50s) | Function aborts; cron retries next hour | Skip this hour's data point |
| Cloudflare blocks new pattern | Cookie refresh fails next week → 503s | Manual investigation required (alert via GitHub Actions email) |

**Monitoring**: Vercel function logs (free), Supabase logs (free), cron-job.org execution history (free), GitHub Actions email alerts (free). Total monitoring cost: $0.

## 11. Security considerations

1. **CRON_SECRET** — minimum 64 random chars, stored in Vercel env vars + cron-job.org config. Rotation procedure documented.
2. **Cookie storage** — cookies grant API access to V-GREEN. Treat as secrets. `VinfastApiCookies.cookieJson` is sensitive; access only from server-side code.
3. **Rate-limit politeness** — hourly = 24 calls/day to V-GREEN. Well below any reasonable rate limit. Add `User-Agent: eVoyage/1.0 (https://evoyage.app)` header for transparency.
4. **No PII collected** — only station IDs and statuses. Zero user data in this pipeline.
5. **Idempotency** — re-running an hourly poll within the same hour is safe (dedup-on-change). cron-job.org retries are harmless.

## 12. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Cron frequency | **Hourly** | Matches heatmap cell granularity (24 cells/day); 2-hour aliases over intra-cell changes |
| Cron service | **cron-job.org (external, free)** | Vercel Hobby cron limited to 2 jobs/day; cron-job.org free tier 1-min resolution unlimited |
| Polling runtime | **Vercel function** | Fast HTTP, no Playwright needed in hot path; reuses existing `cron-auth.ts` |
| Cookie refresh runtime | **GitHub Actions** | Playwright needs Chromium binary (300MB > Vercel 50MB limit); GHA Linux runners have full env |
| Dedup strategy | **On-change INSERT** | Reduces storage 6-8x vs naive insert-every-poll; preserves all transitions |
| Aggregation cadence | **Daily, full rebuild** | Idempotent, simple, predictable; recomputing 60-day window takes seconds |
| Timezone handling | **Convert to Asia/Ho_Chi_Minh BEFORE grouping** | Vietnamese drivers think in VN time; 17:00 means 17:00 VN, not UTC |
| Retention | **90 days raw, infinite aggregated** | 90 days enough for seasonal patterns; aggregated table tiny anyway |
| Schema separation | **`StationStatusObservation` (new) ≠ `StationStatusReport` (existing crowdsourced)** | Different writers (cron vs user), different semantics (real-time API vs user trust report); merging would couple unrelated concepts |

## 13. Files to create / modify

**Create**:
- `prisma/migrations/2026XXXXXX_add_station_status_collection/migration.sql`
- `src/app/api/cron/poll-station-status/route.ts`
- `src/app/api/cron/aggregate-popularity/route.ts`
- `src/lib/station/poll-status.ts`
- `src/lib/station/poll-status.test.ts`
- `src/lib/station/aggregate-popularity.ts`
- `src/lib/station/aggregate-popularity.test.ts`
- `src/lib/station/vinfast-api-client.ts` — extracted HTTP client (reuse-friendly)
- `src/lib/station/vinfast-api-client.test.ts`
- `scripts/refresh-vinfast-cookies.ts`
- `.github/workflows/refresh-vinfast-cookies.yml`
- `docs/operations/cron-setup.md` — operator runbook for cron-job.org config + secret rotation

**Modify**:
- `prisma/schema.prisma` — add 3 new models + relations on `ChargingStation`
- `.env.example` — document `CRON_SECRET` (already exists per current code) and add note about external cron config

## 14. Testing strategy

**Unit tests** (must pass before commit):
- `poll-status.test.ts` — mock V-GREEN client + Prisma; verify dedup logic, error handling, batched query construction
- `aggregate-popularity.test.ts` — seed test fixtures, run aggregation, verify probability math + timezone handling
- `vinfast-api-client.test.ts` — mock `fetch`, verify cookie injection, header construction, timeout

**Integration tests**:
- End-to-end: insert sample observations (covering edge cases: midnight crossings, timezone boundaries, all-busy stations, all-active stations) → run aggregation → assert popularity table content

**Manual QA before declaring "Phase 3 foundation ready"**:
- [ ] Deploy migration to staging Supabase project
- [ ] Run cookie refresh workflow manually; verify cookies stored
- [ ] Trigger `poll-station-status` manually; verify observations inserted
- [ ] Wait 24 hours; trigger `aggregate-popularity` manually; verify popularity rows correct
- [ ] Run for 1 week; verify storage growth matches estimate
- [ ] Document any V-GREEN API quirks discovered in `docs/operations/cron-setup.md`

**Telemetry to verify post-launch**:
- Daily report: observations inserted per day (should be ~8000/day for 1000 stations)
- Daily report: aggregation runtime (should be < 30 seconds)
- Weekly: cookie refresh success rate (should be 100%)

## 15. Out of scope

These are NOT in this spec:
- Surfacing popularity in any UI — that is Phase 3 of the Trust Intelligence Roadmap
- Reservation API integration — Phase 3
- Crowdsourced "actual wait time" feedback prompts — Phase 3
- Holiday-aware probability boosting — implemented in Phase 3's prediction layer (data foundation here is timezone-aware but not holiday-aware)
- Backfilling historical data from external sources — none available
- Multi-region database replication — not needed at current scale
- ML/regression-based prediction — Phase 3 may explore; this spec is the data foundation only

## 16. Implementation sequencing (parallel with Phase 1)

1. **Day 1**: Prisma migration + `vinfast-api-client.ts` (extracted from existing crawler patterns)
2. **Day 2**: `poll-status.ts` logic + tests + `/api/cron/poll-station-status` route
3. **Day 3**: Cookie refresh script + GitHub Actions workflow + first manual cookie population
4. **Day 4**: `aggregate-popularity.ts` logic + tests + `/api/cron/aggregate-popularity` route
5. **Day 5**: cron-job.org config + monitoring + `cron-setup.md` runbook
6. **Day 5+**: Data starts accumulating. Phase 1 implementation continues in parallel.

After 4 weeks: re-evaluate sample density per (station, day, hour) cell. If sparse for low-traffic stations, decide whether to extend retention or accept lower confidence for those. This decision belongs in Phase 3 spec, not here.
