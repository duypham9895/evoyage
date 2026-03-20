'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any;

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

interface UseSpeechRecognitionReturn {
  readonly isSupported: boolean;
  readonly isListening: boolean;
  readonly transcript: string;
  readonly error: string | null;
  readonly startListening: () => void;
  readonly stopListening: () => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const isSupported = getSpeechRecognitionConstructor() !== null;

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;
    setError(null);
    setTranscript('');

    const recognition = new Ctor();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: { results: Iterable<{ 0: { transcript: string } }> }) => {
      const current = Array.from(event.results)
        .map((r: { 0: { transcript: string } }) => r[0].transcript)
        .join('');
      setTranscript(current);
    };

    recognition.onerror = (event: { error: string }) => {
      setError(event.error === 'no-speech' ? 'no_speech' : 'recognition_failed');
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  return { isSupported, isListening, transcript, error, startListening, stopListening };
}
