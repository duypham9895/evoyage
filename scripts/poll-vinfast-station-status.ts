/**
 * Poll VinFast station charging statuses from a GitHub Actions browser context.
 *
 * Vercel server-side requests can replay fresh cookies and still receive 403
 * from VinFast/Cloudflare. Running the poll from the same Chromium context that
 * resolves the locator page keeps the API request browser-native while reusing
 * the existing DB dedupe/insert logic.
 *
 * Run: npx tsx scripts/poll-vinfast-station-status.ts
 */
import { PrismaClient } from '@prisma/client';
import { chromium, type Cookie } from 'playwright';
import { computeCookieExpiry } from '../src/lib/station/cookie-expiry';
import { pollStationStatus } from '../src/lib/station/poll-status';
import {
  fetchVinfastLocatorsFromPage,
  VINFAST_BROWSER_USER_AGENT,
} from '../src/lib/station/vinfast-browser-client';
import type { VinfastLocatorRaw } from '../src/lib/station/vinfast-api-client';

const prisma = new PrismaClient();
const KEEP_LAST_N_ROWS = 3;

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
    console.log('Fetching VinFast locators in browser context...');
    const locators = await fetchVinfastLocatorsFromPage(page);
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
  const payload = await fetchBrowserPollPayload();
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
    console.error('Station status poll failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
