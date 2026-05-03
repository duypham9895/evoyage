import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchVinfastLocators,
  serializeCookieHeader,
  VinfastApiError,
  type VinfastCookie,
  type VinfastLocatorRaw,
} from './vinfast-api-client';

const SAMPLE_STATION: VinfastLocatorRaw = {
  entity_id: 'ent-123',
  store_id: 'store-456',
  code: 'vfc_HCM0001',
  name: 'V-GREEN Quận 1',
  address: '123 Lê Lợi',
  lat: '10.7769',
  lng: '106.7009',
  hotline: '1900xxxx',
  province_id: 'TP.HCM',
  access_type: 'Public',
  party_id: 'VFC',
  charging_publish: true,
  charging_status: 'ACTIVE',
  category_name: 'Trạm sạc ô tô điện',
  category_slug: 'car_charging_station',
  hotline_xdv: '',
  open_time_service: '00:00',
  close_time_service: '23:59',
  parking_fee: false,
  has_link: true,
  marker_icon: '',
};

const VALID_COOKIES: readonly VinfastCookie[] = [
  { name: 'cf_clearance', value: 'abc123', domain: '.vinfastauto.com', path: '/' },
  { name: 'PHPSESSID', value: 'sess789', domain: '.vinfastauto.com', path: '/' },
];

describe('serializeCookieHeader', () => {
  it('joins name=value pairs with semicolons', () => {
    expect(serializeCookieHeader(VALID_COOKIES)).toBe('cf_clearance=abc123; PHPSESSID=sess789');
  });

  it('returns empty string for empty cookie array', () => {
    expect(serializeCookieHeader([])).toBe('');
  });

  it('omits cookies with empty name or value', () => {
    const cookies = [
      { name: 'good', value: 'v1', domain: '.x.com', path: '/' },
      { name: '', value: 'v2', domain: '.x.com', path: '/' },
      { name: 'empty', value: '', domain: '.x.com', path: '/' },
    ];
    expect(serializeCookieHeader(cookies)).toBe('good=v1');
  });
});

describe('fetchVinfastLocators', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed station array on successful response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [SAMPLE_STATION] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const stations = await fetchVinfastLocators(VALID_COOKIES);

    expect(stations).toHaveLength(1);
    expect(stations[0]?.entity_id).toBe('ent-123');
    expect(stations[0]?.charging_status).toBe('ACTIVE');
  });

  it('sends cached cookies in Cookie header', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await fetchVinfastLocators(VALID_COOKIES);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.Cookie).toBe('cf_clearance=abc123; PHPSESSID=sess789');
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(headers['User-Agent']).toContain('eVoyage');
  });

  it('throws CloudflareBlocked when response contains challenge markers', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('<html>IM_UNDER_ATTACK</html>', { status: 200 }),
    );

    const error = await fetchVinfastLocators(VALID_COOKIES).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VinfastApiError);
    expect((error as VinfastApiError).kind).toBe('cloudflare_blocked');
  });

  it('throws HttpError on non-2xx response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    await expect(fetchVinfastLocators(VALID_COOKIES)).rejects.toMatchObject({
      kind: 'http_error',
      statusCode: 403,
    });
  });

  it('throws ParseError on malformed JSON', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('not json at all', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await expect(fetchVinfastLocators(VALID_COOKIES)).rejects.toMatchObject({
      kind: 'parse_error',
    });
  });

  it('throws ParseError when response shape is wrong', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: 'not-an-array' }), { status: 200 }),
    );

    await expect(fetchVinfastLocators(VALID_COOKIES)).rejects.toMatchObject({
      kind: 'parse_error',
    });
  });

  it('throws NetworkError when fetch itself fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(fetchVinfastLocators(VALID_COOKIES)).rejects.toMatchObject({
      kind: 'network_error',
    });
  });

  it('respects custom timeout via AbortSignal', async () => {
    fetchSpy.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      // Simulate the fetch honoring the abort signal
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });

    await expect(fetchVinfastLocators(VALID_COOKIES, { timeoutMs: 50 })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });
});
