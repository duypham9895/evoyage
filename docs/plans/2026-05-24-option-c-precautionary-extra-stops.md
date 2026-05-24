# PRD — Option C: Precautionary Extra Charging Stops

**Status:** Draft · awaiting triage
**Author:** Duy Phạm (PM) with role consults: Senior SWE, Senior UX Designer, Senior Content Writer
**Date:** 2026-05-24
**Revisits:** [ADR-0006 §"Considered alternatives" → "Precautionary extra Stops"](../adr/0006-backup-station-selection.md) (rejected 2026-05-07)
**Successor target:** ADR-0009 (ADR-0008 reserved for ADR-0006 telemetry-driven UI exposure per ADR-0007 §"Consequences")

---

## Problem Statement

Vietnamese EV drivers planning long-distance trips on eVoyage receive a charging plan optimized for the *minimum* number of stops their range math allows. The plan does not protect against five real-world failure modes that the planner cannot predict from input alone:

1. **Cascading station failures** — two or more stations on the planned route are offline at the time of arrival. Today's "alternatives per stop" feature (ADR-0006) protects against *one* offline station per stop, not chained outages.
2. **Slow-charge surprises** — user planned 30 min at 100 kW, station throttles to 50 kW, vehicle leaves at 65% instead of 80%. The next leg starts with less margin than the plan assumes.
3. **Unbudgeted detours** — road closure forces a 30 km detour on a tight leg, with no replan because the user is driving.
4. **Weather range loss** — cold rain or heavy A/C use degrades real-world range beyond the user's `rangeSafetyFactor` setting.
5. **Driver behavior** — the user leaves a stop early ("close enough at 70%") in a hurry, voiding the plan's 80% assumption.

When any of these compound on a Tết-weekend trip through a sparse corridor (QL14, QL20), the consequence is being stranded with insufficient range to reach the next station. Today the system has no mechanism to recommend "stop one extra time as a cushion" — it can only recommend "have more fallback options *at* each existing stop", which is a different protection.

## Solution

When the trip planner detects elevated risk on a leg between two existing charging stops, it injects a **precautionary top-up stop** between them. The injected stop is visually and verbally distinct from required stops, explicitly optional, and dismissable in one tap. Each precautionary stop is a 15–25 min top-up (~30–40% added charge), not a full 80% charge.

The trigger uses signals already computed by the existing `BackupPressureScore` (ADR-0006): tight margin, low arrival battery, sparse downstream stations, peak window, holiday date. When pressure score ≥ 4 on a leg AND a suitable station exists near the leg midpoint AND total trip already has < 2 precautionary stops injected, the planner adds one.

The user can dismiss any precautionary stop with one tap. Dismissal is local (no replan), persists for the current trip session, and surfaces an inline undo. After 3+ dismissals across recent trips, a one-time soft prompt offers a "Đi chắc tay" (Play it safe) preference toggle to reduce frequency — this toggle is **NOT** exposed by default in v1.

## User Stories

1. As a Vietnamese EV driver planning a HCMC → Đà Lạt trip on Mùng 2 Tết, I want the planner to suggest one extra top-up stop between my required stops, so that I am not stranded if a station on my main route is overcrowded with holiday traffic.

2. As a driver, I want each precautionary stop to be clearly marked as "suggested" rather than "required", so that I understand it is optional.

3. As a driver, I want to dismiss a precautionary stop in one tap, so that I can override the suggestion without friction when I disagree.

4. As a driver who dismissed a precautionary stop, I want to undo my dismissal within a few seconds, so that I recover from accidental skips.

5. As a driver, I want to see *why* a precautionary stop was suggested (e.g., "holiday — stations ahead get busy"), so that I can judge whether the reason applies to my situation.

6. As a driver, I want precautionary stops to take 15–25 minutes (not the full 30–40 min of a regular stop), so that adding them does not double my trip duration.

7. As a driver on a low-risk weekday trip with dense charging infrastructure, I want the planner to NOT suggest precautionary stops, so that I am not nagged when the risk does not warrant it.

