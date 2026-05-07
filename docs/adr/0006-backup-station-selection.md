# Backup station selection uses dynamic 0–3 Alternatives ranked by pressure + detour

Decided 2026-05-07 during architectural design discussion (`grill-with-docs` session).

## Context

`TripPlanner` (ADR-0004) returns one charging Stop per leg. When that Stop fails — broken charger, full queue, closed for maintenance — the user has no fallback prepared. VinFast SSE provides per-station real-time status only on click, not bulk, so reactive in-trip rerouting isn't viable yet.

Vietnam has wide variance in station density: HN–HP corridor has 5+ Stations within 10km of any planned Stop; QL14 (Buôn Ma Thuột → Pleiku) may have exactly one usable Station for 50km. A static `N = 2` rule generates fake Alternatives in sparse zones and over-clutters the map in dense ones.

## Decision

Each `Stop` in the returned `TripPlan` carries `alternatives: AlternativeStation[]` where `N` ∈ [0, 3], computed at plan time on the server.

### Count

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

N = min(N_max, candidates_within_radius)
```

### Filter (hard, applied before ranking)

A Station is a candidate iff all hold:

- Connector + power compatible with `Vehicle`
- Detour ≤ 10km off-route from primary Stop
- Detour ≤ 20% of remaining Usable Range at primary Stop

### Ranking (top N selected from candidates)

```
score = 0.60 × (−detour_km)
      + 0.25 × charger_count_bonus       (>2 chargers ⇒ bonus)
      + 0.15 × operator_diversity        (Operator ≠ primary's ⇒ bonus)
```

`AlternativeStation` is owned by `TripPlanner`. Selection runs after the primary Stop is picked, before HTTP serialization.

## Why

Splitting "should this Stop have backup?" (count) from "which Stations are best?" (ranking) is the central insight. Both questions have different signals: count = risk, ranking = quality. A weighted-sum-everything approach blurs them and makes calibration impossible — a future developer staring at the score function can't separate "we picked this Station because the route is risky" from "we picked it because it's a good Station."

Five count signals were chosen as the **smallest set computable today**. Three (distance, battery, downstream density) come from data already in `TripPlanner`. Two (Peak Window, holiday) leverage `src/lib/trip/vietnam-holidays.ts` and a hardcoded peak heuristic — no new data sources, no new API costs.

`N = 0` is a feature, not a bug. Forcing a fake Alternative in a sparse zone (e.g. one VinFast Station and 25km to anything else) misleads the user into thinking they have a fallback they don't. UI must surface "no backup available in this area — sạc đầy hơn 80% trước khi rời", not silently omit.

Reliability score is the strongest *theoretical* ranking signal for backup ("backup must itself be reliable"), but requires accumulated station-status data the system isn't yet collecting at scale (Phase 3b spec). v1 ships without it; ranking is weaker than it could be. This is accepted: the alternative is to block the entire feature for months.

## Considered alternatives

- **Fixed `N = 2` always.** Rejected: forces fake Alternatives in sparse zones and clutters dense ones. Same UI complexity as dynamic, weaker correctness.
- **Real-time in-trip rerouting (option B in discussion).** Rejected for v1: VinFast SSE doesn't support bulk status; would require dedicated status crawl + push notification infrastructure. Pre-trip alternatives extracts most value at a fraction of the cost.
- **Adding precautionary extra Stops to the route (option C in discussion).** Rejected: opposite of UX — each Stop is 30–60min and users avoid stopping more than necessary. C is appropriate only in extreme sparse zones (Tây Bắc, Tây Nguyên); the current pressure-driven approach captures that case via the downstream-density signal without forcing it elsewhere.
- **Six count signals including pass-detection (`src/lib/trip/detect-passes.ts`).** Rejected: double-counts with downstream density (mountain passes correlate with sparse areas). Adds calibration burden without new information. Reconsider if downstream density proves an insufficient proxy.
- **Reliability score in ranking.** **Deferred, not rejected.** Phase 3b will ship popularity-prediction + station-status history. At that point, reliability is added as the dominant ranking signal (weight ≈ 0.30–0.40), redistributing detour to ≈ 0.40 and dropping operator diversity. A new ADR will record the recalibration.
- **Single weighted-sum across all 8+ factors.** Rejected: blurs count vs. ranking concerns, magic-number explosion, debug-impossible.
- **Diversity within the N Alternatives** (force the 3 picks to span near/medium/far or different Operators). Rejected for v1: complex to implement, hard to debug, marginal UX value when N is already small.

## Consequences

- `TripPlan` response shape extends: each `Stop` gains `alternatives: AlternativeStation[]`. Existing clients reading `.stops` continue to work; `alternatives` is additive.
- `TripPlanner` Module grows. Internal helpers `computeBackupPressure`, `filterCandidates`, `rankAlternatives` are private — not part of the external Interface (see ADR-0004 on Interface depth).
- v1 ships with **8 magic numbers**: `0.70` (next-stop range threshold), `25` (low-battery %), `3` (downstream-station count), `100` (downstream km radius), `10` (detour km), `20` (detour as % range), weights `0.60 / 0.25 / 0.15`, Peak Windows `11–13h / 17–20h`, bucket boundaries `0–1 / 2–3 / 4–5`. All exposed via `TripPlanner` config so they're A/B-tunable post-launch — none should be considered "right" until calibrated against telemetry.
- Edge case: high-pressure dense corridor (Tết on HN–HP) → every Stop has `N = 3` → many secondary markers. UI may need to dim Alternatives below an "interest threshold" or hide on zoom-out. Discovered post-launch.
- Edge case: `N = 0` Stop. UI must surface a "no backup available — charge to ≥ 90%" banner, not silent omission.
- Calibration debt is real. Required telemetry to recalibrate within 2–4 weeks of ship: which Alternative did the user click? Did they reach destination? Did they switch from primary? Without this, the magic numbers ossify.
- Phase 3b (popularity-prediction) will add `reliability` to `Station` and a `congestion_forecast` API. A successor ADR will record the recalibration: weights shift, Peak Window heuristic is replaced by data, bucket thresholds may not change.
