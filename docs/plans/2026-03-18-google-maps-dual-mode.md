# Google Maps Dual-Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle in the Header to switch between OSRM/Leaflet and Google Maps for routing and map rendering, while improving the progress bar visibility.

**Architecture:** Shared `/api/route` endpoint with a `provider` param that branches between OSRM and Google Directions API v1. Client renders either Leaflet or Google Maps based on a persisted context. Coordinates flow from Nominatim (lat/lng) through the API to avoid re-geocoding.

**Tech Stack:** Next.js 16, React 19, `@vis.gl/react-google-maps` ^1.5, Google Directions API v1, Zod, Tailwind CSS 4

---

### Task 1: Update CSS variable and progress bar height

**Files:**
- Modify: `src/app/globals.css:12` (change `--color-safe`)
- Modify: `src/components/TripSummary.tsx:86` (bar height)

- [ ] **Step 1: Update `--color-safe` in globals.css**

In `src/app/globals.css`, change line 12:
```css
/* Before */
--color-safe: #34C759;
/* After */
--color-safe: #00D4AA;
```

- [ ] **Step 2: Increase battery bar height and add background track**

In `src/components/TripSummary.tsx`, change the bar container (line 86):
```tsx
{/* Before */}
<div className="flex h-6 rounded-full overflow-hidden bg-[var(--color-background)]">

{/* After */}
<div className="flex h-7 rounded-full overflow-hidden bg-[var(--color-surface-hover)]">
```

- [ ] **Step 3: Verify visually**

Run: `cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npm run dev`
Open browser, plan a trip, verify the battery bar is teal and taller with a visible dark track behind segments.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/TripSummary.tsx
git commit -m "feat: update progress bar color to teal and increase height"
```

---

### Task 2: Add types and clean up stale interface

**Files:**
- Modify: `src/types/index.ts:134-142` (remove `RouteCalculationInput`, add `MapMode`)

- [ ] **Step 1: Remove stale `RouteCalculationInput` and add `MapMode` type**

In `src/types/index.ts`, replace lines 134-142:
```typescript
// Remove this:
export interface RouteCalculationInput {
  readonly startPlaceId: string;
  readonly endPlaceId: string;
  readonly vehicleId: string | null;
  readonly customVehicle: CustomVehicleInput | null;
  readonly currentBatteryPercent: number;
  readonly minArrivalPercent: number;
  readonly rangeSafetyFactor: number;
}

// Add this:
export type MapMode = 'leaflet' | 'google';
```

- [ ] **Step 2: Verify no references to `RouteCalculationInput`**

Run: `grep -r "RouteCalculationInput" src/`
Expected: No matches (it was unused dead code).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: replace stale RouteCalculationInput with MapMode type"
```

---

### Task 3: Create MapMode context with localStorage persistence

**Files:**
- Create: `src/lib/map-mode.tsx`

- [ ] **Step 1: Create the context file**

Create `src/lib/map-mode.tsx`:
```tsx
'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { MapMode } from '@/types';

interface MapModeContextType {
  readonly mode: MapMode;
  readonly setMode: (mode: MapMode) => void;
}

const STORAGE_KEY = 'evoyage-map-mode';

const MapModeContext = createContext<MapModeContextType>({
  mode: 'leaflet',
  setMode: () => {},
});

export function MapModeProvider({ children }: { readonly children: ReactNode }) {
  const [mode, setModeState] = useState<MapMode>('leaflet');

  // Load persisted mode from localStorage (must be in useEffect for SSR safety)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'leaflet' || saved === 'google') {
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

- [ ] **Step 2: Commit**

```bash
git add src/lib/map-mode.tsx
git commit -m "feat: add MapMode context with localStorage persistence"
```

---

### Task 4: Add Header mode toggle

**Files:**
- Modify: `src/components/Header.tsx`

- [ ] **Step 1: Add the toggle to Header**

Replace the entire `src/components/Header.tsx`:
```tsx
'use client';

import { useLocale } from '@/lib/locale';
import { useMapMode } from '@/lib/map-mode';

