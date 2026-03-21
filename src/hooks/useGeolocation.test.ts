// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeolocation } from './useGeolocation';

describe('useGeolocation', () => {
  let mockGetCurrentPosition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with null location and no loading', () => {
    const { result } = renderHook(() => useGeolocation());

    expect(result.current.latitude).toBeNull();
    expect(result.current.longitude).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not request location automatically', () => {
    renderHook(() => useGeolocation());
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });

  it('sets loading to true when requestLocation is called', () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    expect(result.current.loading).toBe(true);
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('updates state with position on success', () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    // Simulate success callback
    const successCallback = mockGetCurrentPosition.mock.calls[0][0];
    act(() => {
      successCallback({
        coords: { latitude: 10.762, longitude: 106.660, accuracy: 50 },
      });
    });

    expect(result.current.latitude).toBe(10.762);
    expect(result.current.longitude).toBe(106.660);
    expect(result.current.accuracy).toBe(50);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets permission_denied error on code 1', () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    const errorCallback = mockGetCurrentPosition.mock.calls[0][1];
    act(() => {
      errorCallback({ code: 1 });
    });

    expect(result.current.error).toBe('permission_denied');
    expect(result.current.loading).toBe(false);
    expect(result.current.latitude).toBeNull();
  });

  it('sets position_unavailable error on code 2', () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    const errorCallback = mockGetCurrentPosition.mock.calls[0][1];
    act(() => {
      errorCallback({ code: 2 });
    });

    expect(result.current.error).toBe('position_unavailable');
  });

  it('sets timeout error on code 3', () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    const errorCallback = mockGetCurrentPosition.mock.calls[0][1];
    act(() => {
      errorCallback({ code: 3 });
    });

    expect(result.current.error).toBe('timeout');
  });

  it('sets not_supported error when geolocation is unavailable', () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    expect(result.current.error).toBe('not_supported');
    expect(result.current.loading).toBe(false);
  });

  it('clears error via clearError', () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    const errorCallback = mockGetCurrentPosition.mock.calls[0][1];
    act(() => {
      errorCallback({ code: 1 });
    });

    expect(result.current.error).toBe('permission_denied');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('prevents concurrent requests', () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
      result.current.requestLocation(); // should be ignored
    });

    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('allows new request after previous completes', () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => {
      result.current.requestLocation();
    });

    // Complete first request
    const successCallback = mockGetCurrentPosition.mock.calls[0][0];
    act(() => {
      successCallback({
        coords: { latitude: 10.0, longitude: 106.0, accuracy: 100 },
      });
    });

    // Should allow second request
    act(() => {
      result.current.requestLocation();
    });

    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(2);
  });
});
