# Google Maps Dual-Mode Design

## Overview

Add a dual-mode routing system to EVoyage, allowing users to switch between the existing OSRM/Leaflet stack and a full Google Maps experience (Google Directions API + Google Maps renderer). The mode preference persists across sessions via localStorage.

Additionally, improve the battery journey progress bar visibility by updating the `--color-safe` CSS variable to teal and increasing bar height.

## Architecture & Data Flow

```
User toggles mode (Header)
  -> MapMode context updates ("leaflet" | "google")
  -> localStorage persists choice

User clicks "Plan Trip"
  -> TripInput reads current mode
  -> POST /api/route { ...body, provider: "osrm" | "google" }
  -> Route API:
      1. Validate with Zod (same schema + provider field, default: "osrm")
      2. Resolve vehicle (same logic)
      3. if provider === "google":
           -> pass lat/lng coordinates directly to Google Directions API
           (avoids re-geocoding Nominatim display names)
         else:
           -> call OSRM (existing logic)
      4. planChargingStops() -- same algorithm, same polyline format
      5. Return TripPlan (identical shape for both providers)

  -> Client receives TripPlan
  -> if mode === "google":
      -> GoogleMap component renders (Maps JS API, dark styled)
    else:
      -> Leaflet Map component renders (existing)
```

Key principle: The TripPlan response shape is identical regardless of provider. Only the routing source and map renderer change. The charging stop algorithm, battery segments, and trip summary are untouched.

**Geocoding strategy:** Both modes use Nominatim for place search (PlaceAutocomplete). Nominatim returns lat/lng with each result. When calling the Google Directions API, we pass lat/lng coordinates directly (not address strings) to avoid geocoding mismatches between Nominatim display names and Google's geocoder.

## New Files

| File | Purpose |
|------|---------|
| `src/lib/google-directions.ts` | Server-side Google Directions via plain `fetch`. Uses Directions API v1 (`maps.googleapis.com/maps/api/directions/json`) which returns precision-5 encoded polylines, compatible with existing `decodePolyline()`. Do NOT use Routes API v2 (precision-6 polylines). |
| `src/lib/map-mode.tsx` | React context for map mode with localStorage persistence. Must begin with `'use client'` directive. localStorage access must be inside `useEffect` (not at module level or render body), matching the pattern in `locale.tsx`. |
| `src/components/GoogleMap.tsx` | Google Maps renderer (dark theme, route polyline, markers, info windows). Must include a fallback error state if `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is missing. Must include a loading skeleton while Maps JS script loads. |

## Modified Files

| File | Change |
|------|--------|
| `src/app/api/route/route.ts` | Add `provider: z.enum(["osrm", "google"]).default("osrm")` to Zod schema, branch routing logic. Accept lat/lng in request body for Google mode. |
| `src/components/Header.tsx` | Add mode toggle button next to language toggle |
| `src/components/Map.tsx` | Render only when mode is `leaflet` |
| `src/app/page.tsx` | Wrap in `MapModeProvider`, pass mode to API call, import `GoogleMap` via `dynamic(() => import(...), { ssr: false })` (same SSR guard as Leaflet `Map`), conditionally render map |
| `src/app/globals.css` | Update `--color-safe` from `#34C759` to `#00D4AA` (teal accent) — all components using `var(--color-safe)` update automatically |
| `src/components/TripSummary.tsx` | Bar height: 24px -> 28px, add subtle dark background track. Color change handled by CSS variable update (no hardcoded hex). |
| `src/types/index.ts` | Add `MapMode` type, extend route request with `provider`. Remove stale `RouteCalculationInput` interface. |
| `.env.example` | Add `GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |

## Untouched (Reused As-Is)

- `src/lib/route-planner.ts` -- charging stop algorithm
- `src/lib/station-finder.ts` -- station search
- `src/lib/range-calculator.ts` -- range calculation
- `src/lib/polyline.ts` -- polyline decode (Google encoded format, precision 5, works for both OSRM and Google Directions v1)
- `src/components/TripInput.tsx`
- `src/components/BatteryStatusPanel.tsx`
- `src/components/BrandModelSelector.tsx`

## Component Details

### Header Toggle

- Segmented control styled like the existing language toggle (VI/EN)
- Two options: **Map** (Leaflet) | **Google** (Google Maps)
- Accent teal (#00D4AA) for active state via `var(--color-accent)`
- Placed to the left of the language toggle

### Google Directions Integration (`google-directions.ts`)

- `fetchDirectionsGoogle(originLat, originLng, destLat, destLng, apiKey)` -> `{ polyline, distanceMeters, durationSeconds }`
- Uses Google Directions API v1 endpoint: `maps.googleapis.com/maps/api/directions/json`
- MUST NOT use Routes API v2 (`routes.googleapis.com`) — it uses precision-6 polylines incompatible with `decodePolyline()`
- Accepts lat/lng coordinates directly (not address strings) to avoid Nominatim/Google geocoding mismatches
- Plain `fetch` calls (consistent with existing OSRM pattern in `osrm.ts`)
- Returns polyline in Google encoded format (precision 5) — `decodePolyline()` works unchanged

### GoogleMap Component (`GoogleMap.tsx`)

- Uses `@vis.gl/react-google-maps` for React-friendly rendering
- Imported via `dynamic(() => import(...), { ssr: false })` in `page.tsx` — same SSR guard as Leaflet `Map`
- **Loading state:** Pulsing skeleton placeholder while Maps JS script loads (matching existing loading patterns)
- **Error state:** If `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is falsy, render visible error message ("Google Maps API key not configured")
- Dark theme via Google Maps JSON styling (matching CartoDB Dark Matter feel)
- Same visual language as Leaflet version:
  - Route polyline: teal via `var(--color-accent)`, 4px weight
  - Start marker: green circle "A"
  - End marker: green circle "B"
  - Charging stops: numbered circles, colored by provider
  - Info windows with same data as Leaflet popups
