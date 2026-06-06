# Disaster Recovery Runbook

This runbook covers what to do when the production database is missing, paused, or corrupted. eVoyage runs on Supabase Postgres (free tier) wired to Vercel via `DATABASE_URL` and `DIRECT_URL`. Because the schema lives in `prisma/schema.prisma` and the data lives in seed scripts, a full rebuild from scratch takes about 30 minutes.

## Severity levels — what does this mean?

Three failure modes look similar from the outside (the app errors, the API returns 500), but each needs a different response.

### 1. Project paused (most common, no data loss)

**What it looks like:** Supabase free-tier projects auto-pause after 7 days of no activity. The dashboard shows a "Project paused" banner. API routes that touch the DB return Prisma connection errors.

**What to do:** Click "Restore project" in the Supabase dashboard. Wait ~2 minutes. No env vars change, no redeploy needed. All data is intact.

### 2. Project deleted (data loss, full rebuild required)

**What it looks like:** Supabase dashboard no longer lists the project, or the project ref in `DATABASE_URL` returns DNS/auth errors. Vercel deploys fail at runtime.

**What to do:** Follow the **Recovery steps** below. Most data rebuilds from code; some user-generated data is permanently lost (see "Permanently-lost data").

### 3. Project corrupted (data loss in specific tables)

**What it looks like:** Some queries succeed, others return malformed data. Prisma migration drift errors. The schema in the DB doesn't match `schema.prisma`.

**What to do:** If the corruption is contained, run `npm run db:push` to reconcile schema, then re-run the relevant seed script. If you can't isolate the damage, treat it as Severity 2 and rebuild from scratch.

## Recovery steps (full rebuild)

These steps assume Severity 2 — the Supabase project is gone and you're starting fresh.

1. **Create a new Supabase project.**
   - Region: `ap-southeast-1` (Singapore — closest to Vietnam users).
   - Save the project ref, DB password, pooler URL, and direct URL.

2. **Update local `.env.local`** with the new `DATABASE_URL` (pooler, port 6543) and `DIRECT_URL` (direct connection, port 5432).

3. **Push the schema.**
   ```bash
   FORCE_DB_PUSH_TO_PROD=1 npm run db:push:local
   ```
   This creates all tables defined in `prisma/schema.prisma`. No data yet.
   The `FORCE_DB_PUSH_TO_PROD` flag is required because the safety wrapper at
   `scripts/db-push-local.ts` refuses to push to a Supabase pooler URL by
   default — exactly the case here, but exactly the case you want it to catch
   when you DIDN'T mean to point at prod.

4. **Seed the EV vehicle catalog (15 models).**
   ```bash
   npm run seed
   ```

5. **Seed the OpenStreetMap charging stations.**
   ```bash
   npm run seed:stations
   ```
   The Overpass API requires a User-Agent header — already wired in commit `157d064`. If this errors with a 403, that fix may have regressed.

6. **Crawl VinFast stations (~18,276 stations, takes a few minutes).**
   ```bash
   npx tsx scripts/crawl-vinfast-stations.ts
   ```

6a. **Crawl EVPower stations** (non-VinFast operator coverage per ADR-0001).
   ```bash
   npx tsx scripts/crawl-evpower-stations.ts
   ```

6b. **Seed manually-curated stations** (a small CSV of high-quality non-crawled entries — e.g. hotels, parking lots).
   ```bash
   npx tsx scripts/seed-manual-stations.ts
   ```

6c. **Seed today's energy prices** (RON95, diesel, EVN tier 4, V-GREEN). The full daily refresh runs on GitHub Actions; this is the one-shot bootstrap so the trip-cost panel renders with real numbers immediately.
   ```bash
   npx tsx scripts/crawl-energy-prices.ts
   ```

7. **Update Vercel env vars.**
   ```bash
   vercel env rm DATABASE_URL production
   vercel env rm DIRECT_URL production
   vercel env add DATABASE_URL production
   vercel env add DIRECT_URL production
   ```
   Repeat for `preview` and `development` environments if you use them.

8. **Redeploy production** so the new env vars are baked into the Prisma client at build time.
   ```bash
   vercel deploy --prod
   ```

9. **Update GitHub Actions secrets** (the daily VinFast crawl cron needs the new connection strings).
   ```bash
   gh secret set DATABASE_URL --repo duypham9895/evoyage
   gh secret set DIRECT_URL --repo duypham9895/evoyage
   ```

## Permanently-lost data

A full rebuild restores everything that lives in code, but some tables hold user-generated or accumulated-observation data that cannot be regenerated.

