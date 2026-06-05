# Route Result Auto-Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `karpathy-guidelines` before touching code. Use `tdd` for implementation because this is a UI behavior change with a user-visible regression. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user starts route calculation, automatically move the route panel to the calculation/result area so the user sees progress first and the finished result remains in view.

**Architecture:** Keep the existing bottom-sheet and sidebar layouts. Add a single route-result anchor around `TripSummary`, request a scroll when route planning starts and when the new `TripPlan` lands, and let the browser scroll the nearest scrollable container. On mobile, also expand the bottom sheet and switch to the Route tab at calculation start so the progress/result area is visible immediately.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Playwright.

---

## Senior PM Readout

### User Problem

The user taps `Calculate route` and sees `Calculating route...`, but the useful route result can appear outside the visible part of the mobile bottom sheet or desktop sidebar. This creates a subtle trust problem: the calculation may have succeeded, but the UI does not guide the user to the payoff.

### Product Intent

Route planning should feel like a guided action:

1. User taps the route CTA.
2. The app immediately moves to the route progress area.
3. While the API is still running, the user sees `Calculating route...` and skeleton content.
4. When the response arrives, the completed `Trip summary` is still in view.

### Team Synthesis

**Product:** This is a core conversion moment. The user asked for auto-scroll, not new copy or new UI controls. The solution should be invisible except for the improved movement.

**Design:** Follow `DESIGN.md`: no decorative icons, no additional cards, no extra instructional text. Use existing bottom-sheet motion and existing route summary surfaces.

**Engineering:** The smallest durable fix is a result anchor plus an explicit scroll request. Avoid reordering large sections unless testing proves the current order cannot support the behavior.

**QA:** Verify the loading state and the final result are inside the viewport on mobile. Keep existing trip-planning coverage green.

## Assumptions

- The primary pain is mobile bottom-sheet behavior, because the app is mobile-first and the user phrased this as scrolling down to results.
- Desktop should receive the same scroll intent because it uses the same route calculation flow and a scrollable sidebar.
- The user wants automatic navigation to the result area, not a sticky button, toast, or new message.
- `prefers-reduced-motion` should be respected by using instant scroll when reduced motion is enabled.

## Non-Goals

- Do not change route API behavior.
- Do not change route calculation timeout behavior.
- Do not change user-facing copy or locale files.
- Do not add icons, emoji, tutorial text, or decorative elements.
- Do not redesign `MobileBottomSheet` or `TripSummary`.

## File Map

- Modify: `src/app/plan/page.tsx`
  - Add route-result scroll refs/state/effect.
  - Trigger scroll at calculation start and after `TripPlan` success.
  - Wrap both mobile and desktop `TripSummary` renders with the same result anchor.
- Modify: `e2e/trip-plan.spec.ts`
  - Add a mobile regression test proving the loading state and final result are scrolled into view.

## Task 1 - Add Failing E2E Regression

**Files:**
- Modify: `e2e/trip-plan.spec.ts`

- [ ] **Step 1: Add a mobile-only regression test**

Insert this test after `keeps planning alive when route calculation takes longer than 10 seconds` in `e2e/trip-plan.spec.ts`:

```ts
  test('auto-scrolls the mobile route sheet to progress and result', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only route sheet scroll behavior');

    let resolveRoute!: () => void;
    const routeGate = new Promise<void>((resolve) => {
      resolveRoute = resolve;
    });

    await page.route('**/api/route', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      await routeGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(routeFixture),
      });
    });

    await page.goto('/plan');
    await waitForAppReady(page);
    await switchToTab(page, 'Route');

    const startInput = page.locator('[role="combobox"]').first();
    await startInput.fill('Ho Chi Minh City');
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5_000 });
    await page.locator('[role="option"]').first().click({ force: true });

    const endInput = page.locator('[role="combobox"]').nth(1);
    await endInput.fill('Da Lat');
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5_000 });
    await page.locator('[role="option"]').first().click({ force: true });

    await switchToTab(page, 'Vehicle');
    await page.locator('button:has-text("VF 8")').first().click();
    await switchToTab(page, 'Route');

    const planButton = page.locator(
      'button:has-text("Calculate route"), button:has-text("Tính lộ trình"), button:has-text("Plan this trip"), button:has-text("Xem lịch trình")',
    );
    await expect(planButton).toBeEnabled({ timeout: 5_000 });
    await planButton.click();

    const resultAnchor = page.getByTestId('route-result-anchor');
    const progressText = resultAnchor.getByText(/Calculating route|Đang tính/i);
    await expect(progressText).toBeVisible({ timeout: 5_000 });
    await expect(progressText).toBeInViewport({ ratio: 1 });

    const routeResponse = page.waitForResponse((resp) => resp.url().includes('/api/route') && resp.status() === 200);
    resolveRoute();
    await routeResponse;

    const resultHeading = resultAnchor.getByRole('heading', { name: /Trip summary|Tổng quan chuyến đi/i });
    await expect(resultHeading).toBeVisible({ timeout: 10_000 });
    await expect(resultHeading).toBeInViewport({ ratio: 1 });
  });
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
npx playwright test e2e/trip-plan.spec.ts --project="Mobile Chrome" --grep "auto-scrolls the mobile route sheet"
```

