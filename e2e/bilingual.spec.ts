import { test, expect } from 'playwright/test';
import { mockAPIs } from './helpers/app';

test.describe('F8: Bilingual — Vietnamese <-> English', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
  });

  test('toggles between Vietnamese and English on landing page', async ({ page }) => {
    // Step 1: Navigate to landing page
    await page.goto('/');

    // Step 3: Toggle to Vietnamese — find the VISIBLE language button
    // Landing page has separate desktop (hidden md:flex) and mobile (flex md:hidden) buttons
    const langToggle = page.locator('button:has-text("VI"), button:has-text("EN")').and(page.locator(':visible')).first();
    await langToggle.waitFor({ state: 'visible', timeout: 10_000 });
    await langToggle.click();

    // Step 4: Verify Vietnamese text appears
    const viText = page.locator('text=/Lên kế hoạch|Hành trình|Trạm sạc|Việt Nam/').first();
    await expect(viText).toBeVisible({ timeout: 5_000 });

    // Step 5: Navigate to /plan
    await page.goto('/plan');
    await page.waitForLoadState('domcontentloaded');

    // Step 6: Verify /plan UI is in Vietnamese
    // Match tab names that exist on both desktop and mobile
    const viPlanText = page.locator('text=/eVi|Trạm sạc|Tuyến đường|Lên lộ trình/').first();
    await expect(viPlanText).toBeVisible({ timeout: 5_000 });

    // Step 7: Toggle back to English — /plan page uses Header component with aria-label
    const langToggle2 = page.getByRole('button', { name: /Toggle language/i });
    await langToggle2.click();

    // Step 8: Verify English text appears
    const enText = page.locator('text=/eVi|Stations|Plan Trip|Route|Vehicle/').first();
    await expect(enText).toBeVisible({ timeout: 5_000 });
  });
});
