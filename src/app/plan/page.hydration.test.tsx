// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';

/**
 * Hydration safety for the URL/localStorage restore (react-hooks compiler
 * refactor of page.tsx:201-271). The old code ran the restore inside a
 * `useEffect(() => { ... }, [])`, which never executes during
 * `renderToString` — so the server HTML always showed empty inputs
 * regardless of the URL. The refactor replaces that effect with a
 * `useSyncExternalStore` "isClient" flag + a render-time one-shot state
 * adjustment. This test proves the same contract still holds: the server
 * (and first client) render must NOT reflect the URL, and the restored
 * values must appear only after hydration, with no mismatch warning.
 */

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
  window.history.replaceState(null, '', '/plan?start=Hanoi&end=Saigon');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ vehicles: [] }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('plan page — URL restore hydration safety', () => {
  it('server HTML has no restored values; hydration settles to the URL values with no mismatch warning', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const PlanPage = (await import('./page')).default;

    const html = renderToString(<PlanPage />);
    // SSR never ran the restore — inputs must not contain the URL values.
    expect(html).not.toContain('Hanoi');
    expect(html).not.toContain('Saigon');

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;

    await act(async () => {
      hydrateRoot(container, <PlanPage />);
      // Flush the microtask(s) React's useSyncExternalStore hydration check
      // schedules before the post-hydration render settles.
      await Promise.resolve();
      await Promise.resolve();
    });

    const hydrationMismatchLogged = errorSpy.mock.calls.some((call) =>
      call.some(
        (arg) => typeof arg === 'string' && /hydrat|did not match|text content/i.test(arg),
      ),
    );
    expect(hydrationMismatchLogged).toBe(false);

    expect(container.querySelector('input[value="Hanoi"]')).not.toBeNull();
    expect(container.querySelector('input[value="Saigon"]')).not.toBeNull();

    document.body.removeChild(container);
    errorSpy.mockRestore();
  }, 20000);
});
