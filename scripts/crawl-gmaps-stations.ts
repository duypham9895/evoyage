/**
 * Crawl EV charging stations from Google Maps for Vietnam.
 * Uses Playwright to search different cities and extract station data.
 *
 * Run: npx tsx scripts/crawl-gmaps-stations.ts
 */
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const prisma = new PrismaClient();

interface CrawledStation {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string;
  readonly rating: number | null;
  readonly isOpen24h: boolean;
  readonly provider: string;
  readonly isVinFast: boolean;
}

const SEARCH_QUERIES = [
  'trạm sạc xe điện Hồ Chí Minh',
  'trạm sạc xe điện Hà Nội',
  'trạm sạc xe điện Đà Nẵng',
  'trạm sạc xe điện Nha Trang',
  'trạm sạc xe điện Cần Thơ',
  'trạm sạc xe điện Hải Phòng',
  'trạm sạc xe điện Bình Dương',
  'trạm sạc xe điện Đồng Nai',
  'trạm sạc xe điện Quảng Ninh',
  'trạm sạc xe điện Huế',
  'trạm sạc xe điện Vũng Tàu',
  'trạm sạc xe điện Đà Lạt',
  'trạm sạc xe điện Thanh Hóa',
  'trạm sạc xe điện Nghệ An',
  'trạm sạc xe điện Quảng Nam',
  'trạm sạc xe điện Bắc Ninh',
  'trạm sạc xe điện Long An',
  'trạm sạc xe điện Khánh Hòa',
  'trạm sạc xe điện Bình Thuận',
  'trạm sạc xe điện Ninh Thuận',
  'VinFast charging station Ho Chi Minh',
  'VinFast charging station Hanoi',
  'VinFast charging station Da Nang',
  'EV charging station Vietnam highway',
];

function parseProvider(name: string): { provider: string; isVinFast: boolean } {
  const lower = name.toLowerCase();
  if (lower.includes('vinfast') || lower.includes('v-green')) {
    return { provider: 'VinFast', isVinFast: true };
  }
  if (lower.includes('ev one') || lower.includes('evone')) return { provider: 'EVONE', isVinFast: false };
  if (lower.includes('evercharge')) return { provider: 'EverCharge', isVinFast: false };
  if (lower.includes('charge+')) return { provider: 'CHARGE+', isVinFast: false };
  if (lower.includes('evpower')) return { provider: 'EVPower', isVinFast: false };
  if (lower.includes('eves') || lower.includes(' evs')) return { provider: 'EVS', isVinFast: false };
  return { provider: 'Other', isVinFast: false };
}

function inferProvince(lat: number): string {
  if (lat > 20.5) return 'Northern Vietnam';
  if (lat > 15.5) return 'Central Vietnam';
  if (lat > 11.5) return 'Central Highlands';
  if (lat > 10.5) return 'Southern Vietnam';
  return 'Mekong Delta';
}

async function extractStationsFromPage(page: import('playwright').Page): Promise<CrawledStation[]> {
  return page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
    const stations: Array<{
      name: string; lat: number; lng: number;
      address: string; rating: number | null;
      isOpen24h: boolean; provider: string; isVinFast: boolean;
    }> = [];

    for (const link of links) {
      const href = link.href;
      const latMatch = href.match(/!3d([\d.-]+)/);
      const lngMatch = href.match(/!4d([\d.-]+)/);
      if (!latMatch || !lngMatch) continue;

      const name = link.getAttribute('aria-label') || 'Unknown';
      const lower = name.toLowerCase();

      // Determine provider
      let provider = 'Other';
      let isVinFast = false;
      if (lower.includes('vinfast') || lower.includes('v-green')) {
        provider = 'VinFast'; isVinFast = true;
      } else if (lower.includes('ev one') || lower.includes('evone')) {
        provider = 'EVONE';
      } else if (lower.includes('evercharge')) {
        provider = 'EverCharge';
      } else if (lower.includes('charge+')) {
        provider = 'CHARGE+';
      }

      // Get surrounding text for address/rating
      const article = link.closest('article') || link.parentElement?.parentElement?.parentElement;
      const text = article?.textContent || '';

      const ratingMatch = text.match(/([\d.]+)\s*stars?/i);
      const isOpen24h = text.includes('Open 24 hours');

      // Try to extract address from the text between provider category and hours
      const addressParts = text.match(/charging station\s*·?\s*([^·]*?)(?:\s*(?:Open|Closed|\+84|$))/i);
      const address = addressParts ? addressParts[1].trim() : '';

      stations.push({
        name: name.substring(0, 100),
        lat: parseFloat(latMatch[1]),
        lng: parseFloat(lngMatch[1]),
        address: address.substring(0, 200),
        rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
        isOpen24h,
        provider,
        isVinFast,
      });
    }

    return stations;
  });
}

