// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useEffect, useState } from 'react';

/**
 * Regression tests for how src/app/plan/page.tsx hands off from the eVi chat
 * to the trip form / stations tab (bug group p2-evi-conversation-ux).
 *
 * Map, MapLocateButton, EVi and the mobile eVi sheet are stubbed so the test
 * can drive the exact callbacks page.tsx passes them. The EVi stub keeps a
 * piece of local state, standing in for the conversation that the real EVi
 * keeps in useEVi's useState.
 */

const CUSTOM_VEHICLE = JSON.stringify({
  brand: 'VinFast',
  model: 'VF 8',
  batteryCapacityKwh: 87.7,
  officialRangeKm: 471,
});

const TRIP_PARAMS = {
  start: 'Hanoi',
  startLat: 21.0,
  startLng: 105.8,
  startSource: 'geolocation',
  end: 'Da Nang',
  endLat: 16.0,
  endLng: 108.2,
  vehicleId: null,
  vehicleName: null,
  vehicleData: null,
  currentBattery: 70,
  minArrival: 15,
  rangeSafetyFactor: 0.8,
};

// onPlanTrip auto-plans, so /api/route must answer with a well-formed plan.
const ROUTE_RESPONSE = {
  tripId: 'trip-1',
  startAddress: 'Hanoi',
  endAddress: 'Da Nang',
  startCoord: { lat: 21.0, lng: 105.8 },
  endCoord: { lat: 16.0, lng: 108.2 },
  polyline: 'poly',
  totalDistanceKm: 760,
  totalDurationMin: 600,
  chargingStops: [],
  warnings: [],
  batterySegments: [],
  arrivalBatteryPercent: 50,
  totalChargingTimeMin: 0,
};

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

vi.mock('@/components/map/Map', () => ({
  default: () => <div data-testid="mock-map" />,
}));

vi.mock('@/components/map/MapLocateButton', () => ({
  default: () => <button type="button" data-testid="mock-locate-button">locate</button>,
}));

