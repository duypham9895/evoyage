'use client';

import { getBatteryLevel, type BatteryLevel } from '@/lib/battery-level';
import { DEFAULT_MIN_ARRIVAL } from '@/types';

/**
 * Visual milestone strip rendered inside the Trip Overview card.
 *
 * Per docs/specs/2026-05-03-trip-overview-timeline-design.md §7:
 * - Pure presentational component; parent does all extraction/truncation
 * - One column per node: start city → each charging stop → end city
 * - Per-node battery state, distance from previous, charge time at stop
 * - 3+ stops (5+ nodes) → horizontal scroll with swipe hint
 * - Color logic: start accent (departure charge, not risk); stops and end arrival by
 *   getBatteryLevel(arrival, minArrivalPercent), matching the arrival hero
 *
 * No icons by project convention (DESIGN.md "Less Icons, More Humanity").
 */

export interface RouteTimelineStop {
  readonly shortName: string;
  readonly distanceFromPrevKm: number;
  readonly arrivalPercent: number;
  readonly departurePercent: number;
  readonly chargeTimeMin: number;
}

export interface RouteTimelineProps {
  readonly startCity: string;
  readonly startBatteryPercent: number;
  readonly endCity: string;
  readonly arrivalBatteryPercent: number;
  readonly totalDistanceKm: number;
  /** User's minimum arrival charge — anchors the stop battery colours. */
  readonly minArrivalPercent?: number;
  readonly stops: readonly RouteTimelineStop[];
  readonly swipeHint: string;
  readonly ariaStopLabel: (
    n: number,
    name: string,
    arrivePercent: number,
    departPercent: number,
    mins: number,
  ) => string;
}

const NODES_THAT_NEED_SCROLL = 5;

const STOP_DOT_CLASS: Record<BatteryLevel, string> = {
  danger: 'bg-[var(--color-danger)]',
  warn: 'bg-[var(--color-warn)]',
  safe: 'bg-[var(--color-safe)]',
};

const STOP_TEXT_CLASS: Record<BatteryLevel, string> = {
  danger: 'text-[var(--color-danger)]',
  warn: 'text-[var(--color-warn)]',
  safe: 'text-[var(--color-safe)]',
};

export default function RouteTimeline({
  startCity,
  startBatteryPercent,
  endCity,
  arrivalBatteryPercent,
  totalDistanceKm,
  minArrivalPercent = DEFAULT_MIN_ARRIVAL,
  stops,
  swipeHint,
  ariaStopLabel,
}: RouteTimelineProps) {
  const totalNodes = 2 + stops.length;
  const needsScroll = totalNodes >= NODES_THAT_NEED_SCROLL;

  // Distance from last stop to end. If no stops, the "end segment" carries
  // the full route distance. Otherwise, infer from totalDistance minus all
  // stop-distance-from-prev sums.
  const sumDistancesToStops = stops.reduce((acc, s) => acc + s.distanceFromPrevKm, 0);
  const endSegmentKm = Math.max(0, Math.round(totalDistanceKm - sumDistancesToStops));

  const endLevel = getBatteryLevel(arrivalBatteryPercent, minArrivalPercent);

  const containerCls = needsScroll
    ? 'overflow-x-auto snap-x snap-mandatory'
    : '';

  return (
    <div data-testid="route-timeline">
      <div className={containerCls}>
        <ol
          role="list"
          className="flex items-start gap-1 px-1"
        >
          {/* Start milestone */}
          <li
            className="snap-start shrink-0 min-w-[80px] flex flex-col items-center text-center"
            aria-label={`${startCity}, start, ${Math.round(startBatteryPercent)}%`}
          >
            <span className="w-3 h-3 rounded-full bg-[var(--color-accent)]" aria-hidden="true" />
            <span className="text-xs mt-2 font-semibold text-[var(--color-foreground)] truncate w-full px-1">
              {startCity}
            </span>
            <span className="text-[11px] mt-1 font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
              {Math.round(startBatteryPercent)}%
            </span>
            <span className="text-[10px] text-[var(--color-muted)] h-4">&nbsp;</span>
          </li>

          {/* Stop milestones */}
          {stops.map((stop, i) => {
            const level = getBatteryLevel(stop.arrivalPercent, minArrivalPercent);
            const dotCls = STOP_DOT_CLASS[level];
            const textCls = STOP_TEXT_CLASS[level];
            return (
              <li
                key={i}
                className="snap-start shrink-0 min-w-[80px] flex flex-col items-center text-center"
                aria-label={ariaStopLabel(
                  i + 1,
                  stop.shortName,
                  Math.round(stop.arrivalPercent),
                  Math.round(stop.departurePercent),
                  Math.round(stop.chargeTimeMin),
                )}
              >
                <span className={`w-3 h-3 rounded-full ${dotCls}`} aria-hidden="true" />
                <span className="text-xs mt-2 font-semibold text-[var(--color-foreground)] truncate w-full px-1">
                  <span className="text-[var(--color-muted)] mr-0.5">{i + 1}.</span>
                  {stop.shortName}
                </span>
                <span className={`text-[11px] mt-1 font-[family-name:var(--font-mono)] ${textCls}`}>
                  {Math.round(stop.arrivalPercent)}→{Math.round(stop.departurePercent)}%
                </span>
                <span className="text-[10px] mt-0.5 text-[var(--color-muted)] font-[family-name:var(--font-mono)]">
                  <span>{Math.round(stop.distanceFromPrevKm)} km</span>
                  <span className="mx-1">·</span>
                  <span>{Math.round(stop.chargeTimeMin)}m</span>
                </span>
              </li>
            );
          })}

          {/* End milestone */}
          <li
            className="snap-start shrink-0 min-w-[80px] flex flex-col items-center text-center"
            aria-label={`${endCity}, arrive, ${Math.round(arrivalBatteryPercent)}%`}
          >
            <span className={`w-3 h-3 rounded-full ${STOP_DOT_CLASS[endLevel]}`} aria-hidden="true" />
            <span className="text-xs mt-2 font-semibold text-[var(--color-foreground)] truncate w-full px-1">
              {endCity}
            </span>
            <span className={`text-[11px] mt-1 font-[family-name:var(--font-mono)] ${STOP_TEXT_CLASS[endLevel]}`}>
              {Math.round(arrivalBatteryPercent)}%
            </span>
            <span className="text-[10px] mt-0.5 text-[var(--color-muted)] font-[family-name:var(--font-mono)]">
              {endSegmentKm} km
            </span>
          </li>
        </ol>
      </div>

      {needsScroll && (
        <p className="text-[10px] text-[var(--color-muted)] mt-1 text-center">{swipeHint}</p>
      )}
    </div>
  );
}
