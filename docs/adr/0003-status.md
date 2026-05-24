# ADR-0003 status — NOT SHIPPED (decision-only)

**Original ADR:** [0003-vinfast-detail-module.md](./0003-vinfast-detail-module.md) (decided 2026-05-06)
**Status verified:** 2026-05-24

## Verdict

**NOT SHIPPED.** No `VinFastDetail` Module exists. The route handler still owns all four tiers, all stage emission, and has no concurrent-fetch dedup.

## Evidence

| Promise (ADR-0003) | Current reality |
|---|---|
| Route handler shrinks from 212 to ~30–50 lines | `src/app/api/stations/[id]/vinfast-detail/route.ts` is **212 lines** — unchanged |
| New `VinFastDetail` Module owns 4-tier fallback | No module file matching that shape in `src/lib/vinfast/` (only the 3 pre-existing adapter files: `vinfast-client.ts`, `vinfast-browser.ts`, `vinfast-entity-resolver.ts`) |
| Typed `Result` discriminated union (`fresh \| live \| stale \| basic_only`) | No such Result type anywhere — grep for `kind:.*fresh\|kind:.*basic_only` returns 0 hits |
| `onStage(stage)` callback with closed enum | No `onStage` parameter anywhere in `src/lib/vinfast/` or the route handler |
| In-process `Map<stationId, Promise<Result>>` dedup | No dedup Map — grep for `inFlight\|dedup` returns 0 hits |

## Why this matters (or doesn't)

The decision was sound when written — the 4-tier orchestration is real, concurrent Cloudflare requests do waste budget, and the typed Result would tidy callers. But there is no observable harm shipping today either: the route handler works, stages emit correctly via inline `controller.enqueue` calls, and the dedup absence has not manifested as a measurable rate-limiting incident.

## Recommendation

**Defer.** Per Phase 1 PM decision (2026-05-24), all three deepening ADRs (-0003, -0004, -0005) execute as a single milestone *after* Phase 4 QA regression-locks current behavior. Touching the SSE route handler before the existing 212-line behavior is fully test-covered would be a high-risk change.

When execution does happen, prerequisites are:
- Colocated `route.test.ts` for the SSE handler (currently no test — EVOYAGE_AUDIT_PLAN.md §C28)
- Decision on cache freshness TTL (~1hr per ADR — verify matches the current implicit cache window)
- Decision on whether stage enum is locked to the existing SSE event names or can be renamed (would break any SSE consumer mid-stream — likely none today, but verify)
