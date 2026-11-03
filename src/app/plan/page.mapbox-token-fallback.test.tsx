// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PlanPage from './page';

/**
 * Regression test for issue #100 — production inlined a redaction
 * placeholder (`[SENSITIVE]`) as NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN. It is
 * non-empty, so the old `Boolean(token)` check in page.tsx treated it as a
 * real token and never fell back to the OSM/Leaflet map, leaving the map
 * pane blank in production.
 */

function openPlanTab() {
  localStorage.setItem('ev-desktop-tab', 'planTrip');
}

// Resolves the dynamic import into React state (not a plain closure
// variable) so the mocked component reliably re-renders once the loader
// promise settles, instead of depending on an unrelated state update
// elsewhere in the tree to happen to re-invoke it.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: unknown }>) => {
    return function DynamicMock(props: Record<string, unknown>) {
      const [Component, setComponent] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
      useEffect(() => {
        let mounted = true;
        loader().then((mod) => {
          if (mounted) setComponent(() => mod.default as React.ComponentType<Record<string, unknown>>);
        });
        return () => { mounted = false; };
      }, []);
      if (!Component) return null;
      return <Component {...props} />;
    };
  },
}));

vi.mock('@/components/map/Map', () => ({
  default: () => <div data-testid="mock-leaflet-map" />,
}));

vi.mock('@/components/map/MapboxMap', () => ({
  default: () => <div data-testid="mock-mapbox-map" />,
}));

vi.mock('@/components/map/MapLocateButton', () => ({
  default: () => <button type="button" data-testid="mock-locate-button">locate</button>,
}));

vi.mock('@/components/EVi', () => ({ default: () => <div data-testid="mock-evi" /> }));
vi.mock('@/components/trip/EViFab', () => ({ default: () => null }));
vi.mock('@/components/trip/EViMobileSheet', () => ({ default: () => null }));
vi.mock('@/components/trip/EViNudge', () => ({ default: () => null }));
vi.mock('@/components/feedback/FeedbackFAB', () => ({ default: () => null }));

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
  window.history.replaceState(null, '', '/plan');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  vi.unstubAllEnvs();
});

// page.tsx reads NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN while rendering, not at module
// load, so one import serves every test: each test stubs the env, then renders.
describe('plan page — Mapbox token fallback (issue #100)', () => {
  it('renders the Leaflet/OSM map, not Mapbox, when the token is a redaction placeholder', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', '[SENSITIVE]');
    render(<PlanPage />);

    expect(await screen.findByTestId('mock-leaflet-map')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-mapbox-map')).not.toBeInTheDocument();
  }, 20000);

  it('renders the Leaflet/OSM map when the token is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', '');
    render(<PlanPage />);

    expect(await screen.findByTestId('mock-leaflet-map')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-mapbox-map')).not.toBeInTheDocument();
  }, 20000);

  it('renders the Mapbox map when the token is a well-formed pk. token', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'pk.real-token');
    render(<PlanPage />);

    expect(await screen.findByTestId('mock-mapbox-map')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-leaflet-map')).not.toBeInTheDocument();
  }, 20000);
});
