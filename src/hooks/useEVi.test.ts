// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
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

function makeSuggestionsResponse(suggestions: string[] = []) {
  return {
    ok: true,
    json: () => Promise.resolve({ suggestions, error: null }),
  };
}

function makeSuccessResponse(overrides: Partial<{
  isComplete: boolean;
  followUpQuestion: string | null;
  displayMessage: string;
}> = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({
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
      mockFetch
        .mockResolvedValueOnce(makeSuccessResponse({
          isComplete: false,
          followUpQuestion: 'Bạn đi xe gì?',
        }))
        .mockResolvedValueOnce(makeSuggestionsResponse([]));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      expect(result.current.state).toBe('follow_up');
    });

    it('uses followUpQuestion as assistant message content when present', async () => {
      mockFetch
        .mockResolvedValueOnce(makeSuccessResponse({
          isComplete: false,
          followUpQuestion: 'Bạn đi xe gì?',
          displayMessage: 'HCM → Đà Lạt',
        }))
        .mockResolvedValueOnce(makeSuggestionsResponse([]));

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

    it('clears followUpSuggestions', async () => {
      // Set up a follow_up response that triggers suggestions fetch
      mockFetch
        .mockResolvedValueOnce(makeSuccessResponse({
          isComplete: false,
          followUpQuestion: 'Bạn đi xe gì?',
        }))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            suggestions: ['VF 8', 'VF 5', 'VF e34'],
            error: null,
          }),
        });

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      // Wait for suggestions to load
      await waitFor(() => {
        expect(result.current.followUpSuggestions).toEqual(['VF 8', 'VF 5', 'VF e34']);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.followUpSuggestions).toEqual([]);
      expect(result.current.isSuggestionsLoading).toBe(false);
    });
  });

  describe('followUpSuggestions', () => {
    it('fetches suggestions after follow_up state', async () => {
      mockFetch
        .mockResolvedValueOnce(makeSuccessResponse({
          isComplete: false,
          followUpQuestion: 'Bạn đi xe gì?',
        }))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            suggestions: ['VF 8 Plus', 'VF 5 Plus', 'VF e34'],
            error: null,
          }),
        });

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      // Suggestions fetch is async/non-blocking, wait for it
      await waitFor(() => {
        expect(result.current.followUpSuggestions).toEqual(['VF 8 Plus', 'VF 5 Plus', 'VF e34']);
      });
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

    it('clears suggestions when sending a new message', async () => {
      // First message triggers follow_up with suggestions
      mockFetch
        .mockResolvedValueOnce(makeSuccessResponse({
          isComplete: false,
          followUpQuestion: 'Bạn đi xe gì?',
        }))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            suggestions: ['VF 8', 'VF 5', 'VF e34'],
            error: null,
          }),
        });

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      await waitFor(() => {
        expect(result.current.followUpSuggestions.length).toBeGreaterThan(0);
      });

      // Second message should clear suggestions
      mockFetch
        .mockResolvedValueOnce(makeSuccessResponse({ isComplete: true }));

      await act(async () => {
        await result.current.sendMessage('VF 8 Plus');
      });

      expect(result.current.followUpSuggestions).toEqual([]);
    });

    it('handles suggestions fetch failure gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce(makeSuccessResponse({
          isComplete: false,
          followUpQuestion: 'Bạn đi xe gì?',
        }))
        .mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      // Should not throw; suggestions should remain empty
      await waitFor(() => {
        expect(result.current.isSuggestionsLoading).toBe(false);
      });
      expect(result.current.followUpSuggestions).toEqual([]);
      expect(result.current.state).toBe('follow_up');
    });

    it('handles non-ok suggestions response gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce(makeSuccessResponse({
          isComplete: false,
          followUpQuestion: 'Bạn đi xe gì?',
        }))
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ suggestions: [], error: 'rate limited' }),
        });

      const { result } = renderHook(() => useEVi());

      await act(async () => {
        await result.current.sendMessage('Đi từ HCM đến Đà Lạt');
      });

      await waitFor(() => {
        expect(result.current.isSuggestionsLoading).toBe(false);
      });
      expect(result.current.followUpSuggestions).toEqual([]);
    });
  });
});