Expected before implementation:

```text
FAIL route-result-anchor not found
```

## Task 2 - Add Route Result Scroll Anchor And Scroll Request

**Files:**
- Modify: `src/app/plan/page.tsx`

- [ ] **Step 1: Add scroll state near the existing planning refs**

In `HomeContent`, near the in-flight calculation refs, add:

```ts
  const routeResultRef = useRef<HTMLDivElement>(null);
  const [routeResultScrollTrigger, setRouteResultScrollTrigger] = useState(0);

  const requestRouteResultScroll = useCallback(() => {
    setRouteResultScrollTrigger((value) => value + 1);
  }, []);
```

- [ ] **Step 2: Add the scroll effect**

Place this after `handleFindNearbyStations` or near the other UI orchestration effects:

```ts
  useEffect(() => {
    if (routeResultScrollTrigger === 0) return;

    const target = routeResultRef.current;
    if (!target) return;

    const frame = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [routeResultScrollTrigger, activeTab, desktopSidebarTab]);
```

- [ ] **Step 3: Trigger scroll when planning starts**

Inside `handlePlanTrip`, immediately after the validation/re-entry guard and before the fetch begins, add route-context UI orchestration:

```ts
    setActiveTab('route');
    handleDesktopTabChange('planTrip');
    setBottomSheetSnap({ point: 'full', trigger: Date.now() });
    requestRouteResultScroll();
```

Keep the existing `setIsPlanning(true)`, timer setup, and stale-fetch guard. Add `handleDesktopTabChange` and `requestRouteResultScroll` to the `handlePlanTrip` dependency array.

- [ ] **Step 4: Trigger scroll when the result lands**

After `setTripPlan(data as TripPlan);`, add:

```ts
      requestRouteResultScroll();
```

Keep the existing `setActiveTab('route')` and `setBottomSheetSnap({ point: 'full', trigger: Date.now() });` after success. The duplicate route/full intent is acceptable because the result response may arrive after a slow calculation, tab switch, or user gesture.

## Task 3 - Wrap TripSummary In The Anchor

**Files:**
- Modify: `src/app/plan/page.tsx`

- [ ] **Step 1: Wrap the mobile `TripSummary` render**

Replace the mobile conditional:

```tsx
                {(tripPlan || isPlanning) && <TripSummary tripPlan={tripPlan} isLoading={isPlanning} vehicleEfficiencyWhPerKm={
                  selectedVehicle?.efficiencyWhPerKm ??
                  (selectedVehicle?.batteryCapacityKwh && selectedVehicle?.officialRangeKm
                    ? (selectedVehicle.batteryCapacityKwh * 1000) / selectedVehicle.officialRangeKm
                    : null)
                } vehicleBrand={selectedVehicle?.brand} vehicleUsableBatteryKwh={selectedVehicle?.usableBatteryKwh} vehicleOfficialRangeKm={selectedVehicle?.officialRangeKm} onSelectAlternativeStation={handleSelectAlternativeStation} onBackToChat={handleBackToChat} onSelectDepartureTime={setDepartAt} precautionaryStopInteractions={precautionaryStopInteractions} />}
```

with:

```tsx
                {(tripPlan || isPlanning) && (
                  <div ref={routeResultRef} data-testid="route-result-anchor" className="scroll-mt-3">
                    <TripSummary tripPlan={tripPlan} isLoading={isPlanning} vehicleEfficiencyWhPerKm={
                      selectedVehicle?.efficiencyWhPerKm ??
                      (selectedVehicle?.batteryCapacityKwh && selectedVehicle?.officialRangeKm
                        ? (selectedVehicle.batteryCapacityKwh * 1000) / selectedVehicle.officialRangeKm
                        : null)
                    } vehicleBrand={selectedVehicle?.brand} vehicleUsableBatteryKwh={selectedVehicle?.usableBatteryKwh} vehicleOfficialRangeKm={selectedVehicle?.officialRangeKm} onSelectAlternativeStation={handleSelectAlternativeStation} onBackToChat={handleBackToChat} onSelectDepartureTime={setDepartAt} precautionaryStopInteractions={precautionaryStopInteractions} />
                  </div>
                )}
```

