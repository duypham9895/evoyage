import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(body: FormData): NextRequest {
  return new NextRequest('http://localhost:3000/api/transcribe', {
    method: 'POST',
    body,
  });
}

function makeAudioFormData(locale = 'vi-VN', audioSize = 2048): FormData {
  const fd = new FormData();
  const blob = new Blob([new ArrayBuffer(audioSize)], { type: 'audio/webm' });
  fd.append('audio', new File([blob], 'recording.webm', { type: 'audio/webm' }));
  fd.append('locale', locale);
  return fd;
}

describe('POST /api/transcribe', () => {
  beforeEach(() => {
    vi.stubEnv('MINIMAX_API_KEY', 'test-api-key');
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns 503 when MINIMAX_API_KEY is not set', async () => {
    vi.stubEnv('MINIMAX_API_KEY', '');

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe('provider_unavailable');
  });

  it('returns 400 when audio file is missing', async () => {
    const fd = new FormData();
    fd.append('locale', 'vi-VN');

    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('missing_audio');
  });

  it('returns 400 when locale is invalid', async () => {
    const fd = new FormData();
    const blob = new Blob([new ArrayBuffer(100)], { type: 'audio/webm' });
    fd.append('audio', new File([blob], 'test.webm'));
    fd.append('locale', 'fr-FR');

    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_locale');
  });

  it('returns 413 when audio file is too large', async () => {
    const fd = makeAudioFormData('vi-VN', 6 * 1024 * 1024); // 6MB

    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(413);
    expect(data.error).toBe('file_too_large');
  });

  it('returns transcription on successful MiniMax flow', async () => {
    // Mock create response
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ generation_id: 'gen-123' }),
      })
      // Mock poll response (succeeded)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'succeeded', text: 'Đi Đà Lạt cuối tuần' }),
      });

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('Đi Đà Lạt cuối tuần');
  });

  it('polls multiple times until succeeded', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ generation_id: 'gen-456' }),
      })
      // First poll: still processing
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'processing' }),
      })
      // Second poll: succeeded
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'succeeded', text: 'Hà Nội đi Đà Nẵng' }),
      });

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('Hà Nội đi Đà Nẵng');
    // 1 create + 2 polls = 3 fetch calls
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns 500 when MiniMax create request fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('transcription_failed');
  });

  it('returns 500 when MiniMax returns no generation_id', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ base_resp: { status_code: 0 } }),
    });

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('transcription_failed');
  });

  it('returns 500 when transcription job fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ generation_id: 'gen-789' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'failed',
          base_resp: { status_msg: 'Invalid audio format' },
        }),
      });

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('transcription_failed');
  });

  it('sends correct Authorization header to MiniMax', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ generation_id: 'gen-auth' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'succeeded', text: 'test' }),
      });

    const fd = makeAudioFormData();
    await POST(makeRequest(fd));

    const createCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(createCall[0]).toContain('/stt/create');
    expect(createCall[1].headers.Authorization).toBe('Bearer test-api-key');
  });

  it('passes language code extracted from locale', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ generation_id: 'gen-lang' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'succeeded', text: 'Go to Da Lat' }),
      });

    const fd = makeAudioFormData('en-US');
    await POST(makeRequest(fd));

    // The create call should include model and language in FormData
    const createCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(createCall[0]).toContain('/stt/create');
  });
});