| Table | What's lost | User-facing impact | Why it's acceptable |
|-------|-------------|--------------------|---------------------|
| `ShortUrl` | All previously-shared trip links | Old share links return 404 | Low traffic, links are ephemeral by nature |
| `Feedback` | All submitted feedback messages | None visible to users (admin loses history) | Feedback is read once and acted on; not a long-lived record |
| `RouteCache` | Cached route geometries | First request after recovery is slower | Cache rebuilds naturally on use |
| `StationStatusReport` | Crowdsourced WORKING/BROKEN/BUSY reports | "Verified X min ago" chip disappears until users start reporting again | Reports re-accumulate within days; never a long-lived signal |
| `StationStatusObservation` | Hourly poll history | See "Cold-start degradation" below | Aggregated cron rebuilds it over 30–60 days |
| `StationReliability` | Per-station 30-day uptime score (ADR-0007) | Ranking multiplier silently gated off until 100 observations accumulate per station | See "Cold-start degradation" |
| `StationPopularity` | 168-cell busy-probability heatmap | StopPopularity verdict reverts to "insufficient-data" | Rebuilds over 60 days |
| `StationPois` | Cached OSM amenities | First amenity lookup per station is slow (Overpass round-trip) | Lazy refill on demand |
| `VinFastStationDetail` | Cached VinFast SSE detail blobs | First detail tap per station is slow | Cache refills on demand |
| `VinfastApiCookies` | Cached CF-bypass cookies | Hourly status poll fails until next cookie-refresh GHA run (every 2h) | Self-heals within ≤2h |

If a user reports a broken share link after a recovery event, the right answer is "please re-share from the live trip" — not to attempt restoration.

## Cold-start degradation (what looks broken but isn't)

After a full rebuild, the app works immediately for trip planning, station lookup, and map rendering — but three intelligence layers need time to rebuild from observations:

| Layer | Time to recover | What users see in the meantime |
|-------|-----------------|--------------------------------|
| **Reliability ranking** (ADR-0007) | ~30 days from first poll | Stations rank by detour + charge-time only; no reliability penalty. Ranking still useful, just less precise. |
| **Popularity heatmap** (Phase 3b) | ~60 days from first poll | `StopPopularity.tsx` renders "insufficient-data" verdict. Trip plans still complete normally. |
| **Crowdsourced verification chips** | Hours–days | "Verified X min ago" labels absent until users start reporting again. |

None of these block normal use. Worth posting an honest banner ("we recently rebuilt our DB — accuracy improves over the next 30 days") if a recovery happens during a high-traffic period.

## Post-recovery checklist

After step 9, verify each item before declaring the incident resolved.

- [ ] Vercel production env vars (`DATABASE_URL`, `DIRECT_URL`) point to the new project ref.
- [ ] GitHub Actions secrets updated; the next scheduled cron run succeeds.
- [ ] Daily VinFast crawler workflow is enabled (not on the disabled schedule from commit `06be101`).
- [ ] Smoke-test endpoints:
  - `https://evoyage.duypham.me/api/vehicles` returns 15 EV models.
  - `https://evoyage.duypham.me/api/stations/nearby?lat=10.78&lng=106.69` returns a non-empty list.
  - The map view loads stations without console errors.
- [ ] A new test trip can be planned end-to-end on mobile and desktop.

## Root-cause prevention notes

The 2026-04-30 incident was survivable in 30 minutes for two reasons. Both are non-negotiable going forward.

- **Schema-as-code is mandatory.** `prisma/schema.prisma` is the source of truth for the database structure. Never make schema changes directly in the Supabase UI — always edit the schema file and run `npm run db:push`. This makes "recreate the DB" a one-line command.
- **Seed-as-code prevents data loss being existential.** The vehicle catalog and station data live in `scripts/seed-*.ts` files, not exclusively in the DB. New reference data must land in a seed script (or a crawler script committed to the repo). If a piece of data only exists in production and nowhere in the repo, deleting the DB makes it unrecoverable — that's the failure mode this rule prevents.
- **User-generated data needs a backup story before it becomes load-bearing.** `ShortUrl` and `Feedback` are acceptable losses today because nothing depends on them long-term. Before any feature stores something users would expect to persist (saved trips, accounts, history), add a backup mechanism — Supabase point-in-time recovery on a paid tier is the simplest option.

---

*Based on real recovery on 2026-04-30. New project ref: `yfwogzgzrexhtjmtilag`, region `ap-southeast-1`. Total recovery time: ~30 minutes.*
