# VinFast Real-Time Station Detail with SSE Streaming

**Date:** 2026-03-19
**Status:** Approved
**Author:** Duy + Claude

## Problem

The current station detail flow uses a 24-hour DB cache as the primary data source. Users see stale connector data (availability, power levels, EVSE status). Additionally, stations without a pre-seeded `entity_id` mapping silently return no detail (`fallback: true`), creating a completeness gap.

## Goals

1. **Freshness** — Always fetch real-time OCPI data from VinFast API (`vinfastauto.com/vn_en/get-locator/{entity_id}`)
2. **Completeness** — Every VinFast station should have a path to detail data, even between cron runs
3. **Progressive UX** — Stream real backend progress to the user (like Claude/ChatGPT thinking indicators) instead of a frozen spinner

## Non-Goals

- Pre-warming detail cache via cron (out of scope)
- Replacing the finaldivision.com data source for station list
- Changing the station list/map UI

## Architecture Overview

```
User clicks "Details"
  │
  ├─ Frontend: EventSource('/api/stations/{id}/vinfast-detail')
  │
  ├─ API: Rate limit check (20/min/IP)
  │
  ├─ API: Resolve entity_id
  │    ├─ station.entityId exists → use it
  │    └─ null → fetch finaldivision.com → find by store_id → save mapping
  │
  ├─ SSE: { stage: "connecting" }
  │
  ├─ API: Cloudflare bypass chain
  │    ├─ Try impit (5s timeout) → SSE: { stage: "fetching", method: "impit" }
  │    └─ Fail → Playwright (12s timeout) → SSE: { stage: "retrying" }
  │
  ├─ SSE: { stage: "parsing" }
  │
  ├─ API: Parse OCPI response
  │
  ├─ API: Upsert to VinFastStationDetail (emergency fallback only)
  │
  └─ SSE: { stage: "done", detail: {...} }
```

## Section 1: API Layer — SSE Stream Endpoint

### Endpoint

`GET /api/stations/[id]/vinfast-detail`

Returns `text/event-stream` instead of `application/json`.

### SSE Protocol

```
data: {"stage":"connecting","message":"Đang kết nối VinFast..."}

data: {"stage":"fetching","method":"impit","message":"Đang tải dữ liệu trạm sạc..."}

data: {"stage":"retrying","method":"playwright","message":"Đang thử phương thức khác..."}

data: {"stage":"parsing","message":"Đang xử lý dữ liệu..."}

data: {"stage":"done","detail":{...full OCPI data...},"cached":false}

data: {"stage":"error","message":"Không thể tải dữ liệu","code":"CF_BLOCKED"}
```

### Required SSE Response Headers

For SSE to stream properly on Vercel (avoiding response buffering):

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

### Route Segment Config

```typescript
export const maxDuration = 25; // Requires Vercel Pro plan for >10s
export const dynamic = 'force-dynamic';
```

### Key Changes from Current Route

- Remove 24h cache check — always fetch fresh from VinFast
- Keep DB upsert after success (emergency fallback only, not primary source). Upsert is fire-and-forget (not awaited) since it's only for emergency fallback
- Simplify entity_id resolution: use `station.entityId` directly
- Return `ReadableStream` with SSE format (Next.js API routes support this natively)
- Rate limit checked before stream starts
- Vercel function timeout: 25s via `maxDuration` (requires Pro plan)

### Emergency Fallback

If both impit and Playwright fail, return last-known cached data with `stale: true` flag:

```
data: {"stage":"done","detail":{...},"cached":true,"stale":true,"message":"Dữ liệu cũ"}
```

## Section 2: Cloudflare Bypass Strategy

### Tested Results (2026-03-19)

| Method | Headless? | Result | Latency |
|--------|-----------|--------|---------|
| `curl` with headers | N/A | 403 blocked | - |
| Playwright Chromium headless | Yes | 403 blocked | - |
| Playwright Chromium headless + stealth | Yes | 403 blocked | - |
| Playwright Chromium **headed** | No | **200 success** | ~14s |
| Playwright `channel: 'chrome'` headless | Yes | **200 success** | ~12.5s |

### Execution Chain

**Local development (Mac):**

```
1. Try impit (timeout: 5s)
   ├── Success → parse → done
   └── Fail →
2. Playwright with channel: 'chrome' headless (timeout: 15s)
   ├── Step A: Visit locator page, wait for CF cookies (~12s)
   ├── Step B: In-page fetch get-locator/{entity_id} (~200ms)
   └── Success → parse → done
```

