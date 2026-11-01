# Route planner: SOC and stop correctness (P1)

Status: documented, not fixed. Code references are at `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main on 2026-11-01).

## Summary

The trip planner shows battery percentages and stop distances that do not match the charging stations it puts on screen. On long trips the real arrival SOC can fall below the user's minimum (12.6% shown as 20.2% on Mapbox HCM -> Hanoi). It also adds a ~28-minute stop when the car can already reach the destination, and it presents impossible trips as valid plans with 0% legs, repeated stations and a warning every ~10 km.

## Severity & priority

| # | Finding | Severity | Priority |
|---|---|---|---|
| 1 | Stop km and SOC are computed at a different place than the station shown | high | P1 |
| 2 | Needless stop when the destination is already reachable | high (one verifier said medium) | P1 |
| 3 | Infeasible trips shown as valid plans: 0% legs, duplicate stops, warning spam, wrong warning text | medium | P2 |

## Affected features

- Trip planning (`POST /api/route`) -> charging-stop selection and SOC math in `src/lib/routing/route-planner.ts`
- Station ranking per decision point in `src/app/api/route/route.ts`
- Trip summary warnings in `src/components/trip/TripSummary.tsx`

All three findings were re-read at `64db6f9`. The cited code is unchanged from the audit HEAD (`bfa3a3b`); line numbers are the same. No finding was dropped.

---

## Finding 1 — stop km and SOC are computed at a different station than the one shown

### Symptom

Each stop's `distanceAlongRouteKm`, `batteryPercentAtArrival`, the battery segment and the start of the next leg all use the decision point's km. The station shown is `rankedStations[0]`, which can sit up to ~49 km earlier or later on the route. Live example (Mapbox HCM -> Hanoi, battery 80 / minArrival 15 / safety 0.8): the shown stations are at route km 1333.2 and 1538.6, a 205.4 km leg. Real arrival = 80 - 205.4/304.8*100 = 12.6%, below minArrival 15%. The plan shows 20.2%.

### Evidence

Code at `64db6f9`:

- `src/lib/routing/route-planner.ts:143-158` — `findChargingDecisionPoints` picks `optimal = pickOptimalStation(...)` (the latest station within 2 km of the route, `:208-228`), sets `distanceKm: optimal.nearestRouteKm`, and restarts the range simulation from that position (`lastDecisionKm = optimal.nearestRouteKm`).
- `src/app/api/route/route.ts:478-541` — for each decision point, ranks **all** `dp.candidates` (up to 24, from a search window up to ~65 km wide) with `scoreStation`/`rankStations`: detour time, power, reliability. Position on the route is not an input.
- `src/lib/routing/route-planner.ts:291, 297, 306-309, 320, 329, 338` — `planChargingStops` uses `best = rankedStations[0]` as the station, but `dp.distanceKm` for `routeDistanceKm`, segment `endKm`, `distanceAlongRouteKm` and `lastStopKm`. Only the off-route detour (`getStationDetourKm`) is per-station.

Live data (audit, 2026-11-01): a scratch script projected each selected station onto the returned polyline.

```
hcm_dalat (OSRM):   reported km 183.1, station at route km 144.9 (diff -38.2), 0.0 km off route
hcm_hn_mb (Mapbox): diffs -0.4, -7.1, -21.6, -29.6, -9.8, +0.4, -35.9, -49.2, -25.9 km
hcm_hn (OSRM):      diffs -18.7, +5.0, +13.0, -37.4, -13.1 km
```

All stations were 0.0-0.8 km off route, so the gap is along the route, not a detour. Both signs occur: a shown station can be before or after the simulated charge point.

Deterministic repro (this branch, test 3 below): 600 km straight route, VinFast-branded car, official range 500 km, safety 0.8 (effective 400 km), 80/15. Stations at km 185, 240, 480. Decision points: km 240 (candidates S240, S185) and km 480 (S480). If ranking prefers S185, the plan shows `S185 @ 240.0 km arr 20.0%`, `S480 @ 480.0 km arr 20.0%`. The real leg S185 -> S480 is 295 km: 80 - 73.75 = **6.25%** arrival, shown as 20%.

### Root cause

Established (code read by author and both verifiers): the decision point (where the simulator charges) and the ranked selection (which station is shown) are chosen by two different rules and never reconciled. `planChargingStops` keeps `dp.distanceKm` instead of the selected station's `nearestRouteKm`. Because `findChargingDecisionPoints` already simulated every later decision point from the optimal station's position, later stops are planned from the wrong origin, so the error compounds.

### Repro

- Unit: `npx vitest run src/lib/routing/route-planner.test.ts` (tests below).
- Live (read-only, no DB write): `POST https://evoyage.duypham.me/api/route` with HCM `10.7726,106.698` -> Da Lat `11.9404,108.4583`, a VinFast VF 6 Plus, `currentBatteryPercent 80`, `minArrivalPercent 15`, `rangeSafetyFactor 0.8`, `provider osrm`. For each stop, project the selected station's lat/lng onto the decoded polyline and compare the nearest route km to `distanceAlongRouteKm`. Audit result: 183.1 reported vs 144.9 real.

