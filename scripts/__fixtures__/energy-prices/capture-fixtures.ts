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

// EVN has no stable article identity: it reused article id 252 for a reseller
// (wholesale) price list after the 2892/QD-BCT restructure. Each capture target
// is therefore pinned to the fixture role it plays in the tests, and article 252
// may only ever write the NEGATIVE fixture — the one the parser must reject.
// `evn-tariff-1279.html` is deliberately absent: that article no longer exists
// upstream and the committed fixture is the only copy. Never recapture it.
const EVN_CAPTURES: ReadonlyArray<{ readonly url: string; readonly file: string }> = [
  {
    // Positive: residential retail tariff, Decision 2892/QD-BCT (5 tiers).
    url: 'https://en.evn.com.vn/d/en-US/news/Retail-Electricity-Tariffs-by-Customer-Categories-Decision-No-2892QD-BCT-dated-October-31-2026-issued-by-Ministry-of-Industry-and-Trade-60-28-501776',
    file: 'evn-tariff-2892.html',
  },
  {
    // Negative: prices EVN charges resellers. Must fail the residential anchor.
    url: 'https://en.evn.com.vn/d6/news/RETAIL-ELECTRICITY-TARIFF-9-28-252.aspx',
    file: 'evn-reseller-2892.html',
  },
  {
    // Discovery: the Electricity Tariff archive listing (category 60-28).
    url: 'https://en.evn.com.vn/en-US/news-l/Electricity-Tariff-60-28',
    file: 'evn-listing.html',
  },
];

async function captureEvn() {
  for (const { url, file } of EVN_CAPTURES) {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) throw new Error(`EVN fetch failed for ${file}: ${res.status}`);
    const html = await res.text();
    writeFileSync(resolve(FIXTURE_DIR, file), html, 'utf8');
    console.log(`[evn] captured ${html.length} bytes → ${file}`);
  }
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
