# Precautionary extra Stops — vehicle-aware top-up injection gated on `BackupPressureScore` × `RangeSafetyFactor`

Decided 2026-05-24. Revisits the rejection in [ADR-0006](./0006-backup-station-selection.md) §"Considered alternatives" → "Precautionary extra Stops". Successor to the PRD at [docs/plans/2026-05-24-option-c-precautionary-extra-stops.md](../plans/2026-05-24-option-c-precautionary-extra-stops.md) (GH issue #23). Skips ADR-0008, which is reserved for ADR-0007's telemetry-driven UI exposure per the chain of consequences.

## Context

ADR-0006 shipped per-Stop **Alternatives** (0–3 backup Stations attached to each Stop, count driven by `BackupPressureScore`). It explicitly rejected **Option C** — precautionary extra Stops between required Stops — on the basis that "each Stop is 30–60 min; users avoid stopping more than necessary."

Three things changed since 2026-05-07:

1. **The original cost assumption used a full 80% charge.** A 60% top-up is 15–25 min, roughly half. The cost-benefit calculation is materially different.
2. **The "sparse-area" indirect mitigation is weakly effective.** Per `BackupPressureScore`'s downstream-density signal, sparse legs surface more Alternatives at the *next* Stop. But Alternatives don't help when the user is already past the last viable Station on the current leg.
3. **Phase 3b telemetry (`StationStatusObservation`, recording since 2026-05-03) shows cascading outages are not as rare as assumed.** At least one April 2026 observation window showed three adjacent QL14 Stations offline simultaneously. ADR-0006's "rare and usually localized" framing is being challenged by data.

The current planner produces a `Trip Plan` with the *minimum* number of Stops the range math allows. It does not protect against the five failure modes the planner cannot predict from input alone:
- Cascading Station failures (≥2 on-route Stations offline at arrival time)
- Slow-charge surprises (planned 100 kW throttled to 50 kW)
- Unbudgeted detours
- Weather-driven range loss beyond `RangeSafetyFactor`
- Driver behavior (leaving a Stop early)

## Decision

Inject **precautionary top-up Stops** between existing required Stops when leg-level risk warrants it, capped at 2 per Trip, behind env-flag `PRECAUTIONARY_STOPS_ENABLED` for staged rollout. The injection runs *between* `findChargingDecisionPoints` and `planChargingStops`, so no existing pipeline stage changes its signature.

### Five locked decisions (D1–D5)

**D1 — Nested alternatives stay enabled.** Precautionary Stops carry their own 0–3 Alternatives, computed the same way as required Stops via `BackupPressureScore` + `scoreStation`. The two distinct user actions — *skip this entire Stop* vs *swap the Station at this Stop* — are separated visually: dismiss control sits **outside** the Alternatives picker, never inside it. The card-level "ĐỀ XUẤT" chip + dashed border + 70% opacity convey optionality at the card level.

**D2 — Injection threshold scales with `RangeSafetyFactor`** (step function, not a hard floor):

```
Safety Factor   Pressure threshold   CONTEXT.md tier
≤ 0.70          5                    "very safe"
0.71 – 0.80     4                    "recommended"
0.81 – 1.00     3                    "risky"
```

Three buckets align with the existing `getRangeSafetyWarning` tiers — no new vocabulary. Step function (not linear interpolation) for testability and explainability.

**D3 — Top-up charge target is vehicle-aware** (step function by battery capacity):

```
Battery capacity      Top-up target
≥ 80 kWh (VF8, VF9)   60%
60 – 79 kWh (VF7)     65%
40 – 59 kWh (VF6)     70%
< 40 kWh              75%
```

Larger batteries extract more usable range from the same percentage; smaller batteries need a higher percentage to maintain comparable real-world cushion. All four buckets exit a Station with charge time ≤ 25 min on a 100 kW DC fast charger. Pure function: `topUpTargetForVehicle(batteryCapacityKwh: number) → number`.

**D4 — Dismissals persist per `(tripId, stationId)` pair in the saved-trip notebook.** On reload, the planner runs fresh; suggestions matching a dismissed pair are silently filtered. Context changes (date moves to Tết, new offline-Station data) can produce *new* suggestions for *different* Stations — the system stays current without nagging.

**D5 — Precautionary Stop suppresses ADR-0006's N=0 banner** on the same leg. The injected Stop *is* the protection the banner asked the user to perform manually. `applyBackupPressure` must check the leg's injection status before emitting the N=0 banner.

### No user-facing toggle in v1

A "Đi chắc tay" / "Play it safe" toggle was considered and rejected for v1. Vietnamese drivers do not think in "modes" — surfacing the toggle forces them to predict risk they cannot evaluate. Pre-translated copy lives in `messages/{vi,en}.json` reserved keys (`extra_stop_mode_*`) for a v2 fallback if telemetry shows >50% dismissal.

## Why

**Splitting "should this leg have a precautionary Stop?" (count) from "which Station should we pick?" (ranking) keeps the architecture honest** — same insight as ADR-0006. `findInjectionSites` (Module A) decides count and position; `scoreStation` (existing) decides which Station to pick at each injected position. No new ranking logic.

**Step functions over continuous curves** for both D2 and D3. Linear interpolation is mathematically smoother but harder to test exhaustively and harder to explain in a telemetry review. With buckets, every test case is a discrete boundary; with linear, every test case is a magic number.

**Vehicle-aware top-up (D3) over fixed 60%.** A VinFast VF8 at 60% has ~250 km usable range — adequate for a mid-leg top-up. A theoretical 30 kWh vehicle at 60% has ~80 km usable — insufficient. The original PRD's "fixed 60%" was a simplifying assumption that did not hold across the vehicle catalog. Vehicle-aware costs one pure-function module and a 4-row test table.

**Scaling pressure thresholds by `RangeSafetyFactor` (D2) over hard floor.** A hard floor at 0.80 silently disables Option C for the most safety-conscious users — exactly the wrong segment. Scaling preserves the protection for them at a higher bar (threshold 5 = only the most extreme legs), while loosening it for risk-takers (threshold 3) where the system's protection is most needed to offset their explicit choice. The three buckets align with existing CONTEXT.md vocabulary.

**Full nested alternatives at precautionary Stops (D1) over force-zeroed nMax.** Force-zeroing would have been the simpler choice. But a precautionary Stop is a real Stop — if the user accepts it, they're driving to a Station; if that Station is offline when they arrive, they need Alternatives just like at any other Stop. The UI complexity ("skip stop" vs "swap station") is a one-time design cost; the operational simplicity (precautionary Stops behave like required Stops in every downstream module) is permanent.

**Persistent dismissals scoped per `(tripId, stationId)` (D4) over session-only.** Saved trips re-running the planner on reload would re-show every dismissed suggestion — high-friction nagging. Trip-wide skip ("never suggest precautionary Stops on this trip") would be too coarse — context changes (date moves to a holiday) deserve a fresh look. `(tripId, stationId)` is the smallest reasonable granularity.

**Precautionary Stop suppresses N=0 banner (D5) over both-shown.** Showing both is preachy and redundant. The banner's verb ("charge to ≥90%") is what the precautionary Stop physically does. One mechanism beats two competing recommendations.

## Considered alternatives

- **Re-reject Option C and ship reliability scoring earlier instead.** Rejected. Reliability (ADR-0007) protects against picking a chronically-unreliable Station; it doesn't protect against a reliable Station being temporarily offline at the moment of arrival. Different problem class.
- **Soft Option C only — raise `SAFETY_BUFFER_KM` from 30 to 50 km and `CHARGE_TARGET_PERCENT` from 80% to 90% on high-pressure legs.** Rejected: the change is invisible to users (no card to dismiss) which defeats telemetry-driven calibration. Also interacts poorly with user-set `rangeSafetyFactor` (double-protection on conservative users).
- **In-trip rerouting using live VinFast SSE Station status** (original "option D" in ADR-0006). Deferred — `StationStatusObservation` is now collecting the data but the push-notification + bulk-status infrastructure is non-trivial. Revisit after 12 weeks of Option C telemetry.
- **User-facing "Đi chắc tay" toggle in v1.** Rejected: forces users to predict risk they cannot evaluate. Reserved as v2 fallback if dismissal rate exceeds 50%.
- **Hard floor at `RangeSafetyFactor` = 0.80** (the PRD's original stance). Rejected per D2 reasoning above.
- **Fixed 60% top-up target across all vehicles** (the PRD's original stance). Rejected per D3 reasoning above.
- **Force-zero nMax at precautionary Stops** (simpler architecture). Rejected per D1 reasoning above.
- **Trip-wide dismiss ("never suggest precautionary Stops on this trip")** as a coarser alternative to D4. Rejected: trip context can change after saving (date moves into Tết window); the system needs to surface fresh signals.
- **Cap of 3 precautionary Stops per trip.** Rejected: at 3, the plan starts to feel punitive (HCMC → Buôn Ma Thuột on Tết would hit the cap on every trip). 2 is the working limit; trip-level alternative-day suggestions handle the overflow case in a future PRD.
- **Weather-aware injection** (cold rain / heavy A/C). Deferred — needs a weather data source we don't have. Revisit when weather data is available.

## Consequences

### Pipeline

The planning pipeline gains one stage between existing ones:

```
findChargingDecisionPoints                                  ← unchanged
  → computeBackupPressure per leg                           ← reuse existing module
  → [NEW] findInjectionSites (D2 threshold curve)           ← Module A, pure
  → [NEW] injectPrecautionaryStops                          ← Module B, pure
  → planChargingStops                                       ← unchanged signature
  → applyBackupPressure (D5 banner-suppression check)       ← +1 input parameter
  → API enrichment + popularity                             ← unchanged
```

### Type additions

- `ChargingDecisionPoint` gains optional `isPrecautionary?: true`
- `ChargingStop` and `ChargingStopWithAlternatives` gain optional `isPrecautionary?: true` and `precautionaryReason?: 'holiday' | 'sparse' | 'peak' | 'tightMargin' | 'lowBuffer'`
- `applyBackupPressure` accepts new parameter: `precautionaryStopsByLegIndex: ReadonlyMap<number, boolean>` (D5 wiring)

All flags are optional; absence treated as `false`. Zero breaking changes to existing API contract or response shape for clients that don't read the new fields.

### Schema change (D4)

Additive column on the saved-trip model in `prisma/schema.prisma`:

```prisma
dismissedPrecautionaryStops Json?  // [{ tripId: string, stationId: string }]
```

Additive — no migration risk for existing rows. JSON over a separate junction table for v1 simplicity; if dismissal volume grows beyond ~50 per trip (unrealistic), revisit with a proper table.

### Feature flag

- `PRECAUTIONARY_STOPS_ENABLED` env var (server-side only), defaults to `false`
- When `false`: modules A and B never run; pipeline behaves identically to today
- Rollout plan: enable on staging → 10% production traffic for 1 week → full rollout if dismissal rate < 50% and no support escalations

### Locale keys

18 new keys under `extra_stop_*` namespace (defined in the PRD's locale table). Two existing keys tightened to disambiguate "alternatives at a Stop" from "extra Stop between Stops":

| Key | Before | After |
|---|---|---|
| `stations_view_alternatives` (VN) | `{{count}} lựa chọn khác` | `{{count}} trạm dự phòng` |
| `stations_view_alternatives` (EN) | `{{count}} more options` | `{{count}} backup stations` |

Reserved v2 keys (toggle copy) added but unused in v1: `extra_stop_mode_label`, `extra_stop_mode_hint`.

### Telemetry

Four new events wired from day one:
- `extra_stop_suggested` — properties: `tripId`, `reasonPrimary`, `reasonSecondary[]`, `pressureScore`, `legDistanceKm`, `legSparsityCount`, `safetyFactor`, `vehicleBatteryKwh`
- `extra_stop_accepted` — implicit acceptance (stop survives to trip start)
- `extra_stop_dismissed` — properties + `dismissTimeMsFromShown`
- `extra_stop_undone` — undo within 5s of dismiss

New aggregate event sibling to existing `trackBackupAlternativesDistribution`: `trackPrecautionaryStopDistribution` (per-trip count, bucketed 0/1/2).

Success criterion for v1: dismissal rate < 50% within 4 weeks of launch. Otherwise, ship v2 toggle.

### Test impact

- Existing 1237 unit/integration tests: ~5 fixtures in `route-planner.test.ts` need updating to account for `isPrecautionary` flag on `ChargingStop`. Feature-flag default `false` means most tests are unaffected.
- New tests: ~70 cases across 5 new test files + extensions to 3 existing. Target post-merge count: ~1307 unit, 20 E2E (one new Playwright spec for "Tết trip with precautionary stop dismissal flow").

### v1 magic numbers (delta only)

- D2 threshold curve: `5 / 4 / 3` at SF buckets `≤0.70 / 0.71-0.80 / 0.81-1.00`
- D3 top-up curve: `60 / 65 / 70 / 75` % at battery buckets `≥80 / 60-79 / 40-59 / <40` kWh
- Max precautionary Stops per Trip: 2
- 12-min round-trip detour budget (inherited from ADR-0006, unchanged)
- Dismissal undo window: 5 s

All exposed via config for post-launch A/B retuning.

### Calibration debt

- D2 buckets are guesses informed by CONTEXT.md tier vocabulary, not telemetry. Week-8 review.
- D3 buckets are reasoned from VinFast catalog. No competitor data yet; revisit when non-VinFast vehicles enter the catalog.
- D5 banner-suppression logic is testable but the user-facing implication ("the planner switched from telling you to charge more to telling you to stop more") is unstudied. Watch support feedback.

### Dependencies

- **ADR-0006** (Backup Pressure Score) — shipped; this ADR extends it.
- **ADR-0007** (Reliability ranking) — gated on Phase 3b data accumulation (~2026-06-02). Not a blocker; precautionary Stops use the existing ranker as-is.
- `src/lib/trip/vietnam-holidays.ts` — already covers Tết, 30/4, 2/9, Giỗ Tổ. No new data source needed.

## Implementation outline

| Layer | Files touched | Net delta |
|---|---|---|
| Injection-site detector (D2 curve) | new `src/lib/routing/precautionary-stop-detector.ts` + colocated test | ~80 LOC + ~25 tests |
| Stop injector | new `src/lib/routing/stop-injector.ts` + test | ~60 LOC + ~15 tests |
| Vehicle-aware top-up target (D3) | new `src/lib/routing/top-up-target.ts` + test | ~30 LOC + ~10 tests |
| Orchestrator bridge | new `src/lib/routing/precautionary-stop-builder.ts` + test | ~50 LOC + ~10 tests |
| Type extensions | edit `src/types/index.ts` (additive optional flags) | ~10 LOC |
| Pipeline wiring | edit `src/app/api/route/route.ts` (feature flag, orchestrator call) | ~30 LOC |
| D5 banner suppression | edit `src/lib/routing/apply-backup-pressure.ts` (+1 param) | ~10 LOC |
| Schema (D4) | edit `prisma/schema.prisma` + migration + repo update for trip-notebook store | ~20 LOC + migration |
| UI — timeline | edit `src/components/trip/TripSummary.tsx` (dashed border, ĐỀ XUẤT chip, dismiss link, why-modal) | ~120 LOC |
| UI — map | edit `src/components/map/MapboxMap.tsx` (smaller dashed pin, mini-popup) | ~40 LOC |
| Locale keys | edit `src/locales/{vi,en}.json` (18 new + 2 microcopy edits) | ~40 lines |
| Telemetry | edit `src/lib/analytics.ts` (4 new events + 1 aggregate) | ~50 LOC + ~6 tests |
| E2E | new `tests/e2e/precautionary-stop.spec.ts` | ~60 LOC, 1 spec |
| **Total** | **~600 LOC production, ~75 new unit/integration tests, +1 E2E spec** |

Estimated 3 focused sessions for an experienced contributor:
1. Pure modules (detector, injector, top-up target, orchestrator) — TDD, fully testable in isolation
2. Pipeline wiring + schema + telemetry — integration tests at API route boundary
3. UI (timeline + map) + locale + E2E — visual + interaction coverage

Code review: 1 session. Internal testing: 1 week. Production rollout: 2 weeks (10% → 100%). Telemetry calibration window: 4 weeks. **Total time from this ADR to full rollout: ~7 weeks.**
