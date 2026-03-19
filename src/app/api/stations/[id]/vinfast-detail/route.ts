import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { fetchVinFastDetailWithProgress } from '@/lib/vinfast-client';
import { resolveEntityId } from '@/lib/vinfast-entity-resolver';

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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(data)));
      };

      try {
        emit({ stage: 'connecting' });

        const { entityId } = await resolveEntityId(stationId);

        if (!entityId) {
          emit({ stage: 'error', code: 'NO_ENTITY_ID' });
          controller.close();
          return;
        }

        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(entityId)) {
          emit({ stage: 'error', code: 'INVALID_ENTITY_ID' });
          controller.close();
          return;
        }

        const detail = await fetchVinFastDetailWithProgress(
          entityId,
          (stage, _message, method) => emit({ stage, method }),
          request.signal,
        );

        if (detail) {
          emit({ stage: 'parsing' });

          const serialized = JSON.stringify(detail);
          if (serialized.length <= 100_000) {
            const storeId = station.ocmId?.startsWith('vinfast-')
              ? station.ocmId.replace('vinfast-', '')
              : station.storeId ?? station.id;

            prisma.vinFastStationDetail.upsert({
              where: { entityId },
              update: { storeId, detail: serialized, fetchedAt: new Date() },
              create: { entityId, storeId, detail: serialized, fetchedAt: new Date() },
            }).catch(() => {});
          }

          emit({ stage: 'done', detail, cached: false });
        } else {
          const storeId = station.ocmId?.startsWith('vinfast-')
            ? station.ocmId.replace('vinfast-', '')
            : station.storeId ?? station.id;

          const cached = await prisma.vinFastStationDetail.findFirst({
            where: { storeId },
          });

          if (cached && cached.detail !== '{}') {
            const staleAgeMs = Date.now() - cached.fetchedAt.getTime();
            emit({
              stage: 'done',
              detail: JSON.parse(cached.detail),
              cached: true,
              stale: true,
              staleAgeMs,
            });
          } else {
            emit({ stage: 'error', code: 'CF_BLOCKED' });
          }
        }
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
