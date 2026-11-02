/**
 * Pure PostHog event sanitizer — no posthog-js import, no network, no DOM.
 *
 * `sanitizeCaptureResult` is installed as posthog-js's `before_send` hook
 * (see `analytics.ts`). It is a deny-by-default gate: an event is dropped
 * entirely unless its name is on `EVENT_PROPERTY_ALLOWLIST`, every system
 * property is dropped unless it is on `SYSTEM_PROPERTY_ALLOWLIST`, and every
 * custom property is dropped unless it is on that event's own allowlist AND
 * passes a value check. URLs, pathnames and referrers are never sent as-is —
 * they are reduced to an origin and/or a `KNOWN_ROUTES` template so no query
 * string, coordinate, typed address or station id can leave the browser.
 */

import { KNOWN_PROVIDERS } from './stations/parse-osm';

export const KNOWN_ROUTES = [
  '/',
  '/plan',
  '/privacy',
  '/admin/feedback',
  '/s/:code',
  '/admin/feedback/:id',
  '/other',
] as const;

export type KnownRoute = (typeof KNOWN_ROUTES)[number];

const STATIC_ROUTES: ReadonlySet<string> = new Set(['/', '/plan', '/privacy', '/admin/feedback']);

/** Strips the query string and hash, then maps the path to a `KNOWN_ROUTES` template. */
export function normalizePath(raw: unknown): KnownRoute {
  if (typeof raw !== 'string' || raw.length === 0) return '/other';
  const path = raw.split('?')[0]!.split('#')[0]!;
  if (STATIC_ROUTES.has(path)) return path as KnownRoute;
  if (/^\/s\/[^/]+$/.test(path)) return '/s/:code';
  if (/^\/admin\/feedback\/[^/]+$/.test(path)) return '/admin/feedback/:id';
  return '/other';
}

/** Reduces a URL string to its origin + normalized path. Returns null if it cannot be parsed. */
export function toSafeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = new URL(raw);
    return parsed.origin + normalizePath(parsed.pathname);
  } catch {
    return null;
  }
}

/** Reduces a referrer string to its origin only. `$direct` passes through unchanged. */
export function toSafeReferrer(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw === '$direct') return '$direct';
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * System (posthog/SDK-assigned) property keys that are kept verbatim —
 * everything else sent by posthog-js is dropped by name.
 */
export const SYSTEM_PROPERTY_ALLOWLIST = [
  'token',
  'distinct_id',
  '$lib',
  '$lib_version',
  '$insert_id',
  '$time',
  '$browser',
  '$browser_version',
  '$browser_language',
  '$browser_language_prefix',
  '$os',
  '$os_name',
  '$os_version',
  '$device',
  '$device_type',
  '$raw_user_agent',
  '$timezone',
  '$timezone_offset',
  '$current_url',
  '$pathname',
  '$host',
  '$referrer',
  '$referring_domain',
  '$initial_current_url',
  '$initial_pathname',
  '$initial_host',
  '$initial_referrer',
  '$initial_referring_domain',
  '$cookieless_mode',
  '$process_person_profile',
  '$geoip_disable',
  '$screen_width',
  '$screen_height',
  '$viewport_width',
  '$viewport_height',
] as const;

/** Keys whose value is a URL/pathname/referrer and MUST go through normalize/toSafe* — never copied raw. */
export const URL_LIKE_SYSTEM_KEYS = [
  '$current_url',
  '$initial_current_url',
  '$pathname',
  '$initial_pathname',
  '$referrer',
  '$initial_referrer',
] as const;

const SCREEN_SIZE_KEYS: ReadonlySet<string> = new Set([
  '$screen_width',
  '$screen_height',
  '$viewport_width',
  '$viewport_height',
]);

const URL_LIKE_KEY_SET: ReadonlySet<string> = new Set(URL_LIKE_SYSTEM_KEYS);

const PRECAUTIONARY_KEYS = [
  'reasonPrimary',
  'reasonSecondary',
  'pressureScore',
  'legDistanceKm',
  'legSparsityCount',
  'safetyFactor',
  'vehicleBatteryKwh',
] as const;

/**
 * Per-event custom-property allowlists. An event not listed here is dropped
 * entirely by `sanitizeCaptureResult`.
 */
export const EVENT_PROPERTY_ALLOWLIST: Record<string, readonly string[]> = {
  color_scheme_detected: ['scheme'],
  $pageview: ['path'],
  trip_planned: ['distance_bucket'],
  station_tapped: ['provider'],
  feedback_opened: ['category'],
  evi_message: ['message_type', 'tokens_used'],
  share_clicked: ['share_method'],
  terrain_warning_shown: ['pass_id', 'drain_percent'],
  departure_picked: ['lead_hours'],
  traffic_callout_shown: ['source', 'multiplier'],
  whatif_picked: ['option'],
  amenities_viewed: ['from_cache', 'poi_count'],
  amenity_tapped: ['category', 'walking_minutes'],
  notebook_opened: ['entry_count'],
  trip_replanned_from_notebook: ['days_since_saved'],
  trip_pin_toggle: ['pinned'],
  backup_alternatives_distribution: ['stop_count', 'alt_counts', 'no_backup_stops', 'mean_alt_count'],
  precautionary_stop_distribution: ['precautionary_stop_count', 'count_bucket'],
  extra_stop_suggested: PRECAUTIONARY_KEYS,
  extra_stop_accepted: PRECAUTIONARY_KEYS,
  extra_stop_undone: PRECAUTIONARY_KEYS,
  extra_stop_dismissed: [...PRECAUTIONARY_KEYS, 'dismissTimeMsFromShown'],
  alternative_marker_clicked: ['stop_idx', 'alt_idx'],
  alternative_list_item_clicked: ['stop_idx', 'alt_idx'],
  alternative_navigate_clicked: ['stop_idx', 'alt_idx'],
  reliability_calibration: ['candidate_count', 'gated_count', 'mean_reliability'],
};

