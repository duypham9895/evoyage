# VinFast Real-Time Station Detail SSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 24h cache-first station detail flow with always-fresh VinFast API calls streamed via SSE, with progressive UI feedback.

**Architecture:** The API route becomes an SSE stream endpoint emitting stage events (connecting → fetching → retrying → parsing → done/error). The VinFast client gains a Playwright fallback for Cloudflare bypass. The frontend uses `fetch()` + `ReadableStream` with skeleton/shimmer animations per stage.

**Tech Stack:** Next.js 16 API routes, Server-Sent Events (ReadableStream), Playwright (`playwright-core` + `@sparticuz/chromium` for Vercel), impit (existing), React state machine, Tailwind CSS animations.

**Spec:** `docs/superpowers/specs/2026-03-19-vinfast-realtime-detail-sse-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/vinfast-client.ts` | Modify | Add Playwright bypass, browser session cache, keep impit. Export `fetchVinFastDetailWithProgress()` that accepts a stage callback. |
| `src/lib/vinfast-browser.ts` | Create | Playwright browser singleton + CF cookie cache. Conditional Chromium loading (local vs Vercel). |
| `src/app/api/stations/[id]/vinfast-detail/route.ts` | Rewrite | SSE stream endpoint. Remove cache-first. Direct `entityId` resolution. Fire-and-forget DB upsert. |
| `src/lib/vinfast-entity-resolver.ts` | Create | Entity ID resolution: direct read → finaldivision.com fallback. In-memory cache for finaldivision list. |
| `src/components/StationDetailExpander.tsx` | Rewrite | `fetch()` + ReadableStream SSE client. Progressive UI with skeleton, shimmer, stage messages, stale badge. |
| `src/components/StationDetailSkeleton.tsx` | Create | Skeleton/shimmer placeholder component for loading states. |
| `src/locales/en.json` | Modify | Add SSE stage message keys. |
| `src/locales/vi.json` | Modify | Add SSE stage message keys. |
| `src/types/index.ts` | Modify | Add SSE event types, remove dead `VinFastDetailResponse`. |
| `package.json` | Modify | Add `playwright-core` and `@sparticuz/chromium` to dependencies. |
| `vercel.json` | Modify | Add functions config for memory. |

**Design decisions:**
- Server SSE events emit **stage codes only** (no message text). Frontend maps stages to i18n keys via `t('station_detail_${stage}')`. Error events include a `code` field.
- `VinFastStationDetail` (from vinfast-client.ts) is the canonical type used across SSE and frontend. The old `VinFastStationDetail`/`VinFastDetailResponse` types become dead code and are removed from `src/types/index.ts`.
- `HardwareSection` now renders **all** hardware stations (intentional improvement over the previous `[0]`-only behavior).

---

## Task 1: Add Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

```bash
npm install playwright-core @sparticuz/chromium
```

- [ ] **Step 2: Verify package.json has them in dependencies (not devDependencies)**

```bash
cat package.json | grep -A2 'playwright-core\|sparticuz'
```

Expected: Both appear under `"dependencies"`.

- [ ] **Step 3: Update vercel.json with function memory config**

In `vercel.json`, add functions config alongside existing crons:

```json
{
  "functions": {
    "src/app/api/stations/[id]/vinfast-detail/route.ts": {
      "memory": 512
    }
  },
  "crons": [
    { "path": "/api/cron/refresh-stations", "schedule": "0 0 * * *" },
    { "path": "/api/cron/refresh-vinfast", "schedule": "0 1 * * *" }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vercel.json
git commit -m "chore: add playwright-core and @sparticuz/chromium for VinFast CF bypass"
```

---

## Task 2: Create Playwright Browser Singleton

**Files:**
- Create: `src/lib/vinfast-browser.ts`

- [ ] **Step 1: Create the browser singleton module**

This module handles:
- Conditional Chromium loading (Vercel vs local dev)
- Browser context reuse with 15-minute CF cookie expiry
- Anti-detection (`navigator.webdriver = false`)
- Graceful cleanup on idle