### Regression tests

`src/lib/routing/route-planner.test.ts`, describe `BUG p1-route-planner-soc-and-stop-correctness`:

- `stop distanceAlongRouteKm equals the selected station's own route km` — today returns 150, expected 110.
- `arrival SOC at a stop is computed for the selected station's position` — today 42.5%, expected 52.5%.
- `real SOC between the shown stations never drops below minArrival when ranking prefers an earlier candidate` — today real arrival 6.25%, minArrival 15%.

### Fix direction

Where: `planChargingStops` in `route-planner.ts`, and how the ranking in `route.ts:478-541` feeds it. Two options:

1. Planner-side (what tests 1-2 encode): use the selected station's `StationWithRouteInfo.nearestRouteKm` for leg distance, SOC, segment end and `lastStopKm`, and re-simulate the downstream decision points from that position. Re-simulating means decision-point finding and selection can no longer be fully separate passes; the current `precomputedDecisionPoints` split (shared with `buildPrecautionaryStops`) has to change.
2. Ranking-side: restrict ranking candidates to those near `dp.distanceKm`. Cheaper, but tests 1-2 still fail because `planChargingStops` would still trust any ranking it is given. If you choose this, rewrite those two tests against `route.ts` and say why.

Gotchas: stations found via the 15 km circle fallback (`useCorridorScoring: false`) carry no `nearestRouteKm`; they need a projection or a fallback. Alternatives (`alternatives` list) are shown next to the stop, so their SOC is also implicitly wrong; decide whether to show per-alternative SOC. Test 3 checks the user-facing invariant and should pass under either option.

---

## Finding 2 — needless charging stop when the destination is already reachable

### Symptom

A ~28-minute stop is added just before the destination although the car can arrive well above minArrival. Live: Mapbox HCM -> Da Lat (VF 6 Plus, 80/15/0.8) returns stops at km 179.3 and km 308.6 of 313.6; the second has arrival 37.5% (station "BĐX TN Mimosa"). `totalChargingTimeMin` doubles to 56.

### Evidence

`src/lib/routing/route-planner.ts:114-118`:

```ts
const needsSearch = remainingRangeKm < SEARCH_TRIGGER_KM;   // 80
const notNearEnd = cumDist[i] < totalRouteKm - 5;
const notJustCharged = cumDist[i] > lastDecisionKm + 10;
```

Nothing compares `remainingRangeKm` with the distance left (`totalRouteKm - cumDist[i]`). `searchToKm` is capped at `totalRouteKm - 5` (`:121-124`), so a station a few km before the destination qualifies, and `pickOptimalStation` picks the latest one. No later code removes the stop (`route.ts:410-428` calls `findChargingDecisionPoints` directly, `buildPrecautionaryStops` only adds stops).

