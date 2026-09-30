import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Wrap the real timingSafeEqual so a test can assert the comparison is
// constant-time (fixed-width buffers, no short-circuit) without measuring wall
// clock, which would be flaky. Behaviour is unchanged — the spy delegates.
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

import { timingSafeEqual } from 'crypto';
import { verifyCronSecret } from './cron-auth';

const mockTimingSafeEqual = vi.mocked(timingSafeEqual);

const ORIGINAL_SECRET = process.env.CRON_SECRET;

function makeRequest(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new NextRequest('http://localhost/api/cron/poll-station-status', { headers });
}

beforeEach(() => {
  mockTimingSafeEqual.mockClear();
  process.env.CRON_SECRET = 'a'.repeat(64);
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.restoreAllMocks();
});

describe('verifyCronSecret', () => {
  describe('accepts only the exact bearer token', () => {
    it('returns true for the correct `Bearer <secret>` header', () => {
      const secret = 'correct-horse-battery-staple-0123456789';
      process.env.CRON_SECRET = secret;

      expect(verifyCronSecret(makeRequest(`Bearer ${secret}`))).toBe(true);
    });

    it('returns false for a wrong secret of the same length', () => {
      process.env.CRON_SECRET = 'a'.repeat(64);

      expect(verifyCronSecret(makeRequest(`Bearer ${'b'.repeat(64)}`))).toBe(false);
    });

    it('returns false when only the last character differs', () => {
      const secret = 'a'.repeat(63) + 'x';
      process.env.CRON_SECRET = secret;

      expect(verifyCronSecret(makeRequest(`Bearer ${'a'.repeat(63)}y`))).toBe(false);
    });

    it('returns false for the bare secret without the `Bearer ` prefix', () => {
      const secret = 'a'.repeat(64);
      process.env.CRON_SECRET = secret;

      expect(verifyCronSecret(makeRequest(secret))).toBe(false);
    });

    it('returns false for a lowercase `bearer ` prefix (scheme is case-sensitive here)', () => {
      const secret = 'a'.repeat(64);
      process.env.CRON_SECRET = secret;

      expect(verifyCronSecret(makeRequest(`bearer ${secret}`))).toBe(false);
    });

    it('returns false when the secret is a prefix of the provided token', () => {
      const secret = 'a'.repeat(64);
      process.env.CRON_SECRET = secret;

      expect(verifyCronSecret(makeRequest(`Bearer ${secret}extra`))).toBe(false);
    });
  });

  describe('rejects missing credentials', () => {
    it('returns false when the Authorization header is absent', () => {
      expect(verifyCronSecret(makeRequest())).toBe(false);
    });

    it('returns false for an empty Authorization header', () => {
      expect(verifyCronSecret(makeRequest(''))).toBe(false);
    });

    it('returns false for a `Bearer ` header with an empty token', () => {
      process.env.CRON_SECRET = 'a'.repeat(64);

      expect(verifyCronSecret(makeRequest('Bearer '))).toBe(false);
    });
  });

  describe('rejects everything when CRON_SECRET is not configured', () => {
    it('returns false when CRON_SECRET is unset, even with a plausible header', () => {
      delete process.env.CRON_SECRET;
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(verifyCronSecret(makeRequest('Bearer anything'))).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns false when CRON_SECRET is an empty string', () => {
      process.env.CRON_SECRET = '';
      vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(verifyCronSecret(makeRequest('Bearer '))).toBe(false);
    });

    it('returns false when CRON_SECRET is unset and no header is sent', () => {
      delete process.env.CRON_SECRET;
      vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(verifyCronSecret(makeRequest())).toBe(false);
    });

    it('does not reach the cryptographic comparison when CRON_SECRET is unset', () => {
      delete process.env.CRON_SECRET;
      vi.spyOn(console, 'error').mockImplementation(() => {});

      verifyCronSecret(makeRequest('Bearer anything'));

      expect(mockTimingSafeEqual).not.toHaveBeenCalled();
    });
  });

  describe('compares in constant time', () => {
    it('delegates the comparison to crypto.timingSafeEqual', () => {
      const secret = 'a'.repeat(64);
      process.env.CRON_SECRET = secret;

      verifyCronSecret(makeRequest(`Bearer ${secret}`));

      expect(mockTimingSafeEqual).toHaveBeenCalledTimes(1);
    });

    it('passes two equal-length buffers, so the comparison cannot leak length', () => {
      process.env.CRON_SECRET = 'a'.repeat(64);

      verifyCronSecret(makeRequest('Bearer short'));

      const [bufA, bufB] = mockTimingSafeEqual.mock.calls[0]!;
      expect(Buffer.isBuffer(bufA)).toBe(true);
      expect(Buffer.isBuffer(bufB)).toBe(true);
      expect((bufA as Buffer).length).toBe((bufB as Buffer).length);
    });

    it('uses a fixed-width comparison regardless of how long the provided header is', () => {
      process.env.CRON_SECRET = 'a'.repeat(64);

      verifyCronSecret(makeRequest('Bearer short'));
      const widthForShort = (mockTimingSafeEqual.mock.calls[0]![0] as Buffer).length;

      mockTimingSafeEqual.mockClear();
      verifyCronSecret(makeRequest(`Bearer ${'z'.repeat(50_000)}`));
      const widthForLong = (mockTimingSafeEqual.mock.calls[0]![0] as Buffer).length;

      expect(widthForLong).toBe(widthForShort);
    });
  });

  describe('is not fooled by secrets longer than the comparison buffer', () => {
    // Regression: the gate used to copy both sides into a fixed 512-byte
    // buffer, so any two headers agreeing on the first 512 bytes compared
    // equal. The trailing length check could not catch divergence past
    // byte 512, so a long secret was an auth bypass.
    it('rejects a header that matches the first 512 bytes but differs after, at equal length', () => {
      const secret = 'a'.repeat(600);
      process.env.CRON_SECRET = secret;

      // `Bearer ` (7) + 505 leading 'a's fills the first 512 bytes exactly.
      const forged = `Bearer ${'a'.repeat(505)}${'b'.repeat(95)}`;
      const expected = `Bearer ${secret}`;

      expect(forged.length).toBe(expected.length);
      expect(forged.slice(0, 512)).toBe(expected.slice(0, 512));
      expect(verifyCronSecret(makeRequest(forged))).toBe(false);
    });

    it('still accepts the correct header when the secret exceeds 512 bytes', () => {
      const secret = 'a'.repeat(600);
      process.env.CRON_SECRET = secret;

      expect(verifyCronSecret(makeRequest(`Bearer ${secret}`))).toBe(true);
    });

    it('rejects a header that differs only in its final byte of a 2000-byte secret', () => {
      const secret = 'q'.repeat(2000);
      process.env.CRON_SECRET = secret;

      expect(verifyCronSecret(makeRequest(`Bearer ${'q'.repeat(1999)}r`))).toBe(false);
    });

    it('does not truncate: a secret longer than 512 bytes is compared in full', () => {
      const secret = 'a'.repeat(1000);
      process.env.CRON_SECRET = secret;

      // Correct for the first 512 bytes, then garbage, padded to equal length.
      const forged = `Bearer ${'a'.repeat(505)}${'c'.repeat(495)}`;
      expect(verifyCronSecret(makeRequest(forged))).toBe(false);
    });
  });
});
