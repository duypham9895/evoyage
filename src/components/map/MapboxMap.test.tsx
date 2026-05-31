// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, act, within } from '@testing-library/react';
import MapboxMap from './MapboxMap';
import TripSummary from '@/components/trip/TripSummary';
import { usePrecautionaryStopInteractions } from '@/hooks/usePrecautionaryStopInteractions';
import type { ChargingStationData, RankedStation, TripPlan } from '@/types';

const translations: Record<string, string> = {
  trip_summary: 'Trip summary',
  trip_arrival_battery_hero: '{{percent}}% battery when you arrive',
  trip_duration_only: '~{{time}}',
  trip_totals_compact: '{{distance}} km · {{stops}} stops',
  trip_breakdown_drive_charge: 'Drive {{drive}} · Charge {{charge}}',
  charging_stops: 'Charging stops',
  extra_stop_badge: 'Top-up · suggested',
  extra_stop_duration: '~{{minutes}} min top-up',
  extra_stop_why: 'Why?',
  extra_stop_why_title: 'Why Duy suggests this stop',
  extra_stop_why_holiday: 'Stations ahead get busy on holidays — a top-up now buys peace of mind.',
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
  popup_navigate: 'Navigate',
  stations_best: 'Best',
  trip_stop_navigate: 'Just to this stop',
  disclaimer: 'Disclaimer text',
  open_in_google_maps: 'Open in Google Maps',
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
    tBi: (obj: { messageEn: string }) => obj.messageEn,
  }),
}));

vi.mock('@/hooks/useRouteNarrative', () => ({
  useRouteNarrative: () => ({ overview: null, narrative: null, isLoading: false }),
}));

vi.mock('@/lib/analytics', () => ({
  trackAlternativeMarkerClicked: vi.fn(),
  trackAlternativeNavigateClicked: vi.fn(),
  trackTerrainWarningShown: vi.fn(),
  trackTrafficCalloutShown: vi.fn(),
  trackWhatIfPicked: vi.fn(),
  trackBackupAlternativesDistribution: vi.fn(),
  trackAlternativeListItemClicked: vi.fn(),
}));

vi.mock('@/components/trip/StationAmenities', () => ({ default: () => null }));
vi.mock('@/components/trip/StationStatusReporter', () => ({ default: () => null }));
vi.mock('@/components/trip/StationDetailExpander', () => ({ default: () => null }));
vi.mock('@/components/trip/StopPopularity', () => ({ default: () => null }));
vi.mock('@/components/trip/StationTrustChip', () => ({ default: () => null }));

vi.mock('mapbox-gl', () => ({
  default: {
    LngLatBounds: class {
      extend = vi.fn();
    },
  },
}));

vi.mock('react-map-gl/mapbox', async () => {
  const React = await import('react');
  return {
    default: ({ children }: { readonly children?: React.ReactNode }) => (
      <div data-testid="mapbox-map">{children}</div>
    ),
    Source: ({ children }: { readonly children?: React.ReactNode }) => (
      <div data-testid="map-source">{children}</div>
    ),
    Layer: () => <div data-testid="map-layer" />,
    Marker: ({
      children,
      onClick,
    }: {
      readonly children?: React.ReactNode;
      readonly onClick?: (event: { originalEvent: { stopPropagation: () => void } }) => void;
    }) => (
      <div
        data-testid="map-marker"
        onClick={() => onClick?.({ originalEvent: { stopPropagation: vi.fn() } })}
      >
        {children}
      </div>
    ),
    Popup: ({
      children,
      onClose,
    }: {
      readonly children?: React.ReactNode;
      readonly onClose?: () => void;
    }) => (
      <div data-testid="map-popup">
        {children}
        <button type="button" onClick={onClose}>Close popup</button>
      </div>
    ),
    useMap: () => ({ current: { fitBounds: vi.fn() } }),
  };
});

