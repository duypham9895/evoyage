/**
 * Batch-fetch VinFast station detail for ALL car charging stations.
 * Enriches ChargingStation records with real OCPI data (connectors, power, ports).
 * Caches full detail in VinFastStationDetail table.
 *
 * Optimizations:
 * - Single finaldivision API call for entity_id mapping
 * - Reuses impit CF session across batches (re-acquire every 50 requests)
 * - Skips already-enriched stations (resume-safe)
 * - Parallel batch of 5 concurrent requests
 *
 * Run: npx tsx scripts/enrich-vinfast-detail.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VINFAST_API = 'https://api.service.finaldivision.com/stations/charging-stations';
const LOCATOR_PAGE = 'https://vinfastauto.com/vn_en/tim-kiem-showroom-tram-sac';
const DETAIL_URL_PREFIX = 'https://vinfastauto.com/vn_en/get-locator/';

const DETAIL_HEADERS = {
  accept: 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-US,en;q=0.9',
  referer: LOCATOR_PAGE,
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'x-requested-with': 'XMLHttpRequest',
};

interface ConnectorInfo {
  readonly standard: string;
  readonly powerType: string;
  readonly maxPowerWatts: number;
}

interface ParsedDetail {
  readonly entityId: string;
  readonly storeId: string;
  readonly connectors: readonly ConnectorInfo[];
  readonly connectorTypes: readonly string[];
  readonly chargerTypes: readonly string[];
  readonly maxPowerKw: number;
  readonly portCount: number;
  readonly is24h: boolean;
  readonly depotStatus: string;
  readonly parkingFee: boolean;
  readonly province: string;
  readonly district: string;
  readonly commune: string;
  readonly imageCount: number;
  readonly rawJson: string;
}

function parseConnectorStandard(standard: string): string {
  const map: Record<string, string> = {
    IEC_62196_T2: 'Type2_AC',
    IEC_62196_T2_COMBO: 'CCS2',
    CHADEMO: 'CHAdeMO',
    IEC_62196_T1: 'Type1',
    IEC_62196_T1_COMBO: 'CCS1',
  };
  return map[standard] ?? standard;
}

function parseDetailJson(text: string, entityId: string, storeId: string): ParsedDetail | null {
  if (text.includes('::IM_UNDER_ATTACK_BOX::') || text.includes('challenge-platform')) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }

  const outer = raw.data as Record<string, unknown> | undefined;
  if (!outer) return null;
  const inner = outer.data as Record<string, unknown> | undefined;
  if (!inner) return null;

  const evses = (inner.evses as Array<Record<string, unknown>> | undefined) ?? [];
  const images = (inner.images as Array<Record<string, string>> | undefined) ?? [];
  const extraData = (inner.extra_data as Record<string, unknown> | undefined) ?? {};
  const openingTimes = (inner.opening_times as Record<string, unknown> | undefined) ?? {};

  const connectors: ConnectorInfo[] = [];
  const connectorSet = new Set<string>();
  const chargerSet = new Set<string>();
  let maxPower = 0;

  for (const evse of evses) {
    const conns = (evse.connectors as Array<Record<string, unknown>> | undefined) ?? [];
    for (const c of conns) {
      const standard = parseConnectorStandard(String(c.standard ?? ''));
      const powerWatts = Number(c.max_electric_power ?? 0);
      const powerKw = powerWatts / 1000;

      connectors.push({
        standard,
        powerType: String(c.power_type ?? ''),
        maxPowerWatts: powerWatts,
      });

      connectorSet.add(standard);
      if (powerKw > 0) {
        chargerSet.add(powerKw >= 20 ? `DC_${Math.round(powerKw)}kW` : `AC_${Math.round(powerKw)}kW`);
      }
      if (powerWatts > maxPower) maxPower = powerWatts;
    }
  }

  // Filter images to only VinFast CDN
  const safeImages = images.filter(
    (img) => typeof img.url === 'string' && img.url.startsWith('https://') && img.url.includes('vinfastauto.com'),
  );

  return {
    entityId,
    storeId,
    connectors,
    connectorTypes: [...connectorSet],
    chargerTypes: [...chargerSet],
    maxPowerKw: maxPower > 0 ? maxPower / 1000 : 0,
    portCount: evses.length,
    is24h: openingTimes.twentyfourseven === true,
    depotStatus: String(extraData.depot_status ?? outer.charging_status ?? 'unknown'),
    parkingFee: (extraData.parking_fee ?? outer.parking_fee) === true,
    province: String(inner.province ?? inner.state ?? ''),
    district: String(inner.district ?? ''),
    commune: String(inner.commune ?? ''),
    imageCount: safeImages.length,
    rawJson: text.length > 100_000 ? '{}' : text,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createImpitSession(): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('impit');
  const client = new mod.Impit({ browser: 'chrome' });

  // Visit main page to get CF cookies
  const resp = await client.fetch(LOCATOR_PAGE, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
  await resp.text();

  if (!resp.ok) {
    throw new Error(`Failed to get CF cookies: ${resp.status}`);
  }

  return client;
}

async function fetchDetail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  entityId: string,
): Promise<string | null> {
  try {
    const resp = await client.fetch(`${DETAIL_URL_PREFIX}${entityId}`, {
      headers: DETAIL_HEADERS,
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== VinFast Station Detail Enrichment ===\n');

  // Step 1: Get entity_id → store_id mappings
  console.log('[1/4] Fetching entity_id mappings from finaldivision API...');
  const resp = await fetch(VINFAST_API, {
    headers: { 'Accept-Encoding': 'gzip, deflate' },
    signal: AbortSignal.timeout(60_000),
  });
  const allStations: Array<{ entity_id: string; store_id: string }> = await resp.json();
  const storeToEntity = new Map<string, string>();
  for (const s of allStations) {
    storeToEntity.set(s.store_id, s.entity_id);
  }
  console.log(`  Mapped ${storeToEntity.size} store_id → entity_id pairs`);

  // Step 2: Find VinFast stations that need enrichment
  console.log('\n[2/4] Finding stations to enrich...');
  const dbStations = await prisma.chargingStation.findMany({
    where: { provider: 'VinFast', ocmId: { startsWith: 'vinfast-' } },
    select: { id: true, ocmId: true },
  });

  // Check which already have cached detail
  const alreadyCached = await prisma.vinFastStationDetail.findMany({
    where: { detail: { not: '{}' } },
    select: { storeId: true },
  });
  const cachedSet = new Set(alreadyCached.map((c) => c.storeId));

  const toEnrich: Array<{ id: string; storeId: string; entityId: string }> = [];
  for (const s of dbStations) {
    const storeId = s.ocmId!.replace('vinfast-', '');
    if (cachedSet.has(storeId)) continue; // already enriched
    const entityId = storeToEntity.get(storeId);
    if (!entityId) continue; // no mapping available
    toEnrich.push({ id: s.id, storeId, entityId });
  }

  console.log(`  Total VinFast stations: ${dbStations.length}`);
  console.log(`  Already enriched: ${cachedSet.size}`);
  console.log(`  To enrich: ${toEnrich.length}`);

  if (toEnrich.length === 0) {
    console.log('\n  Nothing to do!');
    return;
  }

  // Step 3: Batch-fetch detail with impit
  console.log('\n[3/4] Fetching detail from VinFast API...');
  let client = await createImpitSession();
  console.log('  CF session acquired');

  let enriched = 0;
  let failed = 0;
  let cfRefreshes = 0;
  const BATCH_SIZE = 5;
  const CF_REFRESH_INTERVAL = 50;

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    const batch = toEnrich.slice(i, i + BATCH_SIZE);

    // Refresh CF session periodically
    if (i > 0 && i % CF_REFRESH_INTERVAL === 0) {
      try {
        client = await createImpitSession();
        cfRefreshes++;
      } catch {
        console.log('  CF refresh failed, continuing with existing session');
      }
    }

    // Fetch batch in parallel
    const results = await Promise.all(
      batch.map(async (station) => {
        const text = await fetchDetail(client, station.entityId);
        if (!text) return { station, detail: null };
        const detail = parseDetailJson(text, station.entityId, station.storeId);
        return { station, detail };
      }),
    );

    // Process results
    for (const { station, detail } of results) {
      if (!detail || detail.portCount === 0) {
        failed++;
        continue;
      }

      // Update ChargingStation with real specs
      const updateData: Record<string, unknown> = {
        connectorTypes: JSON.stringify(detail.connectorTypes),
        chargerTypes: JSON.stringify(detail.chargerTypes),
        maxPowerKw: detail.maxPowerKw > 0 ? detail.maxPowerKw : undefined,
        portCount: detail.portCount,
        operatingHours: detail.is24h ? '24/7' : undefined,
      };

      // Update province with proper name if available
      if (detail.province) {
        updateData.province = detail.province;
      }

      // Only update fields that have real data
      const cleanUpdate = Object.fromEntries(
        Object.entries(updateData).filter(([, v]) => v !== undefined),
      );

      await prisma.chargingStation.update({
        where: { id: station.id },
        data: cleanUpdate,
      });

      // Cache full detail
      await prisma.vinFastStationDetail.upsert({
        where: { entityId: station.entityId },
        update: {
          storeId: station.storeId,
          detail: detail.rawJson,
          fetchedAt: new Date(),
        },
        create: {
          entityId: station.entityId,
          storeId: station.storeId,
          detail: detail.rawJson,
          fetchedAt: new Date(),
        },
      });

      enriched++;
    }

    // Progress
    const processed = Math.min(i + BATCH_SIZE, toEnrich.length);
    if (processed % 100 === 0 || processed === toEnrich.length) {
      const pct = ((processed / toEnrich.length) * 100).toFixed(1);
      console.log(
        `  ${processed}/${toEnrich.length} (${pct}%) — enriched: ${enriched}, failed: ${failed}, CF refreshes: ${cfRefreshes}`,
      );
    }

    // Small delay to be respectful
    await new Promise((r) => setTimeout(r, 200));
  }

  // Step 4: Summary
  console.log('\n[4/4] Summary');
  const totalInDb = await prisma.chargingStation.count();
  const vfCount = await prisma.chargingStation.count({ where: { provider: 'VinFast' } });
  const detailCount = await prisma.vinFastStationDetail.count({ where: { detail: { not: '{}' } } });

  console.log(`  Stations enriched: ${enriched}`);
  console.log(`  Failed to fetch: ${failed}`);
  console.log(`  CF session refreshes: ${cfRefreshes}`);
  console.log(`  Total stations in DB: ${totalInDb}`);
  console.log(`  VinFast stations: ${vfCount}`);
  console.log(`  With cached detail: ${detailCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
