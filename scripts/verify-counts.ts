/**
 * Recovery verification — print row counts for every table.
 * Run: npx tsx scripts/verify-counts.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const counts = await Promise.all([
    prisma.eVVehicle.count(),
    prisma.chargingStation.count(),
    prisma.chargingStation.count({ where: { isVinFastOnly: true } }),
    prisma.chargingStation.count({ where: { isVinFastOnly: false } }),
    prisma.vinFastStationDetail.count(),
    prisma.shortUrl.count(),
    prisma.routeCache.count(),
    prisma.feedback.count(),
  ]);

  const [vehicles, stations, vfStations, otherStations, vfDetails, shortUrls, routes, feedback] = counts;
  console.log('=== Database Row Counts ===');
  console.log(`EVVehicle:            ${vehicles}`);
  console.log(`ChargingStation:      ${stations}  (VinFast: ${vfStations}, Other: ${otherStations})`);
  console.log(`VinFastStationDetail: ${vfDetails}  (cache, fills on-demand)`);
  console.log(`ShortUrl:             ${shortUrls}  (lost in deletion)`);
  console.log(`RouteCache:           ${routes}  (rebuilds as users plan trips)`);
  console.log(`Feedback:             ${feedback}  (lost in deletion)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
