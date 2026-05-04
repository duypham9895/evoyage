import { NextRequest, NextResponse } from 'next/server';

// MiniMax STT is async (create job → poll up to 15s) plus upload + parse;
// the Vercel default (10s) would kill the function mid-poll. 30s leaves
// headroom above POLL_TIMEOUT_MS without bloating cost.
export const maxDuration = 30;

const MINIMAX_API_BASE = 'https://api.minimax.io/v1';
const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5MB
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 15_000;

interface MiniMaxCreateResponse {
  readonly generation_id?: string;
  readonly base_resp?: { readonly status_code?: number; readonly status_msg?: string };
}

interface MiniMaxResultResponse {
  readonly status?: string;
  readonly text?: string;
  readonly base_resp?: { readonly status_code?: number; readonly status_msg?: string };
}

function getApiKey(): string | null {
  return process.env.MINIMAX_API_KEY?.trim() || null;
}

/**
 * POST /api/transcribe
 *
 * Accepts audio file + locale, transcribes via MiniMax STT API.
 * Handles MiniMax's async pattern: create job → poll for result.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'provider_unavailable', message: 'Transcription service not configured' },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Request must be multipart/form-data' },
      { status: 400 },
    );
  }

  const audioFile = formData.get('audio');
  const locale = formData.get('locale') as string | null;

  if (!audioFile || !(audioFile instanceof File)) {
    return NextResponse.json(
      { error: 'missing_audio', message: 'Audio file is required' },
      { status: 400 },
    );
  }

  if (!locale || !['vi-VN', 'en-US'].includes(locale)) {
    return NextResponse.json(
      { error: 'invalid_locale', message: "Locale must be 'vi-VN' or 'en-US'" },
      { status: 400 },
    );
  }

  // Validate MIME type — only accept audio formats
  const allowedTypes = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm;codecs=opus'];
  if (audioFile.type && !allowedTypes.some(t => audioFile.type.startsWith(t.split(';')[0]))) {
    return NextResponse.json(
      { error: 'invalid_audio_type', message: 'Audio file must be an audio format (webm, mp4, wav, mp3, ogg)' },
      { status: 400 },
    );
  }

  if (audioFile.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      { error: 'file_too_large', message: 'Audio file must be under 5MB' },
      { status: 413 },
    );
  }

  try {
    // Step 1: Create transcription job
    const createForm = new FormData();
    createForm.append('file', audioFile, audioFile.name);
    createForm.append('model', 'g1_whisper-large');
    createForm.append('language', locale.split('-')[0]); // 'vi' or 'en'

    const createResponse = await fetch(`${MINIMAX_API_BASE}/stt/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: createForm,
    });

    if (!createResponse.ok) {
      console.error('[transcribe] MiniMax create failed:', createResponse.status);
      return NextResponse.json(
        { error: 'transcription_failed', message: 'Failed to start transcription' },
        { status: 500 },
      );
    }

    const createData = await createResponse.json() as MiniMaxCreateResponse;
    const generationId = createData.generation_id;

    if (!generationId) {
      console.error('[transcribe] MiniMax create response missing generation_id:', createData);
      return NextResponse.json(
        { error: 'transcription_failed', message: 'Transcription service returned invalid response' },
        { status: 500 },
      );
    }

    // Step 2: Poll for result
    const startTime = Date.now();
    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollResponse = await fetch(`${MINIMAX_API_BASE}/stt/${generationId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!pollResponse.ok) {
        console.error('[transcribe] MiniMax poll failed:', pollResponse.status);
        continue;
      }

      const pollData = await pollResponse.json() as MiniMaxResultResponse;

      if (pollData.status === 'succeeded') {
        return NextResponse.json({ text: pollData.text ?? '' });
      }

      if (pollData.status === 'failed') {
        console.error('[transcribe] MiniMax transcription failed:', pollData.base_resp?.status_msg);
        return NextResponse.json(
          { error: 'transcription_failed', message: 'Transcription failed' },
          { status: 500 },
        );
      }

      // Still processing — continue polling
    }

    // Timeout
    return NextResponse.json(
      { error: 'transcription_failed', message: 'Transcription timed out' },
      { status: 504 },
    );
  } catch (err) {
    console.error('[transcribe] Unexpected error:', err);
    return NextResponse.json(
      { error: 'transcription_failed', message: 'Internal server error' },
      { status: 500 },
    );
  }
}
