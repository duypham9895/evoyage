// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import TripSummary from './TripSummary';
import type { ChargingStationData, RankedStation, TripPlan } from '@/types';

// ── Mocks ──

const translations: Record<string, string> = {
  planning: 'Calculating route...',
  trip_summary: 'Trip summary',
  distance: 'Distance',
  total_time: 'Total time',
  driving: 'Driving',
  charging: 'Charging',
  stops: 'stops',
  start: 'Start',
  arrive: 'Arrive',
  // New Phase 1 redesign keys
  trip_arrival_battery_hero: '{{percent}}% battery when you arrive',
  trip_duration_with_eta: '~{{time}} · arrive at {{eta}} if leaving now',
  trip_duration_only: '~{{time}}',
  trip_totals_compact: '{{distance}} km · {{stops}} stops',
  trip_breakdown_drive_charge: 'Drive {{drive}} · Charge {{charge}}',
  trip_timeline_swipe_hint: '← Swipe for more stops',
  trip_timeline_aria_stop: 'Stop {{n}}: {{name}}, arrive {{arrive}}%, charge to {{depart}}%, {{minutes}} minutes',
  trip_terrain_warning_pass: 'Route includes {{passName}} — battery drains ~{{drainPercent}}% faster',
  no_charging_needed: 'No charging needed',
  charging_stops: 'Charging stops',
  extra_stop_badge: 'Top-up · suggested',
  extra_stop_duration: '~{{minutes}} min top-up',
  extra_stop_why: 'Why?',
  extra_stop_why_title: 'Why Duy suggests this stop',
  extra_stop_why_holiday: 'Stations ahead get busy on holidays — a top-up now buys peace of mind.',
  extra_stop_why_sparse: 'Sparse charging ahead — a little extra battery makes the leg easier.',
  extra_stop_why_peak: 'Stations may queue up at peak hour — top up now to skip the wait.',
  extra_stop_why_tight_margin: 'Long leg ahead — a top-up keeps the margin comfortable.',
  extra_stop_why_low_buffer: "You'd arrive at the next stop low on battery — extra cushion helps.",
  extra_stop_dismiss: 'Skip it',
  extra_stop_dismiss_confirm_title: 'Skip this top-up?',
  extra_stop_dismiss_confirm_body: 'Your route still works — just with a slimmer safety margin.',
  extra_stop_dismiss_confirm_action: 'Skip',
  extra_stop_dismiss_confirm_cancel: 'Keep',
  extra_stop_dismissed_inline: 'You skipped a top-up here · {{action}}',
  extra_stop_undo: 'Undo',
  extra_stop_aria_label: 'Suggested stop {{n}}, {{name}}, {{minutes}} min top-up, can be skipped',
  extra_stop_dismiss_aria: 'Skip suggested station {{stationName}}',
  extra_stop_insufficient_margin_warning: 'Skipping this top-up leaves very low battery at the next stop.',
  navigate: 'Navigate',
  open_in_google_maps: 'Open in Google Maps',
  disclaimer: 'Disclaimer text',
  evi_back_to_chat: 'Back to chat',
  route_briefing: 'Route briefing',
  route_briefing_collapse: 'Show less',
  route_briefing_expand: 'Show more',
  station_status_active: 'Active',
  station_status_busy: 'Busy',
  station_status_unavailable: 'Unavailable',
  station_status_inactive: 'Inactive',
  // New cost-transparency keys
  trip_cost_heading: 'Trip cost',
  trip_cost_electricity: 'Electricity: ~{{amount}}',
  trip_cost_savings: 'vs gasoline: save {{amount}} ({{percent}}%)',
  trip_cost_no_savings: 'vs gasoline: {{amount}} more',
  trip_cost_note: 'Estimate note',
  trip_cost_hero_savings: 'Save {{amount}} vs gasoline',
  trip_cost_hero_extra: '{{amount}} more than gasoline',
  trip_cost_hero_free: 'Free at V-GREEN vs gasoline {{amount}}',
  trip_cost_hero_percent_cheaper: '{{percent}}% cheaper',
  trip_cost_hero_percent_more: '{{percent}}% more',
  trip_cost_hero_percent_free: 'Free until 2029 for VinFast owners',
  trip_cost_show_breakdown: 'How is this calculated?',
  trip_cost_hide_breakdown: 'Hide',
  trip_cost_gasoline_line: 'Gasoline: ~{{amount}}',
  trip_cost_diesel_line: 'Diesel: ~{{amount}}',
  trip_cost_electric_free_line: 'Electric: Free at V-GREEN (until 2029)',
  trip_cost_electric_vgreen_line: 'Electric at V-GREEN: ~{{amount}}',
  trip_cost_electric_home_line: 'Electric at home: ~{{amount}}',
  // Routing-fallback note
  route_provider_fallback: 'Route calculated using Mapbox (OSM service was unavailable). Distance/duration may differ slightly.',
};

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      let text = translations[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{{${k}}}`, String(v));
        }
      }
      return text;
    },
    tBi: (obj: { messageVi: string; messageEn: string }) => obj.messageEn,
  }),
}));

vi.mock('@/hooks/useRouteNarrative', () => ({
  useRouteNarrative: () => ({ overview: null, narrative: null, isLoading: false }),
}));

vi.mock('./StationDetailExpander', () => ({
  default: () => null,
}));

vi.mock('./StationAmenities', () => ({
  default: () => null,
}));

vi.mock('./StationStatusReporter', () => ({
  default: () => null,
}));

// ── Helpers ──

function makeTripPlan(overrides: Partial<TripPlan> = {}): TripPlan {
  return {
    totalDistanceKm: 100,
    totalDurationMin: 90,
    chargingStops: [],
    warnings: [],
    batterySegments: [
      { startKm: 0, endKm: 100, startBatteryPercent: 80, endBatteryPercent: 50, label: 'Drive' },
    ],
    arrivalBatteryPercent: 50,
    totalChargingTimeMin: 0,
    polyline: '',
    startAddress: 'A',
    endAddress: 'B',
    startCoord: { lat: 10.776, lng: 106.700 },
    endCoord: { lat: 11.940, lng: 108.443 },
    ...overrides,
  };
}

function makeStation(id: string): ChargingStationData {
  return {
    id,
    name: id,
    address: 'Test address',
    province: 'Test',
    latitude: 10.776,
    longitude: 106.7,
    chargerTypes: ['DC_60kW'],
    connectorTypes: ['CCS2'],
    portCount: 2,
    maxPowerKw: 60,
    stationType: 'public',
    isVinFastOnly: false,
    operatingHours: null,
    provider: 'Test',
    chargingStatus: null,
    parkingFee: null,
  };
}

function makeRankedStation(station: ChargingStationData): RankedStation {
  return {
    station,
    detourDriveTimeSec: 60,
    estimatedChargeTimeMin: 18,
    totalStopTimeMin: 19,
    rank: 'best',
    score: 19,
  };
}

function makeChargingStop(
  stationName: string,
  distanceKm: number,
  arrivalBattery: number,
  departureBattery: number,
  chargeTimeMin = 18,
  precautionaryReason?: NonNullable<TripPlan['chargingStops'][number]['precautionaryReason']>,
): TripPlan['chargingStops'][number] {
  const ranked = makeRankedStation(makeStation(stationName));
  return {
    selected: {
      ...ranked,
      estimatedChargeTimeMin: chargeTimeMin,
      totalStopTimeMin: chargeTimeMin + 1,
    },
    alternatives: [],
    distanceAlongRouteKm: distanceKm,
    batteryPercentAtArrival: arrivalBattery,
    batteryPercentAfterCharge: departureBattery,
    ...(precautionaryReason
      ? { isPrecautionary: true as const, precautionaryReason }
      : {}),
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Tests ──

// Trip-calc input lock spec: 2026-05-03-trip-calc-input-lock-design.md §3.3 promises
// "Cancel reverts to previous tripPlan" — but if TripSummary swaps to a skeleton
// during isLoading regardless of tripPlan, the user sees their last good plan blink
// away during every re-calc. Round 2 of QA (2026-05-03) caught this gap.
describe('TripSummary — recalc behavior (preserve previous trip during isLoading)', () => {
  it('renders skeleton ONLY when isLoading=true AND no previous tripPlan exists', () => {
    render(<TripSummary tripPlan={null} isLoading={true} />);
    // Skeleton uses the planning text + animate-pulse divs — no real trip data.
    expect(screen.getByText('Calculating route...')).toBeInTheDocument();
  });

  it('keeps previous tripPlan visible during isLoading=true (no skeleton swap)', () => {
    const prev = makeTripPlan({
      totalDistanceKm: 298.9,
      arrivalBatteryPercent: 57,
      startAddress: 'Quận 1, TP.HCM',
      endAddress: 'Đà Lạt',
    });
    render(<TripSummary tripPlan={prev} isLoading={true} />);
    // Distance and arrival from the PREVIOUS trip remain on screen during recalc.
    // Distance now embedded in the trip-totals-compact string ("298.9 km · 0 stops").
    expect(screen.getByText(/298\.9 km/)).toBeInTheDocument();
    expect(screen.getByText('57% battery when you arrive')).toBeInTheDocument();
    // The skeleton "Calculating route..." text must NOT replace the visible trip.
    expect(screen.queryByText('Calculating route...')).not.toBeInTheDocument();
  });
});

describe('TripSummary — trip cost section', () => {
  it('renders gasoline, diesel, and electric breakdown rows when efficiency is provided', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan()}
        isLoading={false}
        vehicleEfficiencyWhPerKm={150}
      />,
    );
    const section = screen.getByTestId('trip-cost-section');
    expect(section).toBeInTheDocument();
    // Three live-priced fuel lines render with VND-formatted numbers
    expect(section).toHaveTextContent(/Gasoline: ~[\d.]+ ₫/);
    expect(section).toHaveTextContent(/Diesel: ~[\d.]+ ₫/);
    expect(section).toHaveTextContent(/Electric at home: ~[\d.]+ ₫/);
  });

  it('shows "Free at V-GREEN" line for VinFast vehicles before 2029-12-31', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan()}
        isLoading={false}
        vehicleEfficiencyWhPerKm={150}
        vehicleBrand="VinFast"
        vehicleUsableBatteryKwh={82}
        vehicleOfficialRangeKm={471}
      />,
    );
    const section = screen.getByTestId('trip-cost-section');
    expect(section).toHaveTextContent('Electric: Free at V-GREEN (until 2029)');
    // V-GREEN paid line should NOT appear when free
    expect(section).not.toHaveTextContent(/Electric at V-GREEN: ~/);
    // Home line still shows so the customer sees the alternative
    expect(section).toHaveTextContent(/Electric at home: ~[\d.]+ ₫/);
  });

  it('shows paid V-GREEN line for non-VinFast vehicles', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan()}
        isLoading={false}
        vehicleEfficiencyWhPerKm={150}
        vehicleBrand="Tesla"
      />,
    );
    const section = screen.getByTestId('trip-cost-section');
    expect(section).toHaveTextContent(/Electric at V-GREEN: ~[\d.]+ ₫/);
    expect(section).not.toHaveTextContent('Free at V-GREEN');
  });

  it('hides cost section when efficiency is missing', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan()}
        isLoading={false}
        vehicleEfficiencyWhPerKm={null}
      />,
    );

    expect(screen.queryByTestId('trip-cost-section')).not.toBeInTheDocument();
  });

  it('hides cost section when efficiency prop is omitted', () => {
    render(<TripSummary tripPlan={makeTripPlan()} isLoading={false} />);
    expect(screen.queryByTestId('trip-cost-section')).not.toBeInTheDocument();
  });

  it('hides cost section when efficiency is zero or negative', () => {
    const { rerender } = render(
      <TripSummary tripPlan={makeTripPlan()} isLoading={false} vehicleEfficiencyWhPerKm={0} />,
    );
    expect(screen.queryByTestId('trip-cost-section')).not.toBeInTheDocument();

    rerender(
      <TripSummary tripPlan={makeTripPlan()} isLoading={false} vehicleEfficiencyWhPerKm={-10} />,
    );
    expect(screen.queryByTestId('trip-cost-section')).not.toBeInTheDocument();
  });

  it('renders cost for very long trips with grouped formatting (dot thousands)', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({ totalDistanceKm: 1000 })}
        isLoading={false}
        vehicleEfficiencyWhPerKm={180}
      />,
    );
    const section = screen.getByTestId('trip-cost-section');
    // For a 1000 km trip the gasoline line must use grouped formatting (≥1M VND).
    // Match a number with at least two dot-separators, e.g. "1.900.000 ₫".
    expect(section).toHaveTextContent(/Gasoline: ~\d+\.\d{3}\.\d{3} ₫/);
  });

  it('shows the routing-fallback note when routeProvider === "mapbox"', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({ routeProvider: 'mapbox' })}
        isLoading={false}
      />,
    );

    const note = screen.getByTestId('route-provider-fallback-note');
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/Mapbox/);
    expect(note).toHaveTextContent(/OSM service was unavailable/);
  });

  it('hides the routing-fallback note when routeProvider === "osrm"', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({ routeProvider: 'osrm' })}
        isLoading={false}
      />,
    );
    expect(screen.queryByTestId('route-provider-fallback-note')).not.toBeInTheDocument();
  });

  it('hides the routing-fallback note when routeProvider is absent', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan()}
        isLoading={false}
      />,
    );
    expect(screen.queryByTestId('route-provider-fallback-note')).not.toBeInTheDocument();
  });

  it('shows "more than gasoline" copy when EV home cost exceeds gasoline equivalent', () => {
    // Force EV cost > gas: efficiency 1500 Wh/km is unrealistic but exercises the branch.
    // Tesla brand prevents the V-GREEN free path so the comparison runs against home charging.
    render(
      <TripSummary
        tripPlan={makeTripPlan()}
        isLoading={false}
        vehicleEfficiencyWhPerKm={1500}
        vehicleBrand="Tesla"
      />,
    );
    const section = screen.getByTestId('trip-cost-section');
    expect(section).toHaveTextContent(/more than gasoline/);
  });
});

describe('TripSummary — precautionary stops', () => {
  it('renders precautionary stops with suggested treatment and top-up duration copy', () => {
    const station = makeStation('Precautionary Midpoint');
    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            {
              selected: makeRankedStation(station),
              alternatives: [],
              distanceAlongRouteKm: 120,
              batteryPercentAtArrival: 35,
              batteryPercentAfterCharge: 60,
              isPrecautionary: true,
              precautionaryReason: 'holiday',
            },
          ],
          totalChargingTimeMin: 18,
        })}
        isLoading={false}
      />,
    );

    const card = screen.getByLabelText('Suggested stop 1, Precautionary Midpoint, 18 min top-up, can be skipped');
    expect(card).toHaveClass('border-dashed');
    expect(card).toHaveClass('border-[var(--color-border)]');
    expect(card).toHaveClass('opacity-70');
    expect(screen.getByText('Top-up · suggested')).toBeInTheDocument();
    expect(screen.getByText('~18 min top-up')).toBeInTheDocument();
  });

  it('renders dismiss and why controls outside the alternatives picker', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            makeChargingStop('Precautionary Midpoint', 120, 35, 60, 18, 'holiday'),
          ],
          totalChargingTimeMin: 18,
        })}
        isLoading={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Why?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip suggested station Precautionary Midpoint' })).toBeInTheDocument();
  });

  it('opens and cancels the dismiss confirmation dialog', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            makeChargingStop('Precautionary Midpoint', 120, 35, 60, 18, 'holiday'),
          ],
          totalChargingTimeMin: 18,
        })}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip suggested station Precautionary Midpoint' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Skip this top-up?');
    expect(screen.getByText('Your route still works — just with a slimmer safety margin.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses a precautionary stop, renumbers downstream stops, and shows undo', () => {
    vi.useFakeTimers();
    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            makeChargingStop('Precautionary Midpoint', 120, 35, 60, 18, 'holiday'),
            makeChargingStop('Required Stop', 220, 28, 80, 30),
          ],
          batterySegments: [
            { startKm: 0, endKm: 120, startBatteryPercent: 80, endBatteryPercent: 35, label: 'A' },
            { startKm: 120, endKm: 220, startBatteryPercent: 60, endBatteryPercent: 28, label: 'B' },
            { startKm: 220, endKm: 300, startBatteryPercent: 80, endBatteryPercent: 50, label: 'C' },
          ],
          totalChargingTimeMin: 48,
        })}
        isLoading={false}
      />,
    );

    const suggestedCard = screen.getByLabelText('Suggested stop 1, Precautionary Midpoint, 18 min top-up, can be skipped');

    fireEvent.click(screen.getByRole('button', { name: 'Skip suggested station Precautionary Midpoint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(suggestedCard).toHaveClass('opacity-0');
    expect(suggestedCard).toHaveClass('scale-[0.98]');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText('Precautionary Midpoint')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Charging stops 1: Required Stop')).toBeInTheDocument();
    expect(screen.getByText('You skipped a top-up here · Undo')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('You skipped a top-up here · Undo')).not.toBeInTheDocument();
  });

  it('undo restores a dismissed precautionary stop', () => {
    vi.useFakeTimers();
    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            makeChargingStop('Precautionary Midpoint', 120, 35, 60, 18, 'holiday'),
            makeChargingStop('Required Stop', 220, 28, 80, 30),
          ],
          totalChargingTimeMin: 48,
        })}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip suggested station Precautionary Midpoint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(screen.getByText('Precautionary Midpoint')).toBeInTheDocument();
    expect(screen.queryByText('You skipped a top-up here · Undo')).not.toBeInTheDocument();
  });

  it('dismisses instantly when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            makeChargingStop('Precautionary Midpoint', 120, 35, 60, 18, 'holiday'),
          ],
          totalChargingTimeMin: 18,
        })}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip suggested station Precautionary Midpoint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.queryByText('Precautionary Midpoint')).not.toBeInTheDocument();
    expect(screen.getByText('You skipped a top-up here · Undo')).toBeInTheDocument();
  });

  it.each([
    ['holiday', 'Stations ahead get busy on holidays — a top-up now buys peace of mind.'],
    ['sparse', 'Sparse charging ahead — a little extra battery makes the leg easier.'],
    ['peak', 'Stations may queue up at peak hour — top up now to skip the wait.'],
    ['tightMargin', 'Long leg ahead — a top-up keeps the margin comfortable.'],
    ['lowBuffer', "You'd arrive at the next stop low on battery — extra cushion helps."],
  ] as const)('reveals the %s reason copy', (reason, copy) => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            makeChargingStop('Precautionary Midpoint', 120, 35, 60, 18, reason),
          ],
          totalChargingTimeMin: 18,
        })}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Why?' }));

    expect(screen.getByText('Why Duy suggests this stop')).toBeInTheDocument();
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it('adds the low-margin warning when skipping drops the next stop below 15%', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            makeChargingStop('Precautionary Midpoint', 120, 35, 60, 18, 'holiday'),
            makeChargingStop('Required Stop', 220, 28, 80, 30),
          ],
          batterySegments: [
            { startKm: 0, endKm: 120, startBatteryPercent: 80, endBatteryPercent: 35, label: 'A' },
            { startKm: 120, endKm: 220, startBatteryPercent: 60, endBatteryPercent: 28, label: 'B' },
            { startKm: 220, endKm: 300, startBatteryPercent: 80, endBatteryPercent: 50, label: 'C' },
          ],
          totalChargingTimeMin: 48,
        })}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip suggested station Precautionary Midpoint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.getByText('Skipping this top-up leaves very low battery at the next stop.')).toBeInTheDocument();
  });

  it('recomputes the arrival battery hero when skipping the final top-up changes destination arrival', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            makeChargingStop('Final Top-up', 120, 35, 60, 18, 'holiday'),
          ],
          batterySegments: [
            { startKm: 0, endKm: 120, startBatteryPercent: 80, endBatteryPercent: 35, label: 'A' },
            { startKm: 120, endKm: 200, startBatteryPercent: 60, endBatteryPercent: 50, label: 'B' },
          ],
          arrivalBatteryPercent: 50,
          totalChargingTimeMin: 18,
        })}
        isLoading={false}
      />,
    );

    expect(screen.getByText('50% battery when you arrive')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip suggested station Final Top-up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.getByText('25% battery when you arrive')).toBeInTheDocument();
  });

  it('uses the suggested-stop screen reader label', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({
          chargingStops: [
            makeChargingStop('Precautionary Midpoint', 120, 35, 60, 18, 'holiday'),
          ],
          totalChargingTimeMin: 18,
        })}
        isLoading={false}
      />,
    );

    expect(
      screen.getByLabelText('Suggested stop 1, Precautionary Midpoint, 18 min top-up, can be skipped'),
    ).toBeInTheDocument();
  });
});
