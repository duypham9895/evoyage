/**
 * Crawl VinFast charging stations from vinfastauto.com using impit.
 *
 * Uses impit for Chrome TLS fingerprint impersonation to bypass Cloudflare.
 * Designed to run on GitHub Actions (ubuntu-latest, free tier).
 *
 * Flow: visit locator page → collect CF cookies → call get-locators API → upsert DB.
 *
 * Run: npx tsx scripts/crawl-vinfast-stations.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LOCATOR_PAGE = 'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac';
const LOCATORS_API = 'https://vinfastauto.com/vn_vi/get-locators';
const BATCH_SIZE = 500;

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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Impit } = require('impit');
  const client = new Impit({ browser: 'chrome' });

  console.log('  Visiting locator page for CF cookies...');
  const pageResp = await client.fetch(LOCATOR_PAGE, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
    },
  });

  if (!pageResp.ok) {
    throw new Error(`Cloudflare cookie collection failed: ${pageResp.status}`);
  }
  await pageResp.text();

  console.log('  Calling get-locators API...');
  const apiResp = await client.fetch(LOCATORS_API, {
    headers: {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'en-US,en;q=0.9',
      referer: LOCATOR_PAGE,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-requested-with': 'XMLHttpRequest',
    },
  });

  if (!apiResp.ok) {
    throw new Error(`VinFast locators API failed: ${apiResp.status}`);
  }

  const text = await apiResp.text();

  if (text.includes('::IM_UNDER_ATTACK_BOX::') || text.includes('challenge-platform')) {
    throw new Error('Blocked by Cloudflare challenge');
  }

  const json = JSON.parse(text) as { data: VinFastLocatorStation[] };
  return json.data;
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
  console.log(`  Car charging stations in Vietnam: ${valid.length}`);

  // Step 3: Load existing for dedup
  console.log('\n[2/3] Syncing stations to database...');
  const existing = await prisma.chargingStation.findMany({
    where: { provider: 'VinFast' },
    select: { id: true, ocmId: true, entityId: true },
  });

  const existingByOcmId = new Map(
    existing.filter((e) => e.ocmId).map((e) => [e.ocmId!, { id: e.id }]),
  );
  const existingByEntityId = new Map(
    existing.filter((e) => e.entityId).map((e) => [e.entityId!, { id: e.id }]),
  );

  let created = 0;
  let updated = 0;
  let skippedOutOfService = 0;

  const toProcess = valid.filter((s) => {
    if (s.charging_status === 'OUTOFSERVICE') {
      skippedOutOfService++;
      return false;
    }
    return true;
  });

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);

    const ops = batch.map((s) => {
      const data = buildStationData(s);
      const existingEntry =
        existingByOcmId.get(data.ocmId) ?? existingByEntityId.get(s.entity_id);

      if (existingEntry) {
        updated++;
        return prisma.chargingStation.update({ where: { id: existingEntry.id }, data });
      } else {
        created++;
        return prisma.chargingStation.create({ data });
      }
    });

    await prisma.$transaction(ops);
    const processed = Math.min(i + BATCH_SIZE, toProcess.length);
    console.log(`  ${processed}/${toProcess.length} stations processed`);
  }

  // Step 4: Sync entity_id → store_id mappings
  console.log('\n[3/3] Syncing entity mappings...');
  const withIds = valid.filter((s) => s.entity_id && s.store_id);
  let mappingsSaved = 0;

  for (let i = 0; i < withIds.length; i += BATCH_SIZE) {
    const batch = withIds.slice(i, i + BATCH_SIZE);

    const ops = batch.map((s) =>
      prisma.vinFastStationDetail.upsert({
        where: { entityId: s.entity_id },
        update: { storeId: s.store_id },
        create: {
          entityId: s.entity_id,
          storeId: s.store_id,
          detail: '{}',
          fetchedAt: new Date(0),
        },
      }),
    );

    await prisma.$transaction(ops);
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
