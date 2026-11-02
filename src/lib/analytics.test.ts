// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock posthog-js BEFORE importing analytics so the module picks up the mock.
const captureMock = vi.fn();
const initMock = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    init: (...args: unknown[]) => initMock(...args),
    capture: (...args: unknown[]) => captureMock(...args),
  },
}));

// Helper to import a fresh copy of the analytics module under different env conditions.
async function loadAnalytics() {
  vi.resetModules();
  return import('./analytics');
}

const ORIGINAL_ENV = { ...process.env };

describe('analytics', () => {
  beforeEach(() => {
    captureMock.mockReset();
    initMock.mockReset();
    // Restore env to a clean baseline before each test
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  describe('initAnalytics', () => {
    it('is a no-op when NEXT_PUBLIC_POSTHOG_KEY is missing', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const { initAnalytics, isAnalyticsEnabled } = await loadAnalytics();

      expect(() => initAnalytics()).not.toThrow();
      expect(initMock).not.toHaveBeenCalled();
      expect(isAnalyticsEnabled()).toBe(false);
    });

    it('is a no-op when NODE_ENV is not production (test/dev)', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      (process.env as Record<string, string>).NODE_ENV = 'development';
      const { initAnalytics, isAnalyticsEnabled } = await loadAnalytics();

      initAnalytics();
      expect(initMock).not.toHaveBeenCalled();
      expect(isAnalyticsEnabled()).toBe(false);
    });

    it('initializes posthog when key present AND NODE_ENV=production', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://app.posthog.com';
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const { initAnalytics, isAnalyticsEnabled } = await loadAnalytics();

      initAnalytics();
      expect(initMock).toHaveBeenCalledTimes(1);
      expect(initMock).toHaveBeenCalledWith('phc_testkey', expect.objectContaining({
        api_host: 'https://app.posthog.com',
      }));
      expect(isAnalyticsEnabled()).toBe(true);
    });

    it('uses the PostHog US-region default host when NEXT_PUBLIC_POSTHOG_HOST is missing', async () => {
      // The CSP (src/proxy.ts) only allows https://*.i.posthog.com — the old
      // app.posthog.com fallback would be silently blocked by the browser.
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const { initAnalytics } = await loadAnalytics();

      initAnalytics();
      expect(initMock).toHaveBeenCalledWith('phc_testkey', expect.objectContaining({
        api_host: 'https://us.i.posthog.com',
      }));
    });

    it('does not initialize twice on repeated calls', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const { initAnalytics } = await loadAnalytics();

      initAnalytics();
      initAnalytics();
      initAnalytics();
      expect(initMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('event helpers (gated)', () => {
    it('do not call posthog.capture when analytics is disabled', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const a = await loadAnalytics();

      a.trackPageView('/plan');
      a.trackTripPlanned(1700);
      a.trackStationTapped('VinFast');
      a.trackFeedbackOpened('bug');
      a.trackEviMessage('text', 42);
      a.trackShareClicked('link');

      expect(captureMock).not.toHaveBeenCalled();
    });
  });

  describe('event helpers (enabled)', () => {
    beforeEach(async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      (process.env as Record<string, string>).NODE_ENV = 'production';
    });

    it('trackPageView calls capture with $pageview and path', async () => {
      const { initAnalytics, trackPageView } = await loadAnalytics();
      initAnalytics();
      trackPageView('/plan');
      expect(captureMock).toHaveBeenCalledWith('$pageview', { path: '/plan' });
    });

    it('trackTripPlanned calls capture with only a distance bucket (no city text)', async () => {
      const { initAnalytics, trackTripPlanned } = await loadAnalytics();
      initAnalytics();
      trackTripPlanned(1700);
      expect(captureMock).toHaveBeenCalledWith('trip_planned', {
        distance_bucket: '1000plus',
      });
    });

    describe('distanceBucket boundaries', () => {
      it.each([
        [0, 'lt100'],
        [99.9, 'lt100'],
        [100, '100to299'],
        [299.9, '100to299'],
        [300, '300to599'],
        [599.9, '300to599'],
        [600, '600to999'],
        [999, '600to999'],
        [1000, '1000plus'],
        [Number.NaN, 'lt100'],
        [-50, 'lt100'],
      ])('%s km -> %s', async (distanceKm, expectedBucket) => {
        const { initAnalytics, trackTripPlanned } = await loadAnalytics();
        initAnalytics();
        trackTripPlanned(distanceKm);
        expect(captureMock).toHaveBeenCalledWith('trip_planned', { distance_bucket: expectedBucket });
      });
    });

    it('trackStationTapped calls capture with ONLY a provider slug — no station id', async () => {
      const { initAnalytics, trackStationTapped } = await loadAnalytics();
      initAnalytics();
      trackStationTapped('VinFast');
      expect(captureMock).toHaveBeenCalledWith('station_tapped', {
        provider: 'vinfast',
      });
    });

    it('trackStationTapped slugifies an unrecognized provider to "other"', async () => {
      const { initAnalytics, trackStationTapped } = await loadAnalytics();
      initAnalytics();
      trackStationTapped('Some Long-Tail OSM Operator');
      expect(captureMock).toHaveBeenCalledWith('station_tapped', { provider: 'other' });
    });

    it('trackFeedbackOpened calls capture with category', async () => {
      const { initAnalytics, trackFeedbackOpened } = await loadAnalytics();
      initAnalytics();
      trackFeedbackOpened('bug');
      expect(captureMock).toHaveBeenCalledWith('feedback_opened', { category: 'bug' });
    });

    it('trackEviMessage calls capture with messageType and tokensUsed', async () => {
      const { initAnalytics, trackEviMessage } = await loadAnalytics();
      initAnalytics();
      trackEviMessage('voice', 256);
      expect(captureMock).toHaveBeenCalledWith('evi_message', {
        message_type: 'voice',
        tokens_used: 256,
      });
    });

    it('trackEviMessage omits tokens_used when not provided', async () => {
      const { initAnalytics, trackEviMessage } = await loadAnalytics();
      initAnalytics();
      trackEviMessage('text');
      expect(captureMock).toHaveBeenCalledWith('evi_message', { message_type: 'text' });
    });

    it('trackShareClicked calls capture with shareMethod', async () => {
      const { initAnalytics, trackShareClicked } = await loadAnalytics();
      initAnalytics();
      trackShareClicked('qr');
      expect(captureMock).toHaveBeenCalledWith('share_clicked', { share_method: 'qr' });
    });

    it('trackAmenitiesViewed calls capture with ONLY from_cache and poi_count — no station id', async () => {
      const { initAnalytics, trackAmenitiesViewed } = await loadAnalytics();
      initAnalytics();
      trackAmenitiesViewed(true, 7);
      expect(captureMock).toHaveBeenCalledWith('amenities_viewed', {
        from_cache: true,
        poi_count: 7,
      });
    });

    it('event helpers do not throw if posthog.capture rejects/throws', async () => {
      captureMock.mockImplementationOnce(() => { throw new Error('network down'); });
      const { initAnalytics, trackPageView } = await loadAnalytics();
      initAnalytics();
      expect(() => trackPageView('/plan')).not.toThrow();
    });

    // ── ADR-0006 backup events ──

    it('trackBackupAlternativesDistribution captures counts + derived aggregates', async () => {
      const { initAnalytics, trackBackupAlternativesDistribution } = await loadAnalytics();
      initAnalytics();
      trackBackupAlternativesDistribution([3, 2, 0, 1]);
      expect(captureMock).toHaveBeenCalledWith('backup_alternatives_distribution', {
        stop_count: 4,
        alt_counts: [3, 2, 0, 1],
        no_backup_stops: 1,
        mean_alt_count: 1.5,
      });
    });

    it('trackBackupAlternativesDistribution handles empty array', async () => {
      const { initAnalytics, trackBackupAlternativesDistribution } = await loadAnalytics();
      initAnalytics();
      trackBackupAlternativesDistribution([]);
      expect(captureMock).toHaveBeenCalledWith('backup_alternatives_distribution', {
        stop_count: 0,
        alt_counts: [],
        no_backup_stops: 0,
        mean_alt_count: 0,
      });
    });

    it('trackPrecautionaryStopDistribution captures the per-trip count bucket', async () => {
      const { initAnalytics, trackPrecautionaryStopDistribution } = await loadAnalytics();
      initAnalytics();
      trackPrecautionaryStopDistribution(3);
      expect(captureMock).toHaveBeenCalledWith('precautionary_stop_distribution', {
        precautionary_stop_count: 3,
        count_bucket: '2',
      });
    });

    it('trackPrecautionaryStopSuggested captures the ADR-0009 payload', async () => {
      const { initAnalytics, trackPrecautionaryStopSuggested } = await loadAnalytics();
      initAnalytics();
      trackPrecautionaryStopSuggested({
        reasonPrimary: 'holiday',
        reasonSecondary: ['sparse', 'peak'],
        pressureScore: 4,
        legDistanceKm: 126.5,
        legSparsityCount: 2,
        safetyFactor: 0.8,
        vehicleBatteryKwh: 82,
      });
      expect(captureMock).toHaveBeenCalledWith('extra_stop_suggested', {
        reasonPrimary: 'holiday',
        reasonSecondary: ['sparse', 'peak'],
        pressureScore: 4,
        legDistanceKm: 126.5,
        legSparsityCount: 2,
        safetyFactor: 0.8,
        vehicleBatteryKwh: 82,
      });
    });

    it('trackPrecautionaryStopAccepted captures the same ADR-0009 payload', async () => {
      const { initAnalytics, trackPrecautionaryStopAccepted } = await loadAnalytics();
      initAnalytics();
      trackPrecautionaryStopAccepted({
        reasonPrimary: 'holiday',
        reasonSecondary: [],
        pressureScore: 4,
        legDistanceKm: 126.5,
        legSparsityCount: 2,
        safetyFactor: 0.8,
        vehicleBatteryKwh: 82,
      });
      expect(captureMock).toHaveBeenCalledWith('extra_stop_accepted', {
        reasonPrimary: 'holiday',
        reasonSecondary: [],
        pressureScore: 4,
        legDistanceKm: 126.5,
        legSparsityCount: 2,
        safetyFactor: 0.8,
        vehicleBatteryKwh: 82,
      });
    });

    it('trackPrecautionaryStopDismissed captures dismiss latency', async () => {
      const { initAnalytics, trackPrecautionaryStopDismissed } = await loadAnalytics();
      initAnalytics();
      trackPrecautionaryStopDismissed({
        reasonPrimary: 'holiday',
        reasonSecondary: [],
        pressureScore: 4,
        legDistanceKm: 126.5,
        legSparsityCount: 2,
        safetyFactor: 0.8,
        vehicleBatteryKwh: 82,
      }, 1234);
      expect(captureMock).toHaveBeenCalledWith('extra_stop_dismissed', {
        reasonPrimary: 'holiday',
        reasonSecondary: [],
        pressureScore: 4,
        legDistanceKm: 126.5,
        legSparsityCount: 2,
        safetyFactor: 0.8,
        vehicleBatteryKwh: 82,
        dismissTimeMsFromShown: 1234,
      });
    });

    it('trackPrecautionaryStopUndone captures the restored stop payload', async () => {
      const { initAnalytics, trackPrecautionaryStopUndone } = await loadAnalytics();
      initAnalytics();
      trackPrecautionaryStopUndone({
        reasonPrimary: 'holiday',
        reasonSecondary: [],
        pressureScore: 4,
        legDistanceKm: 126.5,
        legSparsityCount: 2,
        safetyFactor: 0.8,
        vehicleBatteryKwh: 82,
      });
      expect(captureMock).toHaveBeenCalledWith('extra_stop_undone', {
        reasonPrimary: 'holiday',
        reasonSecondary: [],
        pressureScore: 4,
        legDistanceKm: 126.5,
        legSparsityCount: 2,
        safetyFactor: 0.8,
        vehicleBatteryKwh: 82,
      });
    });

    it('trackAlternativeMarkerClicked captures stop and alt indices', async () => {
      const { initAnalytics, trackAlternativeMarkerClicked } = await loadAnalytics();
      initAnalytics();
      trackAlternativeMarkerClicked(2, 0);
      expect(captureMock).toHaveBeenCalledWith('alternative_marker_clicked', {
        stop_idx: 2,
        alt_idx: 0,
      });
    });

    it('trackAlternativeListItemClicked captures stop and alt indices', async () => {
      const { initAnalytics, trackAlternativeListItemClicked } = await loadAnalytics();
      initAnalytics();
      trackAlternativeListItemClicked(0, 2);
      expect(captureMock).toHaveBeenCalledWith('alternative_list_item_clicked', {
        stop_idx: 0,
        alt_idx: 2,
      });
    });

    it('trackAlternativeNavigateClicked captures stop and alt indices', async () => {
      const { initAnalytics, trackAlternativeNavigateClicked } = await loadAnalytics();
      initAnalytics();
      trackAlternativeNavigateClicked(1, 1);
      expect(captureMock).toHaveBeenCalledWith('alternative_navigate_clicked', {
        stop_idx: 1,
        alt_idx: 1,
      });
    });

    it('trackReliabilityCalibration captures candidate / gated / mean fields', async () => {
      const { initAnalytics, trackReliabilityCalibration } = await loadAnalytics();
      initAnalytics();
      trackReliabilityCalibration({ candidateCount: 50, gatedCount: 20, meanReliability: 0.92 });
      expect(captureMock).toHaveBeenCalledWith('reliability_calibration', {
        candidate_count: 50,
        gated_count: 20,
        mean_reliability: 0.92,
      });
    });

    it('trackReliabilityCalibration accepts null meanReliability when all gated', async () => {
      const { initAnalytics, trackReliabilityCalibration } = await loadAnalytics();
      initAnalytics();
      trackReliabilityCalibration({ candidateCount: 10, gatedCount: 10, meanReliability: null });
      expect(captureMock).toHaveBeenCalledWith('reliability_calibration', {
        candidate_count: 10,
        gated_count: 10,
        mean_reliability: null,
      });
    });
  });

  describe('PII hygiene', () => {
    it('payload keys are limited to expected non-PII fields', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const a = await loadAnalytics();
      a.initAnalytics();

      a.trackTripPlanned(1700);
      const [, payload] = captureMock.mock.calls[0];
      const keys = Object.keys(payload as Record<string, unknown>).sort();
      expect(keys).toEqual(['distance_bucket']);
      // explicitly forbid PII-leaning keys
      for (const forbidden of ['email', 'name', 'ip', 'lat', 'lng', 'latitude', 'longitude', 'user_id']) {
        expect(keys).not.toContain(forbidden);
      }
    });
  });

  describe('trackColorScheme', () => {
    function stubColorScheme(matches: { dark: boolean; light: boolean }) {
      vi.stubGlobal('matchMedia', (q: string) => ({
        matches: q.includes('dark') ? matches.dark : q.includes('light') ? matches.light : false,
      }));
    }

    afterEach(() => vi.unstubAllGlobals());

    async function loadInitialized() {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const mod = await loadAnalytics();
      mod.initAnalytics();
      return mod;
    }

    it('reports a dark OS preference', async () => {
      stubColorScheme({ dark: true, light: false });
      const { trackColorScheme } = await loadInitialized();
      trackColorScheme();
      expect(captureMock).toHaveBeenCalledWith('color_scheme_detected', { scheme: 'dark' });
    });

    it('reports a light OS preference', async () => {
      stubColorScheme({ dark: false, light: true });
      const { trackColorScheme } = await loadInitialized();
      trackColorScheme();
      expect(captureMock).toHaveBeenCalledWith('color_scheme_detected', { scheme: 'light' });
    });

    it('reports no-preference when neither query matches', async () => {
      stubColorScheme({ dark: false, light: false });
      const { trackColorScheme } = await loadInitialized();
      trackColorScheme();
      expect(captureMock).toHaveBeenCalledWith('color_scheme_detected', { scheme: 'no-preference' });
    });

    it('is a no-op when analytics never initialized', async () => {
      stubColorScheme({ dark: true, light: false });
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const { trackColorScheme } = await loadAnalytics();
      trackColorScheme();
      expect(captureMock).not.toHaveBeenCalled();
    });

    it('does not throw when matchMedia is unavailable', async () => {
      vi.stubGlobal('matchMedia', undefined);
      const { trackColorScheme } = await loadInitialized();
      expect(() => trackColorScheme()).not.toThrow();
      expect(captureMock).not.toHaveBeenCalled();
    });
  });

  it('runs cookieless: no cookie, no localStorage identifier (keeps the no-personal-data stance)', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const { initAnalytics } = await loadAnalytics();
    initAnalytics();
    const config = initMock.mock.calls[0][1];
    expect(config).toMatchObject({ cookieless_mode: 'always' });
    expect(config.persistence).not.toMatch(/cookie|localStorage/);
  });

  it('never loads external PostHog scripts (keeps script-src surface minimal)', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const { initAnalytics } = await loadAnalytics();
    initAnalytics();
    expect(initMock.mock.calls[0][1]).toMatchObject({ disable_external_dependency_loading: true });
  });

  describe('buildPostHogConfig', () => {
    it('installs sanitizeCaptureResult as before_send, by reference', async () => {
      const { buildPostHogConfig } = await loadAnalytics();
      const { sanitizeCaptureResult } = await import('./analytics-sanitize');
      const config = buildPostHogConfig();
      expect(config.before_send).toBe(sanitizeCaptureResult);
    });

    it('sets every R6 privacy flag', async () => {
      const { buildPostHogConfig } = await loadAnalytics();
      const config = buildPostHogConfig();
      expect(config).toMatchObject({
        save_campaign_params: false,
        save_referrer: false,
        advanced_disable_flags: true,
        person_profiles: 'never',
        cookieless_mode: 'always',
        persistence: 'memory',
        disable_external_dependency_loading: true,
      });
    });

    it('defaults api_host to the PostHog US region', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
      const { buildPostHogConfig } = await loadAnalytics();
      expect(buildPostHogConfig().api_host).toBe('https://us.i.posthog.com');
    });

    it('merges overrides last, so a caller can replace any default', async () => {
      const { buildPostHogConfig } = await loadAnalytics();
      const config = buildPostHogConfig({ persistence: 'localStorage', api_host: 'https://override.example' });
      expect(config.persistence).toBe('localStorage');
      expect(config.api_host).toBe('https://override.example');
      // Everything not overridden keeps its default.
      expect(config.cookieless_mode).toBe('always');
    });
  });

  describe('initAnalytics(overrides) — test-only parameter', () => {
    it('initAnalytics() with no argument produces the plain production config', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const { initAnalytics, buildPostHogConfig } = await loadAnalytics();
      initAnalytics();
      expect(initMock).toHaveBeenCalledWith('phc_testkey', buildPostHogConfig());
    });

    it('forwards overrides into buildPostHogConfig', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const { initAnalytics } = await loadAnalytics();
      initAnalytics({ request_batching: false, disable_compression: true });
      expect(initMock).toHaveBeenCalledWith(
        'phc_testkey',
        expect.objectContaining({ request_batching: false, disable_compression: true }),
      );
    });
  });
});
