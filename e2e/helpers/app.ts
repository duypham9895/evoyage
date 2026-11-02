import { type Page, expect } from 'playwright/test';
import geocodingFixture from '../fixtures/geocoding.json';
import routeFixture from '../fixtures/route.json';
import vehiclesFixture from '../fixtures/vehicles.json';
import stationsNearbyFixture from '../fixtures/stations-nearby.json';
import eviParseFixture from '../fixtures/evi-parse.json';
import shortUrlFixture from '../fixtures/short-url.json';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Mock all API routes with fixture data.
 * Uses page.route() to intercept fetch requests at the browser level.
 */
export async function mockAPIs(page: Page): Promise<void> {
  // Nominatim geocoding (external API called from client)
  // Return query-aware results: Da Lat searches get Da Lat, everything else gets HCM
  // Leaflet fallback basemap tiles: serve a 1x1 PNG so E2E never hits the
  // OSM tile server from CI (its usage policy forbids automated load).
  await page.route('**/tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PX_PNG }),
  );

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

  // Mirrors GET /api/vehicles: ?id= returns one vehicle (or 404), otherwise the list.
  await page.route('**/api/vehicles**', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    if (id) {
      const vehicle = vehiclesFixture.vehicles.find((v) => v.id === id);
      return route.fulfill({
        status: vehicle ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(vehicle ?? { error: 'Vehicle not found' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(vehiclesFixture),
    });
  });

  await page.route('**/api/stations/nearby', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stationsNearbyFixture),
    }),
  );

  await page.route('**/api/stations/*/amenities', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pois: [], cachedAt: null, fromCache: false }),
    }),
  );

  // Map-bounds station fetch (e.g. NearbyStations, MapLocateButton). Returning
  // an empty list keeps the dev server hermetic — no DATABASE_URL needed.
  await page.route(/\/api\/stations(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stations: [], count: 0 }),
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
 * Checks: page loaded and the configured map provider rendered.
 */
export async function navigateToPlan(page: Page): Promise<void> {
  await page.goto('/plan');
  await waitForAppReady(page);
}

/**
 * Wait for the app to be fully interactive.
 * Verifies either Mapbox or Leaflet has rendered. Tests run in developer
 * environments with and without a Mapbox token.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for DOM ready — avoid 'networkidle' which times out in CI
  // due to ongoing map tile requests and SSE connections
  await page.waitForLoadState('domcontentloaded');

  const mapContainer = page.locator('.mapboxgl-map, .leaflet-container');
  await expect(mapContainer).toBeVisible({ timeout: 10_000 });

  const leafletMap = page.locator('.leaflet-container');
  if (await leafletMap.isVisible().catch(() => false)) {
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-tile-loaded').length > 0,
      { timeout: 10_000 },
    );
  }
}

export async function selectFirstPlaceSuggestion(page: Page): Promise<void> {
  const firstSuggestion = page.locator('[role="listbox"] [role="option"], [data-testid="place-suggestion"]').first();
  await expect(firstSuggestion).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('ArrowDown');
  await expect(firstSuggestion).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
}

/**
 * Complete a trip plan by filling start, end, vehicle, and clicking Plan Trip.
 * Handles both desktop (single Plan Trip tab) and mobile (Route + Vehicle tabs).
 * Prerequisite for flows that need trip results (F7, F10).
 */
export async function completeTripPlan(page: Page, isMobile: boolean): Promise<void> {
  // Navigate to the route/trip form
  await switchToTab(page, isMobile ? 'Route' : 'Plan Trip');

  // Enter start location (combobox named by its visible label "Điểm đi")
  const startInput = page.getByRole('combobox', { name: /^(Điểm đi|Starting point)$/ });
  await startInput.fill('Ho Chi Minh City');
  await selectFirstPlaceSuggestion(page);

  // Enter end location (combobox named by its visible label "Điểm đến")
  const endInput = page.getByRole('combobox', { name: /^(Điểm đến|Destination)$/ });
  await endInput.fill('Da Lat');
  await selectFirstPlaceSuggestion(page);

  // On mobile, vehicle selection is on a separate tab
  if (isMobile) {
    await switchToTab(page, 'Vehicle');
  }

  // Select a vehicle (required before Plan Trip button is enabled)
  const vehicleSearch = page.getByRole('textbox', { name: /Tìm theo hãng hoặc dòng xe/i });
  await vehicleSearch.fill('VF8');
  const vehicleOption = page.getByRole('button', { name: /VF 8 Plus/i });
  await vehicleOption.waitFor({ state: 'visible', timeout: 5_000 });
  const selectedVehicle = page.getByText('VinFast VF 8 Plus', { exact: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await vehicleOption.click({ force: true });
    if (await selectedVehicle.isVisible({ timeout: 1_000 }).catch(() => false)) {
      break;
    }
  }
  await expect(selectedVehicle).toBeVisible({ timeout: 5_000 });

  // On mobile, go back to Route tab to click Plan button
  if (isMobile) {
    await switchToTab(page, 'Route');
  }

  // Click the calculate-route action button (handles both legacy and renamed copy)
  const planButton = page.getByRole('button', {
    name: /Calculate route|Tính lộ trình|Plan this trip|Xem lịch trình/i,
  });
  await expect(planButton).toBeEnabled({ timeout: 5_000 });
  await Promise.all([
    page.waitForResponse((resp) => resp.url().includes('/api/route') && resp.status() === 200),
    planButton.click(),
  ]);
}

/**
 * Switch to a specific tab in the desktop sidebar or mobile tab bar.
 *
 * Desktop tabs: eVi (sidebar), Trip / Chuyến đi (was "Plan Trip" / "Lên lộ trình"), Stations / Trạm sạc
 * Mobile tabs:  Trip, Vehicle, Battery, Stations (eVi is opened via FAB, not a tab)
 */
type TabName = 'Plan Trip' | 'Route' | 'Vehicle' | 'Battery' | 'Stations' | 'Saved';

const TAB_NAMES: Record<TabName, string[]> = {
  'Plan Trip': ['Trip', 'Chuyến đi', 'Plan Trip', 'Lên lộ trình'],
  'Route': ['Trip', 'Chuyến đi'],
  'Vehicle': ['Vehicle', 'Xe'],
  'Battery': ['Battery', 'Pin'],
  'Stations': ['Stations', 'Trạm sạc'],
  'Saved': ['Saved', 'Đã lưu', 'Notebook', 'Sổ tay'],
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
