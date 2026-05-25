import {
  parseVinfastLocatorsResponseText,
  VinfastApiError,
  type VinfastLocatorRaw,
} from './vinfast-api-client';
import { normalizeVinfastBrowserError } from './vinfast-upstream-error';

export const VINFAST_LOCATOR_PAGE =
  'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac';
export const VINFAST_BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface VinfastLocatorPage {
  goto: (
    url: string,
    options: { waitUntil: 'domcontentloaded'; timeout: number },
  ) => Promise<unknown>;
  waitForTimeout: (timeoutMs: number) => Promise<unknown>;
  evaluate: <T>(pageFunction: () => Promise<T>) => Promise<T>;
}

export async function fetchVinfastLocatorsFromPage(
  page: VinfastLocatorPage,
): Promise<readonly VinfastLocatorRaw[]> {
  try {
    await page.goto(VINFAST_LOCATOR_PAGE, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(2000);

    const response = await page.evaluate(async () => {
      const res = await fetch('/vn_vi/get-locators', {
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
      });
      return {
        status: res.status,
        text: await res.text(),
      };
    });

    if (response.status !== 200) {
      throw new VinfastApiError(
        'http_error',
        `Upstream returned ${response.status}`,
        response.status,
      );
    }

    return parseVinfastLocatorsResponseText(response.text);
  } catch (err) {
    throw normalizeVinfastBrowserError(err);
  }
}