export default function Header() {
  const { locale, toggleLocale, t } = useLocale();
  const { mode, setMode } = useMapMode();

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-surface-hover)]">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold font-[family-name:var(--font-heading)] text-[var(--color-accent)]">
          ⚡ EVoyage
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Map mode toggle */}
        <div className="flex items-center gap-1.5 bg-[var(--color-background)] rounded-lg border border-[var(--color-surface-hover)] p-0.5">
          <button
            onClick={() => setMode('leaflet')}
            className={`px-2.5 py-1 text-xs rounded-md transition-all ${
              mode === 'leaflet'
                ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-bold'
                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
            }`}
            aria-label="Use Leaflet map"
          >
            {t('Bản đồ', 'Map')}
          </button>
          <button
            onClick={() => setMode('google')}
            className={`px-2.5 py-1 text-xs rounded-md transition-all ${
              mode === 'google'
                ? 'bg-[var(--color-accent)] text-[var(--color-background)] font-bold'
                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
            }`}
            aria-label="Use Google Maps"
          >
            Google
          </button>
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

- [ ] **Step 2: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat: add map mode toggle to header"
```

---

### Task 5: Install `@vis.gl/react-google-maps` and set up env vars

**Files:**
- Modify: `package.json`
- Modify: `.env`

- [ ] **Step 1: Install the package**

Run:
```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npm install @vis.gl/react-google-maps@^1.5
```

- [ ] **Step 2: Add API keys to `.env`**

Append the Google Maps API keys (server + client) to `.env`. Do NOT commit `.env` to git.

- [ ] **Step 3: Commit (package.json + lockfile only, NOT .env)**

```bash
git add package.json package-lock.json
git commit -m "feat: add @vis.gl/react-google-maps dependency"
```

---

### Task 6: Create Google Directions server-side client

**Files:**
- Create: `src/lib/google-directions.ts`

- [ ] **Step 1: Create the Google Directions client**

Create `src/lib/google-directions.ts`:
```typescript
/**
 * Google Directions API v1 client.
 * Uses maps.googleapis.com/maps/api/directions/json (precision-5 polylines).
 * DO NOT use Routes API v2 (routes.googleapis.com) — it uses precision-6 polylines
 * incompatible with our decodePolyline() function.
 */

interface DirectionsResult {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly startAddress: string;
  readonly endAddress: string;
}

const DIRECTIONS_BASE = 'https://maps.googleapis.com/maps/api/directions/json';

/**
 * Fetch driving directions from Google Directions API v1.
 * Accepts lat/lng directly to avoid Nominatim/Google geocoding mismatches.
 */
