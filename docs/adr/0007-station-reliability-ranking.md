# Station reliability multiplier in scoreStation, gated on 100-observation threshold

Decided 2026-05-08 during architectural design discussion (`grill-with-docs` session). Successor to ADR-0006's deferred reliability ranking commitment. Implementation gated on Phase 3 data accumulation (~2026-05-22 onward).

## Context

ADR-0006 selected and ranked Alternative Stations using `scoreStation` (detour drive time + estimated charge time + VinFast↔VinFast affinity bonus). It explicitly deferred reliability — "the strongest theoretical ranking signal for backup" — until Phase 3 data accumulated. `StationStatusObservation` has been recording hourly status (ACTIVE | BUSY | INACTIVE | UNAVAILABLE | OUTOFSERVICE) since 2026-05-03; the 30-day window opens around 2026-06-02.

Crowdsourced data (`StationStatusReport`) exists separately and feeds the `trust-signal.ts` UI chip ("verified 2 hours ago"). That signal stays as-is; this ADR is about the **passive observational** stream, not the crowdsourced one.

Without reliability in ranking:
- A trạm with 99% uptime competes equally with a trạm at 70% uptime if their detour and power are similar.
- "Pick the closest reliable station" is the natural user expectation; the current ranker doesn't honor it.

## Decision

`scoreStation` adds a multiplicative reliability penalty as a new layer on top of the existing detour + charge + VinFast layers:

```
score = (detour_min + charge_min)
      × vinfast_multiplier        // existing: 0.5 if VinFast↔VinFast, else 1.0
      × reliability_multiplier    // NEW

where:
  reliability_multiplier =
    (observation_count >= RELIABILITY_THRESHOLD)
      ? (2 - reliability)         // ∈ [1.0, 2.0]
      : 1.0                       // gated: no adjustment

  reliability =
    count(status ∈ {ACTIVE, BUSY} where observed_at > now - 30d)
    / count(status where observed_at > now - 30d)
```

### Configuration (4 v1 magic numbers)

- `RELIABILITY_WINDOW_DAYS = 30` — sliding window for uptime calculation
- `RELIABILITY_THRESHOLD = 100` — minimum observation count before applying penalty
- Penalty curve: linear `(2 - r)`, max ×2.0 at r=0
- Tier boundaries: **none** in v1 — UI deferred to ADR-0008

### Storage and computation

Reliability is **precomputed nightly**, mirroring the `StationPopularity` pattern. A new `StationReliability` table (or column on `ChargingStation`) stores `(stationId, reliability, observationCount, computedAt)`. `scoreStation` reads O(1) per station via a Map passed from the caller. No live aggregation in the request path.

### Apply scope

Affects **both** primary station selection (rankedStations[0]) and alternatives (rankedStations[1+]). `scoreStation` is the single ranker; splitting per-slice would require dual ranking logic (run twice or post-hoc re-rank).

### UI

**No UI exposure in v1.** Reliability is internal-only: it changes which stations get picked but the user sees the same fields as today (rank label, detour, charge time, power, provider). ADR-0008 will revisit UI exposure once 2-4 weeks of telemetry from ADR-0006 events show whether the ranking change moves user behavior.

## Why

**Passive poller over crowdsourced.** `StationStatusObservation` is uniform-sampled (hourly per station), already accumulating, no new infrastructure. `StationStatusReport` is sparse and bias-skewed (drivers report failures more than successes). Combining adds calibration burden without proportional value at v1; the crowd trust chip continues serving the "verified recently" UX without contaminating ranking.

**30-day equal-weight window.** A magic-number minimum design choice: 1 number to calibrate (window length) instead of 2 (window + decay rate). Equal weight blurs "broke yesterday vs broke 25 days ago" — a real loss — but `lastVerifiedAt` (crowdsourced trust chip, separate signal) covers the recency dimension naturally. Two complementary signals beat one over-weighted score.

**Threshold gate at 100 observations.** ~14% of expected 30-day data (720 obs/station). Below 100, computed reliability has 95% CI ≈ ±10% — too noisy for ranking. Above, signal stabilizes. Stations newly added or skip-polled fall through the gate; existing detour + charge + VinFast logic ranks them. New stations don't earn a bonus they haven't earned and don't get a penalty they haven't deserved.

**Multiplicative linear penalty.** Mirrors VinFast bonus shape (`score *= 0.5`). Code grows by analogy. Linear `2 - r` is honest at MVP — we don't yet know the empirical reliability distribution; linear treats every gradient equally. Quadratic / sigmoid / threshold-curve choices defer to telemetry.

**Apply to both primary and alternatives.** `scoreStation` is the single ranker. Splitting "reliability matters for backups but not primary" creates a weird invariant where rankedStations[0] could be less reliable than rankedStations[1]. User mental model: "trip planner picks reliable stations" — primary is where the user actually charges; reliability matters more there than for backup.