Deterministic repro: 200 km route, usable range 260 km (500 x 0.8 x 65%), stations at km 100 and 190. Output: one stop at km ~189, arrival 32%. Expected: no stop; arrival without charging is 30%.

The only existing no-stop test (`route-planner.test.ts`, "VF 8 Eco at 80%, short route") uses a ~140 km route where the trigger never fires, so it does not cover this case.

### Root cause

Established: the station search starts whenever remaining usable range drops below 80 km, without first checking whether the rest of the route fits in that range. `usableRangeKm` is already the range down to minArrival (`range-calculator.ts`), so `remainingRangeKm >= totalRouteKm - cumDist[i]` is exactly "destination reachable".

### Repro

- Unit: test below.
- Live (read-only): `POST /api/route`, `provider mapbox`, HCM `10.7726,106.698` -> Da Lat `11.9404,108.4583`, VF 6 Plus, 80/15/0.8. Check the last stop's km against `totalDistanceKm` and its arrival %.

### Regression test

`src/lib/routing/route-planner.test.ts` :: `adds no charging stop when the destination is reachable above minArrival` — today returns 1 stop.

### Fix direction

`findChargingDecisionPoints`: skip the search (or stop the loop) when `remainingRangeKm >= totalRouteKm - cumDist[i]`, optionally plus a small margin. Gotchas: the same check must hold after a simulated charge (`remainingRangeKm` is reset at `:157`, `:178`), and precautionary stops (`buildPrecautionaryStops`) are added deliberately on reachable trips — do not suppress those. Check the existing E2E "precautionary stops" spec after the change.

---

## Finding 3 — infeasible trips are presented as valid plans

### Symptom

When a gap is longer than the car's range, `/api/route` still returns 200 with stops whose arrival SOC is 0.0% and a final arrival of 0%. The same station can be picked 2-3 times in a row. There is no "unreachable" verdict. One `NO_COMPATIBLE_STATION` warning is emitted roughly every 10 km (62 on HCM -> Hanoi OSRM; 23 on the tiny-car Da Lat case), and `TripSummary` renders each as its own box. For non-VinFast cars every warning says "VinFast stations don't support <brand>" even when the cause is range.

### Evidence

Live (verifier run, 2026-11-01), custom car `{brand:'Generic', model:'Tiny', batteryCapacityKwh:10, officialRangeKm:60}`, HCM -> Da Lat, Mapbox, 100/15/0.8: HTTP 200, `arrivalBatteryPercent 0`, stops `PHÚC MỸ GIA - D2` at km 9.9 and again at 20.0 (arrival 0.55%), `SHD BÌNH THUẬN` three times (km 112.8 at 0%, 122.3, 133.2), segments `20.0->112.8 80->0` and `133.2->314.2 80->0`, 23 warnings ~10 km apart, all "No compatible stations found — VinFast stations don't support Generic vehicles." The chosen stations were not VinFast.

Code at `64db6f9`:

- `route-planner.ts:180-193` — an empty decision point sets `remainingRangeKm = SAFETY_BUFFER_KM` (30) (`:191`). With the 10 km `notJustCharged` guard (`:116`), every polyline point 10 km later re-enters the strategy-3 branch (`:164`) and adds another empty decision point.
- `route-planner.ts:309, 349, 400` — SOC is clamped with `Math.max(0, ...)`; nothing compares it with `minArrivalPercent`.
- `route-planner.ts:384-393` — one warning per empty decision point; the message is chosen by `isVinFast` alone.
- No check against the previous stop's station in `pickOptimalStation` or the ranked / nearest-station paths (`:297`, `:341`).
- `src/components/trip/TripSummary.tsx:855` — `warnings.map(...)` renders one box per warning.
- `docs/adr/0004-trip-planner-module.md:14` specifies `{ kind: 'unreachable', ... }`; `docs/adr/0004-status.md:16` records it as not implemented.

Deterministic repros on this branch:

