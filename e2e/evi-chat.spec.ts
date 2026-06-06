import { test, expect } from 'playwright/test';
import type { Page } from 'playwright/test';
import { mockAPIs } from './helpers/app';
import eviParseFixture from './fixtures/evi-parse.json';
import routeFixture from './fixtures/route.json';
import vehiclesFixture from './fixtures/vehicles.json';

async function openEViChatInput(page: Page, isMobile: boolean) {
  const chatInput = page.getByRole('textbox', { name: /Đi Đà Lạt|VF8|pin/ });

  if (isMobile) {
    const eviFab = page.getByRole('button', { name: /Mở trợ lý eVi|Open eVi assistant/ });
    await expect(eviFab).toBeVisible({ timeout: 10_000 });

    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (await chatInput.isVisible().catch(() => false)) break;
      if (await eviFab.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await eviFab.click();
      }
      if (await chatInput.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true).catch(() => false)) break;
    }
  }

  await expect(chatInput).toBeVisible({ timeout: 10_000 });
  await expect(chatInput).toBeEditable({ timeout: 10_000 });
  return chatInput;
}

test.describe('F2: eVi AI Chat — Natural Language Trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await page.goto('/plan');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('link', { name: 'eVoyage home' })).toBeVisible({ timeout: 10_000 });
  });

  test('sends chat message and receives AI response', async ({ page, isMobile }) => {
    const chatInput = await openEViChatInput(page, isMobile);
    await chatInput.click();
    await chatInput.pressSequentially('SG to Da Lat, VF5');
    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });

    await sendButton.click();

    // The mock returns displayMessage with "HCM to Da Lat with VinFast VF 5 Plus"
    // The component shows this in the chat log before auto-switching tabs
    // Verify the user's message was sent (always visible regardless of tab switch)
    const userMessage = page.locator('text=/SG to Da Lat/');
    await expect(userMessage).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Got it! Planning a trip from HCM to Da Lat with VinFast VF 5 Plus.')).toBeVisible({ timeout: 5_000 });
  });

  test('auto-scrolls to route progress when planning from eVi CTA on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only eVi sheet behavior');

    await page.unroute('**/api/evi/parse');
    await page.route('**/api/evi/parse', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...eviParseFixture,
          tripParams: {
            ...eviParseFixture.tripParams,
            vehicleData: vehiclesFixture.vehicles[1],
          },
        }),
      }),
    );

    let resolveRoute!: () => void;
    const routeGate = new Promise<void>((resolve) => {
      resolveRoute = resolve;
    });

    await page.route('**/api/route', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      await routeGate;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(routeFixture),
      });
    });

    const chatInput = await openEViChatInput(page, isMobile);
    await chatInput.click();
    await chatInput.pressSequentially('SG to Da Lat, VF5');

    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });
    await sendButton.click();

    const eviDialog = page.getByRole('dialog', { name: 'eVi' });
    const eviPlanButton = eviDialog.getByRole('button', { name: /Calculate route|Tính lộ trình/i });
    await expect(eviPlanButton).toBeEnabled({ timeout: 5_000 });
    await eviPlanButton.click();

    await expect(eviDialog).toBeHidden();
    await expect(page.getByRole('tab', { name: /Route|Tuyến đường/i })).toHaveAttribute('aria-selected', 'true');

    const resultAnchor = page.getByTestId('route-result-anchor');
    const progressText = resultAnchor.getByText(/Calculating route|Đang tính/i);
    await expect(progressText).toBeVisible({ timeout: 5_000 });
    await expect(progressText).toBeInViewport({ ratio: 1 });

    const routeResponse = page.waitForResponse((resp) => resp.url().includes('/api/route') && resp.status() === 200);
    resolveRoute();
    await routeResponse;

    const resultHeading = resultAnchor.getByRole('heading', { name: /Trip summary|Tổng quan chuyến đi/i });
    await expect(resultHeading).toBeVisible({ timeout: 10_000 });
    await expect(resultHeading).toBeInViewport({ ratio: 1 });
  });

  test('shows vehicle answers under required vehicle prompt without generic suggestions', async ({ page, isMobile }) => {
    await page.unroute('**/api/evi/parse');
    await page.unroute('**/api/evi/suggestions');

    let suggestionsCalls = 0;
    await page.route('**/api/evi/parse', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          isComplete: false,
          isStationSearch: false,
          followUpType: 'vehicle_pick',
          tripParams: {
            start: null,
            startLat: null,
            startLng: null,
            startSource: null,
            end: 'Đà Lạt, Lâm Đồng, Việt Nam',
            endLat: 11.9404,
            endLng: 108.4583,
            vehicleId: null,
            vehicleName: null,
            vehicleData: null,
            currentBattery: 80,
            minArrival: 15,
            rangeSafetyFactor: 0.8,
          },
          followUpQuestion: 'Bạn đang lái xe điện dòng nào vậy?',
          followUpCount: 1,
          maxFollowUps: 2,
          suggestedOptions: [
            { label: 'VinFast VF 8 Plus', vehicleId: 'vf8-plus' },
            { label: 'VinFast VF 5 Plus', vehicleId: 'vf5-plus' },
          ],
          displayMessage: 'Bạn đang lái xe điện dòng nào vậy?',
          error: null,
          nearbyStations: null,
        }),
      }),
    );
    await page.route('**/api/evi/suggestions', (route) => {
      suggestionsCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          suggestions: ['Trạm sạc trên đường đi?', 'Thời tiết Đà Lạt ngày mai?', 'Mất bao lâu để đến?'],
        }),
      });
    });

    const chatInput = await openEViChatInput(page, isMobile);
    await chatInput.click();
    await chatInput.pressSequentially('Kế hoạch đi Đà Lạt ngày mai');
    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeEnabled({ timeout: 5_000 });

    await sendButton.click();

    await expect(page.getByText('Bạn đang lái xe điện dòng nào vậy?')).toBeVisible();
    await expect(page.getByRole('option', { name: 'VinFast VF 8 Plus' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'VinFast VF 5 Plus' })).toBeVisible();
    await expect(page.getByText('Trạm sạc trên đường đi?')).toHaveCount(0);
    await expect(page.getByText('Thời tiết Đà Lạt ngày mai?')).toHaveCount(0);
    await expect(page.getByText('Mất bao lâu để đến?')).toHaveCount(0);
    expect(suggestionsCalls).toBe(0);
  });
});
