'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/locale';
import { useRouteNarrative } from '@/hooks/useRouteNarrative';
import type { TripPlan, RankedStation, ChargingStationData } from '@/types';
import { calculateSavings, formatVnd } from '@/lib/trip/cost';
import { computeTripCost } from '@/lib/trip-cost';
import { extractCityName } from '@/lib/trip/extract-city';
import { extractStationShortName } from '@/lib/trip/extract-station-name';
import { detectPasses } from '@/lib/trip/detect-passes';
import { evaluatePeakHour } from '@/lib/trip/peak-hour-model';
import RouteTimeline, { type RouteTimelineStop } from './RouteTimeline';
import WhatIfCards, { type WhatIfOption } from './WhatIfCards';
import StationDetailExpander from './StationDetailExpander';
import StationStatusReporter from './StationStatusReporter';
import StationTrustChip from './StationTrustChip';

interface TripSummaryProps {
  readonly tripPlan: TripPlan | null;
  readonly isLoading: boolean;
  /** Vehicle energy efficiency in Wh/km — required to show cost transparency. */
  readonly vehicleEfficiencyWhPerKm?: number | null;
  /** Vehicle brand — used to apply the V-GREEN free-charging policy for VinFast owners. */
  readonly vehicleBrand?: string | null;
  /** Vehicle usable battery (kWh) — for kWh/100km derivation when efficiency is missing. */
  readonly vehicleUsableBatteryKwh?: number | null;
  /** Vehicle official range (km) — for kWh/100km derivation when efficiency is missing. */
  readonly vehicleOfficialRangeKm?: number | null;
  readonly onSelectAlternativeStation?: (stopIndex: number, station: RankedStation) => void;
  readonly onBackToChat?: () => void;
  /** Phase 2 — called when the user taps a what-if card to replan with that
   *  departure time. Receives an ISO 8601 string. */
  readonly onSelectDepartureTime?: (iso: string) => void;
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

// ── Trip Cost Hero ──

/**
 * Hero pill showing electricity-vs-gasoline savings as the emotional payoff
 * of choosing EV. Renders above the trip overview card so the savings number
 * is the first thing a driver sees in the summary.
 *
 * When EV is more expensive than gasoline (rare, possible with stale fuel
 * pricing), the copy uses neutral muted color — we don't shame the driver.
 *
 * Tap "How is this calculated?" to expand the breakdown with assumptions
 * (EVN 3,500 ₫/kWh, RON95 23,000 ₫/L). Keeps the headline honest.
 */
function TripCostSection({
  distanceKm,
  efficiencyWhPerKm,
  vehicleBrand,
  vehicleUsableBatteryKwh,
  vehicleOfficialRangeKm,
}: {
  readonly distanceKm: number;
  readonly efficiencyWhPerKm: number;
  readonly vehicleBrand?: string | null;
  readonly vehicleUsableBatteryKwh?: number | null;
  readonly vehicleOfficialRangeKm?: number | null;
}) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  // Live energy prices (gasoline + diesel + EVN home + V-GREEN with free flag)
  // pulled from the daily-crawled `energy-prices.json`.
  const live = computeTripCost({
    distanceKm,
    vehicle: {
      brand: vehicleBrand ?? '',
      model: '',
      usableBatteryKwh: vehicleUsableBatteryKwh ?? null,
      officialRangeKm: vehicleOfficialRangeKm ?? 0,
      efficiencyWhPerKm: efficiencyWhPerKm > 0 ? efficiencyWhPerKm : null,
    },
  });

  // Hero savings still computed against gasoline. When V-GREEN is free for the
  // user's VinFast vehicle, electricity cost is effectively 0 and the hero
  // copy switches to the "free vs ₫X gas" framing.
  const electricityForHero = live.electric.isFreeAtVGreen ? 0 : live.electric.homeChargingVnd;
  const gasoline = live.gasoline.vnd;
  const { savedVnd, savedPercent } = calculateSavings(electricityForHero, gasoline);

