# Deepened EviTripExtractor Module replaces 276-line eVi parse route handler

Decided 2026-05-06 during architectural review (`/improve-codebase-architecture`).

## Context

`src/app/api/evi/parse/route.ts` (276 lines) orchestrates: LLM extraction (`parseTrip` calling the soon-to-be-deepened LLM Module from ADR-0002) → vehicle resolution (with `previousVehicleId` session-aware fallback on miss) → bidirectional geocoding (forward for parsed start/end strings, reverse for user-supplied coords) → follow-up state decision ("ask user for which missing field next"). Domain orchestration is buried in HTTP plumbing; locale-aware error messages and follow-up state machine are inline.

## Decision

Extract one deepened `EviTripExtractor` Module. Caller passes `{ userInput: string, userCoords?: Coords, previousVehicleId?: string, locale: 'vi' | 'en', signal? }`. Returns typed `Result`:

- `{ kind: 'ready_to_plan', tripParams }` — `tripParams` matches `TripPlanner`'s input shape (ADR-0004), so the route handler can pass it straight through
- `{ kind: 'needs_followup', followupType: 'vehicle' | 'departure' | 'destination' | 'origin', partialParams }`
- `{ kind: 'parse_failed', reason: 'unintelligible' | 'not_a_trip' | 'language_mismatch' }`

Throws `LLMUnavailableError` (re-thrown from ADR-0002 Module) and `EviExtractorAbortedError`.

Module owns:
- LLM-extraction orchestration (consumes ADR-0002's deepened LLM Module — does NOT re-implement provider chain or response cleaning)
- Vehicle resolution **with `previousVehicleId` retry** — eVi-session UX, not generic vehicle lookup
- Bidirectional geocoding (forward + reverse, internal Mapbox/OSM call)
- Follow-up state decision (which missing field to ask about next)
- Locale-aware prompt construction (Vietnamese vs English system messages)

## Why

`needs_followup` is real conversational UX state, not error. eVi's flow is "ask one missing thing at a time." Throwing on missing destination forces every caller to catch and re-render. Returning typed `Result` lets the route handler switch on `kind` cleanly.

`previousVehicleId` retry lives here, not in `TripPlanner`. This is the cleanest payoff of the ADR-0004 decision: `TripPlanner` stays pure ("vehicle ID → vehicle or throw"); eVi-session-aware fallback ("if requested vehicle missing, fall back to previously-discussed vehicle") sits where the session knowledge already lives. Each Module owns its own concern — good **Locality** at both layers.

Locale awareness consolidates: today it's scattered across the route handler in prompt construction and error message rendering. Inside the Module, locale is a single input that affects prompts and `parse_failed` reason mapping in one place.

## Considered alternatives

- **Caller orchestrates LLM + geocoding + vehicle resolution; Module is just the LLM call.** Rejected: that's what we have today. The orchestration is exactly what needs concentrating.
- **Vehicle `previousVehicleId` fallback lives in `TripPlanner`.** Rejected: pollutes pure trip-planning Module with eVi-session-specific UX. Different concern, different Module.
- **Throw on missing required fields.** Rejected: missing-field is the *normal* eVi flow (the user is in conversation, naturally provides things one turn at a time). Throwing makes the common case the error case.
- **Geocoding extracted as its own Module.** Deferred: today only `EviTripExtractor` needs geocoding — one adapter = hypothetical Seam. If a second caller needs forward/reverse geocoding (unlikely — the trip route already gets coords), introduce a `Geocoder` Module then.

## Consequences

- eVi parse route handler shrinks from 276 lines to ~30–50 lines (validation + locale negotiation + Result→HTTP serialization).
- The route handler's flow becomes: `extract → if ready_to_plan, call TripPlanner.planTrip(result.tripParams) → render`. Two clean Modules; route handler is glue.
- The Module depends on ADR-0002 (LLM Module). Implementing this Module *requires* ADR-0002 to land first.
- Internal geocoding helper is a private seam used by the Module's own tests. Tests can intercept the Mapbox/OSM HTTP call with `msw` or similar; no `Geocoder` abstraction needed for testability.
- If eVi adds a non-trip extraction (e.g. extracting "show me the cheapest charger" search intent), it should be a separate Module with its own Result shape — don't widen this Module's `Result` enum to cover non-trip flows.
