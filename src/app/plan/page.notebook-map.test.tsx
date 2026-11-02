// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

/**
 * Regression tests for docs/bugs/2026-11-01-p2-planner-ui-state-and-map.md.
 * Same harness shape as page.effects.test.tsx: the maps, MapLocateButton and
 * EVi are stubbed so the test can read and drive the props page.tsx passes.
 * Only external I/O (fetch) is mocked; the notebook store runs for real on
 * jsdom localStorage.
 */

const CUSTOM_VEHICLE = {
  brand: 'VinFast',
  model: 'VF 8',
  batteryCapacityKwh: 87.7,
  officialRangeKm: 471,
};

const NOTEBOOK_KEY = 'evoyage-notebook-v1';

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

let capturedLeafletProps: Record<string, unknown> = {};
vi.mock('@/components/map/Map', () => ({
  default: (props: Record<string, unknown>) => {
    capturedLeafletProps = props;
    return <div data-testid="mock-leaflet-map" />;
  },
}));

let capturedMapboxProps: Record<string, unknown> = {};
vi.mock('@/components/map/MapboxMap', () => ({
  default: (props: Record<string, unknown>) => {
    capturedMapboxProps = props;
    return <div data-testid="mock-mapbox-map" />;
  },
}));

let capturedLocateButtonProps: Record<string, unknown> = {};
vi.mock('@/components/map/MapLocateButton', () => ({
  default: (props: Record<string, unknown>) => {
    capturedLocateButtonProps = props;
    return <button type="button" data-testid="mock-locate-button">locate</button>;
  },
}));

let capturedEViProps: Record<string, unknown> = {};
vi.mock('@/components/EVi', () => ({
  default: (props: Record<string, unknown>) => {
    capturedEViProps = props;
    return <div data-testid="mock-evi" />;
  },
}));

vi.mock('@/components/trip/EViFab', () => ({ default: () => null }));
vi.mock('@/components/trip/EViMobileSheet', () => ({ default: () => null }));
vi.mock('@/components/trip/EViNudge', () => ({ default: () => null }));
vi.mock('@/components/feedback/FeedbackFAB', () => ({ default: () => null }));

function routeResponse(startAddress: string, endAddress: string, tripId: string) {
  return {
    tripId,
    startAddress,
    endAddress,
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
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function savedTrip(overrides: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    id: 'saved-1',
    start: 'SavedStart',
    end: 'SavedEnd',
    waypoints: [],
    isLoopTrip: false,
    vehicleId: null,
    customVehicle: CUSTOM_VEHICLE,
    currentBattery: 80,
    minArrival: 15,
    rangeSafetyFactor: 0.8,
    departAt: null,
    savedAt: now,
    lastViewedAt: now,
    pinned: false,
    dismissedPrecautionaryStops: [],
    ...overrides,
  };
}

function seedNotebook(entries: readonly Record<string, unknown>[]) {
  localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(entries));
}

function readNotebook(): Array<{ id: string; start: string; end: string }> {
  return JSON.parse(localStorage.getItem(NOTEBOOK_KEY) ?? '[]');
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
  capturedLeafletProps = {};
  capturedMapboxProps = {};
  capturedLocateButtonProps = {};
  capturedEViProps = {};
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

async function renderPlanPage() {
  const PlanPage = (await import('./page')).default;
  render(<PlanPage />);
  await screen.findByTestId('mock-locate-button');
}

describe('plan page — notebook re-plan attribution', () => {
  // BUG(p2-planner-ui-state-and-map): Re-plan pressed during an in-flight calc leaks planningNotebookEntryIdRef into the next unrelated plan, so that plan is never saved. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p2-planner-ui-state-and-map.md
  it.fails('saves the next unrelated plan as a new notebook entry after a re-plan was swallowed by an in-flight calc', async () => {
    localStorage.setItem('ev-desktop-tab', 'planTrip');
    window.history.replaceState(
      null,
      '',
      `/plan?start=A&end=B&cv=${encodeURIComponent(JSON.stringify(CUSTOM_VEHICLE))}`,
    );
    seedNotebook([savedTrip({})]);

    let releaseFirstRoute: (() => void) | null = null;
    let routeCalls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/api/route') {
        routeCalls += 1;
        if (routeCalls === 1) {
          return new Promise<Response>((resolve) => {
            releaseFirstRoute = () => resolve(jsonResponse(routeResponse('A', 'B', 'trip-ab')));
          });
        }
        return Promise.resolve(jsonResponse(routeResponse('Hanoi', 'Da Nang', 'trip-hn-dn')));
      }
      return Promise.resolve(jsonResponse({ vehicles: [] }));
    }));

    await renderPlanPage();

    // 1. Start a plan for A -> B and keep it in flight.
    fireEvent.click(await screen.findByRole('button', { name: 'Tính lộ trình' }));
    await waitFor(() => expect(routeCalls).toBe(1));

    // 2. While it is in flight, open the notebook and press Re-plan.
    fireEvent.click(screen.getByRole('tab', { name: 'Đã lưu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mở lại' }));
    // The auto-plan for the saved trip is swallowed by `if (planAbortRef.current) return;`.
    await act(async () => { await Promise.resolve(); });
    expect(routeCalls).toBe(1);

    // 3. The in-flight plan lands.
    await act(async () => { releaseFirstRoute!(); });
    await waitFor(() => expect(capturedLeafletProps.tripPlan).not.toBeNull());

    // 4. The user plans a brand-new, unrelated trip.
    const onPlanTrip = capturedEViProps.onPlanTrip as (params: unknown) => void;
    act(() => {
      onPlanTrip({
        start: 'Hanoi', startLat: 21.0, startLng: 105.8,
        end: 'Da Nang', endLat: 16.0, endLng: 108.2,
        vehicleId: null, vehicleName: null, vehicleData: null,
        currentBattery: 70, minArrival: 15, rangeSafetyFactor: 0.8,
      });
    });
    await waitFor(() => expect(routeCalls).toBe(2));
    await waitFor(() =>
      expect((capturedLeafletProps.tripPlan as { tripId?: string } | null)?.tripId).toBe('trip-hn-dn'),
    );

    // Correct behaviour: the new trip is saved as its own notebook entry.
    // Bug: notebook.touch('saved-1') runs instead of save(), so no Hanoi entry exists.
    await waitFor(() =>
      expect(readNotebook().some((entry) => entry.start === 'Hanoi' && entry.end === 'Da Nang')).toBe(true),
    );
  }, 20000);
});

