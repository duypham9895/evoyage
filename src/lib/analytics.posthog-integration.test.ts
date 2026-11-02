// @vitest-environment jsdom
//
// B-1 integration harness: drives the REAL posthog-js library (not mocked)
// through the REAL `initAnalytics`/`track*` helpers, and observes the actual
// outgoing network request bodies via stubbed fetch/XHR/sendBeacon. This is
// the only way to prove that `sanitizeCaptureResult` (wired as `before_send`)
// is what actually leaves the browser — a mocked `posthog-js` (as in
// analytics.test.ts) cannot prove that.
//
// Validated by scratchpad probe6 before this file was written: stubbing
// fetch in `vi.hoisted()` (before the static `posthog-js`/`analytics` import)
// reliably observes real posthog-js network calls with NO `vi.resetModules()`
// between tests — PROVIDED the init config matches production flags exactly
// (capture_pageview:false etc.), or a spurious autocaptured `$pageview` can
// pollute the recorder.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PROPERTY_ALLOWLIST, EVENT_PROPERTY_ALLOWLIST } from './analytics-sanitize';

interface RecordedCall {
  readonly pathname: string;
  readonly url: string;
  readonly body: string;
}

interface CapturedEntry {
  readonly uuid?: string;
  readonly event: string;
  readonly properties: Record<string, unknown>;
  readonly timestamp?: string;
}

