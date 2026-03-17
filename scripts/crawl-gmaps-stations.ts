/**
 * Comprehensive Google Maps EV charging station crawler for Vietnam.
 * Searches all 63 provinces + districts in major cities.
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
  readonly provider: string;
  readonly isVinFast: boolean;
}

// All 63 provinces/cities of Vietnam
const VIETNAM_PROVINCES = [
  // Major cities (search with districts for more coverage)
  'Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ',
  // Northern Vietnam
  'Hà Giang', 'Cao Bằng', 'Bắc Kạn', 'Tuyên Quang', 'Lào Cai',
  'Điện Biên', 'Lai Châu', 'Sơn La', 'Yên Bái', 'Hoà Bình',
  'Thái Nguyên', 'Lạng Sơn', 'Quảng Ninh', 'Bắc Giang', 'Phú Thọ',
  'Vĩnh Phúc', 'Bắc Ninh', 'Hải Dương', 'Hưng Yên', 'Thái Bình',
  'Hà Nam', 'Nam Định', 'Ninh Bình',
  // Central Vietnam
  'Thanh Hoá', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị',
  'Thừa Thiên Huế', 'Quảng Nam', 'Quảng Ngãi', 'Bình Định',
  'Phú Yên', 'Khánh Hoà', 'Ninh Thuận', 'Bình Thuận',
  // Central Highlands
  'Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng',
  // Southern Vietnam
  'Bình Phước', 'Tây Ninh', 'Bình Dương', 'Đồng Nai',
  'Bà Rịa Vũng Tàu', 'Long An', 'Tiền Giang', 'Bến Tre',
  'Trà Vinh', 'Vĩnh Long', 'Đồng Tháp', 'An Giang', 'Kiên Giang',
  'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau',
];

// District-level searches for major cities (Google Maps limits to ~60 per search)
const HCM_DISTRICTS = [
  'Quận 1', 'Quận 3', 'Quận 4', 'Quận 5', 'Quận 6', 'Quận 7', 'Quận 8',
  'Quận 10', 'Quận 11', 'Quận 12', 'Bình Thạnh', 'Gò Vấp', 'Phú Nhuận',
  'Tân Bình', 'Tân Phú', 'Bình Tân', 'Thủ Đức', 'Nhà Bè', 'Hóc Môn',
  'Củ Chi', 'Cần Giờ',
];

const HANOI_DISTRICTS = [
  'Ba Đình', 'Hoàn Kiếm', 'Hai Bà Trưng', 'Đống Đa', 'Tây Hồ',
  'Cầu Giấy', 'Thanh Xuân', 'Hoàng Mai', 'Long Biên', 'Nam Từ Liêm',
  'Bắc Từ Liêm', 'Hà Đông', 'Gia Lâm', 'Thanh Trì', 'Đông Anh',
];

// Highway/route searches
const HIGHWAY_SEARCHES = [
  'trạm sạc xe điện cao tốc Bắc Nam',
  'trạm sạc xe điện cao tốc Long Thành',
  'trạm sạc xe điện cao tốc Phan Thiết',
  'trạm sạc xe điện cao tốc Nha Trang',
  'trạm sạc xe điện cao tốc Hà Nội Hải Phòng',
  'trạm sạc xe điện cao tốc Hà Nội Lào Cai',
  'trạm sạc xe điện quốc lộ 1A',
  'trạm sạc xe điện đường cao tốc',
  'EV charging station Vietnam expressway',
  'VinFast charging station highway Vietnam',
];

// Brand-specific searches
const BRAND_SEARCHES = [
  'VinFast charging station Vietnam',
  'trạm sạc VinFast',
  'trạm sạc EV One',
  'trạm sạc EverCharge Vietnam',
  'trạm sạc CHARGE+ Vietnam',
  'trạm sạc điện ô tô Vietnam',
  'electric vehicle charging station Vietnam',
  'EV fast charging Vietnam',
  'DC fast charger Vietnam',
];

function buildSearchQueries(): string[] {
  const queries: string[] = [];

  // Province-level searches
  for (const province of VIETNAM_PROVINCES) {
    queries.push(`trạm sạc xe điện ${province}`);
  }

  // District-level for HCM
  for (const district of HCM_DISTRICTS) {
    queries.push(`trạm sạc xe điện ${district} Hồ Chí Minh`);
  }

  // District-level for Hanoi
  for (const district of HANOI_DISTRICTS) {
    queries.push(`trạm sạc xe điện ${district} Hà Nội`);
  }

  // Highway searches
  queries.push(...HIGHWAY_SEARCHES);

  // Brand searches
  queries.push(...BRAND_SEARCHES);

  return queries;
}

function detectProvider(name: string): { provider: string; isVinFast: boolean } {
  const lower = name.toLowerCase();
  if (lower.includes('vinfast') || lower.includes('v-green')) {
    return { provider: 'VinFast', isVinFast: true };
  }
  if (lower.includes('ev one') || lower.includes('evone')) return { provider: 'EVONE', isVinFast: false };
  if (lower.includes('evercharge')) return { provider: 'EverCharge', isVinFast: false };
  if (lower.includes('charge+')) return { provider: 'CHARGE+', isVinFast: false };
  if (lower.includes('evpower')) return { provider: 'EVPower', isVinFast: false };
  if (lower.includes('evs ') || lower.includes('eves')) return { provider: 'EVS', isVinFast: false };
  if (lower.includes('pvoil')) return { provider: 'PVOIL', isVinFast: false };
  if (lower.includes('petrolimex')) return { provider: 'Petrolimex', isVinFast: false };
  return { provider: 'Other', isVinFast: false };
}

function inferProvince(lat: number): string {
  if (lat > 20.5) return 'Northern Vietnam';
  if (lat > 15.5) return 'Central Vietnam';
  if (lat > 11.5) return 'Central Highlands';
  if (lat > 10.5) return 'Southern Vietnam';
  return 'Mekong Delta';
}

// Vietnam bounding box check
function isInVietnam(lat: number, lng: number): boolean {
  return lat >= 8.0 && lat <= 23.5 && lng >= 102.0 && lng <= 110.0;
}

async function extractStationsFromPage(page: import('playwright').Page): Promise<CrawledStation[]> {
  return page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
    const results: Array<{
      name: string; lat: number; lng: number; address: string;
      provider: string; isVinFast: boolean;
    }> = [];

    for (const el of links) {
      const link = el as HTMLAnchorElement;
      const href = link.href;
      const latMatch = href.match(/!3d([\d.-]+)/);
      const lngMatch = href.match(/!4d([\d.-]+)/);
      if (!latMatch || !lngMatch) continue;

      const name = link.getAttribute('aria-label') || 'Unknown';
      const lower = name.toLowerCase();

      let provider = 'Other';
      let isVinFast = false;
      if (lower.includes('vinfast') || lower.includes('v-green')) { provider = 'VinFast'; isVinFast = true; }
      else if (lower.includes('ev one') || lower.includes('evone')) provider = 'EVONE';
      else if (lower.includes('evercharge')) provider = 'EverCharge';
      else if (lower.includes('charge+')) provider = 'CHARGE+';
      else if (lower.includes('evpower')) provider = 'EVPower';
      else if (lower.includes('pvoil')) provider = 'PVOIL';

      const article = link.closest('article') || link.parentElement?.parentElement?.parentElement;
      const text = article?.textContent || '';
      const addressMatch = text.match(/charging station\s*·?\s*([^·]*?)(?:\s*(?:Open|Closed|\+84|$))/i);
      const address = addressMatch ? addressMatch[1].trim() : '';

      results.push({
        name: name.substring(0, 100),
        lat: parseFloat(latMatch[1]),
        lng: parseFloat(lngMatch[1]),
        address: address.substring(0, 200),
        provider,
        isVinFast,
      });
    }

    return results;
  });
}

async function main() {
  const queries = buildSearchQueries();
  console.log(`🚀 Starting comprehensive Google Maps crawl: ${queries.length} searches\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'en-US',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const allStations: CrawledStation[] = [];
  const seenCoords = new Set<string>();
  let errorCount = 0;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const progress = `[${i + 1}/${queries.length}]`;

    try {
      await page.goto(
        `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
        { waitUntil: 'domcontentloaded', timeout: 20000 },
      );
      await page.waitForTimeout(2500);

      // Scroll to load more results
      const feed = page.locator('div[role="feed"]');
      if (await feed.count() > 0) {
        for (let scroll = 0; scroll < 10; scroll++) {
          await feed.evaluate((el: HTMLElement) => el.scrollTop = el.scrollHeight);
          await page.waitForTimeout(1200);

          // Check if we hit "end of results"
          const endText = await page.locator('text="You\'ve reached the end of the list"').count();
          if (endText > 0) break;
        }
      }

      const stations = await extractStationsFromPage(page);

      let newCount = 0;
      for (const s of stations) {
        if (!isInVietnam(s.lat, s.lng)) continue;

        const key = `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
        if (!seenCoords.has(key)) {
          seenCoords.add(key);
          allStations.push(s);
          newCount++;
        }
      }

      if (newCount > 0) {
        console.log(`${progress} ${query} → +${newCount} new (total: ${allStations.length})`);
      }

      // Respectful delay
      await page.waitForTimeout(1500 + Math.random() * 1500);
    } catch {
      errorCount++;
      if (errorCount > 10) {
        console.log('⚠ Too many errors, waiting 30s...');
        await page.waitForTimeout(30000);
        errorCount = 0;
      }
    }
  }

  await browser.close();

  console.log(`\n📊 Total unique Vietnam stations: ${allStations.length}`);
  console.log('💾 Seeding into database...\n');

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
    if (seeded % 100 === 0) console.log(`  Seeded ${seeded}/${allStations.length}...`);
  }

  const total = await prisma.chargingStation.count();
  const vinfast = await prisma.chargingStation.count({ where: { isVinFastOnly: true } });
  console.log(`\n✅ Done! Seeded ${seeded} Google Maps stations.`);
  console.log(`📍 Total in DB: ${total} (VinFast: ${vinfast}, Universal: ${total - vinfast})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
