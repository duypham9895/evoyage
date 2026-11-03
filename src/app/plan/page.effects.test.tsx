// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import PlanPage from './page';

/**
 * Characterization tests for the react-hooks-compiler refactor of
 * src/app/plan/page.tsx:
 *  - D2: geolocationSupported — useSyncExternalStore instead of
 *    `useState(false)` + `useEffect(() => setGeolocationSupported(...), [])`.
 *  - D3: autoPlanPending — replaced with a request-id counter instead of a
 *    boolean flag consumed and reset inside an effect.
 *  - D4: nearbyStations clearing — moved out of a `useEffect([tripPlan])`
 *    into the handlers that set tripPlan.
 *
 * Map, MapLocateButton and EVi are stubbed so the test can both read and
 * drive the exact props page.tsx passes them, without pulling in Leaflet or
 * the full eVi chat hook stack.
 */

const CUSTOM_VEHICLE = JSON.stringify({
  brand: 'VinFast',
  model: 'VF 8',
  batteryCapacityKwh: 87.7,
  officialRangeKm: 471,
});

function openPlanTab() {
  localStorage.setItem('ev-desktop-tab', 'planTrip');
}

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: unknown }>) => {
    let Component: React.ComponentType<Record<string, unknown>> | null = null;
    loader().then((mod) => { Component = mod.default as React.ComponentType<Record<string, unknown>>; });
    return function DynamicMock(props: Record<string, unknown>) {
      if (!Component) return null;
      return <Component {...props} />;
    };
  },
}));

let capturedMapProps: Record<string, unknown> = {};
vi.mock('@/components/map/Map', () => ({
  default: (props: Record<string, unknown>) => {
    capturedMapProps = props;
    return <div data-testid="mock-map" />;
  },
}));

// No Mapbox token in tests, so MapboxMap never renders. Stubbed anyway: the
// next/dynamic mock above calls every loader at import time, and the real
// module pulls in mapbox-gl, a multi-second cold load that lands in the first test.
vi.mock('@/components/map/MapboxMap', () => ({
  default: () => <div data-testid="mock-mapbox-map" />,
}));

let capturedLocateButtonProps: Record<string, unknown> = {};
vi.mock('@/components/map/MapLocateButton', () => ({
  default: (props: Record<string, unknown>) => {
    capturedLocateButtonProps = props;
    return (
      <button
        type="button"
        data-testid="mock-locate-button"
        data-geolocation-supported={String(props.geolocationSupported)}
      >
        locate
      </button>
    );
  },
}));

let capturedEViProps: Record<string, unknown> = {};
vi.mock('@/components/EVi', () => ({
  default: (props: Record<string, unknown>) => {
    capturedEViProps = props;
    return <div data-testid="mock-evi" />;
  },
}));

// Keep EVi's sibling chat-entry components out of the way — not under test here.
vi.mock('@/components/trip/EViFab', () => ({ default: () => null }));
vi.mock('@/components/trip/EViMobileSheet', () => ({ default: () => null }));
vi.mock('@/components/trip/EViNudge', () => ({ default: () => null }));
vi.mock('@/components/feedback/FeedbackFAB', () => ({ default: () => null }));

