'use client';

import { useCallback, useState } from 'react';
import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';
import {
  STATION_STATUS_VALUES,
  minutesSince,
  type StationStatus,
} from '@/lib/stations/station-status-validation';

/**
 * Three text buttons for crowdsourced status reporting on a charging station.
 *
 * Per DESIGN.md "less icons, more humanity" — we use plain text labels with
 * surface backgrounds, not icon buttons. The single accent (Working) signals
 * the positive default action; Broken/Busy share a neutral muted style.
 */

interface StationStatusReporterProps {
  readonly stationId: string;
  readonly lastVerifiedAt?: Date | string | null;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error' | 'rate_limited';

const STATUS_LABEL_KEYS = {
  WORKING: 'station_report_working',
  BROKEN: 'station_report_broken',
  BUSY: 'station_report_busy',
} as const satisfies Record<StationStatus, string>;

function formatLastVerified(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function StationStatusReporter({
  stationId,
  lastVerifiedAt,
}: StationStatusReporterProps) {
  const { t } = useLocale();
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [activeStatus, setActiveStatus] = useState<StationStatus | null>(null);

  const verifiedDate = formatLastVerified(lastVerifiedAt);
  const minutesAgo = minutesSince(verifiedDate);

  const handleReport = useCallback(
    async (status: StationStatus) => {
      if (submitState === 'submitting') return;
      hapticLight();
      setSubmitState('submitting');
      setActiveStatus(status);

      try {
        const res = await fetch(`/api/stations/${stationId}/status-report`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        });

        if (res.ok) {
          setSubmitState('success');
          return;
        }

        if (res.status === 429) {
          setSubmitState('rate_limited');
          return;
        }

        setSubmitState('error');
      } catch {
        setSubmitState('error');
      }
    },
    [stationId, submitState],
  );

  const isSubmitting = submitState === 'submitting';

  return (
    <div className="space-y-1.5" data-testid="station-status-reporter">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">
        {t('station_report_section_title')}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {STATION_STATUS_VALUES.map((status) => {
          const isActive = activeStatus === status && submitState !== 'idle';
          const isWorking = status === 'WORKING';
          const baseClass = isWorking
            ? 'bg-[var(--color-accent-subtle)] border border-[var(--color-accent)]/20 text-[var(--color-accent)] hover:bg-[rgba(0,212,170,0.25)]'
            : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]';

          return (
            <button
              key={status}
              type="button"
              onClick={() => handleReport(status)}
              disabled={isSubmitting}
              data-status={status}
              aria-pressed={isActive}
              className={`text-xs font-medium py-1.5 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${baseClass}`}
            >
              {t(STATUS_LABEL_KEYS[status])}
            </button>
          );
        })}
      </div>

      {submitState === 'success' && (
        <p className="text-[10px] text-[var(--color-accent)]" role="status">
          {t('station_report_thanks')}
        </p>
      )}
      {submitState === 'rate_limited' && (
        <p className="text-[10px] text-[var(--color-warn)]" role="status">
          {t('station_report_rate_limited')}
        </p>
      )}
      {submitState === 'error' && (
        <p className="text-[10px] text-[var(--color-danger)]/80" role="status">
          {t('station_report_failed')}
        </p>
      )}

      {minutesAgo !== null && (
        <p className="text-[10px] text-[var(--color-muted)]">
          {minutesAgo === 0
            ? t('station_report_last_verified_just_now')
            : t('station_report_last_verified', { minutes: String(minutesAgo) })}
        </p>
      )}
    </div>
  );
}