8. As a driver, I want precautionary stops capped at 2 per trip, so that long Tết corridors do not feel punishing or imply the planner has lost confidence.

9. As a driver who dismisses precautionary stops on most trips, I want a one-time prompt to opt out of future suggestions, so that I stop seeing them without changing app settings.

10. As a driver looking at the trip timeline, I want precautionary stops rendered with a visually softer treatment (dashed border, 70% opacity, "ĐỀ XUẤT" chip), so that I can tell at a glance which stops are required vs suggested.

11. As a driver looking at the map, I want precautionary stop pins to be smaller and visually lighter than required-stop pins, so that the visual hierarchy mirrors the timeline.

12. As a driver sharing a trip URL with a friend, I want stop identity preserved by station, not by ordinal position, so that "Stop 3: Bảo Lộc" doesn't become "Stop 2: Bảo Lộc" if I dismissed an earlier suggestion.

13. As a driver who dismisses a precautionary stop and falls below 15% arrival battery at the next stop, I want a warning surfaced in the existing trip warnings area, so that I understand the consequence of my dismissal.

14. As a driver who lives in southern Vietnam, I want the holiday signal to recognize 30/4 and 2/9 (not just Tết), so that the protection applies across all major holidays.

15. As a screen-reader user, I want each precautionary stop announced with its optional status ("suggested stop number 2, Bảo Lộc, 15 minute top-up, can be skipped"), so that I can navigate the trip plan without sighted-only cues.

16. As a keyboard-only user, I want to Tab to focus the dismiss button and press Enter to skip a precautionary stop, so that I can manage suggestions without a pointing device.

17. As a driver who explicitly set Range Safety Factor to 0.70 (very safe), I want precautionary stops triggered only at the highest pressure (5/5), so that my conservative setting and the system's protection scale together without making my plan unviable. (Resolved per D2.)

18. As a driver looking at trip arrival time, I want the displayed total duration to update immediately when I dismiss a precautionary stop, so that I see the time savings.

19. As a driver on the desktop sidebar, I want the dismiss action to be hover-revealed (not always visible), so that I do not accidentally skip suggestions during careful planning.

20. As a product manager, I want telemetry events (`extra_stop_suggested`, `extra_stop_accepted`, `extra_stop_dismissed`, `extra_stop_undone`) wired from day one, so that I can calibrate trigger thresholds within 4 weeks of launch.

21. As a content writer, I want the suggestion copy to use Duy's voice ("Duy gợi ý...") and benefit-framed language ("cho yên tâm"), so that the suggestions feel warm and human, not robotic or alarmist.

22. As a driver on a route where the only viable midpoint station is >5 km off-route, I want the planner to silently skip the injection, so that I am not offered a detour that defeats the purpose.

23. As a future maintainer, I want the precautionary-stop logic isolated in pure, side-effect-free modules with isolated unit tests, so that I can change trigger thresholds or injection rules without breaking the rest of the planner.

24. As an internal stakeholder during rollout, I want the feature gated behind an environment flag (`PRECAUTIONARY_STOPS_ENABLED`), so that we can ship the code without exposing the feature until UI design and copy review are complete.

25. As a product manager analyzing dismissal patterns, I want each dismissal event tagged with the trigger reason (holiday/sparse/peak/tightMargin/lowBuffer), so that I can identify which signal over-fires and adjust thresholds per-signal.

---

## Implementation Decisions

### Module architecture

The feature splits into four new modules following the codebase's deep-module discipline (mirroring the pattern established by `backup-pressure.ts` + `apply-backup-pressure.ts`). All four are pure or near-pure; testable in isolation.

**Module A — Injection-site detector (pure).** Takes the existing charging decision points and their pre-computed `BackupPressureScore`s, returns a list of "between which two stops should we inject, and with what urgency". Trigger: pressure ≥ 4 on a leg AND distance between adjacent stops > 60% of usable range AND total injected stops < 2 AND user's range safety factor ≥ 0.80.

**Module B — Stop injector (pure).** Takes the original decision-point array plus a list of injection sites plus the station catalog, returns a new array with synthetic decision points spliced in at midpoint positions. Each synthetic decision point carries an `isPrecautionary: true` flag. The function does not mutate inputs; it returns a new array.

