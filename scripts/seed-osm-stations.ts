/**
 * Fetch EV charging stations from OpenStreetMap Overpass API for Vietnam.
 * Free, no API key, consistent with the Leaflet/OSM map stack.
 *
 * Run: npx tsx scripts/seed-osm-stations.ts
 *
 * Safe to re-run: upserts by `ocmId = osm-<element-id>` and dedupes against
 * existing VinFast / EVPower stations within 50m so we never overwrite
 * higher-quality rows.
 */
import { PrismaClient } from '@prisma/client';

import { parseOSMConnectors, parseOSMMaxPower, parseOSMProvider } from '../src/lib/stations/parse-osm';
import { bboxDelta, isDuplicateCandidate } from '../src/lib/stations/dedup';

const prisma = new PrismaClient();

const VIETNAM_BBOX = '8.0,102.0,23.5,110.0';
const DEDUP_RADIUS_M = 50;

interface OverpassElement {
  readonly id: number;
  readonly lat: number;
  readonly lon: number;
  readonly tags?: Record<string, string>;
}

function inferProvince(lat: number): string {
  if (lat > 20.5) return 'Hà Nội / Northern';
  if (lat > 15.5) return 'Đà Nẵng / Central';
  if (lat > 11.5) return 'Tây Nguyên / Highlands';
  if (lat > 10.5) return 'Hồ Chí Minh / Southern';
  return 'Mekong Delta';
}

interface ParsedOSMStation {
  ocmId: string;
  name: string;
  address: string;
  province: string;
  latitude: number;
  longitude: number;
  chargerTypes: string;
  connectorTypes: string;
  portCount: number;
  maxPowerKw: number;
  isVinFast: boolean;
  provider: string;
}

function parseOverpassElement(el: OverpassElement): ParsedOSMStation | null {
  const tags = el.tags ?? {};
  const name = tags['name'] ?? tags['operator'] ?? `OSM Station #${el.id}`;
  // Skip e-bike-only stations (still safe to include if motorcar tag is present)
  if (name.toLowerCase().includes('e-bike') && !tags['motorcar']) return null;

  const connectorTypes = parseOSMConnectors(tags);
  const maxPower = parseOSMMaxPower(tags);
  const { provider, isVinFast } = parseOSMProvider(tags);
  const chargerTypes = connectorTypes.map(() =>
    maxPower >= 20 ? `DC_${maxPower}kW` : `AC_${maxPower}kW`,
  );
  const portCount = parseInt(tags['capacity'] ?? '1', 10) || 1;

  return {
    ocmId: `osm-${el.id}`,
    name,
    address: tags['addr:street']
      ? `${tags['addr:housenumber'] ?? ''} ${tags['addr:street']}, ${tags['addr:city'] ?? ''}`.trim()
      : inferProvince(el.lat),
    province: tags['addr:city'] ?? tags['addr:province'] ?? inferProvince(el.lat),
    latitude: el.lat,
    longitude: el.lon,
    chargerTypes: JSON.stringify([...new Set(chargerTypes)]),
    connectorTypes: JSON.stringify([...new Set(connectorTypes)]),
    portCount,
    maxPowerKw: maxPower,
    isVinFast,
    provider,
  };
}

async function isDuplicate(s: ParsedOSMStation): Promise<boolean> {
  const { dLat, dLng } = bboxDelta(s.latitude, DEDUP_RADIUS_M);
  const candidates = await prisma.chargingStation.findMany({
    where: {
      latitude: { gte: s.latitude - dLat, lte: s.latitude + dLat },
      longitude: { gte: s.longitude - dLng, lte: s.longitude + dLng },
      ocmId: { not: s.ocmId },
    },
    select: { latitude: true, longitude: true, name: true, dataSource: true },
  });
  // Only dedupe against higher-trust sources (vinfast > evpower > manual > osm).
  return candidates.some(
    (c) =>
      c.dataSource !== 'osm' &&
      c.dataSource !== 'crowdsourced' &&
      isDuplicateCandidate(c, { lat: s.latitude, lng: s.longitude, name: s.name }, DEDUP_RADIUS_M),
  );
}

async function main(): Promise<void> {
  console.log('Fetching Vietnam EV charging stations from OpenStreetMap...');

  const query = `[out:json][timeout:30];node["amenity"="charging_station"](${VIETNAM_BBOX});out body;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'evoyage/1.0 (https://evoyagevn.vercel.app)',
    },
  });
  if (!response.ok) throw new Error(`Overpass API error: ${response.status}`);

  const data = await response.json();
  const elements: OverpassElement[] = data.elements ?? [];
  console.log(`Received ${elements.length} stations from OpenStreetMap`);

  let inserted = 0;
  let updated = 0;
  let skippedDuplicate = 0;
  let skippedInvalid = 0;

  for (const el of elements) {
    const parsed = parseOverpassElement(el);
    if (!parsed) {
      skippedInvalid += 1;
      continue;
    }

    const existing = await prisma.chargingStation.findUnique({
      where: { ocmId: parsed.ocmId },
      select: { id: true },
    });

    if (!existing && (await isDuplicate(parsed))) {
      skippedDuplicate += 1;
      continue;
    }

    await prisma.chargingStation.upsert({
      where: { ocmId: parsed.ocmId },
      create: {
        ocmId: parsed.ocmId,
        name: parsed.name,
        address: parsed.address,
        province: parsed.province,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        chargerTypes: parsed.chargerTypes,
        connectorTypes: parsed.connectorTypes,
        portCount: parsed.portCount,
        maxPowerKw: parsed.maxPowerKw,
        stationType: 'public',
        isVinFastOnly: parsed.isVinFast,
        provider: parsed.provider,
        dataSource: 'osm',
      },
      update: {
        name: parsed.name,
        address: parsed.address,
        province: parsed.province,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        chargerTypes: parsed.chargerTypes,
        connectorTypes: parsed.connectorTypes,
        portCount: parsed.portCount,
        maxPowerKw: parsed.maxPowerKw,
        isVinFastOnly: parsed.isVinFast,
        provider: parsed.provider,
        dataSource: 'osm',
        scrapedAt: new Date(),
      },
    });

    if (existing) updated += 1;
    else inserted += 1;
    if ((inserted + updated) % 100 === 0) console.log(`  Processed ${inserted + updated}…`);
  }

  console.log('=== OSM seed summary ===');
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
