/**
 * Crawl EVPower charging stations from evpower.vn.
 *
 * The site exposes a public POST endpoint (https://evpower.vn/ajax/loadMap)
 * with no auth, no Cloudflare challenge. Plain fetch is sufficient — no
 * Playwright needed.
 *
 * Dedup: each candidate is matched against existing rows within 50m using
 * the shared dedup helper. When a duplicate is found we leave the existing
 * row untouched (VinFast-priority rule); otherwise we upsert by evpowerId.
 *
 * Run: npx tsx scripts/crawl-evpower-stations.ts
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type EVPowerRaw,
  parseEVPowerStation,
  type ParsedEVPowerStation,
} from '../src/lib/stations/parse-evpower';
import { bboxDelta, isDuplicateCandidate } from '../src/lib/stations/dedup';

const prisma = new PrismaClient();

const LOAD_MAP_URL = 'https://evpower.vn/ajax/loadMap';
const DEDUP_RADIUS_M = 50;

async function fetchEVPowerStations(): Promise<EVPowerRaw[]> {
  const body = new URLSearchParams({
    _tinh_tram: '0',
    _quan_tram: '0',
    in_khu_vuc: '',
    _loai_tram: '0',
    _trang_thai: '0',
  });
  const res = await fetch(LOAD_MAP_URL, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; eVoyageBot/1.0; +https://evoyage.app)',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://evpower.vn/en/find-a-charging-station',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`EVPower loadMap failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error('EVPower loadMap returned non-array');
  }
  return data as EVPowerRaw[];
}

async function isDuplicate(station: ParsedEVPowerStation): Promise<boolean> {
  const { dLat, dLng } = bboxDelta(station.latitude, DEDUP_RADIUS_M);
  const candidates = await prisma.chargingStation.findMany({
    where: {
      latitude: { gte: station.latitude - dLat, lte: station.latitude + dLat },
      longitude: { gte: station.longitude - dLng, lte: station.longitude + dLng },
      evpowerId: { not: station.evpowerId }, // never dedupe against ourselves
    },
    select: { latitude: true, longitude: true, name: true },
  });
  return candidates.some((c) =>
    isDuplicateCandidate(c, { lat: station.latitude, lng: station.longitude, name: station.name }, DEDUP_RADIUS_M),
  );
}

async function main(): Promise<void> {
  console.log('Fetching EVPower stations from evpower.vn/ajax/loadMap…');
  const raw = await fetchEVPowerStations();
  console.log(`Received ${raw.length} stations from EVPower API.`);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const fixturePath = resolve(__dirname, '../data/evpower-stations.json');
  writeFileSync(fixturePath, JSON.stringify(raw, null, 2));
  console.log(`Saved raw payload to ${fixturePath}`);

  let inserted = 0;
  let updated = 0;
  let skippedDuplicate = 0;
  let skippedInvalid = 0;

  for (const item of raw) {
    if (!item?.lat || !item?.lng || !item?.name) {
      skippedInvalid += 1;
      continue;
    }
    const station = parseEVPowerStation(item);
    if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) {
      skippedInvalid += 1;
      continue;
    }

    const existing = await prisma.chargingStation.findUnique({
      where: { evpowerId: station.evpowerId },
      select: { id: true },
    });

    if (!existing && (await isDuplicate(station))) {
      skippedDuplicate += 1;
      continue;
    }

    await prisma.chargingStation.upsert({
      where: { evpowerId: station.evpowerId },
      create: {
        evpowerId: station.evpowerId,
        name: station.name,
        address: station.address,
        province: station.province,
        latitude: station.latitude,
        longitude: station.longitude,
        chargerTypes: station.chargerTypes,
        connectorTypes: station.connectorTypes,
        portCount: station.portCount,
        maxPowerKw: station.maxPowerKw,
        stationType: station.stationType,
        isVinFastOnly: false,
        provider: 'EVPower',
        dataSource: 'evpower',
        hotline: station.hotline,
        chargingStatus: station.chargingStatus,
        operatingHours: null,
      },
      update: {
        name: station.name,
        address: station.address,
        province: station.province,
        latitude: station.latitude,
        longitude: station.longitude,
        chargerTypes: station.chargerTypes,
        connectorTypes: station.connectorTypes,
        portCount: station.portCount,
        maxPowerKw: station.maxPowerKw,
        stationType: station.stationType,
        hotline: station.hotline,
        chargingStatus: station.chargingStatus,
        scrapedAt: new Date(),
      },
    });

    if (existing) updated += 1;
    else inserted += 1;
  }

  console.log('=== EVPower crawl summary ===');
  console.log(`Inserted:          ${inserted}`);
  console.log(`Updated:           ${updated}`);
  console.log(`Skipped (dup):     ${skippedDuplicate}`);
  console.log(`Skipped (invalid): ${skippedInvalid}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