**Vercel production (Linux serverless):**

```
1. Try impit (timeout: 5s) — works on Linux with native bindings
   ├── Success → parse → done
   └── Fail →
2. Playwright with @sparticuz/chromium + stealth plugin (timeout: 12s)
   ├── Uses serverless-optimized Chromium with anti-detection patches
   ├── Step A: Visit locator page, harvest CF cookies
   ├── Step B: In-page fetch with those cookies
   └── Fail → return stale cache or error
```

### Browser Session Reuse (Burst Optimization)

Module-level singleton holds Playwright browser context + CF cookies. This is a **burst traffic optimization**, not a guaranteed warm path — Vercel may recycle Lambda containers after seconds of inactivity.

- Reused within the same container's warm invocations
- Auto-invalidated after 15 minutes (CF cookie expiry)
- **Realistic expectations**: Most requests will hit impit (5s). Playwright cold starts (~12s) are the fallback. Warm Playwright (~200ms) only occurs during burst traffic on the same container.

### Chromium Binary Strategy

**Local development (Mac):**
- `playwright` (devDependency) with `channel: 'chrome'` uses system Chrome
- Falls back to headed Chromium if system Chrome unavailable

**Vercel production (Linux serverless):**
- `playwright-core` (production dependency) — headless-only, no browser downloads
- `@sparticuz/chromium` (production dependency) — serverless-optimized Chromium binary
- Conditional import: detect environment and load the appropriate Chromium path

```typescript
async function getChromiumBrowser() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const pw = await import('playwright-core');
    return pw.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local dev: use system Chrome
  const { chromium } = await import('playwright');
  return chromium.launch({ channel: 'chrome', headless: true });
}
```

### Serverless Constraints (Vercel)

- `@sparticuz/chromium` binary: ~50MB (fits 250MB function bundle limit)
- Memory requirement: 512MB — configured via `vercel.json` `functions` config
- Requires **Vercel Pro plan** for `maxDuration > 10s`
- Cold start adds ~2-3s, then warm for ~5min within same container

## Section 3: Frontend — Progressive SSE UI

### State Machine

```
idle → connecting → fetching → parsing → done
                 ↘ retrying ↗         ↘ error
```

### Visual Treatment Per Stage

**Connecting** (`"Đang kết nối VinFast..."`)
- Animated pulsing dot + status text
- Skeleton placeholders for connectors/images sections

