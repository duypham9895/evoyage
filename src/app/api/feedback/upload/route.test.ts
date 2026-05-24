import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { __resetRateLimitForTests } from '@/lib/rate-limit';

// Mock @vercel/blob BEFORE the route picks it up.
const putMock = vi.fn();
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => putMock(...args),
}));

import { POST } from './route';

// Minimal valid magic-byte payloads for each accepted type.
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
const WEBP_MAGIC = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const HEIC_MAGIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);
const TEXT_BYTES = new TextEncoder().encode('hello world this is not an image');

function makeFormRequest(file: File | null): NextRequest {
  const fd = new FormData();
  if (file) fd.append('file', file);
  return new NextRequest('http://localhost/api/feedback/upload', {
    method: 'POST',
    body: fd,
  });
}

function file(bytes: Uint8Array, type: string, name = 'upload.bin'): File {
  // Cast: Uint8Array<ArrayBufferLike> isn't recognised as a BlobPart in
  // strict TS, but at runtime File() accepts it. The .buffer slice is the
  // safe escape hatch.
  return new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], name, { type });
}

beforeEach(() => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-blob-token');
  putMock.mockReset();
  putMock.mockResolvedValue({ url: 'https://test.public.blob.vercel-storage.com/feedback/2026-05-24/abc.jpg' });
  __resetRateLimitForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/feedback/upload', () => {
  it('returns 503 when BLOB_READ_WRITE_TOKEN is unset', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    const res = await POST(makeFormRequest(file(JPEG_MAGIC, 'image/jpeg')));
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('upload_unavailable');
    expect(putMock).not.toHaveBeenCalled();
  });

  it('returns 400 when no file is present', async () => {
    const res = await POST(makeFormRequest(null));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('missing_file');
  });

  it('returns 400 on empty file', async () => {
    const res = await POST(makeFormRequest(file(new Uint8Array(0), 'image/jpeg')));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('empty_file');
  });

  it('returns 413 when file exceeds 5MB', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(JPEG_MAGIC, 0);
    const res = await POST(makeFormRequest(file(big, 'image/jpeg')));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toBe('file_too_large');
    expect(putMock).not.toHaveBeenCalled();
  });

  it('returns 415 when the bytes are not an image (magic-byte sniff)', async () => {
    // Client claims image/jpeg but bytes are plain text — must be rejected
    const res = await POST(makeFormRequest(file(TEXT_BYTES, 'image/jpeg', 'fake.jpg')));
    expect(res.status).toBe(415);
    const data = await res.json();
    expect(data.error).toBe('invalid_type');
    expect(putMock).not.toHaveBeenCalled();
  });

  it('accepts JPEG and returns the Vercel Blob URL', async () => {
    const res = await POST(makeFormRequest(file(JPEG_MAGIC, 'image/jpeg')));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.url).toMatch(/public\.blob\.vercel-storage\.com\/feedback\//);
    expect(data.contentType).toBe('image/jpeg');
    expect(putMock).toHaveBeenCalledTimes(1);
    const [filename, , opts] = putMock.mock.calls[0]!;
    expect(String(filename)).toMatch(/^feedback\/\d{4}-\d{2}-\d{2}\/[a-z0-9]{12}\.jpg$/);
    expect(opts).toMatchObject({ access: 'public', contentType: 'image/jpeg', addRandomSuffix: false });
  });

  it('accepts PNG via magic bytes', async () => {
    const res = await POST(makeFormRequest(file(PNG_MAGIC, 'image/png')));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contentType).toBe('image/png');
  });

  it('accepts WEBP via magic bytes', async () => {
    const res = await POST(makeFormRequest(file(WEBP_MAGIC, 'image/webp')));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contentType).toBe('image/webp');
  });

  it('accepts HEIC via magic bytes', async () => {
    const res = await POST(makeFormRequest(file(HEIC_MAGIC, 'image/heic')));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contentType).toBe('image/heic');
  });

  it('returns 429 after the 5-per-hour rate limit', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeFormRequest(file(JPEG_MAGIC, 'image/jpeg')));
      expect(ok.status, `upload ${i + 1} should succeed`).toBe(200);
    }
    const blocked = await POST(makeFormRequest(file(JPEG_MAGIC, 'image/jpeg')));
    expect(blocked.status).toBe(429);
    const data = await blocked.json();
    expect(data.error).toBe('rate_limited');
  });

  it('returns 502 when Vercel Blob throws', async () => {
    putMock.mockRejectedValueOnce(new Error('blob: store unavailable'));
    const res = await POST(makeFormRequest(file(JPEG_MAGIC, 'image/jpeg')));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe('upload_failed');
  });

  it('sniffs bytes, not the client-supplied content-type — JPEG-mimed PNG bytes are stored as PNG', async () => {
    const res = await POST(makeFormRequest(file(PNG_MAGIC, 'image/jpeg', 'mislabeled.jpg')));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contentType).toBe('image/png');
    const [filename, , opts] = putMock.mock.calls[0]!;
    expect(String(filename)).toMatch(/\.png$/);
    expect(opts).toMatchObject({ contentType: 'image/png' });
  });
});
