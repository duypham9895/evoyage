# Mapbox Triple-Mode Map Provider Design

**Date:** 2026-03-18
**Status:** Approved
**Approach:** A — Extend Current Pattern (separate components per provider)

## Overview

Add Mapbox as a third map provider alongside OSM/Leaflet and Google Maps. Each provider bundles both map rendering and routing. Users switch via a 3-segment toggle in the header.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | Extend current pattern (Approach A) | Minimal refactoring, lowest risk, follows existing conventions |
| Mapbox scope | Both rendering + routing | Full provider experience, consistent with Google Maps mode |
| Toggle labels | `[OSM \| Mapbox \| Google]` | Tech brand names — clear, unambiguous |
| Default provider | OSM | Free, no API key required, works out of the box |
| Mode naming | `'osm'` (not `'leaflet'`) | Represents the full stack (OSM data + OSRM routing + Leaflet rendering) |

## Section 1: Type System & State Management

### MapMode Type

```typescript
// src/types/index.ts
// Before
export type MapMode = 'leaflet' | 'google';

// After
export type MapMode = 'osm' | 'mapbox' | 'google';
```

Renaming `'leaflet'` → `'osm'` because the toggle label is "OSM" and the mode represents the full stack, not just the renderer.

### MapModeContext (`src/lib/map-mode.tsx`)

- Default mode: `'osm'`
- localStorage validation accepts `'osm' | 'mapbox' | 'google'`
- Migration: if localStorage contains `'leaflet'`, treat as `'osm'`

### Route API Provider Mapping

| UI Mode | API Provider Value |
|---|---|
| `'osm'` | `'osrm'` |
| `'mapbox'` | `'mapbox'` |
| `'google'` | `'google'` |

```typescript
// src/app/api/route/route.ts
provider: z.enum(['osrm', 'mapbox', 'google']).default('osrm')
```

The UI mode name (`osm`) is intentionally different from the API provider name (`osrm`) — the user sees the data ecosystem brand, while the server uses the specific routing engine name.

## Section 2: Header Toggle UI

3-segment pill replacing the current 2-segment toggle:

```
┌──────────────────────────────────────────────────────────┐
│ ⚡ EVoyage          [OSM | Mapbox | Google]   [VI → EN]  │
└──────────────────────────────────────────────────────────┘
```

- Active segment: `bg-[var(--color-accent)]` with bold text (existing pattern)
- Each button calls `setMode('osm' | 'mapbox' | 'google')`
- **Availability guard:** If `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is not set, the Mapbox button is disabled with reduced opacity and a title tooltip "Mapbox token not configured"
- **Labels are static brand names** (OSM, Mapbox, Google) regardless of locale — not localized, consistent with "Google" already being static in the current toggle

## Section 3: Mapbox Routing (Server-Side)

### New File: `src/lib/mapbox-directions.ts`

Mapbox Directions API v5 client, following the same pattern as `google-directions.ts`.

**API endpoint:** `https://api.mapbox.com/directions/v5/mapbox/driving/{lng},{lat};{lng},{lat}`

**Key differences from Google Directions:**

| Aspect | Google | Mapbox |
|---|---|---|
| Coordinate order | `lat,lng` | `lng,lat` (GeoJSON standard) |
| Polyline precision | 5 | 6 |
| Auth | `key` query param | `access_token` query param |

**Interface:** Returns the same `DirectionsResult` shape used by Google directions:

```typescript
interface DirectionsResult {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly startAddress: string;
  readonly endAddress: string;
}
```

### Route API Changes (`src/app/api/route/route.ts`)

- Import `fetchDirectionsMapbox` from `@/lib/mapbox-directions`
- **Three-way provider branching:** Refactor from if/else to explicit `if (provider === 'google') ... else if (provider === 'mapbox') ... else /* osrm */` to prevent Mapbox requests falling through to OSRM
- **Shared coordinate validation:** Both `'google'` and `'mapbox'` providers require lat/lng coordinates. Extract the coordinate check into a shared guard for both providers (currently only guards Google)
- **Mapbox polyline normalization:** After receiving a Mapbox response, decode precision-6 and re-encode as precision-5 before any downstream use (bounding box, planChargingStops, TripPlan)
- Same caching pattern: `getCachedRoute(..., 'mapbox')` / `setCachedRoute(..., 'mapbox')`
- **Env var validation:** Return 500 with clear message if `process.env.MAPBOX_ACCESS_TOKEN` is missing (same pattern as Google key validation on lines 141-146)

## Section 4: Mapbox Map Renderer (Client-Side)

### New File: `src/components/MapboxMap.tsx`

Uses `react-map-gl` with Mapbox GL JS.

**Component structure:**

