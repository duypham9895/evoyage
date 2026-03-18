# Mapbox Triple-Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Mapbox as a third map provider with a 3-segment toggle (OSM | Mapbox | Google), renaming the existing 'leaflet' mode to 'osm'.

**Architecture:** Extend the existing per-provider pattern. Each mode bundles rendering + routing. Mapbox polylines (precision-6) are normalized to precision-5 server-side so all downstream consumers work uniformly.

**Tech Stack:** react-map-gl, mapbox-gl, Mapbox Directions API v5, Mapbox GL JS dark-v11 style

**Spec:** `docs/superpowers/specs/2026-03-18-mapbox-triple-mode-design.md`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install react-map-gl and mapbox-gl**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npm install react-map-gl mapbox-gl
```

- [ ] **Step 2: Install mapbox-gl types**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npm install -D @types/mapbox-gl
```

- [ ] **Step 3: Verify build still works**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npm run build
```

Expected: Build succeeds with no new errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && git add package.json package-lock.json && git commit -m "chore: add react-map-gl and mapbox-gl dependencies"
```

---

### Task 2: Update Type System — Rename `'leaflet'` to `'osm'`, Add `'mapbox'`

**Files:**
- Modify: `src/types/index.ts:134`
- Modify: `src/lib/map-mode.tsx`

- [ ] **Step 1: Update MapMode type**

In `src/types/index.ts`, change line 134:

```typescript
// Before
export type MapMode = 'leaflet' | 'google';

// After
export type MapMode = 'osm' | 'mapbox' | 'google';
```

- [ ] **Step 2: Update MapModeContext**

In `src/lib/map-mode.tsx`, make these changes:

1. Change default state from `'leaflet'` to `'osm'` (line 19)
2. Update the localStorage validation (line 24) to accept `'osm' | 'mapbox' | 'google'`
3. Add migration: treat saved `'leaflet'` as `'osm'`
4. Update the default context value (line 14) from `'leaflet'` to `'osm'`

Full updated file:

```typescript
'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { MapMode } from '@/types';

interface MapModeContextType {
  readonly mode: MapMode;
  readonly setMode: (mode: MapMode) => void;
}

const STORAGE_KEY = 'evoyage-map-mode';

const MapModeContext = createContext<MapModeContextType>({
  mode: 'osm',
  setMode: () => {},
});

export function MapModeProvider({ children }: { readonly children: ReactNode }) {
  const [mode, setModeState] = useState<MapMode>('osm');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    // Migrate old 'leaflet' value to 'osm'
    if (saved === 'leaflet' || saved === 'osm') {
      setModeState('osm');
    } else if (saved === 'mapbox' || saved === 'google') {
      setModeState(saved);
    }
  }, []);

  const setMode = useCallback((newMode: MapMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  return (
    <MapModeContext.Provider value={{ mode, setMode }}>
      {children}
    </MapModeContext.Provider>
  );
}

export function useMapMode() {
  return useContext(MapModeContext);
}
```

- [ ] **Step 3: Update all `'leaflet'` references in page.tsx**

In `src/app/page.tsx`, change line 151:

```typescript
// Before
provider: mode === 'google' ? 'google' : 'osrm',

// After
provider: mode === 'google' ? 'google' : mode === 'mapbox' ? 'mapbox' : 'osrm',
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npx tsc --noEmit 2>&1 | head -30
```

Expected: Type errors in `Header.tsx` (still uses `'leaflet'`) and `page.tsx` (conditional render). This is expected — we fix Header in Task 3 and page.tsx render in Task 7.

- [ ] **Step 5: Commit**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && git add src/types/index.ts src/lib/map-mode.tsx src/app/page.tsx && git commit -m "refactor: rename MapMode 'leaflet' to 'osm', add 'mapbox' variant"
```

---

### Task 3: Update Header Toggle — 3-Segment Pill

**Files:**
- Modify: `src/components/Header.tsx`

- [ ] **Step 1: Replace the 2-segment toggle with 3-segment**

Full updated `Header.tsx`:

```typescript
'use client';

import { useLocale } from '@/lib/locale';
import { useMapMode } from '@/lib/map-mode';
import type { MapMode } from '@/types';

const MAP_MODES: readonly { readonly mode: MapMode; readonly label: string }[] = [
  { mode: 'osm', label: 'OSM' },
  { mode: 'mapbox', label: 'Mapbox' },
  { mode: 'google', label: 'Google' },
];

