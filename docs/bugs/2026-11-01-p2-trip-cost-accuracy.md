# Trip cost accuracy (P2): wrong for catalog vehicles, missing for custom vehicles

Date: 2026-11-01 · Code refs at `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main) · Branch `bug/p2-trip-cost-accuracy`

## Summary

The trip cost hero ("Save X vs gasoline") and its breakdown are wrong or missing.
- **Catalog vehicles:** the electric kWh and ₫ are about 11% too low, so the savings vs gasoline look bigger than they are.
- **Custom vehicles** (battery and range typed in by hand): the cost section never appears at all.

## Severity & priority

- Severity: **medium** (both findings). Both verifiers agreed. Route planning still works. These numbers are labelled estimates, but they lean in the app's favour or are missing.
- Priority: **P2**.
- Caveat on finding 1: for VinFast vehicles (10 of 15 in the catalog), `isFreeAtVGreen` is true until the free-charging end date. The hero then uses 0 ₫ for electricity, so the hero itself is unaffected for those vehicles. The understated kWh/₫ still show in the breakdown for every vehicle. For the BYD models, the hero is affected too.

## Affected features

- The trip cost section in `src/components/trip/TripSummary.tsx` (`TripCostSection`, mounted at line 828). This covers both the hero and the "How is this calculated?" breakdown.
- `/plan` page, both the mobile and desktop TripSummary call sites in `src/app/plan/page.tsx`.

---

## Finding 1: The NEDC real-world multiplier is never applied, so EV trip cost is about 11% low for every catalog vehicle

**Symptom.** Example: VF 8 Eco over 300 km.
- Shown: 55.86 kWh, 167,468 ₫ at home.
- Intended: 62.68 kWh, 187,900 ₫.
- Gasoline comparison: 579,600 ₫.

**Evidence.**
- `src/lib/trip-cost.ts:65-81`, `deriveKwhPer100km`:
  - When `efficiencyWhPerKm > 0`, it returns `efficiencyWhPerKm / 10` with no multiplier.
  - `NEDC_REAL_WORLD_MULTIPLIER = 1.2` (line 19) applies only on the `usableBatteryKwh / officialRangeKm` branch (lines 69-79).
- `scripts/seed-vietnam-models.ts:229-237` sets `efficiencyWhPerKm = batteryCapacityKwh * 1000 / officialRangeKm` for every model. That is gross battery over the NEDC range, which is exactly the number the multiplier exists to correct.
- `src/app/plan/page.tsx:1003-1007` (mobile) and `1207-1211` (desktop) pass `selectedVehicle.efficiencyWhPerKm`. When it is missing, they fall back to the same `batteryCapacityKwh*1000/officialRangeKm`.
- `src/components/trip/TripSummary.tsx:828` mounts the section only when that prop is `> 0`, and lines 309-318 forward it to `computeTripCost`. So the multiplier branch cannot be reached from the UI.
- Prod `GET https://evoyage.duypham.me/api/vehicles` (read-only) returns 15 vehicles, all with `rangeStandard = NEDC`, and every `efficiencyWhPerKm` equals battery*1000/range:
  - VF 8 Eco: 186.1995 = 87.7·1000/471
  - BYD Atto 3 Dynamic: 144.638 = 49.9·1000/345
  - VF 3: 88.76 = 18.64·1000/210
- Scratch computation for VF 8 Eco over 300 km:

  | `efficiencyWhPerKm` | kWh | Home | V-GREEN | Gasoline |
  |---|---|---|---|---|
  | 186.1995 | 55.86 | 167,468 ₫ | 215,507 ₫ | 579,600 ₫ |
  | `null` | 62.68 | 187,900 ₫ | 241,801 ₫ | 579,600 ₫ |

