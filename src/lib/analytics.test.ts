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

    it('uses default host when NEXT_PUBLIC_POSTHOG_HOST is missing', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const { initAnalytics } = await loadAnalytics();

      initAnalytics();
      expect(initMock).toHaveBeenCalledWith('phc_testkey', expect.objectContaining({
        api_host: 'https://app.posthog.com',
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
      a.trackTripPlanned('Hanoi', 'Saigon', 1700);
      a.trackStationTapped('vf-001', 'vinfast');
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

    it('trackTripPlanned calls capture with start, end, distance', async () => {
      const { initAnalytics, trackTripPlanned } = await loadAnalytics();
      initAnalytics();
      trackTripPlanned('Hanoi', 'Saigon', 1700);
      expect(captureMock).toHaveBeenCalledWith('trip_planned', {
        start_city: 'Hanoi',
        end_city: 'Saigon',
        distance_km: 1700,
      });
    });

    it('trackStationTapped calls capture with stationId and provider', async () => {
      const { initAnalytics, trackStationTapped } = await loadAnalytics();
      initAnalytics();
      trackStationTapped('vf-123', 'vinfast');
      expect(captureMock).toHaveBeenCalledWith('station_tapped', {
        station_id: 'vf-123',
        provider: 'vinfast',
      });
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
  });

  describe('PII hygiene', () => {
    it('payload keys are limited to expected non-PII fields', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_testkey';
      (process.env as Record<string, string>).NODE_ENV = 'production';
      const a = await loadAnalytics();
      a.initAnalytics();

      a.trackTripPlanned('Hanoi', 'Saigon', 1700);
      const [, payload] = captureMock.mock.calls[0];
      const keys = Object.keys(payload as Record<string, unknown>).sort();
      expect(keys).toEqual(['distance_km', 'end_city', 'start_city']);
      // explicitly forbid PII-leaning keys
      for (const forbidden of ['email', 'name', 'ip', 'lat', 'lng', 'latitude', 'longitude', 'user_id']) {
        expect(keys).not.toContain(forbidden);
      }
    });
  });
});