**Fetching** (`"Đang tải dữ liệu trạm sạc..."`)
- Indeterminate progress bar with animated gradient (like Claude's thinking)
- Skeleton with subtle shimmer animation

**Retrying** (`"Đang thử phương thức khác..."`)
- Progress bar pauses, status text updates smoothly
- No jarring transition

**Parsing** (`"Đang xử lý dữ liệu..."`)
- Progress bar jumps to ~80%
- Skeletons begin fading out

**Done**
- Progress bar fills to 100%, fades out
- Real data slides in with 150ms fade-in
- Connectors, hardware, images render with staggered 50ms delays

**Error**
- Progress bar turns red, fades
- Compact error message
- "Thử lại sau" with 30s cooldown timer
- If stale cache available: show data with "Dữ liệu cũ" badge

### SSE Client Code

Use `fetch()` + `ReadableStream` instead of native `EventSource` for better control (no auto-reconnect, supports `AbortController` for cleanup):

```tsx
const abortController = new AbortRef(new AbortController());

useEffect(() => {
  return () => abortController.current.abort(); // cleanup on unmount
}, []);

async function streamDetail() {
  if (stage !== 'idle' && stage !== 'done' && stage !== 'error') return; // guard against double-click

  const ctrl = new AbortController();
  abortController.current = ctrl;

  const res = await fetch(`/api/stations/${stationId}/vinfast-detail`, {
    signal: ctrl.signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Parse SSE lines
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const match = line.match(/^data: (.+)$/m);
      if (!match) continue;
      const { stage, message, detail, stale } = JSON.parse(match[1]);
      setStage(stage);
      setMessage(message);
      if (detail) { setDetail(detail); setIsStale(!!stale); }
    }
  }
}
```

### UX Decisions

- Indeterminate progress (no percentage) — honest when timing is unpredictable
- Status messages are real (tied to actual backend stages), not cosmetic timers
- Staggered content reveal makes the result feel rich
- No immediate retry button — CF bypass won't improve on retry within seconds
- `AbortController` cancels server-side fetch when user navigates away or collapses panel
- Double-click guard: check current stage before opening new stream
- Stale data shows age ("Cập nhật 3 ngày trước") not just a binary badge

## Section 4: Entity ID Resolution

### Current (Broken for New Stations)

```
ChargingStation.ocmId → strip "vinfast-" → storeId
→ query VinFastStationDetail by storeId → get entityId
→ if not found: return { detail: null, fallback: true } ← DEAD END
```

### Proposed (Direct + Live Fallback)

```
ChargingStation.entityId → use directly (populated by cron)
→ if null: derive storeId from ocmId
  → fetch finaldivision.com list → find entity_id by store_id match
  → save entityId back to ChargingStation (one-time cost)
→ if still null: stream error "station not mapped"
```

### Why This Is Better

- Eliminates 2-hop DB lookup — `entityId` already on `ChargingStation`
- New stations between cron runs get a live fallback via finaldivision.com (no Cloudflare)
- No more silent `fallback: true` dead ends
- Finaldivision.com list is ~2MB compressed — acceptable for occasional fallback
- Cache finaldivision.com response in-memory for 1 hour to avoid repeated 2MB downloads for multiple unmapped stations

## Section 5: Cache Strategy Changes

### Before (Cache-First)

- 24h DB cache as primary source
- Fresh fetch only when cache is stale
- No data if entity_id mapping missing

### After (Fresh-First)

- Always fetch fresh from VinFast API
- DB cache serves only as emergency fallback (both fetch methods fail)
- Stale data shown with visual indicator ("Dữ liệu cũ" badge)
- Browser session cache for CF cookies (15min TTL, module-level singleton)

### What We Remove

- `CACHE_TTL_MS` (24h cache check as primary source)
- `findEntityId()` function (replaced by direct `station.entityId` read)
- 2-hop `ocmId → storeId → entityId` lookup

Note: `VinFastStationDetail` table is kept — only the TTL-based check-first logic is removed. The table continues to serve as emergency fallback storage. The `storeId` derivation from `ocmId` is retained only for the finaldivision.com fallback path when `entityId` is null.

### What We Keep

- Rate limiting (20/min/IP via Upstash Redis)
- SSRF guard on entityId (`/^[a-zA-Z0-9_-]{1,64}$/`)
- Response size guard (100KB)
- DB upsert after success (for emergency fallback)
- Image URL validation (vinfastauto.com domain only)

## Files to Modify

| File | Change |
|------|--------|
| `src/app/api/stations/[id]/vinfast-detail/route.ts` | Rewrite: SSE stream, remove cache-first, simplify entity_id resolution, add fallback chain |
| `src/lib/vinfast-client.ts` | Add Playwright bypass method, browser session singleton, keep impit as first attempt |
| `src/components/StationDetailExpander.tsx` | Rewrite: EventSource client, progressive UI with skeleton/shimmer/stages, stale badge |
| `package.json` | Move `playwright-core` to dependencies, add `@sparticuz/chromium` to dependencies, keep `playwright` in devDependencies |
| `vercel.json` | Configure `functions` with 512MB memory for the detail API route |
| `src/locales/en.json` / `vi.json` | Add stage message keys: `station_detail_connecting`, `station_detail_fetching`, `station_detail_retrying`, `station_detail_parsing`, `station_detail_stale_prefix` |

## Dependencies

- `playwright` (devDependency, already installed v1.58.2 — local dev only)
- `playwright-core` (new production dependency — headless-only, no browser downloads)
- `impit` (already installed v0.11.0)
- `@sparticuz/chromium` (new production dependency — serverless Chromium for Vercel)

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Cloudflare changes detection | impit → Playwright fallback chain; emergency DB cache |
| Vercel cold start latency | Browser session reuse; SSE streams progress so user isn't staring at nothing |
| Vercel function timeout (25s) | impit 5s + Playwright 12s = 17s max, leaves 8s margin for entity resolution + parsing + upsert. DB upsert is fire-and-forget. Requires Vercel Pro plan. |
| finaldivision.com API down | Only used for entity_id fallback; most stations already have entityId from cron |
| High memory usage | Configure 512MB in vercel.json; Playwright closes after 30s idle |
