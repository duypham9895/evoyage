/**
 * Promote MISSING_STATION feedback into ChargingStation rows.
 *
 * Reads all NEW MISSING_STATION feedback that has coordinates, clusters
 * them within 50m, and when ≥3 distinct users agree on the same physical
 * spot the cluster becomes a new ChargingStation row tagged
 * `dataSource = "crowdsourced"`.
 *
 * Anti-abuse:
 *  - Cluster requires ≥3 distinct ipHash values (not just 3 reports).
 *  - Skipped if any existing higher-priority station sits within 50m.
 *  - Source feedback rows are marked status = "RESOLVED" so re-runs don't
 *    double-count them.
 *
 * Run: npx tsx scripts/promote-crowdsourced-stations.ts
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

import { clusterMissingStationFeedback, type FeedbackPoint } from '../src/lib/stations/cluster-feedback';
import { bboxDelta, isDuplicateCandidate } from '../src/lib/stations/dedup';

const prisma = new PrismaClient();

const DEDUP_RADIUS_M = 50;

function crowdsourcedStationId(lat: number, lng: number): string {
  const seed = `${lat.toFixed(5)}|${lng.toFixed(5)}`;
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 16);
  return `crowd-${hash}`;
}

async function isDuplicate(lat: number, lng: number, name: string): Promise<boolean> {
  const { dLat, dLng } = bboxDelta(lat, DEDUP_RADIUS_M);
  const candidates = await prisma.chargingStation.findMany({
    where: {
      latitude: { gte: lat - dLat, lte: lat + dLat },
      longitude: { gte: lng - dLng, lte: lng + dLng },
    },
    select: { latitude: true, longitude: true, name: true, dataSource: true },
  });
  return candidates.some((c) =>
    isDuplicateCandidate(c, { lat, lng, name }, DEDUP_RADIUS_M),
  );
}

async function main(): Promise<void> {
  const pending = await prisma.feedback.findMany({
    where: {
      category: 'MISSING_STATION',
      status: 'NEW',
      proposedLatitude: { not: null },
      proposedLongitude: { not: null },
    },
    select: {
      id: true,
      proposedLatitude: true,
      proposedLongitude: true,
      ipHash: true,
      stationName: true,
      description: true,
      proposedProvider: true,
    },
  });
  console.log(`Pending MISSING_STATION feedback with coords: ${pending.length}`);
  if (pending.length === 0) {
    console.log('Nothing to promote.');
    return;
  }

  const points: FeedbackPoint[] = pending.map((p) => ({
    id: p.id,
    latitude: p.proposedLatitude as number,
    longitude: p.proposedLongitude as number,
    ipHash: p.ipHash ?? '',
    stationName: p.stationName ?? '',
    description: p.description,
    proposedProvider: p.proposedProvider,
  }));

  const clusters = clusterMissingStationFeedback(points);
  console.log(`Qualifying clusters (≥3 reports, ≥3 unique IPs, within 50m): ${clusters.length}`);

  let inserted = 0;
  let skippedDuplicate = 0;
  let resolvedFeedback = 0;

  for (const cluster of clusters) {
    if (await isDuplicate(cluster.centroid.latitude, cluster.centroid.longitude, cluster.name)) {
      skippedDuplicate += 1;
      console.warn(
        `  Skipped cluster: "${cluster.name}" already has a station within 50m (${cluster.members.length} reports left as NEW).`,
      );
      continue;
    }

    const ocmId = crowdsourcedStationId(cluster.centroid.latitude, cluster.centroid.longitude);
    const stationType = 'public';

    await prisma.chargingStation.upsert({
      where: { ocmId },
      create: {
        ocmId,
        name: cluster.name,
        address: cluster.address,
        province: 'Pending verification',
        latitude: cluster.centroid.latitude,
        longitude: cluster.centroid.longitude,
        chargerTypes: JSON.stringify(['Unknown']),
        connectorTypes: JSON.stringify(['Unknown']),
        portCount: 1,
        maxPowerKw: 0,
        stationType,
        isVinFastOnly: false,
        provider: cluster.provider,
        dataSource: 'crowdsourced',
        rawData: JSON.stringify({
          memberIds: cluster.memberIds,
          reportCount: cluster.members.length,
          uniqueReporters: new Set(cluster.members.map((m) => m.ipHash)).size,
        }),
      },
      update: {
        name: cluster.name,
        address: cluster.address,
        latitude: cluster.centroid.latitude,
        longitude: cluster.centroid.longitude,
        provider: cluster.provider,
        dataSource: 'crowdsourced',
        scrapedAt: new Date(),
      },
    });

    await prisma.feedback.updateMany({
      where: { id: { in: [...cluster.memberIds] } },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });

    inserted += 1;
    resolvedFeedback += cluster.memberIds.length;
    console.log(
      `  Promoted cluster "${cluster.name}" at (${cluster.centroid.latitude.toFixed(5)}, ${cluster.centroid.longitude.toFixed(5)}) — ${cluster.members.length} reports.`,
    );
  }

  console.log('=== Crowdsourced promotion summary ===');
  console.log(`Inserted/updated stations: ${inserted}`);
  console.log(`Skipped (already exists):  ${skippedDuplicate}`);
  console.log(`Feedback rows resolved:    ${resolvedFeedback}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
