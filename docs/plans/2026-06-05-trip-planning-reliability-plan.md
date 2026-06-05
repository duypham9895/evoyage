# Trip Planning Reliability Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trip planning reliable enough that a normal user does not see repeated failed attempts when planning an EV route.

**Architecture:** Keep the current Next.js route API and routing modules, but make the hot path deterministic, cache-aware, and cheaper. The first fix is to reduce station query payload size, then remove unnecessary geocoding, add OSRM route caching, soften frontend timeout behavior, and close two state-machine edge cases that create avoidable failed submits.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Supabase Postgres, OSRM, Nominatim, Mapbox Directions, Vitest, Playwright.

---

## Executive Summary

The current trip planner can fail several times because the frontend aborts route calculation at `10_000ms`, while the backend regularly lands near that boundary. The strongest measured bottleneck is not OSRM itself; it is the station candidate query in `/api/route` fetching full `ChargingStation` rows, including large fields that the planner does not use.

Measured HCM to Da Lat route during investigation:

| Scenario | Result |
|---|---:|
| Current route API | `9790ms` |
| Instrumented current route API | `10043ms` |
| Frontend abort timeout | `10000ms` |
| Same route with station `select` simulated | `4419ms` |

Instrumented current route API stage timings:

| Stage | Time |
|---|---:|
| Nominatim origin geocode | `377ms` |
| Nominatim destination geocode | `417ms` |
| OSRM route call | `811ms` |
| `prisma.chargingStation.findMany` | `8149ms` |
| `prisma.stationReliability.findMany` | `348ms` |

The immediate fix should be surgical: fetch only the station columns needed by the planner. That one change was simulated in memory and reduced the route to `4419ms`. Follow-up work should make the route path coordinate-first, cache OSRM routes, and improve frontend timeout semantics so a slow but successful response is not presented as failure.

## Problem Statement

Users expect route planning to feel like a core navigation action. Repeated failures destroy trust because the app appears unreliable exactly when the user is planning a real drive.

Current failure pattern:

1. User fills start, end, vehicle, and battery details.
2. UI sends `POST /api/route`.
3. Frontend starts a hard `10_000ms` abort timer.
4. Backend may still be calculating or just about to return success.
5. Frontend aborts and shows a retry-oriented timeout banner.
6. User retries, creating more load and moving toward route rate limit.

This is not acceptable for production UX. The app should return quickly for common routes, stay honest during long calculations, and avoid asking the user to retry work that may already be completing successfully.

## Confirmed Evidence

### Backend Hot Path Fetches Too Much Station Data

`src/app/api/route/route.ts` currently queries full station rows:

```ts
const dbStations = await prisma.chargingStation.findMany({
  where: {
    latitude: { gte: minLat, lte: maxLat },
    longitude: { gte: minLng, lte: maxLng },
  },
});
```

The route planner later maps only these fields:

```ts
id, name, address, province, latitude, longitude,
chargerTypes, connectorTypes, portCount, maxPowerKw,
stationType, isVinFastOnly, operatingHours, provider,
chargingStatus, parkingFee
```

`prisma/schema.prisma` shows `ChargingStation` also contains metadata fields such as `rawData`, `entityId`, `stationCode`, `markerIcon`, `lastVerifiedAt`, and others that are not needed for route planning.

Measured same bbox query:

| Query Shape | Rows | Payload | Time |
|---|---:|---:|---:|
| Full row | `4635` | `10.1MB` | `1421ms` client-side measured, `1506ms` SQL execution |
| Needed columns only | `4635` | `2.23MB` | `423ms` client-side measured, `6ms` SQL execution |

### Frontend Timeout Is Too Close To Normal Backend Runtime

`src/app/plan/page.tsx` sets:

```ts
const TRIP_CALC_TIMEOUT_MS = 10_000;
```

The timeout path aborts the request and switches UI state to timed out:

```ts
planTimeoutRef.current = setTimeout(() => {
  controller.abort();
  planAbortRef.current = null;
  planTimeoutRef.current = null;
  setIsPlanning(false);
  setTimedOut(true);
}, TRIP_CALC_TIMEOUT_MS);
```

Because a real route measured `10043ms`, the user can see failure even when the backend is essentially succeeding.

### OSRM Path Does Not Use Coordinates Already Collected By UI

The UI sends coordinates when available:

```ts
startLat: startCoords?.lat,
startLng: startCoords?.lng,
endLat: isLoopTrip ? startCoords?.lat : endCoords?.lat,
endLng: isLoopTrip ? startCoords?.lng : endCoords?.lng,
provider: mode === 'mapbox' ? 'mapbox' : 'osrm',
```

But the OSRM path calls:

```ts
directions = await fetchDirections(start, end);
```