// Receives EVi's latest props after each commit (assigning a module variable
// during render breaks react-hooks rules).
const eviPropsSpy = vi.fn<(props: Record<string, unknown>) => void>();
function lastEViProps(): Record<string, unknown> {
  const call = eviPropsSpy.mock.lastCall;
  if (!call) throw new Error('EVi was never rendered');
  return call[0];
}
function MockEVi(props: Record<string, unknown>) {
  useEffect(() => {
    eviPropsSpy(props);
  });
  const [draft, setDraft] = useState('');
  return (
    <input
      data-testid="mock-evi-conversation"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}
vi.mock('@/components/EVi', () => ({ default: MockEVi }));

let capturedSheetProps: Record<string, unknown> = {};
vi.mock('@/components/trip/EViMobileSheet', () => ({
  default: (props: Record<string, unknown>) => {
    capturedSheetProps = props;
    return <div data-testid="mock-evi-sheet" data-open={String(props.isOpen)} />;
  },
}));

vi.mock('@/components/trip/EViFab', () => ({
  default: (props: { onOpen: () => void }) => (
    <button type="button" data-testid="mock-evi-fab" onClick={props.onOpen}>eVi</button>
  ),
}));
vi.mock('@/components/trip/EViNudge', () => ({ default: () => null }));
vi.mock('@/components/feedback/FeedbackFAB', () => ({ default: () => null }));

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', `/plan?cv=${encodeURIComponent(CUSTOM_VEHICLE)}`);
  eviPropsSpy.mockReset();
  capturedSheetProps = {};
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const body = typeof url === 'string' && url.includes('/api/route') ? ROUTE_RESPONSE : { vehicles: [] };
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

async function renderPlanPage() {
  const PlanPage = (await import('./page')).default;
  render(<PlanPage />);
}

describe('plan page — mobile eVi sheet handoff', () => {
  async function openMobileSheet() {
    setViewport(true);
    await renderPlanPage();
    fireEvent.click(await screen.findByTestId('mock-evi-fab'));
    await waitFor(() =>
      expect(screen.getByTestId('mock-evi-sheet')).toHaveAttribute('data-open', 'true'),
    );
  }

  // BUG(p2-evi-conversation-ux): mobile "Edit" fills the form behind the still-open full-screen eVi sheet. See docs/bugs/2026-11-01-p2-evi-conversation-ux.md
  it('closes the eVi sheet when the user taps Edit (onTripParsed)', async () => {
    await openMobileSheet();

    const onTripParsed = capturedSheetProps.onTripParsed as (params: unknown) => void;
    act(() => {
      onTripParsed(TRIP_PARAMS);
    });

    await waitFor(() =>
      expect(screen.getByTestId('mock-evi-sheet')).toHaveAttribute('data-open', 'false'),
    );
  }, 20000);

  // BUG(p2-evi-conversation-ux): mobile "Find stations nearby" switches tabs behind the still-open full-screen eVi sheet. See docs/bugs/2026-11-01-p2-evi-conversation-ux.md
  it('closes the eVi sheet when the user taps Find stations nearby', async () => {
    await openMobileSheet();

    const onFindNearbyStations = capturedSheetProps.onFindNearbyStations as () => void;
    act(() => {
      onFindNearbyStations();
    });

    await waitFor(() =>
      expect(screen.getByTestId('mock-evi-sheet')).toHaveAttribute('data-open', 'false'),
    );
  }, 20000);

  it('control: Plan trip (onPlanTrip) already closes the eVi sheet', async () => {
    await openMobileSheet();

    const onPlanTrip = capturedSheetProps.onPlanTrip as (params: unknown) => void;
    act(() => {
      onPlanTrip(TRIP_PARAMS);
    });

    await waitFor(() =>
      expect(screen.getByTestId('mock-evi-sheet')).toHaveAttribute('data-open', 'false'),
    );
  }, 20000);
});

describe('plan page — desktop eVi conversation survives tab switches', () => {
  async function startDesktopConversation() {
    setViewport(false);
    localStorage.setItem('ev-desktop-tab', 'evi');
    await renderPlanPage();
    const conversation = await screen.findByTestId('mock-evi-conversation');
    fireEvent.change(conversation, { target: { value: 'Đi Đà Nẵng bằng VF 8' } });
    expect(screen.getByTestId('mock-evi-conversation')).toHaveValue('Đi Đà Nẵng bằng VF 8');
  }

  async function returnToEViTab() {
    // eVi's own CTA moved the sidebar to the Plan Trip tab.
    await waitFor(() =>
      expect(document.getElementById('desktop-tab-planTrip')).toHaveAttribute('aria-selected', 'true'),
    );
    fireEvent.click(document.getElementById('desktop-tab-evi')!);
    await waitFor(() =>
      expect(document.getElementById('desktop-tab-evi')).toHaveAttribute('aria-selected', 'true'),
    );
    await screen.findByTestId('mock-evi-conversation');
  }

  // BUG(p2-evi-conversation-ux): desktop eVi "Plan trip" switches the sidebar tab and unmounts EVi, wiping the chat. See docs/bugs/2026-11-01-p2-evi-conversation-ux.md
  it('keeps the eVi conversation after Plan trip and returning to the eVi tab', async () => {
    await startDesktopConversation();

    const onPlanTrip = lastEViProps().onPlanTrip as (params: unknown) => void;
    act(() => {
      onPlanTrip(TRIP_PARAMS);
    });
    await returnToEViTab();

    expect(screen.getByTestId('mock-evi-conversation')).toHaveValue('Đi Đà Nẵng bằng VF 8');
  }, 20000);

  // BUG(p2-evi-conversation-ux): desktop eVi "Edit" switches the sidebar tab and unmounts EVi, wiping the chat. See docs/bugs/2026-11-01-p2-evi-conversation-ux.md
  it('keeps the eVi conversation after Edit and returning to the eVi tab', async () => {
    await startDesktopConversation();

    const onTripParsed = lastEViProps().onTripParsed as (params: unknown) => void;
    act(() => {
      onTripParsed(TRIP_PARAMS);
    });
    await returnToEViTab();

    expect(screen.getByTestId('mock-evi-conversation')).toHaveValue('Đi Đà Nẵng bằng VF 8');
  }, 20000);
});
