import { test, expect } from 'playwright/test';
import { mockAPIs, waitForAppReady, switchToTab } from './helpers/app';

test.describe('F10: URL State — Share Link Restoration', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
  });

  test('restores trip state from URL parameters', async ({ page, isMobile }) => {
    // Step 2: Navigate to /plan with URL parameters
    await page.goto('/plan?start=Ho+Chi+Minh+City&end=Da+Lat&startLat=10.7769&startLng=106.7009&endLat=11.9404&endLng=108.4583&vehicleId=vf8-plus');
    await waitForAppReady(page);

    // Switch to the route form tab to see inputs
    // Desktop: "Plan Trip" | Mobile: "Route" (locations are on Route tab)
    await switchToTab(page, isMobile ? 'Route' : 'Plan Trip');

    // Step 3: Verify form auto-filled — start location (combobox with Vietnamese placeholder)
    const startInput = page.getByRole('combobox', { name: /Thủ Thiêm|Thu Thiem/i });
    await expect(startInput).toHaveValue(/Ho Chi Minh|HCM|Hồ Chí Minh/i, { timeout: 5_000 });

    // Verify end location
    const endInput = page.getByRole('combobox', { name: /Vũng Tàu|Vung Tau/i });
    await expect(endInput).toHaveValue(/Da Lat|Đà Lạt/i, { timeout: 5_000 });

    // Step 4: Verify vehicle loaded from URL
    // On mobile, vehicle info may be on Vehicle tab
    if (isMobile) {
      await switchToTab(page, 'Vehicle');
    }
    const vehicleInfo = page.locator('text=/VF 8|VF8/').first();
    await expect(vehicleInfo).toBeVisible({ timeout: 5_000 });
  });

  test('short URL redirect resolves correctly', async ({ page, browserName }) => {
    // WebKit doesn't support route.fulfill with redirect status codes
    // Use route.fulfill with 200 + meta refresh as a cross-browser alternative
    await page.route('**/s/aBcD1e2', (route) => {
      const redirectUrl = '/plan?start=Ho+Chi+Minh+City&end=Da+Lat&vehicleId=vf8-plus';
      if (browserName === 'webkit') {
        // Serve HTML that redirects via meta refresh + JS
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<html><head><meta http-equiv="refresh" content="0;url=${redirectUrl}"><script>window.location.replace("${redirectUrl}")</script></head></html>`,
        });
      }
      return route.fulfill({
        status: 307,
        headers: { Location: redirectUrl },
      });
    });

    // Navigate to short URL
    await page.goto('/s/aBcD1e2');

    // Verify redirect happened (page should end up at /plan)
    await page.waitForURL('**/plan**', { timeout: 10_000 });
    expect(page.url()).toContain('/plan');
  });
});
