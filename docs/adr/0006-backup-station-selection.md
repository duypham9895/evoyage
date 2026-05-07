# Backup station Alternatives — dynamic 0–3 count on top of existing ranker

Decided 2026-05-07. Revised same-day after codebase review revealed existing infrastructure that the original ADR draft ignored.

## Context

`TripPlanner` (ADR-0004) **already** returns one charging Stop per leg with up to 2 Alternatives attached to each Stop:

- `src/types/index.ts:217` — `ChargingStopWithAlternatives` carries `selected: RankedStation` + `alternatives: readonly RankedStation[]` + battery context. Type is fully wired through the API.
- `src/lib/routing/station-ranker.ts:76` — `scoreStation` ranks candidates by *detour drive time (sec) + estimated charge time (min) + VinFast↔VinFast affinity bonus*. Tiebreakers prefer higher `portCount`, known operating hours, non-VinFast-only.
- `src/lib/routing/route-planner.ts:286` — `planChargingStops` returns `rankedStations.slice(1, 3)` as alternatives — a **hardcoded top-2 cutoff** with no risk awareness.

So the *type*, the *ranking*, and the *delivery* already work. What's missing is **count adaptivity** (when does a Stop need 0/1/2/3 Alternatives?) and a **detour budget filter** that drops far-off-route junk before it reaches the ranker.

VN has wide variance in station density: HN–HP corridor has 5+ Stations within 10km of any planned Stop; QL14 may have one usable Station for 50km. The hardcoded `slice(1, 3)` (always N ≤ 2) surfaces fake Alternatives in sparse zones — the corridor search returns *whatever* it can find, sometimes 25 km off-route — and clips opportunity in dense, high-risk situations (Tết, peak hour) that warrant a 3rd alternative.

## Decision

Replace the hardcoded `slice(1, 3)` with a `BackupPressureScore`-driven slice. Add a detour-budget filter applied **before** `scoreStation`. Ranking itself is **unchanged** — `scoreStation` and its tiebreakers are correct.

### Count (new)

```
BackupPressureScore = sum of:
  +1  distance to NEXT Stop > 70% Usable Range            [tight margin]
  +1  arrival battery < 25%                               [low buffer]
  +1  Stations within 100km downstream < 3                [sparse area]
  +1  charging session overlaps Peak Window               [congestion]
        (Peak Window = 11h–13h or 17h–20h local)
  +1  trip date is Vietnamese holiday                     [Tết, lễ]

Pressure 0–1  → N_max = 1
Pressure 2–3  → N_max = 2
Pressure 4–5  → N_max = 3

N = min(N_max, ranked_candidates_remaining_after_top)
```

### Filter (new — applied to alternatives after ranking)

`scoreStation` runs on all corridor candidates as today and produces a sorted list. The filter then drops alternatives whose **round-trip detour drive time exceeds 12 minutes** (≈10 km at 50 km/h — a proxy for the original km budget that reuses the existing `detourDriveTimeSec` field on `RankedStation`, avoiding a new metric in the public type).

A range-aware filter (originally "≤ 20% of remaining Usable Range") is **deferred** to post-launch. Reasoning: the 12-minute time budget already eliminates the worst far-off-route junk in practice; the range-aware variant would require piping `Vehicle` + `currentBatteryPercent` into the trim helper, expanding API surface for marginal additional gain. Reconsider once Phase 3b telemetry shows real usage.

Compatibility filter on connector + power is unchanged — still runs before scoring as today.

### Ranking — unchanged

`scoreStation` continues to rank by:
- `score = detour_drive_time_min + estimated_charge_time_min`
- VinFast↔VinFast affinity bonus (up to 50% off score) — **kept as-is**
- Tiebreakers: `portCount`, known operating hours, non-VinFast-only

No new ranking signals in v1.

## Why

Splitting "should this Stop have backup?" (count) from "which Stations are best?" (ranking) is the central insight. The ranker already does its job; the bug is only in *how many* of its results we surface and *which candidates* even reach it. Touching `scoreStation` would expand blast radius without proportional value.

Five count signals chosen as the **smallest set computable today**. Three (distance, battery, downstream density) come from data already in `TripPlanner`. Two (Peak Window, holiday) leverage `src/lib/trip/vietnam-holidays.ts` and a hardcoded peak heuristic — no new data sources, no new API costs.

`N = 0` is a feature, not a bug. Forcing fake Alternatives in a sparse zone misleads the user into thinking they have a fallback they don't. UI must surface "no backup available — sạc đầy hơn 80% trước khi rời", not silently drop alternatives.

**Drive-time, not detour-km.** The first draft of this ADR specified detour-km as the dominant ranking signal. Code review showed `scoreStation` already uses detour drive time (sec), which is strictly better — accounts for road class, traffic, and pass elevation. ADR amended; ranker unchanged.

