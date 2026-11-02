# Bug group p2-evi-conversation-ux — eVi conversation and handoff UX

All file:line references are at `64db6f92e0792aa4643b2ba76958ff0843b80567` (origin/main).

> **Status 2026-11-02:** On branch `bug/p2-evi-conversation-ux`, all three findings are fixed.
> - Finding 1: `route.ts` now has a final `endMissing` branch (no `endLocation`, or `endLat` null after geocoding, including when `searchPlaces` throws). It returns `followUpType: 'free_text'` with a destination question. An ungeocodable place is named back to the user (`eVi chưa tìm thấy "X" trên bản đồ. Bạn muốn đi đâu?`), and `tripParams.end` keeps the raw text. Both F1 tests are flipped to `it`. Four guard tests were added: the ungeocodable message, a geocoder outage, vehicle-before-destination, and start-before-destination.
> - Finding 2: `handleTripParsed` and `handleFindNearbyStations` now call `setIsEViOpen(false)`.
> - Finding 3: fixed with option 1. Desktop `EVi` stays mounted and is hidden with `hidden`/`flex` on other tabs, and the desktop `TripSummary` now gets `onBackToChat`.
> - All six regression tests are `it` and pass.
> - Still unverified: none of these fixes has been checked in a real browser at phone or desktop width (open question 4). The live-LLM frequency question (open question 1) is unmeasured, but it no longer blocks the fix.
> - Behaviour change: if Nominatim is down or throttled, eVi now asks for the destination again instead of returning a "complete" trip with no coordinates.
> - Defaults taken (reversible, owner may override): when several things are missing, eVi asks in the order vehicle, then start, then destination (this answers open question 2). The destination follow-up is `free_text`, not `location_input`, because the `location_input` widget is labelled "starting point" and switching would need new locale keys plus a contract field. The question text is hard-coded Vietnamese, like the rest of the route.

## Summary

eVi, the trip assistant, breaks the conversation in three places. It says "Đã hiểu! Lên kế hoạch..." for a trip that has no destination. On mobile, "Edit" and "Find stations nearby" do their work behind the full-screen eVi sheet, which stays open, so nothing seems to happen. On desktop, eVi's own "Plan trip" and "Edit" buttons (or any tab switch) wipe the chat history.

## Severity & priority

- Priority: P2. Severity: medium for all three findings.
- None of them loses data or blocks planning. Each one leaves the user stuck or confused until they work around it by hand (typing the destination, tapping Close, re-asking eVi).

## Affected features

- `/api/evi/parse` follow-up state machine (`src/app/api/evi/parse/route.ts`)
- eVi → trip form / stations handoff on mobile (`src/app/plan/page.tsx`, `src/components/trip/EViMobileSheet.tsx`, `src/components/EVi.tsx`)
- eVi chat on the desktop sidebar (`src/app/plan/page.tsx`, `src/hooks/useEVi.ts`)

All three findings were re-checked against the code at `64db6f9` and still hold. None was dropped.

---

## Finding 1 — eVi reports a trip as complete when the destination is missing or cannot be geocoded

**Symptom.** A user with GPS on says "Tôi lái VF 8 Plus" (no destination). eVi answers "Đã hiểu! Lên kế hoạch chuyến đi với VinFast VF 8 Plus..." and shows the complete trip card with `end = null`, instead of asking where they want to go. Pressing Plan fills the form with no destination and still triggers auto-planning.

**Evidence.**
- `src/app/api/evi/parse/route.ts:180-192`: `followUpType` is set only for `vehicle_pick` (vehicle missing) or `location_input` (start missing and no `userLocation`). Nothing reads `'end_location'` in `missingFields`, `extraction.endLocation`, or `endLat`.
- `route.ts:194`: `const isComplete = followUpType === null;`, so a trip with no destination is "complete".
- `route.ts:121-128`: when `searchPlaces` returns `[]` (or throws, caught to `[]` at `:109`), `endLat`/`endLng` stay `null` while `endDisplay` keeps the raw text. That response is also complete.
- `src/lib/evi/prompt.ts:70` and `src/lib/evi/types.ts:24` declare `end_location` as a valid missing field, so the LLM is allowed to return this shape.
- Client: `src/hooks/useEVi.ts:62` maps `isComplete` to the `'complete'` state. `EVi.tsx:246-255` (`handlePlan`) passes `tripParams` to `onPlanTrip`. `page.tsx:378` (`fillFormFromEVi`) skips a null `end`, and `page.tsx:406` still bumps `autoPlanRequestId`.
- Observed (audit, mocked LLM): `MISSING_END {"isComplete":true,"followUpType":null,"end":null,"endLat":null,"displayMessage":"Đã hiểu! Lên kế hoạch chuyến đi với VinFast VF 8 Plus..."}`.