describe('plan page — notebook vehicle label', () => {
  // BUG(p2-planner-ui-state-and-map): resolveVehicleName only knows the currently selected vehicle, so catalogue trips show 'Xe không còn trong eVoyage' on a fresh visit. See docs/bugs/2026-11-01-p2-planner-ui-state-and-map.md
  it('does not label a catalogue-vehicle trip as missing when no vehicle is selected on a fresh visit', async () => {
    localStorage.setItem('ev-desktop-tab', 'notebook');
    window.history.replaceState(null, '', '/plan');
    seedNotebook([savedTrip({ vehicleId: 'vinfast-vf-8', customVehicle: null })]);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({
        vehicles: [],
        id: 'vinfast-vf-8', brand: 'VinFast', model: 'VF 8',
      })),
    ));

    await renderPlanPage();
    await screen.findByRole('button', { name: 'Mở lại' });

    await waitFor(() =>
      expect(screen.queryByText('Xe không còn trong eVoyage')).not.toBeInTheDocument(),
    );
  }, 20000);

  // BUG(p2-planner-ui-state-and-map): custom-vehicle trips are labelled with the CURRENT custom vehicle, not trip.customVehicle. See docs/bugs/2026-11-01-p2-planner-ui-state-and-map.md
  it('labels a custom-vehicle trip with the vehicle saved on the trip, not the current custom vehicle', async () => {
    localStorage.setItem('ev-desktop-tab', 'notebook');
    // Current custom vehicle (restored from the URL) is a VinFast VF 8 ...
    window.history.replaceState(
      null,
      '',
      `/plan?cv=${encodeURIComponent(JSON.stringify(CUSTOM_VEHICLE))}`,
    );
    // ... but the saved trip was planned with a different custom car.
    seedNotebook([savedTrip({
      vehicleId: null,
      customVehicle: { brand: 'Tesla', model: 'Model 3', batteryCapacityKwh: 60, officialRangeKm: 430 },
    })]);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ vehicles: [] }))));

    await renderPlanPage();
    await screen.findByRole('button', { name: 'Mở lại' });

    await waitFor(() => expect(screen.getByText('Tesla Model 3')).toBeInTheDocument());
  }, 20000);
});

describe('plan page — notebook vehicle label (stored name)', () => {
  it('labels a catalogue-vehicle trip with the vehicle name saved on the trip', async () => {
    localStorage.setItem('ev-desktop-tab', 'notebook');
    window.history.replaceState(null, '', '/plan');
    seedNotebook([savedTrip({ vehicleId: 'vinfast-vf-9', vehicleName: 'VinFast VF 9', customVehicle: null })]);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ vehicles: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await renderPlanPage();
    await screen.findByRole('button', { name: 'Mở lại' });

    expect(screen.getByText('VinFast VF 9')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/vehicles?id='));
  }, 20000);
});

describe('plan page — locate button on the Mapbox map', () => {
  // BUG(p2-planner-ui-state-and-map): nearbyStations / userLocation are only passed to the Leaflet map; MapboxMap (forced default in prod) never receives them. See docs/bugs/2026-11-01-p2-planner-ui-state-and-map.md
  it('passes nearby stations from the locate button to the Mapbox map', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'pk.test-token');
    localStorage.setItem('ev-desktop-tab', 'planTrip');
    window.history.replaceState(null, '', '/plan');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ vehicles: [] }))));

    await renderPlanPage();
    await screen.findByTestId('mock-mapbox-map');

    const stations = [{ id: 's1', name: 'Station 1', distanceKm: 1.2 }];
    const onStationsFound = capturedLocateButtonProps.onStationsFound as (s: unknown) => void;
    act(() => {
      onStationsFound(stations);
    });

    // Correct behaviour: the Mapbox map gets the stations to draw.
    // Bug: MapboxMap is rendered with tripPlan / waypoints / precautionaryStopInteractions only.
    await waitFor(() => expect(capturedMapboxProps.nearbyStations).toEqual(stations));
  }, 20000);
});
