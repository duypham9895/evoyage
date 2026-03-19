/**
 * Crawl VinFast charging stations from vinfastauto.com using Playwright.
 *
 * Uses a real Chromium browser to navigate the locator page (solving any
 * Cloudflare JS challenges), then calls the get-locators API from the
 * browser context with valid CF cookies.
 *
 * Designed to run on GitHub Actions (ubuntu-latest, free tier).
 *
 * Run: npx tsx scripts/crawl-vinfast-stations.ts
 */
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const prisma = new PrismaClient();

const LOCATOR_PAGE = 'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac';
const BATCH_SIZE = 2000;

interface VinFastLocatorStation {
  readonly entity_id: string;
  readonly store_id: string;
  readonly code: string;
  readonly name: string;
  readonly address: string;
  readonly lat: string;
  readonly lng: string;
  readonly hotline: string;
  readonly province_id: string;
  readonly access_type: string;
  readonly party_id: string;
  readonly charging_publish: boolean;
  readonly charging_status: string;
  readonly category_name: string;
  readonly category_slug: string;
  readonly hotline_xdv: string;
  readonly open_time_service: string;
  readonly close_time_service: string;
  readonly parking_fee: boolean;
  readonly has_link: boolean;
  readonly marker_icon: string;
}

function isInVietnam(lat: number, lng: number): boolean {
  return lat >= 8.0 && lat <= 23.5 && lng >= 102.0 && lng <= 110.0;
}

function buildOperatingHours(open: string, close: string): string | null {
  if (open === '00:00' && close === '23:59') return '24/7';
  if (open && close) return `${open} - ${close}`;
  return null;
}

function inferProvince(lat: number): string {
  if (lat > 20.5) return 'Northern Vietnam';
  if (lat > 15.5) return 'Central Vietnam';
  if (lat > 11.5) return 'Central Highlands';
  if (lat > 10.5) return 'Southern Vietnam';
  return 'Mekong Delta';
}

async function fetchVinFastLocators(): Promise<VinFastLocatorStation[]> {
  console.log('  Launching Chromium browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  try {
    const page = await context.newPage();

    console.log('  Navigating to locator page (solving CF challenge)...');
    await page.goto(LOCATOR_PAGE, { waitUntil: 'networkidle', timeout: 30_000 });
    console.log('  Page loaded:', await page.title());

    console.log('  Calling get-locators API from browser context...');
    const result = await page.evaluate(async () => {
      const res = await fetch('/vn_vi/get-locators', {
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
      });

      if (!res.ok) return { error: true, status: res.status };

      const text = await res.text();
      if (text.includes('IM_UNDER_ATTACK') || text.includes('challenge-platform')) {
        return { error: true, status: -1 };
      }

      return JSON.parse(text);
    });

    if ('error' in result) {
      throw new Error(`VinFast API call failed with status: ${(result as { status: number }).status}`);
    }

    const json = result as { data: VinFastLocatorStation[] };
    if (!json.data || !Array.isArray(json.data)) {
      throw new Error('Unexpected response format from VinFast API');
    }

    return json.data;
  } finally {
    await browser.close();
  }
}

function buildStationData(s: VinFastLocatorStation) {
  const lat = parseFloat(s.lat);
  const lng = parseFloat(s.lng);
  return {
    ocmId: `vinfast-${s.store_id}`,
    name: s.name,
    address: s.address,
    province: s.province_id || inferProvince(lat),
    latitude: lat,
    longitude: lng,
    chargerTypes: JSON.stringify(['DC_150kW', 'AC_11kW']),
    connectorTypes: JSON.stringify(['CCS2', 'Type2_AC']),
    portCount: 4,
    maxPowerKw: 150,
    stationType: s.access_type === 'Restricted' ? 'restricted' : 'public',
    isVinFastOnly: true,
    provider: 'VinFast',
    operatingHours: buildOperatingHours(s.open_time_service, s.close_time_service),
    scrapedAt: new Date(),
    entityId: s.entity_id,
    stationCode: s.code,
    storeId: s.store_id,
    hotline: s.hotline || null,
    hotlineService: s.hotline_xdv || null,
    chargingStatus: s.charging_status,
    parkingFee: s.parking_fee,
    accessType: s.access_type,
    partyId: s.party_id,
    hasLink: s.has_link ?? false,
    categoryName: s.category_name,
    categorySlug: s.category_slug,
    markerIcon: s.marker_icon || null,
    rawData: JSON.stringify(s),
  };
}

/**
 * Bulk upsert stations using raw SQL INSERT ... ON CONFLICT.
 * ~100x faster than individual Prisma operations over network.
 */
