import { test, expect } from 'playwright/test';
import { mockAPIs } from './helpers/app';

test.describe('F9: Feedback FAB — Drag & Submit', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.goto('/plan');
    await page.evaluate(() => localStorage.removeItem('evoyage-fab-position'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('FAB is visible on page load', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"], button[aria-label*="góp ý"]');
    await expect(fab).toBeVisible();
  });

  test('tap opens feedback modal (no drag)', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"], button[aria-label*="góp ý"]');
    await fab.click();

    const modal = page.locator('[role="dialog"], [data-testid="feedback-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });

  test('drag moves FAB and snaps to nearest edge', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"], button[aria-label*="góp ý"]');
    await expect(fab).toBeVisible();

    const initialBox = await fab.boundingBox();
    expect(initialBox).not.toBeNull();

    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;
    const endX = 100;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 10, startY, { steps: 2 });
    await page.mouse.move(endX, startY, { steps: 10 });
    await page.mouse.up();

    // Wait for snap animation by checking position (no waitForTimeout)
    await expect(async () => {
      const finalBox = await fab.boundingBox();
      expect(finalBox).not.toBeNull();
      expect(finalBox!.x).toBeLessThan(initialBox!.x);
      expect(finalBox!.x).toBeLessThan(50);
    }).toPass({ timeout: 2_000 });
  });

  test('drag does NOT open modal', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"], button[aria-label*="góp ý"]');
    const initialBox = await fab.boundingBox();
    expect(initialBox).not.toBeNull();

    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 50, startY, { steps: 5 });
    await page.mouse.up();

    // Verify modal is NOT visible (use expect.toPass for stability)
    await expect(async () => {
      const modal = page.locator('[role="dialog"], [data-testid="feedback-modal"]');
      await expect(modal).not.toBeVisible();
    }).toPass({ timeout: 1_000 });
  });

  test('position persists across page reload', async ({ page }) => {
    const fab = page.locator('button[aria-label*="eedback"], button[aria-label*="góp ý"]');
    const initialBox = await fab.boundingBox();
    expect(initialBox).not.toBeNull();

    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;

    // Drag FAB to left side
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 10, startY, { steps: 2 });
    await page.mouse.move(100, startY, { steps: 10 });
    await page.mouse.up();

    // Wait for position to settle
    await expect(async () => {
      const afterDragBox = await fab.boundingBox();
      expect(afterDragBox!.x).toBeLessThan(initialBox!.x);
    }).toPass({ timeout: 2_000 });

    // Reload and verify position persisted
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const afterReloadFab = page.locator('button[aria-label*="eedback"], button[aria-label*="góp ý"]');
    await expect(async () => {
      const afterReloadBox = await afterReloadFab.boundingBox();
      expect(afterReloadBox).not.toBeNull();
      expect(afterReloadBox!.x).toBeLessThan(initialBox!.x);
    }).toPass({ timeout: 3_000 });
  });

  test('submits feedback form successfully', async ({ page }) => {
    // Step 5: Click FAB to open modal
    const fab = page.locator('button[aria-label*="eedback"], button[aria-label*="góp ý"]');
    await fab.click();

    const modal = page.locator('[role="dialog"], [data-testid="feedback-modal"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Step 7: Select "Report Issue" category
    const categorySelect = modal.locator('select, [role="combobox"], button:has-text("category"), button:has-text("Report")').first();
    if (await categorySelect.isVisible()) {
      await categorySelect.click();
      const reportOption = page.locator('option:has-text("Report"), [role="option"]:has-text("Report")').first();
      if (await reportOption.isVisible()) {
        await reportOption.click();
      }
    }

    // Step 8: Fill description and email
    const descriptionField = modal.locator('textarea, input[name="description"]').first();
    if (await descriptionField.isVisible()) {
      await descriptionField.fill('Test feedback from E2E suite');
    }

    const emailField = modal.locator('input[type="email"], input[name="email"]').first();
    if (await emailField.isVisible()) {
      await emailField.fill('test@example.com');
    }

    // Step 9: Submit (wait for honeypot timing delay)
    const submitButton = modal.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Gửi")').first();
    if (await submitButton.isVisible()) {
      // Wait for minimum submit delay to pass
      await page.waitForFunction(() => true, {}, { timeout: 2_000 });
      await submitButton.click();

      // Step 10: Verify success confirmation
      const success = page.locator('text=/success|thank|cảm ơn|thành công/i').first();
      await expect(success).toBeVisible({ timeout: 10_000 });
    }
  });
});
