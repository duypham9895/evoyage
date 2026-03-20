# eVoyage Domain Knowledge Base

Deep reference for the eVoyage problem domain. Consult when working on core features.

## VinFast Charging Station Data Model

Stations in the database (`ChargingStation` model) have:
- `id` — internal CUID
- `entityId` — VinFast API identifier (nullable, populated by daily cron)
- `storeId` — alternate VinFast identifier
- `ocmId` — OpenChargeMap ID or `vinfast-{storeId}` for VinFast-sourced stations
- `name`, `address`, `province` — location info
- `latitude`, `longitude` — coordinates (indexed)
- `brand` — station operator (e.g., "VinFast", "EVN")
- `connectorTypes` — array of connector standards (CCS2, CHAdeMO, Type2_AC, Type1)
- `maxPowerKw` — maximum charging power
- `status` — operational status
- Parking fee, hotline, and other metadata from VinFast detail API

The `VinFastStationDetail` table caches full JSON responses from VinFast's detail API, keyed by `entityId`.

## Entity Resolution Flow

```
DB station.id
  → vinfast-entity-resolver.ts: resolveEntityId()
    → if station.entityId exists → return it
    → if station.ocmId starts with "vinfast-" → storeId = ocmId.replace("vinfast-", "")
    → return { entityId, storeId }
```

## Route Calculation Pipeline (detailed)

### Step 1: Geocoding
- `src/lib/nominatim.ts` — OpenStreetMap Nominatim API
- Returns `{ lat, lng, display_name, place_id }`
- `place_id` is used as cache key in `RouteCache` table

### Step 2: Directions
- Primary: `src/lib/osrm.ts` — free, no API key, Vietnam coverage
- Fallback: `src/lib/mapbox-directions.ts` — requires `MAPBOX_ACCESS_TOKEN`
- Both return encoded polylines + distance/duration
- Route cache: `src/lib/route-cache.ts` stores polyline by start/end place IDs

### Step 3: Polyline Processing
- `decodePolyline(encoded)` — Google format → `[lat, lng][]`
- `cumulativeDistances(points)` — cumulative km along route
- `src/lib/polyline-simplify.ts` — Douglas-Peucker for rendering optimization

### Step 4: Station Finding
- `findStationsAlongRoute(route, stations, corridorKm)` — corridor-based search
- Uses Haversine distance to find stations within X km of route polyline
- Returns `StationWithRouteInfo` including detour distance and route position
- Filters by connector compatibility with selected vehicle

### Step 5: Station Ranking
- Composite score combining:
  - Detour time (time penalty for leaving route)
  - Charging duration (based on connector power and energy needed)
  - Brand affinity (VinFast bonus capped at `VINFAST_BONUS_CAP = 0.5`)
  - Connector compatibility (CCS2 > CHAdeMO > Type2_AC > Type1)
- Power map: CCS2=100kW, CHAdeMO=50kW, Type2_AC=22kW, Type1=7kW
- `OK_RANK_THRESHOLD = 1.5` — stations below this score are flagged

### Step 6: Charging Stop Planning
- Battery simulation walk along route polyline
- When remaining range < `SEARCH_TRIGGER_KM` (80km), search for station
- Search cascade: 5km corridor → 10km corridor → 15km radius
- Each stop charges to `CHARGE_TARGET_PERCENT` (80%)
- Safety buffer: `SAFETY_BUFFER_KM` (30km) reserved
- Outputs: `ChargingStop[]` with battery levels, alternatives, and `BatterySegment[]` for visualization

## Battery Math

```
usableRange = vehicleRange × safetyFactor × (currentBattery - minArrival) / 100
```

Where:
- `vehicleRange` = `officialRangeKm` from vehicle database
- `safetyFactor` = user-adjustable, default 0.80 (accounts for real-world vs rated range)
- `currentBattery` = percentage, default 80%
- `minArrival` = minimum battery % at destination, default 15%

Charging efficiency factor: `1.15` (15% loss during DC charging, applied in station-ranker)

## Short URL System

- 7-character alphanumeric code
- Generated in `src/lib/short-url.ts`
- Stored in `ShortUrl` table with original URL params
- API: `GET|POST /api/short-url`
- URL params encoded compactly for trip state (vehicle, route, battery settings)

## Geographic Scope

- Primary: Vietnam (lat ~8.5-23.5, lng ~102-110)
- Validation bounds: Southeast Asia (lat 0-30, lng 95-115) — intentionally wider for border areas
- Defined in `src/lib/coordinate-validation.ts`
- VinFast stations currently only in Vietnam

## Database Models (Prisma, 7 models)

1. `EVVehicle` — 50+ fields, vehicle specifications
2. `ChargingStation` — 30+ fields, station locations and metadata
3. `VinFastStationDetail` — JSON cache of VinFast API responses
4. `ShortUrl` — short URL mappings
5. `RouteCache` — polyline cache by place ID pairs
6. `Feedback` — user feedback submissions
7. Check `prisma/schema.prisma` for authoritative schema

Key indexes: coordinates (lat/lng), brand, province, entityId, status.