```typescript
// src/lib/vinfast-browser.ts
import type { Browser, BrowserContext } from 'playwright-core';

const LOCATOR_PAGE = 'https://vinfastauto.com/vn_en/tim-kiem-showroom-tram-sac';
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const IDLE_CLEANUP_MS = 30 * 1000; // 30 seconds

interface BrowserSession {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly createdAt: number;
}

let session: BrowserSession | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function isSessionValid(): boolean {
  if (!session) return false;
  return Date.now() - session.createdAt < SESSION_TTL_MS;
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (session) {
      await session.browser.close().catch(() => {});
      session = null;
    }
  }, IDLE_CLEANUP_MS);
}

async function launchBrowser(): Promise<Browser> {
  const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isVercel) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const pw = await import('playwright-core');
    return pw.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  // Local dev: use system Chrome via playwright (devDependency)
  const { chromium } = await import('playwright');
  return chromium.launch({ channel: 'chrome', headless: true });
}

async function createSession(): Promise<BrowserSession> {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  // Anti-headless detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Visit locator page to harvest CF cookies
  const page = await context.newPage();
  await page.goto(LOCATOR_PAGE, { waitUntil: 'networkidle', timeout: 12_000 });
  await page.close();

  return { browser, context, createdAt: Date.now() };
}

/**
 * Fetch VinFast detail using Playwright with CF cookie reuse.
 * Returns parsed JSON or null if blocked/failed.
 */
export async function fetchWithPlaywright(
  entityId: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  try {
    if (signal?.aborted) return null;

    if (!isSessionValid()) {
      if (session) await session.browser.close().catch(() => {});
      session = await createSession();
    }

    resetIdleTimer();

    const page = await session!.context.newPage();

    try {
      const result = await page.evaluate(
        async (eid: string) => {
          const res = await fetch(`/vn_en/get-locator/${eid}`, {
            headers: {
              Accept: 'application/json, text/javascript, */*; q=0.01',
              'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
          });

          if (!res.ok) return null;

          const text = await res.text();
          if (text.includes('IM_UNDER_ATTACK') || text.includes('challenge-platform')) {
            return null;
          }

          return JSON.parse(text);
        },
        entityId,
      );

      return result as Record<string, unknown> | null;
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    console.error('Playwright fetch error:', err);
    // Invalidate session on error
    if (session) {
      await session.browser.close().catch(() => {});
      session = null;
    }
    return null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/lib/vinfast-browser.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/vinfast-browser.ts
git commit -m "feat: add Playwright browser singleton for VinFast CF bypass"
```

---

## Task 3: Create Entity ID Resolver

**Files:**
- Create: `src/lib/vinfast-entity-resolver.ts`

- [ ] **Step 1: Create the entity resolver module**

This handles:
- Direct `station.entityId` read (fast path)
- Finaldivision.com fallback with 1-hour in-memory cache
- Persist discovered entityId back to ChargingStation