async function bulkUpsertStations(
  stations: VinFastLocatorStation[],
  existingByOcmId: Map<string, string>,
  existingByEntityId: Map<string, string>,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (let i = 0; i < stations.length; i += BATCH_SIZE) {
    const batch = stations.slice(i, i + BATCH_SIZE);

    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const s of batch) {
      const data = buildStationData(s);
      const existingId =
        existingByOcmId.get(data.ocmId) ?? existingByEntityId.get(s.entity_id);

      if (existingId) {
        updated++;
      } else {
        created++;
      }

      const id = existingId ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

      values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::double precision, $${paramIdx++}::double precision, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::int, $${paramIdx++}::double precision, $${paramIdx++}, $${paramIdx++}::boolean, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::timestamptz, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::boolean, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::boolean, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);

      params.push(
        id, data.ocmId, data.name, data.address, data.province,
        data.latitude, data.longitude, data.chargerTypes, data.connectorTypes,
        data.portCount, data.maxPowerKw, data.stationType, data.isVinFastOnly,
        data.provider, data.operatingHours, data.scrapedAt,
        data.entityId, data.stationCode, data.storeId, data.hotline,
        data.hotlineService, data.chargingStatus, data.parkingFee,
        data.accessType, data.partyId, data.hasLink,
        data.categoryName, data.categorySlug, data.markerIcon, data.rawData,
      );
    }

    const sql = `
      INSERT INTO "ChargingStation" (
        "id", "ocmId", "name", "address", "province",
        "latitude", "longitude", "chargerTypes", "connectorTypes",
        "portCount", "maxPowerKw", "stationType", "isVinFastOnly",
        "provider", "operatingHours", "scrapedAt",
        "entityId", "stationCode", "storeId", "hotline",
        "hotlineService", "chargingStatus", "parkingFee",
        "accessType", "partyId", "hasLink",
        "categoryName", "categorySlug", "markerIcon", "rawData"
      ) VALUES ${values.join(', ')}
      ON CONFLICT ("ocmId") DO UPDATE SET
        "name" = EXCLUDED."name",
        "address" = EXCLUDED."address",
        "province" = EXCLUDED."province",
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude",
        "chargerTypes" = EXCLUDED."chargerTypes",
        "connectorTypes" = EXCLUDED."connectorTypes",
        "portCount" = EXCLUDED."portCount",
        "maxPowerKw" = EXCLUDED."maxPowerKw",
        "stationType" = EXCLUDED."stationType",
        "operatingHours" = EXCLUDED."operatingHours",
        "scrapedAt" = EXCLUDED."scrapedAt",
        "entityId" = EXCLUDED."entityId",
        "stationCode" = EXCLUDED."stationCode",
        "storeId" = EXCLUDED."storeId",
        "hotline" = EXCLUDED."hotline",
        "hotlineService" = EXCLUDED."hotlineService",
        "chargingStatus" = EXCLUDED."chargingStatus",
        "parkingFee" = EXCLUDED."parkingFee",
        "accessType" = EXCLUDED."accessType",
        "partyId" = EXCLUDED."partyId",
        "hasLink" = EXCLUDED."hasLink",
        "categoryName" = EXCLUDED."categoryName",
        "categorySlug" = EXCLUDED."categorySlug",
        "markerIcon" = EXCLUDED."markerIcon",
        "rawData" = EXCLUDED."rawData"
    `;

    await prisma.$executeRawUnsafe(sql, ...params);
    const processed = Math.min(i + BATCH_SIZE, stations.length);
    console.log(`  ${processed}/${stations.length} stations processed`);
  }

  return { created, updated };
}

async function main() {
  console.log('=== VinFast Station Crawl ===\n');

  // Step 1: Fetch from VinFast
  console.log('[1/3] Fetching stations from vinfastauto.com...');
  const allStations = await fetchVinFastLocators();
  console.log(`  Total from API: ${allStations.length}`);

  // Step 2: Filter valid car charging stations
  const valid = allStations.filter((s) => {
    if (s.category_slug !== 'car_charging_station') return false;
    if (!s.charging_publish) return false;
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lng);
    if (isNaN(lat) || isNaN(lng)) return false;
    return isInVietnam(lat, lng);
  });

  let skippedOutOfService = 0;
  const toProcess = valid.filter((s) => {
    if (s.charging_status === 'OUTOFSERVICE') {
      skippedOutOfService++;
      return false;
    }
    return true;
  });
  console.log(`  Car charging stations in Vietnam: ${valid.length} (${skippedOutOfService} out of service)`);

  // Step 3: Bulk upsert stations
  console.log('\n[2/3] Syncing stations to database (bulk upsert)...');
  const existing = await prisma.chargingStation.findMany({
    where: { provider: 'VinFast' },
    select: { id: true, ocmId: true, entityId: true },
  });

  const existingByOcmId = new Map(
    existing.filter((e) => e.ocmId).map((e) => [e.ocmId!, e.id]),
  );
  const existingByEntityId = new Map(
    existing.filter((e) => e.entityId).map((e) => [e.entityId!, e.id]),
  );

  const { created, updated } = await bulkUpsertStations(toProcess, existingByOcmId, existingByEntityId);

  // Step 4: Sync entity_id → store_id mappings (bulk)
  console.log('\n[3/3] Syncing entity mappings...');
  const withIds = valid.filter((s) => s.entity_id && s.store_id);
  let mappingsSaved = 0;

  for (let i = 0; i < withIds.length; i += BATCH_SIZE) {
    const batch = withIds.slice(i, i + BATCH_SIZE);

    const mValues: string[] = [];
    const mParams: unknown[] = [];
    let mIdx = 1;

    for (const s of batch) {
      mValues.push(`($${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}::timestamptz)`);
      mParams.push(s.entity_id, s.store_id, '{}', new Date(0));
    }

    await prisma.$executeRawUnsafe(`
      INSERT INTO "VinFastStationDetail" ("entityId", "storeId", "detail", "fetchedAt")
      VALUES ${mValues.join(', ')}
      ON CONFLICT ("entityId") DO UPDATE SET "storeId" = EXCLUDED."storeId"
    `, ...mParams);

    mappingsSaved += batch.length;
  }

  console.log('\n=== Summary ===');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (out of service): ${skippedOutOfService}`);
  console.log(`  Mappings saved: ${mappingsSaved}`);
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