const rec = vi.hoisted(() => {
  const calls: RecordedCall[] = [];

  async function bodyToText(body: unknown): Promise<string> {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString();
    if (typeof Blob !== 'undefined' && body instanceof Blob) return body.text();
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
    return String(body);
  }

  function record(url: string, body: string): void {
    let pathname = url;
    try {
      pathname = new URL(url, 'http://localhost').pathname;
    } catch {
      // keep the raw url as a best-effort pathname
    }
    calls.push({ pathname, url, body });
  }

  (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = typeof input === 'string' ? input : input.toString();
    record(url, await bodyToText(init?.body));
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  /** Minimal XHR stub (`api_transport:'fetch'` is forced in this harness, so this is a defensive fallback only). */
  class RecXHR {
    withCredentials = false;
    status = 200;
    readyState = 4;
    responseText = '{}';
    private _url = '';
    private listeners: Record<string, Array<() => void>> = {};
    open(_method: string, url: string): void {
      this._url = url;
    }
    setRequestHeader(): void {
      // no-op
    }
    addEventListener(type: string, cb: () => void): void {
      (this.listeners[type] ??= []).push(cb);
    }
    async send(body?: unknown): Promise<void> {
      record(this._url, await bodyToText(body));
      queueMicrotask(() => {
        this.listeners.load?.forEach((cb) => cb());
        this.listeners.readystatechange?.forEach((cb) => cb());
      });
    }
  }
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = RecXHR;

  // jsdom's `window.navigator` is a getter-only property — patch the method
  // on the existing object instead of replacing the whole `navigator`.
  (navigator as unknown as { sendBeacon: (url: string, body?: BodyInit) => boolean }).sendBeacon = (
    url,
    body,
  ) => {
    void bodyToText(body).then((text) => record(url, text));
    return true;
  };

  return { calls };
});

/** Waits until at least one recorded call hits the capture endpoint with this event name in its body. */
async function expectCaptured(eventName: string): Promise<void> {
  await vi.waitFor(() => {
    const found = rec.calls.some(
      (c) => c.pathname === '/e/' && c.body.includes(`"event":"${eventName}"`),
    );
    expect(found).toBe(true);
  });
}

/** Finds the most recently recorded batch entry for `eventName`, parsed from the request body. */
function findCaptured(eventName: string): CapturedEntry | undefined {
  for (let i = rec.calls.length - 1; i >= 0; i--) {
    const call = rec.calls[i]!;
    if (call.pathname !== '/e/') continue;
    let parsed: { batch?: CapturedEntry[] };
    try {
      parsed = JSON.parse(call.body) as { batch?: CapturedEntry[] };
    } catch {
      continue;
    }
    const match = parsed.batch?.find((e) => e.event === eventName);
    if (match) return match;
  }
  return undefined;
}

// The one real-trip-data fingerprint this file must never see leave the browser.
const LEAK_RE = /10\.776889|106\.700806|Nha|Da%20Lat|Da Lat|slat|wp=|evil\.example\/path/;

describe('PostHog integration (real posthog-js, stubbed network)', () => {
  let initAnalytics: typeof import('./analytics').initAnalytics;
  let isAnalyticsEnabled: typeof import('./analytics').isAnalyticsEnabled;
  let trackPageView: typeof import('./analytics').trackPageView;
  let trackFeedbackOpened: typeof import('./analytics').trackFeedbackOpened;
  let trackTripPlanned: typeof import('./analytics').trackTripPlanned;
  let analyticsMod: typeof import('./analytics');
  let posthog: typeof import('posthog-js').default;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    // trackColorScheme (Slice 6) returns early without window.matchMedia, which
    // jsdom does not provide by default.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

    history.replaceState(
      {},
      '',
      '/plan?slat=10.776889&slng=106.700806&start=Nha%20toi&end=Da%20Lat&wp=%5B%5D',
    );
    Object.defineProperty(document, 'referrer', {
      value: 'https://evil.example/path?slat=10.776889',
      configurable: true,
    });

    analyticsMod = await import('./analytics');
    initAnalytics = analyticsMod.initAnalytics;
    isAnalyticsEnabled = analyticsMod.isAnalyticsEnabled;
    trackPageView = analyticsMod.trackPageView;
    trackFeedbackOpened = analyticsMod.trackFeedbackOpened;
    trackTripPlanned = analyticsMod.trackTripPlanned;
    posthog = (await import('posthog-js')).default;

    initAnalytics({ api_transport: 'fetch', request_batching: false, disable_compression: true });
    expect(isAnalyticsEnabled()).toBe(true);
  });

  beforeEach(() => {
    rec.calls.length = 0;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('trackPageView produces a $pageview at /e/ with properties.token set', async () => {
    trackPageView('/plan');
    await expectCaptured('$pageview');
    const captured = findCaptured('$pageview');
    expect(captured?.properties.token).toBe('phc_test');
    expect(captured?.properties.path).toBe('/plan');
  });

  it('trackTripPlanned (new bucketed signature) is recorded at /e/, with no leaks and a clean key set', async () => {
    // history.replaceState in beforeAll put slat/slng/start/end/wp on the URL
    // — this is the leak check for the trip-planned helper specifically.
    trackTripPlanned(1700);
    await expectCaptured('trip_planned');
    const captured = findCaptured('trip_planned');
    expect(captured?.properties.distance_bucket).toBe('1000plus');

    const allowed = new Set<string>([
      ...SYSTEM_PROPERTY_ALLOWLIST,
      ...EVENT_PROPERTY_ALLOWLIST.trip_planned!,
      '$geoip_disable',
    ]);
    for (const key of Object.keys(captured!.properties)) {
      expect(allowed.has(key)).toBe(true);
    }
    for (const call of rec.calls) {
      expect(call.pathname).toBe('/e/');
      expect(call.body).not.toMatch(LEAK_RE);
      expect(call.url).not.toMatch(LEAK_RE);
    }
  });

  it('no leaks: no recorded body or url contains the real trip/referrer data', async () => {
    trackPageView('/plan');
    await expectCaptured('$pageview');
    for (const call of rec.calls) {
      expect(call.body).not.toMatch(LEAK_RE);
      expect(call.url).not.toMatch(LEAK_RE);
    }
  });

  it('every recorded request goes to the capture endpoint (no /flags, /decide, /array/, /i/v1/logs, metrics)', async () => {
    trackFeedbackOpened('bug');
    await expectCaptured('feedback_opened');
    expect(rec.calls.length).toBeGreaterThan(0);
    for (const call of rec.calls) {
      expect(call.pathname).toBe('/e/');
    }
  });

  it('key set: every property key is within the allowlist union, and the R6 denylist catches dangerous keys', async () => {
    trackFeedbackOpened('bug');
    await expectCaptured('feedback_opened');
    const captured = findCaptured('feedback_opened');
    expect(captured).toBeDefined();

    const allowed = new Set<string>([
      ...SYSTEM_PROPERTY_ALLOWLIST,
      ...EVENT_PROPERTY_ALLOWLIST.feedback_opened!,
      '$geoip_disable',
    ]);
    const keys = Object.keys(captured!.properties);
    for (const key of keys) {
      expect(allowed.has(key)).toBe(true);
    }

    // R6: a separate denylist, independent of the allowlist above, so a
    // dangerous key accidentally ADDED to the allowlist itself is still caught.
    const DENY_PREFIXES = ['title', '$ip', '$session_entry_', '$prev_pageview_', '$set', 'utm_'];
    for (const key of keys) {
      for (const bad of DENY_PREFIXES) {
        expect(key === bad || key.startsWith(bad)).toBe(false);
      }
    }
  });

  it('cookieless keys: $cookieless_mode, distinct_id, $raw_user_agent', async () => {
    trackPageView('/');
    await expectCaptured('$pageview');
    const captured = findCaptured('$pageview');
    expect(captured?.properties.$cookieless_mode).toBe(true);
    expect(captured?.properties.distinct_id).toBe('$posthog_cookieless');
    expect(typeof captured?.properties.$raw_user_agent).toBe('string');
  });

  it('$referrer and $initial_referrer are absent — regression guard for save_referrer:false', async () => {
    trackPageView('/plan');
    await expectCaptured('$pageview');
    const captured = findCaptured('$pageview');
    expect(captured?.properties).not.toHaveProperty('$referrer');
    expect(captured?.properties).not.toHaveProperty('$initial_referrer');
  });

  it('unknown event: posthog.capture returns undefined and nothing leaks through', async () => {
    // Establish a baseline real event first, so the later wait has something
    // to land on — avoids "waiting on a thing that must NOT happen".
    trackPageView('/plan');
    await expectCaptured('$pageview');
    rec.calls.length = 0;

    const ret = posthog.capture('not_allowed');
    expect(ret).toBeUndefined();

    trackPageView('/');
    await expectCaptured('$pageview');

    for (const call of rec.calls) {
      expect(call.body).not.toContain('not_allowed');
    }
  });

  it('trackPageView normalizes /privacy and /admin/feedback/42 correctly', async () => {
    trackPageView('/privacy');
    await expectCaptured('$pageview');
    expect(findCaptured('$pageview')?.properties.path).toBe('/privacy');

    rec.calls.length = 0;
    trackPageView('/admin/feedback/42');
    await expectCaptured('$pageview');
    expect(findCaptured('$pageview')?.properties.path).toBe('/admin/feedback/:id');
  });

  describe('Slice 6 — every track* helper survives the sanitizer intact', () => {
    const PRECAUTIONARY_PAYLOAD = {
      reasonPrimary: 'holiday' as const,
      reasonSecondary: ['sparse' as const],
      pressureScore: 4,
      legDistanceKm: 127,
      legSparsityCount: 2,
      safetyFactor: 0.8,
      vehicleBatteryKwh: 82,
    };

    // One fixture-args entry per helper name — REQUIRED. A helper exported
    // from analytics.ts with no entry here fails the "every helper" test
    // below explicitly, rather than being silently skipped (review N-7/N-4).
    const FIXTURES: Record<string, { args: unknown[]; event: string }> = {
      trackColorScheme: { args: [], event: 'color_scheme_detected' },
      trackPageView: { args: ['/plan'], event: '$pageview' },
      trackTripPlanned: { args: [1700], event: 'trip_planned' },
      trackStationTapped: { args: ['VinFast'], event: 'station_tapped' },
      trackFeedbackOpened: { args: ['bug'], event: 'feedback_opened' },
      trackEviMessage: { args: ['text', 42], event: 'evi_message' },
      trackShareClicked: { args: ['link'], event: 'share_clicked' },
      trackTerrainWarningShown: { args: ['pass-1', 12], event: 'terrain_warning_shown' },
      trackDeparturePicked: { args: [2.5], event: 'departure_picked' },
      trackTrafficCalloutShown: { args: ['heuristic', 1.2], event: 'traffic_callout_shown' },
      trackWhatIfPicked: { args: ['option-a'], event: 'whatif_picked' },
      trackAmenitiesViewed: { args: [true, 5], event: 'amenities_viewed' },
      trackAmenityTapped: { args: ['quick_bite', 4], event: 'amenity_tapped' },
      trackNotebookOpened: { args: [3], event: 'notebook_opened' },
      trackTripReplannedFromNotebook: { args: [2.5], event: 'trip_replanned_from_notebook' },
      trackTripPinToggle: { args: [true], event: 'trip_pin_toggle' },
      trackBackupAlternativesDistribution: { args: [[3, 2, 0, 1]], event: 'backup_alternatives_distribution' },
      trackPrecautionaryStopDistribution: { args: [2], event: 'precautionary_stop_distribution' },
      trackPrecautionaryStopSuggested: { args: [PRECAUTIONARY_PAYLOAD], event: 'extra_stop_suggested' },
      trackPrecautionaryStopAccepted: { args: [PRECAUTIONARY_PAYLOAD], event: 'extra_stop_accepted' },
      trackPrecautionaryStopDismissed: { args: [PRECAUTIONARY_PAYLOAD, 1234], event: 'extra_stop_dismissed' },
      trackPrecautionaryStopUndone: { args: [PRECAUTIONARY_PAYLOAD], event: 'extra_stop_undone' },
      trackAlternativeMarkerClicked: { args: [0, 1], event: 'alternative_marker_clicked' },
      trackAlternativeListItemClicked: { args: [0, 1], event: 'alternative_list_item_clicked' },
      trackAlternativeNavigateClicked: { args: [0, 1], event: 'alternative_navigate_clicked' },
      trackReliabilityCalibration: {
        args: [{ candidateCount: 10, gatedCount: 2, meanReliability: 0.9 }],
        event: 'reliability_calibration',
      },
    };

    it('every exported track* helper produces exactly one sanitized event at /e/', async () => {
      const helperNames = Object.keys(analyticsMod).filter((k) => k.startsWith('track'));
      expect(helperNames.length).toBeGreaterThan(0);

      for (const name of helperNames) {
        const fixture = FIXTURES[name];
        // A helper with no fixture entry fails here — explicit, not skipped.
        expect(fixture, `no Slice-6 fixture registered for '${name}'`).toBeDefined();

        rec.calls.length = 0;
        const helper = (analyticsMod as unknown as Record<string, (...a: unknown[]) => void>)[name]!;
        helper(...fixture!.args);
        await expectCaptured(fixture!.event);

        const matchingCalls = rec.calls.filter(
          (c) => c.pathname === '/e/' && c.body.includes(`"event":"${fixture!.event}"`),
        );
        // Exactly one helper call must produce exactly one captured event —
        // an empty/duplicated list cannot pass this count check.
        expect(matchingCalls.length).toBe(1);
      }
    });
  });
});
