# P2 — Planner UI state and map defects (2026-11-01)

Base commit for every `file:line` below: `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main).

> **Status 2026-11-02:** All six findings are fixed on this branch; no `it.fails` remains for this bug.
> - Wave 1: **F5** (the notebook stores `vehicleName` at save time; custom trips use `trip.customVehicle`; older catalogue entries are looked up via `/api/vehicles?id=` and show "vehicle missing" only on a 404) and **F6** (`MapboxMap` takes `nearbyStations` and `userLocation`, draws them and flies to the user).
> - Wave 2: **F1 + F1b** in one commit: `depart_at` is sent as `YYYY-MM-DDThh:mm:ssZ` (milliseconds stripped, no rounding), and the traffic override is skipped for waypoint trips. **F4**: `handlePlanTrip` reads and clears the notebook attribution before any early return, and Re-plan aborts an in-flight calc and runs the saved trip. **F3**: one localStorage key, `evoyage-locale`, read after mount by both `LandingWrapper` and `LocaleProvider` and written on toggle. **F2**: `PlaceAutocomplete` measures the space above it inside the nearest clipping ancestor and opens downward when the 240 px list would not fit; covered by `e2e/autocomplete-mobile.spec.ts` at 390x844 (passed once locally on Mobile Chrome against a dev server; the pre-fix failure was not re-run locally, the RED evidence is the prod repro above).
> - Still open: nothing in F1-F6. The device check for F2 (real iPhone, keyboard open, sheet at "full" snap; open question 5) is for Duy after merge. The "Related low-severity items" below are untouched.
> - Defaults taken (reversible, owner may override): F1b skip the traffic override for waypoint trips (open question 1; waypoint trips keep the peak-window heuristic only); F3 localStorage, not a cookie (open question 2; English users see a brief vi -> en flash and SSR `<html lang>` stays `vi`); F4 Re-plan mid-calculation cancels the running plan and runs the saved trip (open question 3); F2 measure-and-flip instead of a portal, threshold 240 px (the mobile `max-h`).

## Summary

Six medium defects in /plan. Traffic-aware departure never works. On mobile, the start-point suggestion list is clipped. The language choice is lost on every navigation and reload. The trip notebook saves a trip under the wrong entry and shows wrong vehicle labels. The locate button on the default Mapbox map draws nothing. Trip planning itself still returns correct routes.

## Severity & priority

- Priority: **P2**. Every finding is **medium**. One verifier rated F4 and F5 low; see each finding.
- No data loss outside one browser's localStorage, and no security impact.
- Suggested fix order: F1 (one-line format change, revives a whole feature), F3, F6, F4, F5, F2.

## Affected features

| # | Feature | Status at 64db6f9 | Regression test |
|---|---|---|---|
| F1 | Departure intelligence (Mapbox `driving-traffic`) | Confirmed | yes (2) |
| F2 | Place autocomplete, start field, mobile | Confirmed | not unit-testable |
| F3 | Language toggle vi/en | Confirmed | yes (2) |
| F4 | Trip notebook, Re-plan | Confirmed | yes |
| F5 | Trip notebook, vehicle label | Confirmed | yes (2) |
| F6 | Map locate button, Mapbox mode | Confirmed | yes |

No finding was dropped. All six were re-read at 64db6f9 and still hold.

---

## F1 — Traffic-aware departure always fails: `depart_at` includes milliseconds

**Symptom.** If the user picks a future departure time, the plan never gets a Mapbox traffic estimate. The response has no `traffic` key and uses the free-flow or peak-window heuristic. Users see nothing wrong. Server logs show a `console.warn` with `kind: 'upstream_error', statusCode: 422`, so the failure is logged, just not surfaced.

**Evidence.**
- `src/lib/routing/mapbox-traffic.ts:86-87`: `params.set('depart_at', departAt.toISOString());`. `toISOString()` always emits `.sssZ`.
- `src/app/api/route/route.ts:609`: `departAt: new Date(departAt!)`. Even input without milliseconds gains `.000Z`.
- Mapbox, called directly (any public token, run by both verifiers):
  ```
  curl 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/106.698,10.7726;107.0843,10.346?depart_at=2026-11-02T03:00:00.000Z&access_token=[SENSITIVE]'
  -> 422 {"message":"Must be in one of the following formats: YYYY-MM-DDThh:mm, YYYY-MM-DDThh:mm:ssZ, YYYY-MM-DDThh:mm:ss±hh:mm...","code":"InvalidInput"}
  ... depart_at=2026-11-02T03:00:00Z  -> 200 {"code":"Ok",...}
  ```
- Live prod: `POST https://evoyage.duypham.me/api/route` with `provider: "mapbox"`, coords and `departAt: "2026-11-02T03:00:00Z"` returned `totalDurationMin: 124` and no `traffic` key. `route.ts:625` adds traffic metadata whenever `trafficSource === 'mapbox-traffic'`, so the override never succeeded.
- `src/lib/routing/mapbox-traffic.test.ts:65` asserts `depart_at=${encodeURIComponent(departAt.toISOString())}`. The existing test locks in the bad format.

