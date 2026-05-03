// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, cleanup } from '@testing-library/react';
import TripSummary from './TripSummary';
import type { TripPlan } from '@/types';

// ── Mocks ──

const translations: Record<string, string> = {
  planning: 'Calculating route...',
  trip_summary: 'Trip summary',
  distance: 'Distance',
  total_time: 'Total time',
  driving: 'Driving',
  charging: 'Charging',
  stops: 'stops',
  battery_journey: 'Battery journey',
  start: 'Start',
  arrive: 'Arrive',
  no_charging_needed: 'No charging needed',
  charging_stops: 'Charging stops',
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
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
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
    expect(screen.getByText('298.9 km')).toBeInTheDocument();
    expect(screen.getByText(/57/)).toBeInTheDocument();
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
