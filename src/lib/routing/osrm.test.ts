import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDirections, fetchDirectionsFromCoords } from './osrm';
import { decodePolyline, encodePolyline } from '@/lib/geo/polyline';

const mockFetch = vi.fn();
const SAMPLE_POLYLINE_5 = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

// Geocode response (Nominatim)
function nominatimResponse(lat: number, lng: number) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve([{ lat: String(lat), lon: String(lng) }]),
  };
}

function osrmOkResponse() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        code: 'Ok',
        routes: [{ geometry: SAMPLE_POLYLINE_5, distance: 100000, duration: 5400 }],
      }),
    headers: { get: () => null },
  };
}

function osrmErrorResponse(status: number) {
  return {
    ok: false,
    status,
    statusText: `Error ${status}`,
    json: () => Promise.resolve({}),
    headers: { get: () => null },
  };
}

function mapboxOkResponse() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        code: 'Ok',
        routes: [{ geometry: SAMPLE_POLYLINE_5, distance: 105000, duration: 5500 }],
      }),
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.MAPBOX_ACCESS_TOKEN = 'pk.test_token';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchDirections — OSRM happy path', () => {
  it('returns provider="osrm" when OSRM succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66)) // origin geocode
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202)) // dest geocode
      .mockResolvedValueOnce(osrmOkResponse()); // OSRM route

    const result = await fetchDirections('Saigon', 'Da Nang');

    expect(result.provider).toBe('osrm');
    expect(result.polyline).toBe(SAMPLE_POLYLINE_5);
    expect(result.distanceMeters).toBe(100000);
    expect(result.durationSeconds).toBe(5400);
    expect(result.startAddress).toBe('Saigon');
    expect(result.endAddress).toBe('Da Nang');
  });

  it('fetchDirectionsFromCoords calls OSRM directly without Nominatim geocoding', async () => {
    mockFetch.mockResolvedValueOnce(osrmOkResponse());

    const result = await fetchDirectionsFromCoords(
      { lat: 10.762, lng: 106.66 },
      { lat: 11.94, lng: 108.45 },
      'Ho Chi Minh City',
      'Da Lat',
    );

    expect(result.provider).toBe('osrm');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain('router.project-osrm.org');
  });

  it('does NOT call Mapbox when OSRM succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmOkResponse());

    await fetchDirections('Saigon', 'Da Nang');

    const calls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
  });
});

describe('fetchDirections — Mapbox fallback on OSRM 5xx', () => {
  it('falls back to Mapbox when OSRM returns 502', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmErrorResponse(502)) // OSRM Bad Gateway
      .mockResolvedValueOnce(mapboxOkResponse()); // Mapbox fallback

    const result = await fetchDirections('Saigon', 'Da Nang');

    expect(result.provider).toBe('mapbox');
    expect(result.polyline).toBe(SAMPLE_POLYLINE_5);
    expect(result.distanceMeters).toBe(105000);
    expect(result.durationSeconds).toBe(5500);
    expect(result.startAddress).toBe('Saigon');
    expect(result.endAddress).toBe('Da Nang');
  });

  it('falls back to Mapbox when OSRM returns 503', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmErrorResponse(503))
      .mockResolvedValueOnce(mapboxOkResponse());

    const result = await fetchDirections('Saigon', 'Da Nang');
    expect(result.provider).toBe('mapbox');
  });

  it('falls back to Mapbox when OSRM returns 504', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmErrorResponse(504))
      .mockResolvedValueOnce(mapboxOkResponse());

    const result = await fetchDirections('Saigon', 'Da Nang');
    expect(result.provider).toBe('mapbox');
  });

  it('falls back to Mapbox when OSRM fetch throws (network failure)', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockRejectedValueOnce(new Error('ECONNREFUSED')) // OSRM network failure
      .mockResolvedValueOnce(mapboxOkResponse());

    const result = await fetchDirections('Saigon', 'Da Nang');
    expect(result.provider).toBe('mapbox');
  });

  it('logs a warning when falling back to Mapbox', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmErrorResponse(502))
      .mockResolvedValueOnce(mapboxOkResponse());

    await fetchDirections('Saigon', 'Da Nang');

    expect(warnSpy).toHaveBeenCalled();
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toMatch(/OSRM|fallback|Mapbox/i);
  });
});