**Second, latent defect (same call site).** `route.ts:605-610` passes only `origin` and `destination` to `fetchTrafficAwareDirections`, even when the request has waypoints (`route.ts:220-227` honours them for the base route). Once the format is fixed, a waypoint trip's duration would be replaced by the direct A→B traffic duration. The finder ran a live 628.7 km trip via Da Lat to show this.

**Root cause.**
- Established: Mapbox rejects fractional seconds in `depart_at`. Unit tests mock `fetch` and assert the wrong format, so nothing caught it.
- Established, from the code: the traffic call ignores waypoints. Not exercised live, because the format bug masks it.

**Repro.** Run the curl above with and without `.000`. Or POST /api/route with `provider: "mapbox"`, valid coords and `departAt` 1–7 days ahead, then check that `.traffic` is absent.

**Regression tests.**
- `src/lib/routing/mapbox-traffic.test.ts` › `formats depart_at in a Mapbox-accepted format (YYYY-MM-DDThh:mm:ssZ, no milliseconds)`
- `src/app/api/route/route.test.ts` › `POST /api/route traffic-aware departure` › `does not price a waypoint trip with a direct origin->destination traffic estimate`

**Fix direction.**
- `mapbox-traffic.ts`: send `YYYY-MM-DDThh:mm:ssZ`, for example `toISOString()` with the `.sss` stripped. Update the old assertion at `mapbox-traffic.test.ts:65` in the same change; it encodes the bug.
- `route.ts:603`: skip the traffic override when `hasWaypoints`, or extend `FetchTrafficOptions` with waypoints and put them in the coordinate string. Mapbox `driving-traffic` accepts at most 3 coordinates, and the schema allows 5 waypoints, so passing them only works for 1 waypoint. Skipping is the safer default.
- Fix both in one change. Fixing only the format turns on the waypoint mis-pricing.

---

## F2 — Mobile: start-point autocomplete opens upward and is clipped

**Symptom.** At phone width, typing into "Điểm đi" shows the suggestion list above the input. Only about 28–32 px of the nearest option is visible. Tapping the middle of the option hits the tab bar.

**Evidence.**
- `src/components/trip/PlaceAutocomplete.tsx:234`: the listbox has `absolute ... bottom-full mb-1 sm:bottom-auto sm:top-full`, so below 640 px it always opens upward and never checks the space above.
- Playwright against prod, 390×844, `isMobile`, `hasTouch`, default sheet height (two verifiers):
  - input 504–550, listbox 414–480, tablist 402.8–448.3, scroll container (`flex-1 min-h-0 overflow-y-auto`) top 452.
  - `document.elementFromPoint` at the option centre returns `DIV[role=tablist]`.
  - `locator.click()` on the option timed out: "tablist intercepts pointer events".
- The destination field sits lower on screen and is fine.

**Root cause.** Established. The listbox opens upward inside an `overflow-y-auto` container while the input is only about 52 px below the container's top edge. Everything above y=452 is clipped by the container. Correction from a verifier: the tablist is not sticky and not drawn over the listbox. It is a sibling above the scroll container, and a tap in the clipped area lands on it.

**Repro.**
```
# Playwright, viewport 390x844, isMobile: true, hasTouch: true
page.goto('https://evoyage.duypham.me/plan')
page.getByPlaceholder('VD: Thủ Thiêm, TP.HCM').fill('Quận 1, Hồ Chí Minh')
await page.getByRole('option').first().waitFor()
await page.getByRole('option').first().click({ timeout: 4000 })   # times out
await page.evaluate(() => { const o = document.querySelector('[role=option]').getBoundingClientRect();
  return document.elementFromPoint(o.x + o.width/2, o.y + o.height/2).getAttribute('role') })   # 'tablist'
```
Not tested: dragging the sheet taller first, which may leave room above the input.

**Regression test.** Not unit-testable. jsdom has no layout, so it cannot measure clipping or hit-testing. Asserting the class string would only test an implementation detail. Add a Playwright e2e at 390×844 that clicks the first option and asserts the start field takes its value. The repro above is the skeleton.

