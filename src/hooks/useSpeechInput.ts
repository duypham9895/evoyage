'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SpeechEngine, SpeechError } from '@/lib/speech/types';
import { ENGINE_CACHE_KEY, ENGINE_CACHE_TTL_MS } from '@/lib/speech/types';
import { createWebSpeechEngine, isWebSpeechSupported } from '@/lib/speech/web-speech-engine';
import { createWhisperEngine, isWhisperSupported } from '@/lib/speech/whisper-engine';

export interface UseSpeechInputReturn {
  readonly isSupported: boolean;
  readonly isListening: boolean;
  readonly isProcessing: boolean;
  readonly transcript: string;
  readonly error: SpeechError;
  readonly startListening: () => void;
  readonly stopListening: () => void;
}

type EngineName = 'web-speech' | 'whisper';

/** Read cached engine preference from localStorage */
function getCachedEngine(): EngineName | null {
  try {
    const raw = localStorage.getItem(ENGINE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { engine: EngineName; ts: number };
    if (Date.now() - cached.ts > ENGINE_CACHE_TTL_MS) {
      localStorage.removeItem(ENGINE_CACHE_KEY);
      return null;
    }
    return cached.engine;
  } catch {
    return null;
  }
}

/** Save engine preference to localStorage */
function cacheEngine(engine: EngineName): void {
  try {
    localStorage.setItem(ENGINE_CACHE_KEY, JSON.stringify({ engine, ts: Date.now() }));
  } catch {
    // localStorage unavailable — silent fail
  }
}

/**
 * Unified speech input hook — tries Web Speech API first, falls back to Whisper.
 *
 * Replaces the old useSpeechRecognition hook with a two-engine approach:
 * 1. Web Speech API (Chrome/Edge) — free, real-time interim results
 * 2. Whisper via MediaRecorder + server transcription (Safari/Firefox/fallback)
 *
 * Engine selection: cached preference → Web Speech → Whisper → unsupported
 */
export function useSpeechInput(locale: string = 'vi'): UseSpeechInputReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<SpeechError>(null);

  const engineRef = useRef<SpeechEngine | null>(null);
  const fallbackAttempted = useRef(false);
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  // Forward-reference holder so onError below can recurse without tripping
  // react-hooks/immutability (startEngine reading itself before assignment).
  const startEngineRef = useRef<((engineName: EngineName) => void) | null>(null);

  // Detect support after mount (client-only — feature detection requires window).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(isWebSpeechSupported() || isWhisperSupported());
  }, []);

  // Auto-clear errors after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
    };
  }, []);

  /** Create and start an engine by name */
  const startEngine = useCallback((engineName: EngineName) => {
    // Destroy previous engine if any
    engineRef.current?.destroy();

    const engine = engineName === 'web-speech'
      ? createWebSpeechEngine({
          onTranscript: (text, isFinal) => {
            setTranscript(text);
            if (isFinal) {
              cacheEngine('web-speech');
            }
          },
          onError: (err) => {
            // Auto-switch to Whisper when Web Speech can't run for browser-specific
            // reasons. 'network' covers Brave: Web Speech in Chromium calls Google's
            // speech-recognition backend, and Brave blocks Google by default — the API
            // surfaces this as a generic 'network' error. Whisper hits our own
            // /api/transcribe so it's unaffected.
            if (
              (err === 'not_allowed' || err === 'recognition_failed' || err === 'network') &&
              !fallbackAttempted.current &&
              isWhisperSupported()
            ) {
              fallbackAttempted.current = true;
              // Synchronous switch — preserves iOS gesture context
              startEngineRef.current?.('whisper');
              return;
            }
            setError(err);
            setIsListening(false);
          },
          onEnd: () => {
            setIsListening(false);
          },
        })
      : createWhisperEngine({
          onTranscript: (text) => {
            setTranscript(text);
            setIsProcessing(false);
            cacheEngine('whisper');
          },
          onError: (err) => {
            setError(err);
            setIsProcessing(false);
            setIsListening(false);
          },
          onEnd: () => {
            setIsListening(false);
            setIsProcessing(false);
          },
          onProcessingStart: () => {
            setIsProcessing(true);
          },
        });

    engineRef.current = engine;
    engine.start(localeRef.current);
    setIsListening(true);
  }, []);

  useEffect(() => {
    startEngineRef.current = startEngine;
  }, [startEngine]);

  const startListening = useCallback(() => {
    if (!isWebSpeechSupported() && !isWhisperSupported()) return;

    setError(null);
    setTranscript('');
    setIsProcessing(false);
    fallbackAttempted.current = false;

    // Check cached engine preference
    const cached = getCachedEngine();
    if (cached === 'whisper' && isWhisperSupported()) {
      startEngine('whisper');
    } else if (cached === 'web-speech' && isWebSpeechSupported()) {
      startEngine('web-speech');
    } else if (isWebSpeechSupported()) {
      startEngine('web-speech');
    } else if (isWhisperSupported()) {
      startEngine('whisper');
    }
  }, [startEngine]);

  const stopListening = useCallback(() => {
    engineRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isSupported, isListening, isProcessing, transcript, error, startListening, stopListening };
}
