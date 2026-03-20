---
name: map-testing
description: Verify map-related code changes work across all 3 providers
trigger: Map components or routing/geo libraries are modified
---

# Map Testing Skill

## Scope

Map renderers:
- `src/components/Map.tsx` — Leaflet/OpenStreetMap (default)
- `src/components/MapboxMap.tsx` — Mapbox GL JS (fallback)
- `src/components/GoogleMap.tsx` — Google Maps (hidden, must compile)

Routing libraries:
- `src/lib/osrm.ts` — OSRM routing client (primary)
- `src/lib/mapbox-directions.ts` — Mapbox Directions API (fallback)
- `src/lib/google-directions.ts` — Google Directions

Geo utilities:
- `src/lib/polyline.ts` — Google polyline encode/decode
- `src/lib/polyline-simplify.ts` — Douglas-Peucker simplification
- `src/lib/map-utils.ts` — shared map utilities
- `src/lib/static-map.ts` — static map image generation
- `src/lib/matrix-api.ts` — distance matrix
- `src/lib/elevation.ts` — elevation data
- `src/lib/nominatim.ts` — geocoding
- `src/lib/coordinate-validation.ts` — bounds validation

## Checks

1. **Cross-provider compilation**
   - Run `npx tsc --noEmit` — all 3 map components must compile
   - Check that shared types from `src/types/index.ts` are used consistently

2. **Polyline integrity**
   - If `polyline.ts` changed, verify `decodePolyline` and `cumulativeDistances` still work
   - Run `npx vitest run` for any polyline-related tests

3. **Coordinate validation**
   - Any new coordinate handling must use `isValidCoordinate()` or `coordinateSchema`
   - Bounds: lat 0-30, lng 95-115 (Southeast Asia)

4. **Routing fallback chain**
   - If OSRM code changed, verify Mapbox fallback still works
   - Check error handling: OSRM failure should trigger Mapbox, not crash

5. **Marker and viewport logic**
   - If marker placement changed, verify it uses consistent coordinate format [lat, lng]
   - Leaflet uses [lat, lng], Mapbox uses [lng, lat] — check for format confusion

6. **Mobile interactions**
   - Map touch interactions (pinch zoom, pan) must not conflict with `MobileBottomSheet.tsx` swipe gestures
   - Check `useIsMobile` hook usage for mobile-specific map behavior

## Output

Report which providers are affected, any compilation errors, and whether the routing fallback chain is intact.
