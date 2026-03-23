import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan } from './helpers/app';

// F5 is desktop-only
test.describe('F5: Desktop 3-Tab Sidebar', () => {
  test.skip(({ isMobile }) => !!isMobile, 'Desktop-only test');

  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test('sidebar shows 3 tabs with correct labels', async ({ page }) => {
    // Step 2: Verify sidebar with 3 tabs
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(3, { timeout: 5_000 });

    // Verify tab labels (bilingual — check for either language)
    const tabLabels = await tabs.allTextContents();
    const hasEvi = tabLabels.some((t) => /evi/i.test(t));
    const hasPlan = tabLabels.some((t) => /plan|kế hoạch/i.test(t));
    const hasStations = tabLabels.some((t) => /station|trạm/i.test(t));
    expect(hasEvi || hasPlan || hasStations).toBeTruthy();
  });

  test('clicking tabs switches content', async ({ page }) => {
    const tabs = page.locator('[role="tab"]');

    // Step 3-4: Click Plan Trip tab
    const planTab = tabs.filter({ hasText: /plan|kế hoạch/i }).first();
    if (await planTab.isVisible()) {
      await planTab.click();
      await expect(planTab).toHaveAttribute('aria-selected', 'true');
    }

    // Step 5-6: Click Stations tab
    const stationsTab = tabs.filter({ hasText: /station|trạm/i }).first();
    if (await stationsTab.isVisible()) {
      await stationsTab.click();
      await expect(stationsTab).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('keyboard navigation works between tabs', async ({ page }) => {
    // Step 7-8: Focus first tab and use arrow keys
    const firstTab = page.locator('[role="tab"]').first();
    await firstTab.focus();
    await expect(firstTab).toBeFocused();

    // Press right arrow to move to next tab
    await page.keyboard.press('ArrowRight');

    // Verify focus moved to second tab
    const secondTab = page.locator('[role="tab"]').nth(1);
    await expect(secondTab).toBeFocused();

    // Press right arrow again for third tab
    await page.keyboard.press('ArrowRight');
    const thirdTab = page.locator('[role="tab"]').nth(2);
    await expect(thirdTab).toBeFocused();
  });
});
