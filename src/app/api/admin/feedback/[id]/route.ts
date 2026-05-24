/**
 * PATCH /api/admin/feedback/[id]
 *
 * Updates the feedback workflow status. Gated by the same middleware that
 * gates /admin/* — the matcher in src/middleware.ts covers /admin/:path*
 * AND /api/admin/:path* through the explicit matcher entries below.
 *
 * Sets resolvedAt automatically when transitioning to RESOLVED.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const StatusSchema = z.enum(['NEW', 'IN_REVIEW', 'RESOLVED', 'CLOSED']);

const BodySchema = z.object({
  status: StatusSchema,
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  const existing = await prisma.feedback.findUnique({ where: { id }, select: { status: true } });
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const nextStatus = parsed.data.status;
  const updated = await prisma.feedback.update({
    where: { id },
    data: {
      status: nextStatus,
      resolvedAt:
        nextStatus === 'RESOLVED'
          ? new Date()
          : nextStatus === 'NEW' || nextStatus === 'IN_REVIEW'
            ? null
            : undefined,
    },
    select: { id: true, status: true, resolvedAt: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, ...updated });
}
