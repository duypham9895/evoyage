import { test, expect } from 'playwright/test';
import { mockAPIs, waitForAppReady, switchToTab } from './helpers/app';
import routeWithAlternativesFixture from './fixtures/route-with-alternatives.json';

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
