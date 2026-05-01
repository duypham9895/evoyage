// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, cleanup } from '@testing-library/react';
import TripSummary from './TripSummary';
import type { TripPlan } from '@/types';

// ── Mocks ──

const translations: Record<string, string> = {
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

describe('TripSummary — trip cost section', () => {
  it('renders cost lines when efficiency is provided', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan()}
        isLoading={false}
        vehicleEfficiencyWhPerKm={150}
      />,
    );

    const section = screen.getByTestId('trip-cost-section');
    expect(section).toBeInTheDocument();
    // 100 km × 150 Wh/km = 15 kWh × 3500 = 52,500 VND
    expect(section).toHaveTextContent('Electricity: ~52.500 ₫');
    // 100 km × 7 L/100km × 23000 = 161,000; saves 108,500 VND ≈ 67%
    expect(section).toHaveTextContent('vs gasoline: save 108.500 ₫ (67%)');
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

  it('renders cost for very long trips with grouped formatting', () => {
    render(
      <TripSummary
        tripPlan={makeTripPlan({ totalDistanceKm: 1000 })}
        isLoading={false}
        vehicleEfficiencyWhPerKm={180}
      />,
    );
    // 1000 × 180 / 1000 = 180 kWh × 3500 = 630,000
    // gasoline: 1000 × 7 / 100 × 23000 = 1,610,000; saved = 980,000 ≈ 61%
    const section = screen.getByTestId('trip-cost-section');
    expect(section).toHaveTextContent('Electricity: ~630.000 ₫');
    expect(section).toHaveTextContent('vs gasoline: save 980.000 ₫ (61%)');
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

  it('shows "more expensive" copy when EV cost exceeds gasoline equivalent', () => {
    // Force EV cost > gas: efficiency 1500 Wh/km is unrealistic but exercises the branch.
    // 100 × 1500 / 1000 = 150 kWh × 3500 = 525,000 vs gas 161,000 → +364,000
    render(
      <TripSummary
        tripPlan={makeTripPlan()}
        isLoading={false}
        vehicleEfficiencyWhPerKm={1500}
      />,
    );

    const section = screen.getByTestId('trip-cost-section');
    expect(section).toHaveTextContent('vs gasoline: 364.000 ₫ more');
  });
});
