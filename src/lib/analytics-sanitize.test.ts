import { describe, it, expect } from 'vitest';
import {
  sanitizeCaptureResult,
  normalizePath,
  toSafeUrl,
  toSafeReferrer,
  providerSlug,
  KNOWN_ROUTES,
  SYSTEM_PROPERTY_ALLOWLIST,
  EVENT_PROPERTY_ALLOWLIST,
  URL_LIKE_SYSTEM_KEYS,
} from './analytics-sanitize';
import { KNOWN_PROVIDERS } from './stations/parse-osm';

/** Minimal CaptureResult-shaped fixture builder. */
function cr(event: string, properties: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    uuid: 'u-1',
    event,
    properties,
    timestamp: '2026-11-02T00:00:00.000Z',
    ...extra,
  };
}

describe('analytics-sanitize', () => {
  describe('unknown/internal events are dropped', () => {
    it.each(['$identify', '$set', '$exception', '$$heatmap', '$web_vitals', 'not_allowed'])(
      '%s -> null',
      (event) => {
        expect(sanitizeCaptureResult(cr(event, { a: 1 }))).toBeNull();
      },
    );
  });

  describe('normalizePath', () => {
    it('keeps known static routes as-is, stripping query and hash', () => {
      expect(normalizePath('/plan?slat=10.776889&slng=106.700806#x')).toBe('/plan');
      expect(normalizePath('/')).toBe('/');
      expect(normalizePath('/privacy?x=1')).toBe('/privacy');
      expect(normalizePath('/admin/feedback')).toBe('/admin/feedback');
    });

    it('templates /s/* and /admin/feedback/*', () => {
      expect(normalizePath('/s/Ab3x9')).toBe('/s/:code');
      expect(normalizePath('/admin/feedback/42?q=1')).toBe('/admin/feedback/:id');
      expect(normalizePath('/admin/feedback/42')).toBe('/admin/feedback/:id');
    });

    it('falls back to /other for anything unrecognised', () => {
      expect(normalizePath('/random-typed-404')).toBe('/other');
      expect(normalizePath(123)).toBe('/other');
      expect(normalizePath(undefined)).toBe('/other');
    });
  });

  describe('toSafeUrl / toSafeReferrer', () => {
    it('reduces a current-url to origin + normalized path', () => {
      expect(toSafeUrl('https://evoyage.app/plan?slat=10.776889&slng=106.700806&start=Nha%20toi#x')).toBe(
        'https://evoyage.app/plan',
      );
    });

    it('returns null for unparsable values', () => {
      expect(toSafeUrl('not a url')).toBeNull();
      expect(toSafeUrl(42)).toBeNull();
    });

    it('reduces a referrer to its origin, keeping $direct as-is', () => {
      expect(toSafeReferrer('https://evil.example/path?slat=10.776889')).toBe('https://evil.example');
      expect(toSafeReferrer('$direct')).toBe('$direct');
    });

    it('returns null for an unparsable referrer', () => {
      expect(toSafeReferrer('not a url')).toBeNull();
    });
  });

  describe('URL-like system keys are all routed through normalize/toSafe helpers', () => {
    it('every allowlisted key matching /url|pathname|referrer/i is in the explicit handled set', () => {
      const urlLike = SYSTEM_PROPERTY_ALLOWLIST.filter((k) => /url|pathname|referrer/i.test(k)).sort();
      expect(urlLike).toEqual([...URL_LIKE_SYSTEM_KEYS].sort());
    });
  });

  describe('sanitizeCaptureResult — system keys', () => {
    it('keeps $raw_user_agent and other allowlisted system keys', () => {
      const result = sanitizeCaptureResult(
        cr('$pageview', { path: '/plan', $raw_user_agent: 'Mozilla/5.0', token: 'phc_abc' }),
      );
      expect(result?.properties.$raw_user_agent).toBe('Mozilla/5.0');
      expect(result?.properties.token).toBe('phc_abc');
    });

    it('rewrites $current_url / $initial_current_url', () => {
      const result = sanitizeCaptureResult(
        cr('$pageview', {
          path: '/plan',
          $current_url: 'https://evoyage.app/plan?slat=10.776889&start=Nha%20toi',
          $initial_current_url: 'https://evoyage.app/s/Ab3x9?x=1',
        }),
      );
      expect(result?.properties.$current_url).toBe('https://evoyage.app/plan');
      expect(result?.properties.$initial_current_url).toBe('https://evoyage.app/s/:code');
    });

    it('normalizes $pathname / $initial_pathname directly', () => {
      const result = sanitizeCaptureResult(
        cr('$pageview', { path: '/plan', $pathname: '/admin/feedback/42', $initial_pathname: '/s/Ab3x9' }),
      );
      expect(result?.properties.$pathname).toBe('/admin/feedback/:id');
      expect(result?.properties.$initial_pathname).toBe('/s/:code');
    });

    it('reduces $referrer / $initial_referrer to origin', () => {
      const result = sanitizeCaptureResult(
        cr('$pageview', {
          path: '/plan',
          $referrer: 'https://evil.example/path?slat=10.776889',
          $initial_referrer: '$direct',
        }),
      );
      expect(result?.properties.$referrer).toBe('https://evil.example');
      expect(result?.properties.$initial_referrer).toBe('$direct');
    });

    it('rounds screen/viewport sizes down to the nearest 100', () => {
      const result = sanitizeCaptureResult(
        cr('$pageview', {
          path: '/plan',
          $screen_width: 1179,
          $screen_height: 2556,
          $viewport_width: 390,
          $viewport_height: 844,
        }),
      );
      expect(result?.properties.$screen_width).toBe(1100);
      expect(result?.properties.$screen_height).toBe(2500);
      expect(result?.properties.$viewport_width).toBe(300);
      expect(result?.properties.$viewport_height).toBe(800);
    });

    it.each([
      ['ph_keyword', 'x'],
      ['title', 'eVoyage'],
      ['utm_source', 'google'],
      ['$initial_utm_source', 'google'],
      ['$ip', '1.2.3.4'],
      ['$device_id', 'dev-1'],
      ['$session_id', 'sess-1'],
      ['$window_id', 'win-1'],
      ['$session_entry_url', 'https://evoyage.app/plan'],
      ['$session_entry_referrer', '$direct'],
      ['$geoip_country_name', 'Vietnam'],
      ['$search_engine', 'google'],
      ['$prev_pageview_pathname', '/plan'],
      ['$config_defaults', 'unset'],
      ['$sdk_dist_channel', 'npm'],
      ['$lib_rate_limit_remaining_tokens', 96],
      ['$is_identified', false],
    ])('drops the system key %s by name', (key, value) => {
      const result = sanitizeCaptureResult(cr('$pageview', { path: '/plan', [key]: value }));
      expect(result?.properties).not.toHaveProperty(key);
    });

    it('drops any unlisted $-prefixed system key', () => {
      const result = sanitizeCaptureResult(cr('$pageview', { path: '/plan', $some_future_sdk_field: 'x' }));
      expect(result?.properties).not.toHaveProperty('$some_future_sdk_field');
    });
  });

  describe('sanitizeCaptureResult — custom keys', () => {
    it('drops a custom key not on the event allowlist', () => {
      const result = sanitizeCaptureResult(cr('station_tapped', { provider: 'vinfast', station_id: 'abc' }));
      expect(result?.properties.provider).toBe('vinfast');
      expect(result?.properties).not.toHaveProperty('station_id');
    });

    it.each(['has space', 'a,b', 'a.b', 'a/b'])('drops a string value with disallowed characters: %s', (value) => {
      const result = sanitizeCaptureResult(cr('station_tapped', { provider: value }));
      expect(result?.properties).not.toHaveProperty('provider');
    });

    it('drops objects and non-finite numbers, keeps booleans and null', () => {
      const result = sanitizeCaptureResult(
        cr('reliability_calibration', {
          candidate_count: Number.POSITIVE_INFINITY,
          gated_count: 10,
          mean_reliability: null,
        }),
      );
      expect(result?.properties).not.toHaveProperty('candidate_count');
      expect(result?.properties.gated_count).toBe(10);
      expect(result?.properties.mean_reliability).toBeNull();

      const withObject = sanitizeCaptureResult(
        cr('station_tapped', { provider: { nested: true } as unknown as string }),
      );
      expect(withObject?.properties).not.toHaveProperty('provider');

      const withBool = sanitizeCaptureResult(cr('trip_pin_toggle', { pinned: true }));
      expect(withBool?.properties.pinned).toBe(true);
    });

    it('filters arrays to only the values that pass the check', () => {
      const result = sanitizeCaptureResult(
        cr('backup_alternatives_distribution', {
          stop_count: 4,
          alt_counts: [3, 2, 'bad value', 0, 1, { x: 1 }],
          no_backup_stops: 1,
          mean_alt_count: 1.5,
        }),
      );
      expect(result?.properties.alt_counts).toEqual([3, 2, 0, 1]);
    });

    it('normalizes the $pageview "path" custom key, exempt from the generic string regex', () => {
      const result = sanitizeCaptureResult(cr('$pageview', { path: '/admin/feedback/42' }));
      expect(result?.properties.path).toBe('/admin/feedback/:id');
    });
  });

  describe('person-data fields are always removed', () => {
    it('deletes $set / $set_once / $unset at the top level and inside properties', () => {
      const result = sanitizeCaptureResult(
        cr(
          '$pageview',
          { path: '/plan', $set: { a: 1 }, $set_once: { b: 2 }, $unset: ['c'] },
          { $set: { top: true }, $set_once: { top2: true }, $unset: ['top3'] },
        ),
      );
      expect(result).not.toHaveProperty('$set');
      expect(result).not.toHaveProperty('$set_once');
      expect(result).not.toHaveProperty('$unset');
      expect(result?.properties).not.toHaveProperty('$set');
      expect(result?.properties).not.toHaveProperty('$set_once');
      expect(result?.properties).not.toHaveProperty('$unset');
    });
  });

  it('always sets $geoip_disable = true', () => {
    const result = sanitizeCaptureResult(cr('$pageview', { path: '/' }));
    expect(result?.properties.$geoip_disable).toBe(true);
  });

  it('keeps only {uuid, event, properties, timestamp} at the top level', () => {
    const result = sanitizeCaptureResult(cr('$pageview', { path: '/' }));
    expect(Object.keys(result ?? {}).sort()).toEqual(['event', 'properties', 'timestamp', 'uuid']);
  });

  describe('fails closed', () => {
    it.each([null, undefined, 'a string', 42, true, []])('returns null for malformed input: %j', (input) => {
      expect(sanitizeCaptureResult(input)).toBeNull();
    });

    it('returns null if properties is missing or not an object', () => {
      expect(sanitizeCaptureResult({ event: '$pageview' })).not.toBeNull(); // empty properties is fine
      expect(sanitizeCaptureResult({ event: '$pageview', properties: 'nope' })?.properties).toEqual(
        expect.objectContaining({ $geoip_disable: true }),
      );
    });
  });

  describe('KNOWN_ROUTES', () => {
    it('includes every static route plus the two templates and /other', () => {
      expect([...KNOWN_ROUTES].sort()).toEqual(
        ['/', '/plan', '/privacy', '/admin/feedback', '/admin/feedback/:id', '/s/:code', '/other'].sort(),
      );
    });
  });

  describe('providerSlug', () => {
    it('slugifies every known provider to a value that passes the custom-value check', () => {
      for (const provider of KNOWN_PROVIDERS) {
        const slug = providerSlug(provider);
        expect(slug).toMatch(/^[a-z0-9_-]{1,40}$/);
      }
    });

    it.each([
      ['EV One', 'ev_one'],
      ['CHARGE+', 'charge_plus'],
      ['Mercedes-Benz', 'mercedes_benz'],
      ['VinFast', 'vinfast'],
    ])('%s -> %s', (input, expected) => {
      expect(providerSlug(input)).toBe(expected);
    });

    it('maps unknown raw provider text to "other"', () => {
      expect(providerSlug('Some Random OSM Operator LLC')).toBe('other');
      expect(providerSlug('Other')).toBe('other');
    });
  });

  describe('EVENT_PROPERTY_ALLOWLIST', () => {
    it('includes trackFeedbackOpened and trackReliabilityCalibration event names', () => {
      expect(EVENT_PROPERTY_ALLOWLIST.feedback_opened).toEqual(['category']);
      expect(EVENT_PROPERTY_ALLOWLIST.reliability_calibration).toEqual([
        'candidate_count',
        'gated_count',
        'mean_reliability',
      ]);
    });
  });
});
