import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan } from './helpers/app';

test.describe('F5: Tab Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test('shows correct tab count and labels', async ({ page, isMobile }) => {
    const tabs = page.locator('[role="tab"]');

    if (isMobile) {
      // Mobile: 5 tabs (eVi, Route, Vehicle, Battery, Stations)
      await expect(tabs).toHaveCount(5, { timeout: 5_000 });
      const tabLabels = await tabs.allTextContents();
      expect(tabLabels.some((t) => /evi/i.test(t))).toBeTruthy();
      expect(tabLabels.some((t) => /route|tuyến/i.test(t))).toBeTruthy();
      expect(tabLabels.some((t) => /vehicle|xe/i.test(t))).toBeTruthy();
      expect(tabLabels.some((t) => /battery|pin/i.test(t))).toBeTruthy();
      expect(tabLabels.some((t) => /station|trạm/i.test(t))).toBeTruthy();
    } else {
      // Desktop: 3 tabs (eVi, Plan Trip, Stations)
      await expect(tabs).toHaveCount(3, { timeout: 5_000 });
      const tabLabels = await tabs.allTextContents();
      expect(tabLabels.some((t) => /evi/i.test(t))).toBeTruthy();
      expect(tabLabels.some((t) => /plan|lộ trình/i.test(t))).toBeTruthy();
      expect(tabLabels.some((t) => /station|trạm/i.test(t))).toBeTruthy();
    }
  });

  test('clicking tabs switches content', async ({ page, isMobile }) => {
    const tabs = page.locator('[role="tab"]');

    if (isMobile) {
      // Mobile: click Route tab, then Stations tab
      const routeTab = tabs.filter({ hasText: /route|tuyến/i }).first();
      await routeTab.click();
      await expect(routeTab).toHaveAttribute('aria-selected', 'true');

      const stationsTab = tabs.filter({ hasText: /station|trạm/i }).first();
      await stationsTab.click();
      await expect(stationsTab).toHaveAttribute('aria-selected', 'true');
    } else {
      // Desktop: click Plan Trip tab, then Stations tab
      const planTab = tabs.filter({ hasText: /plan|lộ trình/i }).first();
      await planTab.click();
      await expect(planTab).toHaveAttribute('aria-selected', 'true');

      const stationsTab = tabs.filter({ hasText: /station|trạm/i }).first();
      await stationsTab.click();
      await expect(stationsTab).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('keyboard navigation works between tabs', async ({ page, isMobile }) => {
    // Keyboard focus management is a desktop interaction pattern
    // Mobile browsers don't reliably support programmatic focus on tabs
    if (isMobile) {
      // On mobile, verify tapping tabs works instead
      const tabs = page.locator('[role="tab"]');
      await tabs.nth(1).tap();
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      await tabs.nth(0).tap();
      await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
      return;
    }

    const tabs = page.locator('[role="tab"]');

    // Focus first tab and use arrow keys
    const firstTab = tabs.first();
    await firstTab.focus();
    await expect(firstTab).toBeFocused();

    // Press right arrow to move to next tab
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();

    // Press right arrow again for third tab
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(2)).toBeFocused();
  });
});
