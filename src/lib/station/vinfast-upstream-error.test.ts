import { describe, expect, it } from 'vitest';
import { VinfastApiError } from './vinfast-api-client';
import {
  classifyVinfastCronError,
  isTransientVinfastUpstreamError,
  normalizeVinfastBrowserError,
} from './vinfast-upstream-error';

describe('isTransientVinfastUpstreamError', () => {
  it('treats VinFast 5xx responses as transient upstream outages', () => {
    const err = new VinfastApiError('http_error', 'Upstream returned 500', 500);

    expect(isTransientVinfastUpstreamError(err)).toBe(true);
  });

  it('treats rate limits, network errors, and timeouts as transient outages', () => {
    expect(
      isTransientVinfastUpstreamError(
        new VinfastApiError('http_error', 'Upstream returned 429', 429),
      ),
    ).toBe(true);
    expect(
      isTransientVinfastUpstreamError(
        new VinfastApiError('network_error', 'Failed to fetch'),
      ),
    ).toBe(true);
    expect(
      isTransientVinfastUpstreamError(
        new VinfastApiError('timeout', 'Request exceeded 30000ms'),
      ),
    ).toBe(true);
  });

  it('does not hide auth, Cloudflare challenge, parse, or generic failures', () => {
    expect(
      isTransientVinfastUpstreamError(
        new VinfastApiError('http_error', 'Upstream returned 403', 403),
      ),
    ).toBe(false);
    expect(
      isTransientVinfastUpstreamError(
        new VinfastApiError('cloudflare_blocked', 'Challenge detected'),
      ),
    ).toBe(false);
    expect(
      isTransientVinfastUpstreamError(
        new VinfastApiError('parse_error', 'Response was not valid JSON'),
      ),
    ).toBe(false);
    expect(isTransientVinfastUpstreamError(new Error('DB unavailable'))).toBe(false);
  });
});

describe('classifyVinfastCronError', () => {
  it('turns transient VinFast upstream outages into a successful scheduled-job skip', () => {
    const outcome = classifyVinfastCronError(
      'Poll Station Status',
      new VinfastApiError('http_error', 'Upstream returned 500', 500),
    );

    expect(outcome).toMatchObject({
      action: 'skip',
      result: {
        ok: true,
        skipped: true,
        job: 'Poll Station Status',
        reason: 'vinfast_upstream_unavailable',
        error: 'Upstream returned 500',
      },
    });
    expect(outcome.warning).toContain('::warning');
  });

  it('keeps non-upstream failures as hard failures', () => {
    const outcome = classifyVinfastCronError(
      'Poll Station Status',
      new VinfastApiError('parse_error', 'Response was not valid JSON'),
    );

    expect(outcome).toEqual({ action: 'fail' });
  });
});

describe('normalizeVinfastBrowserError', () => {
  it('normalizes browser navigation timeouts into VinfastApiError timeout', () => {
    const err = normalizeVinfastBrowserError(
      new Error('page.goto: Timeout 30000ms exceeded.'),
    );

    expect(err).toMatchObject({ kind: 'timeout' });
  });

  it('normalizes browser fetch transport failures into VinfastApiError network_error', () => {
    const err = normalizeVinfastBrowserError(new Error('TypeError: Failed to fetch'));

    expect(err).toMatchObject({ kind: 'network_error' });
  });

  it('leaves unknown programmer errors untouched', () => {
    const err = new Error('someVariable is not defined');

    expect(normalizeVinfastBrowserError(err)).toBe(err);
  });
});