export async function fetchDirectionsGoogle(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string,
): Promise<DirectionsResult> {
  const params = new URLSearchParams({
    origin: `${originLat},${originLng}`,
    destination: `${destLat},${destLng}`,
    mode: 'driving',
    key: apiKey,
  });

  const response = await fetch(`${DIRECTIONS_BASE}?${params}`);

  if (!response.ok) {
    throw new Error(`Google Directions API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== 'OK' || !data.routes?.length) {
    throw new Error(`Google Directions: ${data.status} — ${data.error_message ?? 'No route found'}`);
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  return {
    polyline: route.overview_polyline.points,
    distanceMeters: leg.distance.value,
    durationSeconds: leg.duration.value,
    startAddress: leg.start_address,
    endAddress: leg.end_address,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/google-directions.ts
git commit -m "feat: add Google Directions API v1 server-side client"
```

---

### Task 7: Update route API to support provider switching

**Files:**
- Modify: `src/app/api/route/route.ts`

- [ ] **Step 1: Update Zod schema and add Google provider branch**

Replace `src/app/api/route/route.ts` entirely:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { fetchDirections } from '@/lib/osrm';
import { fetchDirectionsGoogle } from '@/lib/google-directions';
import { planChargingStops } from '@/lib/route-planner';
import type { ChargingStationData, TripPlan } from '@/types';

const routeRequestSchema = z.object({
  start: z.string().min(1).max(200),
  end: z.string().min(1).max(200),
  startLat: z.number().optional(),
  startLng: z.number().optional(),
  endLat: z.number().optional(),
  endLng: z.number().optional(),
  vehicleId: z.string().nullable(),
  customVehicle: z
    .object({
      brand: z.string().min(1),
      model: z.string().min(1),
      batteryCapacityKwh: z.number().positive(),
      officialRangeKm: z.number().positive(),
      chargingTimeDC_10to80_min: z.number().positive().optional(),
      chargingPortType: z.string().optional(),
    })
    .nullable(),
  currentBatteryPercent: z.number().min(10).max(100),
  minArrivalPercent: z.number().min(5).max(30),
  rangeSafetyFactor: z.number().min(0.5).max(1.0),
  provider: z.enum(['osrm', 'google']).default('osrm'),
});

/**
 * POST /api/route — Calculate a trip plan with charging stops.
 * Supports both OSRM and Google Directions providers.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = routeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    start,
    end,
    startLat,
    startLng,
    endLat,
    endLng,
    vehicleId,
    customVehicle,
    currentBatteryPercent,
    minArrivalPercent,
    rangeSafetyFactor,
    provider,
  } = parsed.data;

  // Resolve vehicle
  let vehicle: {
    brand: string;
    model: string;
    variant: string | null;
    officialRangeKm: number;
    batteryCapacityKwh: number;
    chargingTimeDC_10to80_min: number | null;
  };

  if (vehicleId) {
    const dbVehicle = await prisma.eVVehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!dbVehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }
    vehicle = {
      brand: dbVehicle.brand,
      model: dbVehicle.model,
      variant: dbVehicle.variant,
      officialRangeKm: dbVehicle.officialRangeKm,
      batteryCapacityKwh: dbVehicle.batteryCapacityKwh,
      chargingTimeDC_10to80_min: dbVehicle.chargingTimeDC_10to80_min,
    };
  } else if (customVehicle) {
    vehicle = {
      brand: customVehicle.brand,
      model: customVehicle.model,
      variant: null,
      officialRangeKm: customVehicle.officialRangeKm,
      batteryCapacityKwh: customVehicle.batteryCapacityKwh,
      chargingTimeDC_10to80_min: customVehicle.chargingTimeDC_10to80_min ?? null,
    };
  } else {
    return NextResponse.json(
      { error: 'Either vehicleId or customVehicle must be provided' },
      { status: 400 },
    );
  }

  try {
    // Get route from selected provider
    let directions;
    if (provider === 'google') {
      if (startLat == null || startLng == null || endLat == null || endLng == null) {
        return NextResponse.json(
          { error: 'Google mode requires coordinates — select locations from the autocomplete dropdown' },
          { status: 400 },
        );
      }
      directions = await fetchDirectionsGoogle(
        startLat, startLng, endLat, endLng,
        process.env.GOOGLE_MAPS_API_KEY!,
      );
    } else {
      directions = await fetchDirections(start, end);
    }

    const totalDistanceKm = directions.distanceMeters / 1000;
    const totalDurationMin = Math.round(directions.durationSeconds / 60);

    // Get all charging stations from DB
    const dbStations = await prisma.chargingStation.findMany();
    const stations: ChargingStationData[] = dbStations.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      province: s.province,
      latitude: s.latitude,
      longitude: s.longitude,
      chargerTypes: JSON.parse(s.chargerTypes) as string[],
      connectorTypes: JSON.parse(s.connectorTypes) as string[],
      portCount: s.portCount,
      maxPowerKw: s.maxPowerKw,
      stationType: s.stationType as 'public' | 'private',
      isVinFastOnly: s.isVinFastOnly,
      operatingHours: s.operatingHours,
      provider: s.provider,
    }));

    // Plan charging stops
    const plan = planChargingStops({
      encodedPolyline: directions.polyline,
      totalDistanceKm,
      vehicle,
      currentBatteryPercent,
      minArrivalPercent,
      rangeSafetyFactor,
      stations,
    });

    const totalChargingTimeMin = plan.chargingStops.reduce(
      (sum, stop) => sum + stop.estimatedChargingTimeMin,
      0,
    );

    const tripPlan: TripPlan = {
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      totalDurationMin,
      chargingStops: plan.chargingStops,
      warnings: plan.warnings,
      batterySegments: plan.batterySegments,
      arrivalBatteryPercent: plan.arrivalBatteryPercent,
      totalChargingTimeMin,
      polyline: directions.polyline,
      startAddress: directions.startAddress,
      endAddress: directions.endAddress,
    };

    return NextResponse.json(tripPlan);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Route calculation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/route/route.ts
git commit -m "feat: add Google provider support to route API with coordinate passthrough"
```

---

### Task 8: Create GoogleMap component

**Files:**
- Create: `src/components/GoogleMap.tsx`

- [ ] **Step 1: Create the GoogleMap component**

Create `src/components/GoogleMap.tsx`:
```tsx
'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { APIProvider, Map, useMap, useMapsLibrary, useApiIsLoaded } from '@vis.gl/react-google-maps';
import type { TripPlan } from '@/types';
import { decodePolyline } from '@/lib/polyline';

interface GoogleMapProps {
  readonly tripPlan: TripPlan | null;
}

const VIETNAM_CENTER = { lat: 14.0583, lng: 108.2772 };
const VIETNAM_ZOOM = 6;

const PROVIDER_COLORS: Record<string, string> = {
  VinFast: '#34C759',
  EverCharge: '#007AFF',
  EVONE: '#5856D6',
  EVPower: '#FF9500',
  'CHARGE+': '#FF2D55',
};
const DEFAULT_MARKER_COLOR = '#8E8E93';

// Google Maps dark theme styling (matching CartoDB Dark Matter feel)
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0A0B' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8E8E93' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2C2C2E' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C2C2E' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1C1C1E' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3C3C3E' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A0A0B' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4A4A4C' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8E8E93' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1C1C1E' }] },
];

function createSvgMarkerUrl(color: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30">
    <circle cx="15" cy="15" r="13" fill="${color}" stroke="#0A0A0B" stroke-width="2"/>
    <text x="15" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#0A0A0B" font-family="system-ui">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function TripOverlay({ tripPlan }: { readonly tripPlan: TripPlan }) {
  const map = useMap();
  const markerLib = useMapsLibrary('marker');
  const overlaysRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const path = useMemo(() => decodePolyline(tripPlan.polyline), [tripPlan.polyline]);

  const clearOverlays = useCallback(() => {
    overlaysRef.current?.setMap(null);
    overlaysRef.current = null;
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];
    infoWindowRef.current?.close();
  }, []);

  useEffect(() => {
    if (!map || !markerLib) return;

    clearOverlays();

    // Route polyline
    const polyline = new google.maps.Polyline({
      path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
      strokeColor: '#00D4AA',
      strokeWeight: 4,
      strokeOpacity: 0.9,
      map,
    });
    overlaysRef.current = polyline;

    const infoWindow = new google.maps.InfoWindow();
    infoWindowRef.current = infoWindow;

    // Start marker
    if (path.length > 0) {
      const startImg = document.createElement('img');
      startImg.src = createSvgMarkerUrl('#00D4AA', 'A');
      startImg.width = 30;
      startImg.height = 30;
      const startMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: path[0].lat, lng: path[0].lng },
        content: startImg,
        title: `Start: ${tripPlan.startAddress}`,
      });
      startMarker.addListener('click', () => {
        infoWindow.setContent(`<b>Start:</b> ${tripPlan.startAddress}`);
        infoWindow.open({ anchor: startMarker, map });
      });
      markersRef.current.push(startMarker);

      // End marker
      const endPt = path[path.length - 1];
      const endImg = document.createElement('img');
      endImg.src = createSvgMarkerUrl('#00D4AA', 'B');
      endImg.width = 30;
      endImg.height = 30;
      const endMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: endPt.lat, lng: endPt.lng },
        content: endImg,
        title: `End: ${tripPlan.endAddress}`,
      });
      endMarker.addListener('click', () => {
        infoWindow.setContent(`<b>End:</b> ${tripPlan.endAddress}`);
        infoWindow.open({ anchor: endMarker, map });
      });
      markersRef.current.push(endMarker);
    }

    // Charging stop markers
    tripPlan.chargingStops.forEach((stop, index) => {
      const color = PROVIDER_COLORS[stop.station.provider] ?? DEFAULT_MARKER_COLOR;
      const img = document.createElement('img');
      img.src = createSvgMarkerUrl(color, `${index + 1}`);
      img.width = 26;
      img.height = 26;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: stop.station.latitude, lng: stop.station.longitude },
        content: img,
        title: stop.station.name,
      });

      marker.addListener('click', () => {
        infoWindow.setContent(`
          <div style="font-family:system-ui;max-width:250px">
            <h3 style="font-weight:bold;margin:0 0 4px">${stop.station.name}</h3>
            <p style="font-size:12px;margin:0 0 4px;color:#666">${stop.station.address}</p>
            <p style="font-size:12px;margin:0">
              <span style="color:#FF3B30;font-weight:bold">${stop.arrivalBatteryPercent}%</span>
              → <span style="color:#00D4AA;font-weight:bold">${stop.departureBatteryPercent}%</span>
              | ~${stop.estimatedChargingTimeMin}min
            </p>
            <p style="font-size:11px;margin:4px 0 0;color:#888">
              ⚡ ${stop.station.maxPowerKw}kW | ${stop.station.connectorTypes.join(', ')} | ${stop.station.provider}
            </p>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${stop.station.latitude},${stop.station.longitude}"
               target="_blank" rel="noopener noreferrer"
               style="display:inline-block;margin-top:8px;padding:4px 12px;background:#00D4AA;color:#0A0A0B;
                      border-radius:4px;text-decoration:none;font-size:12px;font-weight:bold">
              Navigate
            </a>
          </div>
        `);
        infoWindow.open({ anchor: marker, map });
      });

      markersRef.current.push(marker);
    });

    // Fit bounds
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    tripPlan.chargingStops.forEach((stop) => {
      bounds.extend({ lat: stop.station.latitude, lng: stop.station.longitude });
    });
    map.fitBounds(bounds, 50);

    return clearOverlays;
  }, [map, markerLib, tripPlan, path, clearOverlays]);

  return null;
}

function MapLoadingSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)] animate-pulse">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-sm text-[var(--color-muted)]">Loading Google Maps...</div>
      </div>
    </div>
  );
}

function MapContent({ tripPlan }: GoogleMapProps) {
  const isLoaded = useApiIsLoaded();

  if (!isLoaded) {
    return <MapLoadingSkeleton />;
  }

  return (
    <Map
      defaultCenter={VIETNAM_CENTER}
      defaultZoom={VIETNAM_ZOOM}
      styles={DARK_MAP_STYLES}
      gestureHandling="greedy"
      disableDefaultUI={false}
      className="w-full h-full"
    >
      {tripPlan && <TripOverlay tripPlan={tripPlan} />}
    </Map>
  );
}

export default function GoogleMapView({ tripPlan }: GoogleMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-danger)]">
        Google Maps API key not configured
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <MapContent tripPlan={tripPlan} />
    </APIProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/GoogleMap.tsx
git commit -m "feat: add GoogleMap component with dark theme and trip overlays"
```

---

### Task 9: Wire everything together in page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update page.tsx to support dual mode**

Key changes to `src/app/page.tsx`:
1. Import `MapModeProvider` and `useMapMode`
2. Add `dynamic` import for `GoogleMap` with `ssr: false`
3. Store lat/lng from Nominatim selection
4. Pass `provider` + coordinates to API call
5. Conditionally render Leaflet or Google map

Replace `src/app/page.tsx` entirely:
```tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { LocaleProvider } from '@/lib/locale';
import { MapModeProvider, useMapMode } from '@/lib/map-mode';
import Header from '@/components/Header';
import TripInput from '@/components/TripInput';
import BrandModelSelector from '@/components/BrandModelSelector';
import AddCustomVehicle from '@/components/AddCustomVehicle';
import BatteryStatusPanel from '@/components/BatteryStatusPanel';
import TripSummary from '@/components/TripSummary';
import type { EVVehicleData, CustomVehicleInput, TripPlan } from '@/types';
import type { NominatimResult } from '@/lib/nominatim';
import {
  DEFAULT_RANGE_SAFETY_FACTOR,
  DEFAULT_CURRENT_BATTERY,
  DEFAULT_MIN_ARRIVAL,
} from '@/types';

// Both map components must be loaded client-side only (use window/document)
const LeafletMap = dynamic(() => import('@/components/Map'), { ssr: false });
const GoogleMap = dynamic(() => import('@/components/GoogleMap'), { ssr: false });

function HomeContent() {
  const { mode } = useMapMode();

  // Trip inputs
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  // Store coordinates from Nominatim for Google mode
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [endCoords, setEndCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Vehicle
  const [selectedVehicle, setSelectedVehicle] = useState<EVVehicleData | null>(null);
  const [customVehicle, setCustomVehicle] = useState<CustomVehicleInput | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);

  // Battery
  const [currentBattery, setCurrentBattery] = useState(DEFAULT_CURRENT_BATTERY);
  const [minArrival, setMinArrival] = useState(DEFAULT_MIN_ARRIVAL);
  const [rangeSafetyFactor, setRangeSafetyFactor] = useState(DEFAULT_RANGE_SAFETY_FACTOR);

  // Trip result
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load persisted state from localStorage
  useEffect(() => {
    const savedRSF = localStorage.getItem('ev-planner-rsf');
    if (savedRSF) {
      const val = parseFloat(savedRSF);
      if (!isNaN(val) && val >= 0.5 && val <= 1.0) {
        setRangeSafetyFactor(val);
      }
    }

    const savedCustom = localStorage.getItem('ev-planner-custom-vehicle');
    if (savedCustom) {
      try {
        setCustomVehicle(JSON.parse(savedCustom));
      } catch { /* ignore invalid data */ }
    }
  }, []);

  // Persist RSF to localStorage
  const handleRSFChange = useCallback((val: number) => {
    setRangeSafetyFactor(val);
    localStorage.setItem('ev-planner-rsf', val.toString());
  }, []);

  // Save custom vehicle
  const handleSaveCustomVehicle = useCallback((vehicle: CustomVehicleInput) => {
    setCustomVehicle(vehicle);
    setSelectedVehicle(null);
    localStorage.setItem('ev-planner-custom-vehicle', JSON.stringify(vehicle));
  }, []);

  // Select DB vehicle (clears custom)
  const handleSelectVehicle = useCallback((vehicle: EVVehicleData | null) => {
    setSelectedVehicle(vehicle);
    setCustomVehicle(null);
  }, []);

  // Capture coordinates from Nominatim selection
  const handleStartSelect = useCallback((result: NominatimResult) => {
    setStartCoords({ lat: result.lat, lng: result.lng });
  }, []);

  const handleEndSelect = useCallback((result: NominatimResult) => {
    setEndCoords({ lat: result.lat, lng: result.lng });
  }, []);

  // Clear coords when text input changes manually
  const handleStartChange = useCallback((value: string) => {
    setStart(value);
    setStartCoords(null);
  }, []);

  const handleEndChange = useCallback((value: string) => {
    setEnd(value);
    setEndCoords(null);
  }, []);

  // Plan trip — POST to /api/route
  const handlePlanTrip = useCallback(async () => {
    if (!start || !end) {
      setError('Please enter start and end locations');
      return;
    }
    if (!selectedVehicle && !customVehicle) {
      setError('Please select a vehicle');
      return;
    }

    setIsPlanning(true);
    setError(null);
    setTripPlan(null);

    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start,
          end,
          startLat: startCoords?.lat,
          startLng: startCoords?.lng,
          endLat: endCoords?.lat,
          endLng: endCoords?.lng,
          vehicleId: selectedVehicle?.id ?? null,
          customVehicle: selectedVehicle ? null : customVehicle,
          currentBatteryPercent: currentBattery,
          minArrivalPercent: minArrival,
          rangeSafetyFactor,
          provider: mode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Route calculation failed');
      }

      setTripPlan(data as TripPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsPlanning(false);
    }
  }, [start, end, startCoords, endCoords, selectedVehicle, customVehicle, currentBattery, minArrival, rangeSafetyFactor, mode]);

  const activeVehicle = selectedVehicle ?? customVehicle;
  const canPlan = Boolean(start && end && activeVehicle && !isPlanning);

  return (
    <div className="h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar — inputs + summary */}
        <aside className="w-full lg:w-[380px] lg:min-w-[380px] overflow-y-auto bg-[var(--color-surface)] p-4 space-y-4 border-r border-[var(--color-surface-hover)]">
          <TripInput
            start={start}
            end={end}
            onStartChange={handleStartChange}
            onEndChange={handleEndChange}
            onStartSelect={handleStartSelect}
            onEndSelect={handleEndSelect}
            isLoaded={true}
          />

          <BrandModelSelector
            selectedVehicle={selectedVehicle}
            onSelect={handleSelectVehicle}
            onCustomCarClick={() => setShowCustomForm(true)}
          />

          <BatteryStatusPanel
            vehicle={activeVehicle}
            currentBattery={currentBattery}
            minArrival={minArrival}
            rangeSafetyFactor={rangeSafetyFactor}
            onCurrentBatteryChange={setCurrentBattery}
            onMinArrivalChange={setMinArrival}
            onRangeSafetyFactorChange={handleRSFChange}
          />

          {/* Plan trip button */}
          <button
            onClick={handlePlanTrip}
            disabled={!canPlan}
            className={`w-full py-3 rounded-lg font-bold font-[family-name:var(--font-heading)] text-lg transition-all ${
              canPlan
                ? 'bg-[var(--color-accent)] text-[var(--color-background)] hover:opacity-90 active:scale-[0.98]'
                : 'bg-[var(--color-surface-hover)] text-[var(--color-muted)] cursor-not-allowed'
            }`}
          >
            {isPlanning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-[var(--color-background)] border-t-transparent rounded-full animate-spin" />
                Planning...
              </span>
            ) : (
              'LÊN KẾ HOẠCH ⚡'
            )}
          </button>

          {/* Error display */}
          {error && (
            <div className="p-3 bg-[var(--color-danger)]/10 text-[var(--color-danger)] rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Trip results */}
          <TripSummary tripPlan={tripPlan} isLoading={isPlanning} />
        </aside>

        {/* Map pane */}
        <main className="flex-1 relative min-h-[300px]">
          {mode === 'google' ? (
            <GoogleMap tripPlan={tripPlan} />
          ) : (
            <LeafletMap tripPlan={tripPlan} />
          )}
        </main>
      </div>

      {/* Custom vehicle modal */}
      <AddCustomVehicle
        isOpen={showCustomForm}
        onClose={() => setShowCustomForm(false)}
        onSave={handleSaveCustomVehicle}
      />
    </div>
  );
}

