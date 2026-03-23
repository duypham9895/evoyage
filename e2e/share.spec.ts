import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan, completeTripPlan } from './helpers/app';

test.describe('F7: Share Trip — Link + QR + Image', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop-only: uses sidebar tab navigation');

  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test('opens share modal with copy link and download options', async ({ page }) => {
    // Complete a trip plan first
    await completeTripPlan(page);

    // Click Share button (Vietnamese: "Chia sẻ")
    const shareButton = page.locator('button:has-text("Share"), button:has-text("Chia sẻ"), button[aria-label*="hare"]').first();
    await shareButton.waitFor({ state: 'visible', timeout: 10_000 });
    await shareButton.click();

    // Verify share modal opened — wait for "Sao chép liên kết" (Copy link) button
    // This is the most reliable indicator the modal is fully rendered
    const copyButton = page.locator('button:has-text("Sao chép liên kết"), button:has-text("Copy link")').first();
    await expect(copyButton).toBeVisible({ timeout: 10_000 });

    // Verify download option exists (Vietnamese: "Tải ảnh PNG")
    const downloadOption = page.locator('text=/PNG|Tải ảnh/i').first();
    await expect(downloadOption).toBeVisible();
  });
});
