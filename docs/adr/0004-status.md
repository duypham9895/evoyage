# ADR-0004 status — NOT SHIPPED (partial helper exists, but not the deepened Module)

**Original ADR:** [0004-trip-planner-module.md](./0004-trip-planner-module.md) (decided 2026-05-06)
**Status verified:** 2026-05-24

## Verdict

**NOT SHIPPED.** The deepened `TripPlanner` Module promised by ADR-0004 does not exist. A *partial* helper at `src/lib/routing/route-planner.ts` covers the charging-stop selection slice but lacks the typed `Result`, the unified `planTrip(input)` entry point, and the orchestration concentration the ADR was about. The route handler has grown, not shrunk.

## Evidence

| Promise (ADR-0004) | Current reality |
|---|---|
| Route handler shrinks from 573 to ~50–80 lines | `src/app/api/route/route.ts` is **646 lines** — grew by 73 lines post-ADR (added reliability ranking + telemetry from ADR-0007) |
| New `TripPlanner` Module exposes `planTrip(input): Result` | `src/lib/routing/route-planner.ts` exists (400 LOC) but exports `planChargingStops(...)` returning `ChargingPlanResult`, not the deepened Result |
| Typed Result `{ kind: 'success' \| 'unreachable' \| 'no_route' }` | No such Result — grep for `kind:.*unreachable\|kind:.*no_route` returns 0 hits |
| Custom error classes `VehicleNotFoundError`, `MapboxUnavailableError`, `TripPlannerAbortedError` | None defined |
| Module owns vehicle DB lookup, Mapbox call + cache, range calc, station ranking, charging-stop selection | Route handler still wires these up directly: `prisma.eVVehicle.findFirst`, `getCachedRoute`, `setCachedRoute`, `findStationsAlongRoute`, `planChargingStops` are all called from the handler |

## Why this matters

ADR-0004 was the most architecturally consequential decision in the 2026-05-06 review — it cleans up the largest file in the codebase and unlocks future routing concepts (detour penalties, multi-vehicle, second routing provider) as Module-internal changes instead of handler edits. Shipping it would also enable testing the trip-planning core without faking Request/Response.

But it is also explicitly flagged as the **highest-risk single change in the codebase** (EVOYAGE_AUDIT_PLAN.md F.3 task 21). The 646-line handler is currently exercised by the live app + E2E suite but has no colocated unit test. Refactoring it without regression-locking the contract first is how production bugs get shipped quietly.

## Recommendation

**Defer to a dedicated milestone post-Phase 4** per Phase 1 PM decision (2026-05-24). Specific preconditions before execution:

1. Colocated `route.test.ts` for `/api/route` covering: single-waypoint happy path, multi-waypoint, unreachable destination, vehicle-not-found, OSRM-down→Mapbox-fallback path, rate-limit hit. (Audit C28.)
2. Lock the user-facing response shape (`{ routePath, chargingStops, summary, ... }`) so the refactor cannot accidentally change the wire contract.
3. Decide whether `previousVehicleId` UX fallback stays out of TripPlanner (it should — ADR-0005 owns it). Verify ADR-0005 lands first or that the route handler keeps the fallback logic during the interim.
4. Sequence after ADR-0007 telemetry has matured (we're inside its 2-4 week calibration window per `TODOS.md`), so the refactor doesn't accidentally roll back the reliability multiplier.

Estimated effort: **L** (3+ sessions). Branch + isolated review; do not bundle with other phases.
