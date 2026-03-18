/**
 * Crawl VinFast EV car charging stations from finaldivision API.
 * Deduplicates against existing OSM/Google Maps entries using geo-proximity matching.
 *
 * Run: npx tsx scripts/crawl-vinfast-stations.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VINFAST_CAR_API = 'https://api.service.finaldivision.com/stations/charging-stations';

interface VinFastStation {
  readonly entity_id: string;
  readonly name: string;
  readonly address: string;
  readonly code: string;
  readonly store_id: string;
  readonly lng: string;
  readonly lat: string;
  readonly hotline: string;
  readonly status: string;
  readonly province_id: string;
  readonly category_name: string;
  readonly category_slug: string;
  readonly access_type: string;
  readonly party_id: string;
  readonly charging_publish: boolean;
  readonly charging_status: string;
  readonly has_link: boolean;
  readonly parking_fee: boolean;
  readonly open_time_service: string;
  readonly close_time_service: string;
}

/**
 * Haversine distance in meters between two lat/lng points.
 * Used for geo-proximity dedup — if two stations are within DEDUP_RADIUS_M,
 * they're considered the same physical location.
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Max distance (meters) to consider two stations as duplicates */
const DEDUP_RADIUS_M = 50;

function buildOperatingHours(open: string, close: string): string | null {
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

async function main() {
  console.log('Fetching VinFast car charging stations...');

  const response = await fetch(VINFAST_CAR_API, {
    headers: { 'Accept-Encoding': 'gzip, deflate' },
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`VinFast API error: ${response.status} ${response.statusText}`);
  }

  const stations: VinFastStation[] = await response.json();
  console.log(`Received ${stations.length} stations from VinFast API`);

  // Filter: only published, car charging stations within Vietnam bounds
  const valid = stations.filter((s) => {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lng);
    if (isNaN(lat) || isNaN(lng)) return false;
    if (lat < 8.0 || lat > 23.5 || lng < 102.0 || lng > 110.0) return false;
    return s.charging_publish && s.category_slug === 'car_charging_station';
  });

  console.log(`Valid stations after filtering: ${valid.length}`);

  // Load all existing stations for geo-dedup
  const existing = await prisma.chargingStation.findMany({
    select: { id: true, ocmId: true, latitude: true, longitude: true, provider: true },
  });

  console.log(`Existing stations in DB: ${existing.length}`);

  let created = 0;
  let updatedVinfast = 0;
  let mergedDuplicates = 0;
  let skippedInactive = 0;

  for (const s of valid) {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lng);
    const vinfastOcmId = `vinfast-${s.store_id}`;

    // Skip OUTOFSERVICE stations — they add noise
    if (s.charging_status === 'OUTOFSERVICE') {
      skippedInactive++;
      continue;
    }

    const stationData = {
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
    };

    // 1. Check if this VinFast station already exists by its own ID
    const existingByOcmId = existing.find((e) => e.ocmId === vinfastOcmId);
    if (existingByOcmId) {
      await prisma.chargingStation.update({
        where: { id: existingByOcmId.id },
        data: stationData,
      });
      updatedVinfast++;
      continue;
    }

    // 2. Check for nearby duplicate from other sources (OSM, Google Maps)
    const nearbyDuplicate = existing.find((e) => {
      if (e.ocmId?.startsWith('vinfast-')) return false; // skip own VinFast entries
      return haversineMeters(lat, lng, e.latitude, e.longitude) < DEDUP_RADIUS_M;
    });

    if (nearbyDuplicate) {
      // Merge: update existing OSM/GMaps entry with VinFast's authoritative data
      await prisma.chargingStation.update({
        where: { id: nearbyDuplicate.id },
        data: {
          ...stationData,
          ocmId: vinfastOcmId, // claim it as VinFast-sourced now
        },
      });
      mergedDuplicates++;
      // Update local cache so future iterations don't re-match
      nearbyDuplicate.ocmId = vinfastOcmId;
      continue;
    }

    // 3. New station — create it
    await prisma.chargingStation.create({
      data: {
        ocmId: vinfastOcmId,
        ...stationData,
      },
    });

    // Add to local cache for dedup within this batch
    existing.push({ id: '', ocmId: vinfastOcmId, latitude: lat, longitude: lng, provider: 'VinFast' });
    created++;

    if ((created + updatedVinfast + mergedDuplicates) % 500 === 0) {
      console.log(`  Progress: ${created + updatedVinfast + mergedDuplicates}/${valid.length}...`);
    }
  }

  // Print summary
  const total = await prisma.chargingStation.count();
  const vinfast = await prisma.chargingStation.count({ where: { provider: 'VinFast' } });
  const universal = await prisma.chargingStation.count({ where: { isVinFastOnly: false } });

  console.log('\n=== VinFast Crawl Summary ===');
  console.log(`  New stations created: ${created}`);
  console.log(`  Existing VinFast updated: ${updatedVinfast}`);
  console.log(`  Merged with OSM/GMaps duplicates: ${mergedDuplicates}`);
  console.log(`  Skipped (out of service): ${skippedInactive}`);
  console.log(`\n  Total in DB: ${total}`);
  console.log(`  VinFast: ${vinfast}`);
  console.log(`  Universal: ${universal}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