**Module C — Top-up charge target resolver (pure).** Encapsulates the rule "precautionary stops charge to 60%, required stops charge to 80%". Required because the existing planner uses a single global `CHARGE_TARGET_PERCENT` constant; this module lets the API route pass a per-stop target without restructuring `planChargingStops`. A precautionary stop's lower target is what makes it "15–25 min" instead of "30–40 min".

**Module D — Precautionary stop orchestrator (IO-light).** Bridges modules A, B, C into the planning pipeline. Reads the feature flag, runs the detection, runs the injection, threads per-stop charge targets. Lives between `findChargingDecisionPoints` and `planChargingStops` in the request flow.

### Type changes

- `ChargingDecisionPoint` gains an optional `isPrecautionary?: true` flag.
- `ChargingStop` and `ChargingStopWithAlternatives` gain an optional `isPrecautionary?: true` flag (passed through from the decision point).
- `ChargingStop` and `ChargingStopWithAlternatives` gain an optional `precautionaryReason?: PrecautionaryReason` enum (`'holiday' | 'sparse' | 'peak' | 'tightMargin' | 'lowBuffer'`) — drives the why-explanation copy.
- All flags are optional; all existing consumers treat absence as false. Zero breaking changes to existing API contract.

### Wiring into the existing pipeline

```
findChargingDecisionPoints                   ← unchanged
  → compute BackupPressureScore per leg      ← reuse existing computeBackupPressure
  → [NEW] findInjectionSites                 ← Module A
  → [NEW] injectPrecautionaryStops           ← Module B
  → planChargingStops                        ← unchanged signature, longer decision-point array
  → applyBackupPressure                      ← unchanged (alternatives still trim per stop)
  → API enrichment + popularity              ← unchanged
```

The planner's signature does not change. `applyBackupPressure` already runs on the full stop list, so precautionary stops naturally get their own per-stop alternatives count too (likely `N=0` or `N=1` since they're already injected for safety — the orchestrator may force `nMax=0` on precautionary stops to avoid alternative-of-an-alternative confusion).

### Feature flagging

- Server-side: `PRECAUTIONARY_STOPS_ENABLED` env var, default `false`. When `false`, modules A–C never run; the pipeline behaves identically to today.
- No client-side flag. The feature is fully server-driven.
- Flag flip plan: enable on staging during code review, enable in production behind a 10% traffic shadow for 1 week, then full rollout.

### User-facing toggle: NOT in v1

A "Đi chắc tay" (Play it safe) toggle was considered (Content writer prepared full copy) and **rejected for v1**. Rationale: Vietnamese drivers do not think in terms of "modes" — surfacing a toggle forces them to predict risk they cannot evaluate (station density on QL14 at km 187 on Mùng 2 Tết). The system already computes that risk; that's our job.

The toggle re-enters scope only as a **v2 fallback** if telemetry shows users dismiss precautionary suggestions in > 50% of trips. At that point, the toggle becomes an opt-out, not an opt-in. Copy is pre-drafted (see locale keys table below) so v2 is a UI-only ship.

### Dismiss state machine

```
SUGGESTED ─tap "Bỏ qua"─> CONFIRMING ─tap confirm─> DISMISSED (this session)
                              │                           │
                              tap cancel                  Card collapses (200ms)
                              │                           Downstream renumber (live view only)
                              ↓                           Arrival battery hero recomputes
                          SUGGESTED                       Inline undo for 5s
                                                          │
                                                          tap "Hoàn tác" ──> SUGGESTED
```

- Dismissal scope: current `tripId` only. Reopening the trip re-shows the suggestion.
- No re-request to `/api/route`. The polyline is unchanged; only the rendered `chargingStops` array filters out the dismissed entry.
- Dismissal cascade: if dismissing pushes the next required stop's arrival battery below 15%, the existing `warnings` array gains a new `INSUFFICIENT_MARGIN_AFTER_SKIP` entry. Reuse the existing warning pill UI; do not invent a new pattern.
- Shared trip URLs preserve stop *identity* (station ID) — renumbering happens only in the live session. A screenshot of "Stop 3: Bảo Lộc" remains "Stop 3" on subsequent loads.

