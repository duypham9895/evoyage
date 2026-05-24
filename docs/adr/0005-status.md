# ADR-0005 status — NOT SHIPPED (decision-only)

**Original ADR:** [0005-evi-trip-extractor-module.md](./0005-evi-trip-extractor-module.md) (decided 2026-05-06)
**Status verified:** 2026-05-24

## Verdict

**NOT SHIPPED.** No `EviTripExtractor` Module exists. The eVi parse route handler still orchestrates LLM extraction, vehicle resolution, bidirectional geocoding, and follow-up state inline.

## Evidence

| Promise (ADR-0005) | Current reality |
|---|---|
| Route handler shrinks from 276 to ~30–50 lines | `src/app/api/evi/parse/route.ts` is **278 lines** — essentially unchanged |
| New `EviTripExtractor` Module exposes `extractTrip(input): Result` | No file matching that shape in `src/lib/evi/`. Current files: `llm-module.ts`, `llm-providers.ts`, `minimax-client.ts`, `prompt.ts`, `suggestions-client.ts`, `types.ts`, `vehicle-resolver.ts` — none is the deepened extractor |
| Typed Result `{ kind: 'ready_to_plan' \| 'needs_followup' \| 'parse_failed' }` | No such Result — grep returns 0 hits |
| `EviExtractorAbortedError` | Not defined |
| Module owns LLM extraction + `previousVehicleId` retry + bidirectional geocoding + follow-up state | All four are orchestrated inline in the route handler |

## Why this matters

ADR-0005 was the smallest of the three deepening ADRs and the easiest to ship cleanly — the extractor pattern is well-understood and the eVi parse handler is bounded. It also unlocks ADR-0004 (TripPlanner), because the `previousVehicleId` UX fallback would move out of the trip-planning core into where session knowledge lives.

ADR-0005 depends on **ADR-0002** (LLM Module), which **did ship** (commits `f74b339`, `8352356`, `a603312`, `61ecfb6`, `19b1e9e`, `4583100`, `84907fa` from 2026-05-04 onward). So the upstream dependency is satisfied; only the extraction itself is pending.

## Recommendation

**Defer with ADR-0004**, but consider sequencing as the first of the three executions when the deferred milestone opens — it's the lowest-risk and would prove out the deepened-Module pattern before the higher-risk ADR-0004 refactor.

Preconditions:
1. Colocated `route.test.ts` for `/api/evi/parse` covering: vi happy path, en happy path, `needs_followup` (each followupType: vehicle/departure/destination/origin), `parse_failed` (each reason), LLM upstream failure (`LLMUnavailableError`), rate-limit hit.
2. Coordinate the `Result.tripParams` shape with `TripPlanner`'s input shape (ADR-0004 §Decision: "tripParams matches TripPlanner's input shape so the route handler can pass it straight through"). If ADR-0004 has not shipped yet, define a `TripPlannerInput` type ADR-0005 references, so when ADR-0004 lands the bridge is one-line.

Estimated effort: **M** (1–2 sessions). Touches less code than ADR-0004 but the test scaffold is similar size.
