import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan, switchToTab } from './helpers/app';

test.describe('F3: Nearby Stations — Geolocation Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant geolocation permission and set simulated coordinates (HCM)
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 10.7769, longitude: 106.7009 });
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test('loads nearby stations after granting geolocation', async ({ page }) => {
    // Switch to Stations tab — geolocation auto-triggers on desktop
    await switchToTab(page, 'Stations');

    // The station list may already be loaded (auto-geolocation on desktop)
    // or may need the "Dùng vị trí của tôi" button click
    const useLocationBtn = page.getByRole('button', { name: 'Dùng vị trí của tôi' });
    if (await useLocationBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await useLocationBtn.click();
    }

    // Verify station results appear
    const stationResults = page.locator('text=/trạm sạc|station|Nguyễn Huệ|VinFast/i').first();
    await expect(stationResults).toBeVisible({ timeout: 10_000 });
  });

  test('radius buttons are visible on Stations tab', async ({ page }) => {
    await switchToTab(page, 'Stations');

    // Wait for stations to load first (need geolocation to resolve)
    const useLocationBtn = page.getByRole('button', { name: 'Dùng vị trí của tôi' });
    if (await useLocationBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await useLocationBtn.click();
    }

    // Wait for station results to appear (indicates geolocation resolved)
    const stationResults = page.locator('text=/trạm sạc|station/i').first();
    await expect(stationResults).toBeVisible({ timeout: 10_000 });

    // Now verify radius buttons exist — Vietnamese labels "2 km", "5 km", "10 km", "25 km"
    await expect(page.getByRole('button', { name: '5 km', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '10 km', exact: true })).toBeVisible();
  });

  test('shows empty state when geolocation is denied', async ({ page, context }) => {
    // Override: deny geolocation
    await context.clearPermissions();

    await page.goto('/plan');
    await switchToTab(page, 'Stations');

    // Verify fallback UI shows (search by address or "use my location" button)
    const emptyState = page.locator(
      'text=/tìm|vị trí|address|location|Dùng/i',
    ).first();
    await expect(emptyState).toBeVisible({ timeout: 10_000 });
  });
});
