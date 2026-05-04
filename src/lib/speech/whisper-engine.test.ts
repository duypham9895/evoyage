// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any -- MediaRecorder/AudioContext mocks are dynamic */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWhisperEngine, isWhisperSupported } from './whisper-engine';
import type { SpeechEngineCallbacks } from './types';

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>(resolve => { queueMicrotask(() => resolve()); });
  }
}

function makeCallbacks(): SpeechEngineCallbacks & {
  transcripts: Array<{ text: string; isFinal: boolean }>;
  errors: string[];
  endCount: number;
  processingStartCount: number;
  events: string[];
} {
  const transcripts: Array<{ text: string; isFinal: boolean }> = [];
  const errors: string[] = [];
  const events: string[] = [];
  let endCount = 0;
  let processingStartCount = 0;
  return {
    transcripts,
    errors,
    events,
    get endCount() { return endCount; },
    get processingStartCount() { return processingStartCount; },
    onTranscript: (text, isFinal) => { transcripts.push({ text, isFinal }); events.push('transcript'); },
    onError: (err) => { errors.push(err); events.push('error'); },
    onEnd: () => { endCount++; events.push('end'); },
    onProcessingStart: () => { processingStartCount++; events.push('processingStart'); },
  };
}

// Recorder instances tracked for test assertions
const recorderInstances: any[] = [];

function setupMediaRecorderGlobal() {
  recorderInstances.length = 0;
  const MockMediaRecorder = vi.fn().mockImplementation(function (this: any) {
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
    this.start = vi.fn().mockImplementation(() => { this.state = 'recording'; });
    this.stop = vi.fn().mockImplementation(() => {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['audio-data'], { type: 'audio/webm' }) });
      this.onstop?.();
    });
    recorderInstances.push(this);
  });
  (MockMediaRecorder as any).isTypeSupported = vi.fn().mockReturnValue(true);
  (window as any).MediaRecorder = MockMediaRecorder;
}

/** Create a fake getUserMedia that resolves with a mock stream */
function makeFakeGetUserMedia(shouldReject = false) {
  const stopFn = vi.fn();
  const mockStream = { getTracks: () => [{ stop: stopFn }] } as unknown as MediaStream;
  const fn: any = shouldReject
    ? vi.fn().mockRejectedValue(new DOMException('Permission denied'))
    : vi.fn().mockResolvedValue(mockStream);
  return { fn: fn as (constraints: MediaStreamConstraints) => Promise<MediaStream>, stopFn, mockStream };
}

/** Create a fake AudioContext for silence detection */
function makeFakeAudioContext() {
  const analyserNode = {
    fftSize: 2048,
    getFloatTimeDomainData: vi.fn(),
    connect: vi.fn(),
  };
  const sourceNode = { connect: vi.fn() };
  const ctx = {
    createMediaStreamSource: vi.fn().mockReturnValue(sourceNode),
    createAnalyser: vi.fn().mockReturnValue(analyserNode),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
  return { ctx, analyserNode };
}

describe('isWhisperSupported', () => {
  beforeEach(() => {
    delete (window as any).MediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, writable: true, configurable: true });
  });

  it('returns false when MediaRecorder is absent', () => {
    expect(isWhisperSupported()).toBe(false);
  });

  it('returns false when getUserMedia is absent', () => {
    (window as any).MediaRecorder = vi.fn();
    expect(isWhisperSupported()).toBe(false);
  });

  it('returns true when both MediaRecorder and getUserMedia exist', () => {
    (window as any).MediaRecorder = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      writable: true,
      configurable: true,
    });
    expect(isWhisperSupported()).toBe(true);
  });
});