- Auto-fits bounds to route + charging stops

### Map Mode Context (`map-mode.tsx`)

- File MUST begin with `'use client'` directive
- `MapModeProvider` wraps the app (inside `page.tsx`, alongside `LocaleProvider`)
- `useMapMode()` hook returns `{ mode, setMode }`
- localStorage access MUST be inside `useEffect` (not at module level or render body), matching the pattern in `locale.tsx`
- On mount, reads from `localStorage('evoyage-map-mode')`, defaults to `"leaflet"`
- On change, writes to `localStorage`

### Progress Bar Update

- `globals.css`: Update `--color-safe` from `#34C759` to `#00D4AA` (teal accent)
- `TripSummary.tsx`: Bar height 24px -> 28px, add dark background track
- No hardcoded hex values in components — all colors via CSS variables

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@vis.gl/react-google-maps` | `^1.5` | Client-side Google Maps rendering + JS API script management |

No other new dependencies. Server-side Google API calls use plain `fetch`.

## Environment Variables

| Variable | Scope | APIs |
|----------|-------|------|
| `GOOGLE_MAPS_API_KEY` | Server-only | Directions API v1 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Client (browser) | Maps JavaScript API only |

### Security Restrictions (Google Cloud Console)

- Server key: restrict by IP / Vercel deployment
- Client key: restrict by HTTP referrer (`evoyagevn.vercel.app/*`, `localhost:*`)
- Set monthly usage caps on both keys to control billing

## Design Decisions

1. **Shared route API with provider param** over separate endpoints — avoids code duplication, same charging stop algorithm for both
2. **`provider` defaults to `"osrm"`** in Zod schema — backward compatible, existing callers without provider field still work
3. **Pass lat/lng to Google Directions** instead of re-geocoding address strings — avoids Nominatim/Google geocoding mismatches since PlaceAutocomplete already provides coordinates
4. **Google Directions API v1** (not Routes API v2) — precision-5 polylines match existing `decodePolyline()`, no code changes needed
5. **Plain `fetch` over `@googlemaps/google-maps-services-js`** — consistent with existing OSRM pattern, zero extra server dependency
6. **`@vis.gl/react-google-maps` for client rendering** — Google's official React library, handles script loading and lifecycle
7. **localStorage for mode persistence** — simple, no server state needed, instant on page load
8. **CSS variable update** for progress bar color — maintains existing convention, one change propagates everywhere
9. **`dynamic()` SSR guard** for GoogleMap — same pattern as existing Leaflet Map, prevents Node.js SSR errors
