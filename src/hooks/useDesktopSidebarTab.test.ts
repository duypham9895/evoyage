// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDesktopSidebarTab } from './useDesktopSidebarTab';

// jsdom stub for haptics (uses window.matchMedia)
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockReturnValue({ matches: false }),
  writable: true,
});

describe('useDesktopSidebarTab', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to eVi tab when no localStorage value', () => {
    const { result } = renderHook(() => useDesktopSidebarTab());
    expect(result.current.activeTab).toBe('evi');
  });

  it('restores planTrip tab from localStorage', () => {
    localStorage.setItem('ev-desktop-tab', 'planTrip');
    const { result } = renderHook(() => useDesktopSidebarTab());
    // After useEffect runs, tab should be restored
    expect(result.current.activeTab).toBe('planTrip');
  });

  it('ignores invalid localStorage values and defaults to eVi', () => {
    localStorage.setItem('ev-desktop-tab', 'garbage');
    const { result } = renderHook(() => useDesktopSidebarTab());
    expect(result.current.activeTab).toBe('evi');
  });

  it('persists tab change to localStorage', () => {
    const { result } = renderHook(() => useDesktopSidebarTab());

    act(() => {
      result.current.setTab('planTrip');
    });

    expect(result.current.activeTab).toBe('planTrip');
    expect(localStorage.getItem('ev-desktop-tab')).toBe('planTrip');
  });

  it('switches back to eVi and persists', () => {
    localStorage.setItem('ev-desktop-tab', 'planTrip');
    const { result } = renderHook(() => useDesktopSidebarTab());

    act(() => {
      result.current.setTab('evi');
    });

    expect(result.current.activeTab).toBe('evi');
    expect(localStorage.getItem('ev-desktop-tab')).toBe('evi');
  });

  it('handles localStorage being unavailable', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });

    // Should not throw, should default to evi
    const { result } = renderHook(() => useDesktopSidebarTab());
    expect(result.current.activeTab).toBe('evi');

    getItemSpy.mockRestore();
  });
});