export default function Home() {
  return (
    <LocaleProvider>
      <MapModeProvider>
        <HomeContent />
      </MapModeProvider>
    </LocaleProvider>
  );
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire dual-mode map rendering with coordinate passthrough"
```

---

### Task 10: Manual E2E verification

- [ ] **Step 1: Start dev server**

Run: `cd /Users/edwardpham/Documents/Programming/Projects/evoyage && npm run dev`

- [ ] **Step 2: Test Leaflet mode (default)**

1. Open http://localhost:3000
2. Verify Header shows `[Map | Google]` toggle with "Map" active (teal)
3. Plan a trip (e.g., Ho Chi Minh City → Vung Tau)
4. Verify Leaflet map renders with route + markers
5. Verify battery bar is teal (not green) and taller

- [ ] **Step 3: Test Google Maps mode**

1. Click "Google" in the Header toggle
2. Verify Google Maps loads with dark theme
3. Plan the same trip
4. Verify route polyline, start/end markers, charging stop markers
5. Click a charging stop marker — verify info window content
6. Verify "Navigate" link opens Google Maps

- [ ] **Step 4: Test persistence**

1. Refresh the page
2. Verify Google Maps mode is still selected (from localStorage)
3. Switch back to Leaflet, refresh, verify Leaflet is persisted

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Google Maps dual-mode with toggle, routing, and persistence"
```
