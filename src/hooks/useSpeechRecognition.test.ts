// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
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

describe('useSpeechRecognition', () => {
  describe('when SpeechRecognition is not available', () => {
    it('isSupported is false', () => {
      clearSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isSupported).toBe(false);
    });

    it('isListening defaults to false', () => {
      clearSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isListening).toBe(false);
    });

    it('transcript defaults to empty string', () => {
      clearSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.transcript).toBe('');
    });

    it('error defaults to null', () => {
      clearSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.error).toBeNull();
    });

    it('startListening is a no-op when not supported (does not throw)', () => {
      clearSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());
      expect(() => act(() => result.current.startListening())).not.toThrow();
    });

    it('stopListening is a no-op when not listening (does not throw)', () => {
      clearSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());
      expect(() => act(() => result.current.stopListening())).not.toThrow();
    });
  });

  describe('when SpeechRecognition is mocked on window', () => {
    it('isSupported becomes true after mount', () => {
      mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());
      // useEffect sets isSupported after mount
      expect(result.current.isSupported).toBe(true);
    });

    it('calling startListening creates a recognition instance and starts it', () => {
      const { mock, Constructor } = mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      expect(Constructor).toHaveBeenCalledOnce();
      expect(mock.start).toHaveBeenCalledOnce();
    });

    it('startListening sets isListening to true', () => {
      mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);
    });

    it('stopListening stops the recognition instance', () => {
      const { mock } = mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        result.current.stopListening();
      });

      expect(mock.stop).toHaveBeenCalledOnce();
      expect(result.current.isListening).toBe(false);
    });

    it('sets language based on locale parameter', () => {
      const { mock } = mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition('en'));

      act(() => {
        result.current.startListening();
      });

      expect(mock.lang).toBe('en-US');
    });

    it('defaults to vi-VN when no locale is provided', () => {
      const { mock } = mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      expect(mock.lang).toBe('vi-VN');
    });

    it('sets error to not_allowed when permission denied', () => {
      const { mock } = mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        mock.onerror({ error: 'not-allowed' });
      });

      expect(result.current.error).toBe('not_allowed');
      expect(result.current.isListening).toBe(false);
    });

    it('sets error to network when network error occurs', () => {
      const { mock } = mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        mock.onerror({ error: 'network' });
      });

      expect(result.current.error).toBe('network');
    });

    it('handles recognition.start() throwing by setting error', () => {
      const { mock } = mockSpeechRecognition();
      mock.start.mockImplementation(() => { throw new DOMException('already started'); });

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      expect(result.current.error).toBe('recognition_failed');
      expect(result.current.isListening).toBe(false);
    });

    it('accumulates transcript from onresult events', () => {
      const { mock } = mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.startListening();
      });

      act(() => {
        mock.onresult({ results: [{ 0: { transcript: 'Đi Đà Lạt' } }] });
      });

      expect(result.current.transcript).toBe('Đi Đà Lạt');
    });

    it('clears error and transcript on new startListening', () => {
      const { mock } = mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());

      // Trigger an error first
      act(() => { result.current.startListening(); });
      act(() => { mock.onerror({ error: 'no-speech' }); });
      expect(result.current.error).toBe('no_speech');

      // Start again — error and transcript should reset
      act(() => { result.current.startListening(); });
      expect(result.current.error).toBeNull();
      expect(result.current.transcript).toBe('');
    });
  });
});
