import { test, expect } from 'playwright/test';
import { mockAPIs, navigateToPlan } from './helpers/app';

// docs/bugs/2026-11-01-p2-planner-ui-state-and-map.md F2: at phone width the
// start-field suggestion list opened upward into the bottom sheet's scroll
// container edge, so the first option was clipped and a tap hit the tab bar.
test.describe('F2: Mobile start-point autocomplete', () => {
  test.skip(({ isMobile }) => !isMobile, 'Mobile-only test');
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await mockAPIs(page);
    await navigateToPlan(page);
  });

  test('the first start-point suggestion is visible and selectable', async ({ page }) => {
    const startInput = page.getByPlaceholder('VD: Thủ Thiêm, TP.HCM');
    await startInput.fill('Quận 1, Hồ Chí Minh');

    const option = page.getByRole('option').first();
    await option.waitFor();

    // The tap target at the option's centre must be the option itself, not
    // whatever sits outside the clipping scroll container (the tab bar).
    const hitIsOption = await option.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(hitIsOption).toBe(true);

    await option.click({ timeout: 4_000 });
    await expect(startInput).toHaveValue(/Hồ Chí Minh/);
  });
});
