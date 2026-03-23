import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan } from './helpers/app';

// F4 is mobile-only — skip on desktop projects
test.describe('F4: Mobile Bottom Sheet Gestures', () => {
  test.skip(({ isMobile }) => !isMobile, 'Mobile-only test');

  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test('bottom sheet is visible with drag handle', async ({ page }) => {
    const sheet = page.locator('[data-testid="bottom-sheet"]');
    await expect(sheet).toBeVisible();

    const handle = page.locator('[data-testid="sheet-handle"]');
    await expect(handle).toBeVisible();

    // Verify sheet has reasonable height (not collapsed to 0)
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(100);
  });

  test('tab switching works on mobile', async ({ page }) => {
    // Step 7-8: Verify tab content changes on click
    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();

    if (tabCount >= 2) {
      // Click second tab
      await tabs.nth(1).click();
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

      // Click back to first tab
      await tabs.nth(0).click();
      await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    }
  });
});
