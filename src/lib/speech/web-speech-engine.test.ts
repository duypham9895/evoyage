// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebSpeechEngine, isWebSpeechSupported } from './web-speech-engine';
import type { SpeechEngineCallbacks } from './types';

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
  // Must use `function` keyword (not arrow) so it works as a constructor with `new`
  const Constructor = vi.fn().mockImplementation(function () { return mock; });
  (window as any).SpeechRecognition = Constructor;
  return { mock, Constructor };
}

function clearSpeechRecognition() {
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
}

function makeCallbacks(): SpeechEngineCallbacks & {
  transcripts: Array<{ text: string; isFinal: boolean }>;
  errors: string[];
  endCount: number;
} {
  const transcripts: Array<{ text: string; isFinal: boolean }> = [];
  const errors: string[] = [];
  let endCount = 0;
  return {
    transcripts,
    errors,
    get endCount() { return endCount; },
    onTranscript: (text, isFinal) => { transcripts.push({ text, isFinal }); },
    onError: (err) => { errors.push(err); },
    onEnd: () => { endCount++; },
  };
}

describe('isWebSpeechSupported', () => {
  beforeEach(clearSpeechRecognition);

  it('returns false when SpeechRecognition is absent', () => {
    expect(isWebSpeechSupported()).toBe(false);
  });

  it('returns true when SpeechRecognition is present', () => {
    (window as any).SpeechRecognition = vi.fn();
    expect(isWebSpeechSupported()).toBe(true);
  });

  it('returns true when webkitSpeechRecognition is present', () => {
    (window as any).webkitSpeechRecognition = vi.fn();
    expect(isWebSpeechSupported()).toBe(true);
  });
});

describe('createWebSpeechEngine', () => {
  beforeEach(clearSpeechRecognition);
  afterEach(clearSpeechRecognition);

  it('has name "web-speech"', () => {
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);
    expect(engine.name).toBe('web-speech');
  });

  it('isSupported reflects window state', () => {
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);
    expect(engine.isSupported).toBe(false);

    mockSpeechRecognition();
    expect(engine.isSupported).toBe(true);
  });

  it('start creates recognition with correct locale', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('en');
    expect(mock.lang).toBe('en-US');
    expect(mock.continuous).toBe(false);
    expect(mock.interimResults).toBe(true);
    expect(mock.start).toHaveBeenCalledOnce();
  });

  it('defaults to vi-VN for unknown locale', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('fr');
    expect(mock.lang).toBe('vi-VN');
  });

  it('calls onTranscript with interim results', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('vi');
    mock.onresult({ results: [{ 0: { transcript: 'Đi Đà Lạt' }, isFinal: false }] });

    expect(cb.transcripts).toHaveLength(1);
    expect(cb.transcripts[0]).toEqual({ text: 'Đi Đà Lạt', isFinal: false });
  });

  it('calls onTranscript with isFinal=true for final results', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('vi');
    mock.onresult({ results: [{ 0: { transcript: 'Đi Đà Lạt' }, isFinal: true }] });

    expect(cb.transcripts[0].isFinal).toBe(true);
  });

  it('calls onError with mapped error code', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('vi');
    mock.onerror({ error: 'not-allowed' });

    expect(cb.errors).toEqual(['not_allowed']);
  });

  it('maps audio-capture to not_allowed', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('vi');
    mock.onerror({ error: 'audio-capture' });

    expect(cb.errors).toEqual(['not_allowed']);
  });

  it('maps unknown errors to recognition_failed', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('vi');
    mock.onerror({ error: 'some-unknown-error' });

    expect(cb.errors).toEqual(['recognition_failed']);
  });

  it('calls onEnd when recognition ends', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('vi');
    mock.onend();

    expect(cb.endCount).toBe(1);
  });

  it('stop calls recognition.stop()', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('vi');
    engine.stop();

    expect(mock.stop).toHaveBeenCalledOnce();
  });

  it('destroy calls recognition.abort()', () => {
    const { mock } = mockSpeechRecognition();
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('vi');
    engine.destroy();

    expect(mock.abort).toHaveBeenCalledOnce();
  });

  it('handles start() throwing by calling onError', () => {
    const { mock } = mockSpeechRecognition();
    mock.start.mockImplementation(() => { throw new DOMException('already started'); });
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);

    engine.start('vi');

    expect(cb.errors).toEqual(['recognition_failed']);
  });

  it('start is a no-op when SpeechRecognition is absent', () => {
    const cb = makeCallbacks();
    const engine = createWebSpeechEngine(cb);
    // Should not throw
    engine.start('vi');
    expect(cb.errors).toHaveLength(0);
  });
});