```
MapboxMap
├── <Map> (react-map-gl wrapper)
│   ├── <Source type="geojson"> + <Layer> for route polyline
│   ├── <Marker> for start point (green)
│   ├── <Marker> for end point (red)
│   ├── <Marker> × N for charging stops (provider-colored)
│   └── <Popup> for station info on click
└── Loading skeleton while map initializes
```

**Configuration:**
- Style: `mapbox://styles/mapbox/dark-v11` (matches app dark theme)
- Token: `process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- Default center: Reuse `VIETNAM_CENTER` from `src/lib/map-utils.ts` for consistency across all three map providers

**Props:** Same as `Map.tsx` and `GoogleMap.tsx` — receives `tripPlan: TripPlan | null`.

### Page Integration (`src/app/page.tsx`)

```tsx
const MapboxMap = dynamic(() => import('@/components/MapboxMap'), { ssr: false });

// Render:
{mode === 'google' ? <GoogleMap /> : mode === 'mapbox' ? <MapboxMap /> : <LeafletMap />}
```

### New Dependencies

- `react-map-gl` — React wrapper for Mapbox GL JS
- `mapbox-gl` — Mapbox GL JS rendering engine

## Section 5: Polyline Precision Normalization

### Problem

Mapbox returns precision-6 polylines, while OSRM and Google use precision-5. Multiple call sites decode polylines: `planChargingStops()`, the bounding box calculation in the route API, and all three map components. Threading precision through every call site is error-prone.

### Solution: Server-Side Normalization

Add a `precision` parameter to `decodePolyline()` and an `encodePolyline()` function in `src/lib/polyline.ts`:

```typescript
export function decodePolyline(encoded: string, precision: 5 | 6 = 5): LatLng[]
export function encodePolyline(points: readonly LatLng[], precision: 5 | 6 = 5): string
```

**In the route API**, after receiving a Mapbox response:
1. Decode the precision-6 polyline: `decodePolyline(mapboxPolyline, 6)`
2. Re-encode as precision-5: `encodePolyline(points, 5)`
3. Use the normalized precision-5 polyline for everything downstream

This ensures:
- `planChargingStops()` always receives precision-5 (no changes needed)
- Bounding box calculation always receives precision-5 (no changes needed)
- `TripPlan.polyline` is always precision-5 (all map components work as-is)
- No precision parameter needs to be threaded through `PlanChargingStopsInput` or `TripPlan`

**Caller mapping after normalization:**
- OSRM → already precision-5, no conversion needed
- Google → already precision-5, no conversion needed
- Mapbox → decode as 6, re-encode as 5 in route API before any other use

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `src/types/index.ts` | Modify | `MapMode = 'osm' \| 'mapbox' \| 'google'` |
| `src/lib/map-mode.tsx` | Modify | Default `'osm'`, migrate `'leaflet'` from localStorage |
| `src/components/Header.tsx` | Modify | 3-segment toggle with static brand labels (OSM/Mapbox/Google), disabled state for missing tokens |
| `src/lib/mapbox-directions.ts` | **New** | Mapbox Directions API v5 client |
| `src/lib/polyline.ts` | Modify | Add `precision` parameter to `decodePolyline()`, add `encodePolyline()` for normalization |
| `src/app/api/route/route.ts` | Modify | Add `'mapbox'` provider branch |
| `src/components/MapboxMap.tsx` | **New** | Mapbox GL JS map renderer |
| `src/app/page.tsx` | Modify | Dynamic import `MapboxMap`, 3-way conditional render |
| `src/app/page.tsx` | Modify | Provider mapping `mode → provider` in `handlePlanTrip` (already listed above for dynamic import) |
| `package.json` | Modify | Add `react-map-gl`, `mapbox-gl` |

### Not Changed

- `src/components/Map.tsx` (Leaflet) — works as-is
- `src/components/GoogleMap.tsx` — works as-is
- `src/lib/route-planner.ts` — provider-agnostic, works as-is
- `src/components/PlaceAutocomplete.tsx` — Nominatim-powered, works as-is
- `.env.example` — already has Mapbox token entries

## Known Limitations

- **Nominatim geocoding for Mapbox routing:** PlaceAutocomplete uses Nominatim, which may produce slightly different coordinates than Mapbox's own geocoding. This can cause minor route snapping differences. Future improvement: use Mapbox Geocoding API when in Mapbox mode.
- **Bundle size:** `mapbox-gl` adds ~200KB gzipped. Mitigated by dynamic import (SSR disabled), so it only loads when Mapbox mode is active.
- **Mapbox GL JS v2+ licensing:** Mapbox GL JS v2+ is proprietary (not open source) and requires a Mapbox access token. This is acceptable for our use case with a configured token.
- **`'leaflet'` string sweep:** Renaming to `'osm'` requires a codebase-wide search for all occurrences of `'leaflet'` in mode checks, tests, and comments.
