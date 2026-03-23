import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan } from './helpers/app';

test.describe('F2: eVi AI Chat — Natural Language Trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test('sends chat message and receives AI response', async ({ page, isMobile }) => {
    // eVi tab should be active by default on desktop
    if (isMobile) {
      const eviTab = page.locator('[role="tab"]:has-text("eVi")');
      if (await eviTab.isVisible()) {
        await eviTab.click();
      }
    }

    // Type trip request in chat input
    const chatInput = page.getByRole('textbox', { name: /Đi Đà Lạt|VF8|pin/ });
    await chatInput.fill('SG to Da Lat, VF5');

    // Set up response listener BEFORE pressing Enter (race condition fix)
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/evi/parse') && resp.status() === 200,
    );
    await chatInput.press('Enter');

    // Wait for AI response
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();

    // The mock returns displayMessage with "HCM to Da Lat with VinFast VF 5 Plus"
    // The component shows this in the chat log before auto-switching tabs
    // Verify the user's message was sent (always visible regardless of tab switch)
    const userMessage = page.locator('text=/SG to Da Lat/');
    await expect(userMessage).toBeVisible({ timeout: 5_000 });
  });
});