`fetchDirections` geocodes both address strings again through Nominatim before calling OSRM. That is unnecessary when the UI already has selected coordinates.

### Route Cache Exists But Is Only Used For Explicit Mapbox Mode

`src/lib/routing/route-cache.ts` supports cached route lookup and storage by rounded coordinates plus provider. However, `/api/route` currently uses it only inside `provider === 'mapbox'`.

Common OSRM routes, including sample trips and recent trips, get no cache benefit.

### Mapbox Mode Can Reject Typed Locations Without Coordinates

The API rejects Mapbox requests without coordinates:

```ts
if (startLat == null || startLng == null || endLat == null || endLng == null) {
  return NextResponse.json(
    { error: 'Mapbox mode requires coordinates -- select locations from the autocomplete dropdown' },
    { status: 400 },
  );
}
```

The frontend enables planning based on text fields and vehicle selection. If a user types a location but does not choose an autocomplete result, Mapbox mode can produce an avoidable first-submit failure.

### Saved Trip Replan Has An Async Vehicle Race

`handleReplanFromNotebook` fetches vehicle data asynchronously, then sets `autoPlanPending`. The auto-plan effect can call `handlePlanTrip` before `selectedVehicle` is populated, causing `Please select a vehicle` even though the saved trip has a `vehicleId`.

### Current Tests Do Not Cover The Failure Mode

`src/app/api/route/route.test.ts` mocks `chargingStation.findMany` to return an empty array. It does not assert query shape or payload size.

`e2e/helpers/app.ts` mocks `POST /api/route` with a fixture. Playwright happy path never exercises backend route latency, frontend abort behavior, station query shape, or cache behavior.

## Root Cause Ranking

| Rank | Cause | Confidence | Why |
|---:|---|---|---|
| 1 | Full-row station query makes `/api/route` too slow | High | Instrumentation showed `8149ms` in `chargingStation.findMany`; simulated select reduced total route to `4419ms`. |
| 2 | Frontend hard abort at `10s` converts slow success into user-visible failure | High | Measured route at `10043ms`, timeout is `10000ms`. |
| 3 | OSRM path repeats geocoding even when coords exist | Medium | Code sends coords but OSRM path ignores them. Measured geocoding was under 1s in one run but can vary externally. |
| 4 | OSRM routes do not use existing route cache | Medium | Cache module exists and Mapbox path uses it; OSRM path bypasses it. |
| 5 | Mapbox typed text without coords and saved-trip vehicle race cause avoidable failures | Medium | Code paths show clear state mismatch; reproduction not yet captured in automated test. |

## Goals

- Common HCM to Da Lat route returns in under `5s` after hotfix on a warm production path.
- Frontend no longer aborts at `10s` and calls a still-running request a failure.
- Selected coordinates skip Nominatim on OSRM path.
- OSRM routes get the same route-cache benefits as Mapbox routes.
- Mapbox mode blocks or resolves typed-without-coordinates before API submit.
- Saved-trip replan does not fail because vehicle state is still loading.
- Tests catch delayed route success, station query shape, OSRM cache use, coordinate-first routing, Mapbox coord guard, and saved-trip replan race.

## Non-Goals

- Do not rewrite the trip planner algorithm.
- Do not introduce PostGIS as the first move.
- Do not hide real invalid-location errors.
- Do not solve this with blind client retries.
- Do not change station schema unless later measurements prove it is necessary.
- Do not redesign trip planning UI beyond timeout and validation states.

## Implementation Strategy

Implement in four phases. Phase 1 is the hotfix and should ship first. Phases 2 through 4 harden the system so failures stay rare and diagnosable.

1. **Phase 1: Hot path performance fix**
   Reduce station query payload and push status filtering into the database.

2. **Phase 2: Timeout and UX reliability**
   Replace hard `10s` failure with a longer abort and earlier non-failure progress state.

3. **Phase 3: Deterministic route resolution**
   Use coordinates first, cache OSRM routes, and avoid unnecessary geocoding/provider calls.

4. **Phase 4: Edge-case hardening and observability**
   Fix Mapbox coord validation, saved-trip replan race, route timing telemetry, and missing tests.

## Files To Touch

### Phase 1

- Modify: `src/app/api/route/route.ts`
- Modify: `src/app/api/route/route.test.ts`

### Phase 2

- Modify: `src/app/plan/page.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/vi.json`
- Add or modify: a client behavior test for delayed `/api/route` success. If no direct component test seam exists, add Playwright coverage in `e2e/trip-plan.spec.ts`.

### Phase 3

- Modify: `src/lib/routing/osrm.ts`
- Modify: `src/lib/routing/osrm.test.ts`
- Modify: `src/app/api/route/route.ts`
- Modify: `src/app/api/route/route.test.ts`
- Modify: `src/lib/routing/route-cache.ts` only if waypoint-aware cache keys need a helper.

