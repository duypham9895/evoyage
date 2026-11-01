// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Trip cost props for custom vehicles.
 *
 * TripSummary only mounts its cost hero/breakdown when
 * vehicleEfficiencyWhPerKm > 0. page.tsx derives that prop from
 * selectedVehicle only, and selecting a custom vehicle always nulls
 * selectedVehicle — so custom-vehicle trips never show a trip cost.
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
  const PlanPage = (await import('./page')).default;
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

  // BUG(p2-trip-cost-accuracy): page.tsx derives TripSummary cost props from selectedVehicle only, so custom vehicles never get a trip cost. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-trip-cost-accuracy.md
  it.fails('passes a positive vehicleEfficiencyWhPerKm so the trip cost section can render', async () => {
    await planWithCustomVehicle();
    expect(capturedTripSummaryProps.vehicleEfficiencyWhPerKm).toBeGreaterThan(0);
  }, 20000);
});
