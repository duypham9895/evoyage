/**
 * PostHog analytics — typed event helpers with strict gating.
 *
 * What this code enforces:
 *   1. Analytics ONLY initialize when `NEXT_PUBLIC_POSTHOG_KEY` is set AND
 *      `NODE_ENV === 'production'`. Tests and dev never fire events by default.
 *   2. If init never runs, every event helper becomes a no-op.
 *   3. Event helpers swallow errors so a broken analytics pipeline never
 *      crashes the app.
 *   4. No identifier is stored in the browser — `cookieless_mode:'always'`
 *      plus `persistence:'memory'` (see `buildPostHogConfig`).
 *   5. Every event is passed through `sanitizeCaptureResult` (installed as
 *      `before_send`), which drops any event/property not on its allowlists
 *      and reduces every URL to an origin + `KNOWN_ROUTES` template — see
 *      `analytics-sanitize.ts` for exactly what is kept.
 *
 * What this code depends on outside itself (not enforced here):
 *   - The browser still sends the request's IP address and user agent to
 *     PostHog (US region, `us.i.posthog.com`) on every call — that is how
 *     HTTP works, and this code cannot prevent it.
 *   - PostHog's servers use those two values to compute a pseudonymous ID
 *     that links a visitor's events together for a period PostHog documents
 *     as rotating (this has not been independently re-verified against
 *     PostHog's live docs from this repo — see the PostHog analytics privacy
 *     plan, revision 6, review finding N-3).
 *   - Cookieless mode must also be turned on in the PostHog project
 *     settings, or PostHog silently drops every event.
 */

import posthog from 'posthog-js';
import type { PostHogConfig } from 'posthog-js';
import type { PrecautionaryReason } from '@/types';
import { sanitizeCaptureResult, providerSlug } from './analytics-sanitize';

let initialized = false;

/** True only when posthog has been successfully initialized. */
export function isAnalyticsEnabled(): boolean {
  return initialized;
}

/**
 * Builds the posthog-js init config. `overrides` is test-only — production
 * code always calls `initAnalytics()` with no argument, which calls this with
 * no argument too. Overrides are merged last, so a test can swap any default
 * (e.g. `request_batching:false` to observe network calls synchronously).
 */
export function buildPostHogConfig(overrides: Partial<PostHogConfig> = {}): Partial<PostHogConfig> {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  return {
    api_host: host,
    // Privacy-first defaults
    capture_pageview: false, // we send pageviews manually via trackPageView
    capture_pageleave: false,
    autocapture: false, // we instrument explicit events only
    disable_session_recording: true,
    // Cookieless: no cookie and no localStorage identifier. PostHog's servers
    // compute a pseudonymous ID from the request's IP + user agent instead
    // (requires cookieless tracking enabled in the PostHog project settings).
    cookieless_mode: 'always',
    persistence: 'memory',
    // Events only: no remote surveys/toolbar/replay scripts pulled from PostHog's CDN
    disable_external_dependency_loading: true,
    // No feature-flag/remote-config request on init — we don't use flags.
    advanced_disable_flags: true,
    // Anonymous users never get a person profile (no identify/alias calls exist).
    person_profiles: 'never',
    // Neither is ever sent — every event is pre-sanitized anyway, but this
    // also skips posthog-js's own UTM/referrer capture work.
    save_campaign_params: false,
    save_referrer: false,
    // Deny-by-default gate: drops any event/property not explicitly allowlisted.
    before_send: sanitizeCaptureResult as unknown as PostHogConfig['before_send'],
    ...overrides,
  };
}

/**
 * Initialize PostHog. Safe to call multiple times — idempotent.
 * No-op when:
 *   - `NEXT_PUBLIC_POSTHOG_KEY` is missing
 *   - `NODE_ENV` is not 'production'
 *   - already initialized
 *
 * `overrides` is test-only (see `buildPostHogConfig`).
 */
