import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  queryNearbyPois,
  OverpassError,
} from './overpass-client';

const HCM = { lat: 10.78, lng: 106.7 };

const SAMPLE_RESPONSE = {
  elements: [
    {
      type: 'node',
      id: 100001,
      lat: 10.7794,
      lon: 106.7009,
      tags: {
        name: 'Phở 24',
        amenity: 'restaurant',
        cuisine: 'vietnamese',
      },
    },
    {
      type: 'node',
      id: 100002,
      lat: 10.7785,
      lon: 106.7012,
      tags: {
        amenity: 'atm',
        operator: 'Vietcombank',
      },
    },
    {
      // Non-node elements should be filtered
      type: 'way',
      id: 999,
      tags: { amenity: 'restaurant' },
    },
  ],
};

describe('queryNearbyPois', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed POIs on success', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    );

    const pois = await queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 });

    expect(pois).toHaveLength(2); // way is filtered out
    expect(pois[0]).toMatchObject({
      id: 100001,
      lat: 10.7794,
      lng: 106.7009,
      name: 'Phở 24',
      amenity: 'restaurant',
    });
    expect(pois[1]).toMatchObject({
      id: 100002,
      amenity: 'atm',
    });
  });

  it('preserves all OSM tags', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }),
    );

    const pois = await queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 });

    expect(pois[0]?.tags).toEqual({
      name: 'Phở 24',
      amenity: 'restaurant',
      cuisine: 'vietnamese',
    });
    expect(pois[1]?.tags.operator).toBe('Vietcombank');
  });

  it('builds an Overpass QL query targeting the expected amenity types', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ elements: [] }), { status: 200 }),
    );

    await queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 });

    const [, init] = fetchSpy.mock.calls[0]!;
    const body = init.body as string;
    expect(body).toContain('out:json');
    expect(body).toContain('around:500');
    expect(body).toContain(`${HCM.lat}`);
    expect(body).toContain(`${HCM.lng}`);
    expect(body).toMatch(/restaurant.*cafe.*fast_food.*atm.*toilets.*fuel.*pharmacy/);
  });

  it('returns an empty array when Overpass returns no elements', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ elements: [] }), { status: 200 }),
    );

    const pois = await queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 });
    expect(pois).toEqual([]);
  });

  it('throws OverpassError(rate_limited) on 429', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }));

    await expect(
      queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500, retries: 0 }),
    ).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('throws OverpassError(network_error) on 5xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));

    await expect(
      queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500, retries: 0 }),
    ).rejects.toMatchObject({ kind: 'network_error' });
  });

  it('throws OverpassError(parse_error) on malformed JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not json', { status: 200 }));

    await expect(
      queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 }),
    ).rejects.toMatchObject({ kind: 'parse_error' });
  });

  it('throws OverpassError on connection failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET'));

    const error = await queryNearbyPois({
      lat: HCM.lat,
      lng: HCM.lng,
      radiusMeters: 500,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OverpassError);
    expect((error as OverpassError).kind).toBe('network_error');
  });

  it('uses POST method with text/plain content-type (Overpass requirement)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ elements: [] }), { status: 200 }),
    );

    await queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 });

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toContain('text/plain');
  });

  it('sends a User-Agent header (Overpass returns 406 without one — regression for prod bug)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ elements: [] }), { status: 200 }),
    );

    await queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 });

    const [, init] = fetchSpy.mock.calls[0]!;
    const ua = (init.headers as Record<string, string>)['User-Agent'];
    expect(ua).toBeTruthy();
    expect(ua).toContain('eVoyage');
  });

  // BUG(p1-overpass-amenities-and-warm-pois): AbortSignal.timeout rejects with name 'TimeoutError', but the client only checks 'AbortError', so timeouts are reported as network_error. See docs/bugs/2026-11-01-p1-overpass-amenities-and-warm-pois.md
  it('throws OverpassError(timeout) when the request times out (AbortSignal.timeout -> TimeoutError)', async () => {
    // This is exactly what Node's fetch rejects with when AbortSignal.timeout fires.
    fetchSpy.mockRejectedValueOnce(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );

    await expect(
      queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  // BUG(p1-overpass-amenities-and-warm-pois): a single transient 502 "at capacity" from overpass-api.de fails the whole query; no retry/backoff or mirror fallback. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-overpass-amenities-and-warm-pois.md
  it('recovers from a transient 502 (retry with backoff or mirror fallback) and returns POIs', async () => {
    vi.useFakeTimers();
    try {
      fetchSpy
        .mockResolvedValueOnce(
          new Response('This Overpass API server is currently at capacity', { status: 502 }),
        )
        .mockResolvedValue(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }));

      const result = queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 });
      // Keep the rejection handled while timers are flushed.
      const settled = result.then(
        (pois) => ({ ok: true as const, pois }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      await vi.runAllTimersAsync();
      const outcome = await settled;

      expect(outcome.ok).toBe(true);
      expect(outcome.ok && outcome.pois).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('with retries: 0, makes a single request and does not wait (interactive route budget)', async () => {
    fetchSpy.mockResolvedValue(new Response('Bad Gateway', { status: 502 }));

    await expect(
      queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500, retries: 0 }),
    ).rejects.toMatchObject({ kind: 'network_error', statusCode: 502 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries a 502 at most once by default, then throws the last error', async () => {
    vi.useFakeTimers();
    try {
      fetchSpy.mockImplementation(async () => new Response('Bad Gateway', { status: 502 }));

      const settled = queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 }).catch(
        (e: unknown) => e,
      );
      await vi.runAllTimersAsync();
      const error = await settled;

      expect(error).toMatchObject({ kind: 'network_error', statusCode: 502 });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry a non-transient 4xx', async () => {
    fetchSpy.mockImplementation(async () => new Response('Bad Request', { status: 400 }));

    await expect(
      queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 }),
    ).rejects.toMatchObject({ kind: 'network_error', statusCode: 400 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a timeout (would double the wait)', async () => {
    fetchSpy.mockRejectedValue(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );

    await expect(
      queryNearbyPois({ lat: HCM.lat, lng: HCM.lng, radiusMeters: 500 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('passes a custom timeoutMs to AbortSignal.timeout and reports it in the timeout message', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    fetchSpy.mockRejectedValueOnce(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    );

    const error = await queryNearbyPois({
      lat: HCM.lat,
      lng: HCM.lng,
      radiusMeters: 500,
      timeoutMs: 8_000,
    }).catch((e: unknown) => e);

    expect(timeoutSpy).toHaveBeenCalledWith(8_000);
    expect((error as OverpassError).message).toContain('8000ms');
    timeoutSpy.mockRestore();
  });
});
