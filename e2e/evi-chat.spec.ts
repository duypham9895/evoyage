import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan } from './helpers/app';

test.describe('F2: eVi AI Chat — Natural Language Trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test.fixme('parses natural language trip request and shows response', async ({ page, isMobile }) => {
    // FIXME: eVi parse mock response triggers auto-plan via onPlanTrip callback,
    // which switches tabs before the test can verify the chat response.
    // Needs a mock that returns isComplete:false first, then complete on follow-up.
    // eVi tab should be active by default on desktop, select on mobile
    if (isMobile) {
      const eviTab = page.locator('[role="tab"]:has-text("eVi")');
      if (await eviTab.isVisible()) {
        await eviTab.click();
      }
    }

    // Type trip request in chat input (Vietnamese placeholder)
    const chatInput = page.getByRole('textbox', { name: /Đi Đà Lạt|VF8|pin/ });
    await chatInput.fill('SG to Da Lat, VF5');
    await chatInput.press('Enter');

    // Wait for AI response
    const response = await page.waitForResponse(
      (resp) => resp.url().includes('/api/evi/parse') && resp.status() === 200,
    );
    expect(response.ok()).toBeTruthy();

    // Verify eVi shows the parsed response (fixture displayMessage contains "HCM to Da Lat")
    const chatArea = page.locator('[role="log"]').first();
    await expect(chatArea).toContainText(/Da Lat|Đà Lạt|VF 5/i, { timeout: 10_000 });
  });
});