async function main() {
  console.log('🚀 Starting Google Maps EV station crawl for Vietnam...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'en-US',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const allStations: CrawledStation[] = [];
  const seenCoords = new Set<string>();

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const query = SEARCH_QUERIES[i];
    console.log(`[${i + 1}/${SEARCH_QUERIES.length}] Searching: ${query}`);

    try {
      await page.goto(
        `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
        { waitUntil: 'domcontentloaded', timeout: 20000 },
      );
      await page.waitForTimeout(3000);

      // Scroll results to load more
      const feed = page.locator('div[role="feed"]');
      if (await feed.count() > 0) {
        for (let scroll = 0; scroll < 8; scroll++) {
          await feed.evaluate((el) => el.scrollTop = el.scrollHeight);
          await page.waitForTimeout(1500);
        }
      }

      const stations = await extractStationsFromPage(page);

      let newCount = 0;
      for (const s of stations) {
        const key = `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
        if (!seenCoords.has(key)) {
          seenCoords.add(key);
          allStations.push(s);
          newCount++;
        }
      }

      console.log(`   Found ${stations.length} stations, ${newCount} new (total: ${allStations.length})`);

      // Respectful delay between searches
      await page.waitForTimeout(2000 + Math.random() * 2000);
    } catch (err) {
      console.log(`   ⚠ Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  await browser.close();

  console.log(`\n📊 Total unique stations crawled: ${allStations.length}`);
  console.log('💾 Seeding into database...\n');

  // Seed into database
  let seeded = 0;
  for (const s of allStations) {
    const gmapsId = `gmaps-${s.lat.toFixed(6)}-${s.lng.toFixed(6)}`;

    await prisma.chargingStation.upsert({
      where: { ocmId: gmapsId },
      update: {
        name: s.name,
        address: s.address || inferProvince(s.lat),
        province: s.address ? s.address.split(',').pop()?.trim() || inferProvince(s.lat) : inferProvince(s.lat),
        latitude: s.lat,
        longitude: s.lng,
        chargerTypes: JSON.stringify(['DC_50kW']),
        connectorTypes: JSON.stringify(['CCS2']),
        portCount: 2,
        maxPowerKw: 50,
        stationType: 'public',
        isVinFastOnly: s.isVinFast,
        provider: s.provider,
        scrapedAt: new Date(),
      },
      create: {
        ocmId: gmapsId,
        name: s.name,
        address: s.address || inferProvince(s.lat),
        province: s.address ? s.address.split(',').pop()?.trim() || inferProvince(s.lat) : inferProvince(s.lat),
        latitude: s.lat,
        longitude: s.lng,
        chargerTypes: JSON.stringify(['DC_50kW']),
        connectorTypes: JSON.stringify(['CCS2']),
        portCount: 2,
        maxPowerKw: 50,
        stationType: 'public',
        isVinFastOnly: s.isVinFast,
        provider: s.provider,
        scrapedAt: new Date(),
      },
    });

    seeded++;
    if (seeded % 50 === 0) console.log(`  Seeded ${seeded}/${allStations.length}...`);
  }

  const total = await prisma.chargingStation.count();
  const vinfast = await prisma.chargingStation.count({ where: { isVinFastOnly: true } });
  console.log(`\n✅ Done! Seeded ${seeded} Google Maps stations.`);
  console.log(`📍 Total stations in DB: ${total} (VinFast: ${vinfast}, Universal: ${total - vinfast})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
