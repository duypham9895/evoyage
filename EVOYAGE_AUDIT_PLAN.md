# EVoyage — Full Audit, QA & Feature Completion Plan

> **Status:** PHASE 1 (Discovery) complete. PHASE 2 (this document) awaiting PM approval before any code change. No file in `src/`, `prisma/`, `scripts/`, `.github/` was modified during discovery.
>
> **Audited at:** 2026-05-24 · branch `main` · HEAD `86ec9ee feat(api/route): activate reliability ranking + telemetry (ADR-0007 layer 5+6)` · `package.json` `0.8.0`
>
> **Method:** 4 parallel read-only discovery agents — codebase + feature inventory, past-intent recovery from docs, GitHub Actions, Supabase/Prisma data layer.

---

## Table of Contents

- [A. Current State Summary](#a-current-state-summary)
- [B. Gap Analysis](#b-gap-analysis)
- [C. Issues Found](#c-issues-found)
- [D. Feature Completion Plan](#d-feature-completion-plan)
- [E. QA Test Plan](#e-qa-test-plan)
- [F. Execution Roadmap](#f-execution-roadmap)

---

## A. Current State Summary

### A.1 Tech stack snapshot

| Component | Version | Source |
|---|---|---|
| Next.js (App Router) | 16.1.7 | `package.json:34` |
| React / ReactDOM | 19.2.3 | `package.json:38-39` |
| TypeScript | ^5 | `package.json:55` |
| Tailwind CSS (v4 via PostCSS) | ^4 | `package.json:46,54` |
| Prisma + `@prisma/client` | ^6.19.2 | `package.json:21,37` |
| Vitest | ^4.1.0 | `package.json:56` |
| Playwright | ^1.58.2 | `package.json:53` |
| Mapbox (`mapbox-gl` + `react-map-gl`) | 3.20.0 / 8.1.0 | `package.json:30,40` |
| Leaflet + `react-leaflet` | 1.9.4 / 5.0.0 | `package.json:28,41` |
| OpenAI SDK (used for MiMo + MiniMax via OpenAI-compatible API) | ^6.32.0 | `package.json:35` |
| Upstash Redis + Ratelimit | 1.37.0 / 2.0.8 | `package.json:23-24` |
| PostHog (client) | ^1.372.5 | `package.json:36` |
| Husky + lint-staged | 9.1.7 / 16.4.0 | `package.json:61,63` |
| Node runtime | **NOT PINNED** (no `engines`, no `.nvmrc`) | `package.json` (no engines block) |
| Test baseline | 1237 unit/integration in 105 files (per `CLAUDE.md`); 19 E2E in 10 spec files | `CLAUDE.md`, `e2e/` |

### A.2 Architecture (verified)

Next.js App Router monorepo-free single-package layout. Server-side API routes under `src/app/api/` handle routing, AI calls, station data, feedback, sharing, and 3 cron handlers. Client uses Mapbox or Leaflet depending on user toggle. Prisma talks directly to Supabase Postgres in `ap-southeast-1` — there is **no Supabase Auth, no Supabase Edge Functions, no Supabase JS client**. The DB is treated as a Postgres backing store; "Supabase" is the infra brand only.

```
Client (Next.js App Router) ──► /api/route, /api/evi/*, /api/stations/*, /api/feedback,
                                /api/short-url, /api/share-card, /api/cron/*, /api/transcribe
       │                                       │
       │ posthog-js (gated)                    └─► Mapbox, MiniMax/MiMo, Groq Whisper, Nominatim, OSRM
       │
       └────────► Prisma ────► Supabase Postgres (12 models)
                                       ▲
                                       │ (cron-job.org POSTs with CRON_SECRET)
              GitHub Actions ──────────┘
              (9 workflows: deploy, crawls, cookie refresh, status polling, aggregation, release)
```

### A.3 Feature inventory

Status legend: ✅ Done · 🟡 Partial · 🔴 Missing · ⚠️ Broken · ⏳ Deferred (gated, ADR-tracked)

#### Trip planning

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| TripInput form (start/end/vehicle/battery/SoC/depart/safety) | ✅ | `src/components/trip/TripInput.tsx`, `src/app/plan/page.tsx:78-106` | |
| Waypoints + loop trip | ✅ | `src/components/trip/WaypointInput.tsx:59-113`, `plan/page.tsx:86-87` | |
| Geocoding via Nominatim | ✅ | `src/lib/geo/nominatim.ts:40` | |
| Routing — OSRM primary | ✅ | `src/lib/routing/osrm.ts:161,227` | |
| Routing — Mapbox Directions fallback | ✅ | `src/lib/routing/mapbox-directions-fallback.ts:65` | |
| Range calculation | ✅ | `src/lib/routing/range-calculator.ts` (+ test) | |
| Station finder along route | ✅ | `src/lib/routing/station-finder.ts` (+ test) | |
| Station ranker w/ reliability multiplier (ADR-0007) | ✅ | `src/lib/routing/station-ranker.ts`, `reliability-score.ts` | Active per commits `9c03246`, `86ec9ee` |
| Alternative stations (ADR-0006) | ✅ | `src/lib/routing/apply-backup-pressure.ts:55`, `route-planner.ts:292-318` | |
| Backup pressure scoring | ✅ | `src/lib/routing/backup-pressure.ts` | |
| RouteCache (Prisma-backed) | ✅ | `src/lib/routing/route-cache.ts`, `api/route/route.ts:19` | **Unbounded growth — see C.3** |

#### Map experience

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Mapbox map | ✅ | `src/components/map/MapboxMap.tsx:4,384` | |
| OSM / Leaflet map | ✅ | `src/components/map/Map.tsx:30-31` | |
| Map mode toggle | ✅ | `src/lib/map-mode.tsx:18-44` | Legacy `google` value migrated to `osm` |
| Smart + station markers | ✅ | `src/lib/geo/smart-marker.ts` | |
| Alternative markers w/ click telemetry | ✅ | `MapboxMap.tsx:193,239`, `analytics.ts:221-237` | |
| Stop mini-card popups (bilingual, "Ask eVi" bridge) | ✅ | `src/lib/geo/mini-card.ts:101` | |
| Elevation chart | ✅ | `src/components/map/ElevationChart.tsx:43` | |
| `MapLocateButton` (geolocation) | ✅ | `src/components/map/MapLocateButton.tsx:86` (+ test) | Hydration mismatch on mobile per `QA-FINDINGS.md` Finding #6 |

#### eVi AI assistant

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Natural-language trip parse | ✅ | `src/app/api/evi/parse/route.ts:51` | |
| Follow-up suggestion chips | ✅ | `src/app/api/evi/suggestions/route.ts:36`, `suggestions-client.ts` | |
| Provider chain MiMo → MiniMax (ADR-0002) | ✅ | `src/lib/evi/llm-module.ts:39,108` | |
| Voice input — Web Speech + Whisper fallback | ✅ | `src/lib/speech/web-speech-engine.ts:36`, `whisper-engine.ts:36`, `useSpeechInput.ts:111` | |
| Transcribe API (Groq Whisper-large-v3) | 🟡 | `src/app/api/transcribe/route.ts:14,23` | **No rate limit — see C.3 P1** |
| Route narrative | ✅ | `src/app/api/route/narrative/route.ts:73,114` | |
| "Show on Map" station bridge | ✅ | `src/lib/events/station-events.ts:20` | |
| eVi FAB + Mobile Sheet + Nudge | ✅ | `EViFab.tsx`, `EViMobileSheet.tsx`, `EViNudge.tsx` | |
| Provider telemetry (server log) | ✅ | `llm-module.ts:108` (`[llm] provider=…`) | |

#### Stations data

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| VinFast crawl + entity resolver | ✅ | `scripts/crawl-vinfast-stations.ts`, `src/lib/vinfast/*` | |
| OSM seed | ✅ | `scripts/seed-osm-stations.ts` | |
| EVPower crawl | ✅ | `scripts/crawl-evpower-stations.ts` | |
| Manual CSV seed | ✅ | `scripts/seed-manual-stations.ts` | |
| Station detail SSE | ✅ | `api/stations/[id]/vinfast-detail/route.ts:23,71` | |
| Hourly status polling (cron handler) | ✅ | `api/cron/poll-station-status/route.ts:23` | **Wired but cron schedule not in `vercel.json` — see C.3** |
| Weekly VinFast cookie refresh (GHA) | ✅ | `scripts/refresh-vinfast-cookies.ts` | **Playwright `networkidle` flakiness — see C.1 P1** |
| Reliability aggregation (ADR-0007) | ✅ | `src/lib/station/aggregate-reliability.ts:32` | |
| Popularity heatmap (Phase 3b) | ✅ (cold-start) | `src/lib/station/aggregate-popularity.ts:34,67` | Verdict "insufficient-data" until ~2026-06-02 per `TODOS.md` (data-gated, not broken) ⏳ |
| Amenities (Phase 4) | ✅ | `api/stations/[id]/amenities/route.ts:124` | |
| Crowdsourced station auto-promotion | 🟡 | `scripts/promote-crowdsourced-stations.ts` | Script-only — no cron route, manual-run |

#### Crowdsourcing & feedback

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| StationStatusReport (Working/Broken/Busy) | ✅ | `api/stations/[id]/status-report/route.ts:32` | |
| Feedback FAB + Modal + 8 categories | ✅ | `src/components/feedback/*`, `src/lib/feedback/constants.ts:5-14` | |
| MISSING_STATION proposed coords | ✅ | `schema.prisma:247-249` | |
| STATION_DATA_ERROR `correctInfo` | ✅ | `schema.prisma:241` | |
| Image upload for feedback | 🔴 | Schema `imageUrl` field at `schema.prisma:250`, **no UI in repo** | Ghost feature — Phase 2 plan never built |
| Admin status workflow (NEW→IN_REVIEW→RESOLVED→CLOSED) | 🟡 | `schema.prisma:253-254` | DB fields only, no admin UI |
| Email notify (Resend) | ✅ | `src/lib/feedback/email.ts:185,204` | |

#### Cost & energy

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Energy-price parsers Petrolimex/V-GREEN/EVN | ✅ | `src/lib/energy-prices/parse-*.ts` (+ tests) | |
| Daily price sync (GHA workflow) | ✅ | `.github/workflows/crawl-energy-prices.yml` + `scripts/crawl-energy-prices.ts` | **No matching `/api/cron` route — runs only via GHA** |
| Trip cost calculator | ✅ | `src/lib/trip-cost.ts`, `src/lib/trip/cost.ts` (+ test) | |
| Cost hero on TripSummary | ✅ | `TripSummary.tsx` (44.8KB) | |

#### Sharing

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Short URLs w/ retry + rate limit | ✅ | `src/lib/short-url.ts:80`, `api/short-url/route.ts:15,24` | |
| OG share-card image | ✅ | `src/app/api/share-card/route.tsx` | |
| Share button | ✅ | `src/components/trip/ShareButton.tsx:112-125,158` | |
| `/s/[code]` short-url redirect | ✅ | `src/app/s/[code]/page.tsx` | |
| `ShortUrl.expiresAt` enforcement | 🟡 | `schema.prisma:215` marked "reserved" — field never written, read-side check exists | Unbounded growth |

#### Internationalization

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| en.json + vi.json (494 keys each, parity) | ✅ | `src/locales/{en,vi}.json` | |
| Locale toggle | ✅ | `src/lib/locale.tsx` | |
| Locale parity test | ✅ | `src/lib/__tests__/locale-keys.test.ts` | |
| `document.title` sync | ✅ | `src/components/LocaleTitleSync.tsx` (+ test) | Fixed in commit `4cb834c` |
| Map `<img alt>` localization | 🔴 | Per `QA-FINDINGS.md` Finding #5 — hero alt stays Vietnamese in EN mode | |

#### Analytics

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| PostHog init (gated on key + NODE_ENV=production) | ✅ | `src/lib/analytics.ts:39,45`, `AnalyticsProvider.tsx:9-18` | |
| `trackTripPlanned`, `trackStationTapped`, `trackShareClicked`, `trackBackupDistribution`, etc. (11 events) | ✅ | `analytics.ts:80,93,118,138,154,182,189,207,221-237` | |
| `trackPageView` | 🔴 | Defined `analytics.ts:71`, **0 callers** | Pageviews silently lost in PostHog |
| `trackEviMessage` | 🔴 | Defined `analytics.ts:106`, **0 callers** | eVi message events not instrumented |

#### Auth / users

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| User accounts / sessions | 🔴 (intentional) | No User model, no NextAuth/Clerk/Supabase auth | Confirmed anonymous-only app; only `ipHash` exists |

#### PWA / mobile

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| `manifest.json` | ✅ | `public/manifest.json` (+ `pwa-manifest.test.ts`) | |
| Haptics | ✅ | `src/lib/haptics.ts` (used 4×) | |
| MobileBottomSheet, MobileTabBar, DesktopTabBar | ✅ | `src/components/layout/*` (+ tests) | |
| Service worker / offline | 🔴 | No SW file, no `next-pwa`/workbox | Not in any spec — design decision, not gap |

#### Operations

| Feature | Status | Evidence | Notes |
|---|---|---|---|
| Rate limiting (Upstash + in-memory dev fallback) | ✅ on most | `src/lib/rate-limit.ts:46,48-50` (logs SECURITY error if prod + no Redis) | |
| Cron handlers w/ `verifyCronSecret` (constant-time) | ✅ | `src/lib/cron-auth.ts:14,17` | |
| `vercel.json` `crons:` array | 🔴 | File has only `git`/`functions` keys | **External cron-job.org schedules undocumented in repo — see C.3 P1** |
| Security headers (HSTS/CSP/XFO/Permissions-Policy) | ✅ | `next.config.ts:5-30` | CSP allows `'unsafe-inline'` — see C.3 P1 |
| Error tracking (Sentry, etc.) | 🔴 | No SDK | Observability rests on Vercel logs only |
| Disaster-recovery doc | 🟡 | `docs/RECOVERY.md` | **Incomplete — see C.2 P1** |
| ADRs | ✅ | `docs/adr/0001-0007*.md` | |

---

## B. Gap Analysis

### B.1 Originally requested features that are missing, partial, or uncertain

| # | Feature (spec/ADR) | Asked | Status | Evidence |
|---|---|---|---|---|
| B1 | **Feedback image upload** (Phase 2 plan, `prd-feedback-system.md`) | 2026-03-21 | 🔴 Missing | `imageUrl` field in `schema.prisma:250`, zero UI references (`grep imageUrl src/components` = 0) |
| B2 | **`trackPageView` instrumentation** (analytics PR plan) | 2026-05-01 | 🔴 Missing | `analytics.ts:71` defined, 0 callers; comment at `:45` claims "we send pageviews manually" |
| B3 | **`trackEviMessage` instrumentation** (analytics PR plan) | 2026-05-01 | 🔴 Missing | `analytics.ts:106` defined, 0 callers; `useEVi.ts` doesn't fire it |
| B4 | **ADR-0003 — VinFast detail Module deepening** | 2026-05-06 | 🟡 Uncertain | `src/lib/vinfast/` still has 3 separate adapters; route handler not visibly trimmed; no commit explicitly executing this ADR |
| B5 | **ADR-0004 — TripPlanner Module replacement of 573-line route handler** | 2026-05-06 | 🟡 Uncertain | Module `route-planner.ts` (14.6KB) exists, but `api/route/route.ts` is still ~25KB. Goal was to trim the route handler. |
| B6 | **ADR-0005 — EviTripExtractor Module** | 2026-05-06 | 🟡 Uncertain | No `evi-trip-extractor.ts` in `src/lib/evi/`; `evi/parse/route.ts` not visibly trimmed to match ADR shape |
| B7 | **ADR-0008 — Reliability UI exposure decision** | (referenced in `TODOS.md`) | ⏳ Deferred (gated) | ADR file not drafted; gated on ADR-0007 telemetry maturing (~2026-06-22) — **legitimate deferral, not a gap** |
| B8 | **Phase 3b — Popularity prediction UI** | 2026-05-03 | ⏳ Deferred (data-gated) | `StopPopularity.tsx` ships verdict "insufficient-data" until ~2026-06-02 — **legitimate deferral** |
| B9 | **ADR-0006 magic-number recalibration** (8 numbers) | 2026-05-08 | ⏳ Deferred (data-gated) | Gated on 2–4 weeks telemetry from backup events — **legitimate deferral** |
| B10 | **Third-party charging ≥5% network share target** (2026-05-01 plan) | 2026-05-01 | 🟡 Unverified | Parsers exist (`parse-osm.ts`, `parse-evpower.ts`, `parse-manual-csv.ts`); no telemetry doc confirms the 5% reach |
| B11 | **React hooks set-state-in-effect cleanup** (6 violations from `2026-05-04-react-hooks-set-state-cleanup.md`) | 2026-05-04 | 🟡 Uncertain | Spec status "Proposed", not "Approved"; no shipping evidence; pre-commit hook catches *new* violations but the original 6 may remain |
| B12 | **Feedback admin UI** (status workflow NEW→IN_REVIEW→RESOLVED→CLOSED) | implied by `prd-feedback-system.md` | 🟡 Partial | DB fields exist; only Resend email notify is wired |
| B13 | **Feedback image upload UI** | implied by `imageUrl` field | 🔴 Missing | Same as B1 — restating because it has two consumer surfaces (uploader + admin viewer) |
| B14 | **Phase 5 Trip Notebook depth** | 2026-05-03 | 🟡 Possibly partial | `TripNotebook.tsx` (2.9KB) + `TripNotebookEntry.tsx` (3KB) feel small for a 10KB spec describing 3+ entities, share-back, history, side-by-side compare. Worth verifying. |
| B15 | **`edwardpham-main-design-20260322-212855.md` Smart Map Marker design doc** | 2026-03-22 | 🟡 Stale reference | Referenced in `TODOS.md:60`, **file does not exist in repo** |

### B.2 Features in code with no spec/ADR/CHANGELOG entry (scope-creep candidates)

These exist and work; PM may want to either retro-document or remove.

| # | Code | What it does | Where |
|---|---|---|---|
| B16 | `EViNudge.tsx` (+ test) | One-time-per-session toast nudging eVi use after 90s idle | `src/components/EViNudge.tsx` |
| B17 | `SampleTripChips.tsx` (+ test) | 4 canonical empty-state trip suggestions on `/plan` | `src/components/trip/SampleTripChips.tsx` |
| B18 | `AddCustomVehicle.tsx` | Custom vehicle creation UI | `src/components/trip/AddCustomVehicle.tsx` |
| B19 | `LocaleTitleSync.tsx` (+ test) | `document.title` sync with locale | `src/components/LocaleTitleSync.tsx` |
| B20 | `StarRating.tsx` | Star input in Feedback modal | `src/components/feedback/StarRating.tsx` |

### B.3 Documentation drift (originally promised, now stale)

| # | File | Stale claim | Reality |
|---|---|---|---|
| B21 | `README.md:38` | "Vitest (728 tests, 54 files)" | Now 1237 tests / 105 files per `CLAUDE.md` (≥509 tests behind) |
| B22 | `README.md:34` | "MiniMax M2.7 for eVi" | MiMo is now primary; MiniMax is fallback per ADR-0002 |
| B23 | `README.md:11` | "63 provinces" | 34 (28 provinces + 6 cities) post-2025 admin reform — already corrected in landing per `CHANGELOG.md:25` |
| B24 | `ARCHITECTURE.md` | Missing `/api/cron/{aggregate-popularity,aggregate-reliability,poll-station-status}`, `/api/stations/{[id]/amenities,[id]/status-report,nearby}`, `/api/transcribe`; `src/lib/evi/` block doesn't list `llm-module.ts` or `llm-providers.ts` | Significantly out of date |
| B25 | `CHANGELOG.md` | Stops at v0.8.0 (2026-05-01) | Misses Phases 1–5 of Trust Intelligence Roadmap, MiMo migration, Whisper migration, ADRs 0006/0007 — all post-2026-05-03 |
| B26 | `TODOS.md:60` | Points to `edwardpham-main-design-20260322-212855.md` | File does not exist |

### B.4 Documentation correctly reflects deferred work

These are explicit, gate-tracked deferrals — **not gaps**:
- ADR-0007 reliability ranking (target ~2026-06-02 for full effect — gate cleared in shipping, accumulating data)
- ADR-0008 reliability UI exposure (target ~2026-06-22 — gated on ADR-0007 telemetry)
- ADR-0006 magic-number recalibration (target ~2026-05-22 — gated on backup-event telemetry)
- Phase 3b popularity calibration (target ~2026-06-02 — gated on observation count)

---

## C. Issues Found

### C.1 GitHub Actions (9 workflows)

| # | Workflow | Issue | Severity | Fix |
|---|---|---|---|---|
| C1 | `refresh-vinfast-cookies.yml` | Playwright `page.goto(..., waitUntil: 'networkidle')` recurs as `TimeoutError` against `vinfastauto.com`. 12 of last 50 repo failures. Cluster on 2026-05-17, 18, 19, 21, 23. Different root cause than the 2026-05-06 apt-mirror fix. | **P1** | Replace `networkidle` with `domcontentloaded` + selector wait; wrap nav in 2–3-attempt retry. Edit `scripts/refresh-vinfast-cookies.ts:47`. |
| C2 | `poll-station-status.yml` | Fails 28× in last 50 failures as a **derivative symptom** of cookie-refresh failure (returns `{"ok":false,"reason":"cookies_expired"}`). Amplifies alarm volume 2–3×. | **P1** | Either downgrade `cookies_expired` to warning when the latest refresh-cookies run is also failed, or stop failing the workflow on that specific exit reason. |
| C3 | repo-wide | `main` branch is **unprotected** (`gh api .../branches/main/protection` → 404). Force-push is currently possible. | **P1** | Enable branch protection: require `Deploy to Vercel` status check, block force-push to `main`. |
| C4 | `deploy.yml` | No `workflow_dispatch:` trigger — can't manually replay a deploy. | **P2** | Add `workflow_dispatch:` to `on:` block. |
| C5 | `deploy.yml`, `crawl-stations.yml`, `crawl-energy-prices.yml` | No `concurrency:` group on jobs that auto-commit or deploy. Double-push could race. | **P2** | Add `concurrency: { group: <name>, cancel-in-progress: false }`. |
| C6 | 5 workflows | Node 20 pinned in `deploy.yml:24`, `crawl-stations.yml:25`, `crawl-energy-prices.yml:24`, `refresh-vinfast-cookies.yml:32`, `warm-station-pois.yml:30`. Vercel default is now Node 24 LTS. | **P2** | Bump to Node 22 in CI; add `engines.node: ">=20"` to `package.json` to lock. |
| C7 | `release.yml` | Never run — no `v*.*.*` tag exists. `awk` extractor and prerelease detection untested. | **P2** | Dry-run extraction against current `CHANGELOG.md` locally; smoke-test with an `-rc` tag before first real release. |
| C8 | repo-wide | No `.github/dependabot.yml`. | **P2** | Add weekly npm + github-actions dependency PRs. |
| C9 | repo-wide | `delete_branch_on_merge: false`. | **P3** | Enable. |
| C10 | `deploy.yml:64` | 3 Playwright browsers installed but `playwright.config.ts` likely targets Desktop Chrome only. ~30–40s wasted per CI run. | **P3** | Install `chromium` only. |
| C11 | `poll-station-status.yml:8`, `refresh-vinfast-cookies.yml:7-12` | Stale comments cite "2000 min/month private repo" budget; repo is now public (unmetered Actions). Original 2h cadence rationale obsolete. | **P3** | Update comments; consider hourly cookie refresh to halve downstream poll failures. |

**Healthy:** secret handling, `permissions:` scoping, SHA-pinning of marketplace actions, cron-offsets (no collisions).

### C.2 Supabase / Prisma (data layer)

| # | Object | Issue | Severity | Fix |
|---|---|---|---|---|
| C12 | `RouteCache` | No `expiresAt`, no prune. Every unique `(startPlaceId, endPlaceId)` accumulates forever. | **P1** | Add `expiresAt` + nightly prune in an existing cron, OR migrate to Upstash with TTL. |
| C13 | `docs/RECOVERY.md` | Missing recovery steps for `crawl-evpower-stations.ts`, `crawl-energy-prices.ts`, `seed-manual-stations.ts`. From-scratch rebuild would yield OSM + VinFast + 15 vehicles only — no EVPower, no prices. Also doesn't note that `StationReliability` / `StationPopularity` / `StationPois` will be empty for days–weeks. | **P1** | Append 5b/5c/5d steps + a "post-recovery degradation window" section. |
| C14 | `.env.example` | Missing ~10 required env vars (`DATABASE_URL`, `DIRECT_URL`, `MAPBOX_ACCESS_TOKEN`, `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`, `RESEND_API_KEY`, `FEEDBACK_EMAIL_TO`, `FEEDBACK_EMAIL_FROM`, `OPEN_CHARGE_MAP_API_KEY`). A new contributor cannot set up local dev. | **P2** | Document all env vars (no real values). |
| C15 | `ShortUrl.expiresAt` | Field declared "reserved for future use"; never written at create; only consulted at read. Effectively unbounded. | **P2** | Either remove the field or set a 1-year default in `src/lib/short-url.ts:57`. |
| C16 | `VinFastStationDetail` | Cache by `fetchedAt`; no prune. Grows monotonically. | **P2** | Add `DELETE WHERE fetchedAt < NOW() - INTERVAL '30 days'` to a cron. |
| C17 | `package.json:db:push` | Can target production by accident if `.env` is wrong. No host-allowlist. | **P2** | Rename to `db:push:local` or add an environment guard. |
| C18 | repo-wide | No `prisma migrate diff` CI gate. `db:push` workflow has no destructive-change protection. | **P2** | Add CI step comparing `prisma/schema.prisma` against the prod schema on PR. |
| C19 | `src/lib/station/poll-status.ts:91` | `JSON.parse(cookieRow.cookieJson)` with no try/catch. Malformed cookie row throws and kills the cron. | **P3** | Wrap in `safeJsonParse` from `src/lib/safe-json.ts`. |
| C20 | env / ops | Verify `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is a separate, referrer-scoped token from server-side `MAPBOX_ACCESS_TOKEN`. Cannot verify from code alone. | **P3** | Confirm via Mapbox dashboard. |
| C21 | repo-wide | External cron-job.org schedules for the 3 cron handlers are not documented in the repo. | **P3** | Document schedules in `docs/RECOVERY.md` or a new `docs/operations/cron-schedules.md`. |

**Healthy:** no P0 secret leak (no CRITICAL/HIGH env var in any `"use client"` file); index coverage on all hot queries; IP hashing uses unspoofable `x-vercel-forwarded-for` first; constant-time CRON_SECRET comparison; Zod input validation on all user-facing POSTs; only parameter-less `$executeRaw` (no SQL injection); RLS not applicable (no user-private data).

### C.3 Code-level issues

| # | File | Issue | Severity | Fix |
|---|---|---|---|---|
| C22 | `src/app/api/transcribe/route.ts:23` | **No rate limit on a paid Groq endpoint.** Anonymous POST with up to 5MB audio is unbounded per IP. Cost-abuse vector. | **P1** | Wrap with `checkRateLimit` mirroring `evi/parse/route.ts:27` — e.g., 10 req/min per IP. |
| C23 | `vercel.json` | No `crons:` array — 3 cron handlers (`aggregate-reliability`, `aggregate-popularity`, `poll-station-status`) won't fire on Vercel without external config. ADR-0007 layer 5 declares reliability "active" but the schedule isn't in source. | **P1** | Either add `"crons": [...]` to `vercel.json`, or document explicitly that cron-job.org is the scheduler and store the schedule. |
| C24 | `next.config.ts:14` + `src/app/page.tsx:52` | CSP allows `'unsafe-inline'` for `script-src` and `style-src`. Combined with `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}` this widens XSS attack surface. JSON-LD content is currently static, so risk is latent, not active. | **P1** | Move to nonce-based CSP via middleware; or `JSON.stringify(...).replace(/</g, '\\u003c')` to neutralize `</script>` breakout. |
| C25 | `src/lib/evi/llm-module.ts:108` | `console.log("[llm] provider=…")` left in production. Intentional structured server log, but violates CLAUDE.md pre-commit checklist ("no console.log left"). | **P3** | Either normalize to a logger (no-op), or carve out the rule. |
| C26 | `package.json` | No `engines.node`. | **P2** | Add `"engines": { "node": ">=20" }`. |
| C27 | `src/app/api/transcribe/route.ts` | No colocated test for a paid-API endpoint. | **P2** | Add `route.test.ts` covering: happy path, 401, payload >5MB, missing field, rate-limit hit. |
| C28 | `src/app/api/route/route.ts`, `src/app/api/stations/route.ts`, `src/app/api/feedback/route.ts`, `src/app/api/short-url/route.ts`, `src/app/api/vehicles/route.ts`, 3 cron routes | Largest API routes have no colocated tests. | **P2** | Add tests as part of B4–B6 ADR-execution work or standalone P2 cleanup. |
| C29 | `src/components/trip/AddCustomVehicle.tsx` + filter buttons + selected vehicle card | DESIGN.md violations from `QA-FINDINGS.md` (Findings #1, #2): emoji `🇻🇳/🌍`, `🔋/📏/⚡` in interactive buttons. | **P3** | Replace with text labels per CLAUDE.md "Less Icons, More Humanity". |
| C30 | footer | Pre-existing wrong GitHub URL (`edwardpham94/evoyage` 404) per `QA-FINDINGS.md` Finding #3. | **P2** | Update to `duypham9895/evoyage`. |
| C31 | hero image alt | `alt="Bản đồ Việt Nam…"` doesn't switch on locale per Finding #5. | **P3** | Move alt to locale key. |
| C32 | `MapLocateButton` on mobile | React hydration mismatch warning per Finding #6. | **P3** | Wrap in `<ClientOnly>` or defer initial state to `useEffect`. |

**Zero hits, clean:** `TODO`/`FIXME`/`HACK`/`XXX` in `src/`; `eval(` / `new Function(`; hardcoded `sk-*` secrets; `service_role` in client files; empty handler stubs; commented-out blocks >5 lines.

---

## D. Feature Completion Plan

For each missing/partial feature from §B. Sized **S** (≤1 session, ≤200 LOC) / **M** (1–2 sessions, ≤600 LOC) / **L** (3+ sessions or cross-cutting).

### D.1 — `trackPageView` instrumentation (B2)

- **User story:** As a PM, I want to know which pages users land on so I can prioritize fixes.
- **Acceptance criteria:**
  - `trackPageView` fires once per route change on `/`, `/plan`, `/s/[code]`.
  - Fires only when PostHog is initialized (`NEXT_PUBLIC_POSTHOG_KEY` set + `NODE_ENV=production`).
  - Distinct events for `/plan?with-state` vs bare `/plan`.
  - Existing unit test `analytics.test.ts` extended to assert call.
- **Files to touch:**
  - `src/components/AnalyticsProvider.tsx` — call `trackPageView` on `usePathname` change.
  - `src/lib/analytics.test.ts` — add a test that mocks `posthog.capture` and asserts `trackPageView` is invoked on route change.
- **Dependencies:** None.
- **Complexity:** **S**.
- **Risks:** Double-fire on initial render; SSR/CSR mismatch — guard with `useEffect`.

### D.2 — `trackEviMessage` instrumentation (B3)

- **User story:** As a PM, I want to know how often eVi is used and which intents (parse vs suggestion vs voice) dominate.
- **Acceptance criteria:**
  - `trackEviMessage` fires on every user-initiated send from `EVi.tsx` / `useEVi.ts`.
  - Includes properties: `mode: "text" | "voice"`, `input_length`, `locale`.
  - Does NOT fire on eVi's own reply.
- **Files to touch:**
  - `src/hooks/useEVi.ts` — call at the top of the send handler.
  - `src/lib/analytics.test.ts` — extend.
- **Dependencies:** None.
- **Complexity:** **S**.
- **Risks:** Voice-input path is async (Whisper) — confirm trigger point is before transcription completes vs after.

### D.3 — Feedback image upload (B1, B13)

- **User story:** When reporting a station-data error or missing station, I want to attach a photo so the team can verify.
- **Acceptance criteria:**
  - Modal shows an optional "Add photo" button for `STATION_DATA_ERROR`, `MISSING_STATION`, `REPORT_ISSUE` categories.
  - Upload target: Vercel Blob (private bucket).
  - Max 5MB, image/jpeg or image/png only, dimensions normalized server-side.
  - `imageUrl` written to `Feedback.imageUrl`.
  - EXIF stripped server-side.
  - Resend email includes inline thumbnail.
- **Files to touch:**
  - `src/components/feedback/FeedbackImageUpload.tsx` (new)
  - `src/components/feedback/FeedbackModal.tsx` (mount uploader for relevant categories)
  - `src/app/api/feedback/upload/route.ts` (new — Blob upload endpoint, rate-limited)
  - `src/lib/feedback/email.ts` (include image)
  - `src/locales/{en,vi}.json` (5–6 new keys)
- **Dependencies:** Vercel Blob env vars (`BLOB_READ_WRITE_TOKEN`).
- **Complexity:** **M**.
- **Risks:** Image abuse (NSFW, malware); cost. Mitigate with size cap + content-type sniff + per-IP rate limit.

### D.4 — Feedback admin status workflow viewer (B12)

- **User story:** As the PM, I want a private admin page where I can see open feedback and mark items IN_REVIEW / RESOLVED / CLOSED without SQL.
- **Acceptance criteria:**
  - `/admin/feedback` page (gated by a single env-var `ADMIN_TOKEN` query param OR by Basic Auth via middleware).
  - List + filter by category, status, date.
  - Click into a row → see full body, image, route params, mark status, write internal note.
  - Audit trail: `resolvedAt` set automatically.
- **Files to touch:**
  - `src/app/admin/feedback/page.tsx` (server component)
  - `src/app/admin/feedback/[id]/page.tsx`
  - `src/app/api/admin/feedback/[id]/route.ts` (PATCH status)
  - `src/middleware.ts` (extend to gate `/admin/*`)
  - Schema: add `Feedback.adminNote String?`
- **Dependencies:** `ADMIN_TOKEN` env var (no auth provider).
- **Complexity:** **M**.
- **Risks:** Security — must NOT be indexed by Google. Add `robots` noindex + middleware gate.

### D.5 — ADR-0003/0004/0005 execution verification (B4, B5, B6)

- **User story:** As the PM, I want to know whether the 3 deepening ADRs from 2026-05-06 actually shipped, or whether they're decisions-on-paper-only.
- **Acceptance criteria:** A short audit doc (`docs/adr/0003-status.md`, `0004-status.md`, `0005-status.md`) declaring SHIPPED / PARTIAL / NOT-SHIPPED with file:line evidence. For ADRs that turn out NOT-SHIPPED, decide: pursue, or formally close as "decision-only".
- **Files to touch (audit phase only):** 3 status docs under `docs/adr/`.
- **Files to touch (if pursued):** `src/lib/vinfast/*` (ADR-0003); `src/lib/routing/route-planner.ts` + `src/app/api/route/route.ts` (ADR-0004); new `src/lib/evi/evi-trip-extractor.ts` (ADR-0005).
- **Dependencies:** Existing test suite as regression guard.
- **Complexity:** Audit = **S**. Execution if pursued = **L** each.
- **Risks:** Touching the 25KB route handler is the highest-risk single change in the codebase.

### D.6 — Stale README / ARCHITECTURE.md / CHANGELOG refresh (B21–B26)

- **User story:** A new contributor should be able to read the docs and trust them.
- **Acceptance criteria:**
  - `README.md`: test count from baseline, MiMo-primary phrasing, multi-source data pipeline mention.
  - `ARCHITECTURE.md`: rewrite API route list and `src/lib/evi/` block from the actual current tree.
  - `CHANGELOG.md`: backfill v0.9.0+ entries from `git log` (Phase 1–5, MiMo, Whisper, ADR-0006, ADR-0007).
  - `TODOS.md:60`: fix or remove the dangling `edwardpham-main-design-20260322-212855.md` reference.
- **Files to touch:** `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `TODOS.md`.
- **Dependencies:** None.
- **Complexity:** **S**.

### D.7 — Operations hardening (C12–C24)

Bundle of small data-layer / CI fixes. Each fits in its own commit but the work cluster is one session.

- **D.7a — `RouteCache` retention** (C12): add `expiresAt`, nightly prune.
- **D.7b — RECOVERY.md completion** (C13): add EVPower/prices/manual steps + degradation note.
- **D.7c — `.env.example` completion** (C14): document all required env vars.
- **D.7d — `ShortUrl.expiresAt` default** (C15): 1-year default at create.
- **D.7e — `VinFastStationDetail` retention** (C16): 30-day prune in cron.
- **D.7f — `vercel.json crons:`** (C23): wire schedules in source.
- **D.7g — `db:push` guard** (C17): rename + host check.
- **Complexity:** Each **S**, cluster **M**.

### D.8 — Security hardening (C22, C24)

- **D.8a — Rate-limit `/api/transcribe`** (C22): 10 req/min/IP using existing `checkRateLimit` helper.
- **D.8b — Tighten CSP** (C24): move from `'unsafe-inline'` to nonce-based via middleware.
- **Complexity:** D.8a = **S**; D.8b = **M** (regression-test all inline scripts).

### D.9 — CI hardening (C1–C8)

- **D.9a — Branch protection on `main`** (C3): `gh api -X PUT ...` snippet; require `Deploy to Vercel`.
- **D.9b — Cookie-refresh resilience** (C1): retry loop + `domcontentloaded` swap.
- **D.9c — Suppress derivative poll failures** (C2): exit-code differentiation.
- **D.9d — `concurrency:` + `workflow_dispatch:`** (C4, C5).
- **D.9e — Node 22 + `engines.node`** (C6, C26).
- **D.9f — Dependabot config** (C8).
- **D.9g — Smoke-test `release.yml`** (C7) before first tag.
- **Complexity:** Cluster **M**.

### D.10 — DESIGN.md compliance pass (C29–C32)

- **D.10a — Remove `🇻🇳/🌍` from vehicle filter buttons.**
- **D.10b — Remove `🔋/📏/⚡` from selected vehicle card.**
- **D.10c — Fix footer GitHub link.**
- **D.10d — Localize hero `<img alt>`.**
- **D.10e — Resolve `MapLocateButton` hydration warning.**
- **Complexity:** **S** total.

### D.11 — Test coverage for high-value untested files (C27, C28)

| File | Tests to add |
|---|---|
| `src/app/api/transcribe/route.ts` | Happy path, missing/empty audio, >5MB, wrong content-type, rate-limit hit |
| `src/lib/vinfast/vinfast-client.ts` | Auth flow, cookie expiry, fetch retry, error mapping |
| `src/app/api/stations/route.ts` | Filter combinations, bbox limits, pagination edges |
| `src/app/api/route/route.ts` | Happy path (single + multi-waypoint), unreachable destination, rate-limit |
| `src/app/api/feedback/route.ts` | Each category: valid + invalid payloads; rate-limit |

- **Complexity:** **L** (one focused session per file).

### D.12 — Order of implementation (dependency-aware)

1. **D.6 docs refresh** — preserves accuracy as a baseline. Independent.
2. **D.8a rate-limit transcribe** — security P1, no dependencies.
3. **D.7f `vercel.json crons:`** — wires production reliability. Independent.
4. **D.9a branch protection** — single-PR ops change.
5. **D.7b RECOVERY.md** — independent; finishable in 30 min.
6. **D.9b cookie-refresh resilience** — independent; reduces ongoing noise.
7. **D.1 + D.2 telemetry holes** — small, independent.
8. **D.7a + D.7d + D.7e retention** — schema + cron; do together.
9. **D.10 DESIGN.md compliance** — independent.
10. **D.5 ADR-0003/4/5 verification** — must precede any refactor.
11. **D.11 test coverage** — bundle with adjacent feature work.
12. **D.3 + D.4 feedback uploader + admin** — biggest user-facing addition; ship after security/ops are stabilized.
13. **D.8b CSP nonce migration** — last (highest regression risk).

---

## E. QA Test Plan

> **Targets:** Vitest unit/integration in `src/**/*.test.ts(x)`, Playwright E2E in `e2e/**/*.spec.ts`. Manual exploratory QA against `http://localhost:3000` and the staging Vercel URL.
>
> **Conventions:** P0 = release blocker, P1 = ship-blocking unless documented, P2 = pre-launch nice-to-have, P3 = follow-up. Anonymous-user-only app — there is no "authenticated user" or "different roles" axis. "RLS-shaped" tests verify the equivalent: anonymous abuse boundaries (rate limits, server-side IP hashing, no client-supplied identity).
>
> **Mobile viewports to test:** 393×852 (iPhone 14 Pro), 360×800 (Android baseline). **Desktop:** 1440×900. **Browsers:** Chromium primary; Safari + Firefox spot-check.

### E.1 Trip planning

```
Test ID: TC-trip-001
Feature: TripInput form — happy path
Scenario: User plans HCMC → Vũng Tàu with VF8 Eco at 80% battery, default safety factor.
Preconditions: Visit /plan. Page fully hydrated.
Test Steps:
  1. Enter "Quận 1, Hồ Chí Minh" as start.
  2. Enter "Vũng Tàu" as destination.
  3. Pick "VinFast VF8 Eco" from vehicle selector.
  4. Confirm battery at 80%, target arrival 20%, safety factor 0.80.
  5. Tap "Plan Trip".
Test Data: see above.
Expected Result: Within ~5s, map shows route + 0–2 charging stops; TripSummary renders distance, duration, charging time, trip cost. No error toast.
Priority: P0
Type: Functional / E2E
Notes: Covered by e2e/trip-planning.spec.ts — verify still passing.
```

```
Test ID: TC-trip-002
Feature: TripInput — unreachable destination
Scenario: Origin and destination both in Hanoi, vehicle range 100km, dist 4km — should not crash.
Preconditions: /plan.
Test Steps: 1. Enter "Hồ Hoàn Kiếm, Hà Nội" and "Bờ Hồ, Hà Nội". 2. Tap Plan.
Expected Result: Route renders without a charging stop. TripSummary shows "no stop needed" or equivalent.
Priority: P1
Type: Functional / Edge case
```

```
Test ID: TC-trip-003
Feature: TripInput — invalid input (empty fields)
Scenario: Tap Plan with empty origin.
Test Steps: 1. Leave origin empty. 2. Tap Plan.
Expected Result: Inline error on origin field. No API call. Send button stays disabled if implemented that way.
Priority: P1
Type: Validation
```

```
Test ID: TC-trip-004
Feature: Waypoints
Scenario: Add 2 waypoints between HCMC and Đà Lạt.
Test Steps: 1. Enter HCMC → Đà Lạt. 2. Add waypoint "Bảo Lộc". 3. Add waypoint "Đức Trọng". 4. Plan.
Expected Result: Route follows the 4 points in order. TripSummary lists at least 1 charging stop. Multi-waypoint rate-limiter (`routeMultiWaypointLimiter`) does not refuse this single request.
Priority: P1
Type: Functional / E2E
```

```
Test ID: TC-trip-005
Feature: Loop trip toggle
Scenario: Toggle "Loop trip" — destination should clone origin.
Priority: P2
Type: Functional
```

```
Test ID: TC-trip-006
Feature: Rate limit — /api/route
Scenario: Send 30 plan requests in 60 seconds from same IP.
Test Steps: Use a script to POST /api/route 30× in 60s.
Expected Result: After the limiter threshold, response is HTTP 429 with a structured error body.
Priority: P1
Type: Security / Performance
```

```
Test ID: TC-trip-007
Feature: RouteCache hit
Scenario: Plan identical trip twice within the cache window.
Expected Result: Second plan returns from `RouteCache` (verify via server log or response timing — first request 2–5s, second <500ms).
Priority: P2
Type: Performance
```

```
Test ID: TC-trip-008
Feature: OSRM failure → Mapbox fallback
Scenario: Force OSRM to fail (e.g., bad endpoint), verify fallback fires.
Test Steps: 1. In a dev environment, point `OSRM_URL` to a bad host. 2. Plan a trip.
Expected Result: `/api/route` logs a fallback event and still returns a 200 with Mapbox-derived geometry.
Priority: P1
Type: Integration / Resilience
```

```
Test ID: TC-trip-009
Feature: Range safety factor — "very risky" warning at 0.95
Scenario: Set safety factor to 0.95.
Expected Result: getRangeSafetyWarning triggers visible warning copy in both locales.
Priority: P2
Type: Functional / Edge case
```

```
Test ID: TC-trip-010
Feature: Backup pressure — high pressure case
Scenario: Plan a trip where 1 stop has sparse downstream stations + arrives during 11h–13h peak window.
Expected Result: That stop renders with 3 alternatives. Map shows 3 alternative markers. Telemetry event `backup_alternatives_distribution` fires with the bucket value.
Priority: P1
Type: Functional / Integration
```

```
Test ID: TC-trip-011
Feature: Backup pressure — N=0 case
Scenario: Plan a trip where a stop has very low pressure.
Expected Result: That stop's alternatives section shows the N=0 banner ("No alternatives needed" / "Không cần trạm dự phòng").
Priority: P2
Type: Functional
```

```
Test ID: TC-trip-012
Feature: Reliability multiplier applied (ADR-0007)
Scenario: Plan a trip where 1 candidate station has reliability < 0.5 and >100 observations.
Expected Result: Station is demoted in ranking. Verify via telemetry (`station_ranked_reliability_applied`) or server log.
Priority: P1
Type: Integration
```

```
Test ID: TC-trip-013
Feature: Slow network — 3G throttle
Scenario: Throttle to "Slow 3G" in DevTools.
Test Steps: Plan a trip.
Expected Result: Loading state visible >2s; no UI freeze; eventual success or graceful timeout.
Priority: P2
Type: Performance
```

```
Test ID: TC-trip-014
Feature: Concurrent plans (race)
Scenario: Tap "Plan Trip" twice in quick succession.
Expected Result: Only the latest result renders; no stale state from the first request flashes.
Priority: P2
Type: Concurrency
```

### E.2 Map experience

```
Test ID: TC-map-001
Feature: Map mode toggle persists
Scenario: Toggle Mapbox→OSM. Reload.
Expected Result: After reload, map is OSM. Persistence via localStorage. Legacy `google` value silently migrates to `osm`.
Priority: P1
Type: Functional
```

```
Test ID: TC-map-002
Feature: Station marker click → mini-card popup
Scenario: Tap a station marker on the map.
Expected Result: Mini-card opens with name, charger types, "Ask eVi" button. Bilingual copy matches locale toggle.
Priority: P1
Type: Functional / E2E
```

```
Test ID: TC-map-003
Feature: Alternative marker click telemetry
Scenario: Tap an alternative marker.
Expected Result: `alternative_marker_clicked` PostHog event fires with stationId + stopIndex.
Priority: P2
Type: Functional / Integration
```

```
Test ID: TC-map-004
Feature: "Show on Map" from eVi station card
Scenario: In eVi chat, get a station recommendation card. Tap "Show on Map".
Expected Result: Map flies to station; marker pulses briefly. Switching tabs to Map should preserve the highlight.
Priority: P1
Type: Functional / E2E
```

```
Test ID: TC-map-005
Feature: Elevation chart renders
Scenario: After a trip plans, scroll to TripSummary elevation chart.
Expected Result: Chart shows elevation profile. No NaN, no infinite spikes.
Priority: P2
Type: Functional
```

```
Test ID: TC-map-006
Feature: MapLocateButton — permission granted
Scenario: Tap locate button; allow geolocation.
Expected Result: Map pans to user position; "use here as start" affordance appears.
Priority: P1
Type: Functional / E2E
```

```
Test ID: TC-map-007
Feature: MapLocateButton — permission denied
Scenario: Tap locate; deny geolocation.
Expected Result: Friendly localized message; map state unchanged; no console error.
Priority: P1
Type: Functional / Edge case
```

```
Test ID: TC-map-008
Feature: Map hydration on mobile
Scenario: Open /plan on mobile viewport (393×852).
Expected Result: No React hydration warnings in console (current bug per QA-FINDINGS Finding #6).
Priority: P3
Type: Regression
```

### E.3 eVi AI assistant

```
Test ID: TC-evi-001
Feature: NL trip parse — Vietnamese
Scenario: User types "Tôi muốn đi từ Sài Gòn ra Đà Nẵng vào sáng mai, xe VF8 sạc 90%".
Expected Result: eVi extracts origin=HCMC, destination=Đà Nẵng, vehicle=VF8, departTime=morning tomorrow, battery=90%. /api/evi/parse returns structured trip; planner is invoked.
Priority: P0
Type: Functional / E2E
```

```
Test ID: TC-evi-002
Feature: NL trip parse — English
Scenario: Same but in English: "From Saigon to Da Nang tomorrow morning, VF8 at 90% battery".
Priority: P0
Type: Functional / E2E
```

```
Test ID: TC-evi-003
Feature: MiMo unavailable → MiniMax fallback (ADR-0002)
Scenario: Disable XIAOMI_MIMO_API_KEY env temporarily (dev only).
Expected Result: /api/evi/parse uses MiniMax. Server log shows `[llm] provider=minimax fallback=true`.
Priority: P1
Type: Integration / Resilience
```

```
Test ID: TC-evi-004
Feature: Suggestions chips localized
Scenario: Toggle UI to English; trigger a suggestion render.
Expected Result: Suggestion chips appear in English (per fix in commit 2a845fa).
Priority: P1
Type: Functional / i18n
```

```
Test ID: TC-evi-005
Feature: Voice input — Web Speech happy path (Chrome)
Scenario: Tap mic; speak "Đi Vũng Tàu cuối tuần".
Expected Result: Transcript appears; tap send fires the same parse flow.
Priority: P1
Type: Functional / E2E (manual unless Web Speech can be mocked)
```

```
Test ID: TC-evi-006
Feature: Voice input — Web Speech fails → Whisper fallback (Brave)
Scenario: In Brave (Web Speech "network" error), tap mic, speak.
Expected Result: Per commit dcc59e6 — system silently falls back to Whisper STT via /api/transcribe.
Priority: P1
Type: Integration / Resilience
```

```
Test ID: TC-evi-007
Feature: Whisper STT — happy path
Scenario: POST a small audio file to /api/transcribe.
Expected Result: 200 with transcript text.
Priority: P0
Type: Functional / Integration
```

```
Test ID: TC-evi-008
Feature: Whisper STT — abuse boundary (after D.8a rate-limit ships)
Scenario: 50 POSTs to /api/transcribe in 60s from same IP.
Expected Result: HTTP 429 after threshold.
Priority: P1
Type: Security
```

```
Test ID: TC-evi-009
Feature: Whisper STT — oversized payload
Scenario: POST a 10MB audio file.
Expected Result: 413 or 400 with localized error; no Groq call charged.
Priority: P1
Type: Validation / Security
```

```
Test ID: TC-evi-010
Feature: eVi schema-error path
Scenario: Force MiMo to return malformed JSON (mock).
Expected Result: `EVISchemaError` thrown; user sees a friendly retry message; no crash.
Priority: P1
Type: Integration / Error path
```

```
Test ID: TC-evi-011
Feature: eVi narrative endpoint
Scenario: Plan a trip; expand narrative section.
Expected Result: /api/route/narrative streams or returns narrative; content references actual stops by name.
Priority: P2
Type: Functional / Integration
```

```
Test ID: TC-evi-012
Feature: trackEviMessage fires (after D.2 ships)
Scenario: Send any message in eVi.
Expected Result: PostHog `evi_message` event with `mode`, `input_length`, `locale`.
Priority: P1
Type: Telemetry
```

### E.4 Stations data

```
Test ID: TC-station-001
Feature: GET /api/stations — list + filter
Scenario: GET with `province=Hồ Chí Minh`.
Expected Result: 200; ≥1 station; all rows have province == "Hồ Chí Minh".
Priority: P1
Type: Functional / Integration
```

```
Test ID: TC-station-002
Feature: GET /api/stations/nearby — happy path
Scenario: GET with `lat=10.776&lng=106.701&radius=2000`.
Expected Result: 200; stations sorted by distance ascending; haversine math correct within 1%.
Priority: P1
Type: Functional / Integration
```

```
Test ID: TC-station-003
Feature: GET /api/stations/nearby — rate limit
Scenario: 60 GETs in 60s from same IP.
Expected Result: HTTP 429 after threshold.
Priority: P1
Type: Security
```

```
Test ID: TC-station-004
Feature: VinFast detail SSE — happy path
Scenario: GET /api/stations/[validId]/vinfast-detail.
Expected Result: 200 SSE stream; messages contain `connector_status`, `pricing`. Stream closes within 30s.
Priority: P1
Type: Functional / Integration
```

```
Test ID: TC-station-005
Feature: VinFast detail SSE — cookies expired
Scenario: Force VinfastApiCookies row to be expired.
Expected Result: 503 with `cookies_expired` reason; client shows friendly retry; no infinite loop.
Priority: P1
Type: Error path / Resilience
```

```
Test ID: TC-station-006
Feature: Amenities — first lookup (cache miss)
Scenario: GET /api/stations/[stationWithoutPois]/amenities.
Expected Result: Overpass API queried; result cached in `StationPois`; response shape matches schema; subsequent call <500ms.
Priority: P2
Type: Functional / Performance
```

```
Test ID: TC-station-007
Feature: Amenities — Overpass timeout
Scenario: Mock Overpass to time out.
Expected Result: Endpoint returns 200 with empty `pois: []` and a `cache_status: "fresh-failed"` indicator; UI degrades gracefully.
Priority: P2
Type: Resilience
```

```
Test ID: TC-station-008
Feature: StationStatusReport — happy path
Scenario: POST /api/stations/[id]/status-report with `{status: "WORKING"}`.
Expected Result: 200; `{success: true, reportedAt}`; row in `StationStatusReport`; `ChargingStation.lastVerifiedAt` updated.
Priority: P1
Type: Functional (regression — known working per QA-FINDINGS)
```

```
Test ID: TC-station-009
Feature: StationStatusReport — invalid status
Scenario: POST with `{status: "BANANA"}`.
Expected Result: 400 `{success: false, error: "INVALID_STATUS"}`.
Priority: P1
Type: Validation
```

```
Test ID: TC-station-010
Feature: StationStatusReport — non-existent station
Scenario: POST with a made-up stationId.
Expected Result: 404 `{success: false, error: "STATION_NOT_FOUND"}`.
Priority: P1
Type: Validation
```

```
Test ID: TC-station-011
Feature: StationStatusReport — `lastVerifiedAt` update rule
Scenario: Report a station as WORKING then as BROKEN.
Expected Result: First call updates `lastVerifiedAt`; second call does NOT (per business rule).
Priority: P1
Type: Functional / Business rule
```

```
Test ID: TC-station-012
Feature: StationStatusReport — rate limit
Scenario: 20 POSTs in 60s.
Expected Result: HTTP 429 after threshold; no DB write past limit.
Priority: P1
Type: Security
```

```
Test ID: TC-station-013
Feature: Status polling cron handler — auth
Scenario: POST /api/cron/poll-station-status without `Authorization: Bearer $CRON_SECRET`.
Expected Result: 401; no DB write.
Priority: P0
Type: Security
```

```
Test ID: TC-station-014
Feature: Status polling cron handler — happy path
Scenario: POST with valid bearer.
Expected Result: 200; new `StationStatusObservation` rows for any station whose status changed since last observation; rows match dedup-on-change rule.
Priority: P0
Type: Integration
```

```
Test ID: TC-station-015
Feature: Reliability aggregation — happy path
Scenario: POST /api/cron/aggregate-reliability with valid bearer.
Expected Result: 200; for each station with ≥100 observations in last 30 days, `StationReliability` row updated; reliability = (ACTIVE+BUSY)/total.
Priority: P0
Type: Integration
```

```
Test ID: TC-station-016
Feature: Popularity aggregation — happy path
Scenario: POST /api/cron/aggregate-popularity.
Expected Result: 200; `StationPopularity` upserts; observations older than 90 days pruned.
Priority: P0
Type: Integration
```

```
Test ID: TC-station-017
Feature: VinFast cookie refresh script — Playwright resilience (after D.9b)
Scenario: Simulate vinfastauto.com networkidle timeout.
Expected Result: Retry loop fires 2–3 times; success on first stable load; or graceful exit on persistent failure.
Priority: P1
Type: Resilience / CI
```

### E.5 Feedback

```
Test ID: TC-feedback-001
Feature: POST /api/feedback — REPORT_ISSUE happy path
Scenario: Submit full payload.
Expected Result: 200; row in DB; Resend email queued.
Priority: P1
Type: Functional / Integration
```

```
Test ID: TC-feedback-002
Feature: POST /api/feedback — MISSING_STATION with proposedLatitude
Scenario: Submit MISSING_STATION with valid coords.
Expected Result: 200; `Feedback.proposedLatitude/Longitude/Provider` populated.
Priority: P1
Type: Functional / Validation
```

```
Test ID: TC-feedback-003
Feature: POST /api/feedback — invalid category
Scenario: Submit `{category: "BANANA"}`.
Expected Result: 400 Zod validation error.
Priority: P1
Type: Validation
```

```
Test ID: TC-feedback-004
Feature: POST /api/feedback — rate limit
Scenario: 10 submissions in 60s.
Expected Result: HTTP 429.
Priority: P1
Type: Security
```

```
Test ID: TC-feedback-005
Feature: IP hashing
Scenario: Submit feedback; query DB.
Expected Result: `ipHash` is a 64-char hex string; raw IP nowhere in DB or logs.
Priority: P0
Type: Security
```

```
Test ID: TC-feedback-006
Feature: Image upload (after D.3 ships) — JPEG happy path
Scenario: Submit STATION_DATA_ERROR with a 1MB JPEG.
Expected Result: 200; `imageUrl` populated; image accessible via signed URL.
Priority: P1
Type: Functional / Integration
```

```
Test ID: TC-feedback-007
Feature: Image upload — oversized
Scenario: Submit a 10MB image.
Expected Result: 413 or 400 before upload completes.
Priority: P1
Type: Validation / Security
```

```
Test ID: TC-feedback-008
Feature: Image upload — wrong type
Scenario: Submit a .exe file renamed to .jpg.
Expected Result: Rejected based on magic-number sniff, not extension.
Priority: P1
Type: Security
```

```
Test ID: TC-feedback-009
Feature: Admin panel auth (after D.4 ships) — unauthorized
Scenario: GET /admin/feedback without ADMIN_TOKEN.
Expected Result: 401 or redirect.
Priority: P0
Type: Security
```

```
Test ID: TC-feedback-010
Feature: Admin panel — status update
Scenario: PATCH /api/admin/feedback/[id] with `{status: "RESOLVED"}` + valid token.
Expected Result: 200; `resolvedAt` populated; `status` updated.
Priority: P1
Type: Functional
```

```
Test ID: TC-feedback-011
Feature: Admin panel — robots noindex
Scenario: View page source of /admin/feedback.
Expected Result: `<meta name="robots" content="noindex,nofollow">` present.
Priority: P1
Type: Security / SEO
```

### E.6 Sharing

```
Test ID: TC-share-001
Feature: Short URL create
Scenario: Plan a trip; tap Share.
Expected Result: 200; `/s/[code]` opens the same trip.
Priority: P1
Type: Functional / E2E
```

```
Test ID: TC-share-002
Feature: Short URL — invalid code
Scenario: Visit /s/abc123xyz (nonexistent).
Expected Result: 404 page or graceful "link not found" UI.
Priority: P1
Type: Validation
```

```
Test ID: TC-share-003
Feature: Short URL — rate limit (per-min + per-hour)
Scenario: Create 30 short URLs in 60s.
Expected Result: HTTP 429.
Priority: P1
Type: Security
```

```
Test ID: TC-share-004
Feature: OG share-card — happy path
Scenario: GET /api/share-card?code=xxx.
Expected Result: 200; PNG image with route preview; correct VND cost rendering.
Priority: P2
Type: Functional / Integration
```

```
Test ID: TC-share-005
Feature: OG share-card — rate limit
Scenario: 10 requests in 60s.
Expected Result: HTTP 429.
Priority: P2
Type: Security
```

```
Test ID: TC-share-006
Feature: ShortUrl.expiresAt enforcement (after D.7d ships)
Scenario: Create a short URL; manually expire it in DB; visit.
Expected Result: 410 Gone or friendly localized "expired" page.
Priority: P2
Type: Validation
```

### E.7 Cost & energy

```
Test ID: TC-cost-001
Feature: Trip cost — VF8 Eco HCMC→Vũng Tàu
Scenario: Plan that trip.
Expected Result: TripSummary shows VND amount for electricity, gasoline equivalent, savings; numbers within 5% of computed (per QA-FINDINGS evidence).
Priority: P1
Type: Functional
```

```
Test ID: TC-cost-002
Feature: Vietnamese number formatting
Scenario: Inspect rendered VND amounts.
Expected Result: "." as thousands separator (e.g., "78.120 ₫"), not "," — per QA-FINDINGS.
Priority: P1
Type: i18n / Validation
```

```
Test ID: TC-cost-003
Feature: V-GREEN free-charging applied for VinFast owners
Scenario: Plan a trip with a VinFast vehicle.
Expected Result: Cost calc reflects free V-GREEN until 2029 per README marker block.
Priority: P1
Type: Business rule
```

```
Test ID: TC-cost-004
Feature: Energy-price daily sync — locale labels
Scenario: After daily price sync, README markers update.
Expected Result: `<!-- ENERGY_PRICES_START -->` block parses cleanly in en/vi.
Priority: P3
Type: Integration / Docs
```

### E.8 i18n

```
Test ID: TC-i18n-001
Feature: Locale toggle
Scenario: Toggle VI→EN→VI.
Expected Result: All visible UI text switches; no untranslated keys (`station_report_*`, `trip_cost_*`, etc., all flip).
Priority: P1
Type: Functional / E2E
```

```
Test ID: TC-i18n-002
Feature: en.json + vi.json key parity
Scenario: Run `npm test -- src/lib/__tests__/locale-keys.test.ts`.
Expected Result: PASS — all keys present in both files.
Priority: P0
Type: Static / CI
```

```
Test ID: TC-i18n-003
Feature: document.title syncs with locale
Scenario: Toggle EN; observe browser tab title.
Expected Result: Title is in English (per commit 4cb834c).
Priority: P1
Type: Functional / Regression
```

```
Test ID: TC-i18n-004
Feature: Hero image alt localizes (after D.10d ships)
Scenario: Toggle EN.
Expected Result: `<img alt="...">` is English.
Priority: P3
Type: a11y / i18n
```

### E.9 Analytics

```
Test ID: TC-analytics-001
Feature: PostHog gating — no key in dev
Scenario: Run dev server without `NEXT_PUBLIC_POSTHOG_KEY`.
Expected Result: Console quiet; no network calls to PostHog; no init.
Priority: P1
Type: Security / Privacy
```

```
Test ID: TC-analytics-002
Feature: PostHog gating — key present, NODE_ENV=development
Scenario: Set key, run `npm run dev`.
Expected Result: Still no init (gated on production).
Priority: P1
Type: Privacy
```

```
Test ID: TC-analytics-003
Feature: trackPageView fires (after D.1 ships)
Scenario: Navigate / → /plan → /s/[code].
Expected Result: 3 distinct `$pageview` events in PostHog.
Priority: P1
Type: Telemetry
```

```
Test ID: TC-analytics-004
Feature: trackTripPlanned event
Scenario: Plan a trip.
Expected Result: PostHog event with vehicle, distance, charging-stop count, locale.
Priority: P2
Type: Telemetry
```

```
Test ID: TC-analytics-005
Feature: backup_alternatives_distribution event (ADR-0006)
Scenario: Plan a trip with ≥1 charging stop.
Expected Result: Event fires with bucket distribution.
Priority: P2
Type: Telemetry
```

### E.10 Mobile / PWA / responsive

```
Test ID: TC-mobile-001
Feature: MobileBottomSheet snap points
Scenario: On 393×852 viewport, drag sheet to half/full/dismiss.
Expected Result: All 3 snap points hit cleanly; no momentum overshoot.
Priority: P1
Type: Functional / UX
```

```
Test ID: TC-mobile-002
Feature: MobileTabBar — tap each tab
Scenario: Cycle Map / Trip / eVi / Vehicle.
Expected Result: Each tab activates; route param updates if applicable.
Priority: P1
Type: Functional / E2E (existing coverage)
```

```
Test ID: TC-mobile-003
Feature: DesktopTabBar at 1440×900
Scenario: Open /plan on desktop.
Expected Result: Tabs render horizontally; no MobileBottomSheet visible.
Priority: P1
Type: Responsive
```

```
Test ID: TC-mobile-004
Feature: Haptics on mobile (real device only)
Scenario: Tap a Plan button on iPhone Safari.
Expected Result: Light haptic tap. Falls back silently on desktop.
Priority: P3
Type: Functional / Hardware
```

```
Test ID: TC-mobile-005
Feature: Manifest.json
Scenario: Inspect manifest.
Expected Result: Required fields present; icons paths resolve; passes `npm test -- pwa-manifest.test.ts`.
Priority: P1
Type: Static / CI
```

### E.11 Security / abuse boundaries

```
Test ID: TC-sec-001
Feature: CSRF — GET cannot mutate
Scenario: GET /api/feedback, /api/short-url, /api/route, /api/stations/[id]/status-report.
Expected Result: Each returns 405 Method Not Allowed (or equivalent), no DB write.
Priority: P0
Type: Security
```

```
Test ID: TC-sec-002
Feature: IP hash unspoofable
Scenario: Send POST with crafted `X-Forwarded-For: 1.1.1.1` header.
Expected Result: Stored `ipHash` reflects the Vercel-edge IP, not the spoofed header (because `x-vercel-forwarded-for` is preferred).
Priority: P1
Type: Security
```

```
Test ID: TC-sec-003
Feature: Cron auth — invalid bearer
Scenario: POST any /api/cron/* with `Authorization: Bearer wrong`.
Expected Result: 401; no work performed.
Priority: P0
Type: Security
```

```
Test ID: TC-sec-004
Feature: Cron auth — missing bearer
Scenario: POST any /api/cron/* with no Authorization header.
Expected Result: 401.
Priority: P0
Type: Security
```

```
Test ID: TC-sec-005
Feature: Cron auth — timing attack resistance
Scenario: Probe with bearers of increasing prefix length.
Expected Result: All comparisons take constant time (`timingSafeEqual`).
Priority: P2
Type: Security
```

```
Test ID: TC-sec-006
Feature: CSP header present
Scenario: GET / and check response headers.
Expected Result: `Content-Security-Policy` header present; `Strict-Transport-Security` present with sufficient max-age.
Priority: P0
Type: Security
```

```
Test ID: TC-sec-007
Feature: dangerouslySetInnerHTML JSON-LD escape
Scenario: Inspect rendered HTML of /.
Expected Result: JSON-LD script tag closes properly; no `</script>` breakout possible from data (currently static, but verify).
Priority: P1
Type: Security
```

```
Test ID: TC-sec-008
Feature: No service_role or secrets on client (re-verify after each PR)
Scenario: Run `grep` for known secret patterns in built `.next/` output.
Expected Result: 0 hits.
Priority: P0
Type: Security / CI
```

```
Test ID: TC-sec-009
Feature: Rate limiter degrade in production
Scenario: In production, temporarily unset UPSTASH_REDIS_REST_URL.
Expected Result: Server logs `[SECURITY]` error; in-memory fallback runs but cannot be relied on cross-instance.
Priority: P1
Type: Security / Resilience
```

```
Test ID: TC-sec-010
Feature: `/admin/feedback` is noindex (after D.4)
Scenario: Inspect HTML.
Expected Result: `noindex` meta tag.
Priority: P1
Type: Security / SEO
```

### E.12 Operations / CI

```
Test ID: TC-ops-001
Feature: deploy.yml — green path
Scenario: Push to main.
Expected Result: Unit + E2E + Vercel deploy all pass; new deployment created.
Priority: P0
Type: CI
```

```
Test ID: TC-ops-002
Feature: deploy.yml — schema-drift check
Scenario: Push a PR that changes `prisma/schema.prisma` destructively (drop a column).
Expected Result: After D.7g/D.7f ships, CI flags the destructive change.
Priority: P1
Type: CI
```

```
Test ID: TC-ops-003
Feature: Branch protection (after D.9a)
Scenario: `git push --force origin main`.
Expected Result: Rejected by GitHub.
Priority: P0
Type: Security
```

```
Test ID: TC-ops-004
Feature: Cron schedule wiring (after D.7f)
Scenario: Inspect `vercel.json`; deploy; check Vercel dashboard cron list.
Expected Result: 3 crons listed and active.
Priority: P0
Type: Ops
```

```
Test ID: TC-ops-005
Feature: Cookie refresh resilience (after D.9b)
Scenario: Force vinfastauto.com to be slow in a manual GHA replay.
Expected Result: Workflow succeeds via retry; `VinfastApiCookies` row refreshed.
Priority: P1
Type: CI / Resilience
```

```
Test ID: TC-ops-006
Feature: Poll-status workflow downgrade (after D.9c)
Scenario: Simulate cookies_expired during a refresh failure.
Expected Result: Poll workflow runs but does not fail the run; alarm volume drops ~50%.
Priority: P2
Type: CI / Observability
```

```
Test ID: TC-ops-007
Feature: RouteCache retention (after D.7a)
Scenario: Insert rows with `createdAt = now - 91 days`; run prune cron.
Expected Result: Stale rows deleted; row count drops; index health preserved.
Priority: P1
Type: Data lifecycle
```

```
Test ID: TC-ops-008
Feature: RECOVERY.md correctness (after D.7b)
Scenario: Follow recovery doc on a blank Postgres DB.
Expected Result: All 4 data sources seeded; reliability/popularity caveat noted.
Priority: P1
Type: Manual / Disaster recovery
```

### E.13 Visual / design system

```
Test ID: TC-design-001
Feature: No decorative emoji in interactive UI (after D.10a/b)
Scenario: Audit /plan vehicle filter buttons + selected vehicle card.
Expected Result: No emoji per CLAUDE.md "Less Icons, More Humanity".
Priority: P3
Type: Design / Manual
```

```
Test ID: TC-design-002
Feature: DESIGN.md color tokens enforced
Scenario: Spot-check primary/secondary buttons across pages.
Expected Result: All match DESIGN.md palette; no off-palette grays.
Priority: P3
Type: Design / Manual
```

```
Test ID: TC-design-003
Feature: Footer GitHub link (after D.10c)
Scenario: Click footer GitHub icon.
Expected Result: Lands on https://github.com/duypham9895/evoyage, not 404.
Priority: P2
Type: Regression
```

```
Test ID: TC-design-004
Feature: Touch-target ≥44px on mobile
Scenario: Inspect tap targets on TripInput, eVi FAB, station markers.
Expected Result: All ≥44×44 CSS px per 2026-03-19 mobile UX audit.
Priority: P2
Type: a11y / Manual
```

### E.14 Test-suite hygiene

```
Test ID: TC-suite-001
Feature: Vitest baseline
Scenario: `npm test`.
Expected Result: 1237+ passing, 0 failures, <15s.
Priority: P0
Type: CI
```

```
Test ID: TC-suite-002
Feature: Playwright baseline
Scenario: `npm run test:e2e` on Desktop Chrome.
Expected Result: 19 passing in <60s.
Priority: P0
Type: CI
```

```
Test ID: TC-suite-003
Feature: Build green
Scenario: `npx next build`.
Expected Result: Exit 0; no TypeScript errors (current baseline 106 from IMPROVEMENTS-REPORT.md is the ceiling).
Priority: P0
Type: CI
```

---

## F. Execution Roadmap

> Each task is numbered. Tasks within a phase are roughly independent unless noted. **Approval gate** between Phase 1 and Phase 2.

### Phase 1 — P0 fixes (CI/CD + security) — target 1 session

1. **D.9a** Enable branch protection on `main` (require `Deploy to Vercel`, block force-push). 1-line `gh api` command + GitHub UI confirmation.
2. **D.8a** Add rate limit to `/api/transcribe` mirroring `evi/parse`. Add `TC-evi-008` + `TC-evi-009` tests.
3. **D.7f** Wire `vercel.json` `crons:` array for the 3 cron handlers. Capture current cron-job.org schedules first; document the swap.
4. **D.7c** Backfill `.env.example` with all required env vars.
5. **D.7b** Update `docs/RECOVERY.md` to cover EVPower/prices/manual + degradation note.
6. **D.6** README + ARCHITECTURE.md + CHANGELOG + TODOS.md refresh.

### Phase 2 — Complete in-progress features — target 2–3 sessions

7. **D.1** `trackPageView` instrumentation + test (`TC-analytics-003`).
8. **D.2** `trackEviMessage` instrumentation + test (`TC-evi-012`).
9. **D.10a–e** DESIGN.md compliance pass: emoji removal, footer link, alt localization, hydration fix.
10. **D.7a** `RouteCache` retention (schema field + prune step).
11. **D.7d** `ShortUrl.expiresAt` default at create.
12. **D.7e** `VinFastStationDetail` retention prune.
13. **D.9b** Cookie-refresh resilience (`networkidle` → `domcontentloaded` + retry).
14. **D.9c** Suppress derivative poll failures when refresh is the actual problem.
15. **D.9d** Add `concurrency:` + `workflow_dispatch:` to deploy and crawl workflows.
16. **D.9e** Bump CI Node to 22; add `engines.node` to package.json.
17. **D.9f** Add `.github/dependabot.yml`.
18. **D.7g** Rename `db:push` → `db:push:local` with host guard.
19. **C19** Wrap `poll-status.ts:91` JSON parse in `safeJsonParse`.

### Phase 3 — Build missing features — target 3–5 sessions

20. **D.5** Audit ADR-0003/0004/0005 status; write `0003-status.md` / `0004-status.md` / `0005-status.md`; decide pursue-vs-close.
21. (If pursued in D.5) Execute ADR-0004 — extract route handler into TripPlanner Module. Highest-risk single change. Branch + isolated review.
22. (If pursued) Execute ADR-0003 — VinFast detail Module deepening.
23. (If pursued) Execute ADR-0005 — EviTripExtractor Module.
24. **D.3** Feedback image upload UI + Blob endpoint + email inline (covers TC-feedback-006/7/8).
25. **D.4** Admin panel for feedback workflow (covers TC-feedback-009/10/11).
26. **D.8b** Tighten CSP — nonce-based via middleware; full smoke-test for inline-script regressions.

### Phase 4 — QA execution against test plan — target 1–2 sessions

27. Execute all P0 + P1 cases in §E from a fresh `npm install`.
28. Manual exploratory pass on 393×852, 360×800, 1440×900 across Chrome/Safari/Firefox.
29. Triage findings into a follow-up issue in `duypham9895/evoyage`.

### Phase 5 — Polish + docs — target 1 session

30. **D.11** Add tests for the 5 untested high-value files (`vinfast-client`, `api/transcribe`, `api/stations`, `api/route`, `api/feedback`).
31. Final pass on README/CHANGELOG to reflect everything shipped in Phases 1–4.
32. Bump `package.json` version; tag `v0.9.0`; verify `release.yml` extracts CHANGELOG correctly (`TC-suite-003` + `C7`).
33. Backfill any retro learnings into `.context/retros/` or a new `docs/retros/2026-05-audit-fixup.md`.

---

## Sign-off

This document is **discovery + plan only**. No code changed during its production. Awaiting your approval before starting **Phase 1 — task 1**.

If you want changes — re-prioritize, split, or add scope — reply with the deltas and I'll revise this doc before any implementation begins.
