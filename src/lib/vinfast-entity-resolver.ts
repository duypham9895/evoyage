import { prisma } from '@/lib/prisma';

const FINALDIVISION_URL = 'https://api.service.finaldivision.com/stations/charging-stations';
const FINALDIVISION_CACHE_TTL_MS = 60 * 60 * 1000;

interface FinalDivisionStation {
  readonly entity_id: string;
  readonly store_id: string;
}

let cachedStations: readonly FinalDivisionStation[] | null = null;
let cachedAt = 0;

async function fetchFinalDivisionList(): Promise<readonly FinalDivisionStation[]> {
  if (cachedStations && Date.now() - cachedAt < FINALDIVISION_CACHE_TTL_MS) {
    return cachedStations;
  }

  const res = await fetch(FINALDIVISION_URL, {
    headers: { 'Accept-Encoding': 'gzip' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`finaldivision.com returned ${res.status}`);
  }

  const data = (await res.json()) as readonly FinalDivisionStation[];
  cachedStations = data;
  cachedAt = Date.now();
  return data;
}

export async function resolveEntityId(stationId: string): Promise<{
  readonly entityId: string | null;
  readonly storeId: string | null;
}> {
  const station = await prisma.chargingStation.findUnique({
    where: { id: stationId },
    select: { entityId: true, storeId: true, ocmId: true },
  });

  if (!station) return { entityId: null, storeId: null };

  if (station.entityId) {
    return { entityId: station.entityId, storeId: station.storeId ?? null };
  }

  const storeId = station.ocmId?.startsWith('vinfast-')
    ? station.ocmId.replace('vinfast-', '')
    : station.storeId ?? null;

  if (!storeId) return { entityId: null, storeId: null };

  try {
    const stations = await fetchFinalDivisionList();
    const match = stations.find((s) => s.store_id === storeId);

    if (match) {
      prisma.chargingStation.update({
        where: { id: stationId },
        data: { entityId: match.entity_id },
      }).catch(() => {});

      return { entityId: match.entity_id, storeId };
    }
  } catch (err) {
    console.error('finaldivision.com fallback failed:', err);
  }

  return { entityId: null, storeId };
}