### Visual treatment (timeline)

- Card stays in chronological position (sorted by `distanceAlongRouteKm`).
- Border: `border-dashed border-[var(--color-border)]` (instead of solid `border-[var(--color-surface-hover)]`).
- Chip: "ĐỀ XUẤT" / "SUGGESTED" — flat surface color, NOT accent. Distinct from `BEST/OK/SLOW` quality chips.
- Body opacity: 0.7 until tapped/expanded.
- Charge time display: "~{{minutes}} phút sạc nhẹ" / "~{{minutes}} min top-up".
- Bottom row: "Vì sao?" expander + "Bỏ qua" dismiss link.
- No decorative icons (per CLAUDE.md "Less Icons, More Humanity").

### Visual treatment (map)

- Pin: smaller circle (16px vs the 24px required-stop pin), 1.5px dashed accent border, hollow center.
- No ordinal number on the pin itself.
- Tap: shows a mini-popup with the same "Vì sao? · Bỏ qua" pair as the timeline card.
- Color: same accent green as required stops. Distinguished by size + outline style, not hue. Matches existing `AlternativeMarker` precedent from ADR-0006 — users already have visual vocabulary for "lighter version of stop".

### Vocabulary (resolved)

- **Vietnamese:** "điểm sạc nhẹ" (light top-up stop). Pairs with existing `charging_stops = "Điểm sạc"`. Rejected: "trạm sạc dự phòng" (collides with backup-station meaning from ADR-0006); "trạm sạc bổ sung" (bureaucratic).
- **English:** "top-up stop". Standard UK/AU EV-driver vocabulary. Rejected: "precautionary stop" (clinical), "buffer stop" (jargon), "safety stop" (alarmist).
- Trigger reason phrasing in user copy is always benefit-framed, never risk-framed. "Sạc nhẹ giờ cho yên tâm" not "Nếu không sạc, bạn có thể hết pin".

### Locale keys (18 new keys)

| Key | VN | EN |
|---|---|---|
| `extra_stop_badge` | Sạc nhẹ · gợi ý | Top-up · suggested |
| `extra_stop_duration` | ~{{minutes}} phút sạc nhẹ | ~{{minutes}} min top-up |
| `extra_stop_why_title` | Vì sao Duy gợi ý dừng ở đây? | Why Duy suggests this stop |
| `extra_stop_why_holiday` | Dịp lễ trạm phía trước thường đông — sạc nhẹ giờ cho yên tâm. | Stations ahead get busy on holidays — a top-up now buys peace of mind. |
| `extra_stop_why_sparse` | Đoạn tới ít trạm sạc — thêm chút pin sẽ thoải mái hơn. | Sparse charging ahead — a little extra battery makes the leg easier. |
| `extra_stop_why_peak` | Giờ cao điểm trạm có thể đông — sạc nhẹ trước giúp tránh chờ. | Stations may queue up at peak hour — top up now to skip the wait. |
| `extra_stop_why_tight_margin` | Đoạn tới khá dài — sạc thêm để chắc ăn. | Long leg ahead — a top-up keeps the margin comfortable. |
| `extra_stop_why_low_buffer` | Sẽ đến trạm sau với pin hơi thấp — thêm chút cho yên tâm. | You'd arrive at the next stop low on battery — extra cushion helps. |
| `extra_stop_why_close` | Đã rõ | Got it |
| `extra_stop_dismiss` | Bỏ qua | Skip it |
| `extra_stop_dismiss_confirm_title` | Bỏ qua điểm sạc nhẹ? | Skip this top-up? |
| `extra_stop_dismiss_confirm_body` | Lộ trình vẫn dùng được, chỉ là biên độ an toàn hẹp hơn một chút. | Your route still works — just with a slimmer safety margin. |
| `extra_stop_dismiss_confirm_action` | Bỏ qua | Skip |
| `extra_stop_dismiss_confirm_cancel` | Giữ lại | Keep |
| `extra_stop_dismissed_inline` | Bạn đã bỏ qua điểm sạc nhẹ ở đây · {{action}} | You skipped a top-up here · {{action}} |
| `extra_stop_undo` | Hoàn tác | Undo |
| `extra_stop_count_summary` | Duy gợi ý thêm {{count}} điểm sạc nhẹ | Duy suggests {{count}} top-up stop(s) |
| `extra_stop_insufficient_margin_warning` | Bỏ qua nhiều điểm sạc nhẹ khiến đoạn cuối còn rất ít pin. | Skipping multiple top-ups leaves very low battery on the final leg. |

