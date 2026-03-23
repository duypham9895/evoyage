import { test, expect } from 'playwright/test';
import { mockAPIs } from './helpers/app';

test.describe('F8: Bilingual — Vietnamese <-> English', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop-only: language toggle not accessible on mobile viewport');

  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
  });

  test('toggles between Vietnamese and English on landing page', async ({ page }) => {
    // Step 1: Navigate to landing page
    await page.goto('/');

    // Step 3: Toggle to Vietnamese
    const langToggle = page.locator('button:has-text("VI"), button:has-text("EN"), button[aria-label*="anguage"], button[aria-label*="gôn ngữ"]').first();
    await langToggle.click();

    // Step 4: Verify Vietnamese text appears
    // Check for common Vietnamese text on the landing page
    const viText = page.locator('text=/Lên kế hoạch|Hành trình|Trạm sạc|Việt Nam/').first();
    await expect(viText).toBeVisible({ timeout: 5_000 });

    // Step 5: Navigate to /plan
    await page.goto('/plan');
    await page.waitForLoadState('domcontentloaded');

    // Step 6: Verify /plan UI is in Vietnamese
    const viPlanText = page.locator('text=/eVi|Trạm|Kế hoạch/').first();
    await expect(viPlanText).toBeVisible({ timeout: 5_000 });

    // Step 7: Toggle back to English
    const langToggle2 = page.locator('button:has-text("VI"), button:has-text("EN"), button[aria-label*="anguage"]').first();
    await langToggle2.click();

    // Step 8: Verify English text appears
    const enText = page.locator('text=/Plan Trip|Stations|eVi/').first();
    await expect(enText).toBeVisible({ timeout: 5_000 });
  });
});
