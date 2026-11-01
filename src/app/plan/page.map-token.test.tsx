// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

/**
 * Map-mode selection on /plan depends on NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
 * which Next.js inlines at build time. When `vercel pull` cannot read a
 * Sensitive variable it writes the literal placeholder "[SENSITIVE]", which
 * then ships in the client bundle. page.tsx must treat that (or any value that
 * is not a Mapbox public `pk.` token) as "no token" and fall back to the
 * OSM/Leaflet map instead of rendering a Mapbox map that 401s.
 *
 * Both map components are stubbed so the test reads only which one page.tsx
 * chose to render.
 */

const CUSTOM_VEHICLE = JSON.stringify({
  brand: 'VinFast',
  model: 'VF 8',
  batteryCapacityKwh: 87.7,
  officialRangeKm: 471,
});

// Re-render once the dynamic import resolves, so the test does not depend on
// some unrelated state change happening after the module loads.
vi.mock('next/dynamic', async () => {
  const { useEffect, useState } = await import('react');
  return {
    default: (loader: () => Promise<{ default: unknown }>) => {
      let Component: React.ComponentType<Record<string, unknown>> | null = null;
      const ready = loader().then((mod) => {
        Component = mod.default as React.ComponentType<Record<string, unknown>>;
      });
      return function DynamicMock(props: Record<string, unknown>) {
        const [, setLoaded] = useState(false);
        useEffect(() => {
          let alive = true;
          ready.then(() => { if (alive) setLoaded(true); });
          return () => { alive = false; };
        }, []);
        if (!Component) return null;
        return <Component {...props} />;
      };
    },
  };
});

vi.mock('@/components/map/Map', () => ({
  default: () => <div data-testid="osm-map" />,
}));

vi.mock('@/components/map/MapboxMap', () => ({
  default: () => <div data-testid="mapbox-map" />,
}));

vi.mock('@/components/EVi', () => ({ default: () => null }));
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
  localStorage.setItem('ev-desktop-tab', 'planTrip');
  window.history.replaceState(
    null,
    '',
    `/plan?start=A&end=B&cv=${encodeURIComponent(CUSTOM_VEHICLE)}`,
  );
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ vehicles: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })),
  ));
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
}

describe('plan page — map mode follows the Mapbox token', () => {
  it('renders the Mapbox map when the token is a real public pk. token', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', 'pk.test-public-token');

    await renderPlanPage();

    expect((await screen.findAllByTestId('mapbox-map')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('osm-map')).not.toBeInTheDocument();
  }, 20000);

  it('falls back to the OSM map when the token is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', '');

    await renderPlanPage();

    expect((await screen.findAllByTestId('osm-map')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('mapbox-map')).not.toBeInTheDocument();
  }, 20000);

  // BUG(p0-mapbox-token-sensitive-placeholder): "[SENSITIVE]" placeholder is truthy, so page.tsx picks Mapbox and the map is blank. Fixer: change it.fails -> it once fixed. See docs/bugs/2026-11-01-p0-mapbox-token-sensitive-placeholder.md
  it.fails('falls back to the OSM map when the token is the "[SENSITIVE]" vercel-pull placeholder', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN', '[SENSITIVE]');

    await renderPlanPage();

    expect((await screen.findAllByTestId('osm-map')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('mapbox-map')).not.toBeInTheDocument();
  }, 20000);
});
