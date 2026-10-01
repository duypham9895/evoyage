/**
 * Reader for the VinFast CDN locator file set.
 *
 * `https://vinfastauto.com/vn_vi/get-locators` still answers 200, but with
 * `{"data":[]}` — the locator page moved to a versioned static file set on
 * `static-cms-prod.vinfastauto.com`. A pointer document names the current data
 * file; the generation number in that name increments, so it is read, never
 * assumed. Assuming it is how the old source froze silently for ~70 days.
 *
 * The CDN sits behind Cloudflare: plain fetch gets 403, and a page-context
 * fetch is blocked by CORS because the CDN is a different subdomain. The one
 * path that works is an API request issued on a BrowserContext that has already
 * cleared the challenge on the locator page.
 */
import { gunzipSync } from 'node:zlib';
import {
  parseVinfastLocatorsResponseText,
  VinfastApiError,
  type VinfastLocatorRaw,
} from './vinfast-api-client';
import { VINFAST_LOCATOR_PAGE } from './vinfast-browser-client';
import { normalizeVinfastBrowserError } from './vinfast-upstream-error';

export const VINFAST_CDN_LOCATORS_BASE =
  'https://static-cms-prod.vinfastauto.com/locators';
export const VINFAST_CDN_META_URL = `${VINFAST_CDN_LOCATORS_BASE}/locators-meta.json`;

/** `full` is upstream-controlled and becomes a fetch target, so it must stay a bare file name. */
const SAFE_FILE_NAME = /^[\w.-]+$/;

export interface VinfastCdnLocatorsMeta {
  readonly generation: number;
  readonly count: number;
  readonly fullUrl: string;
}

/** Minimal shape of the Playwright page used only to clear the Cloudflare challenge. */
export interface VinfastCdnPage {
  goto: (
    url: string,
    options: { waitUntil: 'domcontentloaded'; timeout: number },
  ) => Promise<unknown>;
  waitForTimeout: (timeoutMs: number) => Promise<unknown>;
}

/** Minimal shape of Playwright's `BrowserContext.request`. */
export interface VinfastCdnApiResponse {
  status: () => number;
  body: () => Promise<Uint8Array>;
}

export interface VinfastCdnApiRequest {
  get: (url: string) => Promise<VinfastCdnApiResponse>;
}

export function parseLocatorsMetaText(text: string): VinfastCdnLocatorsMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VinfastApiError('parse_error', 'locators-meta.json was not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new VinfastApiError('parse_error', 'locators-meta.json was not an object');
  }

  const meta = parsed as Partial<Record<'generation' | 'count' | 'full', unknown>>;

  if (typeof meta.full !== 'string' || !SAFE_FILE_NAME.test(meta.full)) {
    throw new VinfastApiError(
      'parse_error',
      'locators-meta.json has no usable `full` file name',
    );
  }

  return {
    generation: Number(meta.generation) || 0,
    count: Number(meta.count) || 0,
    fullUrl: `${VINFAST_CDN_LOCATORS_BASE}/${meta.full}`,
  };
}

/**
 * The data file is named `.gz` but the CDN usually serves it already inflated
 * via content-encoding (measured bytes === inflated, 73,148,278 both sides).
 * Sniff the gzip magic bytes instead of gunzipping unconditionally.
 */
export function decodeLocatorsBody(body: Uint8Array): string {
  const buf = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return gunzipSync(buf).toString('utf8');
  }
  return buf.toString('utf8');
}

/**
 * The feed carries ~68k rows, of which ~41.7k are battery swap stations and
 * ~0.5k are bike chargers. eVoyage plans car trips: a car cannot swap a scooter
 * battery and cannot use a bike charger, so only `car_charging_station` rows in
 * the `charging_station` bundle are kept. Both conditions are checked because
 * admitting a battery swap row would treble the station table with stops no
 * user can drive to.
 *
 * Zero survivors is an upstream failure, not an answer — the same reasoning as
 * the `empty_result` guard on the legacy endpoint.
 */
export function selectCarChargingStations(
  rows: readonly VinfastLocatorRaw[],
): readonly VinfastLocatorRaw[] {
  const selected = rows.filter(
    (row) =>
      row.bundle === 'charging_station' &&
      row.category_slug === 'car_charging_station',
  );

  if (selected.length === 0) {
    throw new VinfastApiError(
      'empty_result',
      `Locator feed carried no car charging stations (${rows.length} rows read)`,
    );
  }

  return selected;
}

async function readCdnFile(
  request: VinfastCdnApiRequest,
  url: string,
): Promise<Uint8Array> {
  const response = await request.get(url);
  const status = response.status();
  if (status !== 200) {
    throw new VinfastApiError('http_error', `CDN returned ${status} for ${url}`, status);
  }
  return await response.body();
}

/**
 * Loads the current car charging stations from the CDN locator feed.
 *
 * `page` only clears the Cloudflare challenge; the files are read through
 * `request`, which must be the same BrowserContext's API request object so it
 * carries the clearance cookie.
 *
 * The data file is ~73MB and parses to ~68k objects. The parsed array is never
 * bound to a variable: it is filtered in the same expression so it becomes
 * unreachable immediately and only the ~24.5k selected rows survive.
 */
export async function fetchVinfastCarChargingStationsFromCdn(
  page: VinfastCdnPage,
  request: VinfastCdnApiRequest,
): Promise<readonly VinfastLocatorRaw[]> {
  try {
    await page.goto(VINFAST_LOCATOR_PAGE, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(2000);

    const meta = parseLocatorsMetaText(
      decodeLocatorsBody(await readCdnFile(request, VINFAST_CDN_META_URL)),
    );

    return selectCarChargingStations(
      parseVinfastLocatorsResponseText(
        decodeLocatorsBody(await readCdnFile(request, meta.fullUrl)),
      ),
    );
  } catch (err) {
    throw normalizeVinfastBrowserError(err);
  }
}
