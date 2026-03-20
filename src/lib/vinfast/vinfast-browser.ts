import type { Browser, BrowserContext } from 'playwright-core';

const LOCATOR_PAGE = 'https://vinfastauto.com/vn_en/tim-kiem-showroom-tram-sac';
const SESSION_TTL_MS = 15 * 60 * 1000;
const IDLE_CLEANUP_MS = 30 * 1000;

interface BrowserSession {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly createdAt: number;
}

let session: BrowserSession | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function isSessionValid(): boolean {
  if (!session) return false;
  return Date.now() - session.createdAt < SESSION_TTL_MS;
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (session) {
      await session.browser.close().catch(() => {});
      session = null;
    }
  }, IDLE_CLEANUP_MS);
}

async function launchBrowser(): Promise<Browser> {
  const isVercel = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isVercel) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const pw = await import('playwright-core');
    return pw.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const { chromium } = await import('playwright');
  return chromium.launch({ channel: 'chrome', headless: true });
}

async function createSession(): Promise<BrowserSession> {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();
  await page.goto(LOCATOR_PAGE, { waitUntil: 'networkidle', timeout: 12_000 });
  await page.close();

  return { browser, context, createdAt: Date.now() };
}

export async function fetchWithPlaywright(
  entityId: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  try {
    if (signal?.aborted) return null;

    if (!isSessionValid()) {
      if (session) await session.browser.close().catch(() => {});
      session = await createSession();
    }

    resetIdleTimer();

    const page = await session!.context.newPage();

    try {
      const result = await page.evaluate(
        async (eid: string) => {
          const res = await fetch(`/vn_en/get-locator/${eid}`, {
            headers: {
              Accept: 'application/json, text/javascript, */*; q=0.01',
              'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
          });

          if (!res.ok) return null;

          const text = await res.text();
          if (text.includes('IM_UNDER_ATTACK') || text.includes('challenge-platform')) {
            return null;
          }

          return JSON.parse(text);
        },
        entityId,
      );

      return result as Record<string, unknown> | null;
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    console.error('Playwright fetch error:', err);
    if (session) {
      await session.browser.close().catch(() => {});
      session = null;
    }
    return null;
  }
}