```typescript
// src/lib/vinfast-entity-resolver.ts
import { prisma } from '@/lib/prisma';

const FINALDIVISION_URL = 'https://api.service.finaldivision.com/stations/charging-stations';
const FINALDIVISION_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface FinalDivisionStation {
  readonly entity_id: string;
  readonly store_id: string;
}

let cachedStations: readonly FinalDivisionStation[] | null = null;
let cachedAt = 0;

async function fetchFinalDivisionList(): Promise<readonly FinalDivisionStation[]> {
  if (cachedStations && Date.now() - cachedAt < FINALDIVISION_CACHE_TTL_MS) {
    return cachedStations;
  }

  const res = await fetch(FINALDIVISION_URL, {
    headers: { 'Accept-Encoding': 'gzip' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`finaldivision.com returned ${res.status}`);
  }

  const data = (await res.json()) as readonly FinalDivisionStation[];
  cachedStations = data;
  cachedAt = Date.now();
  return data;
}

/**
 * Resolve VinFast entity_id for a ChargingStation.
 *
 * Fast path: read station.entityId directly.
 * Fallback: query finaldivision.com by store_id, persist mapping.
 */
export async function resolveEntityId(stationId: string): Promise<{
  readonly entityId: string | null;
  readonly storeId: string | null;
}> {
  const station = await prisma.chargingStation.findUnique({
    where: { id: stationId },
    select: { entityId: true, storeId: true, ocmId: true },
  });

  if (!station) return { entityId: null, storeId: null };

  // Fast path: entityId already populated by cron
  if (station.entityId) {
    return { entityId: station.entityId, storeId: station.storeId ?? null };
  }

  // Derive storeId from ocmId
  const storeId = station.ocmId?.startsWith('vinfast-')
    ? station.ocmId.replace('vinfast-', '')
    : station.storeId ?? null;

  if (!storeId) return { entityId: null, storeId: null };

  // Fallback: query finaldivision.com
  try {
    const stations = await fetchFinalDivisionList();
    const match = stations.find((s) => s.store_id === storeId);

    if (match) {
      // Persist mapping for future fast-path
      await prisma.chargingStation.update({
        where: { id: stationId },
        data: { entityId: match.entity_id },
      }).catch(() => {}); // fire-and-forget

      return { entityId: match.entity_id, storeId };
    }
  } catch (err) {
    console.error('finaldivision.com fallback failed:', err);
  }

  return { entityId: null, storeId };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/vinfast-entity-resolver.ts
git commit -m "feat: add entity ID resolver with finaldivision.com fallback"
```

---

## Task 4: Update VinFast Client with Progress Callbacks

**Files:**
- Modify: `src/lib/vinfast-client.ts`

- [ ] **Step 1: Add progress callback type and update fetchVinFastDetail**

Keep existing `parseDetailResponse`, `parseConnectorStandard`, `parseResponse`, all interfaces. Add a new `fetchVinFastDetailWithProgress` function that:
- Accepts a `onStage` callback for SSE events
- Tries impit first (5s timeout)
- Falls back to Playwright (12s timeout)
- Returns the parsed detail or null

Add at the bottom of `vinfast-client.ts`:

```typescript
import { fetchWithPlaywright } from './vinfast-browser';

export type StageCallback = (stage: string, message: string, method?: string) => void;

/**
 * Fetch VinFast detail with progress callbacks for SSE streaming.
 * Chain: impit (5s) → Playwright (12s) → null.
 */
export async function fetchVinFastDetailWithProgress(
  entityId: string,
  onStage: StageCallback,
  signal?: AbortSignal,
): Promise<VinFastStationDetail | null> {
  // Try impit first
  onStage('fetching', 'Đang tải dữ liệu trạm sạc...', 'impit');
  const impit = await tryLoadImpit();

  if (impit) {
    const result = await fetchWithImpit(impit, entityId);
    if (result) return result;
  }

  if (signal?.aborted) return null;

  // Fallback: Playwright
  onStage('retrying', 'Đang thử phương thức khác...', 'playwright');
  const raw = await fetchWithPlaywright(entityId, signal);

  if (!raw) return null;

  return parseDetailResponse(raw);
}
```

- [ ] **Step 2: Update impit timeout to 5s**

In `fetchWithStandardFetch`, change `AbortSignal.timeout(15_000)` to `AbortSignal.timeout(5_000)`.

In `fetchWithImpit`, wrap with a 5s race:

```typescript
async function fetchWithImpit(
  impit: any,
  entityId: string,
): Promise<VinFastStationDetail | null> {
  try {
    const result = await Promise.race([
      fetchWithImpitInner(impit, entityId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
    ]);
    return result;
  } catch {
    return null;
  }
}
```

Rename the current `fetchWithImpit` body to `fetchWithImpitInner`.

- [ ] **Step 3: Keep the existing `fetchVinFastDetail` for backward compatibility**

The cron job or other callers may still use the old function. Keep it as-is, or have it delegate to the new one with a no-op callback:

