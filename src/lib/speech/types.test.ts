import { describe, it, expect } from 'vitest';
import {
  LOCALE_TO_SPEECH_LANG,
  ENGINE_CACHE_KEY,
  ENGINE_CACHE_TTL_MS,
  MIN_AUDIO_BLOB_SIZE,
  MAX_RECORDING_DURATION_MS,
  SILENCE_RMS_THRESHOLD,
  SILENCE_DURATION_MS,
} from './types';

describe('speech/types constants', () => {
  it('maps vi locale to vi-VN', () => {
    expect(LOCALE_TO_SPEECH_LANG['vi']).toBe('vi-VN');
  });

  it('maps en locale to en-US', () => {
    expect(LOCALE_TO_SPEECH_LANG['en']).toBe('en-US');
  });

  it('ENGINE_CACHE_KEY is a non-empty string', () => {
    expect(ENGINE_CACHE_KEY).toBe('evi_speech_engine');
  });

  it('ENGINE_CACHE_TTL_MS is 7 days', () => {
    expect(ENGINE_CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('MIN_AUDIO_BLOB_SIZE is 1KB', () => {
    expect(MIN_AUDIO_BLOB_SIZE).toBe(1024);
  });

  it('MAX_RECORDING_DURATION_MS is 30 seconds', () => {
    expect(MAX_RECORDING_DURATION_MS).toBe(30_000);
  });

  it('SILENCE_RMS_THRESHOLD is 0.01', () => {
    expect(SILENCE_RMS_THRESHOLD).toBe(0.01);
  });

  it('SILENCE_DURATION_MS is 2 seconds', () => {
    expect(SILENCE_DURATION_MS).toBe(2_000);
  });
});
