import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDirectionsMapboxFromCoords } from './mapbox-directions-fallback';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ORIGIN = { lat: 10.762, lng: 106.66 }; // Saigon
const DESTINATION = { lat: 16.054, lng: 108.202 }; // Da Nang
const ACCESS_TOKEN = 'pk.test_token';
const SAMPLE_POLYLINE_5 = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'; // precision-5 sample

function makeOkResponse(routes: Array<{ geometry: string; distance: number; duration: number }>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ code: 'Ok', routes }),
  };
}

describe('fetchDirectionsMapboxFromCoords (OSRM fallback client)', () => {
  it('builds URL with lng,lat order, geometries=polyline (precision-5), and overview=full', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse([{ geometry: SAMPLE_POLYLINE_5, distance: 850000, duration: 36000 }]),
    );

    await fetchDirectionsMapboxFromCoords(
      ORIGIN.lat, ORIGIN.lng, DESTINATION.lat, DESTINATION.lng, ACCESS_TOKEN,
      'Saigon', 'Da Nang',
    );

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('api.mapbox.com/directions/v5/mapbox/driving');
    expect(calledUrl).toContain('106.66,10.762'); // origin lng,lat
    expect(calledUrl).toContain('108.202,16.054'); // destination lng,lat
    expect(calledUrl).toContain('geometries=polyline'); // precision-5, NOT polyline6
    expect(calledUrl).not.toContain('polyline6');
    expect(calledUrl).toContain('overview=full');
    expect(calledUrl).toContain(`access_token=${ACCESS_TOKEN}`);
  });

  it('uses driving profile, NOT driving-traffic', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse([{ geometry: SAMPLE_POLYLINE_5, distance: 100, duration: 60 }]),
    );

    await fetchDirectionsMapboxFromCoords(
      ORIGIN.lat, ORIGIN.lng, DESTINATION.lat, DESTINATION.lng, ACCESS_TOKEN,
      'A', 'B',
    );

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/mapbox/driving/');
    expect(calledUrl).not.toContain('driving-traffic');
  });

  it('returns polyline string unchanged (no pre-encoding)', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse([{ geometry: SAMPLE_POLYLINE_5, distance: 850123, duration: 36050 }]),
    );

    const result = await fetchDirectionsMapboxFromCoords(
      ORIGIN.lat, ORIGIN.lng, DESTINATION.lat, DESTINATION.lng, ACCESS_TOKEN,
      'Saigon', 'Da Nang',
    );

    expect(result.polyline).toBe(SAMPLE_POLYLINE_5);
    expect(result.distanceMeters).toBe(850123);
    expect(result.durationSeconds).toBe(36050);
  });

  it('preserves the provided start/end addresses (does not overwrite with coords)', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse([{ geometry: SAMPLE_POLYLINE_5, distance: 100, duration: 60 }]),
    );

    const result = await fetchDirectionsMapboxFromCoords(
      ORIGIN.lat, ORIGIN.lng, DESTINATION.lat, DESTINATION.lng, ACCESS_TOKEN,
      'Saigon, Vietnam', 'Da Nang, Vietnam',
    );

    expect(result.startAddress).toBe('Saigon, Vietnam');
    expect(result.endAddress).toBe('Da Nang, Vietnam');
  });

  it('throws with status code on non-2xx response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(
      fetchDirectionsMapboxFromCoords(
        ORIGIN.lat, ORIGIN.lng, DESTINATION.lat, DESTINATION.lng, ACCESS_TOKEN,
        'A', 'B',
      ),
    ).rejects.toThrow(/Mapbox Directions/);
  });

  it('throws when API returns no routes', async () => {
    mockFetch.mockResolvedValue(makeOkResponse([]));

    await expect(
      fetchDirectionsMapboxFromCoords(
        ORIGIN.lat, ORIGIN.lng, DESTINATION.lat, DESTINATION.lng, ACCESS_TOKEN,
        'A', 'B',
      ),
    ).rejects.toThrow(/No route found/);
  });

  it('passes AbortController signal to fetch', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse([{ geometry: SAMPLE_POLYLINE_5, distance: 100, duration: 60 }]),
    );

    await fetchDirectionsMapboxFromCoords(
      ORIGIN.lat, ORIGIN.lng, DESTINATION.lat, DESTINATION.lng, ACCESS_TOKEN,
      'A', 'B',
    );

    const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('rounds distance and duration to integers (matches OSRM contract)', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse([{ geometry: SAMPLE_POLYLINE_5, distance: 850123.7, duration: 36050.4 }]),
    );

    const result = await fetchDirectionsMapboxFromCoords(
      ORIGIN.lat, ORIGIN.lng, DESTINATION.lat, DESTINATION.lng, ACCESS_TOKEN,
      'A', 'B',
    );

    expect(result.distanceMeters).toBe(850124);
    expect(result.durationSeconds).toBe(36050);
  });
});