const CUSTOM_STRING_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** Validates one already-selected custom value. Returns `undefined` to mean "drop this key". */
function sanitizeCustomScalar(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return CUSTOM_STRING_RE.test(value) ? value : undefined;
  return undefined; // objects (and anything else) are dropped
}

function sanitizeCustomValue(key: string, value: unknown): unknown {
  if (key === 'path') return normalizePath(value); // always a KNOWN_ROUTES member — exempt from the string regex
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeCustomScalar(item))
      .filter((item) => item !== undefined);
  }
  return sanitizeCustomScalar(value);
}

export interface SanitizedCaptureResult {
  readonly uuid?: string;
  readonly event: string;
  readonly properties: Record<string, unknown>;
  readonly timestamp?: unknown;
}

/**
 * posthog-js `before_send` hook. Deny-by-default: drops the whole event if
 * its name is not allowlisted, keeps only allowlisted system/custom
 * properties (value-checked), strips every URL down to an origin and/or a
 * `KNOWN_ROUTES` template, and always sets `$geoip_disable`. Never throws —
 * any unexpected shape fails closed to `null` (the event is dropped).
 */
export function sanitizeCaptureResult(input: unknown): SanitizedCaptureResult | null {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const cr = input as Record<string, unknown>;

    const event = cr.event;
    if (typeof event !== 'string' || !Object.prototype.hasOwnProperty.call(EVENT_PROPERTY_ALLOWLIST, event)) {
      return null;
    }

    const rawProps: Record<string, unknown> =
      cr.properties && typeof cr.properties === 'object' && !Array.isArray(cr.properties)
        ? (cr.properties as Record<string, unknown>)
        : {};

    const properties: Record<string, unknown> = {};

    for (const key of SYSTEM_PROPERTY_ALLOWLIST) {
      if (URL_LIKE_KEY_SET.has(key)) continue; // handled explicitly below
      if (!(key in rawProps)) continue;
      const value = rawProps[key];
      if (SCREEN_SIZE_KEYS.has(key)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          properties[key] = Math.floor(value / 100) * 100;
        }
        continue;
      }
      properties[key] = value;
    }

    if ('$current_url' in rawProps) {
      const safe = toSafeUrl(rawProps.$current_url);
      if (safe) properties.$current_url = safe;
    }
    if ('$initial_current_url' in rawProps) {
      const safe = toSafeUrl(rawProps.$initial_current_url);
      if (safe) properties.$initial_current_url = safe;
    }
    if ('$pathname' in rawProps) {
      properties.$pathname = normalizePath(rawProps.$pathname);
    }
    if ('$initial_pathname' in rawProps) {
      properties.$initial_pathname = normalizePath(rawProps.$initial_pathname);
    }
    if ('$referrer' in rawProps) {
      const safe = toSafeReferrer(rawProps.$referrer);
      if (safe) properties.$referrer = safe;
    }
    if ('$initial_referrer' in rawProps) {
      const safe = toSafeReferrer(rawProps.$initial_referrer);
      if (safe) properties.$initial_referrer = safe;
    }

    const customKeys = EVENT_PROPERTY_ALLOWLIST[event] ?? [];
    for (const key of customKeys) {
      if (!(key in rawProps)) continue;
      const safeValue = sanitizeCustomValue(key, rawProps[key]);
      if (safeValue !== undefined) properties[key] = safeValue;
    }

    properties.$geoip_disable = true;

    return {
      uuid: typeof cr.uuid === 'string' ? cr.uuid : undefined,
      event,
      properties,
      timestamp: cr.timestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Normalizes a charging-provider display name (from `parseOSMProvider`, or
 * any other free-text operator string) to a slug safe for analytics: lower
 * snake_case, `[a-z0-9_-]{1,40}`. Anything not on `KNOWN_PROVIDERS` — long-tail
 * OSM operator text we don't recognize, or the 'Other' fallback — becomes
 * `'other'`, so a free-text operator name can never leave the browser.
 */
const KNOWN_PROVIDERS_SET = new Set(KNOWN_PROVIDERS);

export function providerSlug(provider: string): string {
  if (!KNOWN_PROVIDERS_SET.has(provider)) return 'other';
  return provider
    .toLowerCase()
    .replace(/\+/g, '_plus')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
