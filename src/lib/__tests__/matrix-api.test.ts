import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMatrixDurations } from '../matrix-api';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

const SOURCE = { lat: 10.762, lng: 106.66 };
const DESTINATIONS = [
  { lat: 10.8, lng: 106.7 },
  { lat: 10.9, lng: 106.8 },
];
const ACCESS_TOKEN = 'pk.test_token';

function makeOkResponse(durations: number[][], distances: number[][]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        code: 'Ok',
        durations,
        distances,
      }),
  };
}

describe('fetchMatrixDurations', () => {
  it('constructs correct URL with lng,lat order and sources=0', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse([[0, 300, 600]], [[0, 5000, 10000]]),
    );

    await fetchMatrixDurations(SOURCE, DESTINATIONS, ACCESS_TOKEN);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('106.66,10.762'); // source in lng,lat
    expect(calledUrl).toContain('106.7,10.8'); // dest 1 in lng,lat
    expect(calledUrl).toContain('106.8,10.9'); // dest 2 in lng,lat
    expect(calledUrl).toContain('sources=0');
    expect(calledUrl).toContain('annotations=duration,distance');
    expect(calledUrl).toContain(`access_token=${ACCESS_TOKEN}`);
  });

  it('parses response extracting row 0 from 2D arrays', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse([[0, 300, 600]], [[0, 5000, 10000]]),
    );

    const result = await fetchMatrixDurations(SOURCE, DESTINATIONS, ACCESS_TOKEN);

    expect(result.durations).toEqual([0, 300, 600]);
    expect(result.distances).toEqual([0, 5000, 10000]);
  });

  it('returns empty arrays for empty destinations', async () => {
    const result = await fetchMatrixDurations(SOURCE, [], ACCESS_TOKEN);

    expect(result.durations).toEqual([]);
    expect(result.distances).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws when exceeding 24 destinations', async () => {
    const tooMany = Array.from({ length: 25 }, (_, i) => ({
      lat: 10 + i * 0.1,
      lng: 106 + i * 0.1,
    }));

    await expect(
      fetchMatrixDurations(SOURCE, tooMany, ACCESS_TOKEN),
    ).rejects.toThrow('Too many destinations: 25. Maximum is 24.');
  });

  it('throws on non-OK HTTP response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
    });

    await expect(
      fetchMatrixDurations(SOURCE, DESTINATIONS, ACCESS_TOKEN),
    ).rejects.toThrow('Mapbox Matrix API error: 422 Unprocessable Entity');
  });

  it('throws when API returns non-Ok code', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'InvalidInput',
          durations: [],
          distances: [],
        }),
    });

    await expect(
      fetchMatrixDurations(SOURCE, DESTINATIONS, ACCESS_TOKEN),
    ).rejects.toThrow('Mapbox Matrix API returned code: InvalidInput');
  });

  it('accepts exactly 24 destinations', async () => {
    const maxDests = Array.from({ length: 24 }, (_, i) => ({
      lat: 10 + i * 0.01,
      lng: 106 + i * 0.01,
    }));

    const durations = [Array.from({ length: 25 }, (_, i) => i * 100)];
    const distances = [Array.from({ length: 25 }, (_, i) => i * 1000)];

    mockFetch.mockResolvedValue(makeOkResponse(durations, distances));

    const result = await fetchMatrixDurations(SOURCE, maxDests, ACCESS_TOKEN);
    expect(result.durations).toHaveLength(25);
    expect(result.distances).toHaveLength(25);
  });

  it('passes AbortController signal to fetch', async () => {
    mockFetch.mockResolvedValue(
      makeOkResponse([[0, 300]], [[0, 5000]]),
    );

    await fetchMatrixDurations(SOURCE, [DESTINATIONS[0]], ACCESS_TOKEN);

    const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
    expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
  });
});