function makeStation(id: string, offset = 0): ChargingStationData {
  return {
    id,
    name: id,
    address: `${id} address`,
    province: 'Test',
    latitude: 10.776 + offset,
    longitude: 106.7 + offset,
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
  offset = 0,
  precautionaryReason?: NonNullable<TripPlan['chargingStops'][number]['precautionaryReason']>,
): TripPlan['chargingStops'][number] {
  const ranked = makeRankedStation(makeStation(stationName, offset));
  return {
    selected: ranked,
    alternatives: [],
    distanceAlongRouteKm: distanceKm,
    batteryPercentAtArrival: arrivalBattery,
    batteryPercentAfterCharge: departureBattery,
    ...(precautionaryReason
      ? { isPrecautionary: true as const, precautionaryReason }
      : {}),
  };
}

function makeTripPlan(): TripPlan {
  return {
    totalDistanceKm: 300,
    totalDurationMin: 180,
    chargingStops: [
      makeChargingStop('Required Stop', 110, 28, 80, 0),
      makeChargingStop('Suggested Top-up', 180, 35, 60, 0.1, 'holiday'),
    ],
    warnings: [],
    batterySegments: [
      { startKm: 0, endKm: 110, startBatteryPercent: 80, endBatteryPercent: 28, label: 'A' },
      { startKm: 110, endKm: 180, startBatteryPercent: 80, endBatteryPercent: 35, label: 'B' },
      { startKm: 180, endKm: 300, startBatteryPercent: 60, endBatteryPercent: 32, label: 'C' },
    ],
    arrivalBatteryPercent: 32,
    totalChargingTimeMin: 36,
    polyline: '',
    startAddress: 'A',
    endAddress: 'B',
    startCoord: { lat: 10.776, lng: 106.7 },
    endCoord: { lat: 11.94, lng: 108.443 },
    tripId: 'trip-map-test',
  };
}

function SharedHarness() {
  const tripPlan = makeTripPlan();
  const interactions = usePrecautionaryStopInteractions('trip-map-test');
  return (
    <>
      <MapboxMap tripPlan={tripPlan} precautionaryStopInteractions={interactions} />
      <TripSummary tripPlan={tripPlan} isLoading={false} precautionaryStopInteractions={interactions} />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('MapboxMap precautionary stops', () => {
  it('renders required stops as solid numbered 24px pins', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'test-token');
    render(<MapboxMap tripPlan={makeTripPlan()} />);

    const marker = screen.getByLabelText('Charging stops 1: Required Stop');
    expect(marker).toHaveStyle({ width: '24px', height: '24px' });
    expect(marker.getAttribute('style')).toContain('2px solid');
    expect(marker).toHaveTextContent('1');
  });

  it('renders precautionary stops as hollow 16px dashed pins without ordinals', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'test-token');
    render(<MapboxMap tripPlan={makeTripPlan()} />);

    const marker = screen.getByLabelText('Suggested stop 2, Suggested Top-up, 18 min top-up, can be skipped');
    expect(marker).toHaveStyle({ width: '16px', height: '16px' });
    expect(marker).toHaveStyle('background: transparent');
    expect(marker.getAttribute('style')).toContain('1.5px dashed');
    expect(marker).not.toHaveTextContent('2');
  });

  it('opens a mini-popup with why and dismiss controls', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'test-token');
    render(<MapboxMap tripPlan={makeTripPlan()} />);

    fireEvent.click(screen.getByLabelText('Suggested stop 2, Suggested Top-up, 18 min top-up, can be skipped'));

    expect(screen.getByTestId('map-popup')).toHaveTextContent('Suggested Top-up');
    expect(screen.getByRole('button', { name: 'Why?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip suggested station Suggested Top-up' })).toBeInTheDocument();
  });

  it('reveals the reason copy inside the mini-popup', () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'test-token');
    render(<MapboxMap tripPlan={makeTripPlan()} />);

    fireEvent.click(screen.getByLabelText('Suggested stop 2, Suggested Top-up, 18 min top-up, can be skipped'));
    fireEvent.click(screen.getByRole('button', { name: 'Why?' }));

    expect(screen.getByText('Why Duy suggests this stop')).toBeInTheDocument();
    expect(screen.getByText('Stations ahead get busy on holidays — a top-up now buys peace of mind.')).toBeInTheDocument();
  });

  it('shares map dismissals with the timeline card state', () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'test-token');
    render(<SharedHarness />);

    expect(screen.getAllByLabelText('Suggested stop 2, Suggested Top-up, 18 min top-up, can be skipped')).toHaveLength(2);

    fireEvent.click(screen.getByTestId('precautionary-stop-marker'));
    fireEvent.click(within(screen.getByTestId('map-popup')).getByRole('button', { name: 'Skip suggested station Suggested Top-up' }));
    fireEvent.click(within(screen.getByTestId('map-popup')).getByRole('button', { name: 'Skip' }));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByLabelText('Suggested stop 2, Suggested Top-up, 18 min top-up, can be skipped')).not.toBeInTheDocument();
    expect(screen.queryByText('Suggested Top-up')).not.toBeInTheDocument();
    expect(screen.getByText('You skipped a top-up here · Undo')).toBeInTheDocument();
  });
});