**Root cause.**
- Established: the follow-up decision in `route.ts:180-192` has no branch for a missing or ungeocodable destination.
- Not established: how often the live LLM actually returns `isTripRequest=true` with `endLocation=null` for messages like this. No live LLM call was made.

**Repro.**
```bash
npx vitest run src/app/api/evi/parse/route.test.ts -t "destination"
```
Or by hand: mock `parseTrip` to return `{ isTripRequest: true, endLocation: null, vehicleBrand: 'VinFast', vehicleModel: 'VF 8', missingFields: ['end_location'] }`, then POST `{ message: 'Tôi lái VF 8 Plus', history: [], userLocation: { lat: 21, lng: 105.8 } }`. The response has `isComplete: true`.

**Regression tests** (`src/app/api/evi/parse/route.test.ts`, both `it.fails`):
- `POST /api/evi/parse > asks for the destination instead of completing when endLocation is missing`
- `POST /api/evi/parse > asks again instead of completing when the destination cannot be geocoded`

Both assert `isComplete === false` and `followUpType` in `['location_input', 'free_text']`. With `it`, both fail today on `expected true to be false`.

**Fix direction.** In the follow-up block of `route.ts` (`:180-192`), add a branch for a missing destination (`!extraction.endLocation`) and for an ungeocodable one (`endLat == null`). It should set a follow-up type (`location_input` or `free_text`) and a destination question. Points to watch:
- Decide the order against `vehicle_pick`: ask for the vehicle first, or the destination first?
- The ungeocodable message should name what the user typed ("eVi could not find X").
- `buildCurrentLocationExtraction` (`:294-315`) carries `accumulatedParams.end` forward. Make sure it is not dropped there.
- Questions are hard-coded Vietnamese, like the rest of this route.

---

## Finding 2 — Mobile "Edit" and "Find stations nearby" work behind the still-open eVi sheet

**Symptom.** On mobile, tapping eVi's "Edit" (or the "Find stations nearby" chip) fills the form or switches the bottom-sheet tab, but the user still sees the eVi chat. It looks like nothing happened until they tap Close.

**Evidence.**
- `src/app/plan/page.tsx:392-397` `handleTripParsed` ("Edit") calls `fillFormFromEVi`, `setActiveTab('route')`, `handleDesktopTabChange('planTrip')` and `setBottomSheetSnap`, but never `setIsEViOpen(false)`.
- `page.tsx:416-420` `handleFindNearbyStations` does not close the sheet either.
- `page.tsx:400-407` `handleEViPlanTrip` ("Plan trip") does call `setIsEViOpen(false)` at `:402`. This is the only handoff that closes the sheet.
- `src/components/trip/EViMobileSheet.tsx:42` renders `fixed inset-0 z-[800]` with an opaque background while `isOpen`, so it covers `MobileBottomSheet`.
- `EVi.tsx:257-262` (`handleEdit`) calls only `onTripParsed`. The `find_stations` chip (added at `EVi.tsx:101`, for every user) calls only `onFindNearbyStations`. `EViMobileSheet` passes both straight through.
- The comment above `handleTripParsed` says "fill form and expand sheet so user can see & modify inputs", so hiding the result is not intended.

**Root cause.** Established: `handleTripParsed` and `handleFindNearbyStations` are shared by the desktop sidebar and the mobile overlay. Only the Plan path closes the mobile overlay.

**Repro.** Mobile viewport → open the eVi FAB → finish a trip in chat → tap "Edit" (or tap the "Find stations nearby" chip). The eVi overlay stays, and the filled form or Stations tab is hidden behind it.
```bash
npx vitest run src/app/plan/page.evi-handoff.test.tsx -t "mobile"
```

**Regression tests** (`src/app/plan/page.evi-handoff.test.tsx`):
- `plan page — mobile eVi sheet handoff > closes the eVi sheet when the user taps Edit (onTripParsed)` (`it.fails`)
- `plan page — mobile eVi sheet handoff > closes the eVi sheet when the user taps Find stations nearby` (`it.fails`)
- `plan page — mobile eVi sheet handoff > control: Plan trip (onPlanTrip) already closes the eVi sheet` (plain `it`, passes today; keeps the existing behaviour pinned)

With `it`, the two `it.fails` tests fail today on `data-open="true"` where `"false"` was expected.