Reserved for v2 (toggle copy, not used in v1 but pre-translated):
| `extra_stop_mode_label` | Đi chắc tay | Play it safe |
| `extra_stop_mode_hint` | Gợi ý thêm điểm sạc nhẹ khi tuyến đường có rủi ro | Suggests light top-ups when the route looks risky |

### Microcopy adjustments to existing keys

Two existing keys need tightening to disambiguate "alternatives at a stop" from "extra stop between stops":

| Key | Current | Proposed |
|---|---|---|
| `stations_view_alternatives` (VN) | `{{count}} lựa chọn khác` | `{{count}} trạm dự phòng` |
| `stations_view_alternatives` (EN) | `{{count}} more options` | `{{count}} backup stations` |

Other related keys (`stations_no_alternatives`, `popup_backup_for_stop`) already use "trạm dự phòng" / "backup" — no change needed.

### Telemetry plan

Four new events, wired from day one:

1. `extra_stop_suggested` — fires when the planner injects a precautionary stop. Properties: `tripId`, `reasonPrimary` (the dominant trigger), `reasonSecondary[]` (other contributing signals), `pressureScore`, `legDistanceKm`, `legSparsityCount`.
2. `extra_stop_accepted` — fires implicitly when a suggested stop survives to trip start (user did not dismiss). Properties: same as suggested.
3. `extra_stop_dismissed` — fires on confirmed dismiss. Properties: `tripId`, `reasonPrimary`, `pressureScore`, `dismissTimeMsFromShown` (UX latency measure).
4. `extra_stop_undone` — fires when user taps inline undo after dismiss. Properties: same as dismissed.

Existing `trackBackupAlternativesDistribution` event gets a sibling: `trackPrecautionaryStopDistribution` (per-trip count of injected stops, bucketed 0/1/2).

Success criterion for v1: dismissal rate < 50% within 4 weeks of launch. If higher, expose the v2 toggle.

### Resolved decisions (2026-05-24)

The 5 previously-open engineering questions were resolved in a PM Q&A session. Decisions below override any conflicting language earlier in this PRD. Decision IDs (D1–D5) are referenced from §"Module architecture", §"Testing Decisions", and the upcoming ADR-0009.

**D1 — Precautionary stops carry full alternatives (normal nMax 1–3).**
Precautionary stops are NOT structurally distinct from required stops in their alternatives picker. The `BackupPressureScore` runs on them normally and `applyBackupPressure` trims their alternatives normally. The two user actions — "skip this entire stop" vs "swap the station at this stop" — must be visually distinguished. UI resolution: the dismiss control sits **outside** the alternatives picker (a "Bỏ qua điểm sạc nhẹ" link below the entire card), while the alternatives picker is identical to required stops. The dashed border, "ĐỀ XUẤT" chip, and 70% opacity convey optionality at the card level even while alternatives render inside.

**D2 — Range Safety Factor scales pressure thresholds (not a hard floor).**
The injection threshold varies by the user's `rangeSafetyFactor`:

| Safety Factor range | Pressure threshold for injection | CONTEXT.md tier |
|---|---|---|
| ≤ 0.70 | 5 (highest pressure only) | "very safe" |
| 0.71 – 0.80 | 4 (the original PRD value) | "recommended" |
| 0.81 – 1.00 | 3 (more eager injection) | "risky" |

Step function, not linear interpolation — for testability and explainability. The 3 buckets align with the existing `getRangeSafetyWarning` tiers defined in CONTEXT.md. The threshold curve is reviewable in week-8 telemetry alongside the other ADR-0006 calibration.