```typescript
export async function fetchVinFastDetail(
  entityId: string,
): Promise<VinFastStationDetail | null> {
  return fetchVinFastDetailWithProgress(entityId, () => {});
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/vinfast-client.ts
git commit -m "feat: add progress callbacks and Playwright fallback to VinFast client"
```

---

## Task 5: Rewrite API Route as SSE Stream

**Files:**
- Modify: `src/app/api/stations/[id]/vinfast-detail/route.ts`

- [ ] **Step 1: Rewrite the route handler**

Replace the entire file with the SSE stream implementation:

```typescript
// src/app/api/stations/[id]/vinfast-detail/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchVinFastDetailWithProgress } from '@/lib/vinfast-client';
import { resolveEntityId } from '@/lib/vinfast-entity-resolver';

export const maxDuration = 25;
export const dynamic = 'force-dynamic';

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: stationId } = await params;

  // Validate stationId format (CUID)
  if (!/^[a-z0-9]{20,36}$/.test(stationId)) {
    return new Response(sseEvent({ stage: 'error', message: 'Invalid station ID', code: 'INVALID_ID' }), {
      status: 400,
      headers: sseHeaders(),
    });
  }

  // Rate limit: 20 req/min per IP
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`vinfast-detail:${ip}`, 20, 60_000);
  if (!limit.allowed) {
    return new Response(
      sseEvent({ stage: 'error', message: 'Too many requests', code: 'RATE_LIMITED' }),
      { status: 429, headers: { ...sseHeaders(), 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  // Find station
  const station = await prisma.chargingStation.findUnique({
    where: { id: stationId },
  });

  if (!station) {
    return new Response(sseEvent({ stage: 'error', message: 'Station not found', code: 'NOT_FOUND' }), {
      status: 404,
      headers: sseHeaders(),
    });
  }

  if (!station.isVinFastOnly) {
    return new Response(
      sseEvent({ stage: 'error', message: 'Detail only available for VinFast stations', code: 'NOT_VINFAST' }),
      { status: 400, headers: sseHeaders() },
    );
  }

  // Stream the response
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) => {
        controller.enqueue(new TextEncoder().encode(sseEvent(data)));
      };

      try {
        // Stage: resolving entity ID (no message — frontend uses i18n)
        emit({ stage: 'connecting' });

        const { entityId } = await resolveEntityId(stationId);

        if (!entityId) {
          emit({ stage: 'error', code: 'NO_ENTITY_ID' });
          controller.close();
          return;
        }

        // Validate entityId format (SSRF prevention)
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(entityId)) {
          emit({ stage: 'error', code: 'INVALID_ENTITY_ID' });
          controller.close();
          return;
        }

        // Fetch with progress (stage callbacks send codes only)
        const detail = await fetchVinFastDetailWithProgress(
          entityId,
          (stage, _message, method) => emit({ stage, method }),
          request.signal,
        );

        if (detail) {
          emit({ stage: 'parsing' });

          // Fire-and-forget DB upsert for emergency fallback
          const serialized = JSON.stringify(detail);
          if (serialized.length <= 100_000) {
            const storeId = station.ocmId?.startsWith('vinfast-')
              ? station.ocmId.replace('vinfast-', '')
              : station.storeId ?? station.id;

            prisma.vinFastStationDetail.upsert({
              where: { entityId },
              update: { storeId, detail: serialized, fetchedAt: new Date() },
              create: { entityId, storeId, detail: serialized, fetchedAt: new Date() },
            }).catch(() => {}); // fire-and-forget
          }

          emit({ stage: 'done', detail, cached: false });
        } else {
          // Try emergency fallback from DB cache
          const storeId = station.ocmId?.startsWith('vinfast-')
            ? station.ocmId.replace('vinfast-', '')
            : station.storeId ?? station.id;

          const cached = await prisma.vinFastStationDetail.findFirst({
            where: { storeId },
          });

          if (cached && cached.detail !== '{}') {
            const staleAgeMs = Date.now() - cached.fetchedAt.getTime();
            emit({
              stage: 'done',
              detail: JSON.parse(cached.detail),
              cached: true,
              stale: true,
              staleAgeMs,
            });
          } else {
            emit({ stage: 'error', code: 'CF_BLOCKED' });
          }
        }
      } catch (err) {
        console.error('VinFast SSE stream error:', err);
        emit({ stage: 'error', code: 'INTERNAL_ERROR' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stations/[id]/vinfast-detail/route.ts
git commit -m "feat: rewrite VinFast detail API as SSE stream endpoint"
```

