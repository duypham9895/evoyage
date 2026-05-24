/**
 * POST /api/feedback/upload
 *
 * Accepts a single image file in multipart/form-data under the field "file"
 * and uploads it to Vercel Blob. Returns the public URL. The URL is stored
 * verbatim in Feedback.imageUrl when the feedback row is created.
 *
 * Rate limit: 5 uploads/hour/IP (paid storage; real reporters attach 2-3
 * photos per submission — anything beyond that is likely abuse).
 *
 * If BLOB_READ_WRITE_TOKEN is unset, returns 503 and the feedback form
 * gracefully falls back to "no attachment" — the rest of the flow works.
 */
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { customAlphabet } from 'nanoid';
import { checkRateLimit, getClientIp, feedbackUploadLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);
const SLUG = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

function extensionFromType(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/heic': return 'heic';
    default: return 'bin';
  }
}

/** Sniff magic bytes to confirm the upload really is the type the client claims. */
function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  // WEBP: "RIFF...WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  // HEIC has multiple variants; check for "ftypheic" / "ftypheix" / "ftypmif1" near offset 4
  const slice = String.fromCharCode(...bytes.slice(4, 12));
  if (slice.startsWith('ftypheic') || slice.startsWith('ftypheix') || slice.startsWith('ftypmif1')) {
    return 'image/heic';
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'upload_unavailable', message: 'Image uploads are not configured on this deployment' },
      { status: 503 },
    );
  }

  const ip = getClientIp(request);
  const limit = await checkRateLimit(`feedback-upload:${ip}`, 5, 60 * 60_000, feedbackUploadLimiter);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: limit.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'empty_file' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'file_too_large', message: 'Image must be 5 MB or smaller' },
      { status: 413 },
    );
  }

  // Trust nothing the client says about content-type — sniff the bytes.
  const buf = await file.arrayBuffer();
  const sniffedType = detectImageType(new Uint8Array(buf));
  if (!sniffedType || !ALLOWED_TYPES.has(sniffedType)) {
    return NextResponse.json(
      { error: 'invalid_type', message: 'Only JPEG / PNG / WEBP / HEIC images are accepted' },
      { status: 415 },
    );
  }

  const filename = `feedback/${new Date().toISOString().slice(0, 10)}/${SLUG()}.${extensionFromType(sniffedType)}`;

  try {
    const blob = await put(filename, buf, {
      access: 'public',
      contentType: sniffedType,
      // addRandomSuffix=true would defeat our SLUG; set false so the URL is
      // deterministic from the filename we picked.
      addRandomSuffix: false,
    });

    return NextResponse.json({
      ok: true,
      url: blob.url,
      contentType: sniffedType,
      sizeBytes: file.size,
    });
  } catch (err) {
    console.error('[feedback/upload] Vercel Blob put() failed:', err);
    return NextResponse.json(
      { error: 'upload_failed', message: 'Could not save image. Please try again.' },
      { status: 502 },
    );
  }
}