export function initAnalytics(overrides: Partial<PostHogConfig> = {}): void {
  if (initialized) return;
  if (process.env.NODE_ENV !== 'production') return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  try {
    posthog.init(key, buildPostHogConfig(overrides));
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

/**
 * The visitor's OS colour-scheme preference. Decides whether a light theme is
 * worth building (design decision D6, 2026-11-02). Category only, no PII.
 */
export function trackColorScheme(): void {
  if (!initialized) return;
  try {
    if (typeof window.matchMedia !== 'function') return;
    const scheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'no-preference';
    safeCapture('color_scheme_detected', { scheme });
  } catch {
    // Analytics must never break the app
  }
}

/** Page navigation. */
export function trackPageView(path: string): void {
  safeCapture('$pageview', { path });
}

/** Buckets a trip's total distance so no near-exact (and so re-identifiable) km value is ever sent. */
export function distanceBucket(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 100) return 'lt100';
  if (distanceKm < 300) return '100to299';
  if (distanceKm < 600) return '300to599';
  if (distanceKm < 1000) return '600to999';
  return '1000plus';
}

/** User completed a trip plan request. Only a coarse distance bucket is sent — no city text, no coordinates. */
export function trackTripPlanned(distanceKm: number): void {
  safeCapture('trip_planned', { distance_bucket: distanceBucket(distanceKm) });
}

/** User tapped a charging station card or marker. Only a provider slug is sent — no station id. */
export function trackStationTapped(provider: string): void {
  safeCapture('station_tapped', { provider: providerSlug(provider) });
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

/** Phase 4 — User expanded a stop and the amenities panel mounted. No station id is sent. */
export function trackAmenitiesViewed(fromCache: boolean, poiCount: number): void {
  safeCapture('amenities_viewed', {
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

// ── Phase 5 — Trip Notebook events ───────────────────────────────────────

/** Trip Notebook view rendered. */
export function trackNotebookOpened(entryCount: number): void {
  safeCapture('notebook_opened', { entry_count: entryCount });
}

/** User re-planned a trip from the notebook. */
export function trackTripReplannedFromNotebook(daysSinceSaved: number): void {
  safeCapture('trip_replanned_from_notebook', {
    days_since_saved: Math.round(daysSinceSaved * 10) / 10,
  });
}

/** User pinned or unpinned a saved trip. */
export function trackTripPinToggle(pinned: boolean): void {
  safeCapture('trip_pin_toggle', { pinned });
}

// ── ADR-0006 — Backup Station Selection events ───────────────────────────
// Calibration window: 2-4 weeks post-ship. Validates the 8 magic numbers
// in ADR-0006 (pressure thresholds + bucket boundaries) and measures
// whether users click alternatives at all.

/**
 * For each TripPlan rendered, log the per-stop alternative count.
 * Fires once per (tripId, locale) — useEffect-gated client-side.
 *
 * Aggregates needed for calibration:
 *   - Distribution of N values (0/1/2/3) across stops → validates buckets
 *   - % of stops with N=0 → measures filter aggressiveness
 *   - Mean N per trip → measures average backup richness
 */
export function trackBackupAlternativesDistribution(
  altCounts: readonly number[],
): void {
  const noBackupCount = altCounts.filter((c) => c === 0).length;
  const sum = altCounts.reduce((a, b) => a + b, 0);
  safeCapture('backup_alternatives_distribution', {
    stop_count: altCounts.length,
    alt_counts: altCounts,
    no_backup_stops: noBackupCount,
    mean_alt_count: altCounts.length > 0 ? Math.round((sum / altCounts.length) * 100) / 100 : 0,
  });
}

export interface PrecautionaryStopEventPayload {
  readonly reasonPrimary: PrecautionaryReason;
  readonly reasonSecondary: readonly PrecautionaryReason[];
  readonly pressureScore: number;
  readonly legDistanceKm: number;
  readonly legSparsityCount: number;
  readonly safetyFactor: number;
  readonly vehicleBatteryKwh: number;
}

function capturePrecautionaryStopEvent(
  event: 'extra_stop_suggested' | 'extra_stop_accepted' | 'extra_stop_undone',
  payload: PrecautionaryStopEventPayload,
): void {
  safeCapture(event, payload as unknown as Record<string, unknown>);
}

export function trackPrecautionaryStopDistribution(count: number): void {
  safeCapture('precautionary_stop_distribution', {
    precautionary_stop_count: count,
    count_bucket: count >= 2 ? '2' : String(Math.max(0, count)),
  });
}

export function trackPrecautionaryStopSuggested(payload: PrecautionaryStopEventPayload): void {
  capturePrecautionaryStopEvent('extra_stop_suggested', payload);
}

export function trackPrecautionaryStopAccepted(payload: PrecautionaryStopEventPayload): void {
  capturePrecautionaryStopEvent('extra_stop_accepted', payload);
}

export function trackPrecautionaryStopDismissed(
  payload: PrecautionaryStopEventPayload,
  dismissTimeMsFromShown: number,
): void {
  safeCapture('extra_stop_dismissed', {
    ...payload,
    dismissTimeMsFromShown: Math.max(0, Math.round(dismissTimeMsFromShown)),
  });
}

export function trackPrecautionaryStopUndone(payload: PrecautionaryStopEventPayload): void {
  capturePrecautionaryStopEvent('extra_stop_undone', payload);
}

/** User clicked an alternative marker on the map (curiosity signal). */
export function trackAlternativeMarkerClicked(stopIdx: number, altIdx: number): void {
  safeCapture('alternative_marker_clicked', {
    stop_idx: stopIdx,
    alt_idx: altIdx,
  });
}

/** User clicked an alternative row in the TripSummary list (consideration signal). */
export function trackAlternativeListItemClicked(stopIdx: number, altIdx: number): void {
  safeCapture('alternative_list_item_clicked', {
    stop_idx: stopIdx,
    alt_idx: altIdx,
  });
}

/** User clicked Navigate from an alternative's popup (commitment signal). */
export function trackAlternativeNavigateClicked(stopIdx: number, altIdx: number): void {
  safeCapture('alternative_navigate_clicked', {
    stop_idx: stopIdx,
    alt_idx: altIdx,
  });
}

// ── ADR-0007 — Station reliability ranking events ─────────────────────────
// Calibration window: 2-4 weeks post-ship. Validates the 100-observation
// threshold and the linear (2 - r) penalty curve against real distributions.

/**
 * Per-request reliability summary across all candidate stations.
 * Captures gating ratio (how many stations fell below the 100-obs threshold)
 * and mean reliability across the non-gated set.
 *
 * `meanReliability` is `null` when every candidate is gated — typical until
 * Phase 3 data accumulates enough per-station coverage.
 */
export function trackReliabilityCalibration(data: {
  readonly candidateCount: number;
  readonly gatedCount: number;
  readonly meanReliability: number | null;
}): void {
  safeCapture('reliability_calibration', {
    candidate_count: data.candidateCount,
    gated_count: data.gatedCount,
    mean_reliability: data.meanReliability,
  });
}
