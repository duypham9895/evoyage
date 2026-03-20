'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

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
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const startListening = useCallback(() => {
    if (!isSupported) return;
    setError(null);
    setTranscript('');

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const current = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('');
      setTranscript(current);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(event.error === 'no-speech' ? 'no_speech' : 'recognition_failed');
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  return { isSupported, isListening, transcript, error, startListening, stopListening };
}
