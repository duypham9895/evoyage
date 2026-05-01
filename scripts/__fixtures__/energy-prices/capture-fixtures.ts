/**
 * One-shot helper to capture realistic HTML/JSON fixtures from the live
 * Petrolimex / V-GREEN / EVN pages. Run when the upstream layout changes.
 *
 * Run: npx tsx scripts/__fixtures__/energy-prices/capture-fixtures.ts
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

async function capturePetrolimex() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  await page.goto('https://www.petrolimex.com.vn/index.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  // Wait for the price widget to populate via the VIEApps fetch
  await page.waitForFunction(
    () => Array.isArray((window as unknown as { __vieapps?: { prices?: { products?: unknown[] } } }).__vieapps?.prices?.products) &&
      ((window as unknown as { __vieapps: { prices: { products: unknown[] } } }).__vieapps.prices.products.length > 0),
    { timeout: 60_000 },
  );
  const data = await page.evaluate(() => {
    const w = window as unknown as {
      __vieapps: {
        prices: {
          products: Array<{
            ID: string;
            Title: string;
            EnglishTitle: string;
            Zone1Price: number;
            Zone2Price: number;
            OrderIndex: number;
            LastModified: string;
          }>;
        };
      };
    };
    return {
      products: w.__vieapps.prices.products,
      capturedAt: new Date().toISOString(),
    };
  });
  writeFileSync(
    resolve(FIXTURE_DIR, 'petrolimex.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
  console.log(`[petrolimex] captured ${data.products.length} products`);
  await browser.close();
}

async function captureVGreen() {
  const res = await fetch('https://vgreen.net/vi/cau-hoi-thuong-gap', {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`V-GREEN fetch failed: ${res.status}`);
  const html = await res.text();
  writeFileSync(resolve(FIXTURE_DIR, 'vgreen-faq.html'), html, 'utf8');
  console.log(`[vgreen] captured ${html.length} bytes`);
}

async function captureEvn() {
  // The English version is a static HTML table; the Vietnamese page is just a
  // list of price-decision links and doesn't contain the tier numbers itself.
  const res = await fetch(
    'https://en.evn.com.vn/d6/news/RETAIL-ELECTRICITY-TARIFF-9-28-252.aspx',
    { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } },
  );
  if (!res.ok) throw new Error(`EVN fetch failed: ${res.status}`);
  const html = await res.text();
  writeFileSync(resolve(FIXTURE_DIR, 'evn-tariff.html'), html, 'utf8');
  console.log(`[evn] captured ${html.length} bytes`);
}

async function safe(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[${label}] failed:`, (err as Error).message);
  }
}

async function main() {
  await Promise.all([
    safe('petrolimex', capturePetrolimex),
    safe('vgreen', captureVGreen),
    safe('evn', captureEvn),
  ]);
  console.log('Fixture capture finished.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
