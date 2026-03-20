'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any;

/** Maps app locale to BCP-47 speech recognition language tag */
const LOCALE_TO_SPEECH_LANG: Record<string, string> = {
  vi: 'vi-VN',
  en: 'en-US',
};

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

type SpeechError = 'no_speech' | 'not_allowed' | 'network' | 'recognition_failed' | null;

interface UseSpeechRecognitionReturn {
  readonly isSupported: boolean;
  readonly isListening: boolean;
  readonly transcript: string;
  readonly error: SpeechError;
  readonly startListening: () => void;
  readonly stopListening: () => void;
}

function mapErrorCode(code: string): SpeechError {
  switch (code) {
    case 'no-speech': return 'no_speech';
    case 'not-allowed': return 'not_allowed';
    case 'audio-capture': return 'not_allowed';
    case 'network': return 'network';
    default: return 'recognition_failed';
  }
}

export function useSpeechRecognition(locale: string = 'vi'): UseSpeechRecognitionReturn {
  // Start false to match SSR — flip client-side in useEffect to avoid hydration mismatch
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<SpeechError>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Detect browser support after mount (client-only)
  useEffect(() => {
    setIsSupported(getSpeechRecognitionConstructor() !== null);
  }, []);

  const startListening = useCallback(async () => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;
    setError(null);
    setTranscript('');

    // Explicitly request microphone permission first — this reliably
    // triggers the browser's native permission dialog, unlike
    // SpeechRecognition.start() which may silently fail on mobile.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release the stream immediately — we only needed it for the permission prompt
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setError('not_allowed');
      return;
    }

    const recognition = new Ctor();
    recognition.lang = LOCALE_TO_SPEECH_LANG[locale] ?? 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: { results: Iterable<{ 0: { transcript: string } }> }) => {
      const current = Array.from(event.results)
        .map((r: { 0: { transcript: string } }) => r[0].transcript)
        .join('');
      setTranscript(current);
    };

    recognition.onerror = (event: { error: string }) => {
      setError(mapErrorCode(event.error));
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      // DOMException if already started or permission issue
      setError('recognition_failed');
      setIsListening(false);
    }
  }, [locale]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Auto-clear speech errors after 5 seconds so they don't persist forever
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  return { isSupported, isListening, transcript, error, startListening, stopListening };
}
