/**
 * HTTP client for the VinFast `/vn_vi/get-locators` endpoint.
 *
 * The hot path (hourly cron poller) consumes this with cached Cloudflare
 * cookies obtained by a separate weekly Playwright job. Keeps the Vercel
 * function fast and Playwright-free. See the data-collection design spec
 * (docs/specs/2026-05-03-station-status-data-collection-design.md §7).
 */

const LOCATORS_ENDPOINT = 'https://vinfastauto.com/vn_vi/get-locators';
const DEFAULT_TIMEOUT_MS = 25_000;
const USER_AGENT = 'eVoyage/1.0 (+https://evoyage.app)';

export interface VinfastCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
}

export interface VinfastLocatorRaw {
  readonly entity_id: string;
  readonly store_id: string;
  readonly code: string;
  readonly name: string;
  readonly address: string;
  readonly lat: string;
  readonly lng: string;
  readonly hotline: string;
  readonly province_id: string;
  readonly access_type: string;
  readonly party_id: string;
  readonly charging_publish: boolean;
  readonly charging_status: string;
  readonly category_name: string;
  readonly category_slug: string;
  readonly hotline_xdv: string;
  readonly open_time_service: string;
  readonly close_time_service: string;
  readonly parking_fee: boolean;
  readonly has_link: boolean;
  readonly marker_icon: string;
}

export type VinfastApiErrorKind =
  | 'cloudflare_blocked'
  | 'http_error'
  | 'parse_error'
  | 'network_error'
  | 'timeout';

export class VinfastApiError extends Error {
  public readonly kind: VinfastApiErrorKind;
  public readonly statusCode?: number;

  constructor(kind: VinfastApiErrorKind, message: string, statusCode?: number) {
    super(message);
    this.name = 'VinfastApiError';
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

export function serializeCookieHeader(cookies: readonly VinfastCookie[]): string {
  return cookies
    .filter((c) => c.name.length > 0 && c.value.length > 0)
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

export interface FetchVinfastOptions {
  readonly timeoutMs?: number;
}

export async function fetchVinfastLocators(
  cookies: readonly VinfastCookie[],
  options: FetchVinfastOptions = {},
): Promise<readonly VinfastLocatorRaw[]> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(LOCATORS_ENDPOINT, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: serializeCookieHeader(cookies),
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new VinfastApiError('timeout', `Request exceeded ${timeoutMs}ms`);
    }
    throw new VinfastApiError(
      'network_error',
      err instanceof Error ? err.message : 'Unknown network failure',
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    throw new VinfastApiError(
      'http_error',
      `Upstream returned ${response.status}`,
      response.status,
    );
  }

  const text = await response.text();

  if (text.includes('IM_UNDER_ATTACK') || text.includes('challenge-platform')) {
    throw new VinfastApiError(
      'cloudflare_blocked',
      'Response contained Cloudflare challenge markers; cookies likely expired',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VinfastApiError('parse_error', 'Response was not valid JSON');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('data' in parsed) ||
    !Array.isArray((parsed as { data: unknown }).data)
  ) {
    throw new VinfastApiError(
      'parse_error',
      'Response missing expected `data` array',
    );
  }

  return (parsed as { data: VinfastLocatorRaw[] }).data;
}
