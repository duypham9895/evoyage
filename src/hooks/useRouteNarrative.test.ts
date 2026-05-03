// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRouteNarrative } from './useRouteNarrative';
import type { TripPlan } from '@/types';

// ── Mock fetch ──

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Helpers ──

let testCounter = 0;

function makeTripPlan(overrides?: Partial<TripPlan>): TripPlan {
  testCounter++;
  return {
    totalDistanceKm: 310,
    totalDurationMin: 360,
    chargingStops: [],
    warnings: [],
    batterySegments: [],
    arrivalBatteryPercent: 45,
    totalChargingTimeMin: 0,
    polyline: '',
    startAddress: 'Ho Chi Minh City',
    endAddress: 'Da Lat',
    tripId: `trip-${testCounter}-${Date.now()}`,
    ...overrides,
  };
}

const NARRATIVE_RESPONSE = {
  overview: 'Quick overview of the trip.',
  narrative: 'Full detailed narrative about the trip.',
};

describe('useRouteNarrative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial state when tripPlan is null', () => {
    const { result } = renderHook(() => useRouteNarrative(null));

    expect(result.current.overview).toBeNull();
    expect(result.current.narrative).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches narrative when tripPlan is provided', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(NARRATIVE_RESPONSE),
    });

    const plan = makeTripPlan();
    const { result } = renderHook(() => useRouteNarrative(plan));

    // Should be loading initially
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.overview).toBe(NARRATIVE_RESPONSE.overview);
    expect(result.current.narrative).toBe(NARRATIVE_RESPONSE.narrative);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const plan = makeTripPlan();
    const { result } = renderHook(() => useRouteNarrative(plan));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.overview).toBeNull();
    expect(result.current.narrative).toBeNull();
    expect(result.current.error).toBe('Network error');
  });

  it('handles API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        overview: null,
        narrative: null,
        error: 'AI service unavailable',
      }),
    });

    const plan = makeTripPlan();
    const { result } = renderHook(() => useRouteNarrative(plan));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.overview).toBeNull();
    expect(result.current.error).toBe('AI service unavailable');
  });

  it('caches narrative by tripId in localStorage', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(NARRATIVE_RESPONSE),
    });

    const tripId = `cache-test-${Date.now()}`;
    const plan = makeTripPlan({ tripId });
    const { result } = renderHook(() => useRouteNarrative(plan));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify it was cached
    const stored = localStorage.getItem(`narrative:${tripId}`);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(NARRATIVE_RESPONSE);
  });

  it('uses cached narrative on subsequent renders', async () => {
    const tripId = `cached-trip-${Date.now()}`;
    // Pre-populate localStorage cache
    localStorage.setItem(`narrative:${tripId}`, JSON.stringify(NARRATIVE_RESPONSE));

    const plan = makeTripPlan({ tripId });
    const { result } = renderHook(() => useRouteNarrative(plan));

    // Should use cache immediately without fetching
    await waitFor(() => {
      expect(result.current.overview).toBe(NARRATIVE_RESPONSE.overview);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('resets state when tripPlan becomes null', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(NARRATIVE_RESPONSE),
    });

    const plan = makeTripPlan();
    const { result, rerender } = renderHook(
      ({ tp }: { tp: TripPlan | null }) => useRouteNarrative(tp),
      { initialProps: { tp: plan as TripPlan | null } },
    );

    await waitFor(() => {
      expect(result.current.overview).toBe(NARRATIVE_RESPONSE.overview);
    });

    rerender({ tp: null });

    expect(result.current.overview).toBeNull();
    expect(result.current.narrative).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('sends correct payload to API', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(NARRATIVE_RESPONSE),
    });

    const plan = makeTripPlan({
      chargingStops: [{
        station: {
          id: 's1', name: 'VinFast Test', address: '123 Test St',
          province: 'Test', latitude: 10, longitude: 106,
          chargerTypes: ['DC'], connectorTypes: ['CCS2'],
          portCount: 2, maxPowerKw: 60, stationType: 'public',
          isVinFastOnly: true, operatingHours: '24/7',
          provider: 'vinfast', chargingStatus: 'ACTIVE', parkingFee: false,
        },
        distanceFromStartKm: 150,
        arrivalBatteryPercent: 20,
        departureBatteryPercent: 80,
        estimatedChargingTimeMin: 30,
      }],
    });

    renderHook(() => useRouteNarrative(plan));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/route/narrative');
    const body = JSON.parse(options.body);
    expect(body.startAddress).toBe('Ho Chi Minh City');
    expect(body.endAddress).toBe('Da Lat');
    expect(body.chargingStops).toHaveLength(1);
    expect(body.chargingStops[0].stationName).toBe('VinFast Test');
  });
});
