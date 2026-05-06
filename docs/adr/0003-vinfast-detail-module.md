# Deepened VinFastDetail Module owns 4-tier fallback, stage emission, and concurrent-fetch dedup

Decided 2026-05-06 during architectural review (`/improve-codebase-architecture`).

## Context

VinFast station detail today is fetched through three Adapters — impit HTTP (`src/lib/vinfast/vinfast-client.ts`), Playwright headless (`src/lib/vinfast/vinfast-browser.ts`), and an hourly-poller cache (`src/lib/station/vinfast-api-client.ts` writing to Prisma). The 212-line SSE route handler at `src/app/api/stations/[id]/vinfast-detail/route.ts` orchestrates a 4-tier fallback (fresh DB cache → live impit/Playwright → stale DB cache → basic Station row), emits SSE stages between transitions, and decides cache freshness inline. Adapter selection knowledge leaks into the route handler; concurrent requests for the same station ID race each other through Cloudflare.

## Decision

Replace the orchestration logic in the route handler with a deepened `VinFastDetail` Module:

- **Owns all 4 tiers.** Returns a typed `Result` discriminated union: `{ kind: 'fresh' | 'live' | 'stale', detail }` or `{ kind: 'basic_only', station }`. Throws only if the station ID itself is unknown.
- **Stage emission via `onStage(stage)` callback** — closed enum (`cache_hit`, `live_fetch_impit`, `live_fetch_playwright`, `stale_cache`, `db_fallback`, `complete`). Streaming callers pass an SSE-emitting callback; non-streaming callers pass a no-op.
- **In-process Promise dedup on the live tier.** A `Map<stationId, Promise<Result>>` of in-flight live-fetches; concurrent requests for the same ID subscribe to the existing Promise. Map entry deleted post-resolution.
- **Cache freshness fixed at Module-internal default** (~1hr TTL matching poller cadence) — no per-call override surface.

The hourly poller (`vinfast-api-client.ts`) stays *outside* the Module as the cache **producer**. Module is the **consumer**.

## Why

Concentrating Adapter selection, cache policy, and stage meaning in one Module produces **Locality** — adding a fourth source (e.g. a public scraped dataset) becomes a Module-internal change instead of a route-handler edit. The dedup payoff is concrete: popular Vincom stations under burst load currently trigger N parallel Cloudflare requests, increasing block risk and wasting Playwright budget. Typed `Result` makes "no detail, station exists" a routine state instead of a thrown error every caller has to catch.

## Considered alternatives

- **Module returns final detail; handler infers stages from before/after timing** (option A). Rejected: handler would need to peek at Module-internal Adapter selection to know which stage to emit. That's the Seam leakage we're fixing.
- **Module is an `AsyncIterable` yielding stages** (option C). Rejected: couples the Module to streaming-aware callers. The hourly poller is a non-streaming caller — async iteration adds drain ceremony for no benefit.
- **Cross-Vercel-instance dedup** (Redis or DB row-locking). Rejected: in-process dedup catches the most common case (user double-click, React StrictMode double-render, retries within one warm function) at near-zero complexity. Cross-instance is a separate problem if/when it bites.
- **Throw on `basic_only` instead of returning typed Result.** Rejected: newly-crawled stations without poller-fetched detail is a frequent, expected state — forcing every caller to catch this is bad ergonomics.

## Consequences

- Route handler `vinfast-detail/route.ts` shrinks from 212 lines to ~30–50 lines (validation + SSE wire-format only).
- The Module imports Prisma. That's *less* coupling than today, where three files import Prisma for VinFast reasons — one Module is concentration.
- Stage enum is the SSE event-name contract. Treat it as a public API of the Module; renaming a stage is a breaking change for SSE consumers.
- If a fourth source is added (e.g. a fallback to OpenStreetMap detail), it slots in as a new internal tier without changing the Module's external Interface.