**Fix direction.** In `PlaceAutocomplete`, pick the direction from the space available inside the nearest scroll container: open downward when there is no room above. Or render the listbox in a portal or fixed layer above the bottom sheet. Gotcha: a portal must still follow the input when the sheet scrolls or snaps. Keep the `combobox`/`listbox` ARIA wiring (`aria-controls={listboxId}`) intact.

---

## F3 — Language choice is not persisted

**Symptom.** A user who picks EN on the landing page and clicks "Start planning" lands on /plan in Vietnamese. On /plan, EN is lost on every reload.

**Evidence.**
- `src/lib/locale.tsx:42`: `useState<Locale>('vi')`. `toggleLocale` (`:53-55`) only flips in-memory state. The only effect (`:48-51`) writes `document.documentElement.lang`.
- `src/components/landing/LandingClient.tsx:245`: `LandingWrapper` has its own separate `useState<'vi'|'en'>('vi')`, with no persistence either.
- `src/app/plan/page.tsx:1257`: /plan mounts a fresh `<LocaleProvider>`. The landing CTAs are plain `href="/plan"` (`LandingClient.tsx:80,96`; `LandingPageContent.tsx:121,280,381,408`).
- `src/app/layout.tsx:61` hard-codes `<html lang="vi">`. `curl -sI https://evoyage.duypham.me/plan` sets no locale cookie.
- No localStorage key holds the locale. The only keys are `ev-desktop-tab`, `ev-planner-rsf`, `ev-planner-custom-vehicle`, `ev-recent-trips` and `evoyage-notebook-v1`.
- Live desktop, finder: after EN on `/`, the h1 reads "Plan your EV road trip across Vietnam". After "Start planning", the /plan tabs read `["eVi","Chuyến đi","Trạm sạc","Đã lưu"]` and `html lang="vi"`.

**Root cause.** Established. There are two independent locale states, both in memory only.

**Repro.** Open `/`, click EN, then click "Start planning". Or on /plan, click EN and reload.

**Regression tests.** `src/lib/locale.test.tsx` (new):
- `LocaleProvider persistence` › `keeps English after the provider remounts (page reload)`
- `LocaleProvider persistence` › `carries English chosen on the landing page into the /plan LocaleProvider`

The tests do not assume a storage mechanism; any jsdom-visible store (localStorage or `document.cookie`) passes. Both await with `waitFor`, so a hydration-safe effect that applies the stored value after mount also passes.

**Fix direction.** Use one shared persisted locale, read by both `LocaleProvider` and `LandingWrapper`, or make the landing page use `LocaleProvider` itself. Gotchas:
- Hydration: the server renders `vi`. Reading storage in the `useState` initialiser causes a mismatch, so apply it after mount (or with `useSyncExternalStore`, the pattern page.tsx already uses for geolocation).
- A cookie would also let the server render the right `lang` and avoid the vi→en flash. That needs `layout.tsx` to read cookies, which makes the route dynamic. Decide whether that is acceptable.
- Wrap storage access in try/catch, as the notebook store does, for Incognito and blocked storage.

---

## F4 — Notebook re-plan id leaks into the next unrelated plan

**Symptom.** The user presses "Mở lại" (Re-plan) while another calculation is in flight; tab bars are not disabled during planning. The form loads the saved trip, but no plan runs. The in-flight plan then lands with the previous inputs. The next plan the user makes is attributed to the old notebook entry: `notebook.touch(oldId)` runs instead of `save()`, so the new trip is never saved, and its dismissed precautionary stops are written under the old id.

**Evidence.**
- `src/app/plan/page.tsx:677`: `planningNotebookEntryIdRef.current = trip.id`, set unconditionally.
- `handlePlanTrip` returns early at `:512` (no start/end), `:516` (no vehicle), `:520` (Mapbox without coords) and `:526` (`if (planAbortRef.current) return;`). All four come before the ref is read and cleared at `:533-534`.
- On the next successful plan, `:628-631` calls `notebook.touch(sourceNotebookEntryId)` and `setActiveNotebookEntryId(oldId)`, skipping `notebook.save(...)`. The effect at `:202-208` then writes dismissed stops under the old id.
- Nothing blocks Re-plan during a calculation. `DesktopTabBar`, `MobileTabBar` and `TripNotebook` take no `isPlanning` or `disabled` prop.
- A verifier's scratch vitest run saw: route calls after the re-plan click = 1, and after a later eVi plan Hanoi→Da Nang the notebook had no Hanoi entry and the old entry's `lastViewedAt` had been bumped.

