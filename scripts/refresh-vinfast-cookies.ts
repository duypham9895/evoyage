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
import { VinfastApiError } from '../src/lib/station/vinfast-api-client';
import {
  classifyVinfastCronError,
  normalizeVinfastBrowserError,
} from '../src/lib/station/vinfast-upstream-error';

const prisma = new PrismaClient();

const LOCATOR_PAGE = 'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac';
const KEEP_LAST_N_ROWS = 3;
const JOB_NAME = 'Refresh VinFast Cookies';

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
    // `networkidle` is famously flaky on sites that long-poll or fire analytics
    // beacons (vinfastauto.com does both) — see GHA failures 2026-05-17 → 23
    // where networkidle timed out at 30s on otherwise-healthy pages. The actual
    // signal that the CF challenge has passed is the verification fetch below,
    // not network quiescence. Use `domcontentloaded` so we move on once HTML
    // is parsed; the verification step is the real gate.
    let verification: { status: number; challenged: boolean };
    try {
      await page.goto(LOCATOR_PAGE, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      // Brief settle for any inline CF challenge script that runs post-DCL.
      await page.waitForTimeout(2000);

      console.log('Verifying API access with current cookies...');
      verification = await page.evaluate(async () => {
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
            text.includes('IM_UNDER_ATTACK') ||
            text.includes('challenge-platform'),
        };
      });
    } catch (err) {
      throw normalizeVinfastBrowserError(err);
    }

    if (verification.challenged || verification.status !== 200) {
      throw new VinfastApiError(
        verification.challenged ? 'cloudflare_blocked' : 'http_error',
        `Verification failed: status=${verification.status} challenged=${verification.challenged}`,
        verification.status,
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

const MAX_ATTEMPTS = 3;

async function main(): Promise<void> {
  console.log('=== VinFast Cookie Refresh ===');
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const fresh = await fetchFreshCookies();
      await persist(fresh);
      console.log(`Done (attempt ${attempt}/${MAX_ATTEMPTS}).`);
      return;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
      if (attempt < MAX_ATTEMPTS) {
        const delaySec = 5 * attempt; // 5s, 10s
        console.log(`Retrying in ${delaySec}s...`);
        await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Cookie refresh exhausted ${MAX_ATTEMPTS} attempts`);
}

main()
  .catch((err) => {
    const outcome = classifyVinfastCronError(JOB_NAME, err);
    if (outcome.action === 'skip') {
      console.warn(outcome.warning);
      console.log(`Result: ${JSON.stringify(outcome.result)}`);
      return;
    }

    console.error('Cookie refresh failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
