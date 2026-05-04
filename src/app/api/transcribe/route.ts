import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Groq's Whisper-large-v3 typically returns in <1s. 15s is plenty of headroom
// for cold starts or large files; default Vercel 10s would be tight on the
// upper end. Cheaper than the 30s we needed for MiniMax's async polling.
export const maxDuration = 15;

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const STT_MODEL = 'whisper-large-v3';
const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5MB

function getApiKey(): string | null {
  return process.env.GROQ_API_KEY?.trim() || null;
}

/**
 * POST /api/transcribe
 *
 * Accepts audio file + locale, transcribes via Groq's Whisper-large-v3.
 * Single synchronous call — Groq's LPU returns sub-second so no polling needed.
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
    const client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });

    const result = await client.audio.transcriptions.create({
      file: audioFile,
      model: STT_MODEL,
      language: locale.split('-')[0], // 'vi' or 'en'
    });

    return NextResponse.json({ text: result.text ?? '' });
  } catch (err) {
    console.error('[transcribe] Groq Whisper error:', err);
    if (err instanceof OpenAI.APIError && err.status === 401) {
      return NextResponse.json(
        { error: 'provider_unavailable', message: 'Transcription auth failed' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: 'transcription_failed', message: 'Transcription failed' },
      { status: 500 },
    );
  }
}
