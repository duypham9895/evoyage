import { test, expect } from 'playwright/test';
import { mockAPIs, waitForAppReady, switchToTab } from './helpers/app';
import routeFixture from './fixtures/route.json';
import routeWithAlternativesFixture from './fixtures/route-with-alternatives.json';
import vehiclesFixture from './fixtures/vehicles.json';

test.describe('F1: Trip Planning — Happy Path', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
  });

  test('completes a full trip plan with charging stops', async ({ page, isMobile }) => {
    // Navigate directly to /plan
    await page.goto('/plan');
    await waitForAppReady(page);

    // Switch to the route/plan tab (eVi is active by default)
    // Desktop: "Plan Trip" tab | Mobile: "Route" tab
    await switchToTab(page, isMobile ? 'Route' : 'Plan Trip');

    // Enter start location using the real placeholder text
    const startInput = page.locator('[role="combobox"]').first();
    await startInput.fill('Ho Chi Minh City');
    const startSuggestion = page.locator('[role="option"]').first();
    await expect(startSuggestion).toBeVisible({ timeout: 5_000 });
    await startSuggestion.click({ force: true });

    // Enter end location
    const endInput = page.locator('[role="combobox"]').nth(1);
    await endInput.fill('Da Lat');
    const endSuggestion = page.locator('[role="option"]').first();
    await expect(endSuggestion).toBeVisible({ timeout: 5_000 });
    await endSuggestion.click({ force: true });

    // On mobile, vehicle selection is on a separate tab
    if (isMobile) {
      await switchToTab(page, 'Vehicle');
    }

    // Select a vehicle (click VF 8 Plus from the list)
    const vf8Button = page.locator('button:has-text("VF 8")').first();
    await vf8Button.click();

    // On mobile, go back to Route tab for the Plan button
    if (isMobile) {
      await switchToTab(page, 'Route');
    }

    // Click the calculate-route action button (handles both legacy and renamed copy)
    const planButton = page.locator(
      'button:has-text("Calculate route"), button:has-text("Tính lộ trình"), button:has-text("Plan this trip"), button:has-text("Xem lịch trình")',
    );
    await planButton.click();

    // Verify route API was called
    await page.waitForResponse((resp) => resp.url().includes('/api/route') && resp.status() === 200);

    // Verify charging stop info appears (station name from fixture)
    const chargingInfo = page.locator('text=/Bảo Lộc|charging|32|150/').first();
    await expect(chargingInfo).toBeVisible({ timeout: 10_000 });

    // Verify map is still rendered
    const mapContainer = page.locator('.leaflet-container');
    await expect(mapContainer).toBeVisible();
  });

  test('keeps planning alive when route calculation takes longer than 10 seconds', async ({ page, isMobile }) => {
    await page.route('**/api/route', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 11_000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(routeFixture),
      });
    });

    await page.goto('/plan');
    await waitForAppReady(page);
    await switchToTab(page, isMobile ? 'Route' : 'Plan Trip');

    const startInput = page.locator('[role="combobox"]').first();
    await startInput.fill('Ho Chi Minh City');
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5_000 });
    await page.locator('[role="option"]').first().click({ force: true });

    const endInput = page.locator('[role="combobox"]').nth(1);
    await endInput.fill('Da Lat');
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5_000 });
    await page.locator('[role="option"]').first().click({ force: true });

    if (isMobile) {
      await switchToTab(page, 'Vehicle');
    }

    await page.locator('button:has-text("VF 8")').first().click();

    if (isMobile) {
      await switchToTab(page, 'Route');
    }

    const planButton = page.locator(
      'button:has-text("Calculate route"), button:has-text("Tính lộ trình"), button:has-text("Plan this trip"), button:has-text("Xem lịch trình")',
    );
    await expect(planButton).toBeEnabled({ timeout: 5_000 });
    await planButton.click();

    await expect(page.getByText(/Still calculating|Vẫn đang tính/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=/Bảo Lộc|charging|32|150/').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Calculation took longer|Tính lộ trình lâu hơn/)).toHaveCount(0);
  });

  test('does not submit Mapbox route requests for typed locations without coordinates', async ({ page, isMobile }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('evoyage-map-mode', 'mapbox');
    });

    await page.goto('/plan');
    await page.waitForLoadState('domcontentloaded');
    await switchToTab(page, isMobile ? 'Route' : 'Plan Trip');

    const startInput = page.locator('[role="combobox"]').first();
    await startInput.fill('Ho Chi Minh City');

    const endInput = page.locator('[role="combobox"]').nth(1);
    await endInput.fill('Da Lat');

    if (isMobile) {
      await switchToTab(page, 'Vehicle');
    }

    await page.locator('button:has-text("VF 8")').first().click();

    if (isMobile) {
      await switchToTab(page, 'Route');
    }

    const planButton = page.locator(
      'button:has-text("Calculate route"), button:has-text("Tính lộ trình"), button:has-text("Plan this trip"), button:has-text("Xem lịch trình")',
    );
    await expect(planButton).toBeDisabled();
    await expect(page.getByText(/Select both locations|Chọn cả hai địa điểm/)).toBeVisible();
  });

  test('replans saved vehicle trip after vehicle data is resolved', async ({ page }) => {
    await page.route('**/api/vehicles**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(vehiclesFixture.vehicles[0]),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('evoyage-notebook-v1', JSON.stringify([{
        id: 'saved-trip-1',
        savedAt: '2026-06-05T00:00:00.000Z',
        lastViewedAt: '2026-06-05T00:00:00.000Z',
        pinned: false,
        start: 'Ho Chi Minh City',
        end: 'Da Lat',
        startCoords: { lat: 10.7769, lng: 106.7009 },
        endCoords: { lat: 11.9404, lng: 108.4583 },
        waypoints: [],
        isLoopTrip: false,
        vehicleId: 'vf8-plus',
        customVehicle: null,
        currentBattery: 80,
        minArrival: 15,
        rangeSafetyFactor: 0.8,
        departAt: null,
        dismissedPrecautionaryStops: [],
      }]));
    });

    await page.goto('/plan');
    await waitForAppReady(page);
    await switchToTab(page, 'Saved');

    const routeResponse = page.waitForResponse((resp) => resp.url().includes('/api/route') && resp.status() === 200);
    const savedTrip = page.locator('article').filter({ hasText: /Ho Chi Minh City|Da Lat|Đà Lạt/ });
    await savedTrip.getByRole('button', { name: /Open|Mở lại|Replan|Lập lại|Tính lại|Đi lại/i }).click();

    await expect(page.getByText(/Please select a vehicle|Vui lòng chọn xe/)).toHaveCount(0);
    await routeResponse;
  });

  test('shows alternatives list when a Stop has alternatives (ADR-0006)', async ({ page, isMobile }) => {
    // Override the /api/route mock with a fixture that has ChargingStopWithAlternatives.
    // page.route() applies last-defined handler first, so this overrides mockAPIs above.
    await page.route('**/api/route', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(routeWithAlternativesFixture),
        });
      }
      return route.continue();
    });

    await page.goto('/plan');
    await waitForAppReady(page);
    await switchToTab(page, isMobile ? 'Route' : 'Plan Trip');

    // Fill route form (same flow as the happy-path test)
    const startInput = page.locator('[role="combobox"]').first();
    await startInput.fill('Ho Chi Minh City');
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5_000 });
    await page.locator('[role="option"]').first().click({ force: true });

    const endInput = page.locator('[role="combobox"]').nth(1);
    await endInput.fill('Da Lat');
    await expect(page.locator('[role="option"]').first()).toBeVisible({ timeout: 5_000 });
    await page.locator('[role="option"]').first().click({ force: true });

    if (isMobile) await switchToTab(page, 'Vehicle');
    await page.locator('button:has-text("VF 8")').first().click();
    if (isMobile) await switchToTab(page, 'Route');

    await page
      .locator('button:has-text("Calculate route"), button:has-text("Tính lộ trình"), button:has-text("Plan this trip"), button:has-text("Xem lịch trình")')
      .click();

    await page.waitForResponse((resp) => resp.url().includes('/api/route') && resp.status() === 200);

    // Expand the stop card so the alternatives section is rendered
    const stopHeader = page.locator('text=/Bảo Lộc/').first();
    await expect(stopHeader).toBeVisible({ timeout: 10_000 });
    await stopHeader.click();

    // Assert the alternatives list is visible (locale-key text in either lang)
    const altsHeader = page.locator('text=/trạm dự phòng|backup stations/').first();
    await expect(altsHeader).toBeVisible({ timeout: 5_000 });

    // Assert the alternative station name is rendered
    const altStationName = page.locator(`text=/Đa R'Sác/`).first();
    await expect(altStationName).toBeVisible();
  });

  test('landing page renders and links to /plan', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    // Landing page has multiple /plan links (desktop nav, mobile nav, hero CTA)
    // Use a visible one to avoid matching hidden responsive variants
    const planLink = page.locator('a[href="/plan"]:visible').first();
    await expect(planLink).toBeVisible();
  });
});