### Phase 4

- Modify: `src/app/plan/page.tsx`
- Modify: `src/components/trip/TripInput.tsx` only if the Mapbox validation message belongs near inputs.
- Modify: `src/lib/trip/notebook-store.ts` only if the saved trip schema needs enough vehicle snapshot data to avoid an API race.
- Modify: `src/lib/trip/notebook-store.test.ts` if schema behavior changes.
- Modify: `e2e/helpers/app.ts` and `e2e/trip-plan.spec.ts` for slow-success coverage.

## Phase 1: Hot Path Performance Fix

### Task 1: Add Regression Test For Station Query Shape

**Files:**
- Modify: `src/app/api/route/route.test.ts`

- [ ] **Step 1: Update Prisma mock so `chargingStation.findMany` is inspectable**

Current mock already uses `vi.fn()`. Keep it but assign a typed reference after imports:

```ts
import { prisma } from '@/lib/prisma';

const findStationsMock = vi.mocked(prisma.chargingStation.findMany);
```

- [ ] **Step 2: Add test that route API selects only planner fields**

Add this test in `POST /api/route` coverage:

```ts
it('loads only station fields needed by route planning', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-15T02:00:00Z'));

  await postRoute();

  expect(findStationsMock).toHaveBeenCalledWith(expect.objectContaining({
    select: {
      id: true,
      name: true,
      address: true,
      province: true,
      latitude: true,
      longitude: true,
      chargerTypes: true,
      connectorTypes: true,
      portCount: true,
      maxPowerKw: true,
      stationType: true,
      isVinFastOnly: true,
      operatingHours: true,
      provider: true,
      chargingStatus: true,
      parkingFee: true,
    },
  }));
});
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/app/api/route/route.test.ts
```

Expected before implementation: FAIL because `select` is missing from `chargingStation.findMany` args.

### Task 2: Add Explicit Select And DB Status Filter

**Files:**
- Modify: `src/app/api/route/route.ts`

- [ ] **Step 1: Define the station select near route constants**

Add a constant near the top of `src/app/api/route/route.ts`:

```ts
const ROUTE_STATION_SELECT = {
  id: true,
  name: true,
  address: true,
  province: true,
  latitude: true,
  longitude: true,
  chargerTypes: true,
  connectorTypes: true,
  portCount: true,
  maxPowerKw: true,
  stationType: true,
  isVinFastOnly: true,
  operatingHours: true,
  provider: true,
  chargingStatus: true,
  parkingFee: true,
} as const;

const EXCLUDED_STATION_STATUSES = ['UNAVAILABLE', 'INACTIVE'] as const;
```

- [ ] **Step 2: Update station query**

Replace the current `prisma.chargingStation.findMany` call with:

```ts
const dbStations = await prisma.chargingStation.findMany({
  where: {
    latitude: { gte: minLat, lte: maxLat },
    longitude: { gte: minLng, lte: maxLng },
    OR: [
      { chargingStatus: null },
      { chargingStatus: { notIn: [...EXCLUDED_STATION_STATUSES] } },
    ],
  },
  select: ROUTE_STATION_SELECT,
});
```

- [ ] **Step 3: Remove redundant in-memory unavailable/inactive filter**

Delete this local filter block:

```ts
const EXCLUDED_STATUSES = new Set(['UNAVAILABLE', 'INACTIVE']);
const availableStations = stations.filter((s) => {
  const status = s.chargingStatus?.toUpperCase();
  return !status || !EXCLUDED_STATUSES.has(status);
});
```

Replace it with:

```ts
const availableStations = stations;
```

Important: if status casing in production can be lower-case, use a safe DB filter only for known uppercase values and keep a cheap defensive in-memory filter. In that case, still keep `select` as the core fix.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- src/app/api/route/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run route timing smoke test locally**

Run the same one-off route smoke used during investigation, with local env loaded:

```bash
npx tsx -r dotenv/config -e "import { NextRequest } from 'next/server'; const mod=await import('./src/app/api/route/route.ts'); const POST=mod.default?.POST ?? mod.POST; const body={start:'Ho Chi Minh City', end:'Da Lat', vehicleId:null, customVehicle:{brand:'VinFast',model:'VF 8',batteryCapacityKwh:87.7,officialRangeKm:471,chargingTimeDC_10to80_min:31}, currentBatteryPercent:80, minArrivalPercent:15, rangeSafetyFactor:0.8, provider:'osrm'}; const t=Date.now(); const res=await POST(new NextRequest('http://localhost/api/route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})); const data=await res.json(); console.log(JSON.stringify({status:res.status, ms:Date.now()-t, error:data.error ?? null, distance:data.totalDistanceKm ?? null, stops:Array.isArray(data.chargingStops)?data.chargingStops.length:null, routeProvider:data.routeProvider ?? null}, null, 2));"
```