**Root cause.**
- *Established:* two data paths disagree.
  - The seed script and the page fallback synthesise `efficiencyWhPerKm` from the NEDC spec.
  - `computeTripCost` treats any `efficiencyWhPerKm` as a measured real-world figure and skips the NEDC correction.
  - The existing test `prefers efficiencyWhPerKm when the vehicle exposes it (no NEDC multiplier)` (`src/lib/trip-cost.test.ts:99`) encodes the "it is measured" assumption. That assumption is false for the seeded catalog.
- *Established nuance:* the synthesised value uses **gross** battery (87.7). The multiplier branch uses **usable** battery (82) × 1.2. So the gap is (82×1.2)/87.7 ≈ 1.12, about 11%, not 20%.
- *Hypothesis (not checked):* no vehicle in the DB has a genuinely measured efficiency. All 15 prod values match the formula exactly, which supports this.

**Repro.**
```bash
curl -s https://evoyage.duypham.me/api/vehicles > /tmp/veh.json   # read-only
# compare each efficiencyWhPerKm with batteryCapacityKwh*1000/officialRangeKm: they are equal
npx vitest run src/lib/trip-cost.test.ts   # the it.fails below is the in-repo repro
```

**Regression test.** `src/lib/trip-cost.test.ts`, test `computeTripCost — seeded catalog vehicles (NEDC-derived efficiency) > applies the NEDC real-world correction when efficiencyWhPerKm was synthesised from the NEDC spec` (it.fails).
- It feeds the exact seeded VF 8 Eco record and expects ≈62.68 kWh for 300 km.
- Today it gets 55.86.
- **Caveat for the fixer:** this test encodes the *outcome*, not the mechanism.
  - If you fix it by stopping the synthesis (option A below), the input of this test no longer matches prod. Rewrite the test around the new input shape, for example `efficiencyWhPerKm: null`. Do not flip it blindly.
  - Either way, the existing test at line 99 must be reconciled with it.

**Fix direction.** Pick one and decide it in `src/lib/trip-cost.ts` plus the seed, not in the UI.
- **A. Stop synthesising efficiency.** Remove the derivation in `scripts/seed-vietnam-models.ts` and the battery/range fallback in `page.tsx` (both call sites). Null the existing DB values with a migration or re-seed, never through the Supabase UI (see `docs/RECOVERY.md`). Trip cost then uses usable battery × 1.2.
  - Gotcha: `TripSummary.tsx:828` hides the whole cost section when `vehicleEfficiencyWhPerKm` is null. That gate has to be loosened too, for example render when usable battery and range are known, or the cost hero disappears for every vehicle.
- **B. Make trip-cost aware of the range standard.** Pass `rangeStandard` (it exists in `prisma/schema.prisma:35` and `src/types/index.ts:26`) into `TripCostVehicle`, and apply the multiplier when it is `NEDC`. That needs a decision on gross vs usable battery.
- Be aware of finding 2: it changes the same props, so fix both together.

---

## Finding 2: The trip cost section never renders for custom vehicles

**Symptom.** A user who plans with a custom vehicle (brand, model, battery and range entered by hand, or `cv=` in the URL) gets no trip cost hero and no breakdown, even though battery and range are known.

**Evidence.**
- `src/app/plan/page.tsx:1003-1008` and `1207-1212`: `vehicleEfficiencyWhPerKm`, `vehicleBrand`, `vehicleUsableBatteryKwh` and `vehicleOfficialRangeKm` are all read from `selectedVehicle` only.
- Every path that activates a custom vehicle also clears the selected one:
  - URL restore at `page.tsx:247-250` (`setCustomVehicle(...); setSelectedVehicle(null)`)
  - The save handler at `page.tsx:328-332`
  - The route request at line 572 sends `customVehicle: selectedVehicle ? null : customVehicle`, so routing itself works.
- Because of that, the prop is `null`, and `TripSummary.tsx:828` never mounts `TripCostSection`.
- `activeVehicle = selectedVehicle ?? customVehicle` exists at `page.tsx:795` but is not used for these props.
- `CustomVehicleInput` (`src/types/index.ts:49-56`) has `batteryCapacityKwh` and `officialRangeKm`.
- No ADR in `docs/adr/` excludes custom vehicles from cost.

