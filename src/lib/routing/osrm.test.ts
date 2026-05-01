import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDirections } from './osrm';

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
