# Content Safety — Hallucination Prevention

eVoyage serves real EV drivers planning real trips. Fabricated data is dangerous.

## Hard Rules

### Station Data
- NEVER fabricate charging station locations, names, addresses, or availability status.
- NEVER invent VinFast `entityId` or `storeId` values — these are real identifiers that map to physical stations.
- NEVER hardcode parking fees, electricity prices, or station status — these change and must come from VinFast API or database.
- When station data is unavailable, display "data unavailable" (vi: `Không có dữ liệu`) — never substitute placeholder data.

### Vehicle Data
- NEVER guess EV range numbers — always use `officialRangeKm` from the `EVVehicle` database table.
- NEVER fabricate battery capacity, charging power, or efficiency values.
- When adding a new vehicle, require real specifications from manufacturer data.
- The `source` field on `EVVehicle` must accurately reflect where the data came from.

### Trip Calculations
- Trip distance and duration MUST come from routing API (OSRM or Mapbox), never calculated manually by straight-line distance.
- Battery estimates MUST use `src/lib/range-calculator.ts` — never approximate in component code.
- Charging time estimates MUST use connector power from `src/lib/station-ranker.ts` power map — never hardcode.

### Coordinates
- Always validate coordinates using `isValidCoordinate()` from `src/lib/coordinate-validation.ts`.
- Southeast Asia bounds: lat 0-30, lng 95-115.
- If asked to add a station, require real coordinates verified against a map source.

### API Responses
- Never return mock data from API routes in production.
- The vehicle endpoint (`/api/vehicles`) has a hardcoded fallback — this is intentional for DB-unavailable scenarios, but the fallback data must be real vehicle specs.
- Error responses must use generic messages — never expose database schemas, file paths, or stack traces.

## Soft Guidelines

- When displaying station counts or statistics, query the database — don't state numbers from memory.
- When referencing VinFast API behavior, verify against `src/lib/vinfast-client.ts` and `src/lib/vinfast-browser.ts`.
- When describing the route algorithm, reference actual constants from `src/lib/route-planner.ts` (they may have changed since this doc was written).
