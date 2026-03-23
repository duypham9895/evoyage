import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan, completeTripPlan } from './helpers/app';

test.describe('F7: Share Trip — Link + QR + Image', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test.fixme('opens share modal with copy link and download options', async ({ page }) => {
    // FIXME: completeTripPlan succeeds but share button click timing is inconsistent.
    // The modal opens (confirmed via screenshot) but assertions race with rendering.
    // Complete a trip plan first
    await completeTripPlan(page);

    // Click Share button (Vietnamese: "Chia sẻ")
    const shareButton = page.locator('button:has-text("Share"), button:has-text("Chia sẻ"), button[aria-label*="hare"]').first();
    await shareButton.waitFor({ state: 'visible', timeout: 10_000 });
    await shareButton.click();

    // Verify share modal opened (Vietnamese: "Chia sẻ chuyến đi")
    const modalTitle = page.locator('text=/Chia sẻ chuyến đi|Share trip/i').first();
    await expect(modalTitle).toBeVisible({ timeout: 5_000 });

    // Verify "Copy link" button exists (Vietnamese: "Sao chép liên kết")
    const copyButton = page.locator('button:has-text("Copy"), button:has-text("Sao chép")').first();
    await expect(copyButton).toBeVisible();

    // Verify download PNG option exists (Vietnamese: "Tải ảnh PNG")
    const downloadButton = page.locator('text=/PNG|Download|Tải ảnh/i').first();
    await expect(downloadButton).toBeVisible();
  });
});
