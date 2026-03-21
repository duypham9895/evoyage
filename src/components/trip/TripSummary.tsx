'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/locale';
import { useRouteNarrative } from '@/hooks/useRouteNarrative';
import type { TripPlan, RankedStation, ChargingStationData } from '@/types';
import StationDetailExpander from './StationDetailExpander';

interface TripSummaryProps {
  readonly tripPlan: TripPlan | null;
  readonly isLoading: boolean;
  readonly onSelectAlternativeStation?: (stopIndex: number, station: RankedStation) => void;
  readonly onBackToChat?: () => void;
}

// ── Battery color helpers ──

function getBatteryColor(percent: number): string {
  if (percent > 40) return 'text-[var(--color-safe)]';
  if (percent > 20) return 'text-[var(--color-warn)]';
  return 'text-[var(--color-danger)]';
}

function getGaugeGradient(arrivalPercent: number): string {
  if (arrivalPercent > 40) return 'from-[var(--color-safe)]/70 to-[var(--color-safe)]';
  if (arrivalPercent > 20) return 'from-[var(--color-warn)] to-[var(--color-safe)]';
  return 'from-[var(--color-danger)] to-[var(--color-safe)]';
}

// ── Status helpers ──

type StatusKey = 'ACTIVE' | 'BUSY' | 'UNAVAILABLE' | 'INACTIVE';

const STATUS_DOT_COLOR: Record<StatusKey, string> = {
  ACTIVE: 'bg-[var(--color-safe)]',
  BUSY: 'bg-[var(--color-warn)]',
  UNAVAILABLE: 'bg-[var(--color-danger)]',
  INACTIVE: 'bg-[var(--color-muted)]',
};

const STATUS_TEXT_COLOR: Record<StatusKey, string> = {
  ACTIVE: 'text-[var(--color-safe)]',
  BUSY: 'text-[var(--color-warn)]',
  UNAVAILABLE: 'text-[var(--color-danger)]',
  INACTIVE: 'text-[var(--color-muted)]',
};

const STATUS_LOCALE_KEY: Record<StatusKey, string> = {
  ACTIVE: 'station_status_active',
  BUSY: 'station_status_busy',
  UNAVAILABLE: 'station_status_unavailable',
  INACTIVE: 'station_status_inactive',
};

function isStatusKey(val: string): val is StatusKey {
  return val in STATUS_DOT_COLOR;
}

/** Build a Google Maps directions URL with all charging stops as waypoints */
function buildGoogleMapsUrl(plan: TripPlan): string {
  const origin = `${plan.startAddress}`;
  const destination = `${plan.endAddress}`;

  // Add charging stops as waypoints
  const waypoints = plan.chargingStops.map((stop) => {
    const station = 'selected' in stop ? stop.selected.station : stop.station;
    return `${station.latitude},${station.longitude}`;
  }).join('|');

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });

  if (waypoints) {
    params.set('waypoints', waypoints);
  }

  return `https://www.google.com/maps/dir/?${params}`;
}

// ── BatteryGauge ──

