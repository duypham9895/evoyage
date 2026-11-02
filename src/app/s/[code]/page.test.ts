import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Metadata } from 'next';

const SHARED_PARAMS = 'start=Ho%20Chi%20Minh&end=Vung%20Tau&slat=10.7769&slng=106.7009&elat=10.346&elng=107.0843&vid=veh-1';

vi.mock('@/lib/short-url', () => ({
  resolveShortUrl: vi.fn(),
  incrementAccessCount: vi.fn(),
}));

// next/navigation's redirect() throws to abort rendering; mirror that.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { resolveShortUrl } from '@/lib/short-url';
import * as shortUrlPage from './page';

const params = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.mocked(resolveShortUrl).mockResolvedValue({ status: 'ok', params: SHARED_PARAMS });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/s/[code] short link', () => {
  it('redirects a resolved code to /plan with the stored trip params', async () => {
    await expect(shortUrlPage.default(params('AbC1234'))).rejects.toThrow(
      `NEXT_REDIRECT:/plan?${SHARED_PARAMS}`,
    );
  });

  it('redirects a malformed code to /plan?error=link-not-found', async () => {
    await expect(shortUrlPage.default(params('bad!'))).rejects.toThrow(
      'NEXT_REDIRECT:/plan?error=link-not-found',
    );
  });

  it('redirects an unknown code to /plan?error=link-not-found', async () => {
    vi.mocked(resolveShortUrl).mockResolvedValue({ status: 'not-found' });
    await expect(shortUrlPage.default(params('AbC1234'))).rejects.toThrow(
      'NEXT_REDIRECT:/plan?error=link-not-found',
    );
  });

  it('redirects an expired code to /plan?error=link-expired, not link-not-found', async () => {
    vi.mocked(resolveShortUrl).mockResolvedValue({ status: 'expired' });
    await expect(shortUrlPage.default(params('AbC1234'))).rejects.toThrow(
      'NEXT_REDIRECT:/plan?error=link-expired',
    );
  });

  it('redirects to /plan?error=link-unavailable when resolving the code throws (e.g. DB down)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(resolveShortUrl).mockRejectedValue(new Error('db down'));
    await expect(shortUrlPage.default(params('AbC1234'))).rejects.toThrow(
      'NEXT_REDIRECT:/plan?error=link-unavailable',
    );
  });

  // BUG(p2-sharing-flow): shared links serve no OG metadata (no og:image, no trip title), so chat apps show no preview. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-sharing-flow.md
  // If the fix serves OG tags from /plan instead of /s/[code], rewrite this test against that route rather than deleting it.
  it.fails('exposes trip-specific OG metadata with an og:image for a resolved short link', async () => {
    const generateMetadata = (shortUrlPage as Record<string, unknown>).generateMetadata as
      | ((p: ReturnType<typeof params>) => Promise<Metadata>)
      | undefined;
    expect(generateMetadata).toBeTypeOf('function');

    const metadata = await generateMetadata!(params('AbC1234'));
    expect(metadata.openGraph?.images).toBeTruthy();
    expect(String(metadata.openGraph?.title ?? '')).toMatch(/Ho Chi Minh/);
  });
});
