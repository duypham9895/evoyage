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

// Helper: build a fake fetch Response object
function makeResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/transcribe (Groq Whisper)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
    fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns 503 when GROQ_API_KEY is not set', async () => {
    vi.stubEnv('GROQ_API_KEY', '');

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

  it('returns transcription on successful Groq response', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { text: 'Đi Đà Lạt cuối tuần' }));

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('Đi Đà Lạt cuối tuần');
    // OpenAI SDK may make 1+ internal fetch calls; we only care that the route
    // returned the Groq transcript correctly.
  });

  it('hits the Groq audio transcriptions endpoint with Bearer auth', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { text: 'hi' }));

    const fd = makeAudioFormData();
    await POST(makeRequest(fd));

    // OpenAI SDK makes internal fetch() calls (e.g. data: URIs to wrap the file).
    // Grab the call that actually hit Groq.
    const groqCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('api.groq.com'),
    );
    expect(groqCall, 'expected a fetch to api.groq.com').toBeDefined();

    const [url, init] = groqCall!;
    expect(String(url)).toContain('api.groq.com/openai/v1/audio/transcriptions');
    const headers = init?.headers as Headers | Record<string, string> | undefined;
    const authValue = headers instanceof Headers
      ? headers.get('authorization')
      : (headers?.['Authorization'] ?? headers?.['authorization']);
    expect(authValue).toBe('Bearer test-groq-key');
  });

  it('returns 500 with transcription_failed on generic Groq error', async () => {
    fetchSpy.mockResolvedValue(makeResponse(500, { error: 'server error' }));

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('transcription_failed');
  });

  it('returns 503 with provider_unavailable when Groq returns 401', async () => {
    fetchSpy.mockResolvedValue(makeResponse(401, { error: { message: 'Invalid API Key' } }));

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe('provider_unavailable');
  });

  it('returns empty text when Groq returns null transcript', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { text: null }));

    const fd = makeAudioFormData();
    const response = await POST(makeRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('');
  });
});