**D3 — Top-up charge target is vehicle-aware (step function by battery capacity).**

| Battery capacity | Top-up target | Notes |
|---|---|---|
| ≥ 80 kWh (VF8, VF9) | 60% | original PRD value |
| 60 – 79 kWh (VF7) | 65% | |
| 40 – 59 kWh (VF6, future smaller models) | 70% | |
| < 40 kWh | 75% | edge case; no current VinFast model |

Rationale: larger batteries extract more usable range from the same percentage, so a smaller percentage suffices for a comparable real-world cushion. Step function (not linear) to match D2's testability discipline. The target enters the `top-up-target.ts` module as a pure function `topUpTargetForVehicle(batteryCapacityKwh) → number`. All four buckets exit with charge time ≤ 25 min on a 100 kW DC fast charger.

**D4 — Saved trip notebook: save dismissal state, recompute fresh suggestions on reload.**
Dismissals are scoped to `(tripId, stationId)` pairs and persist in the trip notebook. On reload, the planner runs as usual; suggestions matching a dismissed pair are silently filtered. If context changes (trip date moves to Tết, new offline-station data), new suggestions for *different* stations appear normally. Engineering: requires adding a `dismissedPrecautionaryStops: { tripId: string; stationId: string }[]` field to the saved-trip schema in `prisma/schema.prisma` (additive, no migration risk).

**D5 — N=0 banner is suppressed when a precautionary stop is injected on the same leg.**
When a leg's risk would trigger BOTH the N=0 "no backup, charge to ≥90%" banner (ADR-0006) AND a precautionary stop, the precautionary stop wins and the banner is suppressed. The precautionary stop IS the protection the banner asked the user to perform manually. `applyBackupPressure` must check whether a precautionary stop was injected on this leg before emitting the N=0 banner.

---

## Testing Decisions

### Test philosophy

Test the external behavior of each module, not implementation details. The codebase's existing `backup-pressure.test.ts` (15 cases, pure function, exhaustive signal combinations) and `apply-backup-pressure.test.ts` (orchestration with mock context) are the prior-art templates.

### Module-by-module test plan

**Module A — Injection-site detector (pure)**
- Tests location: `src/lib/routing/precautionary-stop-detector.test.ts` (colocated, mirrors `backup-pressure.test.ts`)
- Coverage: ~25 cases
- Inputs to exhaustively cover: pressure score 0/1/2/3/4/5 × distance fraction 50%/60%/70% × existing precautionary count 0/1/2 × range safety factor 0.70/0.80/0.90
- Critical edge cases: pressure exactly 4 with distance fraction exactly 60% (boundary); cap-already-reached at 2; safety factor floor 0.80 boundary.

**Module B — Stop injector (pure)**
- Tests location: `src/lib/routing/stop-injector.test.ts`
- Coverage: ~15 cases
- Cases: 0 injection sites (no-op identity), 1 injection site (basic splice), 2 sites at different positions, immutability check (input array unchanged), midpoint km calculation, station selection from catalog (nearest to midpoint within 5 km), no-viable-station case (silently skip).

**Module C — Top-up charge target resolver (pure)**
- Tests location: `src/lib/routing/top-up-target.test.ts`
- Coverage: ~5 cases
- Cases: precautionary stop → 60%; regular stop → 80%; last stop before destination → existing logic preserved; very-low-battery starting state → no override.

**Module D — Orchestrator (IO-light integration)**
- Tests location: `src/lib/routing/precautionary-stop-builder.test.ts`
- Coverage: ~10 cases
- Cases: feature flag OFF → identity passthrough (no behavior change); feature flag ON + low pressure → no injection; feature flag ON + high pressure on multiple legs → up to 2 injections; safety factor 0.70 → no injection even at pressure 5; precautionary stops have `nMax=0` for alternatives.

### Integration tests

