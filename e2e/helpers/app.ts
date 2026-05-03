import { type Page, expect } from 'playwright/test';
import geocodingFixture from '../fixtures/geocoding.json';
import routeFixture from '../fixtures/route.json';
import vehiclesFixture from '../fixtures/vehicles.json';
import stationsNearbyFixture from '../fixtures/stations-nearby.json';
import eviParseFixture from '../fixtures/evi-parse.json';
import shortUrlFixture from '../fixtures/short-url.json';

/**
 * Mock all API routes with fixture data.
 * Uses page.route() to intercept fetch requests at the browser level.
 */
export async function mockAPIs(page: Page): Promise<void> {
  // Nominatim geocoding (external API called from client)
  // Return query-aware results: Da Lat searches get Da Lat, everything else gets HCM
  await page.route('**/nominatim.openstreetmap.org/**', (route) => {
    const url = route.request().url();
    const isDaLat = /da.?lat|đà.?lạt/i.test(decodeURIComponent(url));
    const result = isDaLat ? [geocodingFixture[1]] : [geocodingFixture[0]];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(result),
    });
  });

  // Internal API routes
  await page.route('**/api/route', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(routeFixture),
      });
    }
    return route.continue();
  });

  await page.route('**/api/vehicles**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(vehiclesFixture),
    }),
  );

  await page.route('**/api/stations/nearby', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stationsNearbyFixture),
    }),
  );

  await page.route('**/api/evi/parse', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(eviParseFixture),
    }),
  );

  await page.route('**/api/evi/suggestions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ suggestions: [] }),
    }),
  );

  await page.route('**/api/short-url', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(shortUrlFixture),
    }),
  );

  await page.route('**/api/feedback', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    }),
  );

  // Route narrative (AI-generated text)
  await page.route('**/api/route/narrative', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        narrative: 'Your trip from Ho Chi Minh City to Da Lat covers 310 km with 1 charging stop.',
      }),
    }),
  );
}

/**
 * Navigate to /plan and wait for the app to be fully ready.
 * Checks: page loaded, map container rendered, tile layers present.
 */
export async function navigateToPlan(page: Page): Promise<void> {
  await page.goto('/plan');
  await waitForAppReady(page);
}

/**
 * Wait for the app to be fully interactive.
 * Verifies map container and Leaflet tile layers are loaded.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for DOM ready — avoid 'networkidle' which times out in CI
  // due to ongoing map tile requests and SSE connections
  await page.waitForLoadState('domcontentloaded');

  // Verify map container rendered (Leaflet)
  const mapContainer = page.locator('.leaflet-container');
  await expect(mapContainer).toBeVisible({ timeout: 10_000 });

  // Verify tile layers loaded (at least one tile image)
  await page.waitForFunction(
    () => document.querySelectorAll('.leaflet-tile-loaded').length > 0,
    { timeout: 10_000 },
  );
}

/**
 * Complete a trip plan by filling start, end, vehicle, and clicking Plan Trip.
 * Handles both desktop (single Plan Trip tab) and mobile (Route + Vehicle tabs).
 * Prerequisite for flows that need trip results (F7, F10).
 */
export async function completeTripPlan(page: Page, isMobile: boolean): Promise<void> {
  // Navigate to the route/trip form
  await switchToTab(page, isMobile ? 'Route' : 'Plan Trip');

  // Enter start location (combobox with Vietnamese placeholder "VD: Thủ Thiêm, TP.HCM")
  const startInput = page.getByRole('combobox', { name: /Thủ Thiêm|Thu Thiem/i });
  await startInput.fill('Ho Chi Minh City');
  const firstSuggestion = page.locator('[role="listbox"] [role="option"], [data-testid="place-suggestion"]').first();
  await expect(firstSuggestion).toBeVisible({ timeout: 5_000 });
  await firstSuggestion.click({ force: true });

  // Enter end location (combobox with Vietnamese placeholder "VD: Vũng Tàu")
  const endInput = page.getByRole('combobox', { name: /Vũng Tàu|Vung Tau/i });
  await endInput.fill('Da Lat');
  const secondSuggestion = page.locator('[role="listbox"] [role="option"], [data-testid="place-suggestion"]').first();
  await expect(secondSuggestion).toBeVisible({ timeout: 5_000 });
  await secondSuggestion.click({ force: true });

  // On mobile, vehicle selection is on a separate tab
  if (isMobile) {
    await switchToTab(page, 'Vehicle');
  }

  // Select a vehicle (required before Plan Trip button is enabled)
  const vehicleSearch = page.getByRole('textbox', { name: /Tìm theo hãng hoặc dòng xe/i });
  await vehicleSearch.fill('VF8');
  const vehicleOption = page.getByRole('button', { name: /VF 8 Plus/i });
  await vehicleOption.waitFor({ state: 'visible', timeout: 5_000 });
  await vehicleOption.click();

  // On mobile, go back to Route tab to click Plan button
  if (isMobile) {
    await switchToTab(page, 'Route');
  }

  // Click the calculate-route action button (handles both legacy and renamed copy)
  const planButton = page.getByRole('button', {
    name: /Calculate route|Tính lộ trình|Plan this trip|Xem lịch trình/i,
  });
  await planButton.click();

  // Wait for results
  await page.waitForResponse((resp) => resp.url().includes('/api/route') && resp.status() === 200);
}

/**
 * Switch to a specific tab in the desktop sidebar or mobile tab bar.
 *
 * Desktop tabs: eVi, Trip / Chuyến đi (was "Plan Trip" / "Lên lộ trình"), Stations / Trạm sạc
 * Mobile tabs:  eVi, Route, Vehicle, Battery, Stations
 */
type TabName = 'eVi' | 'Plan Trip' | 'Route' | 'Vehicle' | 'Battery' | 'Stations';

const TAB_NAMES: Record<TabName, string[]> = {
  'eVi': ['eVi'],
  'Plan Trip': ['Trip', 'Chuyến đi', 'Plan Trip', 'Lên lộ trình'],
  'Route': ['Route', 'Tuyến đường'],
  'Vehicle': ['Vehicle', 'Xe'],
  'Battery': ['Battery', 'Pin'],
  'Stations': ['Stations', 'Trạm sạc'],
};

export async function switchToTab(
  page: Page,
  tabName: TabName,
): Promise<void> {
  const names = TAB_NAMES[tabName] ?? [tabName];
  // Build a selector that matches any of the bilingual names
  const selector = names.map((n) => `[role="tab"]:has-text("${n}")`).join(', ');
  const tab = page.locator(selector).first();
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