  if (gasoline <= 0) return null;

  const isFree = live.electric.isFreeAtVGreen;
  const isSaving = savedVnd > 0;
  const absVnd = Math.abs(savedVnd);
  const absPercent = Math.abs(savedPercent);

  const heroLabel = isFree
    ? t('trip_cost_hero_free' as Parameters<typeof t>[0], { amount: formatVnd(gasoline) })
    : isSaving
    ? t('trip_cost_hero_savings' as Parameters<typeof t>[0], { amount: formatVnd(absVnd) })
    : t('trip_cost_hero_extra' as Parameters<typeof t>[0], { amount: formatVnd(absVnd) });

  const subtitleLabel = isFree
    ? t('trip_cost_hero_percent_free' as Parameters<typeof t>[0])
    : isSaving
    ? t('trip_cost_hero_percent_cheaper' as Parameters<typeof t>[0], { percent: String(absPercent) })
    : t('trip_cost_hero_percent_more' as Parameters<typeof t>[0], { percent: String(absPercent) });

  const heroBg = isFree || isSaving
    ? 'bg-[var(--color-accent-subtle)] border-[var(--color-accent)]/30'
    : 'bg-[var(--color-surface)] border-[var(--color-border)]';
  const heroText = isFree || isSaving
    ? 'text-[var(--color-accent)]'
    : 'text-[var(--color-text-secondary)]';

