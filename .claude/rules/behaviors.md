# eVoyage Domain Behaviors

These rules are specific to the eVoyage codebase. They complement (not duplicate) global rules at `~/.claude/rules/common/`.

## Bilingual Routing

- All user-facing strings live in `src/locales/vi.json` (primary) and `src/locales/en.json` (mirror).
- Keys use `snake_case`: `plan_trip_button`, `vehicle_at_battery`.
- Interpolation uses `{{paramName}}` syntax — both locale files must have identical `{{}}` params.
- Use `t('key')` for simple lookups, `t('key', { param })` for interpolation, `tBi({ messageVi, messageEn })` for bilingual objects.
- Vietnamese is always written first; English follows as a translation of the Vietnamese.
- When adding a key, add to BOTH files in the same commit. Never leave one out of sync.

## Map Provider Abstraction

Three renderers exist: `Map.tsx` (Leaflet/OSM, default), `MapboxMap.tsx`, `GoogleMap.tsx`.
- OSM is the free default. Mapbox is fallback. Google Maps is hidden but code must compile.
- Map mode is stored in React Context (`useMapMode`), toggled by user.
- Any map feature must work (or gracefully degrade) across all 3 providers.
- Routing: `src/lib/osrm.ts` (primary, free) with fallback to `src/lib/mapbox-directions.ts`.
- Geocoding: `src/lib/nominatim.ts` (OpenStreetMap).
- Polyline: `src/lib/polyline.ts` (Google encoded polyline format for all providers).

## VinFast API Patterns

- `entity_id` identifies a station in VinFast's API; `storeId` is the alternate identifier.
- Resolution: `src/lib/vinfast-entity-resolver.ts` maps station DB record → entity_id/storeId.
- `ocmId` starting with `vinfast-` means storeId = ocmId minus the prefix.
- SSE detail fetching: `src/app/api/stations/[id]/vinfast-detail/route.ts` streams real-time data.
- Three VinFast integration files: `vinfast-browser.ts`, `vinfast-client.ts`, `vinfast-entity-resolver.ts`.
- Station details cached in `VinFastStationDetail` table (JSON cache, refreshed on demand).
- Daily cron (`src/app/api/cron/`) syncs station list from vinfastauto.com locators endpoint.

## Route Planner Pipeline

The trip planning flow follows this exact sequence:
1. Geocode start/end via Nominatim (`src/lib/nominatim.ts`)
2. Fetch directions: OSRM (`src/lib/osrm.ts`) → Mapbox fallback (`src/lib/mapbox-directions.ts`)
3. Decode polyline (`src/lib/polyline.ts` — `decodePolyline`, `cumulativeDistances`)
4. Find corridor stations (`src/lib/station-finder.ts` — `findStationsAlongRoute`)
5. Rank stations (`src/lib/station-ranker.ts` — composite scoring)
6. Plan charging stops (`src/lib/route-planner.ts` — battery simulation)

Corridor search constants (from `route-planner.ts`):
- `SEARCH_TRIGGER_KM = 80` — start looking when range < 80km
- `PRIMARY_CORRIDOR_KM = 5` — first search: 5km from route
- `FALLBACK_CORRIDOR_KM = 10` — second try: 10km from route
- `FALLBACK_RADIUS_KM = 15` — last resort: 15km circle

## Component Size Awareness

Actual line counts of the largest components:
- `ShareButton.tsx` — 574 lines (near 600-line warning threshold)
- `FeedbackModal.tsx` — 572 lines (near 600-line warning threshold)
- `TripSummary.tsx` — 543 lines
- `BatteryStatusPanel.tsx` — 332 lines

Rule: flag any component exceeding 600 lines. Extract sub-components before adding features to files above 500 lines.

## State Management Rules

- **URL state** (`src/hooks/useUrlState.ts`): debounced state ↔ URL sync for shareable trip links. Use for any state that should survive page reload or sharing.
- **localStorage**: user preferences (range safety factor, custom vehicles, recent trips). Never URL-encode these.
- **React Context**: locale (vi/en), map mode (osm/mapbox/google). Global toggles only.
- **In-memory**: trip cache for share card generation (`src/lib/trip-cache.ts`), route cache (`src/lib/route-cache.ts`).

## API Route Patterns

All API routes follow this structure:
1. Zod schema validation at entry (using schemas from `src/types/index.ts` or inline)
2. Rate limiting via `src/lib/rate-limit.ts` (Upstash Redis, in-memory fallback)
3. Graceful fallback when DB/API is unavailable
4. Coordinate validation via `src/lib/coordinate-validation.ts` (bounds: lat 0-30, lng 95-115)
5. Never leak stack traces or internal paths in error responses

Rate limits per endpoint (requests/minute):
- `/api/route` — 10
- `/api/vehicles` — 30
- `/api/stations` — 30
- `/api/feedback` — 3
- `/api/short-url` — 3
- `/api/share-card` — 3

## Coordinate Validation

The codebase validates coordinates against Southeast Asia bounds (not just Vietnam):
- Lat: 0 to 30, Lng: 95 to 115
- Defined in `src/lib/coordinate-validation.ts` using Zod schema
- Always use `isValidCoordinate()` or `coordinateSchema` — never hardcode bounds elsewhere

## Battery Math Constants

From `src/types/index.ts`:
- `DEFAULT_RANGE_SAFETY_FACTOR = 0.80`
- `MIN_RANGE_SAFETY_FACTOR = 0.50`, `MAX_RANGE_SAFETY_FACTOR = 1.00`
- `SAFETY_BUFFER_KM = 30`
- `CHARGE_TARGET_PERCENT = 80`
- `DEFAULT_CURRENT_BATTERY = 80`, `DEFAULT_MIN_ARRIVAL = 15`

Range formula: `usableRange = vehicleRange * safetyFactor * (currentBattery - minArrival) / 100`
Calculated in `src/lib/range-calculator.ts`.