**Fix direction.** Call `setIsEViOpen(false)` in `handleTripParsed` and `handleFindNearbyStations`, as `handleEViPlanTrip` already does. On desktop `isEViOpen` only feeds the mobile FAB and sheet, so closing it there should have no visible effect. Check that against `page.tsx:932` (`onSwitchToEVi` sets it to true) before relying on it.

---

## Finding 3 — Desktop eVi conversation is destroyed whenever the sidebar leaves the eVi tab

**Symptom.** On desktop, clicking eVi's "Plan trip" or "Edit" (both switch the sidebar to Plan Trip), or clicking any other tab, unmounts the chat. Returning to the eVi tab shows a fresh greeting, so follow-up questions about the planned trip have lost all context.

**Evidence.**
- `src/app/plan/page.tsx:1129-1220`: the desktop sidebar is a ternary chain (notebook → stations → planTrip → else). `<EVi>` is rendered only in the final else branch (`:1216-1219`), so any other tab unmounts it.
- `handleTripParsed` (`:395`) and `handleEViPlanTrip` (`:404`) both call `handleDesktopTabChange('planTrip')`, so eVi's own buttons unmount the chat.
- `src/hooks/useEVi.ts:77-79`: `messages` and `lastResponse` are plain `useState` inside the hook, and the hook is called only inside `EVi` (`EVi.tsx:167`). The conversation is never persisted.
- Mobile is not affected: `EViMobileSheet.tsx:42` toggles `flex`/`hidden` and keeps `EVi` mounted.
- Related: `handleBackToChat` (`page.tsx:410`) is passed only to the mobile `TripSummary` (`:1008`). The desktop `TripSummary` gets no `onBackToChat`.

**Root cause.** Established: the chat component is rendered conditionally, and it owns its own state.

**Repro.** Desktop width → eVi tab → chat until the trip card appears → click "Plan trip" → click the eVi tab again → the chat history is gone.
```bash
npx vitest run src/app/plan/page.evi-handoff.test.tsx -t "desktop"
```

**Regression tests** (`src/app/plan/page.evi-handoff.test.tsx`, both `it.fails`):
- `plan page — desktop eVi conversation survives tab switches > keeps the eVi conversation after Plan trip and returning to the eVi tab`
- `plan page — desktop eVi conversation survives tab switches > keeps the eVi conversation after Edit and returning to the eVi tab`

The `EVi` stub holds a piece of local `useState` (an input value), standing in for the conversation that the real `EVi` keeps in `useEVi`. With `it`, both tests fail today: the value is empty after returning to the eVi tab.

Caveat for the fixer: the tests encode the "keep EVi mounted" fix. If you instead lift `useEVi` state into the page and keep the conditional render, the stub's local state will still reset. Then rewrite the stub to read its state from props, rather than deleting the tests.

**Fix direction.** Two options:
1. Keep `EVi` mounted on desktop and hide it with CSS when another tab is active, as mobile does. Smallest change. Watch the `role="tabpanel"` and `aria-labelledby` wiring, and the 150 ms fade-in on tab switch.
2. Lift the `useEVi` state to the page (or a context). More invasive, and mobile and desktop would then share one conversation.

Whichever is chosen, pass `onBackToChat` to the desktop `TripSummary` too, so there is a path back.

---

## Related low-severity items (not in scope, no test added)

- **eVi Retry duplicates the user message and sends the error reply as history; error texts ignore the selected language.** `EVi.tsx:264-270` `handleRetry` re-sends the last user message through `sendMessage`, which appends a new user bubble after the assistant error bubble. The LLM then receives `[..., user X, assistant error, user X]`. Error texts in `useEVi.ts` (for example `:316`) are hard-coded Vietnamese. Not re-verified in depth for this note.

## Open questions / what to verify first

1. Finding 1: how often does the live LLM (gpt-5 / MiniMax fallback) return `isTripRequest: true` with `endLocation: null`? This decides how urgent the fix is. Do not call the prod endpoint to find out. Use a local dev server with your own key.
2. Finding 1: which follow-up should come first when both vehicle and destination are missing? This is a product decision.
3. Finding 3: keep mounted vs lift state. This decides whether the desktop tests can be flipped as-is.
4. None of the UI findings was driven in a real browser during the audit. Before shipping a fix, confirm on a phone-width and a desktop-width viewport.

## Verification provenance

- 2 adversarial verifier agents per finding, on 2026-11-01, against HEAD `bfa3a3b` and live prod. All 6 votes: not refuted, severity medium.
- This note re-confirmed every finding by reading the code at `64db6f9`, and encoded each one as an `it.fails` test whose real assertion fails today (checked by temporarily flipping each one to `it`).
- Same vendor, same priors. No external verifier ran.
