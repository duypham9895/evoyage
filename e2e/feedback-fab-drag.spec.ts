import { test, expect } from 'playwright/test';

test.describe('Feedback FAB — Drag & Snap', () => {
  test.beforeEach(async ({ page }) => {
    // Clear saved FAB position
    await page.goto('/plan');
    await page.evaluate(() => localStorage.removeItem('evoyage-fab-position'));
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('FAB is visible on page load', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"]');
    await expect(fab).toBeVisible();
  });

  test('tap opens feedback modal (no drag)', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"]');
    await fab.click();

    // Modal should appear
    const modal = page.locator('[role="dialog"], [data-testid="feedback-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('drag moves FAB and snaps to nearest edge', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"]');
    await expect(fab).toBeVisible();

    // Get initial position
    const initialBox = await fab.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag FAB to the left side of the screen
    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;
    const endX = 100; // Left side
    const endY = startY;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move in steps to trigger drag threshold
    await page.mouse.move(startX - 10, startY, { steps: 2 });
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // Wait for snap animation
    await page.waitForTimeout(300);

    // FAB should have snapped to left edge
    const finalBox = await fab.boundingBox();
    expect(finalBox).not.toBeNull();
    expect(finalBox!.x).toBeLessThan(initialBox!.x);
    // Should be near left edge (within edgePadding + some tolerance)
    expect(finalBox!.x).toBeLessThan(50);
  });

  test('drag does NOT open modal', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"]');
    const initialBox = await fab.boundingBox();
    expect(initialBox).not.toBeNull();

    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;

    // Drag horizontally (past threshold)
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 50, startY, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(100);

    // Modal should NOT be visible
    const modal = page.locator('[role="dialog"], [data-testid="feedback-modal"]');
    await expect(modal).not.toBeVisible();
  });

  test('position persists across page reload', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"]');
    const initialBox = await fab.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag FAB to left side
    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 10, startY, { steps: 2 });
    await page.mouse.move(100, startY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Verify position moved left
    const afterDragBox = await fab.boundingBox();
    expect(afterDragBox!.x).toBeLessThan(initialBox!.x);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // FAB should restore to saved position (left side)
    const afterReloadBox = await fab.boundingBox();
    expect(afterReloadBox).not.toBeNull();
    expect(afterReloadBox!.x).toBeLessThan(initialBox!.x);
  });
});