---

## Task 6: Create Skeleton Component

**Files:**
- Create: `src/components/StationDetailSkeleton.tsx`

- [ ] **Step 1: Create the skeleton/shimmer component**

```tsx
// src/components/StationDetailSkeleton.tsx
'use client';

interface StationDetailSkeletonProps {
  readonly message: string;
  /** 0-100 approximate progress for visual indicator */
  readonly progress: number;
}

function ShimmerBlock({ className }: { className: string }) {
  return (
    <div
      className={`${className} bg-[var(--color-surface-hover)] rounded animate-pulse`}
    />
  );
}

export default function StationDetailSkeleton({
  message,
  progress,
}: StationDetailSkeletonProps) {
  return (
    <div className="space-y-2 text-xs">
      {/* Progress bar */}
      <div className="h-1 w-full bg-[var(--color-surface)] rounded overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
          style={{ width: progress > 0 ? `${progress}%` : '30%' }}
        >
          {progress === 0 && (
            <div className="h-full w-full bg-gradient-to-r from-transparent via-[var(--color-accent)] to-transparent animate-[shimmer_1.5s_infinite]" />
          )}
        </div>
      </div>

      {/* Status message with pulsing dot */}
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
        <span className="text-[10px] text-[var(--color-muted)]">{message}</span>
      </div>

      {/* Connector skeleton */}
      <div className="space-y-1">
        <ShimmerBlock className="h-3 w-24" />
        <ShimmerBlock className="h-6 w-full" />
        <ShimmerBlock className="h-6 w-full" />
      </div>

      {/* Hardware skeleton */}
      <ShimmerBlock className="h-3 w-32" />

      {/* Image skeleton */}
      <div className="flex gap-2">
        <ShimmerBlock className="w-20 h-14 shrink-0" />
        <ShimmerBlock className="w-20 h-14 shrink-0" />
        <ShimmerBlock className="w-20 h-14 shrink-0" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StationDetailSkeleton.tsx
git commit -m "feat: add skeleton/shimmer loading component for station detail"
```

---

## Task 7: Add Locale Keys and SSE Types

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/vi.json`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add SSE stage keys to en.json**

Add after the existing `station_detail_no_data` line:

```json
"station_detail_connecting": "Connecting to VinFast...",
"station_detail_fetching": "Loading station data...",
"station_detail_retrying": "Trying alternative method...",
"station_detail_parsing": "Processing data...",
"station_detail_stale": "Old data (updated {{time}})",
"station_detail_retry_after": "Try again in {{seconds}}s",
```

- [ ] **Step 2: Add SSE stage keys to vi.json**

Add after the existing `station_detail_no_data` line:

```json
"station_detail_connecting": "Đang kết nối VinFast...",
"station_detail_fetching": "Đang tải dữ liệu trạm sạc...",
"station_detail_retrying": "Đang thử phương thức khác...",
"station_detail_parsing": "Đang xử lý dữ liệu...",
"station_detail_stale": "Dữ liệu cũ (cập nhật {{time}})",
"station_detail_retry_after": "Thử lại sau {{seconds}}s",
```

- [ ] **Step 3: Update SSE types in src/types/index.ts**

Remove the old `VinFastDetailResponse` and `VinFastStationDetailData` types. Add SSE event types:

```typescript
// Add to src/types/index.ts — replace VinFastDetailResponse/VinFastStationDetailData with:
import type { VinFastStationDetail } from '@/lib/vinfast-client';

export type SSEStage = 'connecting' | 'fetching' | 'retrying' | 'parsing' | 'done' | 'error';

