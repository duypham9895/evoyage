import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import {
  decodeLocatorsBody,
  fetchVinfastCarChargingStationsFromCdn,
  parseLocatorsMetaText,
  selectCarChargingStations,
  VINFAST_CDN_LOCATORS_BASE,
  VINFAST_CDN_META_URL,
} from './vinfast-cdn-locators';
import { VinfastApiError, type VinfastLocatorRaw } from './vinfast-api-client';
import { VINFAST_LOCATOR_PAGE } from './vinfast-browser-client';

const CAR_ROW: VinfastLocatorRaw = {
  bundle: 'charging_station',
  entity_id: '65481',
  store_id: 'M.HNO0035',
  code: 'vfs_M.HNO0035',
  name: 'Vinhomes Skylake',
  address: 'Vinhomes Skylake, o dat E1.3',
  lat: '21.019840',
  lng: '105.780830',
  hotline: '1900232389',
  province_id: '2483',
  category_name: 'Tram sac o to dien',
  category_slug: 'car_charging_station',
  marker_icon: '',
};

const BATTERY_SWAP_ROW: VinfastLocatorRaw = {
  ...CAR_ROW,
  bundle: 'battery_swap_station',
  entity_id: '99001',
  store_id: 'S.HNO0001',
  category_slug: 'battery_swap_station',
};

const BIKE_ROW: VinfastLocatorRaw = {
  ...CAR_ROW,
  entity_id: '99002',
  store_id: 'B.HNO0001',
  category_slug: 'bike_charging_station',
};

const SHOWROOM_ROW: VinfastLocatorRaw = {
  ...CAR_ROW,
  bundle: 'showroom',
  entity_id: '99003',
  store_id: 'SR.HNO0001',
  category_slug: 'showroom_car',
};

