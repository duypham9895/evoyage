/**
 * Enrich charging station data with known provider specifications.
 * VinFast, EVONE, EverCharge etc. have documented charger specs.
 *
 * Run: npx tsx scripts/enrich-stations.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Known provider charging specs
const PROVIDER_SPECS: Record<string, {
  connectorTypes: string[];
  chargerTypes: string[];
  maxPowerKw: number;
  portCount: number;
}> = {
  VinFast: {
    connectorTypes: ['CCS2', 'Type2_AC'],
    chargerTypes: ['DC_150kW', 'AC_11kW'],
    maxPowerKw: 150,
    portCount: 4,
  },
  EVONE: {
    connectorTypes: ['CCS2', 'CHAdeMO', 'Type2_AC'],
    chargerTypes: ['DC_60kW', 'DC_30kW', 'AC_22kW'],
    maxPowerKw: 60,
    portCount: 3,
  },
  EverCharge: {
    connectorTypes: ['CCS2', 'Type2_AC'],
    chargerTypes: ['DC_60kW', 'AC_22kW'],
    maxPowerKw: 60,
    portCount: 2,
  },
  'CHARGE+': {
    connectorTypes: ['CCS2', 'CHAdeMO', 'Type2_AC'],
    chargerTypes: ['DC_50kW', 'AC_22kW'],
    maxPowerKw: 50,
    portCount: 2,
  },
  EVPower: {
    connectorTypes: ['CCS2', 'Type2_AC'],
    chargerTypes: ['DC_60kW', 'AC_22kW'],
    maxPowerKw: 60,
    portCount: 2,
  },
};

// Default for unknown providers
const DEFAULT_SPEC = {
  connectorTypes: ['CCS2'],
  chargerTypes: ['DC_50kW'],
  maxPowerKw: 50,
  portCount: 2,
};

async function main() {
  console.log('Enriching charging station data with provider specs...\n');

  const stations = await prisma.chargingStation.findMany();
  console.log(`Total stations: ${stations.length}`);

  let enriched = 0;

  for (const station of stations) {
    const spec = PROVIDER_SPECS[station.provider] ?? DEFAULT_SPEC;
    const currentConnectors = JSON.parse(station.connectorTypes) as string[];

    // Only enrich if current data is generic/unknown
    const needsEnrichment =
      currentConnectors.includes('Unknown') ||
      currentConnectors.length === 0 ||
      station.maxPowerKw === 22 ||
      station.maxPowerKw === 50;

    if (needsEnrichment) {
      await prisma.chargingStation.update({
        where: { id: station.id },
        data: {
          connectorTypes: JSON.stringify(spec.connectorTypes),
          chargerTypes: JSON.stringify(spec.chargerTypes),
          maxPowerKw: spec.maxPowerKw,
          portCount: spec.portCount,
        },
      });
      enriched++;
    }
  }

  // Print summary by provider
  const providers = await prisma.$queryRaw<Array<{ provider: string; count: bigint }>>`
    SELECT provider, COUNT(*) as count FROM "ChargingStation" GROUP BY provider ORDER BY count DESC
  `;

  console.log(`\nEnriched ${enriched} stations.\n`);
  console.log('Stations by provider:');
  for (const p of providers) {
    const spec = PROVIDER_SPECS[p.provider];
    const maxKw = spec?.maxPowerKw ?? DEFAULT_SPEC.maxPowerKw;
    console.log(`  ${p.provider}: ${p.count} stations (max ${maxKw}kW)`);
  }

  const total = await prisma.chargingStation.count();
  console.log(`\nTotal: ${total} stations`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
