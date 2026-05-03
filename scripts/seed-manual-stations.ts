/**
 * Seed manually-curated charging stations from data/manual-stations.csv.
 *
 * The CSV is hand-edited by the PM for the long tail of stations that
 * neither VinFast nor EVPower nor OSM expose programmatically (mall,
 * hotel, dealer chargers found via news / blog / Facebook). Every row
 * must include a sourceUrl — that's the audit trail.
 *
 * Idempotent: rows are upserted by a deterministic id derived from
 * name + rounded coordinates, so re-running with the same CSV is safe.
 *
 * Run: npx tsx scripts/seed-manual-stations.ts [path/to/file.csv]
 *      Defaults to data/manual-stations.csv when no path is given.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseManualCsv, type ManualStationRow } from '../src/lib/stations/parse-manual-csv';
import { bboxDelta, isDuplicateCandidate } from '../src/lib/stations/dedup';

const prisma = new PrismaClient();

const DEDUP_RADIUS_M = 50;
const DEFAULT_PATH = 'data/manual-stations.csv';

function manualStationId(row: ManualStationRow): string {
  const seed = `${row.name.trim().toLowerCase()}|${row.latitude.toFixed(5)}|${row.longitude.toFixed(5)}`;
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 16);
  return `manual-${hash}`;
}

async function isDuplicate(row: ManualStationRow): Promise<boolean> {
  const { dLat, dLng } = bboxDelta(row.latitude, DEDUP_RADIUS_M);
  const candidates = await prisma.chargingStation.findMany({
    where: {
      latitude: { gte: row.latitude - dLat, lte: row.latitude + dLat },
      longitude: { gte: row.longitude - dLng, lte: row.longitude + dLng },
    },
    select: { latitude: true, longitude: true, name: true, dataSource: true, ocmId: true },
  });
  // Manual entries dedupe against any higher-priority source.
  return candidates.some(
    (c) =>
      c.dataSource !== 'manual' &&
      isDuplicateCandidate(c, { lat: row.latitude, lng: row.longitude, name: row.name }, DEDUP_RADIUS_M),
  );
}

async function main(): Promise<void> {
  const csvPath = resolve(process.argv[2] ?? DEFAULT_PATH);
  console.log(`Reading manual stations from ${csvPath}…`);
  const csv = readFileSync(csvPath, 'utf8');
  const rows = parseManualCsv(csv);
  console.log(`Parsed ${rows.length} valid rows.`);

  let inserted = 0;
  let updated = 0;
  let skippedDuplicate = 0;

  for (const row of rows) {
    const id = manualStationId(row);
    const ocmId = id; // reuse the unique slot for cross-source tagging

    const existing = await prisma.chargingStation.findUnique({
      where: { ocmId },
      select: { id: true },
    });

    if (!existing && (await isDuplicate(row))) {
      skippedDuplicate += 1;
      console.warn(`  Skipped duplicate: ${row.name} (${row.latitude}, ${row.longitude}) — see ${row.sourceUrl}`);
      continue;
    }

    const chargerTypes = row.connectorTypes.map((c) =>
      row.stationType === 'AC' ? `AC_${row.maxPowerKw}kW` : `DC_${row.maxPowerKw}kW`,
    );

    await prisma.chargingStation.upsert({
      where: { ocmId },
      create: {
        ocmId,
        name: row.name,
        address: row.address,
        province: row.province,
        latitude: row.latitude,
        longitude: row.longitude,
        chargerTypes: JSON.stringify(chargerTypes),
        connectorTypes: JSON.stringify(row.connectorTypes),
        portCount: row.connectorTypes.length || 1,
        maxPowerKw: row.maxPowerKw,
        stationType: row.stationType,
        isVinFastOnly: false,
        provider: row.provider,
        dataSource: 'manual',
        rawData: JSON.stringify({ sourceUrl: row.sourceUrl }),
      },
      update: {
        name: row.name,
        address: row.address,
        province: row.province,
        latitude: row.latitude,
        longitude: row.longitude,
        chargerTypes: JSON.stringify(chargerTypes),
        connectorTypes: JSON.stringify(row.connectorTypes),
        portCount: row.connectorTypes.length || 1,
        maxPowerKw: row.maxPowerKw,
        stationType: row.stationType,
        provider: row.provider,
        scrapedAt: new Date(),
      },
    });

    if (existing) updated += 1;
    else inserted += 1;
  }

  console.log('=== Manual seed summary ===');
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated:  ${updated}`);
  console.log(`Skipped:  ${skippedDuplicate}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
