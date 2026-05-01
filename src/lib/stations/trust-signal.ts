/**
 * Classify a station's verification recency into a UI trust tier.
 *
 * The crowdsourced StationStatusReport pipeline updates ChargingStation
 * lastVerifiedAt when a driver submits a WORKING report. Drivers planning
 * a trip want to see this as a single chip — not a buried timestamp under
 * the report-buttons widget — so the UI can pick a tier and render
 * appropriately.
 *
 * Boundaries chosen to match the cadence of EV road trips:
 *   - recent: <24h  → strong signal, accent-tinted chip
 *   - older:  24h–7d → softer signal, muted chip
 *   - none:   ≥7d or null → don't shout; muted "no recent verification" hint
 */

import { minutesSince } from './station-status-validation';

export type TrustTier = 'recent' | 'older' | 'none';

export interface TrustSignal {
  readonly tier: TrustTier;
  /** Minutes since verification, or null when no usable timestamp. */
  readonly minutesAgo: number | null;
}

const RECENT_BOUNDARY_MIN = 24 * 60;
const OLDER_BOUNDARY_MIN = 7 * 24 * 60;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function classifyTrustSignal(
  lastVerifiedAt: Date | string | null | undefined,
  now: Date = new Date(),
): TrustSignal {
  const date = toDate(lastVerifiedAt);
  const minutesAgo = minutesSince(date, now);

  if (minutesAgo === null) {
    return { tier: 'none', minutesAgo: null };
  }

  if (minutesAgo < RECENT_BOUNDARY_MIN) {
    return { tier: 'recent', minutesAgo };
  }

  if (minutesAgo < OLDER_BOUNDARY_MIN) {
    return { tier: 'older', minutesAgo };
  }

  return { tier: 'none', minutesAgo };
}
