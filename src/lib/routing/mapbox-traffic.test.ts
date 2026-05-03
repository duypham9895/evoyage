import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTrafficAwareDirections, MapboxTrafficError } from './mapbox-traffic';

const ACCESS_TOKEN = 'pk.fake-test-token';
const HCM = { lat: 10.78, lng: 106.7 };
const DALAT = { lat: 11.94, lng: 108.45 };

const SAMPLE_OK_RESPONSE = {
  routes: [
    {
      geometry: 'somepolyline6',
      distance: 290_000,
      duration: 14_400, // 4 hours in seconds
    },
  ],
  waypoints: [
    { name: 'TP.HCM' },
    { name: 'Đà Lạt' },
  ],
};

describe('fetchTrafficAwareDirections', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hits the driving-traffic profile (not plain driving)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_OK_RESPONSE), { status: 200 }),
    );

    await fetchTrafficAwareDirections({
      origin: HCM,
      destination: DALAT,
      accessToken: ACCESS_TOKEN,
      departAt: new Date('2026-05-08T10:00:00+07:00'),
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain('mapbox/driving-traffic');
    expect(url).not.toContain('mapbox/driving?');
  });

  it('passes departure time as depart_at ISO 8601 query param', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_OK_RESPONSE), { status: 200 }),
    );

    const departAt = new Date('2026-05-08T10:00:00+07:00');
    await fetchTrafficAwareDirections({
      origin: HCM,
      destination: DALAT,
      accessToken: ACCESS_TOKEN,
      departAt,
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain(`depart_at=${encodeURIComponent(departAt.toISOString())}`);
  });

  it('omits depart_at when departAt is "now"', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_OK_RESPONSE), { status: 200 }),
    );

    await fetchTrafficAwareDirections({
      origin: HCM,
      destination: DALAT,
      accessToken: ACCESS_TOKEN,
      departAt: 'now',
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).not.toContain('depart_at');
  });

  it('returns parsed result with traffic-aware durationSeconds', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_OK_RESPONSE), { status: 200 }),
    );

    const result = await fetchTrafficAwareDirections({
      origin: HCM,
      destination: DALAT,
      accessToken: ACCESS_TOKEN,
      departAt: 'now',
    });

    expect(result.distanceMeters).toBe(290_000);
    expect(result.durationSeconds).toBe(14_400);
    expect(result.polyline).toBe('somepolyline6');
  });

  it('throws MapboxTrafficError when departAt is more than 7 days out', async () => {
    const eightDaysOut = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await expect(
      fetchTrafficAwareDirections({
        origin: HCM,
        destination: DALAT,
        accessToken: ACCESS_TOKEN,
        departAt: eightDaysOut,
      }),
    ).rejects.toMatchObject({ kind: 'depart_too_far' });
  });

  it('throws MapboxTrafficError on non-2xx upstream response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Internal Error', { status: 500 }));

    await expect(
      fetchTrafficAwareDirections({
        origin: HCM,
        destination: DALAT,
        accessToken: ACCESS_TOKEN,
        departAt: 'now',
      }),
    ).rejects.toMatchObject({ kind: 'upstream_error', statusCode: 500 });
  });

  it('throws MapboxTrafficError when response has no routes', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ routes: [] }), { status: 200 }),
    );

    await expect(
      fetchTrafficAwareDirections({
        origin: HCM,
        destination: DALAT,
        accessToken: ACCESS_TOKEN,
        departAt: 'now',
      }),
    ).rejects.toMatchObject({ kind: 'no_route' });
  });

  it('throws MapboxTrafficError on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(
      fetchTrafficAwareDirections({
        origin: HCM,
        destination: DALAT,
        accessToken: ACCESS_TOKEN,
        departAt: 'now',
      }),
    ).rejects.toMatchObject({ kind: 'network_error' });
  });
});