export interface SSEStageEvent {
  readonly stage: 'connecting' | 'fetching' | 'retrying' | 'parsing';
  readonly method?: string;
}

export interface SSEDoneEvent {
  readonly stage: 'done';
  readonly detail: VinFastStationDetail;
  readonly cached: boolean;
  readonly stale?: boolean;
  readonly staleAgeMs?: number;
}

export interface SSEErrorEvent {
  readonly stage: 'error';
  readonly code: string;
}

export type SSEEvent = SSEStageEvent | SSEDoneEvent | SSEErrorEvent;
```

- [ ] **Step 4: Commit**

```bash
git add src/locales/en.json src/locales/vi.json src/types/index.ts
git commit -m "feat: add SSE stage locale keys and event types"
```

---

## Task 8: Rewrite StationDetailExpander with SSE Client

**Files:**
- Modify: `src/components/StationDetailExpander.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file. Key changes:
- `fetch()` + `ReadableStream` instead of `res.json()`
- State machine: `idle | connecting | fetching | retrying | parsing | done | error`
- `AbortController` for cleanup
- Double-click guard
- Staggered content reveal
- Stale data badge with age
- 30s cooldown timer on error

```tsx
// src/components/StationDetailExpander.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocale } from '@/lib/locale';
import type { VinFastStationDetail } from '@/lib/vinfast-client';
import StationDetailSkeleton from './StationDetailSkeleton';

interface StationDetailExpanderProps {
  readonly stationId: string;
  readonly stationProvider: string;
}

type Stage = 'idle' | 'connecting' | 'fetching' | 'retrying' | 'parsing' | 'done' | 'error';

const STAGE_PROGRESS: Record<Stage, number> = {
  idle: 0,
  connecting: 10,
  fetching: 30,
  retrying: 50,
  parsing: 80,
  done: 100,
  error: 0,
};

const RETRY_COOLDOWN_MS = 30_000;

function formatStaleAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ConnectorSection({ evses }: { evses: VinFastStationDetail['evses'] }) {
  const { t } = useLocale();

  if (evses.length === 0) return null;

  return (
    <div className="space-y-1 animate-fadeIn">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">
        {t('station_section_connectors')}
      </p>
      {evses.map((evse, i) => (
        <div
          key={i}
          className="flex items-center gap-2 bg-[var(--color-surface)] rounded px-2 py-1 animate-fadeIn"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <span className="w-4 h-4 rounded bg-[var(--color-surface-hover)] text-[10px] font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <div className="flex flex-wrap gap-1">
            {evse.connectors.map((c, j) => (
              <span key={j} className="text-[var(--color-foreground)]">
                {t('station_connector', {
                  type: c.standard.replace('IEC_62196_', ''),
                  power: String(Math.round(c.max_electric_power / 1000)),
                })}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HardwareSection({
  hardwareStations,
}: {
  hardwareStations: VinFastStationDetail['hardwareStations'];
}) {
  const { t } = useLocale();

  if (hardwareStations.length === 0) return null;

  return (
    <div className="text-[var(--color-muted)] animate-fadeIn">
      {hardwareStations.map((hw, i) => (
        <div key={i}>
          {t('station_hardware', { vendor: hw.vendor, model: hw.modelCode })}
        </div>
      ))}
    </div>
  );
}

function ImagesSection({ images }: { images: VinFastStationDetail['images'] }) {
  const { t } = useLocale();

  if (images.length === 0) return null;

  return (
    <div className="space-y-1 animate-fadeIn" style={{ animationDelay: '100ms' }}>
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">
        {t('station_section_images')}
      </p>
      <div className="flex gap-2 overflow-x-auto">
        {images.slice(0, 3).map((img, i) => (
          <img
            key={i}
            src={img.url}
            alt={`Station photo ${i + 1}`}
            className="w-20 h-14 object-cover rounded shrink-0"
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}

function LastUpdatedRow({ fetchedAt }: { fetchedAt: string }) {
  const { t } = useLocale();

  const formatted = (() => {
    try {
      return new Date(fetchedAt).toLocaleString();
    } catch {
      return fetchedAt;
    }
  })();

  return (
    <div className="text-[10px] text-[var(--color-muted)] animate-fadeIn">
      {t('station_last_updated', { time: formatted })}
    </div>
  );
}

function DetailContent({
  detail,
  isStale,
  staleAge,
}: {
  detail: VinFastStationDetail;
  isStale: boolean;
  staleAge: number;
}) {
  const { t } = useLocale();

  return (
    <div className="space-y-2 text-xs">
      {isStale && (
        <div className="text-[10px] px-2 py-0.5 bg-yellow-500/10 text-yellow-600 rounded inline-block">
          {t('station_detail_stale', { time: formatStaleAge(staleAge) })}
        </div>
      )}
      <ConnectorSection evses={detail.evses} />
      <HardwareSection hardwareStations={detail.hardwareStations} />
      <ImagesSection images={detail.images} />
      <LastUpdatedRow fetchedAt={detail.fetchedAt} />
    </div>
  );
}

export default function StationDetailExpander({
  stationId,
  stationProvider,
}: StationDetailExpanderProps) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState<VinFastStationDetail | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [staleAge, setStaleAge] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Only render for VinFast stations
  if (stationProvider !== 'VinFast') return null;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Cooldown timer for error state
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          setStage('idle');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const isStreaming = stage === 'connecting' || stage === 'fetching' || stage === 'retrying' || stage === 'parsing';

  const handleToggle = useCallback(async () => {
    if (expanded && stage === 'done') {
      setExpanded(false);
      return;
    }

    // Reuse existing detail
    if (detail !== null && stage === 'done') {
      setExpanded(true);
      return;
    }

    // Guard: don't open new stream while one is active
    if (isStreaming) return;

    // Guard: cooldown after error
    if (stage === 'error' && cooldownRemaining > 0) return;

    // Start SSE stream
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStage('connecting');
    setExpanded(true);

    try {
      const res = await fetch(`/api/stations/${stationId}/vinfast-detail`, {
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        setStage('error');
        setMessage(t('station_detail_temp_unavailable'));
        setCooldownRemaining(RETRY_COOLDOWN_MS / 1000);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/m);
          if (!match) continue;

          try {
            const event = JSON.parse(match[1]);

            if (event.stage) {
              setStage(event.stage as Stage);
              // Map stage to i18n key (server sends codes only)
              const stageKey = `station_detail_${event.stage}`;
              setMessage(t(stageKey));
            }

            if (event.detail) {
              setDetail(event.detail as VinFastStationDetail);
              setIsStale(!!event.stale);
              setStaleAge(event.staleAgeMs ?? 0);
            }

            if (event.stage === 'error') {
              setCooldownRemaining(RETRY_COOLDOWN_MS / 1000);
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStage('error');
        setMessage(t('station_detail_temp_unavailable'));
        setCooldownRemaining(RETRY_COOLDOWN_MS / 1000);
      }
    }
  }, [stationId, expanded, stage, detail, isStreaming, cooldownRemaining, t]);

  const buttonLabel = isStreaming
    ? t('station_detail_loading')
    : expanded && stage === 'done'
      ? t('station_detail_collapse')
      : t('station_detail_expand');

  const isButtonDisabled = isStreaming || (stage === 'error' && cooldownRemaining > 0);

  return (
    <div>
      <div className="inline-flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={isButtonDisabled}
          className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {buttonLabel}
        </button>

        {stage === 'error' && cooldownRemaining > 0 && (
          <span className="text-[10px] text-[var(--color-danger)]/60 italic">
            {t('station_detail_retry_after', { seconds: String(cooldownRemaining) })}
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 p-2 bg-[var(--color-surface-hover)]/50 rounded">
          {isStreaming && (
            <StationDetailSkeleton
              message={message}
              progress={STAGE_PROGRESS[stage]}
            />
          )}
          {stage === 'done' && detail !== null && (
            <DetailContent detail={detail} isStale={isStale} staleAge={staleAge} />
          )}
          {stage === 'error' && !detail && (
            <div className="text-[10px] text-[var(--color-danger)]/60 italic p-2">
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add fadeIn animation to Tailwind config**

Check if a global CSS file already has the fadeIn keyframes. If not, add to `src/app/globals.css`:

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.animate-fadeIn {
  animation: fadeIn 150ms ease-out forwards;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/components/StationDetailExpander.tsx src/components/StationDetailSkeleton.tsx src/app/globals.css
git commit -m "feat: rewrite StationDetailExpander with SSE streaming and progressive UI"
```