describe('createWhisperEngine (with injected deps)', () => {
  beforeEach(() => {
    setupMediaRecorderGlobal();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    recorderInstances.length = 0;
  });

  it('has name "whisper"', () => {
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb);
    expect(engine.name).toBe('whisper');
  });

  it('calls onError with browser_unsupported when getUserMedia is unavailable', () => {
    // Remove MediaRecorder so isWhisperSupported returns false
    delete (window as any).MediaRecorder;
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb);
    engine.start('vi');
    expect(cb.errors).toEqual(['browser_unsupported']);
  });

  it('handles getUserMedia returning undefined via injection', () => {
    // When isWhisperSupported() returns false (no navigator.mediaDevices),
    // the engine reports browser_unsupported before reaching getUserMedia
    delete (window as any).MediaRecorder;
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, { getUserMedia: undefined });
    engine.start('vi');
    expect(cb.errors).toContain('browser_unsupported');
  });

  it('calls injected getUserMedia on start', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    expect(gum).toHaveBeenCalledWith({ audio: true });
  });

  it('calls onError with not_allowed when getUserMedia rejects', async () => {
    const { fn: gum } = makeFakeGetUserMedia(true);
    const { ctx } = makeFakeAudioContext();
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    expect(cb.errors).toEqual(['not_allowed']);
    expect(cb.endCount).toBe(1);
  });

  it('starts MediaRecorder after getUserMedia resolves', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    expect(recorderInstances).toHaveLength(1);
    expect(recorderInstances[0].start).toHaveBeenCalledWith(1000);
  });

  it('sets up silence detection with AudioContext', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    expect(ctx.createMediaStreamSource).toHaveBeenCalled();
    expect(ctx.createAnalyser).toHaveBeenCalled();
  });

  it('stop calls mediaRecorder.stop()', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    engine.stop();
    expect(recorderInstances[0].stop).toHaveBeenCalledOnce();
  });

  it('uploads audio blob to /api/transcribe on stop', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Đi Đà Lạt' }),
    });

    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    // Override stop to produce a large blob
    const largeBlob = new Blob([new ArrayBuffer(2048)], { type: 'audio/webm' });
    recorderInstances[0].stop = vi.fn().mockImplementation(() => {
      recorderInstances[0].state = 'inactive';
      recorderInstances[0].ondataavailable?.({ data: largeBlob });
      recorderInstances[0].onstop?.();
    });

    engine.stop();
    await flushPromises();

    expect(global.fetch).toHaveBeenCalledWith('/api/transcribe', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('calls onTranscript when server returns text', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Đi Đà Lạt cuối tuần' }),
    });

    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    const largeBlob = new Blob([new ArrayBuffer(2048)], { type: 'audio/webm' });
    recorderInstances[0].stop = vi.fn().mockImplementation(() => {
      recorderInstances[0].state = 'inactive';
      recorderInstances[0].ondataavailable?.({ data: largeBlob });
      recorderInstances[0].onstop?.();
    });

    engine.stop();
    await flushPromises();
    await flushPromises();

    expect(cb.transcripts).toHaveLength(1);
    expect(cb.transcripts[0]).toEqual({ text: 'Đi Đà Lạt cuối tuần', isFinal: true });
  });

  it('calls onError with no_speech for small audio blob', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    // Default stop produces tiny blob < 1KB
    engine.stop();
    await flushPromises();
    await flushPromises();

    expect(cb.errors).toContain('no_speech');
  });

  it('calls onError with network when fetch fails', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    const largeBlob = new Blob([new ArrayBuffer(2048)], { type: 'audio/webm' });
    recorderInstances[0].stop = vi.fn().mockImplementation(() => {
      recorderInstances[0].state = 'inactive';
      recorderInstances[0].ondataavailable?.({ data: largeBlob });
      recorderInstances[0].onstop?.();
    });

    engine.stop();
    await flushPromises();
    await flushPromises();

    expect(cb.errors).toContain('network');
  });

  it('calls onEnd after recording and upload complete', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'test' }),
    });

    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    const largeBlob = new Blob([new ArrayBuffer(2048)], { type: 'audio/webm' });
    recorderInstances[0].stop = vi.fn().mockImplementation(() => {
      recorderInstances[0].state = 'inactive';
      recorderInstances[0].ondataavailable?.({ data: largeBlob });
      recorderInstances[0].onstop?.();
    });

    engine.stop();
    await flushPromises();
    await flushPromises();

    expect(cb.endCount).toBeGreaterThanOrEqual(1);
  });

  it('fires onProcessingStart between recording-stop and onEnd (success path)', async () => {
    const { fn: gum } = makeFakeGetUserMedia();
    const { ctx } = makeFakeAudioContext();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'hello' }),
    });

    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: gum,
      createAudioContext: () => ctx,
    });

    engine.start('vi');
    await flushPromises();

    const largeBlob = new Blob([new ArrayBuffer(2048)], { type: 'audio/webm' });
    recorderInstances[0].stop = vi.fn().mockImplementation(() => {
      recorderInstances[0].state = 'inactive';
      recorderInstances[0].ondataavailable?.({ data: largeBlob });
      recorderInstances[0].onstop?.();
    });

    engine.stop();
    await flushPromises();
    await flushPromises();

    expect(cb.processingStartCount).toBe(1);
    // Order: processingStart → transcript → end (NOT processingStart after end)
    expect(cb.events).toEqual(['processingStart', 'transcript', 'end']);
  });

  it('does NOT fire onProcessingStart when getUserMedia rejects (no recording happened)', async () => {
    const cb = makeCallbacks();
    const engine = createWhisperEngine(cb, {
      getUserMedia: () => Promise.reject(new Error('NotAllowedError')),
      createAudioContext: () => makeFakeAudioContext().ctx,
    });

    engine.start('vi');
    await flushPromises();

    expect(cb.processingStartCount).toBe(0);
    expect(cb.errors).toContain('not_allowed');
  });
});