**Root cause.** Established. The attribution ref is set by the re-plan handler but only cleared once a plan actually starts. Detail: Re-plan triggers the auto-plan through `setAutoPlanRequestId`, and the `:526` guard swallows it while a plan is in flight.

**Severity note.** One verifier rated it low. Two reasons: the in-flight path is a race (the re-plan's vehicle fetch must resolve while the earlier plan is still running), and if the user plans again without editing the form, `touch()` is effectively correct. The other verifier kept medium. The harm is one unsaved trip plus mislabelled dismissed stops, in one browser.

**Repro.** Start a slow plan. While it shows "Calculating", open the Notebook tab and press "Mở lại". After the first plan lands, plan a different route. The new trip does not appear in the notebook. It is also reachable without a race: re-plan a catalogue-vehicle trip while `/api/vehicles` fails and no vehicle is selected (the `:516` return).

**Regression test.** `src/app/plan/page.notebook-map.test.tsx` › `plan page — notebook re-plan attribution` › `saves the next unrelated plan as a new notebook entry after a re-plan was swallowed by an in-flight calc`. It drives the in-flight path: it holds the first `/api/route` fetch open, presses Mở lại, releases the fetch, plans Hanoi→Da Nang through eVi, and asserts the notebook has a Hanoi→Da Nang entry.

**Fix direction.** Pass the entry id into `handlePlanTrip` as an argument, for example through the auto-plan request, instead of a long-lived ref. Or clear the ref on every early return. Disabling Re-plan while `isPlanning` only closes the `:526` path, not `:512/:516/:520`. Also decide what Re-plan should do mid-calculation: cancel the current plan and run the saved one, or refuse. Today it silently replaces the form and runs nothing.

---

## F5 — Notebook vehicle label: catalogue trips say "Vehicle no longer in eVoyage"; custom trips show the wrong car

**Symptom.** On a fresh /plan visit, with no vehicle selected, every saved trip that used a catalogue vehicle reads "Xe không còn trong eVoyage" / "Vehicle no longer in eVoyage". Custom-vehicle trips show the current custom vehicle (restored from localStorage or the URL), not the one saved with the trip. Re-plan still loads the right car.

**Evidence.**
- `src/app/plan/page.tsx:1063-1067` (mobile) and `:1133-1137` (desktop) contain the same inline resolver. It returns the live `customVehicle` when `vehicleId` is null, a name only when `selectedVehicle?.id === vehicleId`, and `null` otherwise.
- `src/components/trip/TripNotebook.tsx:26`: the resolver signature is `(vehicleId: string | null) => string | null`, and `:87` calls it with `trip.vehicleId` only.
- `src/components/trip/TripNotebookEntry.tsx:65` renders `vehicleName ?? i18n.vehicleMissing`. Strings: `en.json:100`, `vi.json:100`.
- `SavedTrip` (`src/lib/trip/notebook-store.ts:37-59`) stores `vehicleId` and `customVehicle` but no vehicle name.
- On a fresh visit `selectedVehicle` starts null. No storage key restores a catalogue vehicle.

**Root cause.** Established. The label is resolved from live page selection state, not from the saved trip.

**Severity note.** One verifier rated it low: the label is wrong but no flow breaks.

**Repro.** Plan with a catalogue car, then reload `/plan` with no query string and open the notebook ("Đã lưu"). The entry reads "Xe không còn trong eVoyage".

**Regression tests.** `src/app/plan/page.notebook-map.test.tsx` › `plan page — notebook vehicle label`:
- `does not label a catalogue-vehicle trip as missing when no vehicle is selected on a fresh visit`
- `labels a custom-vehicle trip with the vehicle saved on the trip, not the current custom vehicle`

The first test's fetch stub answers any request with a VinFast VF 8 body, so a fix that resolves names through `/api/vehicles` also passes.

**Fix direction.**
- Custom trips: read `trip.customVehicle`. No schema change is needed, but the resolver must receive the whole `SavedTrip`, not just the id.
- Catalogue trips: store `vehicleName` at save time. Older entries need a fallback, such as a lookup via `/api/vehicles` or a neutral label.
- Show `vehicleMissing` only after a confirmed 404.
- Dedupe the two copies of the resolver while there.

---

## F6 — Locate button on the Mapbox map (prod default) never draws stations or the user

**Symptom.** Tapping the locate button shows "Found N stations within 5 km", but no markers and no user dot appear, and the map does not move to the user. The station list is still reachable from the info bar's "switch to Stations tab" button.

**Evidence.**
- `src/lib/map-mode.tsx`: `PREFERRED_MAP_MODE = 'mapbox'`, always provided. It also overwrites any saved choice (commit `171773d`).
- `src/app/plan/page.tsx:71`: `activeMapMode = hasMapboxToken ? mode : 'osm'`. Prod has the token, so the mode is always `'mapbox'`.
- `page.tsx:920-925`: `<MapboxMap tripPlan waypoints precautionaryStopInteractions />`. `nearbyStations` and `userLocationForMap` go only to `<LeafletMap>` (`:927-933`), which never renders in prod.
- `src/components/map/MapboxMap.tsx:38-42`: `MapboxMapProps` has no nearby-station or user-location prop. Grepping `MapboxMap.tsx` for nearby, userLocation, flyTo or Geolocate finds nothing.
- Prod bundle, finder and verifier: the page compiles to `"mapbox"===r?jsx(cb,{tripPlan,waypoints,precautionaryStopInteractions}):jsx(cx,{...,nearbyStations,userLocation,...})`, with the provider hard-coded to `{mode:"mapbox"}`.

**Root cause.** Established. The nearby and user-location overlays exist only in the Leaflet map. Mapbox was later forced as the only mode, and its props were never extended (a missing prop path).

**Repro.** Open https://evoyage.duypham.me/plan, allow location and tap the locate button. The info bar shows a count; the map shows no markers and no user dot.

**Regression test.** `src/app/plan/page.notebook-map.test.tsx` › `plan page — locate button on the Mapbox map` › `passes nearby stations from the locate button to the Mapbox map`. It stubs `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` and captures `MapboxMap` props. If the fix instead removes the locate button's map promise in Mapbox mode, rewrite this test to match.

**Fix direction.** Add `nearbyStations` and `userLocation` to `MapboxMapProps`, render them as markers or a layer, and `flyTo` the user. Mirror what `Map.tsx` does for Leaflet (`:265`, `:291`, `:302`). Gotcha: page.tsx clears `nearbyStations` when a trip plan loads (`:605`, `:790`), so the Mapbox overlays must follow that same state, not keep their own.

---

## Related low-severity items (not tested here)

- "← Quay lại eVi / Back to eVi" always shows in the trip summary, even for trips planned from the form (`src/app/plan/page.tsx`, `src/components/trip/TripSummary.tsx`).
- The bottom-sheet suggestion chip row overflows its scroll container by 4 px at 375 px, causing a sideways wiggle and a stray scrollbar over "Điểm đến" (`src/components/trip/SampleTripChips.tsx`).
- English strings leak into the vi UI: the "Transparency" badge, the "LINKS" footer heading, "24 min (10-80%)", inconsistent "24.774+" vs "24774+", and the /plan tab title switching to English after hydration (`LandingPageContent.tsx`, `LocaleTitleSync.tsx`, `layout.tsx`). This is related to F3.
- Re-tapping locate while a station fetch is in flight treats the abort as a failure. It shows "could not load stations" and calls `onStationsFound([])` (`src/components/map/MapLocateButton.tsx`). This is related to F6.
- The `NearbyStations` spinner turns off while the replacement fetch is still loading, so the stale list plus a possible "No stations found" message shows (`src/components/NearbyStations.tsx`).

## Open questions / what to verify first

1. F1: confirm the 422 still reproduces with one direct curl before changing code; Mapbox could relax the format. Then decide skip-versus-pass for waypoint trips, keeping the 3-coordinate limit in mind.
2. F3: localStorage or cookie? A cookie fixes the SSR `lang` and the first-paint flash, but makes `layout.tsx` dynamic. This is a product and performance call.
3. F4: what should Re-plan do while a plan is in flight: cancel and run, or block?
4. F5: what label do older notebook entries without a stored `vehicleName` get?
5. F2: check whether the clip also happens with the sheet at "full" snap, and on iOS Safari with the keyboard open (the visual viewport shrinks).

## Verification provenance

- Found by an automated audit of HEAD `bfa3a3b` and live prod https://evoyage.duypham.me on 2026-11-01.
- Each finding was adversarially checked by 2 verifier agents (Claude, same vendor, same priors). None refuted any finding. F4 and F5 had one low vote each. No external verifier ran.
- This document's author re-read every cited line at `64db6f9` (origin/main), wrote the regression tests, and confirmed that each test fails for the stated reason when run as a plain `it`.
