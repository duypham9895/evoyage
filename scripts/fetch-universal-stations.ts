/**
 * Fetch universal charging stations from Open Charge Map API for Vietnam.
 * Saves raw data to data/universal-stations.json and seeds into Supabase.
 *
 * Run: npx tsx scripts/fetch-universal-stations.ts
 */
import { writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apiKey = process.env.OPEN_CHARGE_MAP_API_KEY ?? '';
  console.log('Fetching Vietnam charging stations from Open Charge Map...');

  const url = new URL('https://api.openchargemap.io/v3/poi/');
  url.searchParams.set('output', 'json');
  url.searchParams.set('countrycode', 'VN');
  url.searchParams.set('maxresults', '5000');
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');
  if (apiKey) {
    url.searchParams.set('key', apiKey);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`OCM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`Received ${data.length} stations from OCM API`);

  // Save raw data
  writeFileSync('data/universal-stations.json', JSON.stringify(data, null, 2));
  console.log('Saved raw data to data/universal-stations.json');

  // Seed into DB
  let seeded = 0;

  for (const poi of data) {
    const addressInfo = poi.AddressInfo;
    if (!addressInfo?.Latitude || !addressInfo?.Longitude) continue;

    const operatorTitle = poi.OperatorInfo?.Title ?? 'Unknown';
    const isVinFast =
      operatorTitle.toLowerCase().includes('vinfast') ||
      operatorTitle.toLowerCase().includes('v-green');

    const connections = poi.Connections ?? [];
    const connectorTypes: string[] = [];
    const chargerTypes: string[] = [];
    let maxPower = 0;
    let portCount = 0;

    for (const conn of connections) {
      const typeName = conn.ConnectionType?.Title ?? '';
      if (typeName.includes('CCS')) connectorTypes.push('CCS2');
      else if (typeName.includes('CHAdeMO')) connectorTypes.push('CHAdeMO');
      else if (typeName.includes('Type 2')) connectorTypes.push('Type2_AC');
      else if (typeName) connectorTypes.push(typeName);

      const power = conn.PowerKW ?? 0;
      if (power > 0) {
        chargerTypes.push(power >= 20 ? `DC_${power}kW` : `AC_${power}kW`);
      }
      if (power > maxPower) maxPower = power;
      portCount += conn.Quantity ?? 1;
    }

    const ocmId = String(poi.ID);
    const stationName = addressInfo.Title ?? `Station ${ocmId}`;

    let provider = 'Other';
    if (isVinFast) provider = 'VinFast';
    else if (operatorTitle.includes('EverCharge')) provider = 'EverCharge';
    else if (operatorTitle.includes('EVONE')) provider = 'EVONE';
    else if (operatorTitle.includes('EVPower')) provider = 'EVPower';
    else if (operatorTitle.includes('CHARGE+')) provider = 'CHARGE+';

    await prisma.chargingStation.upsert({
      where: { ocmId },
      update: {
        name: stationName,
        address: [addressInfo.AddressLine1, addressInfo.Town, addressInfo.StateOrProvince]
          .filter(Boolean)
          .join(', '),
        province: addressInfo.StateOrProvince ?? addressInfo.Town ?? 'Unknown',
        latitude: addressInfo.Latitude,
        longitude: addressInfo.Longitude,
        chargerTypes: JSON.stringify([...new Set(chargerTypes)]),
        connectorTypes: JSON.stringify([...new Set(connectorTypes)]),
        portCount: portCount || 1,
        maxPowerKw: maxPower || 22,
        stationType: 'public',
        isVinFastOnly: isVinFast,
        provider,
        scrapedAt: new Date(),
      },
      create: {
        ocmId,
        name: stationName,
        address: [addressInfo.AddressLine1, addressInfo.Town, addressInfo.StateOrProvince]
          .filter(Boolean)
          .join(', '),
        province: addressInfo.StateOrProvince ?? addressInfo.Town ?? 'Unknown',
        latitude: addressInfo.Latitude,
        longitude: addressInfo.Longitude,
        chargerTypes: JSON.stringify([...new Set(chargerTypes)]),
        connectorTypes: JSON.stringify([...new Set(connectorTypes)]),
        portCount: portCount || 1,
        maxPowerKw: maxPower || 22,
        stationType: 'public',
        isVinFastOnly: isVinFast,
        provider,
        scrapedAt: new Date(),
      },
    });

    seeded++;
    if (seeded % 50 === 0) {
      console.log(`  Seeded ${seeded} stations...`);
    }
  }

  console.log(`\nSeeded ${seeded} stations into database.`);
  const vinFastCount = await prisma.chargingStation.count({ where: { isVinFastOnly: true } });
  const universalCount = await prisma.chargingStation.count({ where: { isVinFastOnly: false } });
  console.log(`  VinFast-only: ${vinFastCount}`);
  console.log(`  Universal: ${universalCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