const MOCK_STATIONS = [
  { id: 's1', name: 'Station 1', distanceKm: 1.2 } as unknown as Record<string, unknown>,
];

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

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/route')) {
      return Promise.resolve(new Response(JSON.stringify(ROUTE_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }
    return Promise.resolve(new Response(JSON.stringify({ vehicles: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
  }));
}

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
  openPlanTab();
  window.history.replaceState(
    null,
    '',
    `/plan?start=A&end=B&cv=${encodeURIComponent(CUSTOM_VEHICLE)}`,
  );
  capturedMapProps = {};
  capturedLocateButtonProps = {};
  capturedEViProps = {};
  stubFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function renderPlanPage(): Promise<ReactNode> {
  render(<PlanPage />);
  await screen.findByTestId('mock-locate-button');
  return null;
}

describe('plan page — effects refactor characterization', () => {
  describe('geolocationSupported', () => {
    it('passes geolocationSupported=true when navigator.geolocation exists', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: vi.fn() },
        configurable: true,
      });

      await renderPlanPage();

      await waitFor(() =>
        expect(capturedLocateButtonProps.geolocationSupported).toBe(true),
      );
    });

    it('passes geolocationSupported=false when navigator.geolocation is absent', async () => {
      const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
      try {
        // @ts-expect-error — deliberately removing geolocation for this test
        delete navigator.geolocation;

        await renderPlanPage();

        await waitFor(() =>
          expect(capturedLocateButtonProps.geolocationSupported).toBe(false),
        );
      } finally {
        if (original) Object.defineProperty(navigator, 'geolocation', original);
      }
    });
  });

  describe('nearby stations clearing', () => {
    it('clears pins when a trip plan loads, and reappear if Locate is used after', async () => {
      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: vi.fn() },
        configurable: true,
      });

      await renderPlanPage();

      const onStationsFound = capturedLocateButtonProps.onStationsFound as
        (stations: unknown) => void;
      act(() => {
        onStationsFound(MOCK_STATIONS);
      });
      await waitFor(() => expect(capturedMapProps.nearbyStations).toEqual(MOCK_STATIONS));

      const calculate = await screen.findByRole('button', { name: 'Tính lộ trình' });
      fireEvent.click(calculate);

      await waitFor(() => expect(capturedMapProps.tripPlan).not.toBeNull());
      // Trip plan loaded — pins clear.
      expect(capturedMapProps.nearbyStations).toBeNull();

      // Locate again — pins come back even though a trip plan is active.
      act(() => {
        onStationsFound(MOCK_STATIONS);
      });
      await waitFor(() => expect(capturedMapProps.nearbyStations).toEqual(MOCK_STATIONS));
    }, 20000);
  });

  describe('eVi auto-plan', () => {
    it('onPlanTrip fills the form and auto-plans with the just-filled params', async () => {
      await renderPlanPage();

      const onPlanTrip = capturedEViProps.onPlanTrip as (params: unknown) => void;
      act(() => {
        onPlanTrip({
          start: 'Hanoi',
          startLat: 21.0,
          startLng: 105.8,
          end: 'Da Nang',
          endLat: 16.0,
          endLng: 108.2,
          vehicleId: null,
          vehicleName: null,
          vehicleData: null,
          currentBattery: 70,
          minArrival: 15,
          rangeSafetyFactor: 0.8,
        });
      });

      await waitFor(() => expect(capturedMapProps.tripPlan).not.toBeNull());

      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      const routeCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/api/route'),
      );
      expect(routeCall).toBeDefined();
      const body = JSON.parse((routeCall![1] as RequestInit).body as string);
      expect(body.start).toBe('Hanoi');
      expect(body.end).toBe('Da Nang');
    }, 20000);
  });

  describe('shared-link recipient (URL restore)', () => {
    function routeCalls() {
      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      return fetchMock.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('/api/route'),
      );
    }

    // BUG(p2-sharing-flow): opening a shared /plan?… link restores the form but never plans the trip. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-sharing-flow.md
    it.fails('auto-plans a shared link with start/end coords and a custom vehicle, without pressing Plan', async () => {
      window.history.replaceState(
        null,
        '',
        `/plan?start=Ho%20Chi%20Minh&end=Vung%20Tau&slat=10.7769&slng=106.7009&elat=10.346&elng=107.0843&cv=${encodeURIComponent(CUSTOM_VEHICLE)}`,
      );

      await renderPlanPage();

      await waitFor(() => expect(routeCalls().length).toBeGreaterThan(0), { timeout: 3000 });
      const body = JSON.parse((routeCalls()[0][1] as RequestInit).body as string);
      expect(body.start).toBe('Ho Chi Minh');
      expect(body.end).toBe('Vung Tau');
    }, 20000);

    // BUG(p2-sharing-flow): a shared link with a preset vehicle (vid=…) never plans the trip after the vehicle fetch resolves. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-sharing-flow.md
    it.fails('auto-plans a shared link with a preset vehicle id once the vehicle fetch resolves', async () => {
      const VEHICLE = {
        id: 'veh-1',
        brand: 'VinFast',
        model: 'VF 8',
        variant: 'Plus',
        batteryCapacityKwh: 87.7,
        usableBatteryKwh: 82,
        officialRangeKm: 471,
        efficiencyWhPerKm: 180,
        chargingTimeDC_10to80_min: 31,
        chargingPortType: 'CCS2',
      };
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/route')) {
          return Promise.resolve(new Response(JSON.stringify(ROUTE_RESPONSE), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }));
        }
        if (typeof url === 'string' && url.includes('/api/vehicles?id=')) {
          return Promise.resolve(new Response(JSON.stringify(VEHICLE), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }));
        }
        return Promise.resolve(new Response(JSON.stringify({ vehicles: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }));
      window.history.replaceState(
        null,
        '',
        '/plan?start=Ho%20Chi%20Minh&end=Vung%20Tau&slat=10.7769&slng=106.7009&elat=10.346&elng=107.0843&vid=veh-1',
      );

      await renderPlanPage();

      await waitFor(() => expect(routeCalls().length).toBeGreaterThan(0), { timeout: 3000 });
      const body = JSON.parse((routeCalls()[0][1] as RequestInit).body as string);
      expect(body.vehicleId).toBe('veh-1');
    }, 20000);
  });
});