function BatteryGauge({
  arrivalPercent,
  departurePercent,
  chargeTimeMin,
}: {
  readonly arrivalPercent: number;
  readonly departurePercent: number;
  readonly chargeTimeMin: number;
}) {
  const arrival = Math.round(arrivalPercent);
  const departure = Math.round(departurePercent);
  const gradient = getGaugeGradient(arrival);

  return (
    <div className="flex items-center gap-3 mt-2">
      {/* Progress bar */}
      <div
        className="flex-1 h-2 rounded-full bg-[var(--color-surface-hover)] overflow-hidden relative"
        role="meter"
        aria-valuenow={arrival}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Battery: ${arrival}% to ${departure}%`}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${gradient}`}
          style={{ width: `${departure}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--color-foreground)]/40"
          style={{ left: `${arrival}%` }}
        />
      </div>
      {/* Battery text */}
      <div className="flex items-center gap-1.5 text-sm font-bold font-[family-name:var(--font-mono)] shrink-0">
        <span className={getBatteryColor(arrival)}>{arrival}%</span>
        <span className="text-[var(--color-muted)] text-xs font-normal">→</span>
        <span className="text-[var(--color-safe)]">{departure}%</span>
      </div>
      {/* Charge time */}
      <span className="text-sm font-bold font-[family-name:var(--font-mono)] text-[var(--color-foreground)] shrink-0">
        ~{Math.round(chargeTimeMin)}m
      </span>
    </div>
  );
}

// ── QuickStats (replaces StationInfoChips in card context) ──

function QuickStats({
  station,
  navigateUrl,
  navigateLabel,
}: {
  readonly station: ChargingStationData;
  readonly navigateUrl: string;
  readonly navigateLabel: string;
}) {
  const { t } = useLocale();
  const normalizedStatus = station.chargingStatus?.toUpperCase() ?? null;
  const statusKey = normalizedStatus && isStatusKey(normalizedStatus) ? normalizedStatus : null;

  return (
    <div className="flex items-center justify-between mt-2">
      <div className="flex items-center gap-1.5 text-xs">
        {/* Power */}
        <span className="font-semibold font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
          {station.maxPowerKw} kW
        </span>
        <span className="text-[var(--color-muted)]">·</span>
        {/* Connector */}
        <span className="text-[var(--color-muted)]">
          {station.connectorTypes[0] ?? 'DC'}
        </span>
        {/* Status dot */}
        {statusKey && (
          <>
            <span className="text-[var(--color-muted)]">·</span>
            <span className="inline-flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT_COLOR[statusKey]}`} aria-hidden="true" />
              <span className={`${STATUS_TEXT_COLOR[statusKey]}`}>
                {t(STATUS_LOCALE_KEY[statusKey] as Parameters<typeof t>[0])}
              </span>
            </span>
          </>
        )}
      </div>
      {/* Navigate CTA */}
      <a
        href={navigateUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${navigateLabel} ${station.name}`}
        className="text-xs px-3 py-1 min-h-[32px] flex items-center rounded-full bg-[var(--color-accent)] text-[var(--color-background)] font-semibold hover:opacity-90 transition-opacity"
      >
        {navigateLabel}
      </a>
    </div>
  );
}

// ── Route Briefing ──

function RouteBriefingSkeleton() {
  return (
    <div className="p-4 bg-gradient-to-br from-[var(--color-accent)]/5 to-[var(--color-surface)] rounded-lg space-y-3">
      <div className="h-3 bg-[var(--color-surface-hover)] rounded w-1/3 animate-pulse" />
      <div className="space-y-2">
        <div className="h-3 bg-[var(--color-surface-hover)] rounded w-full animate-pulse" />
        <div className="h-3 bg-[var(--color-surface-hover)] rounded w-5/6 animate-pulse" />
        <div className="h-3 bg-[var(--color-surface-hover)] rounded w-4/6 animate-pulse" />
      </div>
    </div>
  );
}

function RouteBriefing({
  overview,
  narrative,
  isLoading: loading,
}: {
  readonly overview: string | null;
  readonly narrative: string | null;
  readonly isLoading: boolean;
}) {
  const { t } = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);

  if (loading) return <RouteBriefingSkeleton />;
  if (!overview || !narrative) return null;

  return (
    <div className="p-4 bg-gradient-to-br from-[var(--color-accent)]/5 to-[var(--color-surface)] rounded-lg space-y-2">
      <h3 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
        {t('route_briefing' as Parameters<typeof t>[0])}
      </h3>

      <p className="text-sm text-[var(--color-foreground)] leading-relaxed">
        {overview}
      </p>

      {/* Expandable narrative */}
      <div
        className={`transition-all duration-300 ease-out ${
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <p className="text-sm text-[var(--color-foreground)]/80 leading-relaxed pt-2 border-t border-[var(--color-surface-hover)]">
          {narrative}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="text-xs font-medium text-[var(--color-accent)] hover:underline transition-colors"
      >
        {isExpanded
          ? t('route_briefing_collapse' as Parameters<typeof t>[0])
          : t('route_briefing_expand' as Parameters<typeof t>[0])}
      </button>
    </div>
  );
}

// ── Main Component ──

