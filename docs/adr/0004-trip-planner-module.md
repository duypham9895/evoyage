# Deepened TripPlanner Module replaces 573-line trip route handler

Decided 2026-05-06 during architectural review (`/improve-codebase-architecture`).

## Context

`src/app/api/route/route.ts` (573 lines) does eight jobs in one POST handler: Zod validation, vehicle resolution, coordinate validation, routing-provider selection, route caching, range calculation, station ranking, and charging-stop planning. Domain logic is entangled with HTTP concerns; tests cannot exercise the trip-planning core without faking Request/Response. Adding a routing concept (e.g. detour penalties, multi-vehicle support) requires editing the route handler.

## Decision

Extract one deepened `TripPlanner` Module. Caller passes `{ origin: Coords, destination: Coords, vehicleId, batteryStartPct, batteryEndPct?: number = 20, prefs?, signal? }`. Returns a typed `Result`:

- `{ kind: 'success', plan: TripPlan }`
- `{ kind: 'unreachable', reason: 'beyond_max_range_with_charging' | 'no_chargers_along_corridor', furthestReachable? }`
- `{ kind: 'no_route', mapboxReason }`

Throws only for caller errors and infrastructure: `VehicleNotFoundError`, `MapboxUnavailableError`, `TripPlannerAbortedError`.

Module owns:
- Vehicle DB lookup (Module-internal Prisma access)
- Mapbox call + route-geometry cache (key = origin+dest, vehicle-independent)
- Range calculation
- Station ranking by detour cost
- Charging-stop selection

Internal seams (`fetchRouteFromMapbox`, `calculateRange`, `rankStationsByDetour`, `pickChargingStops`) are private helpers used by Module's own tests; not part of the external Interface.

## Why

Range calc and charging-stop planning are tightly coupled (you need range to pick the next stop; stops affect remaining range). Splitting them creates a ping-pong Interface — exactly the orchestration we're hiding. **Depth is a property of the Interface, not the Implementation** — a small Interface in front of a 200–400 LOC Implementation is the design goal.

`unreachable` and `no_route` are *information*, not errors. A user asking for Hanoi → Cà Mau in a 200km-range scooter deserves "your scooter can't make this with charging" with `furthestReachable` for UX, not an exception. Throwing forces every caller into try/catch + string-matching error messages — bad **Locality**.

## Considered alternatives

- **Three composed Modules: `Router`, `RangeCalculator`, `ChargingStopPlanner`.** Rejected: ping-pong Interface, leakage of intermediate state across Seams, no orchestration **Locality**.
- **Two Modules: `TripPlanner` + `Router` adapter.** Rejected: only one routing provider (Mapbox) today. One adapter = hypothetical Seam. Add `Router` Module if/when a second provider materializes — the Mapbox call is the obvious extraction point.
- **Caller pre-resolves vehicle and passes full `Vehicle` object.** Rejected: forces every caller to duplicate vehicle-lookup. The Module is already Prisma-coupled (route cache); one more table is concentration, not spread.
- **Throw on `unreachable`.** Rejected: see "Why" — it's user information, not an error.

## Consequences

- Route handler `route/route.ts` shrinks from 573 lines to ~50–80 lines (validation + HTTP serialization).
- TripPlanner Module is large internally (200–400 LOC). That's expected — depth via small Interface.
- The `previousVehicleId` UX fallback used by the eVi conversational flow stays *outside* this Module (in `EviTripExtractor`, ADR-0005). TripPlanner throws `VehicleNotFoundError`; eVi-route catches it and applies session-aware retry. Each Module owns its own concern.
- Cache key (origin+dest) is vehicle-independent. Same OD pair across different vehicles reuses cached geometry — only the *planning* (range/stops) is recomputed per vehicle.
- If a second routing provider is later added, extracting a `Router` Module from inside `TripPlanner` is a low-risk refactor with localized blast radius (only the Mapbox call site changes).