---

## Task 9: Unit Tests

**Files:**
- Create: `src/lib/__tests__/vinfast-entity-resolver.test.ts`
- Create: `src/lib/__tests__/sse-utils.test.ts`

- [ ] **Step 1: Create entity resolver tests**

Test the `resolveEntityId` logic with mocked Prisma:

```typescript
// src/lib/__tests__/vinfast-entity-resolver.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    chargingStation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { resolveEntityId } from '../vinfast-entity-resolver';
import { prisma } from '@/lib/prisma';

describe('resolveEntityId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns entityId directly when station has it', async () => {
    vi.mocked(prisma.chargingStation.findUnique).mockResolvedValue({
      entityId: '191675',
      storeId: 'C.DTH10348',
      ocmId: 'vinfast-C.DTH10348',
    } as never);

    const result = await resolveEntityId('test-station-id');
    expect(result.entityId).toBe('191675');
  });

  it('returns null when station not found', async () => {
    vi.mocked(prisma.chargingStation.findUnique).mockResolvedValue(null);

    const result = await resolveEntityId('nonexistent');
    expect(result.entityId).toBeNull();
  });

  it('derives storeId from ocmId when entityId is null', async () => {
    vi.mocked(prisma.chargingStation.findUnique).mockResolvedValue({
      entityId: null,
      storeId: null,
      ocmId: 'vinfast-C.HNO0009',
    } as never);

    // This will attempt finaldivision.com fallback - mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { entity_id: '12345', store_id: 'C.HNO0009' },
      ]),
    });
    vi.mocked(prisma.chargingStation.update).mockResolvedValue({} as never);

    const result = await resolveEntityId('test-id');
    expect(result.entityId).toBe('12345');
    expect(result.storeId).toBe('C.HNO0009');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm run test -- src/lib/__tests__/vinfast-entity-resolver.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/vinfast-entity-resolver.test.ts
git commit -m "test: add unit tests for VinFast entity ID resolver"
```