**VinFast bonus kept; operator diversity dropped.** The first draft proposed a +bonus for "different Operator from primary" (hedge against systemic VinFast outage). Code review found the existing rule is the **opposite**: same-Operator (VinFast↔VinFast) gets a bonus. Resolved in favour of the existing code:

- VinFast operates ~80% of usable DC fast chargers in VN. Same-Operator continuity (same app, same payment, same membership) is concrete UX value, every trip.
- Systemic VinFast outages do happen, but rarely (≈once-a-year scale) and are usually localized. Hedge value is low.
- Inverting to "diversity bonus" would degrade UX for the common case to insure against the rare case.

Reliability score (Phase 3b) remains the deferred ranking improvement — strongest signal but needs accumulated data.

## Considered alternatives

- **Keep fixed `N = 2` (status quo).** Rejected: surfaces fake Alternatives in sparse zones (corridor returns far-off-route junk) and clips opportunity in high-pressure ones. Hardcoded threshold fails in both directions.
- **Detour-km in ranker instead of drive-time.** Rejected: drive-time captures road class and traffic, which km doesn't. Existing code is correct; my first draft was wrong.
- **Operator diversity bonus** (override existing VinFast affinity). Rejected — see Why §"VinFast bonus kept". 80% market share + same-app continuity beats systemic-failure hedge for VN.
- **Real-time in-trip rerouting** (the original "option B" of the design discussion). Rejected for v1: VinFast SSE doesn't support bulk status; would require dedicated crawl + push notification infrastructure. Pre-trip alternatives extracts most value at fraction of the cost.
- **Precautionary extra Stops** (the original "option C"). Rejected: each Stop is 30–60 min; users avoid stopping more than necessary. Captured indirectly via downstream-density signal.
- **Six count signals including pass-detection** (`src/lib/trip/detect-passes.ts`). Rejected: double-counts with downstream density. Reconsider if density proves insufficient proxy.
- **Reliability score in ranking.** **Deferred, not rejected.** Phase 3b ships popularity-prediction + station-status history. Then reliability becomes the dominant signal; a successor ADR will record the recalibration.
- **Single weighted-sum across all 8+ factors.** Rejected: blurs count vs ranking, magic-number explosion.
- **Diversity within the N Alternatives** (force the 3 picks to span near/medium/far). Rejected for v1: complex, marginal UX value at small N.

## Consequences

- `src/lib/routing/route-planner.ts:286` — `slice(1, 3)` replaced with a slice driven by computed `N`. `ChargingStopWithAlternatives` shape unchanged, so existing consumers (UI, eVi, tests) keep working.
- New module: `src/lib/routing/backup-pressure.ts` exporting `computeBackupPressure(input)` returning `0–5`. Unit-tested in isolation.
- New filter step inside `planChargingStops`: candidates exceeding 10 km detour or 20% remaining-range detour are dropped *before* `scoreStation`. This drops far-off-route junk that today survives into the alternatives slice.
- v1 magic numbers (delta only — ranker constants `CHARGING_EFFICIENCY_FACTOR`, `VINFAST_BONUS_CAP`, `OK_RANK_THRESHOLD` unchanged):
  - `0.70` next-stop range threshold
  - `25` low-battery %
  - `3` downstream-station count threshold
  - `100` km downstream radius
  - `720` sec (12 min) detour drive-time budget
  - Peak Windows `11–13h` / `17–20h`
  - Bucket boundaries `0–1` / `2–3` / `4–5`
  - Range-aware detour budget (`≤ 20%` of remaining range) deferred to post-launch
- Edge case: `N = 0` Stop. UI must surface "no backup available — charge to ≥ 90%" banner. New locale keys needed in `messages/{vi,en}.json`.
- Edge case: Tết on dense corridor → many Stops at `N = 3` → marker clutter. UI may need zoom-dependent alternative dimming. Discovered post-launch.
- Calibration debt: peak windows and bucket thresholds are guesses. Need post-ship telemetry (which Alternative was clicked? did the user switch from primary?) within 2–4 weeks.
- Phase 3b (popularity-prediction) will add `reliability` and `congestion_forecast`. A successor ADR will record the recalibration: weights shift, Peak Window heuristic replaced by data, bucket thresholds may not change.

## Implementation outline

| Layer | Files touched | Net delta |
|---|---|---|
| Pressure calc | new `backup-pressure.ts` + colocated test | ~80 LOC + ~15 tests |
| Wire into planner | edit `route-planner.ts` (`slice` site + filter step) | ~30 LOC, modifies 1 function |
| Locale keys for `N=0` banner | `messages/{vi,en}.json` + `locale-keys.test.ts` covers parity | ~6 lines |
| UI dimming for marker clutter | deferred to post-ship after observing real Tết data | — |
| Telemetry | deferred to its own phase (Phase 3b boundary) | — |
