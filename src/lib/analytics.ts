/**
 * PostHog analytics — typed event helpers with strict gating.
 *
 * Gating rules:
 *   1. Analytics ONLY initialize when `NEXT_PUBLIC_POSTHOG_KEY` is set AND
 *      `NODE_ENV === 'production'`. Tests and dev never fire events by default.
 *   2. If init never runs, every event helper becomes a no-op.
 *   3. Event helpers swallow errors so a broken analytics pipeline never
 *      crashes the app.
 *
 * PII rules:
 *   - Never send email, name, IP, or precise coordinates.
 *   - Only IDs (opaque), categories (enum-like strings), and aggregate numbers.
 */

import posthog from 'posthog-js';

let initialized = false;

/** True only when posthog has been successfully initialized. */
export function isAnalyticsEnabled(): boolean {
  return initialized;
}

/**
 * Initialize PostHog. Safe to call multiple times — idempotent.
 * No-op when:
 *   - `NEXT_PUBLIC_POSTHOG_KEY` is missing
 *   - `NODE_ENV` is not 'production'
 *   - already initialized
 */
export function initAnalytics(): void {
  if (initialized) return;
  if (process.env.NODE_ENV !== 'production') return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';

  try {
    posthog.init(key, {
      api_host: host,
      // Privacy-first defaults
      capture_pageview: false, // we send pageviews manually via trackPageView
      capture_pageleave: false,
      autocapture: false, // we instrument explicit events only
      disable_session_recording: true,
      persistence: 'localStorage+cookie',
    });
    initialized = true;
  } catch {
    // Never let analytics init crash the app
    initialized = false;
  }
}

/** Wrap posthog.capture so a failure never propagates. */
function safeCapture(event: string, properties: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Swallow — analytics must not break user flows
  }
}

// ── Event helpers ─────────────────────────────────────────────────────────

/** Page navigation. */
export function trackPageView(path: string): void {
  safeCapture('$pageview', { path });
}

/**
 * User completed a trip plan request.
 * Cities are user-typed labels (already non-PII at the precision we capture);
 * distanceKm is aggregate.
 */
export function trackTripPlanned(
  startCity: string,
  endCity: string,
  distanceKm: number,
): void {
  safeCapture('trip_planned', {
    start_city: startCity,
    end_city: endCity,
    distance_km: distanceKm,
  });
}

/** User tapped a charging station card or marker. */
export function trackStationTapped(stationId: string, provider: string): void {
  safeCapture('station_tapped', {
    station_id: stationId,
    provider,
  });
}

/** User opened the feedback modal/FAB. */
export function trackFeedbackOpened(category: string): void {
  safeCapture('feedback_opened', { category });
}

/** User sent a message to eVi (voice or text). */
export function trackEviMessage(
  messageType: 'voice' | 'text',
  tokensUsed?: number,
): void {
  const payload: Record<string, unknown> = { message_type: messageType };
  if (typeof tokensUsed === 'number') {
    payload.tokens_used = tokensUsed;
  }
  safeCapture('evi_message', payload);
}

/** User shared a trip via link or QR. */
export function trackShareClicked(shareMethod: 'link' | 'qr'): void {
  safeCapture('share_clicked', { share_method: shareMethod });
}

// ── Phase 1+2+4 Trust Intelligence events ────────────────────────────────
// Capture engagement with the trust-intelligence layer so we have a baseline
// before Phase 3b ships and can measure whether each Phase actually moves
// driver behavior.

/** Phase 1 — A terrain warning rendered on a trip plan. */
export function trackTerrainWarningShown(passId: string, drainPercent: number): void {
  safeCapture('terrain_warning_shown', { pass_id: passId, drain_percent: drainPercent });
}

/** Phase 2 — User picked a non-"now" departure time. */
export function trackDeparturePicked(leadHours: number): void {
  safeCapture('departure_picked', { lead_hours: Math.round(leadHours * 10) / 10 });
}

/** Phase 2 — Traffic callout rendered (heuristic or live). */
export function trackTrafficCalloutShown(
  source: 'heuristic' | 'mapbox-traffic',
  multiplier: number,
): void {
  safeCapture('traffic_callout_shown', {
    source,
    multiplier: Math.round(multiplier * 100) / 100,
  });
}

/** Phase 2 — User tapped a what-if alternative card. */
export function trackWhatIfPicked(optionKey: string): void {
  safeCapture('whatif_picked', { option: optionKey });
}

/** Phase 4 — User expanded a stop and the amenities panel mounted. */
export function trackAmenitiesViewed(
  stationId: string,
  fromCache: boolean,
  poiCount: number,
): void {
  safeCapture('amenities_viewed', {
    station_id: stationId,
    from_cache: fromCache,
    poi_count: poiCount,
  });
}

/** Phase 4 — User tapped a POI row to open in Google Maps. */
export function trackAmenityTapped(category: string, walkingMinutes: number): void {
  safeCapture('amenity_tapped', {
    category,
    walking_minutes: walkingMinutes,
  });
}
