import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchPlaces } from './nominatim';

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for queries shorter than 2 characters', async () => {
    const results = await searchPlaces('H');
    expect(results).toEqual([]);
  });

  it('returns empty array for empty query', async () => {
    const results = await searchPlaces('');
    expect(results).toEqual([]);
  });

  it('returns empty array for whitespace-only query', async () => {
    const results = await searchPlaces('   ');
    expect(results).toEqual([]);
  });

  it('calls Nominatim API with correct parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchPlaces('Ha Noi');

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('nominatim.openstreetmap.org/search');
    expect(url).toContain('q=Ha+Noi');
    expect(url).toContain('countrycodes=vn');
    expect(url).toContain('format=json');
  });

  it('deduplicates results with same first 3 parts', async () => {
    const mockData = [
      { place_id: 1, display_name: 'Thủ Đức, HCM, Việt Nam, extra1', lat: '10.85', lon: '106.76', type: 'city' },
      { place_id: 2, display_name: 'Thủ Đức, HCM, Việt Nam, extra2', lat: '10.86', lon: '106.77', type: 'suburb' },
      { place_id: 3, display_name: 'Quận 1, HCM, Việt Nam', lat: '10.77', lon: '106.70', type: 'city' },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    }));

    const results = await searchPlaces('Thu Duc');
    // First two share "Thủ Đức, HCM, Việt Nam" — deduped to 1
    expect(results).toHaveLength(2);
    expect(results[0].placeId).toBe(1);
    expect(results[1].placeId).toBe(3);
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    }));

    await expect(searchPlaces('Ha Noi')).rejects.toThrow('Nominatim error: 429');
  });

  it('supports abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

    await expect(searchPlaces('Ha Noi', controller.signal)).rejects.toThrow();
  });

  it('parses lat/lng as numbers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { place_id: 1, display_name: 'Test Place', lat: '10.775', lon: '106.700', type: 'city' },
      ]),
    }));

    const results = await searchPlaces('test');
    expect(typeof results[0].lat).toBe('number');
    expect(typeof results[0].lng).toBe('number');
    expect(results[0].lat).toBeCloseTo(10.775);
    expect(results[0].lng).toBeCloseTo(106.700);
  });
});
