/**
 * Refresh cached Cloudflare cookies for vinfastauto.com.
 *
 * Runs weekly on GitHub Actions (Linux runner with full Chromium). The
 * hourly Vercel polling endpoint reads the latest non-expired row from
 * the VinfastApiCookies table, so this job's only responsibility is to
 * keep that table populated with valid cookies.
 *
 * On failure, the polling endpoint returns 503 with reason
 * 'cookies_expired' until the next successful run. Manual recovery via
 * workflow_dispatch.
 *
 * Run: npx tsx scripts/refresh-vinfast-cookies.ts
 */
import { PrismaClient } from '@prisma/client';
import { chromium, type Cookie } from 'playwright';
import { computeCookieExpiry } from '../src/lib/station/cookie-expiry';

const prisma = new PrismaClient();

const LOCATOR_PAGE = 'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac';
const KEEP_LAST_N_ROWS = 3;

interface FreshCookies {
  readonly cookies: readonly Cookie[];
  readonly expiresAt: Date;
}

async function fetchFreshCookies(): Promise<FreshCookies> {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();

    console.log('Navigating to locator page (resolving CF challenge)...');
    await page.goto(LOCATOR_PAGE, { waitUntil: 'networkidle', timeout: 30_000 });

    console.log('Verifying API access with current cookies...');
    const verification = await page.evaluate(async () => {
      const res = await fetch('/vn_vi/get-locators', {
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
      });
      const text = await res.text();
      return {
        status: res.status,
        challenged:
          text.includes('IM_UNDER_ATTACK') || text.includes('challenge-platform'),
      };
    });

    if (verification.challenged || verification.status !== 200) {
      throw new Error(
        `Verification failed: status=${verification.status} challenged=${verification.challenged}`,
      );
    }

    const cookies = await context.cookies();
    if (cookies.length === 0) {
      throw new Error('No cookies extracted from context');
    }

    return { cookies, expiresAt: computeCookieExpiry(cookies) };
  } finally {
    await browser.close();
  }
}

async function persist(fresh: FreshCookies): Promise<void> {
  console.log(
    `Persisting ${fresh.cookies.length} cookies, expires ${fresh.expiresAt.toISOString()}`,
  );
  await prisma.vinfastApiCookies.create({
    data: {
      cookieJson: JSON.stringify(fresh.cookies),
      expiresAt: fresh.expiresAt,
    },
  });

  // Retention: keep last N rows so we can roll back if a refresh ships bad cookies
  const allRows = await prisma.vinfastApiCookies.findMany({
    orderBy: { refreshedAt: 'desc' },
    select: { id: true },
  });
  const stale = allRows.slice(KEEP_LAST_N_ROWS);
  if (stale.length > 0) {
    await prisma.vinfastApiCookies.deleteMany({
      where: { id: { in: stale.map((r) => r.id) } },
    });
    console.log(`Pruned ${stale.length} stale cookie rows`);
  }
}

async function main(): Promise<void> {
  console.log('=== VinFast Cookie Refresh ===');
  const fresh = await fetchFreshCookies();
  await persist(fresh);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('Cookie refresh failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
