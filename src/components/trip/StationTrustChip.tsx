'use client';

import { useLocale } from '@/lib/locale';
import { classifyTrustSignal } from '@/lib/stations/trust-signal';

/**
 * Crowdsourced trust chip for charging stations.
 *
 * Surfaces lastVerifiedAt as a small chip on the station card header so
 * drivers see verification recency without expanding the report widget.
 * Tier classification lives in `lib/stations/trust-signal.ts`; this is a
 * thin presentational shell that picks copy + color.
 */

interface StationTrustChipProps {
  readonly lastVerifiedAt?: Date | string | null;
}

function pickRecentLabel(
  minutesAgo: number,
  t: ReturnType<typeof useLocale>['t'],
): string {
  if (minutesAgo === 0) return t('station_trust_recent_just_now');
  if (minutesAgo < 60) return t('station_trust_recent_minutes', { minutes: String(minutesAgo) });
  return t('station_trust_recent_hours', { hours: String(Math.floor(minutesAgo / 60)) });
}

export default function StationTrustChip({ lastVerifiedAt }: StationTrustChipProps) {
  const { t } = useLocale();
  const signal = classifyTrustSignal(lastVerifiedAt);

  if (signal.tier === 'recent' && signal.minutesAgo !== null) {
    return (
      <span
        data-testid="station-trust-chip"
        data-tier="recent"
        className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/20 text-[var(--color-accent)] font-medium"
      >
        {pickRecentLabel(signal.minutesAgo, t)}
      </span>
    );
  }

  if (signal.tier === 'older' && signal.minutesAgo !== null) {
    const days = Math.max(1, Math.floor(signal.minutesAgo / (60 * 24)));
    return (
      <span
        data-testid="station-trust-chip"
        data-tier="older"
        className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-text-secondary)]"
      >
        {t('station_trust_older_days', { days: String(days) })}
      </span>
    );
  }

  return (
    <span
      data-testid="station-trust-chip"
      data-tier="none"
      className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full text-[var(--color-muted)]"
    >
      {t('station_trust_none')}
    </span>
  );
}