- [ ] **Step 2: Wrap the desktop `TripSummary` render**

Replace the desktop render:

```tsx
                <TripSummary tripPlan={tripPlan} isLoading={isPlanning} vehicleEfficiencyWhPerKm={
                  selectedVehicle?.efficiencyWhPerKm ??
                  (selectedVehicle?.batteryCapacityKwh && selectedVehicle?.officialRangeKm
                    ? (selectedVehicle.batteryCapacityKwh * 1000) / selectedVehicle.officialRangeKm
                    : null)
                } vehicleBrand={selectedVehicle?.brand} vehicleUsableBatteryKwh={selectedVehicle?.usableBatteryKwh} vehicleOfficialRangeKm={selectedVehicle?.officialRangeKm} onSelectAlternativeStation={handleSelectAlternativeStation} onSelectDepartureTime={setDepartAt} precautionaryStopInteractions={precautionaryStopInteractions} />
```

with:

```tsx
                {(tripPlan || isPlanning) && (
                  <div ref={routeResultRef} data-testid="route-result-anchor" className="scroll-mt-3">
                    <TripSummary tripPlan={tripPlan} isLoading={isPlanning} vehicleEfficiencyWhPerKm={
                      selectedVehicle?.efficiencyWhPerKm ??
                      (selectedVehicle?.batteryCapacityKwh && selectedVehicle?.officialRangeKm
                        ? (selectedVehicle.batteryCapacityKwh * 1000) / selectedVehicle.officialRangeKm
                        : null)
                    } vehicleBrand={selectedVehicle?.brand} vehicleUsableBatteryKwh={selectedVehicle?.usableBatteryKwh} vehicleOfficialRangeKm={selectedVehicle?.officialRangeKm} onSelectAlternativeStation={handleSelectAlternativeStation} onSelectDepartureTime={setDepartAt} precautionaryStopInteractions={precautionaryStopInteractions} />
                  </div>
                )}
```

## Task 4 - Verify Behavior And Guardrails

**Files:**
- Modify only if tests expose a real issue: `e2e/trip-plan.spec.ts`

- [ ] **Step 1: Run the focused mobile regression**

Run:

```bash
npx playwright test e2e/trip-plan.spec.ts --project="Mobile Chrome" --grep "auto-scrolls the mobile route sheet"
```

Expected after implementation:

```text
1 passed
```

- [ ] **Step 2: Run route-planning E2E on mobile and desktop Chrome**

Run:

```bash
npx playwright test e2e/trip-plan.spec.ts --project="Mobile Chrome" --project="Desktop Chrome"
```

Expected:

```text
all trip-plan specs pass for Mobile Chrome and Desktop Chrome
```

- [ ] **Step 3: Run unit/integration tests**

Run:

```bash
npm test
```

Expected:

```text
all Vitest tests pass
```

- [ ] **Step 4: Run production build**

Run:

```bash
npx next build
```

Expected:

```text
build succeeds with no TypeScript errors
```

## UX Acceptance Criteria

- Starting a fresh route calculation on mobile expands the bottom sheet to full height.
- During calculation, the `Calculating route...` progress area is visible without manual scrolling.
- After the route response succeeds, the `Trip summary` heading is visible without manual scrolling.
- If the user triggers planning from Vehicle or Battery tab on mobile, the app switches to Route tab because that is where progress/result live.
- Desktop sidebar keeps the final route summary visible after a successful route response.
- Reduced-motion users get instant scroll instead of smooth scroll.

## Risks And Mitigations

- **Risk:** Smooth scrolling fires before the bottom sheet finishes expanding.
  - **Mitigation:** The target is inside the same scroll container and `scrollIntoView` is requested after render. If QA finds a timing miss, add a second `requestAnimationFrame`, not a hardcoded timeout.
- **Risk:** Auto-switching to Route tab surprises users who tap the CTA from Vehicle or Battery tab.
  - **Mitigation:** The CTA action is route calculation; the progress/result surface is Route. This is consistent with the user's ask and current success behavior, which already switches to Route after success.
- **Risk:** `scrollIntoView` scrolls the page instead of the bottom sheet/sidebar.
  - **Mitigation:** Browser behavior scrolls nearest scrollable ancestors. E2E asserts the visible user-facing result, not implementation details.

## Self-Review

- Spec coverage: The plan covers automatic scrolling during `Calculating route...` and after the final result appears.
- Placeholder scan: No `TBD` or vague implementation placeholders remain.
- Scope check: No API, copy, locale, design-system, or route algorithm changes are included.
- Test coverage: Adds a mobile E2E regression and reruns existing route-planning E2E plus Vitest/build checks.