- `route-planner.test.ts` gains 5 new cases covering end-to-end planning with precautionary injection enabled (Tết trip; sparse corridor trip; peak-hour trip; mixed high-pressure trip; low-pressure no-op).
- `/api/route` route handler test (`src/app/api/route/route.test.ts` if exists; if not, create) gains 3 cases covering the env-flag-gated behavior plus correct `isPrecautionary` flag propagation in the response JSON.

### UI tests

- `TripSummary.test.tsx` (component test) gains 4 cases: precautionary stop renders with dashed border + "ĐỀ XUẤT" chip + dismiss link; dismiss tap triggers confirm dialog; confirm dismisses card and renumbers downstream stops; undo restores card.
- `MapboxMap.test.tsx` gains 2 cases: precautionary pin renders with smaller size + dashed outline; tap opens mini-popup with why + dismiss.
- Locale parity (existing `locale-keys.test.ts`) automatically catches missing translations for the 18 new keys.

### Telemetry tests

- New `telemetry.test.ts` cases (or extend existing analytics test) covering the 4 new events fire with correct properties and only fire under correct conditions.

### Test counts (target)

- New unit/integration tests: ~70 cases across 5 new test files + extensions to 3 existing.
- New E2E test: 1 Playwright spec for "Tết trip with precautionary stop dismissal flow".
- Project test count goes from 1237 → ~1307 unit, 19 → 20 E2E.

### Modules the PM specifically wants tests for

All four new modules (A, B, C, D) must have full colocated test coverage before code review. The orchestrator (D) is the most important integration coverage — it's the only point where the feature flag, the safety-factor floor, and the cap interact. A weak Module D test suite means weak feature gating.

---

## Out of Scope

The following are **explicitly NOT in v1** and should not be built unless raised in a subsequent PRD:

1. **User-facing toggle for "Đi chắc tay" / "Play it safe" mode.** Pre-translated but reserved for v2 if dismissal rates exceed 50%.
2. **In-trip re-routing based on live station status.** This was option D in the original ADR-0006 discussion and remains rejected for v1. Phase 3b's `StationStatusObservation` table makes it more viable in 2–3 months; revisit then.
3. **Weather-aware range adjustment.** A precautionary stop suggested specifically because of cold rain or A/C-heavy heat. Requires a weather data source; out of scope.
4. **Soft Option C (raising `SAFETY_BUFFER_KM` and `CHARGE_TARGET_PERCENT` under high pressure).** Considered but rejected for v1 because (a) it makes the behavior change invisible to users, defeating telemetry-driven calibration, and (b) it interacts poorly with user-set `rangeSafetyFactor`. Hard Option C makes the system's recommendation explicit and dismissable.
5. **More than 2 precautionary stops per trip.** Cap is hard. Long sparse corridors (HCMC → Buôn Ma Thuột on Tết) instead surface a trip-level alternative-day suggestion in a future PRD.
6. **Off-route precautionary stops (> 5km detour).** If no on-route candidate qualifies, the precautionary stop is silently skipped — never offered.
7. **Reliability score integration.** ADR-0007's reliability ranking applies to alternatives within a stop. Whether precautionary stops should prefer high-reliability stations is left for the implementation phase — the natural answer is "yes, reuse the existing ranker as-is", no new logic.
8. **Trip cost recalculation.** The trip cost calculator (`src/lib/cost/trip-cost-calculator.ts`) needs to account for the lower charge target of precautionary stops, but the actual cost shift is small (~5–10% lower per precautionary stop). Implementation detail, not a PRD-level decision.
9. **Saved trip notebook integration.** If a user saves a trip with active precautionary stops, do they reappear on reload? Recommended yes, but UI design is deferred to the trip notebook redesign workstream.
10. **A/B testing the trigger thresholds.** Worth considering after 4 weeks of v1 telemetry; not part of initial ship.

---

## Further Notes

### Why this PRD revisits a rejected ADR

ADR-0006 rejected Option C on the basis that "each Stop is 30–60 min; users avoid stopping more than necessary." The argument was sound at the time. Three things have changed:

