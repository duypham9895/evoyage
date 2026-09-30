import { createHash, timingSafeEqual } from 'crypto';
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

  // Compare fixed-width SHA-256 digests: constant-time for any secret length,
  // and no length leakage. Copying into a fixed 512-byte buffer instead would
  // silently truncate a longer secret, making any two headers that agree on
  // the first 512 bytes compare equal.
  const expectedDigest = createHash('sha256').update(expected).digest();
  const providedDigest = createHash('sha256').update(provided).digest();

  return timingSafeEqual(expectedDigest, providedDigest);
}
