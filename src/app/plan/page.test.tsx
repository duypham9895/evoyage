// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Regression net for the /api/route error path.
 *
 * The handler can return a non-JSON body — a gateway timeout page, or a
 * Next.js 500 raised outside the handler's try/catch. Parsing that body before
 * checking `response.ok` replaced the real failure with a raw
 * "Unexpected token '<' ... is not valid JSON" in the user-facing banner.
 */

const CUSTOM_VEHICLE = JSON.stringify({
  brand: 'VinFast',
  model: 'VF 8',
  batteryCapacityKwh: 87.7,
  officialRangeKm: 471,
});

// The desktop sidebar opens on the eVi tab by default; the plan form lives
// behind the "planTrip" tab, which the hook restores from localStorage.
function openPlanTab() {
  localStorage.setItem('ev-desktop-tab', 'planTrip');
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
  // jsdom implements neither on Element.
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  openPlanTab();
  window.history.replaceState(
    null,
    '',
    `/plan?start=A&end=B&cv=${encodeURIComponent(CUSTOM_VEHICLE)}`,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('plan page — /api/route failure handling', () => {
  it('shows the real failure, not a JSON parse error, when the route API returns a non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('<html>Internal Server Error</html>', {
        status: 500,
        headers: { 'content-type': 'text/html' },
      })),
    ));

    const PlanPage = (await import('./page')).default;
    render(<PlanPage />);

    const calculate = await screen.findByRole('button', { name: 'Tính lộ trình' });
    fireEvent.click(calculate);

    await waitFor(() => {
      expect(screen.getByText('Route calculation failed')).toBeInTheDocument();
    });
    expect(document.body.textContent).not.toContain('is not valid JSON');
  }, 20000);

  it('surfaces the API error message when the route API returns a JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Vehicle not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })),
    ));

    const PlanPage = (await import('./page')).default;
    render(<PlanPage />);

    const calculate = await screen.findByRole('button', { name: 'Tính lộ trình' });
    fireEvent.click(calculate);

    await waitFor(() => {
      expect(screen.getByText('Vehicle not found')).toBeInTheDocument();
    });
  }, 20000);
});
