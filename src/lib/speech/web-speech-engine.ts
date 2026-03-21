import type { SpeechEngine, SpeechEngineCallbacks, SpeechError } from './types';
import { LOCALE_TO_SPEECH_LANG } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any;

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function mapErrorCode(code: string): NonNullable<SpeechError> {
  switch (code) {
    case 'no-speech': return 'no_speech';
    case 'not-allowed': return 'not_allowed';
    case 'audio-capture': return 'not_allowed';
    case 'network': return 'network';
    default: return 'recognition_failed';
  }
}

/** Feature-detect Web Speech API availability (constructor exists in window) */
export function isWebSpeechSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

/**
 * Creates a Web Speech API engine.
 *
 * Key change from the old useSpeechRecognition hook: NO getUserMedia pre-check.
 * The Web Speech API handles its own mic permissions internally. The old
 * getUserMedia call was causing permission conflicts on real devices.
 */
export function createWebSpeechEngine(callbacks: SpeechEngineCallbacks): SpeechEngine {
  let recognition: SpeechRecognitionInstance | null = null;

  return {
    name: 'web-speech',
    get isSupported() {
      return isWebSpeechSupported();
    },

    start(locale: string) {
      const Ctor = getSpeechRecognitionConstructor();
      if (!Ctor) return;

      recognition = new Ctor();
      recognition.lang = LOCALE_TO_SPEECH_LANG[locale] ?? 'vi-VN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event: { results: Iterable<{ 0: { transcript: string } }> }) => {
        const current = Array.from(event.results)
          .map((r: { 0: { transcript: string } }) => r[0].transcript)
          .join('');
        // Check if the last result is final
        const resultsArray = Array.from(event.results) as Array<{ isFinal?: boolean; 0: { transcript: string } }>;
        const lastResult = resultsArray[resultsArray.length - 1];
        const isFinal = lastResult?.isFinal === true;
        callbacks.onTranscript(current, isFinal);
      };

      recognition.onerror = (event: { error: string }) => {
        callbacks.onError(mapErrorCode(event.error));
      };

      recognition.onend = () => {
        callbacks.onEnd();
      };

      try {
        recognition.start();
      } catch {
        callbacks.onError('recognition_failed');
      }
    },

    stop() {
      recognition?.stop();
    },

    destroy() {
      recognition?.abort();
      recognition = null;
    },
  };
}
