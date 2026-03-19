import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCronSecret } from '@/lib/cron-auth';

/**
 * GET /api/cron/refresh-vinfast — Vercel Cron endpoint.
 * Fetches VinFast car charging stations from the official VinFast locator API.
 * Uses ScraperAPI to bypass Cloudflare WAF (residential proxy + JS render).
 * Runs daily at 01:00 UTC (configured in vercel.json).
 *
 * Credit budget: 1 req/day × 25 credits = 750 credits/month (free plan: 1,000).
 */

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
  readonly district_id?: string;
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

/**
 * Fetch all stations from VinFast locator API via ScraperAPI (Cloudflare bypass).
 * Uses premium residential proxy + JS render to bypass WAF 403 blocks.
 * Costs 25 credits per request (free plan: 1,000 credits/month).
 */
async function fetchVinFastLocators(): Promise<VinFastLocatorStation[]> {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    throw new Error('SCRAPER_API_KEY environment variable is not set');
  }

  const scraperUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(LOCATORS_API)}&render=true&premium=true`;

  const resp = await fetch(scraperUrl, {
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    throw new Error(`ScraperAPI request failed: ${resp.status} ${resp.statusText}`);
  }

  const text = await resp.text();

  if (text.includes('Attention Required') || text.includes('challenge-platform')) {
    throw new Error('ScraperAPI failed to bypass Cloudflare');
  }

  const json = JSON.parse(text) as { data: VinFastLocatorStation[] };
  if (!json.data || !Array.isArray(json.data)) {
    throw new Error('Unexpected response format from VinFast API');
  }

  return json.data;
}

/**
 * Build station data object from API response item.
 */
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
 * Process stations in batched Prisma transactions for performance.
 */
async function syncStationsBatched(
  valid: VinFastLocatorStation[],
  existingByOcmId: Map<string, { id: string }>,
  existingByEntityId: Map<string, { id: string }>,
) {
  let created = 0;
  let updated = 0;
  let skippedOutOfService = 0;

  // Filter out OUTOFSERVICE, build operations
  const toProcess = valid.filter((s) => {
    if (s.charging_status === 'OUTOFSERVICE') {
      skippedOutOfService++;
      return false;
    }
    return true;
  });

  // Process in batches
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
  }

  return { created, updated, skippedOutOfService };
}

/**
 * Save entity_id → store_id mappings in batched transactions.
 */
async function syncMappingsBatched(valid: VinFastLocatorStation[]): Promise<number> {
  const withIds = valid.filter((s) => s.entity_id && s.store_id);
  let saved = 0;

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
    saved += batch.length;
  }

  return saved;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const allStations = await fetchVinFastLocators();

    // Filter: car charging stations, published, within Vietnam bounds
    const valid = allStations.filter((s) => {
      if (s.category_slug !== 'car_charging_station') return false;
      if (!s.charging_publish) return false;
      const lat = parseFloat(s.lat);
      const lng = parseFloat(s.lng);
      if (isNaN(lat) || isNaN(lng)) return false;
      return isInVietnam(lat, lng);
    });

    // Load existing VinFast stations for dedup (only id, ocmId, entityId)
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

    // Sync stations in batches of 500
    const { created, updated, skippedOutOfService } = await syncStationsBatched(
      valid,
      existingByOcmId,
      existingByEntityId,
    );

    // Sync entity_id → store_id mappings in batches
    const mappingsSaved = await syncMappingsBatched(valid);

    return NextResponse.json({
      success: true,
      source: 'vinfastauto.com/vn_vi/get-locators',
      totalFromAPI: allStations.length,
      carChargingStations: valid.length,
      created,
      updated,
      skippedOutOfService,
      mappingsSaved,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('VinFast refresh error:', error);
    return NextResponse.json(
      { error: 'VinFast refresh failed', detail: String(error) },
      { status: 500 },
    );
  }
}