export default function Header() {
  const { locale, toggleLocale, t } = useLocale();
  const { mode, setMode } = useMapMode();

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-surface-hover)]">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold font-[family-name:var(--font-heading)] text-[var(--color-accent)]">
          ⚡ EVoyage
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Map mode toggle */}
        <div className="flex items-center gap-1 bg-[var(--color-background)] rounded-lg border border-[var(--color-surface-hover)] p-0.5">
          {MAP_MODES.map(({ mode: m, label }) => {
            const isDisabled = m === 'mapbox' && !mapboxToken;
            return (
              <button
                key={m}
                onClick={() => !isDisabled && setMode(m)}
                disabled={isDisabled}
                title={isDisabled ? 'Mapbox token not configured' : undefined}
                className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                  mode === m
                    ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-bold'
                    : isDisabled
                      ? 'text-[var(--color-muted)] opacity-40 cursor-not-allowed'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                }`}
                aria-label={`Use ${label} map`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Language toggle */}
        <span className="text-xs text-[var(--color-muted)]">
          {t('Ngôn ngữ', 'Language')}
        </span>
        <button
          onClick={toggleLocale}
          className="px-3 py-1.5 text-sm rounded-lg bg-[var(--color-background)] border border-[var(--color-surface-hover)] hover:border-[var(--color-accent)] transition-colors"
          aria-label="Toggle language"
        >
          {locale === 'vi' ? '🇻🇳 VI → 🇬🇧 EN' : '🇬🇧 EN → 🇻🇳 VI'}
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npx tsc --noEmit 2>&1 | grep -i "Header"
```

Expected: No errors in Header.tsx.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && git add src/components/Header.tsx && git commit -m "feat: update header toggle to 3-segment pill (OSM | Mapbox | Google)"
```

---

### Task 4: Add Polyline Encode/Decode with Precision Support

**Files:**
- Modify: `src/lib/polyline.ts`

- [ ] **Step 1: Add precision parameter to `decodePolyline` and add `encodePolyline`**

Full updated `src/lib/polyline.ts`:

```typescript
import type { LatLng } from '@/types';

/**
 * Decode an encoded polyline string into an array of LatLng points.
 * Supports both precision-5 (Google/OSRM) and precision-6 (Mapbox).
 *
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string, precision: 5 | 6 = 5): readonly LatLng[] {
  const factor = precision === 6 ? 1e6 : 1e5;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }

  return points;
}

/**
 * Encode an array of LatLng points into a polyline string.
 * Used to normalize Mapbox precision-6 polylines to precision-5.
 */
export function encodePolyline(points: readonly LatLng[], precision: 5 | 6 = 5): string {
  const factor = precision === 6 ? 1e6 : 1e5;
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);

    encoded += encodeValue(lat - prevLat);
    encoded += encodeValue(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';

  while (v >= 0x20) {
    encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }

  encoded += String.fromCharCode(v + 63);
  return encoded;
}

/**
 * Calculate cumulative distances along a polyline.
 * Returns an array of distances (in km) from the start to each point.
 */
export function cumulativeDistances(
  points: readonly LatLng[],
  haversine: (a: LatLng, b: LatLng) => number,
): readonly number[] {
  const distances: number[] = [0];

  for (let i = 1; i < points.length; i++) {
    const segmentDist = haversine(points[i - 1], points[i]);
    distances.push(distances[i - 1] + segmentDist);
  }

  return distances;
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npx tsc --noEmit 2>&1 | grep "polyline"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && git add src/lib/polyline.ts && git commit -m "feat: add precision parameter to decodePolyline, add encodePolyline for normalization"
```

---

### Task 5: Create Mapbox Directions Client

**Files:**
- Create: `src/lib/mapbox-directions.ts`

- [ ] **Step 1: Create the Mapbox Directions API v5 client**

Create `src/lib/mapbox-directions.ts`:

```typescript
/**
 * Mapbox Directions API v5 client.
 * Uses api.mapbox.com/directions/v5/mapbox/driving (precision-6 polylines).
 *
 * IMPORTANT: Mapbox uses lng,lat coordinate order (GeoJSON standard),
 * and precision-6 polylines. The caller MUST normalize the polyline to
 * precision-5 before downstream use (see route API).
 */

interface DirectionsResult {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly startAddress: string;
  readonly endAddress: string;
}

const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

/**
 * Fetch driving directions from Mapbox Directions API v5.
 * Returns a precision-6 encoded polyline — caller must normalize.
 */
export async function fetchDirectionsMapbox(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  accessToken: string,
): Promise<DirectionsResult> {
  // Mapbox uses lng,lat order
  const coordinates = `${originLng},${originLat};${destLng},${destLat}`;

  const params = new URLSearchParams({
    access_token: accessToken,
    geometries: 'polyline6',
    overview: 'full',
  });

  const response = await fetch(`${DIRECTIONS_BASE}/${coordinates}?${params}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Mapbox Directions API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.routes?.length) {
    throw new Error(`Mapbox Directions: No route found — ${data.message ?? 'Unknown error'}`);
  }

  const route = data.routes[0];

  return {
    polyline: route.geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    startAddress: `${originLat.toFixed(4)},${originLng.toFixed(4)}`,
    endAddress: `${destLat.toFixed(4)},${destLng.toFixed(4)}`,
  };
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npx tsc --noEmit 2>&1 | grep "mapbox-directions"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && git add src/lib/mapbox-directions.ts && git commit -m "feat: add Mapbox Directions API v5 client"
```

---

### Task 6: Update Route API — Add Mapbox Provider Branch

**Files:**
- Modify: `src/app/api/route/route.ts`

- [ ] **Step 1: Add Mapbox imports and update schema**

At the top of `src/app/api/route/route.ts`, add the import (after line 5):

```typescript
import { fetchDirectionsMapbox } from '@/lib/mapbox-directions';
import { decodePolyline, encodePolyline } from '@/lib/polyline';
```

Update the existing `decodePolyline` import on line 7 — it's already imported from `@/lib/polyline`, so just update to also import `encodePolyline`:

```typescript
import { decodePolyline, encodePolyline } from '@/lib/polyline';
```

Update the provider enum on line 41:

```typescript
// Before
provider: z.enum(['osrm', 'google']).default('osrm'),

// After
provider: z.enum(['osrm', 'mapbox', 'google']).default('osrm'),
```

- [ ] **Step 2: Refactor coordinate validation to shared guard**

Replace lines 120-161 (the try block's directions fetching logic) with three-way branching. The full replacement for the directions-fetching section inside the try block:

```typescript
    // Shared coordinate validation for Google and Mapbox
    if (provider !== 'osrm') {
      if (startLat == null || startLng == null || endLat == null || endLng == null) {
        return NextResponse.json(
          { error: `${provider === 'google' ? 'Google' : 'Mapbox'} mode requires coordinates — select locations from the autocomplete dropdown` },
          { status: 400 },
        );
      }
    }

    // Get route from selected provider
    let directions;
    if (provider === 'google') {
      const cached = await getCachedRoute(startLat!, startLng!, endLat!, endLng!, 'google');
      if (cached) {
        directions = {
          polyline: cached.polyline,
          distanceMeters: cached.distanceMeters,
          durationSeconds: cached.durationSeconds,
          startAddress: start,
          endAddress: end,
        };
      } else {
        const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!googleApiKey) {
          return NextResponse.json(
            { error: 'Google Maps API key not configured on server' },
            { status: 500 },
          );
        }
        directions = await fetchDirectionsGoogle(
          startLat!, startLng!, endLat!, endLng!,
          googleApiKey,
        );
        await setCachedRoute(startLat!, startLng!, endLat!, endLng!, 'google', {
          polyline: directions.polyline,
          distanceMeters: directions.distanceMeters,
          durationSeconds: directions.durationSeconds,
        });
      }
    } else if (provider === 'mapbox') {
      const cached = await getCachedRoute(startLat!, startLng!, endLat!, endLng!, 'mapbox');
      if (cached) {
        directions = {
          polyline: cached.polyline,
          distanceMeters: cached.distanceMeters,
          durationSeconds: cached.durationSeconds,
          startAddress: start,
          endAddress: end,
        };
      } else {
        const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
        if (!mapboxToken) {
          return NextResponse.json(
            { error: 'Mapbox access token not configured on server' },
            { status: 500 },
          );
        }
        const mapboxResult = await fetchDirectionsMapbox(
          startLat!, startLng!, endLat!, endLng!,
          mapboxToken,
        );
        // Normalize precision-6 polyline to precision-5 for uniform downstream use
        const decoded = decodePolyline(mapboxResult.polyline, 6);
        const normalizedPolyline = encodePolyline(decoded, 5);

        directions = {
          polyline: normalizedPolyline,
          distanceMeters: mapboxResult.distanceMeters,
          durationSeconds: mapboxResult.durationSeconds,
          startAddress: mapboxResult.startAddress,
          endAddress: mapboxResult.endAddress,
        };
        await setCachedRoute(startLat!, startLng!, endLat!, endLng!, 'mapbox', {
          polyline: normalizedPolyline,
          distanceMeters: directions.distanceMeters,
          durationSeconds: directions.durationSeconds,
        });
      }
    } else {
      directions = await fetchDirections(start, end);
    }
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npx tsc --noEmit 2>&1 | grep "route.ts"
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && git add src/app/api/route/route.ts && git commit -m "feat: add Mapbox provider branch to route API with polyline normalization"
```

---

### Task 7: Create MapboxMap Component

**Files:**
- Create: `src/components/MapboxMap.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the MapboxMap component**

Create `src/components/MapboxMap.tsx`:

```typescript
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MapGL, { Source, Layer, Marker, Popup, useMap } from 'react-map-gl';
import type { LineLayer } from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { TripPlan, ChargingStop } from '@/types';
import { decodePolyline } from '@/lib/polyline';
import {
  VIETNAM_CENTER,
  VIETNAM_ZOOM,
  PROVIDER_COLORS,
  DEFAULT_MARKER_COLOR,
  escapeHtml,
} from '@/lib/map-utils';

interface MapboxMapProps {
  readonly tripPlan: TripPlan | null;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

const ROUTE_LAYER: LineLayer = {
  id: 'route-line',
  type: 'line',
  paint: {
    'line-color': '#00D4AA',
    'line-width': 4,
    'line-opacity': 0.9,
  },
};

function EndpointMarker({ lat, lng, label }: { readonly lat: number; readonly lng: number; readonly label: string }) {
  return (
    <Marker latitude={lat} longitude={lng} anchor="center">
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#00D4AA',
          border: '2px solid #0A0A0B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: 13,
          color: '#0A0A0B',
          fontFamily: 'system-ui',
        }}
      >
        {label}
      </div>
    </Marker>
  );
}

function StopMarker({
  stop,
  index,
  isSelected,
  onSelect,
}: {
  readonly stop: ChargingStop;
  readonly index: number;
  readonly isSelected: boolean;
  readonly onSelect: (index: number | null) => void;
}) {
  const color = PROVIDER_COLORS[stop.station.provider] ?? DEFAULT_MARKER_COLOR;

  return (
    <>
      <Marker
        latitude={stop.station.latitude}
        longitude={stop.station.longitude}
        anchor="center"
        onClick={(e) => {
          e.originalEvent.stopPropagation();
          onSelect(isSelected ? null : index);
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: color,
            border: '2px solid #0A0A0B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: 11,
            color: '#0A0A0B',
            fontFamily: 'system-ui',
            cursor: 'pointer',
          }}
        >
          {index + 1}
        </div>
      </Marker>
      {isSelected && (
        <Popup
          latitude={stop.station.latitude}
          longitude={stop.station.longitude}
          offset={16}
          closeOnClick={false}
          onClose={() => onSelect(null)}
        >
          <div style={{ fontFamily: 'system-ui', maxWidth: 250 }}>
            <h3 style={{ fontWeight: 'bold', margin: '0 0 4px' }}>{escapeHtml(stop.station.name)}</h3>
            <p style={{ fontSize: 12, margin: '0 0 4px', color: '#666' }}>{escapeHtml(stop.station.address)}</p>
            <p style={{ fontSize: 12, margin: 0 }}>
              <span style={{ color: '#FF3B30', fontWeight: 'bold' }}>{stop.arrivalBatteryPercent}%</span>
              {' → '}
              <span style={{ color: '#00D4AA', fontWeight: 'bold' }}>{stop.departureBatteryPercent}%</span>
              {` | ~${stop.estimatedChargingTimeMin}min`}
            </p>
            <p style={{ fontSize: 11, margin: '4px 0 0', color: '#888' }}>
              ⚡ {stop.station.maxPowerKw}kW | {stop.station.connectorTypes.join(', ')} | {stop.station.provider}
            </p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${stop.station.latitude},${stop.station.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '4px 12px',
                background: '#00D4AA',
                color: '#0A0A0B',
                borderRadius: 4,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            >
              Navigate
            </a>
          </div>
        </Popup>
      )}
    </>
  );
}

function TripOverlay({ tripPlan }: { readonly tripPlan: TripPlan }) {
  const { current: mapRef } = useMap();
  const [selectedStop, setSelectedStop] = useState<number | null>(null);

  const path = useMemo(() => decodePolyline(tripPlan.polyline), [tripPlan.polyline]);

  const routeGeoJson = useMemo(
    () => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: path.map((p) => [p.lng, p.lat]),
      },
      properties: {},
    }),
    [path],
  );

  // Auto-fit bounds to route and charging stops
  useEffect(() => {
    if (!mapRef || path.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds(
      [path[0].lng, path[0].lat],
      [path[0].lng, path[0].lat],
    );
    path.forEach((p) => bounds.extend([p.lng, p.lat]));
    tripPlan.chargingStops.forEach((stop) => {
      bounds.extend([stop.station.longitude, stop.station.latitude]);
    });
    mapRef.fitBounds(bounds, { padding: 50 });
  }, [mapRef, path, tripPlan.chargingStops]);

  const handleStopSelect = useCallback((index: number | null) => {
    setSelectedStop(index);
  }, []);

  return (
    <>
      <Source id="route" type="geojson" data={routeGeoJson}>
        <Layer {...ROUTE_LAYER} />
      </Source>

      {path.length > 0 && (
        <>
          <EndpointMarker lat={path[0].lat} lng={path[0].lng} label="A" />
          <EndpointMarker lat={path[path.length - 1].lat} lng={path[path.length - 1].lng} label="B" />
        </>
      )}

      {tripPlan.chargingStops.map((stop, index) => (
        <StopMarker
          key={stop.station.id}
          stop={stop}
          index={index}
          isSelected={selectedStop === index}
          onSelect={handleStopSelect}
        />
      ))}
    </>
  );
}

export default function MapboxMap({ tripPlan }: MapboxMapProps) {
  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-danger)]">
        Mapbox access token not configured
      </div>
    );
  }

  return (
    <MapGL
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{
        latitude: VIETNAM_CENTER.lat,
        longitude: VIETNAM_CENTER.lng,
        zoom: VIETNAM_ZOOM,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
    >
      {tripPlan && <TripOverlay tripPlan={tripPlan} />}
    </MapGL>
  );
}
```

- [ ] **Step 2: Update page.tsx — add dynamic import and 3-way conditional render**

In `src/app/page.tsx`:

Add the dynamic import after line 24:

```typescript
const MapboxMap = dynamic(() => import('@/components/MapboxMap'), { ssr: false });
```

Replace the map rendering section (lines 237-243):

```typescript
        <main className="flex-1 relative min-h-[300px]">
          {mode === 'google' ? (
            <GoogleMap tripPlan={tripPlan} />
          ) : mode === 'mapbox' ? (
            <MapboxMap tripPlan={tripPlan} />
          ) : (
            <LeafletMap tripPlan={tripPlan} />
          )}
        </main>
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npm run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && git add src/components/MapboxMap.tsx src/app/page.tsx && git commit -m "feat: add MapboxMap component with route overlay and 3-way map rendering"
```

---

### Task 8: Add Mapbox Token to Vercel Environment

**Files:** None (external config)

- [ ] **Step 1: Set environment variables on Vercel**

The Mapbox token needs to be added to Vercel for production deployment. Add both `MAPBOX_ACCESS_TOKEN` and `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` via the Vercel dashboard (Settings > Environment Variables). Use the same token value from the local `.env` file.

Alternatively, use the Vercel CLI:

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npx vercel env add MAPBOX_ACCESS_TOKEN
# Enter: <your-mapbox-token-from-.env>

cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npx vercel env add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
# Enter: <your-mapbox-token-from-.env>
```

Note: This step may require the user's Vercel credentials. Skip if not available and handle via Vercel dashboard manually.

---

### Task 9: Smoke Test — Manual Verification

**Files:** None

- [ ] **Step 1: Start dev server**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npm run dev
```

- [ ] **Step 2: Verify OSM mode works**

Open `http://localhost:3000`. Confirm:
- Toggle shows `[OSM | Mapbox | Google]`
- OSM is selected by default
- Leaflet map renders with dark tiles
- Plan a trip — route and charging stops display correctly

- [ ] **Step 3: Verify Mapbox mode works**

Click "Mapbox" in the toggle. Confirm:
- Mapbox dark map renders
- Select start and end locations from autocomplete
- Plan a trip — route polyline and charging stop markers display
- Click a charging stop — popup shows station info with Navigate button

- [ ] **Step 4: Verify Google mode still works**

Click "Google" in the toggle. Confirm:
- Google Maps renders with dark theme
- Route planning works as before

- [ ] **Step 5: Verify mode persistence**

Switch to Mapbox, reload the page. Confirm Mapbox is still selected.

---

### Task 10: Final Commit and Push

**Files:** None

- [ ] **Step 1: Verify all changes are committed**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && git status
```

Expected: Clean working tree.

- [ ] **Step 2: Push to remote**

```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && git push
```

This triggers Vercel auto-deployment via GitHub Actions.
