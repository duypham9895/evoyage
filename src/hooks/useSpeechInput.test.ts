// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any -- mock callbacks are dynamic by design */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechInput } from './useSpeechInput';

// Mock the engine modules
vi.mock('@/lib/speech/web-speech-engine', () => ({
  isWebSpeechSupported: vi.fn(),
  createWebSpeechEngine: vi.fn(),
}));

vi.mock('@/lib/speech/whisper-engine', () => ({
  isWhisperSupported: vi.fn(),
  createWhisperEngine: vi.fn(),
}));

import { isWebSpeechSupported, createWebSpeechEngine } from '@/lib/speech/web-speech-engine';
import { isWhisperSupported, createWhisperEngine } from '@/lib/speech/whisper-engine';

const mockIsWebSpeechSupported = isWebSpeechSupported as ReturnType<typeof vi.fn>;
const mockIsWhisperSupported = isWhisperSupported as ReturnType<typeof vi.fn>;
const mockCreateWebSpeech = createWebSpeechEngine as ReturnType<typeof vi.fn>;
const mockCreateWhisper = createWhisperEngine as ReturnType<typeof vi.fn>;

function makeMockEngine(name: 'web-speech' | 'whisper') {
  return {
    name,
    isSupported: true,
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('useSpeechInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockIsWebSpeechSupported.mockReturnValue(false);
    mockIsWhisperSupported.mockReturnValue(false);
    mockCreateWebSpeech.mockClear();
    mockCreateWhisper.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('isSupported is false when no engine is available', () => {
    const { result } = renderHook(() => useSpeechInput());
    expect(result.current.isSupported).toBe(false);
  });

  it('isSupported is true when Web Speech is available', () => {
    mockIsWebSpeechSupported.mockReturnValue(true);
    const { result } = renderHook(() => useSpeechInput());
    expect(result.current.isSupported).toBe(true);
  });

  it('isSupported is true when Whisper is available', () => {
    mockIsWhisperSupported.mockReturnValue(true);
    const { result } = renderHook(() => useSpeechInput());
    expect(result.current.isSupported).toBe(true);
  });

  it('defaults to not listening', () => {
    const { result } = renderHook(() => useSpeechInput());
    expect(result.current.isListening).toBe(false);
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('startListening creates and starts Web Speech engine when supported', () => {
    mockIsWebSpeechSupported.mockReturnValue(true);
    const mockEngine = makeMockEngine('web-speech');
    mockCreateWebSpeech.mockReturnValue(mockEngine);

    const { result } = renderHook(() => useSpeechInput('vi'));

    act(() => { result.current.startListening(); });

    expect(mockCreateWebSpeech).toHaveBeenCalled();
    expect(mockEngine.start).toHaveBeenCalledWith('vi');
    expect(result.current.isListening).toBe(true);
  });

  it('startListening creates Whisper engine when Web Speech unavailable', () => {
    mockIsWhisperSupported.mockReturnValue(true);
    const mockEngine = makeMockEngine('whisper');
    mockCreateWhisper.mockReturnValue(mockEngine);

    const { result } = renderHook(() => useSpeechInput('vi'));

    act(() => { result.current.startListening(); });

    expect(mockCreateWhisper).toHaveBeenCalled();
    expect(mockEngine.start).toHaveBeenCalledWith('vi');
  });

  it('stopListening stops the active engine', () => {
    mockIsWebSpeechSupported.mockReturnValue(true);
    const mockEngine = makeMockEngine('web-speech');
    mockCreateWebSpeech.mockReturnValue(mockEngine);

    const { result } = renderHook(() => useSpeechInput());

    act(() => { result.current.startListening(); });
    act(() => { result.current.stopListening(); });

    expect(mockEngine.stop).toHaveBeenCalledOnce();
  });

  it('auto-clears error after 5 seconds', () => {
    mockIsWebSpeechSupported.mockReturnValue(true);

    let capturedCallbacks: any = null;
    mockCreateWebSpeech.mockImplementation((cb: any) => {
      capturedCallbacks = cb;
      return makeMockEngine('web-speech');
    });

    const { result } = renderHook(() => useSpeechInput());
    act(() => { result.current.startListening(); });

    // Trigger an error via the callback
    act(() => { capturedCallbacks.onError('network'); });
    expect(result.current.error).toBe('network');

    // Advance 5 seconds
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.error).toBeNull();
  });

  it('falls back to Whisper when Web Speech reports not_allowed', () => {
    mockIsWebSpeechSupported.mockReturnValue(true);
    mockIsWhisperSupported.mockReturnValue(true);

    let webSpeechCallbacks: any = null;
    const webEngine = makeMockEngine('web-speech');
    mockCreateWebSpeech.mockImplementation((cb: any) => {
      webSpeechCallbacks = cb;
      return webEngine;
    });

    const whisperEngine = makeMockEngine('whisper');
    mockCreateWhisper.mockReturnValue(whisperEngine);

    const { result } = renderHook(() => useSpeechInput('vi'));
    act(() => { result.current.startListening(); });

    // Simulate Web Speech permission denied
    act(() => { webSpeechCallbacks.onError('not_allowed'); });

    // Should have created Whisper engine as fallback
    expect(mockCreateWhisper).toHaveBeenCalled();
    expect(whisperEngine.start).toHaveBeenCalledWith('vi');
  });

  it('uses cached engine preference from localStorage', () => {
    mockIsWebSpeechSupported.mockReturnValue(true);
    mockIsWhisperSupported.mockReturnValue(true);

    // Cache whisper as preferred
    localStorage.setItem('evi_speech_engine', JSON.stringify({
      engine: 'whisper',
      ts: Date.now(),
    }));

    const whisperEngine = makeMockEngine('whisper');
    mockCreateWhisper.mockReturnValue(whisperEngine);

    const { result } = renderHook(() => useSpeechInput());
    act(() => { result.current.startListening(); });

    // Should use cached whisper, not web-speech
    expect(mockCreateWhisper).toHaveBeenCalled();
    expect(mockCreateWebSpeech).not.toHaveBeenCalled();
  });

  it('ignores expired cache (> 7 days)', () => {
    mockIsWebSpeechSupported.mockReturnValue(true);
    mockIsWhisperSupported.mockReturnValue(true);

    // Cache whisper but with expired timestamp
    localStorage.setItem('evi_speech_engine', JSON.stringify({
      engine: 'whisper',
      ts: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
    }));

    const webEngine = makeMockEngine('web-speech');
    mockCreateWebSpeech.mockReturnValue(webEngine);

    const { result } = renderHook(() => useSpeechInput());
    act(() => { result.current.startListening(); });

    // Should fall through to web-speech (default)
    expect(mockCreateWebSpeech).toHaveBeenCalled();
  });

  it('startListening is no-op when no engine supported', () => {
    const { result } = renderHook(() => useSpeechInput());
    act(() => { result.current.startListening(); });

    expect(result.current.isListening).toBe(false);
    expect(mockCreateWebSpeech).not.toHaveBeenCalled();
    expect(mockCreateWhisper).not.toHaveBeenCalled();
  });

  it('whisper error clears both isListening and isProcessing (no contradictory UI)', () => {
    mockIsWhisperSupported.mockReturnValue(true);

    let whisperCallbacks: any = null;
    mockCreateWhisper.mockImplementation((cb: any) => {
      whisperCallbacks = cb;
      return makeMockEngine('whisper');
    });

    const { result } = renderHook(() => useSpeechInput());
    act(() => { result.current.startListening(); });
    expect(result.current.isListening).toBe(true);

    // Simulate getUserMedia rejection: onError then onEnd (current engine behavior)
    act(() => { whisperCallbacks.onError('not_allowed'); });
    act(() => { whisperCallbacks.onEnd(); });

    expect(result.current.error).toBe('not_allowed');
    expect(result.current.isListening).toBe(false);
    expect(result.current.isProcessing).toBe(false);
  });

  it('whisper success: processing toggles true during upload, false after onEnd', () => {
    mockIsWhisperSupported.mockReturnValue(true);

    let whisperCallbacks: any = null;
    mockCreateWhisper.mockImplementation((cb: any) => {
      whisperCallbacks = cb;
      return makeMockEngine('whisper');
    });

    const { result } = renderHook(() => useSpeechInput());
    act(() => { result.current.startListening(); });

    // Recording stops, upload starts
    act(() => { whisperCallbacks.onProcessingStart(); });
    expect(result.current.isProcessing).toBe(true);

    // Transcript arrives
    act(() => { whisperCallbacks.onTranscript('xin chào', true); });
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.transcript).toBe('xin chào');

    // Engine signals fully done
    act(() => { whisperCallbacks.onEnd(); });
    expect(result.current.isListening).toBe(false);
    expect(result.current.isProcessing).toBe(false);
  });

  it('clears transcript and error on new startListening', () => {
    mockIsWebSpeechSupported.mockReturnValue(true);

    let capturedCallbacks: any = null;
    mockCreateWebSpeech.mockImplementation((cb: any) => {
      capturedCallbacks = cb;
      return makeMockEngine('web-speech');
    });

    const { result } = renderHook(() => useSpeechInput());

    // Start and trigger error
    act(() => { result.current.startListening(); });
    act(() => { capturedCallbacks.onError('network'); });
    expect(result.current.error).toBe('network');

    // Start again — should clear
    act(() => { result.current.startListening(); });
    expect(result.current.error).toBeNull();
    expect(result.current.transcript).toBe('');
  });
});
