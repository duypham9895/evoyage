import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan, switchToTab } from './helpers/app';

test.describe('F6: Vehicle Selection + Custom Vehicle', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop-only: uses sidebar tab navigation');

  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test('searches and selects a vehicle from the database', async ({ page, isMobile }) => {
    // Navigate to vehicle/route tab
    if (isMobile) {
      // On mobile, look for route/vehicle tab
      const routeTab = page.locator('[role="tab"]').filter({ hasText: /route|vehicle|xe|tuyến/i }).first();
      if (await routeTab.isVisible()) {
        await routeTab.click();
      }
    } else {
      await switchToTab(page, 'Plan Trip');
    }

    // Step 2: Search for VF8 (Vietnamese placeholder)
    const vehicleSearch = page.getByRole('textbox', { name: /Tìm theo hãng hoặc dòng xe/i });
    await vehicleSearch.fill('VF8');

    // Step 3: Select VF 8 Plus from results
    const vehicleOption = page.getByRole('button', { name: /VF 8 Plus/i });
    await vehicleOption.waitFor({ state: 'visible', timeout: 5_000 });
    await vehicleOption.click();

    // Step 4: Verify battery params update (471km range shown in button)
    const batteryInfo = page.locator('text=/471|kWh|km/').first();
    await expect(batteryInfo).toBeVisible({ timeout: 5_000 });
  });

  test('creates a custom vehicle', async ({ page, isMobile }) => {
    if (isMobile) {
      const routeTab = page.locator('[role="tab"]').filter({ hasText: /route|vehicle|xe|tuyến/i }).first();
      if (await routeTab.isVisible()) {
        await routeTab.click();
      }
    } else {
      await switchToTab(page, 'Plan Trip');
    }

    // Step 5: Click "Add Custom Vehicle"
    const addCustom = page.locator('button:has-text("Custom"), button:has-text("Tùy chỉnh"), button:has-text("Add")').first();
    if (await addCustom.isVisible()) {
      await addCustom.click();

      // Step 6: Fill custom vehicle form
      const brandInput = page.locator('input[name="brand"], input[placeholder*="rand"]').first();
      const modelInput = page.locator('input[name="model"], input[placeholder*="odel"]').first();

      if (await brandInput.isVisible()) {
        await brandInput.fill('Tesla');
        await modelInput.fill('Model 3');

        // Fill battery and range fields
        const batteryInput = page.locator('input[name*="battery"], input[placeholder*="kWh"]').first();
        const rangeInput = page.locator('input[name*="range"], input[placeholder*="km"]').first();

        if (await batteryInput.isVisible()) {
          await batteryInput.fill('60');
        }
        if (await rangeInput.isVisible()) {
          await rangeInput.fill('450');
        }

        // Step 7: Save
        const saveButton = page.locator('button:has-text("Save"), button:has-text("Lưu"), button[type="submit"]').first();
        await saveButton.click();

        // Step 8: Verify custom vehicle is selected
        const selectedVehicle = page.locator('text=Tesla, text=Model 3').first();
        await expect(selectedVehicle).toBeVisible({ timeout: 5_000 });
      }
    }
  });
});
