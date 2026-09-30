// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from './useIsMobile';

type ChangeListener = (event: MediaQueryListEvent) => void;

/** Minimal matchMedia stub whose `matches` can be flipped like a real viewport resize. */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>();
  let matches = initialMatches;

  const mql = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    },
  };

  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn(() => mql),
    writable: true,
    configurable: true,
  });

  return {
    setMatches(next: boolean) {
      matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
    listenerCount: () => listeners.size,
  };
}

describe('useIsMobile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports mobile on the very first render, with no desktop-first pass', () => {
    stubMatchMedia(true);
    const seen: boolean[] = [];

    renderHook(() => {
      const isMobile = useIsMobile();
      seen.push(isMobile);
      return isMobile;
    });

    // More than one entry means every mobile visitor renders the desktop
    // layout first and is then corrected — the cascading render this guards.
    expect(seen).toEqual([true]);
  });

  it('reports desktop when the media query does not match', () => {
    stubMatchMedia(false);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('updates when the viewport crosses the breakpoint in both directions', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());

    act(() => {
      media.setMatches(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      media.setMatches(false);
    });
    expect(result.current).toBe(false);
  });

  it('unsubscribes from the media query on unmount', () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useIsMobile());

    expect(media.listenerCount()).toBe(1);

    unmount();

    expect(media.listenerCount()).toBe(0);
  });

  it('queries the lg breakpoint (max-width: 1023px)', () => {
    stubMatchMedia(true);

    renderHook(() => useIsMobile());

    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 1023px)');
  });
});
