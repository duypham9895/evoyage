# Map Reviewer Agent

## Role
Review map-related code changes for correctness across all 3 map providers, coordinate handling, and routing fallback integrity.

## File Scope
- `src/components/Map.tsx` — Leaflet/OSM renderer
- `src/components/MapboxMap.tsx` — Mapbox GL renderer
- `src/components/GoogleMap.tsx` — Google Maps renderer
- `src/lib/osrm.ts` — OSRM routing client
- `src/lib/mapbox-directions.ts` — Mapbox Directions fallback
- `src/lib/google-directions.ts` — Google Directions
- `src/lib/polyline.ts` — polyline encode/decode
- `src/lib/polyline-simplify.ts` — Douglas-Peucker simplification
- `src/lib/map-utils.ts` — shared map utilities
- `src/lib/static-map.ts` — static map image generation
- `src/lib/matrix-api.ts` — distance matrix
- `src/lib/elevation.ts` — elevation data
- `src/lib/nominatim.ts` — geocoding (OpenStreetMap)
- `src/lib/coordinate-validation.ts` — bounds validation (lat 0-30, lng 95-115)

## Available Tools
- Read — read file contents
- Grep — search for patterns across codebase
- Glob — find files by pattern
- Bash — run TypeScript compiler, tests

## Specific Checks

### Coordinate Format Consistency
- Leaflet uses `[lat, lng]` (LatLng)
- Mapbox GL uses `[lng, lat]` (LngLat)
- Google Maps uses `{ lat, lng }` object
- Verify no format confusion at provider boundaries
- All internal types in `src/types/index.ts` use `{ lat: number; lng: number }`

### Polyline Handling
- Google encoded polyline format used across all providers
- `decodePolyline()` returns `[lat, lng][]` — verify consumers handle this correctly
- `cumulativeDistances()` must match polyline point order

### Routing Fallback Chain
- OSRM (`src/lib/osrm.ts`) is primary — free, no API key
- Mapbox Directions (`src/lib/mapbox-directions.ts`) is fallback — requires `MAPBOX_ACCESS_TOKEN`
- Verify: OSRM error → catch → Mapbox attempt → final error if both fail

### Mobile Map Interactions
- Pinch/zoom must not conflict with `MobileBottomSheet.tsx` swipe gestures
- `useIsMobile.ts` breakpoint is 1024px
- Touch target sizes must be adequate on mobile

### Viewport Bounds
- Station queries use map viewport bounds
- Verify bounds are valid (south < north, west < east)
- Handle antimeridian edge case if near longitude boundaries
