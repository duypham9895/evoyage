/**
 * Poll VinFast station charging statuses from a GitHub Actions browser context.
 *
 * Vercel server-side requests can replay fresh cookies and still receive 403
 * from VinFast/Cloudflare. Running the poll from a Chromium context that has
 * cleared the challenge on the locator page keeps the requests browser-native
 * while reusing the existing DB dedupe/insert logic.
 *
 * Statuses come from the CDN locator file set, the same reader the daily crawl
 * uses. The legacy /vn_vi/get-locators endpoint answers 200 with {"data":[]}.
 *
 * Run: npx tsx scripts/poll-vinfast-station-status.ts
 */
import { PrismaClient } from '@prisma/client';
import { chromium, type Cookie } from 'playwright';
import { computeCookieExpiry } from '../src/lib/station/cookie-expiry';
import { pollStationStatus } from '../src/lib/station/poll-status';
import { VINFAST_BROWSER_USER_AGENT } from '../src/lib/station/vinfast-browser-client';
import { fetchVinfastCarChargingStationsFromCdn } from '../src/lib/station/vinfast-cdn-locators';
import {
  classifyVinfastCronError,
  getErrorMessage,
  isRecoverableVinfastBrowserAccessError,
} from '../src/lib/station/vinfast-upstream-error';
import {
  VinfastApiError,
  type VinfastLocatorRaw,
} from '../src/lib/station/vinfast-api-client';

const prisma = new PrismaClient();
const KEEP_LAST_N_ROWS = 3;
const JOB_NAME = 'Poll Station Status';
const MAX_ATTEMPTS = 3;

interface BrowserPollPayload {
  readonly cookies: readonly Cookie[];
  readonly expiresAt: Date;
  readonly locators: readonly VinfastLocatorRaw[];
}

async function fetchBrowserPollPayload(): Promise<BrowserPollPayload> {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: VINFAST_BROWSER_USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();
    console.log('Fetching VinFast locators from the CDN file set...');
    // The data file is ~73MB, well past Playwright's 30s request default.
    const request = { get: (url: string) => context.request.get(url, { timeout: 120_000 }) };
    const locators = await fetchVinfastCarChargingStationsFromCdn(page, request);

    // pollStationStatus silently skips rows without a status, so a feed that
    // drops the field would exit green having recorded nothing. Live share on
    // 2026-11-01 was 24,873 of 24,873; under half means the field broke.
    const withStatus = locators.filter((row) => row.charging_status).length;
    if (withStatus * 2 < locators.length) {
      throw new VinfastApiError(
        'empty_result',
        `Only ${withStatus} of ${locators.length} locator rows carry charging_status`,
      );
    }

    const cookies = await context.cookies();
    if (cookies.length === 0) {
      throw new Error('No cookies extracted from browser context');
    }

    return {
      cookies,
      expiresAt: computeCookieExpiry(cookies),
      locators,
    };
  } finally {
    await browser.close();
  }
}

async function fetchBrowserPollPayloadWithRetry(): Promise<BrowserPollPayload> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchBrowserPollPayload();
    } catch (err) {
      lastErr = err;
      console.error(
        `Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${getErrorMessage(err)}`,
      );
      if (
        attempt < MAX_ATTEMPTS &&
        isRecoverableVinfastBrowserAccessError(err)
      ) {
        const delaySec = 5 * attempt;
        console.log(`Retrying in ${delaySec}s...`);
        await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
        continue;
      }
      throw err;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Browser poll exhausted ${MAX_ATTEMPTS} attempts`);
}

async function persistCookies(payload: BrowserPollPayload): Promise<void> {
  console.log(
    `Persisting ${payload.cookies.length} cookies, expires ${payload.expiresAt.toISOString()}`,
  );
  await prisma.vinfastApiCookies.create({
    data: {
      cookieJson: JSON.stringify(payload.cookies),
      expiresAt: payload.expiresAt,
    },
  });

  const allRows = await prisma.vinfastApiCookies.findMany({
    orderBy: { refreshedAt: 'desc' },
    select: { id: true },
  });
  const stale = allRows.slice(KEEP_LAST_N_ROWS);
  if (stale.length > 0) {
    await prisma.vinfastApiCookies.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
    console.log(`Pruned ${stale.length} stale cookie rows`);
  }
}

async function main(): Promise<void> {
  console.log('=== VinFast Browser Station Status Poll ===');
  const payload = await fetchBrowserPollPayloadWithRetry();
  console.log(`Fetched ${payload.locators.length} locator rows`);
  await persistCookies(payload);

  const result = await pollStationStatus({
    prisma,
    fetchLocators: async () => payload.locators,
  });

  console.log(`Result: ${JSON.stringify(result)}`);
  if (!result.ok) {
    throw new Error(`Station status poll failed: ${result.reason ?? 'unknown'}`);
  }
}

main()
  .catch((err) => {
    const outcome = classifyVinfastCronError(JOB_NAME, err);
    if (outcome.action === 'skip') {
      console.warn(outcome.warning);
      console.log(`Result: ${JSON.stringify(outcome.result)}`);
      return;
    }

    console.error('Station status poll failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
