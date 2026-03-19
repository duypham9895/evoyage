/**
 * Local test for the refresh-vinfast cron job.
 * Tests the full flow: Cloudflare bypass → API fetch → batched DB sync.
 *
 * Run: npx tsx scripts/test-refresh-vinfast.ts
 */
import { PrismaClient } from '@prisma/client';
import { Impit } from 'impit';

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

const LOCATOR_PAGE = 'https://vinfastauto.com/vn_vi/tim-kiem-showroom-tram-sac';
const LOCATORS_API = 'https://vinfastauto.com/vn_vi/get-locators';

const API_HEADERS = {
  accept: 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-US,en;q=0.9',
  referer: LOCATOR_PAGE,
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'x-requested-with': 'XMLHttpRequest',
} as const;

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
  const startTime = Date.now();
  console.log('=== VinFast Cron Local Test (Batched) ===\n');

  // Step 1: Cloudflare bypass + API fetch
  console.log('Step 1: Bypassing Cloudflare...');
  const client = new Impit({ browser: 'chrome' });

  const pageResp = await client.fetch(LOCATOR_PAGE, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  console.log(`  Locator page: ${pageResp.status}`);
  await pageResp.text();

  console.log('Step 2: Fetching get-locators...');
  const apiResp = await client.fetch(LOCATORS_API, { headers: API_HEADERS });
  console.log(`  API response: ${apiResp.status}`);

  const text = await apiResp.text();
  if (text.includes('IM_UNDER_ATTACK') || text.includes('challenge-platform')) {
    console.error('BLOCKED by Cloudflare. Aborting.');
    return;
  }

  const json = JSON.parse(text) as { data: VinFastLocatorStation[] };
  const allStations = json.data;
  console.log(`  Total stations from API: ${allStations.length}`);

  // Filter
  const valid = allStations.filter((s) => {
    if (s.category_slug !== 'car_charging_station') return false;
    if (!s.charging_publish) return false;
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lng);
    if (isNaN(lat) || isNaN(lng)) return false;
    return isInVietnam(lat, lng);
  });
  console.log(`  Car charging stations (filtered): ${valid.length}`);

  // Status breakdown
  const statuses: Record<string, number> = {};
  for (const s of valid) {
    statuses[s.charging_status] = (statuses[s.charging_status] || 0) + 1;
  }
  console.log('  Status breakdown:', statuses);

  // Step 3: Batched DB sync
  console.log('\nStep 3: Syncing to database (batched)...');

  const existing = await prisma.chargingStation.findMany({
    where: { provider: 'VinFast' },
    select: { id: true, ocmId: true, entityId: true },
  });
  console.log(`  Existing VinFast stations in DB: ${existing.length}`);

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
        return prisma.chargingStation.update({
          where: { id: existingEntry.id },
          data,
        });
      } else {
        created++;
        return prisma.chargingStation.create({ data });
      }
    });

    await prisma.$transaction(ops);
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toProcess.length / BATCH_SIZE)} done (${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length})`);
  }

  // Sync mappings
  console.log('\nStep 4: Syncing entity_id mappings...');
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

  const totalInDb = await prisma.chargingStation.count({ where: { provider: 'VinFast' } });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== Results ===');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (OUTOFSERVICE): ${skippedOutOfService}`);
  console.log(`  Mappings saved: ${mappingsSaved}`);
  console.log(`  Total VinFast in DB: ${totalInDb}`);
  console.log(`  Elapsed: ${elapsed}s`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
