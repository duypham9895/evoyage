// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PlanPage from './page';

/**
 * Trip cost props for custom vehicles.
 *
 * Selecting a custom vehicle always nulls selectedVehicle, so page.tsx must
 * read the TripSummary cost props from the active (custom) vehicle.
 *
 * TripSummary is stubbed so the test reads the exact props page.tsx passes.
 */

const CUSTOM_VEHICLE = JSON.stringify({
  brand: 'VinFast',
  model: 'VF 8',
  batteryCapacityKwh: 87.7,
  officialRangeKm: 471,
});

let capturedTripSummaryProps: Record<string, unknown> = {};
vi.mock('@/components/trip/TripSummary', () => ({
  default: (props: Record<string, unknown>) => {
    capturedTripSummaryProps = props;
    return <div data-testid="mock-trip-summary" />;
  },
}));

const ROUTE_RESPONSE = {
  tripId: 'trip-1',
  startAddress: 'Start Addr',
  endAddress: 'End Addr',
  startCoord: { lat: 10.8, lng: 106.7 },
  endCoord: { lat: 11.9, lng: 108.4 },
  polyline: 'poly',
  totalDistanceKm: 120,
  totalDurationMin: 150,
  chargingStops: [],
  warnings: [],
  batterySegments: [],
  arrivalBatteryPercent: 50,
  totalChargingTimeMin: 0,
};

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.setItem('ev-desktop-tab', 'planTrip');
  window.history.replaceState(
    null,
    '',
    `/plan?start=A&end=B&cv=${encodeURIComponent(CUSTOM_VEHICLE)}`,
  );
  capturedTripSummaryProps = {};
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const body = typeof url === 'string' && url.includes('/api/route')
      ? ROUTE_RESPONSE
      : { vehicles: [] };
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function planWithCustomVehicle() {
  render(<PlanPage />);
  const calculate = await screen.findByRole('button', { name: 'Tính lộ trình' });
  fireEvent.click(calculate);
  await waitFor(() => expect(capturedTripSummaryProps.tripPlan).toBeTruthy());
}

describe('plan page — trip cost props with a custom vehicle', () => {
  // Control: proves the harness reaches a rendered TripSummary with a plan,
  // so the it.fails below fails on the real assertion, not on setup.
  it('renders TripSummary with the trip plan for a custom-vehicle route', async () => {
    await planWithCustomVehicle();
    expect(capturedTripSummaryProps.tripPlan).toMatchObject({ totalDistanceKm: 120 });
  }, 20000);

  // Regression for p2-trip-cost-accuracy (was it.fails): page.tsx derived TripSummary cost props from selectedVehicle only, so custom vehicles never got a trip cost. See docs/bugs/2026-11-01-p2-trip-cost-accuracy.md
  // TripSummary now renders the cost section from battery + range when efficiency is missing
  // (covered in TripSummary.test.tsx), so the contract here is that the custom vehicle's
  // brand, battery and range reach TripSummary. Efficiency stays null: a synthesised
  // battery/range efficiency would skip the NEDC real-world correction.
  it('passes the custom vehicle brand, battery and range so the trip cost section can render', async () => {
    await planWithCustomVehicle();
    expect(capturedTripSummaryProps).toMatchObject({
      vehicleBrand: 'VinFast',
      vehicleBatteryCapacityKwh: 87.7,
      vehicleOfficialRangeKm: 471,
    });
    expect(capturedTripSummaryProps.vehicleEfficiencyWhPerKm ?? null).toBeNull();
  }, 20000);
});
