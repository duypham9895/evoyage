// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock analytics BEFORE importing the hook so the module picks up the mock.
// trackEviMessage is a no-op outside production, but the mock lets us assert
// that the hook fires it with the expected source label.
const trackEviMessageMock = vi.fn();

vi.mock('@/lib/analytics', () => ({
  trackEviMessage: (source: 'text' | 'voice', tokensUsed?: number) =>
    trackEviMessageMock(source, tokensUsed),
}));

// Mock fetch + geolocation the same way useEVi.test.ts does.
const mockFetch = vi.fn();
global.fetch = mockFetch;

Object.defineProperty(navigator, 'permissions', {
  value: { query: vi.fn().mockRejectedValue(new Error('not supported')) },
  writable: true,
});

import { useEVi } from './useEVi';

function makeSuccessResponse() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        isComplete: true,
        followUpType: null,
        tripParams: {
          start: 'HCM',
          end: 'Đà Lạt',
          startLat: null,
          startLng: null,
          startSource: null,
          endLat: null,
          endLng: null,
          vehicleId: null,
          vehicleName: null,
          vehicleData: null,
          currentBattery: null,
          minArrival: null,
          rangeSafetyFactor: null,
        },
        followUpQuestion: null,
        followUpCount: 0,
        maxFollowUps: 2,
        suggestedOptions: [],
        displayMessage: 'HCM → Đà Lạt',
        error: null,
      }),
    text: () => Promise.resolve(''),
  };
}

beforeEach(() => {
  trackEviMessageMock.mockReset();
  mockFetch.mockReset();
  localStorage.clear();
});

describe('useEVi — trackEviMessage wiring', () => {
  it("fires trackEviMessage('text') when sendMessage is called without a source", async () => {
    mockFetch.mockResolvedValueOnce(makeSuccessResponse());
    const { result } = renderHook(() => useEVi());

    await act(async () => {
      await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
    });

    expect(trackEviMessageMock).toHaveBeenCalledTimes(1);
    expect(trackEviMessageMock).toHaveBeenCalledWith('text', undefined);
  });

  it("fires trackEviMessage('voice') when sendMessage is called with source='voice'", async () => {
    mockFetch.mockResolvedValueOnce(makeSuccessResponse());
    const { result } = renderHook(() => useEVi());

    await act(async () => {
      await result.current.sendMessage('Đi từ HCM đến Đà Lạt', 'voice');
    });

    expect(trackEviMessageMock).toHaveBeenCalledWith('voice', undefined);
  });

  it('still fires telemetry even when the upstream parse fails (capture intent, not outcome)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'service_unavailable' }),
      text: () => Promise.resolve(''),
    });
    const { result } = renderHook(() => useEVi());

    await act(async () => {
      await result.current.sendMessage('test message');
    });

    expect(trackEviMessageMock).toHaveBeenCalledTimes(1);
    expect(trackEviMessageMock).toHaveBeenCalledWith('text', undefined);
  });
});