export default function TripSummary({ tripPlan, isLoading, onSelectAlternativeStation, onBackToChat }: TripSummaryProps) {
  const { t, tBi } = useLocale();
  const [expandedStops, setExpandedStops] = useState<Set<number>>(new Set());
  const narrativeState = useRouteNarrative(tripPlan);

  const toggleExpanded = (index: number) => {
    setExpandedStops(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Status message */}
        <div className="flex items-center gap-3 px-1">
          <span className="flex gap-1">
            <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full animate-bounce [animation-delay:300ms]" />
          </span>
          <span className="text-sm text-[var(--color-muted)]">{t('planning')}</span>
        </div>

        {/* Skeleton: trip overview card */}
        <div className="p-4 bg-[var(--color-surface)] rounded-2xl space-y-4">
          <div className="h-3 bg-[var(--color-surface-hover)] rounded w-3/4 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="h-3 bg-[var(--color-surface-hover)] rounded w-16 mb-1.5 animate-pulse" />
              <div className="h-5 bg-[var(--color-surface-hover)] rounded w-24 animate-pulse" />
            </div>
            <div>
              <div className="h-3 bg-[var(--color-surface-hover)] rounded w-20 mb-1.5 animate-pulse" />
              <div className="h-5 bg-[var(--color-surface-hover)] rounded w-20 animate-pulse" />
            </div>
          </div>
          {/* Battery bar skeleton */}
          <div className="h-7 bg-[var(--color-surface-hover)] rounded-full animate-pulse" />
        </div>

        {/* Skeleton: charging stop cards */}
        {[0, 1].map(i => (
          <div key={i} className="p-4 bg-[var(--color-surface)] rounded-2xl space-y-3" style={{ opacity: 1 - i * 0.3 }}>
            <div className="h-4 bg-[var(--color-surface-hover)] rounded w-2/3 animate-pulse" />
            <div className="h-3 bg-[var(--color-surface-hover)] rounded w-1/2 animate-pulse" />
            <div className="flex gap-3">
              <div className="h-8 bg-[var(--color-surface-hover)] rounded-full w-20 animate-pulse" />
              <div className="h-8 bg-[var(--color-surface-hover)] rounded-full w-16 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!tripPlan) return null;

  const totalTimeMin = tripPlan.totalDurationMin + tripPlan.totalChargingTimeMin;
  const hours = Math.floor(totalTimeMin / 60);
  const minutes = totalTimeMin % 60;
  const driveHours = Math.floor(tripPlan.totalDurationMin / 60);
  const driveMinutes = tripPlan.totalDurationMin % 60;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold font-[family-name:var(--font-heading)] text-[var(--color-muted)] uppercase tracking-wider">
          {t('trip_summary')}
        </h2>
        {onBackToChat && (
          <button
            onClick={onBackToChat}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors"
          >
            ← {t('evi_back_to_chat' as Parameters<typeof t>[0])}
          </button>
        )}
      </div>

      {/* Route Briefing — loads asynchronously after trip plan */}
      <RouteBriefing
        overview={narrativeState.overview}
        narrative={narrativeState.narrative}
        isLoading={narrativeState.isLoading}
      />

      <div className="p-4 bg-[var(--color-surface)] rounded-lg space-y-3">
        {/* Route */}
        <div className="text-sm text-[var(--color-muted)]">
          {tripPlan.startAddress} → {tripPlan.endAddress}
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-[var(--color-muted)]">{t('distance')}</div>
            <div className="text-xl font-bold font-[family-name:var(--font-mono)] text-[var(--color-foreground)]">
              {tripPlan.totalDistanceKm} km
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">{t('total_time')}</div>
            <div className="text-xl font-bold font-[family-name:var(--font-mono)] text-[var(--color-foreground)]">
              {hours}h{minutes > 0 ? `${minutes}m` : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">{t('driving')}</div>
            <div className="text-sm font-[family-name:var(--font-mono)]">
              {driveHours}h{driveMinutes > 0 ? `${driveMinutes}m` : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">{t('charging')}</div>
            <div className="text-sm font-[family-name:var(--font-mono)]">
              {tripPlan.totalChargingTimeMin}m ({tripPlan.chargingStops.length} {t('stops')})
            </div>
          </div>
        </div>

        {/* Battery journey bar */}
        <div>
          <div className="text-xs text-[var(--color-muted)] mb-2">{t('battery_journey')}</div>
          <div className="flex h-7 rounded-full overflow-hidden bg-[var(--color-surface-hover)]">
            {tripPlan.batterySegments.map((seg, i) => {
              const widthPercent = ((seg.endKm - seg.startKm) / tripPlan.totalDistanceKm) * 100;
              const avgBattery = (seg.startBatteryPercent + seg.endBatteryPercent) / 2;
              const color =
                avgBattery > 50
                  ? 'bg-[var(--color-safe)]'
                  : avgBattery > 25
                    ? 'bg-[var(--color-warn)]'
                    : 'bg-[var(--color-danger)]';

              return (
                <div
                  key={i}
                  className={`${color} flex items-center justify-center text-[10px] font-bold text-[var(--color-background)] border-r border-[var(--color-background)] last:border-r-0`}
                  style={{ width: `${widthPercent}%` }}
                  title={seg.label}
                >
                  {widthPercent > 10 && `${Math.round(seg.endBatteryPercent)}%`}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-[var(--color-muted)] mt-1">
            <span>{t('start')} {tripPlan.batterySegments[0]?.startBatteryPercent}%</span>
            <span className={tripPlan.arrivalBatteryPercent < 25 ? 'font-bold text-[var(--color-warn)]' : ''}>
              {t('arrive')} {Math.round(tripPlan.arrivalBatteryPercent)}%
            </span>
          </div>
        </div>

        {/* No charging needed */}
        {tripPlan.chargingStops.length === 0 && tripPlan.warnings.length === 0 && (
          <div className="p-3 bg-[var(--color-safe)]/10 text-[var(--color-safe)] rounded-lg text-sm">
            {t('no_charging_needed')}
          </div>
        )}

        {/* Warnings */}
        {tripPlan.warnings.map((w, i) => (
          <div key={i} className="p-3 bg-[var(--color-warn)]/10 text-[var(--color-warn)] rounded-lg text-sm">
            {tBi(w)}
          </div>
        ))}
      </div>

      {/* Charging stops list */}
      {tripPlan.chargingStops.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
            {t('charging_stops')}
          </h3>
          {tripPlan.chargingStops.map((stop, i) => {
            const hasAlternatives = 'selected' in stop;
            const station = hasAlternatives ? stop.selected.station : stop.station;
            const arrivalBattery = hasAlternatives ? stop.batteryPercentAtArrival : stop.arrivalBatteryPercent;
            const departureBattery = hasAlternatives ? stop.batteryPercentAfterCharge : stop.departureBatteryPercent;
            const chargeTime = hasAlternatives ? stop.selected.estimatedChargeTimeMin : stop.estimatedChargingTimeMin;
            const distanceKm = hasAlternatives ? stop.distanceAlongRouteKm : stop.distanceFromStartKm;
            const rank = hasAlternatives ? stop.selected.rank : undefined;
            const alternatives = hasAlternatives ? stop.alternatives : [];
            const isExpanded = expandedStops.has(i);

            const rankLabel = rank === 'best' ? t('stations_best')
              : rank === 'ok' ? t('stations_ok')
              : rank === 'slow' ? t('stations_slow')
              : null;

            const rankColor = rank === 'best' ? 'text-[var(--color-safe)] bg-[var(--color-safe)]/10'
              : rank === 'ok' ? 'text-[var(--color-warn)] bg-[var(--color-warn)]/10'
              : rank === 'slow' ? 'text-[var(--color-danger)] bg-[var(--color-danger)]/10'
              : '';

            const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`;

            return (
              <article
                key={i}
                aria-label={`${t('charging_stops')} ${i + 1}: ${station.name}`}
                className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-surface-hover)] overflow-hidden transition-colors hover:border-[var(--color-accent-dim)]/40"
              >
                {/* Collapsed card body — tappable to expand */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(i)}
                  className="w-full p-3 text-left focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] rounded-t-xl"
                >
                  {/* Header: number + name + rank + distance */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-[var(--color-accent)] text-[var(--color-background)] text-xs font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold line-clamp-2" title={station.name}>{station.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rankLabel && (
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${rankColor}`}>
                          {rankLabel}
                        </span>
                      )}
                      <span className="text-xs font-[family-name:var(--font-mono)] text-[var(--color-muted)]">
                        {Math.round(distanceKm)} km
                      </span>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="text-xs text-[var(--color-muted)] truncate mt-1 ml-8" title={station.address}>
                    {station.address}
                  </div>

                  {/* Battery gauge */}
                  <div className="ml-8">
                    <BatteryGauge
                      arrivalPercent={arrivalBattery}
                      departurePercent={departureBattery}
                      chargeTimeMin={chargeTime}
                    />
                  </div>
                </button>

                {/* QuickStats row — always visible, not inside the expand button */}
                <div className="px-3 pb-3 ml-8">
                  <QuickStats
                    station={station}
                    navigateUrl={navigateUrl}
                    navigateLabel={t('navigate')}
                  />
                </div>

                {/* Expanded section */}
                <div
                  className={`transition-all duration-200 ease-out ${
                    isExpanded ? 'max-h-[2000px] opacity-100 overflow-y-auto' : 'max-h-0 opacity-0 overflow-hidden'
                  }`}
                >
                  <div className="border-t border-[var(--color-surface-hover)] p-3 space-y-2">
                    {/* Detail stats: detour, total, ports, hours, parking */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
                      {hasAlternatives && stop.selected.detourDriveTimeSec > 0 && (
                        <span>
                          {t('stations_detour', { time: String(Math.round(stop.selected.detourDriveTimeSec * 2 / 60)) })}
                        </span>
                      )}
                      {hasAlternatives && (
                        <span>
                          {t('stations_total_time', { time: String(Math.round(stop.selected.totalStopTimeMin)) })}
                        </span>
                      )}
                      <span>{t('station_ports', { count: String(station.portCount) })}</span>
                      {station.operatingHours !== null && (
                        <span>{station.operatingHours === '24/7' ? t('station_hours_24h') : station.operatingHours}</span>
                      )}
                      {station.parkingFee !== null && (
                        <span className={station.parkingFee ? 'text-[var(--color-warn)]' : 'text-[var(--color-safe)]'}>
                          {station.parkingFee ? t('station_parking_paid') : t('station_parking_free')}
                        </span>
                      )}
                    </div>

                    {/* Station detail expander */}
                    <StationDetailExpander stationId={station.id} stationProvider={station.provider} />

                    {/* Alternatives */}
                    {alternatives.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1">
                          {t('stations_view_alternatives', { count: String(alternatives.length) })}
                        </div>
                        <div className="rounded-lg overflow-hidden border border-[var(--color-surface-hover)]" role="listbox">
                          {alternatives.map((alt, j) => {
                            const altRankLabel = alt.rank === 'best' ? t('stations_best')
                              : alt.rank === 'ok' ? t('stations_ok')
                              : t('stations_slow');
                            const altRankColor = alt.rank === 'best'
                              ? 'text-[var(--color-safe)] bg-[var(--color-safe)]/10'
                              : alt.rank === 'ok'
                                ? 'text-[var(--color-warn)] bg-[var(--color-warn)]/10'
                                : 'text-[var(--color-danger)] bg-[var(--color-danger)]/10';

                            const detourMin = Math.round(alt.detourDriveTimeSec * 2 / 60);

                            return (
                              <button
                                key={j}
                                role="option"
                                aria-selected={false}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectAlternativeStation?.(i, alt);
                                }}
                                className="w-full flex items-center justify-between px-3 py-2.5 min-h-[48px] hover:bg-[var(--color-surface-hover)] transition-colors border-b border-[var(--color-surface-hover)] last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
                              >
                                <span className="text-xs font-medium truncate min-w-0 flex-1 text-left" title={alt.station.name}>
                                  {alt.station.name}
                                </span>
                                <div className="flex items-center gap-3 shrink-0 text-xs ml-2">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${altRankColor}`}>
                                    {altRankLabel}
                                  </span>
                                  {detourMin > 0 && (
                                    <span className="text-[var(--color-warn)] font-[family-name:var(--font-mono)] w-10 text-right">
                                      +{detourMin}m
                                    </span>
                                  )}
                                  <span className="text-[var(--color-muted)] font-[family-name:var(--font-mono)] w-12 text-right">
                                    {alt.station.maxPowerKw}kW
                                  </span>
                                  <span className="text-[var(--color-muted)] font-[family-name:var(--font-mono)] w-10 text-right">
                                    {Math.round(alt.estimatedChargeTimeMin)}m
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expand indicator */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(i)}
                  className="w-full py-1.5 text-center border-t border-[var(--color-surface-hover)]"
                  aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                >
                  <span className="text-[10px] text-[var(--color-muted)]">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-[10px] text-[var(--color-muted)] leading-relaxed p-2">
        {t('disclaimer')}
      </div>

      {/* Open in Google Maps */}
      <a
        href={buildGoogleMapsUrl(tripPlan)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold bg-[var(--color-surface-hover)] text-[var(--color-foreground)] hover:opacity-80 transition-opacity"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        {t('open_in_google_maps')}
      </a>
    </div>
  );
}