Expected: `status` is `200`, `error` is `null`, and `ms` is materially below `10_000`. Target after Phase 1: under `5_000ms` on a warm local/prod-like path.

## Phase 2: Timeout And UX Reliability

### Task 3: Replace Hard 10s Failure With Soft Progress And Longer Abort

**Files:**
- Modify: `src/app/plan/page.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/vi.json`

- [ ] **Step 1: Split soft progress threshold from hard abort threshold**

Replace:

```ts
const TRIP_CALC_TIMEOUT_MS = 10_000;
```

With:

```ts
const TRIP_CALC_SLOW_MS = 8_000;
const TRIP_CALC_ABORT_MS = 25_000;
```

- [ ] **Step 2: Add slow-state timer**

Add a new state:

```ts
const [isSlowPlanning, setIsSlowPlanning] = useState(false);
```

Add a new ref:

```ts
const planSlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

When planning starts:

```ts
setTimedOut(false);
setIsSlowPlanning(false);

planSlowTimerRef.current = setTimeout(() => {
  setIsSlowPlanning(true);
}, TRIP_CALC_SLOW_MS);
```

- [ ] **Step 3: Keep hard abort, but move it to `25s`**

Change existing timeout to use `TRIP_CALC_ABORT_MS`:

```ts
planTimeoutRef.current = setTimeout(() => {
  controller.abort();
  planAbortRef.current = null;
  planTimeoutRef.current = null;
  setIsPlanning(false);
  setIsSlowPlanning(false);
  setTimedOut(true);
}, TRIP_CALC_ABORT_MS);
```

- [ ] **Step 4: Clear both timers in success, cancel, error, and unmount paths**

Create helper inside `HomeContent`:

```ts
const clearPlanTimers = useCallback(() => {
  if (planSlowTimerRef.current) {
    clearTimeout(planSlowTimerRef.current);
    planSlowTimerRef.current = null;
  }
  if (planTimeoutRef.current) {
    clearTimeout(planTimeoutRef.current);
    planTimeoutRef.current = null;
  }
}, []);
```

Use it in `finally`, `handleCancelPlanTrip`, and cleanup effect.

- [ ] **Step 5: Add slow planning message copy**

Add locale keys:

```json
"plan_calc_slow_message": "Still calculating. Long routes can take a little longer, but you do not need to retry yet."
```

```json
"plan_calc_slow_message": "Vẫn đang tính lộ trình. Tuyến dài có thể lâu hơn một chút, chưa cần thử lại."
```

- [ ] **Step 6: Render non-failure slow message while request is still in flight**

Add near current `timeoutBanner`:

```tsx
const slowPlanningBanner = isSlowPlanning && isPlanning ? (
  <div className="p-3 bg-[var(--color-info)]/10 border border-[var(--color-info)]/30 rounded-lg text-sm text-[var(--color-info)]">
    {t('plan_calc_slow_message')}
  </div>
) : null;
```

Render it where `timeoutBanner` is rendered.

- [ ] **Step 7: Run locale and focused tests**

Run:

```bash
npm test -- src/lib/__tests__/locale-keys.test.ts
```

Expected: PASS.

### Task 4: Add Slow-Success Regression Coverage

**Files:**
- Modify: `e2e/trip-plan.spec.ts`
- Modify: `e2e/helpers/app.ts` only if helper needs a configurable route delay.

- [ ] **Step 1: Add an E2E test that delays `/api/route` beyond 10s and still succeeds**

Add this import at the top of `e2e/trip-plan.spec.ts` if it is not already present:

```ts
import routeFixture from './fixtures/route.json';
```

Add a test that overrides the `/api/route` mock for one case. Do not use `completeTripPlan` here because that helper waits for the route response before returning; this test needs to assert the slow in-flight state before the response arrives.

```ts
test('keeps planning alive when route calculation takes longer than 10 seconds', async ({ page, isMobile }) => {
  await mockAPIs(page);

  await page.route('**/api/route', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 11_000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(routeFixture),
    });
  });

  await page.goto('/plan');
  await waitForAppReady(page);
  await switchToTab(page, isMobile ? 'Route' : 'Plan Trip');

  const startInput = page.locator('[role="combobox"]').first();
  await startInput.fill('Ho Chi Minh City');
  await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5_000 });
  await page.locator('[role="option"]').first().click({ force: true });

  const endInput = page.locator('[role="combobox"]').nth(1);
  await endInput.fill('Da Lat');
  await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5_000 });
  await page.locator('[role="option"]').first().click({ force: true });

  if (isMobile) {
    await switchToTab(page, 'Vehicle');
  }

  await page.locator('button:has-text("VF 8")').first().click();

  if (isMobile) {
    await switchToTab(page, 'Route');
  }

  const planButton = page.locator(
    'button:has-text("Calculate route"), button:has-text("Tính lộ trình"), button:has-text("Plan this trip"), button:has-text("Xem lịch trình")',
  );
  await expect(planButton).toBeEnabled({ timeout: 5_000 });
  await planButton.click();

  await expect(page.getByText(/Still calculating|Vẫn đang tính/)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('text=/Bảo Lộc|charging|32|150/').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Calculation took longer|Tính lộ trình lâu hơn/)).toHaveCount(0);
});
```

- [ ] **Step 2: Run this E2E test only**

Run:

```bash
npx playwright test e2e/trip-plan.spec.ts -g "keeps planning alive"
```

Expected: PASS.

## Phase 3: Deterministic Route Resolution And Cache

### Task 5: Add Coordinate-First OSRM Function

**Files:**
- Modify: `src/lib/routing/osrm.ts`
- Modify: `src/lib/routing/osrm.test.ts`

- [ ] **Step 1: Add a new exported function**

Add to `src/lib/routing/osrm.ts`:

```ts
export async function fetchDirectionsFromCoords(
  origin: Coordinate,
  destination: Coordinate,
  startAddress: string,
  endAddress: string,
): Promise<DirectionsResult> {
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;

  try {
    const route = await callOsrm(coordinates);
    return {
      ...route,
      startAddress,
      endAddress,
      startCoord: origin,
      endCoord: destination,
      provider: 'osrm',
    };
  } catch (osrmError) {
    if (!shouldFallback(osrmError)) throw osrmError;

    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!mapboxToken) throw osrmError;

    const result = await fetchDirectionsMapboxFromCoords(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng,
      mapboxToken,
      startAddress,
      endAddress,
    );
    return { ...result, startCoord: origin, endCoord: destination, provider: 'mapbox' };
  }
}
```

Also export the coordinate type so tests and callers can use the new function without duplicating shape:

```ts
export interface Coordinate {
  readonly lat: number;
  readonly lng: number;
}
```

Keep the function in this module so existing fallback policy is reused.

- [ ] **Step 2: Test that coordinate-first path skips Nominatim**

Add test in `src/lib/routing/osrm.test.ts`:

```ts
it('fetchDirectionsFromCoords calls OSRM directly without Nominatim geocoding', async () => {
  mockFetch.mockResolvedValueOnce(osrmOkResponse());

  const result = await fetchDirectionsFromCoords(
    { lat: 10.762, lng: 106.66 },
    { lat: 11.94, lng: 108.45 },
    'Ho Chi Minh City',
    'Da Lat',
  );

  expect(result.provider).toBe('osrm');
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(String(mockFetch.mock.calls[0][0])).toContain('router.project-osrm.org');
});
```

- [ ] **Step 3: Run focused test and verify fail before implementation, pass after**

Run:

```bash
npm test -- src/lib/routing/osrm.test.ts
```

Expected after implementation: PASS.

### Task 6: Use Coordinates And Cache For OSRM In `/api/route`

**Files:**
- Modify: `src/app/api/route/route.ts`
- Modify: `src/app/api/route/route.test.ts`

- [ ] **Step 1: Import `fetchDirectionsFromCoords`**

Change import:

```ts
import { fetchDirections, fetchDirectionsFromCoords, fetchDirectionsWithWaypoints } from '@/lib/routing/osrm';
```

- [ ] **Step 2: Add coordinate availability helper**

Inside `POST`, after parsing body:

```ts
const coordsAvailable = startLat != null && startLng != null && endLat != null && endLng != null;
```

There is another `coordsAvailable` later for traffic. Rename one to avoid shadowing, for example `trafficCoordsAvailable`.

- [ ] **Step 3: Use route cache for no-waypoint OSRM coord path**

In the `provider !== 'mapbox'` branch:

```ts
if (waypoints && waypoints.length > 0) {
  directions = await fetchDirectionsWithWaypoints(start, end, waypoints);
} else if (coordsAvailable) {
  const cached = await getCachedRoute(startLat!, startLng!, endLat!, endLng!, 'osrm');
  if (cached) {
    directions = {
      polyline: cached.polyline,
      distanceMeters: cached.distanceMeters,
      durationSeconds: cached.durationSeconds,
      startAddress: start,
      endAddress: end,
      startCoord: { lat: startLat!, lng: startLng! },
      endCoord: { lat: endLat!, lng: endLng! },
      provider: 'osrm' as const,
    };
  } else {
    directions = await fetchDirectionsFromCoords(
      { lat: startLat!, lng: startLng! },
      { lat: endLat!, lng: endLng! },
      start,
      end,
    );
    await setCachedRoute(startLat!, startLng!, endLat!, endLng!, 'osrm', {
      polyline: directions.polyline,
      distanceMeters: directions.distanceMeters,
      durationSeconds: directions.durationSeconds,
    });
  }
} else {
  directions = await fetchDirections(start, end);
}
```

Do not cache waypoint routes in this task unless `route-cache.ts` is extended with waypoint-aware keys. Incorrectly caching waypoint routes under start/end only would be a route correctness bug.

- [ ] **Step 4: Add API tests**

First extend the existing route API mock:

```ts
vi.mock('@/lib/routing/osrm', () => ({
  fetchDirections: vi.fn().mockResolvedValue({
    polyline: '_c`|@_c~eS?_ibE?_ibE',
    distanceMeters: 220_000,
    durationSeconds: 10_800,
    startAddress: 'A',
    endAddress: 'B',
    startCoord: { lat: 10, lng: 106 },
    endCoord: { lat: 10, lng: 108 },
    provider: 'osrm',
  }),
  fetchDirectionsFromCoords: vi.fn().mockResolvedValue({
    polyline: '_c`|@_c~eS?_ibE?_ibE',
    distanceMeters: 220_000,
    durationSeconds: 10_800,
    startAddress: 'A',
    endAddress: 'B',
    startCoord: { lat: 10, lng: 106 },
    endCoord: { lat: 10, lng: 108 },
    provider: 'osrm',
  }),
  fetchDirectionsWithWaypoints: vi.fn(),
}));
```

Then add explicit tests:

```ts
it('uses coordinate-first OSRM path when start and end coords are present', async () => {
  const { fetchDirections, fetchDirectionsFromCoords } = await import('@/lib/routing/osrm');

  await POST(new NextRequest('http://localhost/api/route', {
    method: 'POST',
    body: JSON.stringify({
      ...BODY,
      startLat: 10.7769,
      startLng: 106.7009,
      endLat: 11.9404,
      endLng: 108.4583,
    }),
    headers: { 'content-type': 'application/json' },
  }));

  expect(fetchDirectionsFromCoords).toHaveBeenCalledWith(
    { lat: 10.7769, lng: 106.7009 },
    { lat: 11.9404, lng: 108.4583 },
    'A',
    'B',
  );
  expect(fetchDirections).not.toHaveBeenCalled();
});