describe('fetchDirections — does NOT fall back on OSRM 4xx', () => {
  it('throws (not falls back) when OSRM returns 400', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmErrorResponse(400));

    await expect(fetchDirections('Saigon', 'Da Nang')).rejects.toThrow(/OSRM/);

    // Should not have attempted Mapbox
    const calls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
  });

  it('throws (not falls back) when OSRM returns 404', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmErrorResponse(404));

    await expect(fetchDirections('Saigon', 'Da Nang')).rejects.toThrow(/OSRM/);

    const calls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
  });

  it('throws (not falls back) when OSRM returns 422 (no route)', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmErrorResponse(422));

    await expect(fetchDirections('Saigon', 'Da Nang')).rejects.toThrow(/OSRM/);

    const calls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
  });
});

describe('fetchDirections — fallback failure handling', () => {
  it('throws original OSRM error if Mapbox fallback also fails', async () => {
    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmErrorResponse(502))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Mapbox Internal Error',
      });

    await expect(fetchDirections('Saigon', 'Da Nang')).rejects.toThrow();
  });

  it('throws OSRM error when MAPBOX_ACCESS_TOKEN is missing', async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    mockFetch
      .mockResolvedValueOnce(nominatimResponse(10.762, 106.66))
      .mockResolvedValueOnce(nominatimResponse(16.054, 108.202))
      .mockResolvedValueOnce(osrmErrorResponse(502));

    await expect(fetchDirections('Saigon', 'Da Nang')).rejects.toThrow(/OSRM/);

    // Should not have attempted Mapbox without a token
    const calls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
  });
});

describe('fetchDirectionsFromCoords — route must stay inside Vietnam', () => {
  // Points sampled from the real public-OSRM answer for HCM -> Ha Noi
  // (2026-11-01): Kratie/Stung Treng (Cambodia), Pakse/Savannakhet/Thakhek (Laos).
  const CROSS_BORDER_ROUTE = [
    { lat: 10.7726, lng: 106.698 },
    { lat: 12.94601, lng: 106.17561 },
    { lat: 14.43832, lng: 105.886 },
    { lat: 15.11911, lng: 105.84682 },
    { lat: 16.22227, lng: 105.25832 },
    { lat: 16.76257, lng: 104.90247 },
    { lat: 17.42388, lng: 104.84919 },
    { lat: 21.0285, lng: 105.8542 },
  ];
  // Coastal QL1A shape, as Mapbox returns for the same trip.
  const VIETNAM_ROUTE = [
    { lat: 10.7726, lng: 106.698 },
    { lat: 13.09, lng: 109.26 },
    { lat: 15.85, lng: 108.19 },
    { lat: 21.0285, lng: 105.8542 },
  ];

  /** Between lat 12 and 17.5, anything west of lng 106 is Cambodia or Laos. */
  function pointsInCambodiaOrLaos(points: readonly { lat: number; lng: number }[]) {
    return points.filter((p) => p.lat >= 12 && p.lat <= 17.5 && p.lng < 106);
  }

  function routeResponse(points: readonly { lat: number; lng: number }[], distance: number) {
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          code: 'Ok',
          routes: [{ geometry: encodePolyline(points, 5), distance, duration: 80_000 }],
        }),
      headers: { get: () => null },
    };
  }

  // BUG(p1-osrm-routes-through-cambodia-laos): OSRM's cross-border HCM->Ha Noi route is returned unchecked. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p1-osrm-routes-through-cambodia-laos.md
  it.fails('never resolves HCM -> Ha Noi with a polyline through Cambodia/Laos', async () => {
    // Only external I/O is mocked. A plain 2-point OSRM request gets the real
    // cross-border answer; OSRM with extra VN waypoints, or Mapbox, gets the
    // in-country route, so any of the documented fix directions can pass.
    mockFetch.mockImplementation((url: string) => {
      const isOsrm = url.includes('router.project-osrm.org');
      const coordCount = (url.split('/').pop() ?? '').split('?')[0].split(';').length;
      if (isOsrm && coordCount <= 2) return Promise.resolve(routeResponse(CROSS_BORDER_ROUTE, 1_493_712));
      return Promise.resolve(routeResponse(VIETNAM_ROUTE, 1_637_900));
    });

    const result = await fetchDirectionsFromCoords(
      { lat: 10.7726, lng: 106.698 },
      { lat: 21.0285, lng: 105.8542 },
      'Chợ Bến Thành, TP.HCM',
      'Hồ Hoàn Kiếm, Hà Nội',
    ).catch(() => null); // rejecting a cross-border route is also acceptable

    if (result) {
      expect(pointsInCambodiaOrLaos(decodePolyline(result.polyline, 5))).toEqual([]);
    }
  });
});
