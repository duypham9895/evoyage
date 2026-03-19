/**
 * Short URL generation and database operations.
 * Uses nanoid with base62 alphabet for 7-character codes.
 */
import { customAlphabet } from 'nanoid';
import { prisma } from '@/lib/prisma';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_LENGTH = 7;
const MAX_RETRIES = 3;
const MAX_PARAMS_LENGTH = 4000;

const generateCode = customAlphabet(ALPHABET, CODE_LENGTH);

export interface CreateShortUrlResult {
  readonly code: string;
  readonly url: string;
}

/**
 * Validate that params is a well-formed URL search params string.
 * Must be non-empty, within size limit, and contain at least 'start' or 'end'.
 */
export function validateParams(params: unknown): { valid: true; params: string } | { valid: false; error: string } {
  if (typeof params !== 'string' || params.length === 0) {
    return { valid: false, error: 'params must be a non-empty string' };
  }

  if (params.length > MAX_PARAMS_LENGTH) {
    return { valid: false, error: `params exceeds maximum length of ${MAX_PARAMS_LENGTH} characters` };
  }

  // Verify it's parseable as URL search params
  try {
    const parsed = new URLSearchParams(params);
    const hasStart = parsed.has('start');
    const hasEnd = parsed.has('end');
    if (!hasStart && !hasEnd) {
      return { valid: false, error: 'params must contain at least start or end' };
    }
  } catch {
    return { valid: false, error: 'params is not a valid URL search params string' };
  }

  return { valid: true, params };
}

/**
 * Create a short URL for the given params string.
 * Retries up to MAX_RETRIES times on code collision.
 */
export async function createShortUrl(params: string, baseUrl: string): Promise<CreateShortUrlResult> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateCode();

    try {
      await prisma.shortUrl.create({
        data: { code, params },
      });

      return {
        code,
        url: `${baseUrl}/s/${code}`,
      };
    } catch (err) {
      // Retry on unique constraint violation (code collision)
      const isUniqueViolation =
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'P2002';

      if (!isUniqueViolation || attempt === MAX_RETRIES - 1) {
        throw err;
      }
      // Otherwise retry with a new code
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error('Failed to create short URL after maximum retries');
}

/**
 * Resolve a short code to its stored params string.
 * Returns null if not found or expired.
 */
export async function resolveShortUrl(code: string): Promise<string | null> {
  const record = await prisma.shortUrl.findUnique({
    where: { code },
    select: { params: true, expiresAt: true },
  });

  if (!record) return null;

  // Check expiration if set
  if (record.expiresAt && record.expiresAt < new Date()) {
    return null;
  }

  return record.params;
}

/**
 * Increment accessCount for a short URL (fire-and-forget).
 * Errors are logged but not thrown.
 */
export function incrementAccessCount(code: string): void {
  prisma.shortUrl
    .update({
      where: { code },
      data: { accessCount: { increment: 1 } },
    })
    .catch((err) => {
      console.error(`[short-url] Failed to increment access count for ${code}:`, err);
    });
}