- 300 km route, no stations, Generic 400 km car, 100/15/0.8 -> 5 warnings, all VinFast-blaming text.
- 120 km route, one station at km 9, Generic 60 km car, 100/15/0.8 -> stops `Only @ 10.0 km arr 75%`, `Only @ 21.0 km arr 7%`, final arrival 0%, 8 warnings.

### Root cause

Established: the planner has no feasibility check. It clamps SOC to 0 instead of flagging an infeasible leg, re-emits a warning on every rescan of a station-less stretch (the `:191` reset), never deduplicates consecutive identical stations, and picks the warning text by brand only.

Hypothesis (not verified): the duplicate-station case arises because the second decision point comes from the 15 km circle fallback, whose `findNearestStation(dp.point, ...)` returns the station just charged at. The unit repro matches this path, but the live duplicates were not traced line by line.

### Repro

- Unit: tests below.
- Live (read-only): `POST /api/route` with `customVehicle {brand:'Generic', model:'Tiny', batteryCapacityKwh:10, officialRangeKm:60}`, `currentBatteryPercent 100`, `minArrivalPercent 15`, `rangeSafetyFactor 0.8`, `provider mapbox`, HCM `10.7769,106.7009` -> Da Lat `11.9404,108.4583`. Count `warnings`, check `arrivalBatteryPercent` and consecutive stop names.

### Regression tests

`src/lib/routing/route-planner.test.ts`:

- `emits a single warning for one continuous station-less stretch` — today 5.
- `does not blame VinFast compatibility when there are no stations at all` — today it does.
- `never selects the same station for two consecutive stops` — today "Only" twice.

Not unit-tested: the missing "unreachable/infeasible" verdict. The result type has no field for it yet (`ChargingPlanResult`, `NoStationWarning.type` is `'NO_COMPATIBLE_STATION' | 'INSUFFICIENT_MARGIN_AFTER_SKIP'`), so a test would have to invent the API shape. Write that test once the shape is decided (see open questions).

### Fix direction

`route-planner.ts`: detect legs where arrival < minArrival (or <= 0) and return an explicit infeasible result, per ADR-0004. Collapse consecutive empty decision points into one warning covering a km range (changing the `:191` reset is the lever). Do not select the station used at the previous stop. Choose the warning text by cause: no stations nearby vs. only brand-incompatible stations nearby vs. out of range. `TripSummary.tsx:855` should show the infeasible state prominently instead of a stack of boxes. Gotchas: `NoStationWarning` text is bilingual (vi + en); new strings need both. `route.ts:709-711` passes `plan.warnings` through unchanged, and saved/shared trips may hold old warning shapes.

---

## Related low-severity items

None recorded for this group.

## Open questions / what to verify first

1. Finding 1: planner-side or ranking-side fix? This decides whether tests 1-2 stay as written. Planner-side is the only one that keeps the ranking's power/reliability benefits without lying about SOC.
2. Finding 3: what is the infeasible result shape — ADR-0004's `{ kind: 'unreachable' }`, or a new warning type? It touches the API contract and saved trips.
3. Before fixing, re-run one live long trip (HCM -> Hanoi) and the projection check to get a baseline; the station set changes with the daily VinFast sync.
4. The full vitest run on this branch showed 1-3 unrelated timeouts (`src/app/plan/page.effects.test.tsx`, `src/app/api/evi/parse/route.test.ts`) that pass when run alone. They came from machine load during the audit, not from this branch.

## Verification provenance

- Findings produced by an audit of eVoyage on 2026-11-01 against HEAD `bfa3a3b` and live prod `https://evoyage.duypham.me` (read-only requests only).
- Each finding was checked by 2 adversarial verifier agents (Claude, same vendor, same priors; no external verifier ran). All three: 2/2 confirmed, none refuted. Finding 2 severity split high/medium.
- Re-confirmed by code read at `64db6f92e0792aa4643b2ba76958ff0843b80567`; the regression tests above reproduce each mechanism deterministically on that commit.
