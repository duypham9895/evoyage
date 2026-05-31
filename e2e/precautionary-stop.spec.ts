import { test, expect } from 'playwright/test';
import { completeTripPlan, mockAPIs, switchToTab, waitForAppReady } from './helpers/app';
import precautionaryRouteFixture from './fixtures/route-with-precautionary-stop.json';

test.describe('Option C: precautionary stop dismissal flow', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'Slice 5 acceptance targets Desktop Chrome.');
    await mockAPIs(page);
    await page.route('**/api/route', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(precautionaryRouteFixture),
        });
      }
      return route.continue();
    });
  });

  test('dismisses a Tết precautionary stop and persists it through the saved notebook', async ({ page, isMobile }) => {
    await page.goto('/plan');
    await waitForAppReady(page);
    await completeTripPlan(page, isMobile);

    await expect(page.getByText('Suggested Tết Top-up').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/50% battery when you arrive|Còn pin 50% khi tới/)).toBeVisible();

    await page
      .getByRole('button', {
        name: /Skip suggested station Suggested Tết Top-up|Bỏ qua trạm đề xuất Suggested Tết Top-up/,
      })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Skip|Bỏ qua/ }).click();

    await expect(page.getByRole('button', { name: /Undo|Hoàn tác/ })).toBeVisible();
    await expect(page.getByText(/25% battery when you arrive|Còn pin 25% khi tới/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Suggested Tết Top-up/ })).toHaveCount(0, { timeout: 3_000 });

    await page.reload();
    await waitForAppReady(page);
    await switchToTab(page, 'Saved');

    const openSavedTrip = page.getByRole('button', { name: /Open|Mở lại/ }).first();
    await expect(openSavedTrip).toBeVisible({ timeout: 5_000 });
    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/api/route') && resp.status() === 200),
      openSavedTrip.click(),
    ]);

    await expect(page.getByText(/25% battery when you arrive|Còn pin 25% khi tới/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Suggested Tết Top-up/ })).toHaveCount(0);
  });
});
