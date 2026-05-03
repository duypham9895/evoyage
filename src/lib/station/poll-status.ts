/**
 * Orchestrator for the hourly station-status polling cron.
 *
 * Loads cached Cloudflare cookies → calls VinFast locators API →
 * deduplicates against the latest observation per station →
 * batch-inserts only the changed rows.
 *
 * Pure-ish: all external dependencies are injected via PollStatusDeps so
 * tests can mock Prisma + the API client without touching real services.
 */
import type { PrismaClient } from '@prisma/client';
import {
  fetchVinfastLocators,
  VinfastApiError,
  type VinfastCookie,
  type VinfastLocatorRaw,
} from './vinfast-api-client';

export interface PollStatusDeps {
  readonly prisma: PrismaClient;
  readonly fetchLocators: (
    cookies: readonly VinfastCookie[],
  ) => Promise<readonly VinfastLocatorRaw[]>;
}

export type PollStatusFailureReason =
  | 'cookies_missing'
  | 'cookies_expired'
  | 'upstream_failed';

export interface PollStatusResult {
  readonly ok: boolean;
  readonly reason?: PollStatusFailureReason;
  readonly stationsPolled: number;
  readonly observationsInserted: number;
  readonly errors: readonly string[];
}

interface MatchedStation {
  readonly dbId: string;
  readonly status: string;
}

interface ChargingStationLookup {
  readonly id: string;
  readonly entityId: string | null;
  readonly storeId: string | null;
  readonly ocmId: string | null;
}

/** Default factory used by the route handler — wires the real API client. */
export function makeDefaultDeps(prisma: PrismaClient): PollStatusDeps {
  return {
    prisma,
    fetchLocators: (cookies) => fetchVinfastLocators(cookies),
  };
}

export async function pollStationStatus(
  deps: PollStatusDeps,
): Promise<PollStatusResult> {
  const { prisma, fetchLocators } = deps;
  const errors: string[] = [];

  const cookieRow = await prisma.vinfastApiCookies.findFirst({
    orderBy: { refreshedAt: 'desc' },
  });

  if (!cookieRow) {
    return {
      ok: false,
      reason: 'cookies_missing',
      stationsPolled: 0,
      observationsInserted: 0,
      errors: ['No VinfastApiCookies row found; run the weekly refresh job'],
    };
  }

  if (cookieRow.expiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      reason: 'cookies_expired',
      stationsPolled: 0,
      observationsInserted: 0,
      errors: [`Cookies expired at ${cookieRow.expiresAt.toISOString()}`],
    };
  }

  let cookies: readonly VinfastCookie[];
  try {
    cookies = JSON.parse(cookieRow.cookieJson) as VinfastCookie[];
  } catch {
    return {
      ok: false,
      reason: 'cookies_missing',
      stationsPolled: 0,
      observationsInserted: 0,
      errors: ['Cookie row contains invalid JSON'],
    };
  }

  let stations: readonly VinfastLocatorRaw[];
  try {
    stations = await fetchLocators(cookies);
  } catch (err) {
    const detail =
      err instanceof VinfastApiError
        ? `${err.kind}: ${err.message}`
        : err instanceof Error
          ? err.message
          : 'unknown';
    return {
      ok: false,
      reason: 'upstream_failed',
      stationsPolled: 0,
      observationsInserted: 0,
      errors: [detail],
    };
  }

  const dbStations = (await prisma.chargingStation.findMany({
    where: { provider: 'VinFast' },
    select: { id: true, entityId: true, storeId: true, ocmId: true },
  })) as ChargingStationLookup[];

  const byEntityId = new Map<string, string>();
  const byOcmId = new Map<string, string>();
  for (const row of dbStations) {
    if (row.entityId) byEntityId.set(row.entityId, row.id);
    if (row.ocmId) byOcmId.set(row.ocmId, row.id);
  }

  const incoming = matchIncomingToDb(stations, byEntityId, byOcmId);

  const latestRows = await prisma.$queryRaw<
    Array<{ station_id: string; status: string }>
  >`
    SELECT DISTINCT ON ("stationId") "stationId" AS station_id, "status"
    FROM "StationStatusObservation"
    ORDER BY "stationId", "observedAt" DESC
  `;
  const latestByStation = new Map(
    latestRows.map((row) => [row.station_id, row.status]),
  );

  const toInsert = incoming.filter(
    (m) => latestByStation.get(m.dbId) !== m.status,
  );

  if (toInsert.length > 0) {
    await prisma.stationStatusObservation.createMany({
      data: toInsert.map((m) => ({ stationId: m.dbId, status: m.status })),
    });
  }

  return {
    ok: true,
    stationsPolled: stations.length,
    observationsInserted: toInsert.length,
    errors,
  };
}

function matchIncomingToDb(
  stations: readonly VinfastLocatorRaw[],
  byEntityId: ReadonlyMap<string, string>,
  byOcmId: ReadonlyMap<string, string>,
): readonly MatchedStation[] {
  const out: MatchedStation[] = [];
  for (const s of stations) {
    if (!s.charging_status) continue;
    const dbId =
      byEntityId.get(s.entity_id) ?? byOcmId.get(`vinfast-${s.store_id}`);
    if (!dbId) continue;
    out.push({ dbId, status: s.charging_status });
  }
  return out;
}