1. **Lower charge target (60% vs 80%) was not considered in the original ADR.** The 30–60 min cost assumption used the full-charge time. A 60% top-up is 15–25 min — roughly half. The cost-benefit calculation changes materially.
2. **The "sparse-area" signal in shipped Option B (ADR-0006) was named as the indirect mitigation.** Operationally, "show more alternatives in a sparse area" turns out to be only weakly useful when the user is *already past the last viable charging station* on a leg. The alternatives are at the upcoming stop, not in the gap.
3. **Phase 3b telemetry is now collecting `StationStatusObservation`.** We have early signal that the cascading-failure mode is real — at least one observation period in April 2026 showed three adjacent QL14 stations offline simultaneously. ADR-0006's original assumption of "rare and usually localized" outages is being challenged by data.

### Role consultation summary

- **Senior PM (lead):** synthesizes the trade-offs; defends the "no toggle in v1" stance; sets the cap at 2 precautionary stops; chooses 60% as the top-up target; sets the dismissal-rate < 50% success criterion.
- **Senior SWE:** designs the four-module architecture; insists on the feature flag for staged rollout; raises the open question about per-stop charge target threading; estimates ~250 LOC + ~70 tests, 2–3 focused sessions.
- **Senior UX Designer:** designs the dashed-border + opacity + "ĐỀ XUẤT" chip visual treatment; rejects the toggle in favor of automatic injection with per-stop skip; specifies the dismiss state machine including identity-preserved shared URLs; caps at 2 stops per trip.
- **Senior Content Writer:** resolves the "điểm sạc nhẹ" / "top-up stop" vocabulary; writes 18 locale keys + 2 reserved v2 keys; specifies the tone guardrails (Duy's voice, benefit-framed, no alarm vocabulary).

### Rollout plan

1. **Week 1–2:** Implementation behind `PRECAUTIONARY_STOPS_ENABLED=false`. Tests written, locale keys merged. Internal review.
2. **Week 3:** Enable on staging. Internal team uses it for trip planning. Iterate on copy and visual treatment based on internal feedback.
3. **Week 4:** Enable in production for 10% of traffic (e.g., bucket by `tripId` hash). Monitor `extra_stop_suggested` rate, `extra_stop_dismissed` rate, support ticket volume.
4. **Week 5–6:** Full rollout if dismissal rate < 50% and no support escalations. Otherwise, ship v2 toggle.
5. **Week 8:** First telemetry review. Calibrate pressure thresholds if signal-by-signal dismissal patterns warrant it.

### Success criteria

- Dismissal rate (across all suggested stops, all trips) < 50% in week 4.
- No measurable increase in support escalations week-over-week after rollout.
- At least 2 documented user reports (in feedback channel or app feedback FAB) describing a trip where the precautionary stop saved them from a real charging problem within 12 weeks of launch. (Anecdotal floor on real-world utility — the dismissal rate alone doesn't prove protection happened.)
- Telemetry signal stability: the 5 trigger reasons fire in expected proportions (sparse + holiday dominate; tight-margin + low-buffer rare; peak-window moderate). Wildly skewed distributions indicate threshold miscalibration.

### Dependencies

- ADR-0006 (Backup Pressure Score) — shipped, in production. This PRD extends it.
- ADR-0007 (Station reliability ranking) — gated on Phase 3b data accumulation (~2026-06-02). Not a blocker for this PRD; precautionary stops use the existing ranker as-is.
- `src/lib/trip/vietnam-holidays.ts` — already covers Tết, 30/4, 2/9, Giỗ Tổ. No new data source needed.

### Estimated effort

- Implementation: 2–3 sessions for an experienced contributor.
- Code review: 1 session.
- Internal testing: 1 week.
- Production rollout: 2 weeks (10% → 100%).
- Telemetry calibration: 4 weeks.

**Total time from PRD approval to full rollout: ~7 weeks.**

### Related artifacts

- ADR-0006: [docs/adr/0006-backup-station-selection.md](../adr/0006-backup-station-selection.md)
- ADR-0007: [docs/adr/0007-station-reliability-ranking.md](../adr/0007-station-reliability-ranking.md)
- CONTEXT.md domain glossary: [CONTEXT.md](../../CONTEXT.md)
- Successor ADR (to be written after implementation): ADR-0009
