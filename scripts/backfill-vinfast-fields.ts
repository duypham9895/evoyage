/**
 * One-off script: Backfill chargingStatus, parkingFee, and operatingHours
 * for existing VinFast stations after schema changes.
 *
 * Usage: npx tsx scripts/backfill-vinfast-fields.ts
 */

import { PrismaClient } from '@prisma/client';

const VINFAST_CAR_API = 'https://api.service.finaldivision.com/stations/charging-stations';

interface VinFastStation {
  readonly entity_id: string;
  readonly store_id: string;
  readonly name: string;
  readonly charging_status: string;
  readonly parking_fee: boolean;
  readonly open_time_service: string;
  readonly close_time_service: string;
  readonly charging_publish: boolean;
  readonly category_slug: string;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('Fetching VinFast stations from API...');
    const response = await fetch(VINFAST_CAR_API, {
      headers: { 'Accept-Encoding': 'gzip, deflate' },
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`VinFast API error: ${response.status}`);
    }

    const stations: VinFastStation[] = await response.json();
    const carStations = stations.filter(
      (s) => s.charging_publish && s.category_slug === 'car_charging_station',
    );

    console.log(`Fetched ${stations.length} total, ${carStations.length} car charging stations`);

    // Build store_id → data lookup
    const storeIdMap = new Map<string, VinFastStation>();
    for (const s of carStations) {
      storeIdMap.set(s.store_id, s);
    }

    // Find all VinFast stations in DB
    const dbStations = await prisma.chargingStation.findMany({
      where: { isVinFastOnly: true },
      select: { id: true, ocmId: true, chargingStatus: true, parkingFee: true, operatingHours: true },
    });

    console.log(`Found ${dbStations.length} VinFast stations in DB`);

    let updated = 0;
    let skipped = 0;

    for (const db of dbStations) {
      // Extract store_id from ocmId (format: "vinfast-{store_id}")
      const storeId = db.ocmId?.startsWith('vinfast-')
        ? db.ocmId.replace('vinfast-', '')
        : null;

      if (!storeId) {
        skipped++;
        continue;
      }

      const apiData = storeIdMap.get(storeId);
      if (!apiData) {
        skipped++;
        continue;
      }

      const operatingHours =
        apiData.open_time_service === '00:00' && apiData.close_time_service === '23:59'
          ? '24/7'
          : apiData.open_time_service && apiData.close_time_service
            ? `${apiData.open_time_service} - ${apiData.close_time_service}`
            : null;

      await prisma.chargingStation.update({
        where: { id: db.id },
        data: {
          chargingStatus: apiData.charging_status ?? null,
          parkingFee: apiData.parking_fee ?? null,
          operatingHours,
        },
      });

      updated++;
    }

    console.log(`Done! Updated: ${updated}, Skipped: ${skipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
