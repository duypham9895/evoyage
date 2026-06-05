// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEVi } from './useEVi';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock navigator.geolocation
const mockGetCurrentPosition = vi.fn();
const mockPermissionsQuery = vi.fn();
Object.defineProperty(navigator, 'geolocation', {
  value: { getCurrentPosition: mockGetCurrentPosition },
  writable: true,
});
Object.defineProperty(navigator, 'permissions', {
  value: { query: mockPermissionsQuery },
  writable: true,
});

function makeSuccessResponse(overrides: Partial<{
  isComplete: boolean;
  isStationSearch: boolean;
  followUpType: 'vehicle_pick' | 'location_input' | 'free_text' | null;
  followUpQuestion: string | null;
  suggestedOptions: readonly { label: string; vehicleId: string | null }[];
  displayMessage: string;
}> = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({
      isComplete: true,
      isStationSearch: false,
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
      ...overrides,
    }),
    text: () => Promise.resolve(''),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockPermissionsQuery.mockReset();
  // By default permissions query rejects so geolocation is skipped
  mockPermissionsQuery.mockRejectedValue(new Error('not supported'));
  localStorage.clear();
});

describe('useEVi', () => {
  describe('initial state', () => {
    it('state is idle', () => {
      const { result } = renderHook(() => useEVi());
      expect(result.current.state).toBe('idle');
    });

    it('messages is empty', () => {
      const { result } = renderHook(() => useEVi());
      expect(result.current.messages).toHaveLength(0);
    });

    it('lastResponse is null', () => {
      const { result } = renderHook(() => useEVi());
      expect(result.current.lastResponse).toBeNull();
    });

    it('isFirstVisit is true by default', () => {
      const { result } = renderHook(() => useEVi());
      expect(result.current.isFirstVisit).toBe(true);
    });

    it('isFirstVisit is false when localStorage has evi-first-visit = done', () => {
      localStorage.setItem('evi-first-visit', 'done');
      const { result } = renderHook(() => useEVi());
      expect(result.current.isFirstVisit).toBe(false);
    });

    it('followUpSuggestions is empty initially', () => {
      const { result } = renderHook(() => useEVi());
      expect(result.current.followUpSuggestions).toEqual([]);
    });

    it('isSuggestionsLoading is false initially', () => {
      const { result } = renderHook(() => useEVi());
      expect(result.current.isSuggestionsLoading).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('sets state to processing then complete on success', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse());

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.state).toBe('complete');
    });

    it('adds user message and assistant message to messages array', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({ displayMessage: 'HCM → Đà Lạt' }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0]).toEqual({ role: 'user', content: 'Đi từ HCM đến Đà Lạt' });
      expect(result.current.messages[1]).toEqual({ role: 'assistant', content: 'HCM → Đà Lạt' });
    });

    it('sets state to error when fetch response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      expect(result.current.state).toBe('error');
    });

    it('sets state to error on fetch network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      expect(result.current.state).toBe('error');
    });

    it('sets state to follow_up when response.isComplete is false', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({
        isComplete: false,
        followUpType: 'free_text',
        followUpQuestion: 'Bạn đi xe gì?',
      }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.state).toBe('follow_up');
    });

    it('uses followUpQuestion as assistant message content when present', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({
        isComplete: false,
        followUpType: 'free_text',
        followUpQuestion: 'Bạn đi xe gì?',
        displayMessage: 'HCM → Đà Lạt',
      }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.messages[1].content).toBe('Bạn đi xe gì?');
    });

    it('sets localStorage evi-first-visit to done on first successful complete', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({ isComplete: true }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(localStorage.getItem('evi-first-visit')).toBe('done');
    });

    it('sets lastResponse on success', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse());

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.lastResponse).not.toBeNull();
      expect(result.current.lastResponse?.isComplete).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears messages and sets state to idle', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse());

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.messages).toHaveLength(2);

      act(() => {
        result.current.reset();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.state).toBe('idle');
    });

    it('clears lastResponse', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse());

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.lastResponse).not.toBeNull();

      act(() => {
        result.current.reset();
      });

      expect(result.current.lastResponse).toBeNull();
    });

    it('keeps followUpSuggestions empty after resetting a required prompt', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({
        isComplete: false,
        followUpType: 'vehicle_pick',
        followUpQuestion: 'Bạn đi xe gì?',
        suggestedOptions: [{ label: 'VinFast VF 8 Plus', vehicleId: 'vf8-plus' }],
      }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.followUpSuggestions).toEqual([]);

      act(() => {
        result.current.reset();
      });

      expect(result.current.followUpSuggestions).toEqual([]);
      expect(result.current.isSuggestionsLoading).toBe(false);
    });
  });

  describe('followUpSuggestions', () => {
    it('does not fetch suggestions during vehicle_pick follow-up state', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({
        isComplete: false,
        followUpType: 'vehicle_pick',
        followUpQuestion: 'Bạn đi xe gì?',
        suggestedOptions: [{ label: 'VinFast VF 8 Plus', vehicleId: 'vf8-plus' }],
      }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.state).toBe('follow_up');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.followUpSuggestions).toEqual([]);
      expect(result.current.isSuggestionsLoading).toBe(false);
    });

    it('does not fetch suggestions after complete state', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({ isComplete: true }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt VF8 pin 80');
      });

      expect(result.current.state).toBe('complete');
      // Only the parse endpoint should have been called, not suggestions
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.followUpSuggestions).toEqual([]);
    });

    it('keeps suggestions cleared when sending a vehicle answer', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({
        isComplete: false,
        followUpType: 'vehicle_pick',
        followUpQuestion: 'Bạn đi xe gì?',
        suggestedOptions: [{ label: 'VinFast VF 8 Plus', vehicleId: 'vf8-plus' }],
      }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      mockFetch.mockResolvedValueOnce(makeSuccessResponse({ isComplete: true }));

      await act(async () => {
        await result.current.sendMessage('VF 8 Plus');
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.current.followUpSuggestions).toEqual([]);
    });

    it('does not fetch suggestions during location_input follow-up state', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({
        isComplete: false,
        followUpType: 'location_input',
        followUpQuestion: 'Bạn xuất phát từ đâu?',
      }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.isSuggestionsLoading).toBe(false);
      expect(result.current.followUpSuggestions).toEqual([]);
      expect(result.current.state).toBe('follow_up');
    });

    it('does not fetch suggestions during free_text follow-up state', async () => {
      mockFetch.mockResolvedValueOnce(makeSuccessResponse({
        isComplete: false,
        followUpType: 'free_text',
        followUpQuestion: 'Bạn có thể nói rõ hơn không?',
      }));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.current.isSuggestionsLoading).toBe(false);
      expect(result.current.followUpSuggestions).toEqual([]);
    });
  });
});