it('uses cached OSRM route when no waypoints are present', async () => {
  const { getCachedRoute } = await import('@/lib/routing/route-cache');
  const { fetchDirectionsFromCoords } = await import('@/lib/routing/osrm');
  vi.mocked(getCachedRoute).mockResolvedValueOnce({
    polyline: '_c`|@_c~eS?_ibE?_ibE',
    distanceMeters: 220_000,
    durationSeconds: 10_800,
  });

  await POST(new NextRequest('http://localhost/api/route', {
    method: 'POST',
    body: JSON.stringify({
      ...BODY,
      startLat: 10.7769,
      startLng: 106.7009,
      endLat: 11.9404,
      endLng: 108.4583,
    }),
    headers: { 'content-type': 'application/json' },
  }));

  expect(fetchDirectionsFromCoords).not.toHaveBeenCalled();
});

it('keeps string geocoding fallback when OSRM coordinates are absent', async () => {
  const { fetchDirections, fetchDirectionsFromCoords } = await import('@/lib/routing/osrm');

  await postRoute();

  expect(fetchDirections).toHaveBeenCalledWith('A', 'B');
  expect(fetchDirectionsFromCoords).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- src/app/api/route/route.test.ts src/lib/routing/osrm.test.ts src/lib/routing/route-cache.test.ts
```

Expected: PASS.

## Phase 4: Edge Cases And Observability

### Task 7: Prevent Mapbox Typed-Without-Coords Submit

**Files:**
- Modify: `src/app/plan/page.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/vi.json`

- [ ] **Step 1: Add coordinate requirement to `canPlan` only for Mapbox mode**

Add:

```ts
const hasRequiredRouteCoords = mode !== 'mapbox' || (
  startCoords != null && (isLoopTrip ? startCoords != null : endCoords != null)
);
```

Change:

```ts
const canPlan = Boolean(start && end && activeVehicle && !isPlanning);
```

To:

```ts
const canPlan = Boolean(start && end && activeVehicle && hasRequiredRouteCoords && !isPlanning);
```

- [ ] **Step 2: Add disabled reason**

Extend disabled reason:

```ts
const disabledReason = !start || !end
  ? t('plan_disabled_route')
  : !activeVehicle
    ? t('plan_disabled_vehicle')
    : !hasRequiredRouteCoords
      ? t('plan_disabled_select_locations')
      : null;
```

Add locale keys:

```json
"plan_disabled_select_locations": "Select both locations from the suggestions before planning with Mapbox."
```

```json
"plan_disabled_select_locations": "Chọn cả hai địa điểm từ gợi ý trước khi lập lộ trình bằng Mapbox."
```

- [ ] **Step 3: Run locale test**

Run:

```bash
npm test -- src/lib/__tests__/locale-keys.test.ts
```

Expected: PASS.

### Task 8: Fix Saved-Trip Replan Vehicle Race

**Files:**
- Modify: `src/app/plan/page.tsx`
- Modify: tests if an existing seam covers notebook replan; otherwise add a focused test around replan behavior.

- [ ] **Step 1: Make replan wait for vehicle resolution before auto-plan**

Change `handleReplanFromNotebook` to an async callback:

```ts
const handleReplanFromNotebook = useCallback(
  async (trip: SavedTrip) => {
    planningNotebookEntryIdRef.current = trip.id;
    setStart(trip.start);
    setEnd(trip.end);
    setStartCoords(trip.startCoords ?? null);
    setEndCoords(trip.endCoords ?? null);
    setWaypoints(trip.waypoints.map((wp) => ({
      name: wp.name ?? '',
      coords: { lat: wp.lat, lng: wp.lng },
    })));
    setIsLoopTrip(trip.isLoopTrip);

    if (trip.vehicleId) {
      const response = await fetch(`/api/vehicles?id=${encodeURIComponent(trip.vehicleId)}`).catch(() => null);
      const data = response?.ok ? await response.json().catch(() => null) : null;
      if (data) {
        setSelectedVehicle(data);
        setCustomVehicle(null);
      }
    } else if (trip.customVehicle) {
      setCustomVehicle(trip.customVehicle);
      setSelectedVehicle(null);
    }

    setCurrentBattery(trip.currentBattery);
    setMinArrival(trip.minArrival);
    setRangeSafetyFactor(trip.rangeSafetyFactor);
    setDepartAtRaw(trip.departAt);
    notebook.touch(trip.id);
    setAutoPlanPending(true);
  },
  [notebook],
);
```

Update both call sites so the async replan handler is intentionally fire-and-forget from the UI event boundary:

```ts
onReplan={(trip) => {
  void handleReplanFromNotebook(trip);
  setActiveTab('route');
}}
```

```ts
onReplan={(trip) => {
  void handleReplanFromNotebook(trip);
  handleDesktopTabChange('planTrip');
}}
```

- [ ] **Step 2: Add regression coverage**

Add these imports to the E2E file that owns saved-trip/notebook behavior. If the test is added to `e2e/trip-plan.spec.ts`, keep the existing imports and add only `vehiclesFixture`:

```ts
import vehiclesFixture from './fixtures/vehicles.json';
```

Add a Playwright test that seeds a saved trip into localStorage, delays `/api/vehicles`, clicks Replan, and verifies route planning waits for the vehicle.

```ts
test('replans saved vehicle trip after vehicle data is resolved', async ({ page, isMobile }) => {
  await mockAPIs(page);

  await page.route('**/api/vehicles**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(vehiclesFixture[0]),
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('evoyage-notebook-v1', JSON.stringify([{
      id: 'saved-trip-1',
      savedAt: '2026-06-05T00:00:00.000Z',
      lastViewedAt: '2026-06-05T00:00:00.000Z',
      pinned: false,
      start: 'Ho Chi Minh City',
      end: 'Da Lat',
      startCoords: { lat: 10.7769, lng: 106.7009 },
      endCoords: { lat: 11.9404, lng: 108.4583 },
      waypoints: [],
      isLoopTrip: false,
      vehicleId: 'vf8-plus',
      customVehicle: null,
      currentBattery: 80,
      minArrival: 15,
      rangeSafetyFactor: 0.8,
      departAt: null,
      dismissedPrecautionaryStops: [],
    }]));
  });

  await page.goto('/plan');
  await waitForAppReady(page);
  await switchToTab(page, 'Saved');

  const routeResponse = page.waitForResponse((resp) => resp.url().includes('/api/route') && resp.status() === 200);
  await page.getByRole('button', { name: /Replan|Lập lại|Tính lại|Đi lại/i }).first().click();

  await expect(page.getByText(/Please select a vehicle|Vui lòng chọn xe/)).toHaveCount(0);
  await routeResponse;
});
```

### Task 9: Add Route Stage Timing Telemetry

**Files:**
- Modify: `src/app/api/route/route.ts`

- [ ] **Step 1: Add lightweight timing helper inside `POST`**

Add near start of the `try` block:

```ts
const routeStartedAt = Date.now();
const timings: Record<string, number> = {};
const mark = (key: string, startedAt: number) => {
  timings[key] = Date.now() - startedAt;
};
```

- [ ] **Step 2: Mark key stages**

Wrap stages:

```ts
const directionsStartedAt = Date.now();
// directions resolution
mark('directionsMs', directionsStartedAt);

const stationQueryStartedAt = Date.now();
const dbStations = await prisma.chargingStation.findMany(...);
mark('stationQueryMs', stationQueryStartedAt);

const planningStartedAt = Date.now();
const plan = planChargingStops(...);
mark('plannerMs', planningStartedAt);
```

- [ ] **Step 3: Log structured summary only when slow or failed**

Before returning success:

```ts
const totalMs = Date.now() - routeStartedAt;
if (totalMs > 5_000) {
  console.warn('Route calculation slow', {
    totalMs,
    timings,
    provider,
    stationRows: dbStations.length,
    decisionPointCount: decisionPoints.length,
    chargingStopCount: enrichedChargingStops.length,
  });
}
```

In catch, include `timings` and `totalMs` in the existing error log. Do not log coordinates, raw addresses, tokens, or full request bodies.

- [ ] **Step 4: Add dev-only `Server-Timing` header**

Return timing headers outside production so local and staging debugging can inspect route stage durations without reading logs:

```ts
const response = NextResponse.json(tripPlan);
if (process.env.NODE_ENV !== 'production') {
  response.headers.set('Server-Timing', Object.entries(timings)
    .map(([name, ms]) => `${name};dur=${ms}`)
    .join(', '));
}
return response;
```

Keep production response unchanged unless product wants timing headers for monitoring.

## Rollout Plan

1. Ship Phase 1 alone if possible.
2. Verify production route timings from logs for top sample routes:
   - Ho Chi Minh City -> Da Lat
   - Ho Chi Minh City -> Vung Tau
   - Ha Noi -> Ha Long
3. Ship Phase 2 once slow-success test passes.
4. Ship Phase 3 behind existing behavior: coordinate-first only when coordinates are present; string geocode fallback remains.
5. Ship Phase 4 edge cases and telemetry.

## Acceptance Criteria

- `npm test` passes.
- `npx next build` passes.
- `npx playwright test e2e/trip-plan.spec.ts` passes for the new slow-success case.
- Local/prod-like route smoke for HCM -> Da Lat returns `200` under `5s` warm after Phase 1.
- A delayed `/api/route` response at `11s` still shows a successful trip, not timeout failure.
- Repeated manual planning does not produce 429 from user retries during normal use.
- Mapbox mode does not send invalid no-coordinate route requests.
- Saved-trip replan with `vehicleId` does not fail before vehicle fetch completes.

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| DB status values are not consistently uppercase | Keep a defensive in-memory uppercase filter after DB `select`, or normalize statuses in data ingestion as a separate task. |
| Coordinate-first OSRM returns route for stale coordinates after user edits text | Current UI clears coords on manual text edits. Keep that behavior and add test coverage. |
| Route cache serves stale route after road data changes | Existing cache TTL is 24 hours. Accept for now; route geometry changes are less harmful than repeated failures. |
| Longer abort masks backend degradation | Add slow-route telemetry and alert on total route time, not user retry count. |
| E2E delayed test increases suite time | Keep a single targeted delayed test. Unit-test timer behavior if a component seam becomes available. |

## Operational Notes

- Do not ask users to retry as the primary solution. Retrying adds load and can hit the route limiter.
- Do not add broad retries to `/api/route` without idempotency and backoff. The first request may still be running.
- Avoid logging full addresses or coordinates in production timing logs unless privacy policy explicitly allows it.
- If Phase 1 does not bring production under target, next investigation should inspect Supabase pool latency, cold start time, and station bbox row count by route.

## Final Verification Commands

Run before commit:

```bash
npm test
npx next build
npx playwright test e2e/trip-plan.spec.ts
```

Run route smoke after implementation:

```bash
npx tsx -r dotenv/config -e "import { NextRequest } from 'next/server'; const mod=await import('./src/app/api/route/route.ts'); const POST=mod.default?.POST ?? mod.POST; const body={start:'Ho Chi Minh City', end:'Da Lat', vehicleId:null, customVehicle:{brand:'VinFast',model:'VF 8',batteryCapacityKwh:87.7,officialRangeKm:471,chargingTimeDC_10to80_min:31}, currentBatteryPercent:80, minArrivalPercent:15, rangeSafetyFactor:0.8, provider:'osrm'}; const t=Date.now(); const res=await POST(new NextRequest('http://localhost/api/route',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})); const data=await res.json(); console.log(JSON.stringify({status:res.status, ms:Date.now()-t, error:data.error ?? null, distance:data.totalDistanceKm ?? null, stops:Array.isArray(data.chargingStops)?data.chargingStops.length:null, routeProvider:data.routeProvider ?? null}, null, 2));"
```

Expected after Phase 1 and Phase 3:

```json
{
  "status": 200,
  "error": null,
  "ms": "under 5000 on warm path"
}
```