**No UI in v1.** ADR-0007 scope is ranking. UI is separable. Changing the algorithm without changing the surface is honest: the change IS visible (different stations picked) without forcing premature UI decisions. ADR-0006 telemetry events (alternative_navigate_clicked, alternative_marker_clicked) tell us whether the ranking shift moves behavior.

## Considered alternatives

- **Crowdsourced data only (StationStatusReport).** Rejected: sparse, bias-skewed. Crowd data feeds `trust-signal.ts` (recency) but not ranking.
- **Hybrid: weighted average of passive + crowd.** Rejected for v1: 2× calibration burden, debug complexity. Reconsider when crowd data volume per station is high enough to be its own signal.
- **7-day window.** Rejected: ~168 obs is marginally stable. 1-day outage sinks score 14%; 30-day robust against single-day noise.
- **Decay-weighted 30-day window.** Rejected for v1: extra magic number (decay rate). Reconsider if telemetry shows recent failures get blurred.
- **Bayesian prior for low-data stations** (network-average smoothing). Rejected: introduces "network average reliability" as another magic input. Threshold gate is more honest — "we don't know yet" beats "we'll fake an estimate."
- **Penalize all low-data stations** (e.g., assume 70%). Rejected: unfair to brand-new stations; bad UX for VinFast launches.
- **Reward low-data stations** (e.g., assume 90%). Rejected: low-quality stations rank top by virtue of having no track record. Worse than current state.
- **Additive penalty in minutes** (`score += penalty_min × (1 - r)`). Rejected: conflicts with multiplicative VinFast layer; order of operations matters; magic number `penalty_min` adds noise.
- **Quadratic penalty curve** (`score *= 1 + (1-r)²`). Rejected for v1: less debuggable. Reconsider if telemetry shows linear is too soft at low reliability.
- **Layered re-rank** (existing ranker → reliability as tiebreaker only). Rejected: limits reliability impact to "within similar-quality stations." A trạm 99% reliable but 5km farther can't beat a trạm 70% reliable but on-route. Doesn't honor reliability when it matters most.
- **Replace VinFast bonus with reliability.** Rejected per ADR-0006 reasoning: VinFast ~80% DC fast charger market share + same-app continuity is real UX value.
- **Apply to alternatives only.** Rejected: requires dual ranking logic. Code complexity for a narrow win — primary stop is where the user actually charges; reliability matters there too.
- **UI tier badge or percentage in v1.** Deferred to ADR-0008, post-telemetry.

## Consequences

- New `scoreStation` parameter or context object: `reliability: number` and `observationCount: number` per candidate. Existing callers without reliability data get default `(1.0, 0)` — gate kicks in, no behavior change.
- New nightly aggregation: query `StationStatusObservation` 30-day window, group by station, upsert into `StationReliability`. Single batched SQL job, mirrors `aggregate-popularity` pattern.
- v1 magic numbers: `RELIABILITY_WINDOW_DAYS = 30`, `RELIABILITY_THRESHOLD = 100`, slope linear `(2 - r)`. All exposed via config so they're A/B-tunable post-launch.
- Cache invalidation: `route-cache` keys are (origin, dest), vehicle-independent; ranking re-runs per request. No cache flush needed — behavior change is immediate next request.
- `OK_RANK_THRESHOLD = 1.5` (rank=ok vs rank=slow boundary) compares score ratios. Multiplying by reliability_multiplier shifts the scale by up to ×2. May need retune post-launch — track via rank distribution telemetry.
- New telemetry events: `reliability_gated_count` (% stations below threshold per request), `reliability_distribution` (histogram of reliability values per request). Wire as part of implementation.
- Cached routes from before this ADR may show different stations after ship — this is expected, not a regression.
- ADR-0008 pre-condition: 2-4 weeks of telemetry from ADR-0006 events plus this ADR's events. At that point the UI exposure decision becomes data-driven.

## Implementation outline

| Layer | Files | Net delta |
|---|---|---|
| Schema | `prisma/schema.prisma` (new `StationReliability` model) | ~10 lines + migration |
| Aggregation | `scripts/aggregate-reliability.ts` (nightly, mirror aggregate-popularity) | ~80 LOC + ~10 tests |
| Score helper | `src/lib/routing/reliability-score.ts` (read precomputed, return multiplier) | ~50 LOC + ~15 tests |
| Ranker integration | `src/lib/routing/station-ranker.ts` (new param, layered multiplier) | ~20 LOC delta + extended tests |
| Caller wiring | `src/app/api/route/route.ts` (load reliability map, pass into scoring) | ~20 LOC |
| Telemetry | `src/lib/analytics.ts` (2 new events) | ~30 LOC + ~4 tests |
| Total | **~210 LOC + ~30 tests** |

Estimated 3-4 sessions to ship full implementation, gated on Phase 3 data being sufficient (~2026-05-22).
