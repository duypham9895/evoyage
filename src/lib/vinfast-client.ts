/**
 * VinFast station detail client using impit for Cloudflare TLS bypass.
 *
 * Flow: visit main locator page → collect CF cookies → call detail API.
 * Replicates the curl-cffi approach from vinfast-scraper (Python).
 */
import { Impit } from 'impit';

const LOCATOR_PAGE = 'https://vinfastauto.com/vn_en/tim-kiem-showroom-tram-sac';
const DETAIL_URL_PREFIX = 'https://vinfastauto.com/vn_en/get-locator/';

const DETAIL_HEADERS = {
  accept: 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-US,en;q=0.9',
  referer: LOCATOR_PAGE,
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'x-requested-with': 'XMLHttpRequest',
} as const;

export interface VinFastEvse {
  readonly connectors: ReadonlyArray<{
    readonly id: string;
    readonly standard: string;
    readonly format: string;
    readonly power_type: string;
    readonly max_voltage: number;
    readonly max_amperage: number;
    readonly max_electric_power: number;
    readonly last_updated: string;
  }>;
  readonly physical_reference: string;
  readonly parking_restrictions: readonly string[];
  readonly last_updated: string;
}

export interface VinFastStationDetail {
  readonly entityId: string;
  readonly storeId: string;
  readonly name: string;
  readonly address: string;
  readonly province: string;
  readonly district: string;
  readonly commune: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly evses: readonly VinFastEvse[];
  readonly images: ReadonlyArray<{ readonly url: string; readonly category: string }>;
  readonly depotStatus: string;
  readonly is24h: boolean;
  readonly chargingWhenClosed: boolean;
  readonly parkingFee: boolean;
  readonly accessType: string;
  readonly hardwareStations: ReadonlyArray<{
    readonly code: string;
    readonly vendor: string;
    readonly maxPower: number;
    readonly modelCode: string;
  }>;
  readonly connectorSummary: readonly string[];
  readonly maxPowerKw: number;
  readonly portCount: number;
  readonly fetchedAt: string;
}

/**
 * Parse VinFast OCPI connector standard to human-readable name.
 */
function parseConnectorStandard(standard: string): string {
  const map: Record<string, string> = {
    IEC_62196_T2: 'Type2_AC',
    IEC_62196_T2_COMBO: 'CCS2',
    CHADEMO: 'CHAdeMO',
    IEC_62196_T1: 'Type1',
    IEC_62196_T1_COMBO: 'CCS1',
    DOMESTIC_A: 'Type_A',
    DOMESTIC_B: 'Type_B',
  };
  return map[standard] ?? standard;
}

/**
 * Parse the raw VinFast detail API response into a clean structure.
 */
function parseDetailResponse(raw: Record<string, unknown>): VinFastStationDetail | null {
  const outer = raw.data as Record<string, unknown> | undefined;
  if (!outer) return null;

  const inner = outer.data as Record<string, unknown> | undefined;
  if (!inner) return null;

  const evses = (inner.evses as Array<Record<string, unknown>> | undefined) ?? [];
  const images = (inner.images as Array<Record<string, string>> | undefined) ?? [];
  const extraData = (inner.extra_data as Record<string, unknown> | undefined) ?? {};
  const openingTimes = (inner.opening_times as Record<string, unknown> | undefined) ?? {};
  const hardwareStations = (extraData.stations as Array<Record<string, unknown>> | undefined) ?? [];

  // Derive connector summary and max power from evses
  const connectorSet = new Set<string>();
  let maxPower = 0;

  for (const evse of evses) {
    const connectors = (evse.connectors as Array<Record<string, unknown>> | undefined) ?? [];
    for (const c of connectors) {
      const standard = parseConnectorStandard(String(c.standard ?? ''));
      connectorSet.add(standard);
      const powerWatts = Number(c.max_electric_power ?? 0);
      if (powerWatts > maxPower) maxPower = powerWatts;
    }
  }

  return {
    entityId: String(outer.entity_id ?? ''),
    storeId: String(inner.id ?? outer.store_id ?? ''),
    name: String(outer.name ?? ''),
    address: String(outer.address ?? ''),
    province: String(inner.province ?? inner.state ?? ''),
    district: String(inner.district ?? ''),
    commune: String(inner.commune ?? ''),
    latitude: Number(inner.coordinates
      ? (inner.coordinates as Record<string, string>).latitude
      : outer.lat),
    longitude: Number(inner.coordinates
      ? (inner.coordinates as Record<string, string>).longitude
      : outer.lng),
    evses: evses as unknown as VinFastEvse[],
    images: images.map((img) => ({ url: String(img.url ?? ''), category: String(img.category ?? '') })),
    depotStatus: String(extraData.depot_status ?? outer.charging_status ?? 'unknown'),
    is24h: openingTimes.twentyfourseven === true,
    chargingWhenClosed: inner.charging_when_closed === true,
    parkingFee: (extraData.parking_fee ?? outer.parking_fee) === true,
    accessType: String(extraData.access_type ?? outer.access_type ?? 'Public'),
    hardwareStations: hardwareStations.map((s) => ({
      code: String(s.code ?? ''),
      vendor: String(s.vendor ?? ''),
      maxPower: Number(s.max_power ?? 0),
      modelCode: String(s.model_code ?? ''),
    })),
    connectorSummary: [...connectorSet],
    maxPowerKw: maxPower > 0 ? maxPower / 1000 : 0,
    portCount: evses.length,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch VinFast station detail with Cloudflare bypass.
 * Uses impit to impersonate Chrome's TLS fingerprint.
 */
export async function fetchVinFastDetail(entityId: string): Promise<VinFastStationDetail | null> {
  const client = new Impit({ browser: 'chrome' });

  // Step 1: Visit main page to collect Cloudflare cookies
  const pageResponse = await client.fetch(LOCATOR_PAGE, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
    },
  });

  if (!pageResponse.ok) {
    console.error(`VinFast main page failed: ${pageResponse.status}`);
    return null;
  }

  // Consume body to complete the request
  await pageResponse.text();

  // Step 2: Call detail API with CF cookies (auto-managed by impit session)
  const detailResponse = await client.fetch(`${DETAIL_URL_PREFIX}${entityId}`, {
    headers: DETAIL_HEADERS,
  });

  if (!detailResponse.ok) {
    console.error(`VinFast detail API failed: ${detailResponse.status}`);
    return null;
  }

  const text = await detailResponse.text();

  // Check for Cloudflare challenge page
  if (text.includes('::IM_UNDER_ATTACK_BOX::') || text.includes('challenge-platform')) {
    console.error('VinFast detail: blocked by Cloudflare challenge');
    return null;
  }

  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    return parseDetailResponse(raw);
  } catch {
    console.error('VinFast detail: invalid JSON response');
    return null;
  }
}