**Root cause.** *Established* by reading the code and by the regression test: the TripSummary props read `selectedVehicle` instead of the active vehicle. It is *presumed* to be an oversight; no doc says custom vehicles are excluded on purpose.

**Repro.** Open `/plan?start=A&end=B&cv=<url-encoded {"brand":"VinFast","model":"VF 8","batteryCapacityKwh":87.7,"officialRangeKm":471}>` and plan the route. There is no `data-testid="trip-cost-section"` in the trip summary. This was not run in a browser; it is confirmed by the unit test below.

**Regression test.** `src/app/plan/page.trip-cost.test.tsx`
- `plan page — trip cost props with a custom vehicle > passes a positive vehicleEfficiencyWhPerKm so the trip cost section can render` (it.fails). It stubs TripSummary to capture props and plans a route with `cv=`. Today the prop is `null`.
- A control test in the same file, `renders TripSummary with the trip plan for a custom-vehicle route` (a normal `it`), proves the harness reaches a rendered TripSummary. This means the it.fails fails on the real assertion, not on setup.

**Fix direction.**
- In `src/app/plan/page.tsx`, derive the `vehicle*` props from the active vehicle (selected or custom) at **both** call sites.
- Gotchas:
  - Custom vehicles have no `usableBatteryKwh` and no `efficiencyWhPerKm`, so decide what to pass. Gross battery used as usable battery overstates kWh slightly.
  - `vehicleBrand` drives the VinFast "free at V-GREEN" flag. A custom "VinFast" entry will claim free charging. Decide whether that is wanted.
  - Coordinate with finding 1, because it changes the same expression.

---

## Related low-severity items (same area, not in scope here)

- **EVN tariff change detection is blind** (`scripts/crawl-energy-prices.ts`, `src/lib/energy-prices/parse-evn.ts`):
  - The decisions page no longer carries decision text, and the tariff source is a fixed article for Decision 1279 (9 May 2025).
  - So `evnResidential.effectiveAt` stays `2025-05-09` and the tiers stay the same even after a new tariff. This happens silently.
- **The hardcoded VinFast free-charging end date `2029-12-31` disagrees with the published policy** (10/02/2029, 10 sessions per month, for buyers from 10/02/2026):
  - Files: `scripts/crawl-energy-prices.ts`, `src/lib/trip-cost.ts`, locales.
  - From 2029-02-11 to 2029-12-31, the app will still say "Free at V-GREEN". It never mentions the session cap or who is eligible.

## Open questions / what to verify first

1. Does any vehicle in the DB carry a genuinely measured `efficiencyWhPerKm`, for example one a user added? If so, option B (rangeStandard-aware) is safer than A.
2. Is 1.2 × usable battery the intended model, or should it use gross battery? The two give a different "correct" number. The test assumes usable × 1.2, per the code comment at `trip-cost.ts:13-19`.
3. For custom vehicles: should the brand-based free-charging flag apply?
4. Run the custom-vehicle repro in a real browser once, to confirm the UI matches the unit test.

## Verification provenance

- Both findings were checked by 2 adversarial verifier agents each on 2026-11-01. They used HEAD `bfa3a3b` and live prod `https://evoyage.duypham.me` (read-only GETs). Both voted "not refuted, medium" on each finding.
- Both findings were re-confirmed by reading the code at `64db6f92e0792aa4643b2ba76958ff0843b80567` (the line numbers above). Neither was dropped.
- The regression tests were run with `npx vitest run src/lib/trip-cost.test.ts src/app/plan/page.trip-cost.test.tsx`. Both it.fails pass, and with each one temporarily flipped to `it`, the failures were the intended assertions:
  - `expected 55.8598… to be close to 62.6751…`
  - `actual value must be number or bigint, received "object"` (null)
- The verifiers are Claude agents: same vendor, same priors. No external verifier ran.