---

## Task 10: Integration Test — End-to-End Verification

**Files:**
- All modified files

- [ ] **Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run existing tests**

```bash
npm run test
```

Expected: All existing tests pass (no regressions).

- [ ] **Step 3: Run local dev server and test manually**

```bash
npm run dev
```

1. Open the app in browser
2. Plan a trip that includes a VinFast charging stop
3. Click "Details" on a VinFast station card
4. Verify:
   - Skeleton/shimmer appears immediately
   - Status messages update progressively (connecting → fetching → parsing → done)
   - Connector data appears with staggered animation
   - Images and hardware info render
   - Collapse/expand works after data loaded
   - Clicking "Details" on a second station while first is loading does not break

- [ ] **Step 4: Test error/fallback scenarios**

1. Disconnect wifi → click Details → verify error state with cooldown timer
2. Wait for cooldown → verify button re-enables
3. Reconnect wifi → click Details → verify it works

- [ ] **Step 5: Build for production**

```bash
npm run build
```

Expected: Build succeeds without errors.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add src/lib/ src/components/ src/app/api/stations/
git commit -m "fix: address integration test findings"
```

---

## Task 11: Push and Deploy

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

- [ ] **Step 2: Verify Vercel deployment succeeds**

Check Vercel dashboard or:

```bash
vercel --prod
```

- [ ] **Step 3: Test on production**

Open `https://evoyagevn.vercel.app`, plan a trip with VinFast stop, click "Details", verify SSE streaming works end-to-end.
