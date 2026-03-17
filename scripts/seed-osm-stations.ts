/**
 * Fetch EV charging stations from OpenStreetMap Overpass API for Vietnam.
 * Free, no API key, consistent with Leaflet/OSM map stack.
 *
 * Run: npx tsx scripts/seed-osm-stations.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Vietnam bounding box
const VIETNAM_BBOX = '8.0,102.0,23.5,110.0';

interface OverpassElement {
  readonly id: number;
  readonly lat: number;
  readonly lon: number;
  readonly tags?: Record<string, string>;
}

function parseConnectorTypes(tags: Record<string, string>): string[] {
  const connectors: string[] = [];
  if (tags['socket:type2'] || tags['socket:type2_combo']) connectors.push('Type2_AC');
  if (tags['socket:type2_combo'] || tags['socket:ccs']) connectors.push('CCS2');
  if (tags['socket:chademo']) connectors.push('CHAdeMO');
  if (tags['socket:type1']) connectors.push('Type1');
  if (tags['socket:type1_combo']) connectors.push('CCS1');
  if (connectors.length === 0 && tags['socket:type2_cable']) connectors.push('Type2_AC');
  return connectors.length > 0 ? connectors : ['Unknown'];
}

function parseMaxPower(tags: Record<string, string>): number {
  // Check various power tags
  for (const key of ['charging_station:output', 'capacity', 'maxpower']) {
    const val = tags[key];
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  // Check socket-specific power
  for (const key of Object.keys(tags)) {
    if (key.startsWith('socket:') && key.endsWith(':output')) {
      const val = tags[key];
      const match = val?.match(/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
  }
  return 22; // Default AC power
}

function parseProvider(tags: Record<string, string>): { provider: string; isVinFast: boolean } {
  const operator = (tags['operator'] ?? tags['brand'] ?? tags['network'] ?? '').toLowerCase();
  if (operator.includes('vinfast') || operator.includes('v-green') || operator.includes('vgreen')) {
    return { provider: 'VinFast', isVinFast: true };
  }
  if (operator.includes('evercharge')) return { provider: 'EverCharge', isVinFast: false };
  if (operator.includes('evone')) return { provider: 'EVONE', isVinFast: false };
  if (operator.includes('evpower')) return { provider: 'EVPower', isVinFast: false };
  if (operator.includes('charge+')) return { provider: 'CHARGE+', isVinFast: false };
  if (operator.includes('eves') || operator.includes('evs')) return { provider: 'EVS', isVinFast: false };
  if (operator) return { provider: operator.slice(0, 50), isVinFast: false };
  return { provider: 'Other', isVinFast: false };
}

function inferProvince(lat: number, lng: number): string {
  // Simple region inference based on coordinates
  if (lat > 20.5) return 'Hà Nội / Northern';
  if (lat > 15.5) return 'Đà Nẵng / Central';
  if (lat > 11.5) return 'Tây Nguyên / Highlands';
  if (lat > 10.5) return 'Hồ Chí Minh / Southern';
  return 'Mekong Delta';
}

async function main() {
  console.log('Fetching Vietnam EV charging stations from OpenStreetMap...');

  const query = `[out:json][timeout:30];node["amenity"="charging_station"](${VIETNAM_BBOX});out body;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  const data = await response.json();
  const elements: OverpassElement[] = data.elements ?? [];
  console.log(`Received ${elements.length} stations from OpenStreetMap`);

  // Clear existing stations and seed fresh
  await prisma.chargingStation.deleteMany();
  console.log('Cleared existing stations');

  let seeded = 0;

  for (const el of elements) {
    const tags = el.tags ?? {};

    // Skip non-car charging (e-bike only stations)
    const name = tags['name'] ?? tags['operator'] ?? `OSM Station #${el.id}`;
    if (name.toLowerCase().includes('e-bike') && !tags['motorcar']) continue;

    const connectorTypes = parseConnectorTypes(tags);
    const maxPower = parseMaxPower(tags);
    const { provider, isVinFast } = parseProvider(tags);
    const chargerTypes = connectorTypes.map((c) =>
      maxPower >= 20 ? `DC_${maxPower}kW` : `AC_${maxPower}kW`,
    );

    const portCount = parseInt(tags['capacity'] ?? '1', 10) || 1;

    await prisma.chargingStation.create({
      data: {
        ocmId: `osm-${el.id}`,
        name,
        address: tags['addr:street']
          ? `${tags['addr:housenumber'] ?? ''} ${tags['addr:street']}, ${tags['addr:city'] ?? ''}`.trim()
          : inferProvince(el.lat, el.lon),
        province: tags['addr:city'] ?? tags['addr:province'] ?? inferProvince(el.lat, el.lon),
        latitude: el.lat,
        longitude: el.lon,
        chargerTypes: JSON.stringify([...new Set(chargerTypes)]),
        connectorTypes: JSON.stringify([...new Set(connectorTypes)]),
        portCount,
        maxPowerKw: maxPower,
        stationType: 'public',
        isVinFastOnly: isVinFast,
        provider,
        scrapedAt: new Date(),
      },
    });

    seeded++;
    if (seeded % 100 === 0) console.log(`  Seeded ${seeded} stations...`);
  }

  const vinFastCount = await prisma.chargingStation.count({ where: { isVinFastOnly: true } });
  const universalCount = await prisma.chargingStation.count({ where: { isVinFastOnly: false } });
  console.log(`\nSeeded ${seeded} stations total.`);
  console.log(`  VinFast: ${vinFastCount}`);
  console.log(`  Universal: ${universalCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());