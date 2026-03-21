// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechRecognition } from './useSpeechRecognition';

function mockSpeechRecognition() {
  const mock = {
    lang: '',
    continuous: false,
    interimResults: false,
    onresult: null as any,
    onerror: null as any,
    onend: null as any,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  };
  const Constructor = vi.fn().mockImplementation(function () {
    return mock;
  });
  (window as any).SpeechRecognition = Constructor;
  return { mock, Constructor };
}

function clearSpeechRecognition() {
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
}

/** Mock getUserMedia to resolve successfully and return a stoppable track */
function mockGetUserMedia(shouldReject = false) {
  const stopFn = vi.fn();
  const mockStream = { getTracks: () => [{ stop: stopFn }] };
  const getUserMedia = shouldReject
    ? vi.fn().mockRejectedValue(new DOMException('Permission denied'))
    : vi.fn().mockResolvedValue(mockStream);

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    writable: true,
    configurable: true,
  });
  return { getUserMedia, stopFn };
}

describe('useSpeechRecognition', () => {
  beforeEach(() => {
    clearSpeechRecognition();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('when SpeechRecognition is not available', () => {
    it('isSupported is false', () => {
      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isSupported).toBe(false);
    });

    it('isListening defaults to false', () => {
      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isListening).toBe(false);
    });

    it('transcript defaults to empty string', () => {
      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.transcript).toBe('');
    });

    it('error defaults to null', () => {
      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.error).toBeNull();
    });

    it('startListening is a no-op when not supported (does not throw)', async () => {
      const { result } = renderHook(() => useSpeechRecognition());
      await act(async () => { await result.current.startListening(); });
      expect(result.current.isListening).toBe(false);
    });

    it('stopListening is a no-op when not listening (does not throw)', () => {
      const { result } = renderHook(() => useSpeechRecognition());
      expect(() => act(() => result.current.stopListening())).not.toThrow();
    });
  });

  describe('when SpeechRecognition is mocked on window', () => {
    it('isSupported becomes true after mount', () => {
      mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isSupported).toBe(true);
    });

    it('calling startListening requests mic permission then creates a recognition instance', async () => {
      const { mock, Constructor } = mockSpeechRecognition();
      const { getUserMedia } = mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(Constructor).toHaveBeenCalledOnce();
      expect(mock.start).toHaveBeenCalledOnce();
    });

    it('startListening sets isListening to true', async () => {
      mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);
    });

    it('sets error to not_allowed when getUserMedia is denied', async () => {
      mockSpeechRecognition();
      mockGetUserMedia(true);

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.error).toBe('not_allowed');
      expect(result.current.isListening).toBe(false);
    });

    it('sets error to browser_unsupported when navigator.mediaDevices is undefined', async () => {
      mockSpeechRecognition();
      // Remove mediaDevices to simulate plain HTTP context
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.error).toBe('browser_unsupported');
      expect(result.current.isListening).toBe(false);
    });

    it('sets error to previously_denied when Permissions API reports denied', async () => {
      mockSpeechRecognition();
      mockGetUserMedia();

      // Mock Permissions API to report 'denied'
      Object.defineProperty(navigator, 'permissions', {
        value: {
          query: vi.fn().mockResolvedValue({ state: 'denied' }),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.error).toBe('previously_denied');
      expect(result.current.isListening).toBe(false);
    });

    it('proceeds normally when Permissions API throws (unsupported)', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();

      // Mock Permissions API to throw (e.g., Firefox doesn't support 'microphone' name)
      Object.defineProperty(navigator, 'permissions', {
        value: {
          query: vi.fn().mockRejectedValue(new TypeError('not supported')),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      // Should still proceed to getUserMedia and start recognition
      expect(mock.start).toHaveBeenCalledOnce();
      expect(result.current.isListening).toBe(true);
    });

    it('stopListening stops the recognition instance', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        result.current.stopListening();
      });

      expect(mock.stop).toHaveBeenCalledOnce();
      expect(result.current.isListening).toBe(false);
    });

    it('sets language based on locale parameter', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition('en'));

      await act(async () => {
        await result.current.startListening();
      });

      expect(mock.lang).toBe('en-US');
    });

    it('defaults to vi-VN when no locale is provided', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      expect(mock.lang).toBe('vi-VN');
    });

    it('sets error to not_allowed when speech recognition permission denied', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        mock.onerror({ error: 'not-allowed' });
      });

      expect(result.current.error).toBe('not_allowed');
      expect(result.current.isListening).toBe(false);
    });

    it('sets error to network when network error occurs', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        mock.onerror({ error: 'network' });
      });

      expect(result.current.error).toBe('network');
    });

    it('handles recognition.start() throwing by setting error', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();
      mock.start.mockImplementation(() => { throw new DOMException('already started'); });

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.error).toBe('recognition_failed');
      expect(result.current.isListening).toBe(false);
    });

    it('accumulates transcript from onresult events', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      act(() => {
        mock.onresult({ results: [{ 0: { transcript: 'Đi Đà Lạt' } }] });
      });

      expect(result.current.transcript).toBe('Đi Đà Lạt');
    });

    it('clears error and transcript on new startListening', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      // Trigger an error first
      await act(async () => { await result.current.startListening(); });
      act(() => { mock.onerror({ error: 'no-speech' }); });
      expect(result.current.error).toBe('no_speech');

      // Start again — error and transcript should reset
      await act(async () => { await result.current.startListening(); });
      expect(result.current.error).toBeNull();
      expect(result.current.transcript).toBe('');
    });

    it('auto-clears error after 5 seconds', async () => {
      const { mock } = mockSpeechRecognition();
      mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => { await result.current.startListening(); });
      act(() => { mock.onerror({ error: 'no-speech' }); });
      expect(result.current.error).toBe('no_speech');

      // Advance timers by 5 seconds
      act(() => { vi.advanceTimersByTime(5000); });
      expect(result.current.error).toBeNull();
    });

    it('releases microphone stream tracks after permission granted', async () => {
      mockSpeechRecognition();
      const { stopFn } = mockGetUserMedia();

      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.startListening();
      });

      expect(stopFn).toHaveBeenCalledOnce();
    });
  });
});
