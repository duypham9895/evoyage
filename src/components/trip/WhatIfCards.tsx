'use client';

/**
 * Phase 2 — WhatIfCards.
 *
 * Pure presentational comparison strip showing how the trip changes if the
 * user departs at different times. Parent computes the option list (e.g.
 * "Đi ngay", "Chờ 2 giờ", "Sáng mai 06:30") and passes already-fetched
 * trip-plan totals into each card. Tapping a non-current card asks the
 * parent to replan — keeping fetch / state logic outside this component.
 *
 * Design choices:
 * - Horizontal flex strip with snap-x — fits the same UX pattern as the
 *   Phase 1 RouteTimeline so users learn one scroll affordance
 * - No icons (per project DESIGN.md "Less Icons, More Humanity")
 * - Loading state uses "--" placeholders, not a spinner — keeps the layout
 *   stable and signals "we're fetching this" without a busy animation
 */

export interface WhatIfOption {
  /** Stable key, e.g. 'now' | 'plus2h' | 'tomorrow' */
  readonly key: string;
  /** Display label, already locale-resolved by the parent */
  readonly label: string;
  /** ISO 8601 departure time, or null for "now" */
  readonly departAt: string | null;
  /** Total trip time at this departure. null while loading. */
  readonly totalDurationMin: number | null;
  /** Arrival clock time at this departure. null while loading. */
  readonly arrivalEtaIso: string | null;
  /** Peak-window reason string when a known window applies. */
  readonly peakWindowReason: string | null;
}

interface WhatIfCardsProps {
  readonly options: readonly WhatIfOption[];
  readonly currentKey: string;
  readonly onSelect: (option: WhatIfOption) => void;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function formatEta(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function WhatIfCards({ options, currentKey, onSelect }: WhatIfCardsProps) {
  if (options.length === 0) return null;

  return (
    <div className="overflow-x-auto snap-x snap-mandatory" data-testid="what-if-cards">
      <ol role="list" className="flex items-stretch gap-2 px-1">
        {options.map((option) => {
          const isCurrent = option.key === currentKey;
          const baseCls =
            'snap-start shrink-0 min-w-[140px] flex-1 p-3 rounded-lg text-left text-xs space-y-1 transition-colors';
          const stateCls = isCurrent
            ? 'border border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-foreground)]'
            : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:border-[var(--color-accent-dim)]';

          return (
            <li key={option.key} className="contents">
              <button
                type="button"
                role="button"
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => {
                  if (!isCurrent) onSelect(option);
                }}
                className={`${baseCls} ${stateCls}`}
              >
                <div className="font-semibold">{option.label}</div>
                <div className="font-[family-name:var(--font-mono)] text-sm">
                  {option.totalDurationMin === null
                    ? '--h--m'
                    : formatDuration(option.totalDurationMin)}
                </div>
                <div className="text-[10px] text-[var(--color-muted)] font-[family-name:var(--font-mono)]">
                  {option.arrivalEtaIso === null ? '--:--' : `→ ${formatEta(option.arrivalEtaIso)}`}
                </div>
                {option.peakWindowReason && (
                  <div className="text-[10px] text-[var(--color-warn)] leading-tight pt-1">
                    {option.peakWindowReason}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
