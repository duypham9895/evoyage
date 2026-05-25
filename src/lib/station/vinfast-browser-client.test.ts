import { describe, it, expect, vi } from 'vitest';
import {
  fetchVinfastLocatorsFromPage,
  VINFAST_LOCATOR_PAGE,
} from './vinfast-browser-client';
import { VinfastApiError, type VinfastLocatorRaw } from './vinfast-api-client';

const SAMPLE_STATION: VinfastLocatorRaw = {
  entity_id: 'ent-123',
  store_id: 'store-456',
  code: 'vfc_HCM0001',
  name: 'V-GREEN Quan 1',
  address: '123 Le Loi',
  lat: '10.7769',
  lng: '106.7009',
  hotline: '1900xxxx',
  province_id: 'TP.HCM',
  access_type: 'Public',
  party_id: 'VFC',
  charging_publish: true,
  charging_status: 'ACTIVE',
  category_name: 'Tram sac oto dien',
  category_slug: 'car_charging_station',
  hotline_xdv: '',
  open_time_service: '00:00',
  close_time_service: '23:59',
  parking_fee: false,
  has_link: true,
  marker_icon: '',
};

function makePage(response: { status: number; text: string }) {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(response),
  };
}

describe('fetchVinfastLocatorsFromPage', () => {
  it('fetches locators inside an already-open browser page', async () => {
    const page = makePage({
      status: 200,
      text: JSON.stringify({ data: [SAMPLE_STATION] }),
    });

    const stations = await fetchVinfastLocatorsFromPage(page);

    expect(page.goto).toHaveBeenCalledWith(VINFAST_LOCATOR_PAGE, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);
    expect(page.evaluate).toHaveBeenCalledOnce();
    expect(stations).toEqual([SAMPLE_STATION]);
  });

  it('surfaces upstream HTTP failures from the browser fetch', async () => {
    const page = makePage({ status: 403, text: 'forbidden' });

    const error = await fetchVinfastLocatorsFromPage(page).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(VinfastApiError);
    expect(error).toMatchObject({
      kind: 'http_error',
      statusCode: 403,
    });
  });
});