describe('parseLocatorsMetaText', () => {
  it('follows the `full` pointer instead of assuming a generation number', () => {
    const meta = parseLocatorsMetaText(
      JSON.stringify({
        generation: 1678,
        count: 68064,
        full: 'locators-1678.json.gz',
        sc: 'locators-sc-1678.json.gz',
      }),
    );

    expect(meta.generation).toBe(1678);
    expect(meta.count).toBe(68064);
    expect(meta.fullUrl).toBe(`${VINFAST_CDN_LOCATORS_BASE}/locators-1678.json.gz`);
  });

  it('tracks a bumped generation without any code change', () => {
    // The whole incident was a silently frozen source. Hardcoding 1678 would
    // reproduce it the next time VinFast publishes a new generation.
    const meta = parseLocatorsMetaText(
      JSON.stringify({ generation: 1999, count: 70000, full: 'locators-1999.json.gz' }),
    );

    expect(meta.fullUrl).toBe(`${VINFAST_CDN_LOCATORS_BASE}/locators-1999.json.gz`);
  });

  it('rejects a meta document that is not JSON', () => {
    const error = (() => {
      try {
        parseLocatorsMetaText('<html>nope</html>');
      } catch (e: unknown) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(VinfastApiError);
    expect(error).toMatchObject({ kind: 'parse_error' });
  });

  it('rejects a meta document with no `full` pointer', () => {
    const error = (() => {
      try {
        parseLocatorsMetaText(JSON.stringify({ generation: 1678, sc: 'locators-sc-1678.json.gz' }));
      } catch (e: unknown) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(VinfastApiError);
    expect(error).toMatchObject({ kind: 'parse_error' });
  });

  it('refuses a `full` pointer that is not a bare file name', () => {
    // `full` is upstream-controlled and becomes a fetch target.
    const error = (() => {
      try {
        parseLocatorsMetaText(JSON.stringify({ full: 'https://example.invalid/evil.json' }));
      } catch (e: unknown) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(VinfastApiError);
    expect(error).toMatchObject({ kind: 'parse_error' });
  });
});

describe('decodeLocatorsBody', () => {
  it('reads a body the CDN already inflated despite the .gz file name', () => {
    const payload = '{"data":[]}';

    expect(decodeLocatorsBody(Buffer.from(payload, 'utf8'))).toBe(payload);
  });

  it('gunzips a body that really carries the gzip magic bytes', () => {
    const payload = '{"data":[{"bundle":"charging_station"}]}';
    const gzipped = gzipSync(Buffer.from(payload, 'utf8'));

    expect(gzipped[0]).toBe(0x1f);
    expect(gzipped[1]).toBe(0x8b);
    expect(decodeLocatorsBody(gzipped)).toBe(payload);
  });

  it('handles an empty body without throwing on the magic-byte sniff', () => {
    expect(decodeLocatorsBody(Buffer.alloc(0))).toBe('');
  });
});

describe('selectCarChargingStations', () => {
  it('keeps car charging stations from the charging_station bundle', () => {
    expect(selectCarChargingStations([CAR_ROW])).toEqual([CAR_ROW]);
  });

  it('drops battery swap stations, which no car can charge at', () => {
    // 41,674 of the 68,064 rows are battery swap. Admitting them would treble
    // the ChargingStation table with stops a car cannot use.
    const selected = selectCarChargingStations([CAR_ROW, BATTERY_SWAP_ROW]);

    expect(selected).toEqual([CAR_ROW]);
  });

  it('drops bike charging stations and showrooms', () => {
    const selected = selectCarChargingStations([CAR_ROW, BIKE_ROW, SHOWROOM_ROW]);

    expect(selected).toEqual([CAR_ROW]);
  });

  it('refuses a feed that carries no car charging stations at all', () => {
    // Same protection as the old empty_result guard: the feed holds ~25k
    // charging rows, so zero means the source moved again, never that Vietnam
    // lost its chargers.
    const error = (() => {
      try {
        selectCarChargingStations([BATTERY_SWAP_ROW, SHOWROOM_ROW]);
      } catch (e: unknown) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(VinfastApiError);
    expect(error).toMatchObject({ kind: 'empty_result' });
  });
});

function makeCdn(files: Record<string, Buffer | string>, status = 200) {
  const requested: string[] = [];
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  };
  const request = {
    get: vi.fn(async (url: string) => {
      requested.push(url);
      const file = files[url];
      return {
        status: () => (file === undefined ? 404 : status),
        body: async () =>
          typeof file === 'string' ? Buffer.from(file, 'utf8') : (file ?? Buffer.alloc(0)),
      };
    }),
  };
  return { page, request, requested };
}

describe('fetchVinfastCarChargingStationsFromCdn', () => {
  it('clears Cloudflare on the locator page, then follows meta to the data file', async () => {
    const { page, request, requested } = makeCdn({
      [VINFAST_CDN_META_URL]: JSON.stringify({
        generation: 1678,
        count: 68064,
        full: 'locators-1678.json.gz',
      }),
      [`${VINFAST_CDN_LOCATORS_BASE}/locators-1678.json.gz`]: JSON.stringify({
        data: [CAR_ROW, BATTERY_SWAP_ROW, BIKE_ROW],
        method: 'GET',
        status: 200,
      }),
    });

    const stations = await fetchVinfastCarChargingStationsFromCdn(page, request);

    expect(page.goto).toHaveBeenCalledWith(VINFAST_LOCATOR_PAGE, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    expect(requested).toEqual([
      VINFAST_CDN_META_URL,
      `${VINFAST_CDN_LOCATORS_BASE}/locators-1678.json.gz`,
    ]);
    expect(stations).toEqual([CAR_ROW]);
  });

  it('requests whichever generation meta names, with no code change', async () => {
    const { page, request, requested } = makeCdn({
      [VINFAST_CDN_META_URL]: JSON.stringify({ generation: 1999, full: 'locators-1999.json.gz' }),
      [`${VINFAST_CDN_LOCATORS_BASE}/locators-1999.json.gz`]: JSON.stringify({ data: [CAR_ROW] }),
    });

    await fetchVinfastCarChargingStationsFromCdn(page, request);

    expect(requested[1]).toBe(`${VINFAST_CDN_LOCATORS_BASE}/locators-1999.json.gz`);
  });

  it('reads a genuinely gzipped data file', async () => {
    const { page, request } = makeCdn({
      [VINFAST_CDN_META_URL]: JSON.stringify({ full: 'locators-1678.json.gz' }),
      [`${VINFAST_CDN_LOCATORS_BASE}/locators-1678.json.gz`]: gzipSync(
        Buffer.from(JSON.stringify({ data: [CAR_ROW] }), 'utf8'),
      ),
    });

    const stations = await fetchVinfastCarChargingStationsFromCdn(page, request);

    expect(stations).toEqual([CAR_ROW]);
  });

  it('surfaces a non-200 from the CDN as http_error', async () => {
    const { page, request } = makeCdn({});

    const error = await fetchVinfastCarChargingStationsFromCdn(page, request).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(VinfastApiError);
    expect(error).toMatchObject({ kind: 'http_error', statusCode: 404 });
  });

  it('classifies a Cloudflare challenge body rather than reporting a parse failure', async () => {
    const { page, request } = makeCdn({
      [VINFAST_CDN_META_URL]: JSON.stringify({ full: 'locators-1678.json.gz' }),
      [`${VINFAST_CDN_LOCATORS_BASE}/locators-1678.json.gz`]: '<html>::IM_UNDER_ATTACK_BOX::</html>',
    });

    const error = await fetchVinfastCarChargingStationsFromCdn(page, request).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(VinfastApiError);
    expect(error).toMatchObject({ kind: 'cloudflare_blocked' });
  });

  it('fails loudly when the feed carries no car charging stations', async () => {
    const { page, request } = makeCdn({
      [VINFAST_CDN_META_URL]: JSON.stringify({ full: 'locators-1678.json.gz' }),
      [`${VINFAST_CDN_LOCATORS_BASE}/locators-1678.json.gz`]: JSON.stringify({
        data: [BATTERY_SWAP_ROW],
      }),
    });

    const error = await fetchVinfastCarChargingStationsFromCdn(page, request).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(VinfastApiError);
    expect(error).toMatchObject({ kind: 'empty_result' });
  });
});