  return (
    <div data-testid="trip-cost-section" className={`rounded-lg border p-3 ${heroBg}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-base font-semibold font-[family-name:var(--font-heading)] ${heroText} truncate`}>
            {heroLabel}
          </div>
          <div className="text-xs text-[var(--color-muted)] mt-0.5">{subtitleLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="shrink-0 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors underline-offset-2 hover:underline"
        >
          {isOpen
            ? t('trip_cost_hide_breakdown' as Parameters<typeof t>[0])
            : t('trip_cost_show_breakdown' as Parameters<typeof t>[0])}
        </button>
      </div>

      <div
        className={`transition-all duration-200 ease-out overflow-hidden ${
          isOpen ? 'max-h-[260px] opacity-100 mt-3' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-1 pt-2 border-t border-[var(--color-surface-hover)]">
          <div className="text-xs text-[var(--color-foreground)] font-[family-name:var(--font-mono)]">
            {t('trip_cost_gasoline_line' as Parameters<typeof t>[0], {
              amount: formatVnd(live.gasoline.vnd),
            })}
          </div>
          <div className="text-xs text-[var(--color-foreground)] font-[family-name:var(--font-mono)]">
            {t('trip_cost_diesel_line' as Parameters<typeof t>[0], {
              amount: formatVnd(live.diesel.vnd),
            })}
          </div>
          {isFree ? (
            <div className="text-xs text-[var(--color-accent)] font-[family-name:var(--font-mono)]">
              {t('trip_cost_electric_free_line' as Parameters<typeof t>[0])}
            </div>
          ) : (
            <div className="text-xs text-[var(--color-foreground)] font-[family-name:var(--font-mono)]">
              {t('trip_cost_electric_vgreen_line' as Parameters<typeof t>[0], {
                amount: formatVnd(live.electric.vGreenVnd),
              })}
            </div>
          )}
          <div className="text-xs text-[var(--color-muted)] font-[family-name:var(--font-mono)]">
            {t('trip_cost_electric_home_line' as Parameters<typeof t>[0], {
              amount: formatVnd(live.electric.homeChargingVnd),
            })}
          </div>
          <div className="text-[10px] text-[var(--color-muted)] leading-relaxed pt-1">
            {t('trip_cost_note' as Parameters<typeof t>[0])}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trip Overview Card (Phase 1 redesign) ──

function formatHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function formatEta(totalMin: number, locale: 'vi' | 'en', baseIso?: string): string | null {
  // When the user picked a future departure, anchor the ETA on that moment;
  // otherwise treat it as "leaving now" and anchor on the current clock.
  const baseMs = baseIso ? new Date(baseIso).getTime() : Date.now();
  const eta = new Date(baseMs + totalMin * 60_000);
  if (eta.getTime() <= Date.now()) return null;
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(eta);
}

function TripOverviewCard({
  tripPlan,
  onSelectDepartureTime,
}: {
  readonly tripPlan: TripPlan;
  readonly onSelectDepartureTime?: (iso: string) => void;
}) {
  const { t, locale } = useLocale();

  const startCity = extractCityName(tripPlan.startAddress);
  const endCity = extractCityName(tripPlan.endAddress);

  const totalTimeMin = tripPlan.totalDurationMin + tripPlan.totalChargingTimeMin;
  const totalTimeStr = formatHM(totalTimeMin);
  const driveStr = formatHM(tripPlan.totalDurationMin);
  const chargeStr = formatHM(tripPlan.totalChargingTimeMin);

  const eta = formatEta(totalTimeMin, locale, tripPlan.departureAtIso);
  const hasPickedDeparture = tripPlan.departureAtIso != null;
  const arrivalBattery = Math.max(0, Math.round(tripPlan.arrivalBatteryPercent));
  const startBattery = Math.round(tripPlan.batterySegments[0]?.startBatteryPercent ?? 0);

  // Map TripPlan's chargingStops (heterogeneous shape) to RouteTimeline-friendly stops.
  // Uses .reduce so per-segment distance is computed without mid-render mutation.
  const stopDistanceFromStart = (s: TripPlan['chargingStops'][number]): number =>
    'selected' in s ? s.distanceAlongRouteKm : s.distanceFromStartKm;

  const timelineStops: RouteTimelineStop[] = tripPlan.chargingStops.map((stop, i, arr) => {
    const hasAlternatives = 'selected' in stop;
    const station: ChargingStationData = hasAlternatives ? stop.selected.station : stop.station;
    const arrivalP = hasAlternatives ? stop.batteryPercentAtArrival : stop.arrivalBatteryPercent;
    const departureP = hasAlternatives ? stop.batteryPercentAfterCharge : stop.departureBatteryPercent;
    const chargeT = hasAlternatives ? stop.selected.estimatedChargeTimeMin : stop.estimatedChargingTimeMin;

    const distFromStart = stopDistanceFromStart(stop);
    const prevDistFromStart = i === 0 ? 0 : stopDistanceFromStart(arr[i - 1]!);
    const segDistance = Math.max(0, distFromStart - prevDistFromStart);

    const extracted = extractStationShortName(station.name);
    const shortName = extracted === 'Trạm' ? `Trạm ${i + 1}` : extracted;

    return {
      shortName,
      distanceFromPrevKm: segDistance,
      arrivalPercent: arrivalP,
      departurePercent: departureP,
      chargeTimeMin: chargeT,
    };
  });

  const passes = detectPasses(tripPlan.polyline);

  // Phase 2 — when the user picked a future departure, build 3 heuristic-
  // predicted "what-if" options so they can compare. We don't fan-out 3
  // /api/route fetches: the polyline doesn't change with departure time,
  // only the multiplier does, so we recompute the multiplier client-side.
  const whatIfOptions: readonly WhatIfOption[] = (() => {
    if (!tripPlan.departureAtIso) return [];
    const baseDuration =
      tripPlan.traffic && tripPlan.traffic.trafficMultiplier > 0
        ? Math.round(tripPlan.totalDurationMin / tripPlan.traffic.trafficMultiplier)
        : tripPlan.totalDurationMin;

    const current = new Date(tripPlan.departureAtIso);
    const plus2h = new Date(current.getTime() + 2 * 60 * 60 * 1000);
    const tomorrow = new Date(current);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 30, 0, 0);

    const candidates: Array<{ key: string; label: string; date: Date }> = [
      { key: 'current', label: t('trip_whatif_current' as Parameters<typeof t>[0]), date: current },
      { key: 'plus2h', label: t('trip_whatif_plus_2h' as Parameters<typeof t>[0]), date: plus2h },
      { key: 'tomorrow', label: t('trip_whatif_tomorrow_morning' as Parameters<typeof t>[0]), date: tomorrow },
    ];

    return candidates.map(({ key, label, date }): WhatIfOption => {
      const peak = evaluatePeakHour(date, tripPlan.polyline);
      const adjusted = peak ? Math.round(baseDuration * peak.multiplier) : baseDuration;
      const arrival = new Date(date.getTime() + adjusted * 60_000);
      return {
        key,
        label,
        departAt: date.toISOString(),
        totalDurationMin: adjusted,
        arrivalEtaIso: arrival.toISOString(),
        peakWindowReason: peak ? (locale === 'vi' ? peak.reasonVi : peak.reasonEn) : null,
      };
    });
  })();

  return (
    <div className="p-4 bg-[var(--color-surface)] rounded-lg space-y-3">
      {/* Headline */}
      <div className="space-y-0.5">
        <h3 className="text-base font-semibold font-[family-name:var(--font-heading)] text-[var(--color-foreground)]">
          {startCity} → {endCity}
        </h3>
        <p className="text-base font-bold text-[var(--color-accent)]">
          {t('trip_arrival_battery_hero', { percent: String(arrivalBattery) })}
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          {eta
            ? hasPickedDeparture
              ? t('trip_duration_with_eta_picked' as Parameters<typeof t>[0], { time: totalTimeStr, eta })
              : t('trip_duration_with_eta', { time: totalTimeStr, eta })
            : t('trip_duration_only', { time: totalTimeStr })}
        </p>
      </div>

      {/* Route timeline — only when there are charging stops to visualize */}
      {tripPlan.chargingStops.length > 0 && (
        <RouteTimeline
          startCity={startCity}
          startBatteryPercent={startBattery}
          endCity={endCity}
          arrivalBatteryPercent={arrivalBattery}
          totalDistanceKm={tripPlan.totalDistanceKm}
          stops={timelineStops}
          swipeHint={t('trip_timeline_swipe_hint')}
          ariaStopLabel={(n, name, arrive, depart, mins) =>
            t('trip_timeline_aria_stop', {
              n: String(n),
              name,
              arrive: String(arrive),
              depart: String(depart),
              minutes: String(mins),
            })
          }
        />
      )}

      {/* Phase 2 traffic callout — surfaces predicted/real-time congestion
          when the trip falls inside a known peak window. The badge below
          tells the user whether the multiplier came from Mapbox real-time
          data or our heuristic. */}
      {tripPlan.traffic && (
        <div
          data-testid="trip-traffic-callout"
          className="p-2 bg-[var(--color-warn)]/10 text-[var(--color-warn)] rounded-md text-xs space-y-0.5"
        >
          <div>
            {t('trip_traffic_callout' as Parameters<typeof t>[0], {
              reason:
                locale === 'vi'
                  ? tripPlan.traffic.peakWindowReasonVi
                  : tripPlan.traffic.peakWindowReasonEn,
            })}
          </div>
          <div className="text-[10px] text-[var(--color-muted)]">
            {tripPlan.traffic.source === 'mapbox-traffic'
              ? t('trip_traffic_realtime_badge' as Parameters<typeof t>[0])
              : t('trip_traffic_heuristic_badge' as Parameters<typeof t>[0])}
          </div>
        </div>
      )}

      {/* Phase 2 what-if comparison — heuristic-only, no extra fetches.
          Shown when user picked a future departure; tap a non-current
          card to ask the parent to replan with that time. */}
      {whatIfOptions.length > 0 && (
        <WhatIfCards
          options={whatIfOptions}
          currentKey="current"
          onSelect={(option) => {
            if (option.departAt) onSelectDepartureTime?.(option.departAt);
          }}
        />
      )}

      {/* Terrain warnings — surface known mountain passes when route crosses them */}
      {passes.map((pass) => (
        <div
          key={pass.id}
          data-testid={`terrain-warning-${pass.id}`}
          className="p-2 bg-[var(--color-warn)]/10 text-[var(--color-warn)] rounded-md text-xs"
        >
          {t('trip_terrain_warning_pass', {
            passName: locale === 'vi' ? pass.nameVi : pass.nameEn,
            drainPercent: String(pass.drainPercent),
          })}
        </div>
      ))}

      {/* Compact totals row */}
      <div className="space-y-0.5 text-sm">
        <p className="font-[family-name:var(--font-mono)] text-[var(--color-foreground)]">
          {t('trip_totals_compact', {
            distance: String(tripPlan.totalDistanceKm),
            stops: String(tripPlan.chargingStops.length),
          })}
        </p>
        <p className="text-xs text-[var(--color-muted)] font-[family-name:var(--font-mono)]">
          {t('trip_breakdown_drive_charge', { drive: driveStr, charge: chargeStr })}
        </p>
      </div>
    </div>
  );
}

// ── Main Component ──

export default function TripSummary({ tripPlan, isLoading, vehicleEfficiencyWhPerKm, vehicleBrand, vehicleUsableBatteryKwh, vehicleOfficialRangeKm, onSelectAlternativeStation, onBackToChat, onSelectDepartureTime }: TripSummaryProps) {
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

  // Skeleton only when there's no previous trip to show. If a previous tripPlan
  // exists, keep it on screen during re-calc — Cancel button at the bottom of the
  // form already signals "calculating" (per trip-calc-input-lock spec §3.3).
  if (isLoading && !tripPlan) {
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

      {/* Cost hero — emotional payoff of choosing EV; first thing user sees */}
      {vehicleEfficiencyWhPerKm != null && vehicleEfficiencyWhPerKm > 0 && (
        <TripCostSection
          distanceKm={tripPlan.totalDistanceKm}
          efficiencyWhPerKm={vehicleEfficiencyWhPerKm}
          vehicleBrand={vehicleBrand}
          vehicleUsableBatteryKwh={vehicleUsableBatteryKwh}
          vehicleOfficialRangeKm={vehicleOfficialRangeKm}
        />
      )}

      {/* Route Briefing — loads asynchronously after trip plan */}
      <RouteBriefing
        overview={narrativeState.overview}
        narrative={narrativeState.narrative}
        isLoading={narrativeState.isLoading}
      />

      <TripOverviewCard tripPlan={tripPlan} onSelectDepartureTime={onSelectDepartureTime} />

      {/* No charging needed pill — only when literally no charging stops AND no warnings */}
      {tripPlan.chargingStops.length === 0 && tripPlan.warnings.length === 0 && (
        <div className="p-3 bg-[var(--color-safe)]/10 text-[var(--color-safe)] rounded-lg text-sm">
          {t('no_charging_needed')}
        </div>
      )}

      {/* Trip-level warnings (e.g. no compatible station found in some segment) */}
      {tripPlan.warnings.map((w, i) => (
        <div key={i} className="p-3 bg-[var(--color-warn)]/10 text-[var(--color-warn)] rounded-lg text-sm">
          {tBi(w)}
        </div>
      ))}

      {/* Routing-fallback note — text-only, muted color (informational, not error) */}
      {tripPlan.routeProvider === 'mapbox' && (
        <p
          data-testid="route-provider-fallback-note"
          className="text-xs text-[var(--color-muted)] leading-relaxed px-2"
        >
          {t('route_provider_fallback' as Parameters<typeof t>[0])}
        </p>
      )}

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

                {/* Trust chip — surfaces lastVerifiedAt without expanding the report widget */}
                <div className="px-3 -mt-1 ml-8">
                  <StationTrustChip lastVerifiedAt={station.lastVerifiedAt} />
                </div>

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

                    {/* Crowdsourced status reporting (1-tap working/broken/busy) */}
                    <StationStatusReporter
                      stationId={station.id}
                      lastVerifiedAt={station.lastVerifiedAt}
                    />

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
