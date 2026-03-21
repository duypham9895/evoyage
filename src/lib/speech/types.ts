/** Error types for speech input — covers both Web Speech and Whisper engines */
export type SpeechError =
  | 'no_speech'
  | 'not_allowed'
  | 'previously_denied'
  | 'browser_unsupported'
  | 'network'
  | 'recognition_failed'
  | 'upload_failed'
  | 'transcription_failed'
  | null;

export interface SpeechEngineCallbacks {
  readonly onTranscript: (text: string, isFinal: boolean) => void;
  readonly onError: (error: NonNullable<SpeechError>) => void;
  readonly onEnd: () => void;
}

export interface SpeechEngine {
  readonly name: 'web-speech' | 'whisper';
  readonly isSupported: boolean;
  start(locale: string): void;
  stop(): void;
  destroy(): void;
}

/** Factory signature — callbacks injected at creation */
export type CreateSpeechEngine = (callbacks: SpeechEngineCallbacks) => SpeechEngine;

/** Maps app locale to BCP-47 speech recognition language tag */
export const LOCALE_TO_SPEECH_LANG: Record<string, string> = {
  vi: 'vi-VN',
  en: 'en-US',
};

/** localStorage key for caching which engine worked last */
export const ENGINE_CACHE_KEY = 'evi_speech_engine';

/** Engine cache TTL: 7 days in milliseconds */
export const ENGINE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum blob size in bytes — below this, treat as empty audio */
export const MIN_AUDIO_BLOB_SIZE = 1024;

/** Max recording duration in milliseconds */
export const MAX_RECORDING_DURATION_MS = 30_000;

/** Silence detection: RMS threshold below which audio is considered silence */
export const SILENCE_RMS_THRESHOLD = 0.01;

/** Silence duration in milliseconds before auto-stop */
export const SILENCE_DURATION_MS = 2_000;
