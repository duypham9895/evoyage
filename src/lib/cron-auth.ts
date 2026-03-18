import { timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

/**
 * Verify the cron secret from Vercel Cron invocations.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */
export function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set');
    return false;
  }

  const expected = `Bearer ${cronSecret}`;
  const provided = authHeader ?? '';

  // Always compare fixed-size buffers to prevent length leakage
  const bufA = Buffer.alloc(512);
  const bufB = Buffer.alloc(512);
  Buffer.from(expected).copy(bufA);
  Buffer.from(provided).copy(bufB);

  return timingSafeEqual(bufA, bufB) && expected.length === provided.length;
}
