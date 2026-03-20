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

describe('useSpeechRecognition', () => {
  describe('when SpeechRecognition is not available', () => {
    it('isSupported is false', () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isSupported).toBe(false);
    });

    it('isListening defaults to false', () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.isListening).toBe(false);
    });

    it('transcript defaults to empty string', () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.transcript).toBe('');
    });

    it('error defaults to null', () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.error).toBeNull();
    });

    it('startListening is a no-op when not supported (does not throw)', () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      const { result } = renderHook(() => useSpeechRecognition());
      expect(() => act(() => result.current.startListening())).not.toThrow();
    });

    it('stopListening is a no-op when not listening (does not throw)', () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      const { result } = renderHook(() => useSpeechRecognition());
      expect(() => act(() => result.current.stopListening())).not.toThrow();
    });
  });

  describe('when SpeechRecognition is mocked on window', () => {
    it('isSupported becomes true', () => {
      mockSpeechRecognition();

      const { result } = renderHook(() => useSpeechRecognition());
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
  });
});
