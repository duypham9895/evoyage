import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchVinFastDetailWithProgress } from '@/lib/vinfast/vinfast-client';
import { resolveEntityId } from '@/lib/vinfast/vinfast-entity-resolver';

export const maxDuration = 25;
export const dynamic = 'force-dynamic';

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function sseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: stationId } = await params;

  if (!/^[a-z0-9]{20,36}$/.test(stationId)) {
    return new Response(sseEvent({ stage: 'error', code: 'INVALID_ID' }), {
      status: 400,
      headers: sseHeaders(),
    });
  }

  const ip = getClientIp(request);
  const limit = await checkRateLimit(`vinfast-detail:${ip}`, 20, 60_000);
  if (!limit.allowed) {
    return new Response(
      sseEvent({ stage: 'error', code: 'RATE_LIMITED' }),
      { status: 429, headers: { ...sseHeaders(), 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const station = await prisma.chargingStation.findUnique({
    where: { id: stationId },
  });

  if (!station) {
    return new Response(sseEvent({ stage: 'error', code: 'NOT_FOUND' }), {
      status: 404,
      headers: sseHeaders(),
    });
  }

  if (!station.isVinFastOnly) {
    return new Response(
      sseEvent({ stage: 'error', code: 'NOT_VINFAST' }),
      { status: 400, headers: sseHeaders() },
    );
  }

  const storeId = station.ocmId?.startsWith('vinfast-')
    ? station.ocmId.replace('vinfast-', '')
    : station.storeId ?? station.id;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)));
      };

      try {
        emit({ stage: 'connecting' });

        const STATUS_MAP: Record<string, string> = {
          ACTIVE: 'Available',
          BUSY: 'Busy',
          UNAVAILABLE: 'Unavailable',
          INACTIVE: 'Inactive',
          OUTOFSERVICE: 'Out of service',
        };

        // Build Tier 4 basic detail from DB (used as final fallback)
        const buildBasicDetail = () => {
          const connectorSummary = (() => {
            try {
              return station.connectorTypes ? JSON.parse(station.connectorTypes) as string[] : [];
            } catch {
              return [];
            }
          })();

          return {
            entityId: entityId ?? null,
            storeId,
            name: station.name,
            address: station.address,
            province: '',
            district: '',
            commune: '',
            latitude: station.latitude,
            longitude: station.longitude,
            evses: [],
            images: [],
            depotStatus: STATUS_MAP[station.chargingStatus ?? ''] ?? 'unknown',
            is24h: false,
            chargingWhenClosed: false,
            parkingFee: station.parkingFee ?? false,
            accessType: station.accessType ?? 'Public',
            hardwareStations: [],
            connectorSummary,
            maxPowerKw: station.maxPowerKw,
            portCount: station.portCount,
            fetchedAt: new Date().toISOString(),
          };
        };

        const { entityId } = await resolveEntityId(stationId);

        // No entity mapping — return basic DB data instead of erroring
        if (!entityId || !/^[a-zA-Z0-9_-]{1,64}$/.test(entityId)) {
          emit({ stage: 'done', detail: buildBasicDetail(), cached: false, basic: true });
          return;
        }

        // Tier 0: Check DB cache first — skip scraping if fresh enough
        const CACHE_FRESH_MS = 24 * 60 * 60 * 1000; // 24 hours
        const cached = await prisma.vinFastStationDetail.findFirst({
          where: { storeId },
        });

        if (cached && cached.detail !== '{}') {
          const ageMs = Date.now() - cached.fetchedAt.getTime();
          if (ageMs < CACHE_FRESH_MS) {
            emit({ stage: 'done', detail: JSON.parse(cached.detail), cached: true });
            controller.close();
            return;
          }
        }

        // Tier 1–2: Try scraping (impit → Playwright)
        const detail = await fetchVinFastDetailWithProgress(
          entityId,
          (stage, _message, method) => emit({ stage, method }),
          request.signal,
        );

        if (detail) {
          emit({ stage: 'parsing' });

          const serialized = JSON.stringify(detail);
          if (serialized.length <= 100_000) {
            prisma.vinFastStationDetail.upsert({
              where: { entityId },
              update: { storeId, detail: serialized, fetchedAt: new Date() },
              create: { entityId, storeId, detail: serialized, fetchedAt: new Date() },
            }).catch(() => {});
          }

          emit({ stage: 'done', detail, cached: false });
          return;
        }

        // Tier 3: Serve stale cache with DB status overlay
        if (cached && cached.detail !== '{}') {
          const cachedDetail = JSON.parse(cached.detail) as Record<string, unknown>;
          cachedDetail.depotStatus = STATUS_MAP[station.chargingStatus ?? ''] ?? cachedDetail.depotStatus;
          cachedDetail.fetchedAt = new Date().toISOString();

          const staleAgeMs = Date.now() - cached.fetchedAt.getTime();
          emit({ stage: 'done', detail: cachedDetail, cached: true, stale: true, staleAgeMs });
          return;
        }

        // Tier 4: Build from DB station fields (kept fresh by daily cron)
        emit({ stage: 'done', detail: buildBasicDetail(), cached: false, basic: true });
      } catch (err) {
        console.error('VinFast SSE stream error:', err);
        emit({ stage: 'error', code: 'INTERNAL_ERROR' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
